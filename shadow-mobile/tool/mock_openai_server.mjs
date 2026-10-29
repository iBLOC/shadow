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

/** 收到的每一个请求（按顺序）。 */
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
                  name: 'echo',
                  arguments: JSON.stringify({ text: 'MOCK-TOOL' }),
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
