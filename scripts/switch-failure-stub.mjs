#!/usr/bin/env node
// 宿主端的「替身端脑」—— 真机验「切会话失败 ⇒ 消息不许落进另一条会话」用的注入器。
//
// # 它扮演什么
//
// 手机上的 App 在「外部端脑」形态下，把端脑请求发给 `127.0.0.1:<port>`
// （`adb reverse` 把它接到本进程）⇒ ⇒ 本进程扮演**那一台端脑**：
//
//   * `GET /shadow/v1/conversations`              ⇒ 会话列表（配置里给）；
//   * `GET /shadow/v1/conversations/{id}`         ⇒ 那条会话；
//   * **被注入的那条 id** ⇒ ⇒ **404**（响应体是**真端脑自己的 404 体**
//     —— 脚本先从真端脑抓一份原样塞进配置）；
//   * `POST .../messages` 与 `.../messages:stream` ⇒ ⇒ **记账**（这次测试的
//     「终局」就钉在它身上）＋ 回一个像样的回复。
//
// # 为什么不用「真端脑 + 代理转发」
//
// 真端脑在手机上**跑在 App 进程里** ⇒ ⇒ App 一旦切到「外部端脑」形态
// （为了让客户端指着本进程），内嵌大脑就**不启动了** ⇒ ⇒ 真端脑根本不在跑
// ⇒ ⇒ 代理转发给一个**死端口** ⇒ ⇒ 列表拉不到（2026-11-01 真机实测踩到）。
//
// ⇒ 所以端脑那一侧由**本桩**扮演；被验的是**客户端这一侧**：
//    路由 → **真实 HTTP client** → **真 404** → 闸门 → **真实控件树** → 真机屏幕。
//
// # 配置（每次请求都重读 ⇒ ⇒ 注入可随时放开/收紧）
//
//   {
//     "conversations": [ {id, agent, created_at, updated_at, history:[…]} ],
//     "failIds": ["<被注入的会话 id>"],
//     "notFoundBody": "<真端脑的 404 响应体原文>"
//   }
import http from 'node:http';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const port = parseInt(arg('port', '45990'), 10);
const logPath = arg('log', '');
const configPath = arg('config', '');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { conversations: [], failIds: [], notFoundBody: '' };
  }
}

function record(entry) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    /* 记账失败不许影响应答 */
  }
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const url = req.url || '/';
    const path = url.split('?')[0];
    const cfg = readConfig();
    const conversations = Array.isArray(cfg.conversations) ? cfg.conversations : [];
    const failIds = Array.isArray(cfg.failIds) ? cfg.failIds : [];

    const reply = (status, note) => {
      record({ ts: Date.now(), method: req.method, path, status, note: note || '' });
    };

    // ── 会话列表 ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/shadow/v1/conversations') {
      reply(200, 'list');
      return json(res, 200, conversations);
    }

    // ── 单条会话 ──────────────────────────────────────────────────────────
    const one = /^\/shadow\/v1\/conversations\/([^/?#]+)$/.exec(path);
    if (req.method === 'GET' && one) {
      const id = decodeURIComponent(one[1]);
      if (failIds.includes(id)) {
        // 真端脑的 404 形状（原样回，只把 id 换成被注入的那条）。
        const tmpl =
          cfg.notFoundBody ||
          '{"error":{"code":4040,"message":"conversation not found: ' +
            id +
            '"}}';
        const out = tmpl.replace(
          /"conversation not found: [^"]*"/,
          '"conversation not found: ' + id + '"',
        );
        reply(404, 'injected-404');
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(out);
        return;
      }
      const conv = conversations.find((c) => c.id === id);
      if (!conv) {
        reply(404, 'not-found');
        return json(res, 404, {
          error: { code: 4040, message: 'conversation not found: ' + id },
        });
      }
      reply(200, 'conversation');
      return json(res, 200, conv);
    }

    // ── 发消息（记账 + 回一个像样的回复）─────────────────────────────────
    const send = /^\/shadow\/v1\/conversations\/([^/?#]+)\/messages(?::stream)?$/.exec(
      path,
    );
    if (req.method === 'POST' && send) {
      reply(200, 'write');
      if (path.endsWith(':stream')) {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        });
        res.write('data: ' + JSON.stringify({ type: 'delta', delta: '（宿主桩的回复）' }) + '\n\n');
        res.end();
        return;
      }
      return json(res, 200, { reply: '（宿主桩的回复）' });
    }

    // ── 建会话 ────────────────────────────────────────────────────────────
    if (req.method === 'POST' && path === '/shadow/v1/conversations') {
      reply(200, 'create');
      const now = new Date().toISOString();
      return json(res, 200, {
        id: 'stub-' + Date.now(),
        agent: 'temporal',
        created_at: now,
        updated_at: now,
        history: [],
      });
    }

    // ── 杂项端点：客户端启动时会问这些 ────────────────────────────────────
    if (path === '/.well-known/agent.json') {
      reply(200, 'agent-card');
      return json(res, 200, {
        name: 'host-stub-telencephalon',
        description: '真机脚本用的替身端脑',
        version: '0.0.0',
        capabilities: {},
        endpoints: {},
      });
    }
    if (path === '/shadow/v1/agents') {
      reply(200, 'agents');
      return json(res, 200, []);
    }

    reply(404, 'unhandled');
    return json(res, 404, {
      error: { code: 4040, message: 'not found: ' + path },
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('stub listening on 127.0.0.1:' + port + '\n');
});
