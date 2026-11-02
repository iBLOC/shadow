#!/usr/bin/env node
/**
 * 桌面端「会话失效」实验的**宿主替身端脑**。
 *
 * ## 它扮演谁
 *
 * 桌面端（web 形态）打的是端脑的 HTTP 面：
 *   - `POST /shadow/v1/conversations`                    建会话
 *   - `POST /shadow/v1/conversations/{id}/messages:stream` 发消息（SSE）
 *   - `GET  /shadow/v1/identity`                          「你是谁」
 *   - `GET  /models/providers`                            AppInitializer 的探测
 *
 * ## 为什么需要它
 *
 * 桌面端把「端脑换了实例 ⇒ 旧 sessionId 失效」这件事的处理写成
 * 「**静默重建**」（`ConversationPage.tsx` 的发送重试）：
 *   第一次流失败 → `setSessionId(id, '')` → `continue` → 建新会话 → 再发一次。
 *
 * ⇒ ⇒ **第一次失败被吞掉** ⇒ ⇒ 界面一点异常都没有 ⇒ ⇒
 * **模型上下文被静默清零，而用户不知道**（失败长得像成功）。
 *
 * 这个替身**按模式**回答「未知会话 id」，好让同一段客户端代码
 * 在不同输入下走出**不同**分支 —— 那才是有分辨力的读数：
 *
 *   --mode live        正控：会话 id **认识** ⇒ 正常回 ⇒ 不重建
 *   --mode notfound    主案：404 + 真端脑形状 ⇒ 命中「会话失效」⇒ 静默重建
 *   --mode other       同族更坏：500 + message 里带 'conversation' 但**根本不是会话问题**
 *                      ⇒ 松散子串照样命中 ⇒ 照样静默重建 ⇒ 上下文照样被清
 *   --mode substring   反向验证：404，但 message **不含**那五个子串
 *                      ⇒ **不**重建 ⇒ 界面出现错误提示
 *                      （把 message 改一个词，读数就翻转 ⇒ 判据有分辨力）
 *
 * ## 真端脑的 404 形状
 *
 * 响应体逐字取自**真端脑**对不存在会话的响应（移动端那轮抓的）：
 *   `{"error":{"code":4040,"message":"conversation not found: <id>"}}`
 *
 * ## 历史轮数：把「服务端视角」搬进界面
 *
 * 替身给每个会话数轮次，并在 SSE 里回报「服务端这一轮看到的历史轮数」。
 * ⇒ ⇒ 于是**界面上的回复文字本身**就能证明上下文是不是被清零了
 * ⇒ ⇒ 而不是靠推断。
 *
 * ## CORS
 *
 * web 形态的前端在 `http://127.0.0.1:<web-port>`，端脑在另一个端口 ⇒ 跨域
 * ⇒ ⇒ 真端脑那边是 `CorsLayer::permissive()` ⇒ ⇒ 替身照做（否则浏览器直接掐掉）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

const PORT = Number(arg('port', '45995'));
const MODE = arg('mode', 'notfound');
const LOG = arg('log', '');
/** 正控里「认识」的会话 id（live 模式预置）。 */
const LIVE_ID = arg('live-id', 'live-1');

/** 真端脑对不存在会话的响应体（逐字形状）。 */
function notFoundBody(id) {
  return JSON.stringify({ error: { code: 4040, message: 'conversation not found: ' + id } });
}

/** 反向验证用的形状：**不含** session / not found / invalid / expired / conversation。 */
function unrelatedBody() {
  return JSON.stringify({ error: { code: 5000, message: 'upstream refused the request' } });
}

/** 同族更坏：500，但 message 里带 'conversation' —— 与会话本身无关。 */
function unrelatedButConversationBody() {
  return JSON.stringify({ error: { code: 5000, message: 'conversation service unavailable' } });
}

/** 每个会话的历史轮数。 */
const turns = new Map([[LIVE_ID, 3]]);
let created = 0;
const logLines = [];

function log(entry) {
  logLines.push(entry);
  if (LOG) {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(res, status, obj) {
  const text = JSON.stringify(obj);
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function sse(res, lines) {
  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  for (const line of lines) res.write('data: ' + JSON.stringify(line) + '\n\n');
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const entry = { ts: new Date().toISOString(), mode: MODE, method: req.method, path: p };

    // ---- 探测面：让 AppInitializer 判「问不到」（unknown）而不是「没配模型」 ----
    if (p === '/models/providers') {
      entry.status = 401;
      log(entry);
      sendJson(res, 401, { error: 'shadow key required' });
      return;
    }
    if (p === '/shadow/v1/identity') {
      entry.status = 200;
      log(entry);
      sendJson(res, 200, { identified: false, principal: null, persona: null, device: null });
      return;
    }

    // ---- 建会话（静默重建走的就是这里） ----
    if (p === '/shadow/v1/conversations' && req.method === 'POST') {
      created += 1;
      const id = 'srv-' + created;
      turns.set(id, 0);
      entry.status = 200;
      entry.createdId = id;
      log(entry);
      sendJson(res, 200, {
        id,
        title: 'server conversation ' + id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        turns: [],
      });
      return;
    }

    // ---- 发消息（SSE） ----
    const streamMatch = p.match(/^\/shadow\/v1\/conversations\/([^/]+)\/messages:stream$/);
    if (streamMatch) {
      const id = decodeURIComponent(streamMatch[1]);
      entry.conversationId = id;
      const known = turns.has(id);

      if (!known) {
        if (MODE === 'notfound') {
          entry.status = 404;
          log(entry);
          cors(res);
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(notFoundBody(id));
          return;
        }
        if (MODE === 'other') {
          entry.status = 500;
          log(entry);
          cors(res);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(unrelatedButConversationBody());
          return;
        }
        if (MODE === 'substring') {
          entry.status = 500;
          log(entry);
          cors(res);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(unrelatedBody());
          return;
        }
        // live 模式：未知的 id 也当 404 处理（不该走到这里）
        entry.status = 404;
        log(entry);
        cors(res);
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(notFoundBody(id));
        return;
      }

      const prior = turns.get(id) || 0;
      turns.set(id, prior + 1);
      entry.status = 200;
      entry.priorTurns = prior;
      log(entry);
      sse(res, [
        { type: 'delta', delta: '（服务端这一轮看到的历史轮数：' + prior + '）' },
        { type: 'delta', delta: prior > 0 ? '我记得你前面说过的话。' : '我这边看不到你前面说过的话。' },
        { type: 'done' },
      ]);
      return;
    }

    // ---- 其它读会话 / 列表 ----
    const convMatch = p.match(/^\/shadow\/v1\/conversations\/([^/]+)$/);
    if (convMatch) {
      const id = decodeURIComponent(convMatch[1]);
      if (turns.has(id)) {
        entry.status = 200;
        log(entry);
        sendJson(res, 200, {
          id,
          title: 'server conversation ' + id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          turns: [],
        });
        return;
      }
      entry.status = 404;
      log(entry);
      cors(res);
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(notFoundBody(id));
      return;
    }

    if (p === '/shadow/v1/conversations' && req.method === 'GET') {
      entry.status = 200;
      log(entry);
      sendJson(res, 200, []);
      return;
    }

    entry.status = 404;
    log(entry);
    sendJson(res, 404, { error: 'not found: ' + p });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[stub] mode=' + MODE + ' listening on http://127.0.0.1:' + PORT);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500);
  });
}
