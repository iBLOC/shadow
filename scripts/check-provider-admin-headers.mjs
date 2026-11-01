#!/usr/bin/env node
/**
 * 「providers 面上了门之后，客户端会不会 401」—— 判定闸。
 *
 * ## 为什么需要它（2026-10-31）
 *
 * 端脑把 `/models/providers*` 放到了**门**后面（`telencephalon` 的
 * `providers::router_with_admin` ⇒ **没配 token ⇒ fail-closed 401**）。
 *
 * ⚠️ 2026-10-31 起这张面是**三道门**（读=shadow∪admin / 写=admin /
 * 主人=进程内内部凭据∪admin），不是「一道门罩整张表」—— 理由是
 * **门不能掐断主人**（端脑自己经回环打云端代理 ⇒ 整表罩 admin 门 ⇒
 * 主人被自己的门挡住，而那个 401 还会被说成「用户的云 key 坏了」）。
 *
 * ⇒ 但**客户端那一侧的要求没变**：打这张面的请求**一律带 admin token**
 * ⇒ 而 admin token 能开这三道门里的每一道 ⇒ ⇒ 这个闸的判据仍然成立。
 *
 * ⇒ 于是「客户端**每一处**打这张面的请求有没有带凭据」就成了一个
 * **必须逐处回答**的问题 —— 而且**答错的后果不是报错，是静默退化**：
 *
 * * `AppInitializer` / `ModelOnboardingPage` 的那两发是「**有没有配好模型**」
 *   的**探测** ⇒ 401 ⇒ `hasCloud` 恒为 false ⇒ ⇒ **用户明明配好了，
 *   却被判定成「没配好」⇒ 踢回设置向导** ⇒ 那是「失败长得像成功」；
 * * `AddProviderModal` 的那三发是「**新增供应商**」的写操作 ⇒ 401 ⇒
 *   ⇒ **按钮直接失败**（而且是 Tauri 模式下也失败 —— 那一格不是 web-only）。
 *
 * ⚠️ 靠人读代码数点子是不可靠的（漏一处 ⇒ 门一上就坏）⇒ ⇒ 这里做成**闸**：
 * **机器可判** ⇒ 「门一上之前」跑一次，就知道清单。
 *
 * ## 判据来自哪里（不是手抄）
 *
 * ⚠️ 路由清单**从服务端源码里解析**（`../telencephalon/src/api/providers.rs`
 * 的 `provider_routes()`）⇒ ⇒ **服务端改了路由，闸自动跟着改**；
 * ⇒ 解析不到 ⇒ **退出码 2**（判据过期/源不在）⇒ **绝不「静默全绿」**。
 *
 * ## 退出码
 *
 * * `0` —— 全绿（每一处打这张面的请求都带了凭据）；
 * * `1` —— **有红**（有调用点没带凭据 ⇒ 门一上就会 401）；
 * * `2` —— **探测器坏了**（判据源找不到 / 解析不出路由 / 自检不过）⇒
 *   ⇒ 「不知道」**不等于**「没问题」。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-provider-admin-headers.mjs            # 判定
 * node scripts/check-provider-admin-headers.mjs --self-test # 探测器自检
 * ```
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, makeLineIndex } from './lib/strip-comments.mjs';
// ⚠️⚠️ **判据只有一处** —— 头名、取钥匙的入口、「这一发带没带凭据」全从
// `scripts/lib/credentials.mjs` 来 ⇒ ⇒ **本文件不再抄一份** ⇒ ⇒ 抄一次就会
// 漂一次 ⇒ ⇒ 漂了就会出**假红**（明明递了钥匙却报「必 401」）⇒ ⇒ 而「红」
// 比漏报更坑：会让人去改**已经改对**的代码 ⇒ ⇒ 引入新 bug。
import { findAssignment, canPassDoor } from './lib/credentials.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');
// 端脑仓的位置：默认是**兄弟仓**（`../telencephalon`）⇒ 可用
// `--telencephalon <path>` 或环境变量 `SHADOW_TELENCEPHALON_DIR` 指到别处
// （反向验证时就是要对着一个**历史 worktree** 跑）。
let TELENCEPHALON_DIR =
  process.env.SHADOW_TELENCEPHALON_DIR ||
  resolve(REPO, '..', 'telencephalon');
let TELENCEPHALON_SRC = resolve(TELENCEPHALON_DIR, 'src', 'api', 'providers.rs');
let DESKTOP_SRC = join(REPO, 'shadow-desktop', 'src');
const MOBILE_LIB = join(REPO, 'shadow-mobile', 'lib');

// ⚠️ **头名 / 取钥匙的入口 / 「这一发带没带凭据」** —— 一律从
// `scripts/lib/credentials.mjs` 来（端脑的 admin token 头 = `X-Admin-Token`；
// 客户端取那把钥匙的入口 = `adminHeaders`；shadow key 头 = `X-Shadow-Key`，
// 而桌面端把它叫 `apiKey` ⇒ 判据里两个名字都得认，否则「带了 shadow key
// 的读请求」会被误报成红）。
// ⇒ ⇒ **本文件不再抄一份** ⇒ ⇒ 抄一次就会漂一次 ⇒ ⇒ 漂了就会出**假红**。

function printHelp() {
  console.log(`
providers 面的「客户端会不会 401」判定闸

  node scripts/check-provider-admin-headers.mjs              判定
  node scripts/check-provider-admin-headers.mjs --self-test  探测器自检

退出码：0 = 全绿 / 1 = 有红 / 2 = 探测器坏了（判据源缺失或自检不过）
`.trim());
}

/* ------------------------------------------------------------------ *
 * 1. 判据源：服务端的路由表
 * ------------------------------------------------------------------ */

