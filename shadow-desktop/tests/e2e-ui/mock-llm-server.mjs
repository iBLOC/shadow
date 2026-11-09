// 回环 mock OpenAI 上游 —— E2E 的「推理面有货」来源。
//
// ⚠️ **为什么存在**（2026-11-05 真机实测）：CI 干净 runner 上 neuron 一个引擎
// 都没有 ⇒ 任何推理请求都 404 `no_engine_for_model` ⇒ ❹ 那类红无法归因到
// 产品。neuron 自带 `NEURON_REMOTE_*` 注册通道（`neuron/src/server/state.rs`）：
// 每个模型 id 注册成一个「代理到远端」的引擎 ⇒ ⇒ 本脚本就是那个「远端」。
// 它由 `global-setup.ts` 起，模型 id 默认 `test-model-ui`（与 spec 的
// lobe 配置 PATCH 对齐），零真模型、零新增产品面。
//
// ⚠️ **它得会「按语义分诊」**（2026-11-09 真机实测 + CI 产物取证）：
// 端脑的**意图分类**调用要的是**一个 JSON 对象**，叶区自己回答要的是**散文**
// ⇒ ⇒ 固定回散文 ⇒ ⇒ 端脑报 `the brain did not return intent JSON`
// ⇒ ⇒ 502 ⇒ ⇒ 对话历史恒 0 ⇒ ⇒ Playwright 那一步**从来没跑绿过**。
// ⇒ ⇒ 分诊逻辑在 `mock-llm-intent.mjs`（单独一个文件 ⇒ 好判、好测）。
import http from 'node:http';
import fs from 'node:fs';
import { buildMockReply } from './mock-llm-intent.mjs';

const PORT = Number(process.env.MOCK_PORT || 18099);
const LOG = process.env.MOCK_LOG_PATH || 'mock-llm-server.log';
const PORT_FILE = process.env.MOCK_PORT_FILE || '';
const MODEL_ID = process.env.MOCK_MODEL_ID || 'test-model-ui';
// 与 spec 断言对齐：business-flow-ui（FULL_STACK）要 reply 含「任务」；
// conversation-flow（FULL_STACK）要含 /[\u4e00-\u9fa5]|hello/i ⇒ 一条文本全满足。
const REPLY = process.env.MOCK_REPLY || '任务已创建（mock）：hello 你好';

function log(line) {
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* 日志写不进不挡路 */ }
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    log(JSON.stringify({ t: new Date().toISOString(), method: req.method, url: req.url, body: body.slice(0, 400) }));
    if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: MODEL_ID, object: 'model', owned_by: 'mock' }] }));
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
      let model = MODEL_ID;
      let messages = [];
      try {
        const parsed = JSON.parse(body || '{}');
        model = parsed.model || model;
        messages = parsed.messages || [];
      } catch { /* 形状坏的 body 也答 */ }
      // ⚠️ **按语义分诊**：意图分类 ⇒ JSON；其它 ⇒ 散文。
      const content = buildMockReply(messages, REPLY);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-mock', object: 'chat.completion', created: 0, model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg-mock', type: 'message', role: 'assistant', model: MODEL_ID, content: [{ type: 'text', text: REPLY }], stop_reason: 'end_turn' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'mock upstream: no route ' + req.method + ' ' + req.url } }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  const actual = addr && typeof addr === 'object' ? addr.port : PORT;
  log('LISTENING 127.0.0.1:' + actual);
  // ⚠️ **把真实端口落盘** ⇒ ⇒ 判据可以用 `MOCK_PORT=0`（临时端口）⇒ ⇒ 不用跟
  // 谁抢固定端口 ⇒ ⇒ 也不会因为端口被占而「测不出来」。
  if (PORT_FILE) {
    try { fs.writeFileSync(PORT_FILE, String(actual)); } catch { /* 写不进不挡路 */ }
  }
});
