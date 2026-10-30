#!/usr/bin/env node
/**
 * Mock OpenAI-compatible upstream — 真机链路验证的**确定性上游**。
 *
 * 为什么需要它：手机（Android App 进程）里的 neuron 只能通过
 * 「注册一个 OpenAI 兼容远端引擎」来拿到模型 —— neuron 的 remote 引擎
 * 只认环境变量，而 App 进程的环境变量由 zygote 决定、宿主注入不了。
 * 于是真机上要验证「大脑 → 端脑 → 叶区 → neuron → LLM」这一段，
 * 上游必须是**能连上的**。局域网里的这台 mock 就是那个上游。
 *
 * 为什么用 mock 而不是真模型：这条链要验的是「东西有没有真的穿过每一跳」，
 * 不是「模型答得好不好」。mock **记录**它收到的每一个请求，于是
 * 「人设（system 提示词）到了模型」「多轮历史到了模型」是**可断言的事实**，
 * 而不是靠猜。真模型只会给一个含糊的「看起来对」。
 *
 * 用法：
 *   node mock_openai_server.mjs [--port 8899] [--log <文件>]
 *
 * 端点：
 *   POST /v1/chat/completions —— 记录请求 + 回一个 OpenAI 形状的回复
 *   GET  /v1/models           —— 回一个模型列表
 *   GET  /_requests            —— 回**已经收到的所有请求**（断言用）
 *
 * 特殊触发：最后一条 user 消息里带 `!!tool` 时，回一个 `tool_calls`
 * 而不是文本 —— 用来验 tool_call 能不能穿过 neuron 的 OpenAI 面。
 */

import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

const PORT = Number(argOf('port', '8899'));
const LOG = argOf('log', '');
const MODEL = argOf('model', 'mock-model');
/**
 * 想让 mock 调**哪个**工具（`--tool set_theme`）。
 *
 * 默认仍是 `echo` —— 老用法（验 tool_call 能不能穿过 neuron 的 OpenAI 面）
 * 一字不变。改成别的工具名时，mock **只在该工具确实被客户端声明过**
 * 的情况下才调它 ⇒ 客户端的清单才是事实来源。
 */
const TOOL = argOf('tool', 'echo');

/**
 * 按**客户端声明的 schema** 造这个工具的参数。
 *
 * 为什么不能瞎填：客户端工具的 `parameters` 是**客户端自己**的契约
 * （两端同名工具必须导出同样的内容）⇒ mock 乱填参数，验的就不是
 * 「客户端能不能把参数原样传下去」，而是「mock 填得对不对」。
 * ⇒ 从 schema 的 properties 里读出该填哪个键。
 */
function argsForTool(declared, name) {
  const tool = declared.find((t) => t?.function?.name === name);
  const props = tool?.function?.parameters?.properties ?? {};
  if (props.color) return { color: '#4F46E5' };
  if (props.dark) return { dark: true };
  if (props.text) return { text: 'MOCK-TOOL' };
  return {};
}

const received = [];

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function reply(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return reply(res, 200, {
      object: 'list',
      data: [
        { id: MODEL, object: 'model', created: 0, owned_by: 'mock' },
      ],
    });
  }

  if (req.method === 'GET' && url.pathname === '/_requests') {
    return reply(res, 200, { count: received.length, requests: received });
  }

  if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
    return reply(res, 404, { error: { message: `no route for ${req.method} ${url.pathname}` } });
  }

  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch (e) {
    return reply(res, 400, { error: { message: `bad json: ${e}` } });
  }

  received.push(parsed);
  if (LOG) {
    try {
      appendFileSync(LOG, `${JSON.stringify(parsed)}\n`, 'utf8');
    } catch {
      /* 日志写不进去不该让请求失败 */
    }
  }
  console.log(
    `[mock] #${received.length} model=${parsed.model} ` +
      `messages=${parsed.messages?.length ?? 0} ` +
      `tools=${parsed.tools?.length ?? 0} ` +
      `system=${parsed.messages?.[0]?.role === 'system' ? 'yes' : 'no'}`,
  );

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const wantsTool = String(lastUser?.content ?? '').includes('!!tool');

  if (wantsTool) {
    // 客户端声明了哪些工具？只有**被声明过**的工具才会被调
    // （老行为：默认调 `echo`，参数 `{text:'MOCK-TOOL'}`）。
    const declared = Array.isArray(parsed.tools) ? parsed.tools : [];
    const declaredNames = declared
      .map((t) => t?.function?.name)
      .filter(Boolean);
    const useDeclared = declaredNames.includes(TOOL);
    const toolName = useDeclared ? TOOL : 'echo';
    const toolArgs = useDeclared
      ? argsForTool(declared, toolName)
      : { text: 'MOCK-TOOL' };
    console.log(
      `[mock] -> tool_call ${toolName} ${JSON.stringify(toolArgs)} ` +
        `(declared: ${declaredNames.join(',') || 'none'})`,
    );
    return reply(res, 200, {
      id: 'cmpl-mock-tool',
      object: 'chat.completion',
      created: 0,
      model: parsed.model ?? MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_mock_1',
                type: 'function',
                function: {
                  name: toolName,
                  arguments: JSON.stringify(toolArgs),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }

  return reply(res, 200, {
    id: 'cmpl-mock',
    object: 'chat.completion',
    created: 0,
    model: parsed.model ?? MODEL,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'MOCK-OK' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
});

if (LOG) {
  try {
    writeFileSync(LOG, '', 'utf8');
  } catch {
    /* 忽略 */
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock] OpenAI-compatible upstream on 0.0.0.0:${PORT} (model=${MODEL})`);
  console.log(`[mock] reachable at: ${lanAddresses().map((a) => `http://${a}:${PORT}/v1`).join('  ')}`);
  if (LOG) console.log(`[mock] request log: ${LOG}`);
});