/**
 * 从 `providers.rs` 解析出「这张面上的路由」。
 *
 * ⚠️ 解析的是**整个文件**的 `.route("…")` —— 因为这张面的**每一条**路由
 * 都在**某道门**后面（2026-10-31 起是**三道**：读=shadow∪admin、
 * 写=admin、主人=进程内内部凭据∪admin，见 `providers::provider_routes`）。
 *
 * ⇒ 这里**故意取全集**（过近似）：客户端那一侧的要求是「打这张面的请求
 * **一律带 admin token**」—— 而 admin token 能开这三道门里的**每一道**
 * ⇒ ⇒ 过近似不会漏判，只可能多要求一把钥匙 ⇒ ⇒ 闸的判定仍然成立。
 *
 * ⇒ 路由清单变了 ⇒ 闸自动跟着变 ⇒ 不会「判据过期还在报绿」。
 *
 * @returns {{routes: string[], prefixes: string[]}}
 */
/**
 * 取出 `code` 里从 `open`（一个 `(` 的位置）开始、**括号配平**的那段文本。
 */
function balancedText(code, open) {
  let depth = 0;
  let inStr = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

/**
 * 门 → 这道门认哪几把钥匙。
 *
 * ⚠️ **门名是从服务端源码里读出来的** ⇒ 服务端改门 ⇒ 闸自动跟着改
 * ⇒ 不抄第二份门表。
 *
 * - `read`  ⇒ **shadow key 或 admin token**（读的是「这台大脑自己的配置」，
 *   回吐的只有掩码 ⇒ 不泄密 ⇒ 属 shadow 域；admin 是更强的钥匙，当然也能开）；
 * - `admin` ⇒ **只有 admin token**（「谁能重配这台大脑的上游」⇒ admin 域；
 *   shadow key 开不了它 —— 两个域是分开的）；
 * - `owner` ⇒ **端脑进程内的内部凭据，或 admin token**（主人门：端脑自己
 *   经回环调云端代理 ⇒ 主人不能被自己的门挡住；但那把内部钥匙只活在
 *   端脑内存里 ⇒ **客户端拿不到** ⇒ 对客户端而言只剩 admin token）；
 * - `shadow` ⇒ **shadow key**（`/shadow/v1/*` 那种门）。
 *
 * @returns {string[]|null} 认不出来 ⇒ `null`（判不了，不猜）
 */
function doorAccepts(kind) {
  switch (kind) {
    case 'read':
      return ['shadow', 'admin'];
    case 'admin':
      return ['admin'];
    case 'owner':
      return ['internal', 'admin'];
    case 'shadow':
      return ['shadow'];
    default:
      return null;
  }
}

/**
 * 从一段路由/中间件文本里认出「这是哪道门」。
 *
 * ⚠️ **两种写法都要认**（服务端两种都用过，漏一种 ⇒ 整张表被判成「没有门」）：
 * - ① **逐条挂**：`route_layer(read_door)` / `route_layer(admin_door.clone())`
 *   ⇒ 门名是**变量名**（`read_door` / `admin_door` / `owner_door`）；
 * - ② **整表挂**：`Router::new().route(…).route_layer(from_fn_with_state(state, require_admin_token))`
 *   ⇒ 门名藏在**中间件函数名**里（`require_admin_token` / `require_read_credential` …）。
 */
const DOOR_BY_MIDDLEWARE = [
  [/require_admin_token/, 'admin'],
  [/require_read_credential/, 'read'],
  [/require_owner_credential|require_internal_token/, 'owner'],
  [/require_shadow_key/, 'shadow'],
];

const DOOR_LABEL = {
  read: '读门（shadow 或 admin）',
  admin: '写门（只有 admin）',
  owner: '主人门（内部凭据或 admin）',
  shadow: 'shadow 门（只有 shadow key）',
};

function resolveDoor(text) {
  const byVar = /\b(read|admin|owner|shadow)_?door\b/i.exec(text);
  if (byVar) return byVar[1].toLowerCase();
  for (const [re, kind] of DOOR_BY_MIDDLEWARE) {
    if (re.test(text)) return kind;
  }
  return null;
}

/**
 * **截掉 `#[cfg(test)] mod tests` 段**（纯函数 ⇒ 自检能直接喂合成样例）。
 *
 * ⚠️⚠️ **为什么必须截**（2026-11-01 被并行会话当场指出）：
 *
 * 测试夹具里也有 `.route("/api/telencephalon/chat/completions", …)`
 * （那是**假对端**的 router）⇒ 混进表里 ⇒ ⇒ 同一个 `(方法, 路径)` 出现
 * **两行、结论相反**（一行说「主人门」、一行说「没有门」）⇒ ⇒
 * 读的人会以为「**主人门还有一份没挂门的副本**」⇒ ⇒ **那是假的** ⇒ ⇒
 * 而且哪天有人真调它，那一发会被「（没有门）」那行**误判** ⇒ ⇒ **潜伏的假红**。
 *
 * ⇒ ⇒ 这与「注释里也别写那个 route 调用的形状」**同族**：
 * **闸扫的是原始文本 ⇒ 测试代码与注释都会漏进来** ⇒ ⇒ 两者都要挡。
 *
 * ⚠️ 只在 `#[cfg(test)]` **后面跟着 `mod`** 时才截
 * （`#[cfg(test)]` 标在单个辅助函数上不算 ⇒ 截那里会漏掉后面的真路由）。
 */
function stripTestModule(code) {
  let cut = -1;
  const cfgRe = /#\[cfg\(test\)\]/g;
  let cm;
  while ((cm = cfgRe.exec(code)) !== null) {
    if (/\bmod\s+[A-Za-z_]/.test(code.slice(cm.index, cm.index + 120))) {
      cut = cm.index;
      break;
    }
  }
  return cut === -1 ? code : code.slice(0, cut);
}

/**
 * 从 `providers.rs` 解析出「**每条路由归哪道门管**」。
 *
 * ⚠️ 解析的是**方法 + 路径 + 门**三元组，不是光路径 ——
 * 因为 `/models/providers` 这**一个路径**上有两道不同的门：
 * `GET` 归读门（shadow 或 admin），`POST` 归写门（只有 admin）
 * ⇒ ⇒ 只按路径判 ⇒ 必然判错一半。
 *
 * @returns {{method: string, path: string, door: string|null, accepts: string[]|null}[]}
 */
function parseServerDoors() {
  if (!existsSync(TELENCEPHALON_SRC)) {
    throw new Error(`判据源不存在：${TELENCEPHALON_SRC}`);
  }
  const raw = readFileSync(TELENCEPHALON_SRC, 'utf8');
  let code = stripComments(raw, { nested: true, rust: true });
  // ⚠️ **测试段必须截掉**（见 `stripTestModule` 的注释：测试夹具里的**假对端**
  // router 也会写出同一个 `(方法, 路径)` ⇒ 混进表里 ⇒ 报告自相矛盾）。
  code = stripTestModule(code);

  // ---- ① 逐条路由（顺带记下每条 `.route(...)` 覆盖的字符区间）----
  const entries = [];
  const spans = [];
  const re = /\.route\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const path = m[1];
    const open = code.indexOf('(', m.index);
    const text = balancedText(code, open);
    const spanEnd = code.indexOf(')', open + text.length + 1);
    spans.push([m.index, spanEnd === -1 ? code.length : spanEnd]);
    const method = /\b(get|post|put|delete|patch)\s*\(/.exec(text);
    entries.push({
      method: method ? method[1].toUpperCase() : 'GET',
      path,
      door: resolveDoor(text),
      accepts: null,
    });
  }
  if (entries.length === 0) {
    throw new Error(`判据源里解析不出任何 .route(...)：${TELENCEPHALON_SRC}`);
  }

  // ---- ② 整表挂的门（不在任何一条 `.route(...)` 区间里的 `route_layer`）----
  const tableDoors = [];
  const layerRe = /\.route_layer\(/g;
  let l;
  while ((l = layerRe.exec(code)) !== null) {
    const insideRoute = spans.some(([a, b]) => l.index >= a && l.index <= b);
    if (insideRoute) continue;
    const open = code.indexOf('(', l.index);
    const text = balancedText(code, open);
    const kind = resolveDoor(text);
    if (kind) tableDoors.push(kind);
  }
  const tableDoor = tableDoors.length === 1 ? tableDoors[0] : tableDoors.length > 1 ? '多门' : null;

  // ---- ③ 定案 ----
  for (const e of entries) {
    if (!e.door && tableDoor && tableDoor !== '多门') e.door = tableDoor;
    e.accepts = e.door ? doorAccepts(e.door) : null;
    e.tableDoor = tableDoor;
  }
  // ⚠️ **防假绿**：一条门都解析不出来 ⇒ **不是**「没问题」，而是两种可能之一：
  //   (a) **门被摘掉了**（有人把门变量置成 `None`，或把 `route_layer` 撤了）
  //       ⇒ 那是**服务端出事了**，必须报得比「解析器坏了」更响；
  //   (b) 判据解析器坏了（挂法变了，我不认识）。
  // ⇒ ⇒ 两种都**退出码 2**（「不知道」≠「没问题」），但**话要说对**。
  if (!entries.some((e) => e.door)) {
    const neutered = /let\s+\w*door\w*\s*(?::[^=]+)?=\s*None\b/.test(code);
    const mentions =
      (code.match(/route_layer/g) ?? []).length +
      (code.match(/require_(?:admin_token|read_credential|owner_credential|shadow_key)/g) ?? []).length;
    if (neutered) {
      throw new Error(
        `判据源里**一条路由都没挂门**，而且门变量被置成了 \`None\`：${TELENCEPHALON_SRC}\n` +
          '   ⇒ 这不是「解析器坏了」，是**门被摘掉了** —— 服务端现在这张面**谁都能进**。',
      );
    }
    throw new Error(
      `判据源里解析不出任何门（route_layer / require_*）：${TELENCEPHALON_SRC}\n` +
        `   ⇒ 门机制字样出现 ${mentions} 次但都不在路由上 ⇒ 这不是「这张面没有门」，\n` +
        '   ⇒ 是**挂法变了**（我读不懂）或**门被摘了** ⇒ 别把「没读到」说成「没问题」。',
    );
  }
  return entries;
}

/**
 * **这道门到底挂上去了没有？** —— 读 `api/mod.rs` 的接线那一行。
 *
 * ⚠️⚠️ **这一条是本闸最要紧的一步**（2026-10-31 真机实测补上）：
 *
 * 门**定义**在 `providers.rs` 里 ≠ 门**生效**。真正决定的是
 * `api/mod.rs` 挂的是哪一个：
 *
 * - `.merge(providers::router_with_admin(...))` ⇒ **挂了**；
 * - `.merge(providers::router(...))` ⇒ **没挂**（无门版）⇒
 *   ⇒ **这张面现在谁都能进**（真机实测：读 200 / 写 422 到了处理函数）。
 *
 * ⇒ 只看 `providers.rs` 的闸 ⇒ 会报「红 1」⇒ 看着像「基本就绪」⇒
 * ⇒ **真相是「门根本没挂」** ⇒ 又一个「失败长得像成功」。
 *
 * @returns {{mounted: boolean|null, reason: string}}
 */
function parseWiring() {
  const apiMod = resolve(TELENCEPHALON_DIR, 'src', 'api', 'mod.rs');
  if (!existsSync(apiMod)) {
    return { mounted: null, reason: `找不到 ${apiMod}` };
  }
  const code = stripComments(readFileSync(apiMod, 'utf8'), { nested: true, rust: true });
  const names = [
    ...code.matchAll(/\.merge\(\s*providers::([A-Za-z_][A-Za-z0-9_]*)\s*\(/g),
  ].map((m) => m[1]);
  if (names.length === 0) {
    return { mounted: false, reason: 'api/mod.rs 里没有 merge(providers::…) ⇒ 这张面没挂进来' };
  }
  const withDoor = names.filter((n) => /admin|door/i.test(n));
  if (withDoor.length > 0) {
    return { mounted: true, reason: `挂的是 ${withDoor.join(', ')}` };
  }
  return { mounted: false, reason: `挂的是 ${names.join(', ')}（**无门版**）⇒ 这张面现在没有门` };
}

/**
 * 客户端这一发的**路径模式**。
 *
 * ⚠️ **为什么不能用「字面量尾巴」**：客户端的 URL 常长这样 ——
 * `` `${baseUrl}/models/providers/${providerId}/fetch-models` ``
 * ⇒ 路径里有**插值段**（对应服务端的 `{id}`）⇒ 只取插值之后的字面量
 * ⇒ 变成 `/fetch-models` ⇒ **再也匹配不上服务端那条路由**
 * ⇒ ⇒ 那一发会被**静默漏掉** ⇒ ⇒ 「少报」比「多报」更坏（看着像「没问题」）。
 *
 * ⇒ 所以这里把 URL 还原成**模式**：插值段 ⇒ `{}`（通配段）。
 *
 * @returns {string|null} 认不出来 ⇒ `null`
 */
function clientPathPattern(urlText) {
  const t = urlText.trim();
  let content = null;
  if (t.startsWith('`') && t.endsWith('`')) content = t.slice(1, -1);
  else if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    content = t.slice(1, -1);
  } else return null;

  // 绝对 URL ⇒ 取它的路径部分。
  const abs = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i.exec(content);
  if (abs) content = abs[1] || '/';

  // 开头的 `${base}` 是**哪张面**，不是路径的一部分 ⇒ 去掉它。
  content = content.replace(/^\$\{[^}]*\}/, '');
  // 剩下的插值段 ⇒ 通配段。
  content = content.replace(/\$\{[^}]*\}/g, '{}');

  content = content.split('?')[0].split('#')[0];
  if (!content.startsWith('/')) return null;
  return content;
}

/**
 * 服务端路径模板 ↔ 客户端路径模式。**两边**的 `{…}` 都当通配段。
 */
function routeMatches(serverPath, clientPattern) {
  const sp = serverPath.split('/').filter(Boolean);
  const cp = clientPattern.split('/').filter(Boolean);
  if (sp.length !== cp.length) return false;
  for (let i = 0; i < sp.length; i++) {
    const sWild = sp[i].startsWith('{') && sp[i].endsWith('}');
    const cWild = cp[i].startsWith('{') && cp[i].endsWith('}');
    if (sWild || cWild) continue;
    if (sp[i] !== cp[i]) return false;
  }
  return true;
}

/** 客户端这一发打的是服务端哪条路由？（方法 + 路径都要对上） */
function matchRoute(entries, method, clientPattern) {
  if (!clientPattern) return null;
  for (const e of entries) {
    if (e.method !== method) continue;
    if (routeMatches(e.path, clientPattern)) return e;
  }
  return null;
}

/** 这个 fetch 用的是哪个 HTTP 方法？（没写 ⇒ GET） */
function methodOf(callText) {
  const m = /\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/i.exec(callText);
  return m ? m[1].toUpperCase() : 'GET';
}

/* ------------------------------------------------------------------ *
 * 2. 客户端扫描
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'build') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 从 `fetch(` 起，取出**整个调用**的文本（括号配平，跳过字符串/模板）。 */
function extractCall(code, start) {
  let i = start + 'fetch'.length;
  let depth = 0;
  let inStr = null;
  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
    i++;
  }
  return code.slice(start);
}

