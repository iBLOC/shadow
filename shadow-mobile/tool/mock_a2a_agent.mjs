#!/usr/bin/env node
/**
 * mock_a2a_agent.mjs — 一个确定性的 A2A v0.2 对端，用来验证「端脑的 tool_call 事件」。
 *
 * 背景
 * ----
 * 端脑（telencephalon）的 SSE 会话接口有一条 `tool_call` 事件分支
 * （`TelencephalonStreamEvent::ToolCall`）。它只有一个来源：A2A 对端发来的
 * 工具调用。但 A2A 的官方 `StreamResponse` 枚举只有 Task / Message /
 * StatusUpdate / ArtifactUpdate 四个变体，**没有工具事件这一类** ⇒ 工具
 * 调用在 A2A 线上是会被消灭的。synapse 现在用 `StatusUpdate.metadata` 里的
 * `synapse_tool_event` 结构化旁路把工具事件带过这一跳（见
 * `synapse/src/a2a/tool_event.rs`）。
 *
 * 这个 mock 就是**按那条旁路的线上格式**发事件，用来在真机上证明：
 * 手机里的端脑能把对端的工具调用翻译成 `tool_call` 事件。
 *
 * 线上格式
 * --------
 *   SSE `data:` 行（直接是 StreamResponse，不是 JSON-RPC 信封）：
 *
 *   { "statusUpdate": { "taskId": "...", "contextId": "...",
 *                       "status": { "state": "TASK_STATE_WORKING" },
 *                       "metadata": { "synapse_tool_event": {
 *                           "kind": "start", "name": "set_theme",
 *                           "args": "{\"color\":\"#71717A\"}" } } } }
 *
 *   { "artifactUpdate": { "taskId": "...", "contextId": "...",
 *                         "artifact": { "artifactId": "a1",
 *                                      "parts": [ { "text": "..." } ] },
 *                         "append": false, "lastChunk": true } }
 *
 * 用法
 * ---
 *   node tool/mock_a2a_agent.mjs --port 8898 --log <file.jsonl>
 *
 *   --port   监听端口（默认 8898），监听 0.0.0.0，手机能直接连
 *   --log    请求日志（JSONL，每行一个请求），用于事后断言「手机真的连过」
 */

import http from 'node:http';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

const PORT = Number(arg('port', '8898'));
const LOG = arg('log', null);
const NAME = arg('name', 'mock-tool-agent');

/** 这个对端会调用的「工具」。真机上我们要看端脑把它变成 tool_call 事件。 */
const TOOL_NAME = arg('tool', 'set_theme');
const TOOL_ARGS = arg('args', JSON.stringify({ color: '#71717A' }));

const logStream = LOG ? fs.createWriteStream(LOG, { flags: 'a' }) : null;

// ---------------------------------------------------------------------------
// 线上事件构造
// ---------------------------------------------------------------------------
function toolStatusUpdate(kind, extra) {
  return {
    statusUpdate: {
      taskId: 'mock-task-1',
      contextId: 'mock-ctx-1',
      status: { state: 'TASK_STATE_WORKING' },
      metadata: {
        synapse_tool_event: { kind, ...extra },
      },
    },
  };
}

function finalArtifact(text) {
  return {
    artifactUpdate: {
      taskId: 'mock-task-1',
      contextId: 'mock-ctx-1',
      artifact: {
        artifactId: 'mock-artifact-1',
        name: 'response',
        parts: [{ text }],
      },
      append: false,
      lastChunk: true,
    },
  };
}

const AGENT_CARD = {
  name: NAME,
  description: 'Deterministic A2A peer that emits one tool call, for end-brain tool_call verification.',
  url: `http://0.0.0.0:${PORT}`,
  version: '0.1.0',
  provider: { organization: 'Shadow' },
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  metadata: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: ['mock:a2a-tool-call'],
  },
  skills: [
    {
      id: 'set-theme',
      name: 'set_theme',
      description: 'Change the client theme color.',
      tags: ['theme'],
      examples: ['把主题色换成靛蓝'],
    },
  ],
};

// ---------------------------------------------------------------------------
// 服务
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = req.url || '/';

  if (req.method === 'GET' && (url === '/.well-known/agent.json' || url === '/.well-known/agent-card.json')) {
    const body = JSON.stringify(AGENT_CARD);
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('method not allowed');
    return;
  }

  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(raw || '{}'); } catch { /* keep null */ }

    // 记录请求：谁连的、发了什么方法。
    const record = {
      at: new Date().toISOString(),
      method: parsed?.method ?? null,
      id: parsed?.id ?? null,
      peer: req.socket.remoteAddress ?? null,
      body: parsed,
    };
    if (logStream) logStream.write(`${JSON.stringify(record)}\n`);
    console.log(`[mock-a2a] ${record.method ?? '(no method)'} from ${record.peer}`);

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const events = [
      // 工具调用开始 —— 端脑应当把它翻译成 tool_call 事件。
      toolStatusUpdate('start', { name: TOOL_NAME, args: TOOL_ARGS }),
      // 工具调用结束 —— 端脑应当把它翻译成 tool_result 事件。
      toolStatusUpdate('end', { name: TOOL_NAME, result: 'theme-updated', latency_ms: 7 }),
      // 最终答复。
      finalArtifact(`MOCK-A2A-OK (called ${TOOL_NAME})`),
    ];

    for (const ev of events) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    res.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-a2a] listening on 0.0.0.0:${PORT}  (agent "${NAME}")`);
  if (LOG) console.log(`[mock-a2a] request log -> ${LOG}`);
});
