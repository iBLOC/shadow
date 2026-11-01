#!/usr/bin/env node
// 宿主端的「有门的端脑」桩 —— 只复刻端脑 `POST /a2a` 那道门的行为。
//
// # 为什么需要它
//
// 真机上要验「**失败态说真话**」，最干净的一种失败是 **401**
// （端脑那道 `require_shadow_key` 门：请求必须带 `X-Shadow-Key`）。
//
// ⚠️ **为什么不能用真端脑来造这个 401**：
// 手机上内嵌端脑的那把钥匙，宿主是**同一份**同时递给「端脑」与「客户端」的
// （`MainActivity.kt:771` 一个 `shadowKey` 值 ⇒ `setShadowApiKey` + 返回给 Dart）
// ⇒ ⇒ **内嵌端脑在结构上不可能对自家 App 回 401**（那是同一把钥匙）。
// ⇒ 而「外部端脑」要 401 的话 ⇒ 移动端**没有为它配 shadow key 的入口**
//    （既有缺口）⇒ App 发出去的请求**不带钥匙** ⇒ 外部端脑回 401。
//
// ⇒ 所以本桩扮演的就是「**那台配了钥匙的外部端脑**」：
//    - 请求带对钥匙 ⇒ 200 + SSE（端脑那句纯文本，形状与真端脑一致）；
//    - 请求不带/带错钥匙 ⇒ **401 且响应体为空**
//      （与 `telencephalon/src/api/shadow_auth.rs` 的中间件一致：
//       它 `Err(StatusCode::UNAUTHORIZED)` ⇒ axum 给的就是空体 401）。
//
// # ⚠️ 钥匙只从环境变量读，绝不进日志、绝不进文件、绝不出现在命令行
//
//   A2UI_STUB_KEY=<那把钥匙> node scripts/a2ui-door-stub.mjs --port 41234 --log x.jsonl
//
// 日志里只记「有没有带钥匙 / 钥匙对不对 / 回了什么状态」。
import http from 'node:http';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const port = parseInt(arg('port', '41234'), 10);
const logPath = arg('log', '');
const expected = process.env.A2UI_STUB_KEY ?? '';

/** 端脑那句纯文本（`a2ui::available_views_hint` 的中文版）。 */
const TEXT_REPLY =
  '这个端点把端脑的状态画成 A2UI 界面。可以试：tasks（任务看板）、agents（叶区列表）。';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

/** 真端脑的 SSE 形状（对照 `fixtures/a2ui/tasks_sse.txt`）。 */
function sseTextReply() {
  const evt = {
    result: {
      kind: 'task-status-update',
      taskId: uuid(),
      contextId: uuid(),
      status: {
        state: 'completed',
        message: {
          kind: 'message',
          messageId: uuid(),
          role: 'agent',
          parts: [{ kind: 'text', text: TEXT_REPLY }],
        },
      },
      final: true,
    },
  };
  return 'data: ' + JSON.stringify(evt) + '\n\n';
}

const server = http.createServer((req, res) => {
  const raw = req.headers['x-shadow-key'];
  const hasKey = typeof raw === 'string' && raw.length > 0;
  const keyMatched = hasKey && raw === expected;
  let status;

  // ⚠️ **只为归属判定**收一小段正文（取 JSON-RPC 的 id）——
  //    「这条 /a2a 是 App 发的，还是我的探针发的」必须能分开，
  //    否则「App 的请求没带钥匙」这条判据会被探针自己顶替（假绿）。
  //    ⚠️ **只取 id，不记正文**（正文里有用户说的话）。
  let chunks = [];
  req.on('data', (c) => {
    if (chunks.length < 64) chunks.push(c);
  });
  req.on('end', () => {
    finish(req, res, hasKey, keyMatched, Buffer.concat(chunks));
  });
});

// 从正文里取 JSON-RPC 的 id（取不到就是 null）。
function pickId(buf) {
  try {
    const j = JSON.parse(buf.toString('utf8'));
    return typeof j?.id === 'string' ? j.id : null;
  } catch {
    return null;
  }
}

function finish(req, res, hasKey, keyMatched, body) {
  const reqId = pickId(body);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  let status;

  if (req.url && req.url.startsWith('/a2a')) {
    if (keyMatched) {
      status = 200;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'close',
      });
      res.end(sseTextReply());
    } else {
      // ⚠️ 与端脑那道门一致：**401 + 空体**。
      status = 401;
      res.writeHead(401, { 'Content-Length': '0' });
      res.end();
    }
  } else {
    status = 404;
    res.writeHead(404, { 'Content-Length': '0' });
    res.end();
  }

  // ⚠️ 只记「带没带 / 对不对」—— **绝不记钥匙本身**。
  const rec = {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url,
    hasShadowKey: hasKey,
    keyMatched,
    status,
    reqId,
    ua,
  };
  const line = JSON.stringify(rec);
  if (logPath) {
    try {
      fs.appendFileSync(logPath, line + '\n');
    } catch {
      /* 记不上就记不上，不影响判定 */
    }
  }
  process.stdout.write(line + '\n');
}

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('listening ' + port + '\n');
});