/**
 * 调用文本里的第一个参数（URL）文本。
 *
 * ⚠️⚠️ **「只有一个参数」的老坑**（2026-10-31 自检抓到）：
 * 原实现只在遇到 `,`（深度 0）时返回 ⇒ 而 `fetch(\`${BASE}/path\`)` **没有逗号**
 * ⇒ 扫描会**跑过 call 自己的闭括号**，把后面的代码也当成 URL
 * ⇒ ⇒ 那一发**匹配不上任何路由 ⇒ 被静默漏掉** ⇒ ⇒ 「少报」比「多报」更坏
 * （看着像「没问题」）。
 *
 * ⇒ 所以：**遇到深度 0 的闭括号**（= call 自己的 `)`）⇒ 那就是第一个参数的末尾。
 */
function firstArg(callText) {
  const open = callText.indexOf('(');
  let i = open + 1;
  let depth = 0;
  let inStr = null;
  for (; i < callText.length; i++) {
    const ch = callText[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) return callText.slice(open + 1, i);
      depth--;
      continue;
    }
    if (ch === ',' && depth === 0) return callText.slice(open + 1, i);
  }
  return callText.slice(open + 1);
}

/**
 * URL 参数里，**紧跟在插值 `}` 之后**（或开头）的路径字面量。
 * @returns {string|null}
 */
function pathLiteral(urlText) {
  const m = /\$\{[^}]*\}\s*([^`'"$]*)/.exec(urlText);
  if (m) return m[1].split('?')[0].split('#')[0];
  const s = urlText.replace(/^["'`]/, '').split('?')[0].split('#')[0];
  return s.startsWith('/') ? s : null;
}

/** `${BASE}` 里的那个 base 变量名。 */
function baseVar(urlText) {
  const m = /\$\{\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\}/.exec(urlText);
  return m ? m[1] : null;
}

/** 这份代码打的是**哪张面**？ */
function classifySurface(code, urlText) {
  const base = baseVar(urlText);
  if (!base) {
    // 不是插值 ⇒ 要么是绝对 URL，要么是常量字面量 ⇒ 判不了。
    return { surface: 'UNKNOWN', reason: 'URL 里没有 base 插值' };
  }
  const rhs = findAssignment(code, base);
  if (rhs === null) {
    return { surface: 'UNKNOWN', reason: `找不到 ${base} 的赋值` };
  }
  if (/neuronUrl\s*\(/.test(rhs)) return { surface: 'NEURON', reason: `${base} = neuronUrl()` };
  if (/prefrontalUrl\s*\(/.test(rhs)) return { surface: 'TELE', reason: `${base} = prefrontalUrl()` };
  // ⚠️ **端脑面的地址有三个合法出处** ⇒ ⇒ 认得出来才判得准：
  // * `prefrontalUrl()` —— platform 的**兜底**地址（写死）；
  // * `store.connection.baseUrl` —— 用户在设置里改的（**运行时真相**）；
  // * `telencephalonClient.getBaseUrl()` —— **client 手里那个**
  //   （store 复原时推给它的 ⇒ ⇒ 与「列表」那一发**同一个地址**）。
  // ⇒ ⇒ 「列表」与「探针」必须打**同一台**端脑 ⇒ ⇒ 第三种形状也得认。
  if (/connection\.baseUrl|useTelencephalonStore|telencephalonStore|telencephalonClient/.test(rhs)) {
    return {
      surface: 'TELE',
      reason: `${base} = 端脑面（store.connection.baseUrl / telencephalonClient.getBaseUrl()）`,
    };
  }
  return { surface: 'UNKNOWN', reason: `${base} 的来源认不出来` };
}

/* ------------------------------------------------------------------ *
 * 3. 扫一个仓
 * ------------------------------------------------------------------ */

/**
 * @param {string} root 扫描根
 * @param {{method: string, path: string, door: string|null, accepts: string[]|null}[]} entries 服务端的门表
 * @returns {{red: object[], unknown: object[], green: object[], scanned: number}}
 */
function scanClient(root, entries) {
  const red = [];
  const unknown = [];
  const green = [];
  let scanned = 0;

  const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\.tsx?$/.test(f));
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    const code = stripComments(raw, { nested: false });
    const lineOf = makeLineIndex(code);
    scanned++;

    // 统一注入路径：`telencephalonClient.request()` 自己带那个头 ⇒ 豁免。
    const isUnifiedClient = /telencephalonClient\.ts$/.test(f.replace(/\\/g, '/'));

    let idx = -1;
    while ((idx = code.indexOf('fetch(', idx + 1)) !== -1) {
      const callText = extractCall(code, idx);
      const urlText = firstArg(callText);
      const p = clientPathPattern(urlText);
      const method = methodOf(callText);
      const route = matchRoute(entries, method, p);
      if (!route) continue;

      const rel = relative(REPO, f).replace(/\\/g, '/');
      const line = lineOf(idx);
      const label = `${method} ${route.path}`;

      if (isUnifiedClient) {
        green.push({ rel, line, route: label, how: '走 telencephalonClient.request()（统一注入）' });
        continue;
      }

      const { surface, reason } = classifySurface(code, urlText);
      if (surface === 'NEURON') {
        // neuron 面**没有**这张路由 ⇒ 不在这道门的范围内。
        green.push({ rel, line, route: label, how: `打在 neuron 面（${reason}）⇒ 不受这道门管` });
        continue;
      }
      if (surface === 'UNKNOWN') {
        unknown.push({ rel, line, route: label, why: reason });
        continue;
      }
      if (!route.accepts) {
        if (!route.door) {
          // 这条路由**真的没有门** ⇒ 谁都能进 ⇒ 这一发不受门管。
          green.push({ rel, line, route: label, how: '这条路由**没有门** ⇒ 不受门管' });
          continue;
        }
        // 有门、但认不出它认哪几把钥匙 ⇒ 判不了，不猜。
        unknown.push({
          rel,
          line,
          route: label,
          why: `门 ${route.door} 认不出它认哪几把钥匙`,
        });
        continue;
      }
      const cred = canPassDoor(code, callText, route.accepts);
      if (cred.ok) {
        green.push({ rel, line, route: label, how: cred.how });
      } else {
        red.push({ rel, line, route: label, why: cred.how });
      }
    }
  }
  return { red, unknown, green, scanned };
}

/**
 * 移动端：这张面**是不是**被调用了？（dart 只做「有没有」判断）
 *
 * ⚠️ 这里用**完整路由**（不含 `{…}` 的那些），**不用**前缀 ——
 * 前缀 `/models` 会把移动端一大堆 `/v1/models`、本地路由 `/models` 一锅端
 * （第一版扫出 26 条**全是误报**）⇒ ⇒ 只有 `/models/providers` 与
 * `/api/telencephalon/chat/completions` 这种**完整路径**才值得报。
 */
function scanMobile(root, concreteRoutes) {
  const hits = [];
  if (!existsSync(root)) return hits;
  for (const f of walk(root).filter((f) => f.endsWith('.dart'))) {
    const raw = readFileSync(f, 'utf8');
    const code = stripComments(raw, { nested: false });
    const lineOf = makeLineIndex(code);
    for (const route of concreteRoutes) {
      let i = -1;
      while ((i = code.indexOf(route, i + 1)) !== -1) {
        const before = i > 0 ? code[i - 1] : '';
        if (/[A-Za-z0-9_]/.test(before)) continue; // 路径段边界
        hits.push({ rel: relative(REPO, f).replace(/\\/g, '/'), line: lineOf(i), route });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * 4. 自检 —— 探测器自己也得有守卫
 * ------------------------------------------------------------------ */

/**
 * 自检用的**服务端门表**（合成）—— 不依赖兄弟仓 ⇒ 自检自带判据源。
 *
 * ⚠️ 刻意复刻真服务端那张表的**形状**：`/models/providers` 这**一个路径**
 * 上有**两道不同的门**（GET 读门 / POST 写门）⇒ ⇒ 只按路径判的闸必然判错。
 */
const SELF_TEST_SERVER = [
  { method: 'GET', path: '/models/providers', door: 'read_door', accepts: ['shadow', 'admin'] },
  { method: 'POST', path: '/models/providers', door: 'admin_door', accepts: ['admin'] },
  { method: 'PUT', path: '/models/providers/{id}', door: 'admin_door', accepts: ['admin'] },
  { method: 'DELETE', path: '/models/providers/{id}', door: 'admin_door', accepts: ['admin'] },
  {
    method: 'POST',
    path: '/models/providers/{id}/fetch-models',
    door: 'admin_door',
    accepts: ['admin'],
  },
  {
    method: 'POST',
    path: '/api/telencephalon/chat/completions',
    door: 'owner_door',
    accepts: ['internal', 'admin'],
  },
  {
    method: 'DELETE',
    path: '/models/{provider_id}/{model_id}',
    door: 'admin_door',
    accepts: ['admin'],
  },
];

const SELF_TEST_CASES = [
  {
    name: '端脑面 GET + 直接带 adminHeaders() ⇒ 绿（admin 能开读门）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: await adminHeaders() });",
    want: 'green',
  },
  {
    name: '端脑面 GET + 只带 shadow key ⇒ 绿（读门认 shadow）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: { 'X-Shadow-Key': key } });",
    want: 'green',
  },
  {
    name: '端脑面 GET + 根本没带 headers ⇒ 红',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`);",
    want: 'red',
  },
  {
    name: '端脑面 POST（同一路径！）+ 只带 shadow key ⇒ 红（写门只认 admin）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST', headers: { 'X-Shadow-Key': key } });",
    want: 'red',
  },
  {
    name: '端脑面 POST + 带 adminHeaders() ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST', headers: await adminHeaders() });",
    want: 'green',
  },
  {
    name: 'headers 变量来自 adminHeaders() ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nconst headers = await adminHeaders();\nawait fetch(`${API_BASE}/models/providers`, { headers });",
    want: 'green',
  },
  {
    name: '⚠️ 展开写法（...(await adminHeaders()) 在对象字面量里）⇒ 绿（不能被截断误报成红）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await adminHeaders()) } });",
    want: 'green',
  },
  {
    name: '⚠️ 展开写法 + 只带 shadow key ⇒ 红（写门只认 admin）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await shadowHeaders()) } });",
    want: 'red',
  },
  {
    name: '端脑面 + 带的是别的头 ⇒ 红',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: { 'Content-Type': 'application/json' } });",
    want: 'red',
  },
  {
    name: 'neuron 面 ⇒ 不受这道门管',
    code: "const NEURON_BASE = neuronUrl();\nawait fetch(`${NEURON_BASE}/models/providers`);",
    want: 'green',
  },
  {
    name: '注释里提到这条路由 ⇒ 不算命中',
    code: "const API_BASE = prefrontalUrl();\n// 以前这里打 ${API_BASE}/models/providers\nconst x = 1;",
    want: 'none',
  },
  {
    name: '/v1/models 不是这张面（不是 /models 前缀）',
    code: "const NEURON_BASE = neuronUrl();\nawait fetch(`${NEURON_BASE}/v1/models?engine=llm`);",
    want: 'none',
  },
  {
    name: '端脑面 + 路由在插值里（/models/{provider}/{model}）⇒ 红',
    code: "const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);\nawait fetch(`${baseUrl}/models/foo/bar`, { method: 'DELETE' });",
    want: 'red',
  },
  {
    name: '⚠️ 带插值段的路径（${providerId}）也要匹配上 ⇒ 没带凭据 ⇒ 红（不能被静默漏掉）',
    code: "const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);\nawait fetch(`${baseUrl}/models/providers/${providerId}/fetch-models`, { method: 'POST' });",
    want: 'red',
  },
  {
    name: '带插值段的路径 + 带 adminHeaders() ⇒ 绿',
    code: "const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);\nawait fetch(`${baseUrl}/models/providers/${providerId}/fetch-models`, { method: 'POST', headers: await adminHeaders() });",
    want: 'green',
  },
  {
    name: '端脑面 + base 来自 client（telencephalonClient.getBaseUrl()）⇒ 绿（闸认得这个形状）',
    code: "const API_BASE = telencephalonClient.getBaseUrl();\nawait fetch(\`\${API_BASE}/models/providers\`, { headers: await adminHeaders() });",
    want: 'green',
  },
  {
    name: '主人面（内部凭据）+ 客户端带 admin ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/api/telencephalon/chat/completions`, { method: 'POST', headers: await adminHeaders() });",
    want: 'green',
  },
  {
    // ⚠️ **这一条钉的是「共享实现比本地副本多出来的那一部分」** ——
    // 本地副本的 findAssignment **不认 TypeScript 类型注解** ⇒ ⇒ 这一条会红。
    name: '共享判据：TypeScript 类型注解的赋值也能追到凭据 ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nconst headers: Record<string, string> = await adminHeaders();\nawait fetch(`${API_BASE}/models/providers`, { headers });",
    want: 'green',
  },
  {
    // ⚠️ 本地副本**没有** credentialViaMutation ⇒ ⇒ 认不出「赋值之后才塞凭据」。
    name: '共享判据：赋值之后才被塞进凭据（SSE 形状）⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nconst headers = { 'Content-Type': 'application/json' };\nif (token) headers['X-Admin-Token'] = token;\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST', headers, body: '{}' });",
    want: 'green',
  },
  {
    // ⚠️ 本地副本**不认**「读门钥匙构建器」⇒ ⇒ 这一条会红。
    name: '共享判据：走读门钥匙构建器（readDoorHeaders）⇒ 绿（那道门认 shadow 或 admin）',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: await readDoorHeaders(k) });",
    want: 'green',
  },
];

function runSelfTest() {
  let failed = 0;

  // ⚠️ 判据源里的**测试段**必须被截掉 —— 测试夹具里的**假对端 router**
  // 也会写出同一个 `(方法, 路径)` ⇒ 混进表里 ⇒ ⇒ 同一个端点出现**两行、
  // 结论相反**（一行说「主人门」、一行说「没有门」）⇒ ⇒ 报告自相矛盾 ⇒ ⇒
  // 而且哪天有人真调它，那一发会被「（没有门）」那行**误判** ⇒ 潜伏的假红。
  {
    const synth = [
      'Router::new()',
      '    .route("/models/providers", get(list_providers).route_layer(read_door))',
      '#[cfg(test)]',
      'mod tests {',
      '    Router::new().route("/api/telencephalon/chat/completions", post(fake_proxy))',
      '}',
    ].join('\n');
    const cut = stripTestModule(synth);
    const t1 = !cut.includes('/api/telencephalon/chat/completions');
    if (!t1) failed++;
    console.log(`  ${t1 ? '✅' : '❌'} 判据源里测试段的假路由被截掉 ⇒ 期望 截掉，实测 ${t1 ? '截掉' : '还在'}`);
    const t2 = cut.includes('/models/providers');
    if (!t2) failed++;
    console.log(`  ${t2 ? '✅' : '❌'} 真路由还在 ⇒ 期望 还在，实测 ${t2 ? '还在' : '被截掉了'}`);
  }
  for (const c of SELF_TEST_CASES) {
    const code = stripComments(c.code, { nested: false });
    const idx = code.indexOf('fetch(');
    let got = 'none';
    if (idx !== -1) {
      const callText = extractCall(code, idx);
      const urlText = firstArg(callText);
      const p = clientPathPattern(urlText);
      const route = p ? matchRoute(SELF_TEST_SERVER, methodOf(callText), p) : null;
      if (route) {
        const { surface } = classifySurface(code, urlText);
        if (surface === 'NEURON') got = 'green';
        else if (surface === 'UNKNOWN') got = 'unknown';
        else if (!route.accepts) got = 'unknown';
        else got = canPassDoor(code, callText, route.accepts).ok ? 'green' : 'red';
      }
    }
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`  ${ok ? '✅' : '❌'} ${c.name} ⇒ 期望 ${c.want}，实测 ${got}`);
  }
  return failed;
}

/* ------------------------------------------------------------------ *
 * 5. 主流程
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  // `--telencephalon <path>`：把判据源指到别的 checkout
  // （反向验证时对着一个**历史 worktree** 跑）。
  const tIdx = args.indexOf('--telencephalon');
  if (tIdx !== -1 && args[tIdx + 1]) {
    TELENCEPHALON_DIR = resolve(process.cwd(), args[tIdx + 1]);
    TELENCEPHALON_SRC = resolve(TELENCEPHALON_DIR, 'src', 'api', 'providers.rs');
  }
  // `--desktop <path>`：把**被判定方**指到别的 checkout
  // （反向验证：对着「补头之前」的客户端跑 ⇒ 闸必须报红）。
  const dIdx = args.indexOf('--desktop');
  if (dIdx !== -1 && args[dIdx + 1]) {
    DESKTOP_SRC = resolve(process.cwd(), args[dIdx + 1]);
  }

  if (args.includes('--self-test')) {
    console.log('探测器自检 —— 判据本身会不会看错：');
    const failed = runSelfTest();
    if (failed > 0) {
      console.error(`\n❌ 自检没过（${failed} 条）⇒ 探测器坏了 ⇒ 退出码 2。`);
      return 2;
    }
    console.log('\n✅ 自检全过。');
    return 0;
  }
  let entries;
  try {
    entries = parseServerDoors();
  } catch (e) {
    console.error(`❌ 判据源不可用：${e.message}`);
    console.error('   ⇒ 「不知道」不等于「没问题」⇒ 退出码 2。');
    return 2;
  }
  const wiring = parseWiring();

  console.log('providers 门 —— 客户端凭据判定闸');
  console.log(`  判据源: ${relative(REPO, TELENCEPHALON_SRC).replace(/\\/g, '/')}`);
  console.log(`  门表（方法 + 路径 + 归哪道门，${entries.length} 条）：`);
  for (const e of entries) {
    const accepts = e.accepts ? e.accepts.join(' 或 ') : '认不出来';
    const door = e.door ? (DOOR_LABEL[e.door] ?? e.door) : '（没有门）';
    console.log(`    ${e.method.padEnd(6)} ${e.path.padEnd(44)} ${door} — 认 ${accepts}`);
  }
  console.log('');

  if (wiring.mounted === false) {
    console.error('  ⚠️⚠️⚠️ 这张面**现在没有门** —— ' + wiring.reason);
    console.error('     ⇒ 下面这份清单是「**门挂上之后**」会 401 的地方；');
    console.error('     ⇒ 而**现在**，这张面谁都能进（真机实测：读 200 / 写到了处理函数）。');
    console.error('');
  } else if (wiring.mounted === true) {
    console.log(`  ✅ 门**挂上了**：${wiring.reason}`);
  } else {
    console.log(`  ⚠️ 判不了门挂没挂：${wiring.reason}`);
  }
  console.log('');

  const desktop = scanClient(DESKTOP_SRC, entries);
  const concrete = entries.filter((r) => !r.path.includes('{')).map((r) => r.path);
  const mobileHits = scanMobile(MOBILE_LIB, concrete);

  console.log(`  桌面端: ${desktop.scanned} 个文件`);
  console.log(`    绿 ${desktop.green.length} / 红 ${desktop.red.length} / 判不了 ${desktop.unknown.length}`);
  console.log('');

  for (const h of desktop.green) {
    console.log(`  ✅ ${h.rel}:${h.line}  ${h.route}  — ${h.how}`);
  }
  for (const u of desktop.unknown) {
    console.log(`  ⚠️ ${u.rel}:${u.line}  ${u.route}  — 判不了：${u.why}`);
  }
  for (const r of desktop.red) {
    console.log(`  ❌ ${r.rel}:${r.line}  ${r.route}  — ${r.why}`);
    console.log(`       ⇒ 门一上，这一发就是 401。`);
  }
  console.log('');
  if (mobileHits.length > 0) {
    console.log(`  移动端也提到了这张面（${mobileHits.length} 处）—— 请人工确认：`);
    for (const m of mobileHits) console.log(`     ${m.rel}:${m.line}  ${m.route}`);
  } else {
    console.log('  移动端: 0 处调用这张面 ⇒ 这道门不会把手机锁在外面。');
  }
  console.log('');

  const bad = desktop.red.length + desktop.unknown.length;
  if (wiring.mounted === false) {
    console.error(`❌ 这张面还没挂门（${wiring.reason}）⇒ 门一上会有 ${bad} 处 401。`);
    return 1;
  }
  if (bad > 0) {
    console.error(`❌ ${bad} 处打这张面的请求没有这道门认的凭据 ⇒ 门一上就会 401。`);
    return 1;
  }
  console.log('✅ 每一处打这张面的请求都带了这道门认的凭据 ⇒ 门一上不会 401。');
  return 0;
}

process.exit(main());
