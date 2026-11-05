#!/usr/bin/env node
/**
 * 零信任面守门员 —— 「大脑那张面的第二个入口」不许悄悄变成「一个更开放的面」
 *
 * ## 这道闸守什么
 *
 * 大脑那张面现在有**两个**入口（2026-11-03）：
 *
 * | 面 | 承载 | 给谁 |
 * |---|---|---|
 * | 回环 TCP | 127.0.0.1 | 本机自用（端脑自环回）、桌面端前端、SSE / WebSocket |
 * | 零信任 | OpenZiti dark service | 局域网外的设备 |
 *
 * ⇒ ⇒ 零信任面用的是**同一张 router、同一扇门** ⇒ ⇒ 它不是「另一套接口」。
 *
 * ⚠️ **零信任不解决应用层授权** —— 「进了零信任网络」**不等于**「能读大脑」
 * ⇒ ⇒ 影子锁 / admin token 仍然是必须的。
 *
 * ## 十一条规则
 *
 *   1. **零信任的 serve 只允许有一处** —— 必须在 `encephalon/src/ziti.rs` 里。
 *      任何第二处 serve 都是**绕过那层闸**的入口 ⇒ ⇒ 「不支持的端点会挂到
 *      超时而不是明确失败」⇒ ⇒ 「失败长得像成功」。
 *   2. **spawn 路径必须经 `guard(`** —— 那层闸是「不支持 ⇒ 明确 501」。
 *   3. ★ **能力对账** —— 零信任面能扛哪些协议，取决于**承载实现**：
 *      - **服务端**开没开 `.with_upgrades()`（WebSocket 升级）
 *      - **客户端**有没有不缓冲的读取 API（SSE / 分块响应）
 *      ⇒ ⇒ 端脑的每个流式 / 升级端点，**按它需要的能力**对账：
 *      能力**缺** ⇒ ⇒ 它**必须**被列进「不支持清单」（否则它会挂到超时）；
 *      能力**在** ⇒ ⇒ 它**必须不在**清单里（否则清单已过期，在骗人）。
 *      ⇒ ⇒ **双向**才守得住 —— 只查一边就会出现「清单过期还说不可用」。
 *   4. ★ **移动端起零信任面必须「显式 + 唯一入口」** —— 旧规则是「移动端
 *      **不得**起零信任面」（理由：手机上没有 ziti 身份文件）⇒ ⇒ **场景三
 *      要求手机能发布大脑**（PC 反过来用手机的脑子，PC 功耗更高）⇒ ⇒ 旧规则
 *      已过时 ⇒ ⇒ 改成三条**形状**判据：自己不许 serve、必须有显式入口、
 *      不许读环境变量（Android 设不了环境变量，读了就是**假配置**）。
 *   5. **双面挂载不许只接一半** —— 独立服务器与桌面端**都**要接 ⇒ ⇒ 否则
 *      「哪些宿主有零信任面」就变成一件没人说得清的事。
 *   6. ★ **501 里的替代路径必须真的存在** —— 「这条端点不支持，请改走 X」
 *      如果 X 也不存在 ⇒ ⇒ 那是**死路建议** ⇒ ⇒ 调用方照样卡住 ⇒ ⇒
 *      「失败长得像成功」的近亲。⇒ ⇒ 而且替代路径**不能**是另一条
 *      不支持的端点（死路套死路）。
 *   7. ★ **客户端侧的承载能力** —— 「服务端准备好了、客户端接不上」
 *      是一族独立的失败：
 *      - 有没有 **WS over ziti 客户端**（服务端能接 WS，客户端接不上
 *        ⇒ ⇒ 那条通道还是死的）；
 *      - 有没有**本地零信任代理**（Dart / TypeScript 都没有 ziti SDK
 *        ⇒ ⇒ 代理是现有前端零改动走零信任网的唯一形态）；
 *      - 代理是不是**逐帧转发**（整体缓冲会把 SSE 压平）。
 *   8. ★ **客户端面必须被宿主接上** —— 上一轮最大的教训：客户端库
 *      写了却**零调用点** ⇒ ⇒ 「有能力」与「能用」之间隔着一次接线。
 *   9. ★ **客户端模式必须有承载级运行时实证** —— 只有编译级证据
 *      ⇒ ⇒ 「编得过」会被当成「跑得通」⇒ ⇒ 钉住那个**可注入上游的
 *      接缝** ＋ loopback 上真跑的那条测试。
 *  10. ★ **海马体远端必须有承载级运行时实证** —— 场景四「备用机用主力机的
 *      海马体」是分布式计算的地基 ⇒ ⇒ 四环都要在：规则住在**共享 crate**、
 *      端脑客户端**真的**走它、移动端有**显式**入口、有一条 loopback 上
 *      真跑的测试。
 *  11. ★ **叶区放置必须有承载级运行时实证** —— 「关掉本地叶区、用受信设备
 *      的同名叶区顶上」⇒ ⇒ 「dispatch 逻辑一行不用改」这件事，只有**真跑过
 *      一次**才算数。
 *
 * 用法：node scripts/check-ziti-face.mjs
 * 退出码：0 = 通过；1 = 有阻断问题；2 = 读不到源文件（**不是**通过）。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENCEPH = join(ROOT, '..', 'encephalon');
const TELENCEPH = join(ROOT, '..', 'telencephalon');
const SYNAPSE = join(ROOT, '..', 'synapse');
const DESKTOP_RS = join(ROOT, 'shadow-desktop', 'src-tauri', 'src');

const SKIP_DIRS = new Set(['node_modules', 'target', 'build', '.git', 'dist', 'Pods']);

/** 读不到就返回空串 —— 调用方要当「读不到」处理，不能当成「没有」。 */
function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(entry))) out.push(full);
  }
  return out;
}

// ── 纯函数（自检直接打它们） ────────────────────────────────────────────────

/**
 * 从一段 Rust 源码里抽出「路由路径 + 处理函数名」。
 *
 * ⚠️ **只能看见 `.route("…", handler(…))` 这种写法** —— `.nest(` 挂进去的
 * 子路由看不见 ⇒ ⇒ 这条规则是**下界**（漏检可能发生）⇒ ⇒ 端脑加流式端点时
 * **仍然要手工看一眼** `ziti.rs` 的清单。
 */
export function extractRoutes(content) {
  const rx = /\.route\(\s*"([^"]+)"\s*,\s*(?:post|get|put|delete|patch|any)\(\s*([A-Za-z0-9_:]+)/g;
  const out = [];
  let m;
  while ((m = rx.exec(content)) !== null) out.push({ path: m[1], handler: m[2] });
  return out;
}

/**
 * 这条路由是不是「流式 / 升级」端点。
 *
 * ⚠️ 判据是**形状**（路径带 `:stream` / 以 `/ws` 结尾，处理函数名带
 * `stream` / `_ws`）⇒ ⇒ 不是靠人肉清单 ⇒ ⇒ 端脑改了名字也不会漏。
 */
export function isStreamingRoute(r) {
  if (/:stream/.test(r.path)) return true;
  if (/(^|\/)ws$/.test(r.path)) return true;
  if (/stream/i.test(r.handler)) return true;
  if (/(^|_)ws(_|$)/.test(r.handler)) return true;
  return false;
}

/**
 * 从 `ziti.rs` 里抽出「不支持清单」。
 *
 * 返回 `null` = **读不到那份清单** ⇒ ⇒ 调用方要当**假红**处理（退出码 2），
 * 不能当成「清单是空的 ⇒ 没问题」。
 */
export function extractUnsupported(content) {
  const start = content.indexOf('pub const UNSUPPORTED');
  if (start < 0) return null;
  const end = content.indexOf('];', start);
  const block = content.slice(start, end < 0 ? undefined : end);
  const out = [];
  const rx = /pattern:\s*"([^"]+)"/g;
  let m;
  while ((m = rx.exec(block)) !== null) out.push(m[1]);
  return out;
}

/**
 * 从 `ziti.rs` 的清单里抽出「每条不支持端点声明了哪个替代路径」。
 *
 * 返回 `null` = **读不到那份清单** ⇒ ⇒ 退出码 2，不是「清单是空的」。
 *
 * ⚠️ `hasField` 与 `fallback` 是**两件事** —— `fallback: null` 有两种
 * 可能：「明写 None（无等价端点）」与「**根本没写这个字段**」⇒ ⇒ 后者
 * 是清单腐化 ⇒ ⇒ 必须能分开。
 */
export function extractFallbacks(content) {
  const start = content.indexOf('pub const UNSUPPORTED');
  if (start < 0) return null;
  const end = content.indexOf('];', start);
  const block = content.slice(start, end < 0 ? undefined : end);
  const out = [];
  for (const chunk of block.split('UnsupportedEndpoint {').slice(1)) {
    const p = /pattern:\s*"([^"]+)"/.exec(chunk);
    if (!p) continue;
    const hasField = /fallback_endpoint\s*:/.test(chunk);
    let fallback = null;
    if (hasField) {
      const s = /fallback_endpoint:\s*Some\("([^"]+)"\)/.exec(chunk);
      if (s) fallback = s[1];
    }
    out.push({ pattern: p[1], hasField, fallback });
  }
  return out;
}

/**
 * 路径归一化 —— `{id}` 与 `*` 视作同一段 ⇒ ⇒ 比的是**形状**不是字面。
 */
export function normPath(p) {
  return p
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((s) => (s === '*' || /^\{.*\}$/.test(s) ? '*' : s))
    .join('/');
}

/** 段级匹配 —— `*` 匹配**恰好一段**（与 Rust 侧 `matches_pattern` 同规则）。 */
export function patternMatches(pattern, path) {
  const p = pattern.replace(/^\/+|\/+$/g, '').split('/');
  const s = path.replace(/^\/+|\/+$/g, '').split('/');
  if (p.length !== s.length) return false;
  return p.every((seg, i) => seg === '*' || seg === s[i]);
}

/**
 * 这条路由需要哪种**承载能力**。
 *
 * ⚠️ 判据是**形状**（不是人肉清单）⇒ ⇒ 端脑改了名字也不会漏。
 *
 * - `websocket-upgrade` —— 路径以 `/ws` 结尾，**或**处理函数名是
 *   `*ws*`（`ws_handler`）⇒ ⇒ ⚠️ 注意 `/api/trace/stream` 的处理函数
 *   **也是** `ws_handler` ⇒ ⇒ 它是 **WS** 不是 SSE（别被路径里的
 *   "stream" 骗了）。
 * - `sse-streaming` —— 其余带 `stream` 的（路径 `:stream` 或函数名带 stream）。
 * - `null` —— 普通请求/响应型。
 */
export function classifyCapability(r) {
  if (/(^|\/)ws$/.test(r.path) || /(^|_)ws(_|$)/.test(r.handler)) {
    return 'websocket-upgrade';
  }
  if (/:stream/.test(r.path) || /stream/i.test(r.handler)) return 'sse-streaming';
  return null;
}

/**
 * 探测承载实现的**两个能力** —— 读 synapse 的源码。
 *
 * ⚠️ **这是形状判据**（grep 源码）⇒ ⇒ 脆 ⇒ ⇒ 所以它只用来**对账**，
 * 不用来断言「运行时一定如此」。
 */
export function readCapabilities(darkServiceSrc, httpClientSrc) {
  return {
    serverUpgrade: /\.with_upgrades\s*\(/.test(darkServiceSrc),
    clientStream: /fn request_over_stream|fn request_stream/.test(httpClientSrc),
  };
}

/**
 * 能力对账 —— 端脑的流式端点 vs 承载能力 vs 不支持清单。
 *
 * - `missing`：能力**缺**却没被列进清单 ⇒ ⇒ **阻断**（它会挂到超时）。
 * - `stale`：能力**在**却还被列着 ⇒ ⇒ **阻断**（清单过期，在骗人）。
 * - `ghosts`：清单里有端脑路由表**根本不存在**的路径 ⇒ ⇒ 只警告。
 */
export function auditCapabilities(routes, unsupported, caps) {
  const streaming = routes.filter((r) => classifyCapability(r) !== null);
  const missing = [];
  const stale = [];
  for (const r of streaming) {
    const cap = classifyCapability(r);
    const listed = unsupported.some((p) => patternMatches(p, r.path));
    const have = cap === 'websocket-upgrade' ? caps.serverUpgrade : caps.clientStream;
    if (!have && !listed) missing.push({ ...r, cap });
    if (have && listed) stale.push({ ...r, cap });
  }
  const ghosts = unsupported.filter((p) => !routes.some((r) => patternMatches(p, r.path)));
  return { streaming, missing, stale, ghosts };
}

/** 源码里 `ziti::serve(` 的调用点（行号 + 文件名）。 */
export function serveCallSites(file, content) {
  const out = [];
  content.split('\n').forEach((line, i) => {
    // ⚠️ `serve_with_ready` **也算** serve —— 它是同一个入口的「带就绪信号」
    // 那个形状（2026-11-05：`serve` 建好监听器后一直跑到永远 ⇒ ⇒ 拿不到
    // 「已经 bind 好了」的信号 ⇒ ⇒ 换成了 `serve_with_ready`）。
    if (/(?:transport::)?ziti::serve(?:_with_ready)?\s*\(/.test(line)) {
      out.push({ file, line: i + 1, text: line.trim() });
    }
  });
  return out;
}

/**
 * 零信任面**唯一**那处 serve 有没有过 `guard(`。
 *
 * ⚠️ **2026-11-04 改写** —— 原来只看 `spawn_if_configured` 的函数体
 * ⇒ ⇒ 而 serve 已被抽到 `spawn_with`（移动端也走它：Android 进程**设不了**
 * 环境变量 ⇒ ⇒ `ZITI_IDENTITY` 那条路在手机上根本走不通）⇒ ⇒ 判据必须
 * 跟着改 ⇒ ⇒ 否则「抽取」这件事本身会把闸变成恒绿。
 *
 * ⇒ ⇒ 现在的判据：**每一个**含 serve 调用的函数体里都必须有 `guard(`
 * ⇒ ⇒ 且至少要有**一处** serve（不然是「没有 serve」，不是「guard 用对了」）。
 */
export function spawnUsesGuard(content) {
  const lines = content.split('\n');
  let sawServe = false;
  for (let i = 0; i < lines.length; i++) {
    if (!/(?:transport::)?ziti::serve(?:_with_ready)?\s*\(/.test(lines[i])) continue;
    sawServe = true;
    // 往回找最近的函数头 —— serve 必须和 guard 在**同一个函数**里。
    let start = 0;
    for (let j = i; j >= 0; j--) {
      if (/^\s*(pub\s+)?(async\s+)?fn\s/.test(lines[j])) {
        start = j;
        break;
      }
    }
    const body = lines.slice(start, i + 1).join('\n');
    if (!/guard\s*\(/.test(body)) return false;
  }
  return sawServe;
}

/** 这段源码里有没有「起零信任面」的调用。 */
export function mentionsZitiSpawn(content) {
  // ⚠️ **两种起面的形状**（2026-11-05）——
  // ① 直接 spawn：`spawn_if_configured` / `spawn_with` / `serve`；
  // ② **造句柄 + start**：生产形态（独立端脑服务器）要把句柄塞进
  //    `/healthz` 那个状态 ⇒ ⇒ 所以它是「先造句柄、后起面」。
  //
  // ⇒ ⇒ 只认「造了句柄」**不够** —— 那可能是个从没被 `start` 的句柄
  // ⇒ ⇒ 所以「句柄」与「start」必须**同时**出现。
  const spawns =
    /ziti::spawn_if_configured/.test(content) ||
    /ziti::spawn_with/.test(content) ||
    /ziti::serve/.test(content);
  const handles =
    /ziti::ZitiFaceHandle/.test(content) && /\.start\s*\(/.test(content);
  return spawns || handles;
}

/**
 * 客户端侧的承载能力对账。
 *
 * ⚠️ **为什么要单开一条规则** —— R3 只管「零信任**面**能扛什么」（服务端）
 * ⇒ ⇒ 客户端这边**另有一副身板**：要把请求从本机搬进零信任网 ⇒ ⇒
 * **WebSocket 客户端**与**本地代理**缺一不可 ⇒ ⇒ 缺了就出现「服务端
 * 准备好了、客户端接不上」⇒ ⇒ 而那正是 ESP32 那条信令通道卡住的原因。
 *
 * ⚠️ 代理还必须**逐帧转发** ⇒ ⇒ 整体缓冲会把 SSE 压平 ⇒ ⇒ 那条判据
 * 不是「有没有代理」，而是「代理是不是在流式转发」。
 */
export function auditClientSide(parts) {
  const missing = [];
  const hasWsClient =
    /pub async fn connect_ws_over_stream/.test(parts.wsClientSrc || '') &&
    /client_async/.test(parts.wsClientSrc || '');
  if (!hasWsClient) missing.push('ws-client');

  const hasProxy =
    /pub fn proxy_router/.test(parts.proxySrc || '') &&
    /pub async fn spawn_proxy/.test(parts.proxySrc || '');
  if (!hasProxy) missing.push('local-proxy');

  const streams = /Body::from_stream/.test(parts.proxySrc || '');
  if (hasProxy && !streams) missing.push('proxy-streaming');

  const exported =
    /pub use ws_client::/.test(parts.modSrc || '') &&
    /pub use proxy::/.test(parts.modSrc || '');
  if (!exported) missing.push('exports');

  return { missing, hasWsClient, hasProxy, streams, exported };
}

/**
 * 客户端面有没有被宿主**真的**接上。
 *
 * ⚠️ **为什么要这条** —— 上一轮最大的教训：synapse 的 ziti 客户端写了，
 * 却**零调用点** ⇒ ⇒ 看起来「有能力」，实际没有任何东西在用 ⇒ ⇒
 * 「编译过」与「能用」之间隔着一次接线。
 */
export function auditClientHosts(parts) {
  const missing = [];
  if (!/ziti_client::/.test(parts.desktopSrc || '')) missing.push('桌面端');
  if (!/ziti_client::/.test(parts.mobileSrc || '')) missing.push('移动端');
  return missing;
}

/**
 * 客户端模式**有没有承载级运行时实证**。
 *
 * ⚠️ **为什么要这条** —— 客户端模式做出来的那一刻，它只有**编译级**
 * 证据 ⇒ ⇒ 「编得过」与「跑得通」还是两件事 ⇒ ⇒ 于是补了一个
 * **可注入上游的接缝**（`spawn_client_proxy_with`）＋ 一条在 loopback 上
 * 真跑的测试 ⇒ ⇒ 客户端模式第一次有了**运行时**读数。
 *
 * ⇒ ⇒ 这条闸把那个接缝钉住：**接缝没了** ⇒ ⇒ 客户端模式就退回成
 * 「只有编译级证据」⇒ ⇒ 而那正是上一轮客户端侧「零调用点」那一族的
 * 同一个坑（换个形状）。
 */
export function auditClientEvidence(parts) {
  const missing = [];
  const src = parts.clientSrc || '';
  const hasSeam = /pub async fn spawn_client_proxy_with/.test(src);
  if (!hasSeam) missing.push('runtime-seam');
  // ⚠️ 测试必须在接缝**之后** ⇒ ⇒ 否则那只是一段不相干的测试。
  const marker = src.indexOf('#[tokio::test]');
  const tail = marker >= 0 ? src.slice(marker) : '';
  const hasRuntimeTest = marker >= 0 && /spawn_client_proxy_with/.test(tail);
  if (hasSeam && !hasRuntimeTest) missing.push('runtime-test');
  return { missing, hasSeam, hasRuntimeTest };
}

/**
 * 海马体远放的**证据链** —— 四样都要在。
 *
 * ⚠️ **为什么要这条** —— 场景四「备用机用主力机的海马体」是分布式计算
 * 的地基 ⇒ ⇒ 光有 setter 不算数 ⇒ ⇒ 要是「备用机的记忆**静悄悄地**写进
 * 本机」⇒ ⇒ 记忆不一致**长得像成功**。
 *
 * ⇒ ⇒ 四环：① 规则住在**共享 crate**（一份优先级，谁也不许自己抄）
 * ② 端脑的客户端**真的**走那条规则 ③ 移动端有**显式**入口（Android 设不了
 * 环境变量）④ 有一条在 loopback 上真跑的测试。
 */
export function auditHippocampusRemote(parts) {
  const missing = [];
  if (!/pub fn set_base_url/.test(parts.targetSrc || '')) missing.push('shared-rule');
  if (!/hippo_target::resolve\(\)/.test(parts.storeSrc || '')) missing.push('client-uses-rule');
  if (!/hippocampus_base_url/.test(parts.mobileSrc || '')) missing.push('mobile-entry');
  const t = parts.testSrc || '';
  if (!(/set_base_url/.test(t) && /upsert_memory/.test(t) && /AtomicUsize/.test(t))) {
    missing.push('runtime-evidence');
  }
  return missing;
}

/**
 * 叶区放置的**证据链** —— 「关掉本地叶区、用受信设备的同名叶区顶上」。
 *
 * ⚠️ **为什么要这条** —— 「关掉本地叶区」的语义 = 从 native 注册表里
 * **拿不到**它 ⇒ ⇒ 现成的 HTTP A2A 回落自动接管 ⇒ ⇒ **dispatch 逻辑一行
 * 不用改** ⇒ ⇒ 但「不用改」这件事只有**真跑过一次**才算数 ⇒ ⇒ 否则
 * 「切远端」可能切了个寂寞（本地叶区还在，回落从来没被触发过）。
 */
export function auditLobePlacement(parts) {
  const missing = [];
  if (!/pub fn remote/.test(parts.placementSrc || '')) missing.push('placement-mode');
  if (!/placements/.test(parts.registrySrc || '')) missing.push('registry-table');
  if (!/a_lobe_placed_remotely_is_called_over_the_wire/.test(parts.routerSrc || '')) {
    missing.push('runtime-evidence');
  }
  return missing;
}

// ── 跑规则 ─────────────────────────────────────────────────────────────────

const findings = [];
const warnings = [];
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function findFiles() {
  const zitiRs = join(ENCEPH, 'src', 'ziti.rs');
  const endbrain = walk(join(TELENCEPH, 'src'), ['.rs']);
  const encephalon = walk(join(ENCEPH, 'src'), ['.rs']);
  const desktop = walk(DESKTOP_RS, ['.rs']);
  const mobile = encephalon.filter((p) => p.includes(join('src', 'mobile')));
  return { zitiRs, endbrain, encephalon, desktop, mobile };
}

function main() {
  const F = findFiles();

  // ⚠️ **读不到就是读不到** —— 不是「没问题」。⇒ ⇒ 退出码 2。
  if (!existsSync(F.zitiRs)) {
    console.error('✗ 读不到 ' + rel(F.zitiRs) + ' ⇒ 零信任面还没接（不是通过）');
    process.exit(2);
  }
  if (!existsSync(TELENCEPH)) {
    console.error('✗ 读不到兄弟仓 telencephalon ⇒ 无法核对端脑的流式端点（不是通过）');
    process.exit(2);
  }
  if (!existsSync(SYNAPSE)) {
    console.error('✗ 读不到兄弟仓 synapse ⇒ 无法核对零信任面的承载能力（不是通过）');
    process.exit(2);
  }

  const zitiContent = readFileSync(F.zitiRs, 'utf8');

  // ── 规则 1：serve 只有一处 ────────────────────────────────────────────
  const callSites = [];
  for (const p of [...F.encephalon, ...F.desktop]) {
    callSites.push(...serveCallSites(rel(p), readFileSync(p, 'utf8')));
  }
  const outside = callSites.filter((c) => c.file !== rel(F.zitiRs));
  if (outside.length > 0) {
    for (const c of outside) {
      findings.push({
        rule: 'R1',
        where: c.file + ':' + c.line,
        what: '这里直接 serve 了零信任面 ⇒ ⇒ **绕过了那层「不支持 ⇒ 501」的闸**',
        why: c.text,
      });
    }
  }

  // ── 规则 2：spawn 必须过 guard ────────────────────────────────────────
  if (!spawnUsesGuard(zitiContent)) {
    findings.push({
      rule: 'R2',
      where: rel(F.zitiRs),
      what: 'spawn_if_configured 没有经过 guard() ⇒ ⇒ 零信任面会把不支持的端点挂到超时',
      why: '「失败长得像成功」那一族',
    });
  }

  // ── 规则 3：能力对账（端脑的流式端点 ↔ 承载能力 ↔ 不支持清单）─────────
  const unsupported = extractUnsupported(zitiContent);
  if (unsupported === null) {
    findings.push({
      rule: 'R3',
      where: rel(F.zitiRs),
      what: '找不到 UNSUPPORTED 清单 ⇒ ⇒ 零信任面**没有**「不支持 ⇒ 501」那层闸',
      why: '清单被删了 / 改名了',
    });
  } else {
    const routes = F.endbrain.flatMap((p) => extractRoutes(readFileSync(p, 'utf8')));
    const caps = readCapabilities(
      readFileSync(join(SYNAPSE, 'src', 'transport', 'ziti', 'dark_service.rs'), 'utf8'),
      readFileSync(join(SYNAPSE, 'src', 'transport', 'ziti', 'http_client.rs'), 'utf8'),
    );
    const audit = auditCapabilities(routes, unsupported, caps);
    for (const m of audit.missing) {
      findings.push({
        rule: 'R3',
        where: rel(F.zitiRs),
        what:
          '端脑的 **' + m.path + '**（处理函数 ' + m.handler + '）需要「' + m.cap +
          '」能力，而承载实现**没有** ⇒ ⇒ 它没被列进不支持清单 ⇒ ⇒ 它会在零信任面上挂到超时',
        why: '客户端会以为「网络慢」⇒ ⇒ 真相是「这条端点根本不支持」',
      });
    }
    for (const s of audit.stale) {
      findings.push({
        rule: 'R3',
        where: rel(F.zitiRs),
        what:
          '端脑的 **' + s.path + '** 需要「' + s.cap + '」能力，而承载实现**已经有了** ⇒ ⇒ 它**不该**再被列进不支持清单',
        why: '清单已过期 ⇒ ⇒ 501 会**误伤**一条其实能用的端点',
      });
    }
    for (const g of audit.ghosts) {
      warnings.push({
        rule: 'R3',
        where: rel(F.zitiRs),
        what: '清单里的 **' + g + '** 在端脑路由表里找不到 ⇒ ⇒ 清单可能已腐化（端脑改了路由？）',
      });
    }
  }

  // ── 规则 6：501 的替代路径必须真的存在 ────────────────────────────────
  const fallbacks = extractFallbacks(zitiContent);
  if (fallbacks === null) {
    findings.push({
      rule: 'R6',
      where: rel(F.zitiRs),
      what: '读不出清单里的替代路径 ⇒ ⇒ 没法核对「501 指的路是不是死路」',
      why: '清单结构变了',
    });
  } else {
    const routes = F.endbrain.flatMap((p) => extractRoutes(readFileSync(p, 'utf8')));
    const routeSet = new Set(routes.map((r) => normPath(r.path)));
    for (const f of fallbacks) {
      if (!f.hasField) {
        findings.push({
          rule: 'R6',
          where: rel(F.zitiRs),
          what: '清单条目 **' + f.pattern + '** 没写 fallback_endpoint ⇒ ⇒ 没法保证 501 指的路存在',
          why: '每个条目都要么给替代路径，要么明说「无等价端点」',
        });
        continue;
      }
      if (!f.fallback) continue;
      if (!routeSet.has(normPath(f.fallback))) {
        findings.push({
          rule: 'R6',
          where: rel(F.zitiRs),
          what: '替代路径 **' + f.fallback + '** 在端脑路由表里**不存在** ⇒ ⇒ 501 指了条死路',
          why: '远端调用方拿到这个提示还是过不去',
        });
      }
      if (unsupported && unsupported.some((p) => patternMatches(p, f.fallback))) {
        findings.push({
          rule: 'R6',
          where: rel(F.zitiRs),
          what: '替代路径 **' + f.fallback + '** 自己也是零信任面不支持的端点 ⇒ ⇒ 死路套死路',
          why: '换个说法劝人走进同一条死路',
        });
      }
    }
  }

  // ── 规则 7：客户端侧的承载能力（WS 客户端 ＋ 本地代理 ＋ 逐帧转发）──
  const clientParts = {
    wsClientSrc: readIfExists(join(SYNAPSE, 'src', 'transport', 'ziti', 'ws_client.rs')),
    proxySrc: readIfExists(join(SYNAPSE, 'src', 'transport', 'ziti', 'proxy.rs')),
    modSrc: readIfExists(join(SYNAPSE, 'src', 'transport', 'ziti', 'mod.rs')),
  };
  if (!existsSync(join(SYNAPSE, 'src', 'transport', 'ziti', 'mod.rs'))) {
    findings.push({
      rule: 'R7',
      where: rel(join(SYNAPSE, 'src', 'transport', 'ziti', 'mod.rs')),
      what: '读不到 synapse 的 ziti 模块 ⇒ ⇒ 没法核对客户端侧的承载能力',
      why: '不是通过',
    });
  } else {
    const clientAudit = auditClientSide(clientParts);
    const clientWhy = {
      'ws-client': '客户端**没有** WebSocket over ziti ⇒ ⇒ 服务端能接 WS，客户端接不上 ⇒ ⇒ 那条通道还是死的',
      'local-proxy': '客户端**没有**本地零信任代理 ⇒ ⇒ 现有前端（fetch / package:http）一条都走不了零信任面',
      'proxy-streaming': '代理**没有**逐帧转发 ⇒ ⇒ SSE 会被压平成一整块 ⇒ ⇒ 对话流会「卡到最后一起到」',
      exports: '客户端能力**没有**从模块导出 ⇒ ⇒ 别的仓够不着 ⇒ ⇒ 等于没写',
    };
    for (const m of clientAudit.missing) {
      findings.push({
        rule: 'R7',
        where: rel(join(SYNAPSE, 'src', 'transport', 'ziti')),
        what: clientWhy[m] || '客户端侧能力缺失',
        why: '「服务端准备好了、客户端接不上」那一族',
      });
    }
  }

  // ── 规则 8：客户端面必须被宿主接上（不许是死代码）──────────────────────
  const missingHosts = auditClientHosts({
    desktopSrc: readIfExists(join(DESKTOP_RS, 'telencephalon_http.rs')),
    mobileSrc: F.mobile.map((p) => readFileSync(p, 'utf8')).join('\n'),
  });
  for (const h of missingHosts) {
    findings.push({
      rule: 'R8',
      where: h,
      what: h + '**没有**接零信任客户端面 ⇒ ⇒ 客户端库是**死代码** ⇒ ⇒ 「有能力」与「能用」之间隔着一次接线',
      why: '上一轮最大的教训：ziti 客户端写了却零调用点',
    });
  }

  // ── 规则 9：客户端模式必须有承载级运行时实证 ───────────────────────────
  const evidenceAudit = auditClientEvidence({
    clientSrc: readIfExists(join(ENCEPH, 'src', 'ziti_client.rs')),
  });
  const evidenceWhy = {
    'runtime-seam': '客户端模式**没有**可注入上游的接缝 ⇒ ⇒ 它只能等真网才验得了 ⇒ ⇒ 平时拿不到任何运行时读数',
    'runtime-test': '客户端模式**没有**承载级运行时实证（loopback 上真跑的那条）⇒ ⇒ 只有编译级证据 ⇒ ⇒ 「编得过」被当成了「跑得通」',
  };
  for (const m of evidenceAudit.missing) {
    findings.push({
      rule: 'R9',
      where: rel(join(ENCEPH, 'src', 'ziti_client.rs')),
      what: evidenceWhy[m] || '客户端模式的运行时实证缺失',
      why: '客户端那一侧上一轮就是「零调用点」的同族坑 —— 有代码 ≠ 能用',
    });
  }

  // ── 规则 4：移动端起零信任面必须「显式 + 唯一入口」 ────────────────────
  //
  // ⚠️ **2026-11-04 改写** —— 旧规则是「移动端**不得**起零信任面」，理由是
  // 「手机上没有 ziti 身份文件」⇒ ⇒ **场景三要求手机能发布大脑**（PC 反过来
  // 用手机的脑子，PC 功耗更高）⇒ ⇒ 旧规则已经**过时** ⇒ ⇒ 改成三条**形状**
  // 判据：
  //   (a) 移动端**不许自己** serve ⇒ ⇒ 必须请 `encephalon/src/ziti.rs` 那
  //       **唯一**一处 ⇒ ⇒ 否则「不支持 ⇒ 明确 501」那层闸在手机上会漏；
  //   (b) 必须有**显式**的配置入口（setter）⇒ ⇒ 「这台手机要不要网面」是
  //       **显式**决定，不是构建产物的副作用；
  //   (c) 移动端**不许**读 `ZITI_IDENTITY` 环境变量 ⇒ ⇒ Android 进程**设不了**
  //       环境变量 ⇒ ⇒ 那条路在手机上根本走不通 ⇒ ⇒ 读了就是**假配置**。
  const mobileSrcAll = F.mobile.map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const c of serveCallSites('移动端', mobileSrcAll)) {
    findings.push({
      rule: 'R4',
      where: '移动端:' + c.line,
      what: '移动端**自己** serve 了零信任面 ⇒ ⇒ 绕过了「不支持 ⇒ 明确 501」那层闸',
      why: c.text,
    });
  }
  if (!/set_ziti_server|set_server_options|setZitiServer/.test(mobileSrcAll)) {
    findings.push({
      rule: 'R4',
      where: rel(join(ENCEPH, 'src', 'mobile', 'mod.rs')),
      what: '移动端**没有**显式的零信任发布入口 ⇒ ⇒ 「这台手机要不要网面」成了构建产物的副作用',
      why: '场景三要求手机能发布大脑，但必须是显式决定',
    });
  }
  if (/ZITI_IDENTITY/.test(mobileSrcAll)) {
    findings.push({
      rule: 'R4',
      where: rel(join(ENCEPH, 'src', 'mobile', 'mod.rs')),
      what: '移动端读了 `ZITI_IDENTITY` 环境变量 ⇒ ⇒ Android 进程**设不了**环境变量 ⇒ ⇒ 那是**假配置**',
      why: '移动端只能走显式 setter',
    });
  }

  // ── 规则 10：海马体远端必须有承载级运行时实证 ────────────────────────
  const hippoAudit = auditHippocampusRemote({
    targetSrc: readIfExists(join(SYNAPSE, 'src', 'hippo_target.rs')),
    storeSrc: readIfExists(join(TELENCEPH, 'src', 'hippo_store.rs')),
    mobileSrc: readIfExists(join(ENCEPH, 'src', 'mobile', 'mod.rs')),
    testSrc: readIfExists(join(TELENCEPH, 'tests', 'hippo_remote_placement.rs')),
  });
  const hippoWhy = {
    'shared-rule': '「海马体在哪儿」这条规则**不在共享 crate** ⇒ ⇒ 端脑 / 前额叶 / 桌面端 / 移动端会各抄一份 ⇒ ⇒ 迟早跑偏',
    'client-uses-rule': '端脑的 hippo 客户端**没有**走那条统一规则 ⇒ ⇒ 显式覆盖对它无效 ⇒ ⇒ 「远端海马体」形同虚设',
    'mobile-entry': '移动端**没有**显式的海马体地址入口 ⇒ ⇒ Android 设不了环境变量 ⇒ ⇒ 手机**只能**用本机海马体 ⇒ ⇒ 场景四做不到',
    'runtime-evidence': '海马体远端**没有**承载级运行时实证 ⇒ ⇒ 只有编译级证据 ⇒ ⇒ 「备用机的记忆静悄悄地写进本机」长得像成功',
  };
  for (const m of hippoAudit) {
    findings.push({
      rule: 'R10',
      where: rel(join(TELENCEPH, 'src', 'hippo_store.rs')),
      what: hippoWhy[m] || '海马体远端的证据链缺一环',
      why: '场景四「备用机用主力机的海马体」是分布式计算的地基',
    });
  }

  // ── 规则 11：叶区放置必须有承载级运行时实证 ──────────────────────────
  const lobeAudit = auditLobePlacement({
    placementSrc: readIfExists(join(TELENCEPH, 'src', 'lobe_placement.rs')),
    registrySrc: readIfExists(join(TELENCEPH, 'src', 'lobes', 'mod.rs')),
    routerSrc: readIfExists(join(TELENCEPH, 'src', 'a2a', 'skill_router.rs')),
  });
  const lobeWhy = {
    'placement-mode': '叶区放置**没有**「远端」这一档 ⇒ ⇒ 「关掉本地叶区、用别的设备的同名叶区顶上」无路可走',
    'registry-table': 'native 注册表**没有**放置表 ⇒ ⇒ 「本地还剩几个叶区」这个视图会被混掉',
    'runtime-evidence': '叶区放置**没有**承载级运行时实证 ⇒ ⇒ 「切远端」可能切了个寂寞（回落从没被触发过）',
  };
  for (const m of lobeAudit) {
    findings.push({
      rule: 'R11',
      where: rel(join(TELENCEPH, 'src', 'lobe_placement.rs')),
      what: lobeWhy[m] || '叶区放置的证据链缺一环',
      why: '「dispatch 逻辑一行不用改」只有真跑过一次才算数',
    });
  }

  // ── 规则 5：双面挂载不许只接一半 ───────────────────────────────────────
  const hosts = [
    { file: join(ENCEPH, 'src', 'a2a_server.rs'), label: '独立服务器' },
    { file: join(DESKTOP_RS, 'telencephalon_http.rs'), label: '桌面端' },
  ];
  for (const h of hosts) {
    if (!existsSync(h.file)) {
      warnings.push({ rule: 'R5', where: rel(h.file), what: h.label + '的源文件不在 ⇒ 没核对' });
      continue;
    }
    if (!mentionsZitiSpawn(readFileSync(h.file, 'utf8'))) {
      findings.push({
        rule: 'R5',
        where: rel(h.file),
        what: h.label + '**没有**起零信任面 ⇒ ⇒ 「双面挂载」只接了一半 ⇒ ⇒ 「哪些宿主有零信任面」没人说得清',
        why: '没配 ZITI_IDENTITY 时行为与今天一样；配了就该有',
      });
    }
  }
}

// ── 自检：证明这道闸**有分辨力**，不是恒绿 ─────────────────────────────────
if (process.argv.includes('--self-test')) {
  let fails = 0;
  const check = (name, cond) => {
    if (cond) {
      console.log('  ✓ ' + name);
    } else {
      console.error('  ✗ ' + name);
      fails++;
    }
  };

  const routes = [
    { path: '/shadow/v1/conversations/{id}/messages:stream', handler: 'send_message_stream' },
    { path: '/a2a', handler: 'a2ui_message_stream' },
    { path: '/api/trace/stream', handler: 'ws_handler' },
    { path: '/api/webrtc/{modality}/sessions/{session_id}/ws', handler: 'ws_handler' },
    { path: '/shadow/v1/conversations/{id}/messages', handler: 'send_message' },
    { path: '/api/telencephalon/status', handler: 'status' },
  ];
  const fullList = [
    '/shadow/v1/conversations/*/messages:stream',
    '/a2a',
    '/api/trace/stream',
    '/api/webrtc/*/sessions/*/ws',
  ];

  const capsAll = { serverUpgrade: true, clientStream: true };
  const capsNone = { serverUpgrade: false, clientStream: false };

  check('端脑的流式端点被全部认出（4 条）', auditCapabilities(routes, [], capsAll).streaming.length === 4);
  check('普通端点不算流式', classifyCapability({ path: '/shadow/v1/conversations/{id}/messages', handler: 'send_message' }) === null);
  check('能力齐 ⇒ 清单可以为空', auditCapabilities(routes, [], capsAll).missing.length === 0 && auditCapabilities(routes, [], capsAll).stale.length === 0);
  check('能力齐却还列着 ⇒ 判过期（反控）', auditCapabilities(routes, fullList, capsAll).stale.length === 4);
  check('能力缺却没列 ⇒ 判缺口（反控）', auditCapabilities(routes, [], capsNone).missing.length === 4);
  check('能力缺且列全了 ⇒ 没有缺口', auditCapabilities(routes, fullList, capsNone).missing.length === 0);
  check('/api/trace/stream 的处理函数是 ws ⇒ 判 WS 而不是 SSE', classifyCapability({ path: '/api/trace/stream', handler: 'ws_handler' }) === 'websocket-upgrade');
  check('/a2a ⇒ 判 SSE', classifyCapability({ path: '/a2a', handler: 'a2ui_message_stream' }) === 'sse-streaming');
  check('段级匹配：* 只吃一段', patternMatches('/a2a', '/a2a') && !patternMatches('/a2a', '/a2a/tasks/send'));
  check('段级匹配：{id} 对 *', patternMatches('/shadow/v1/conversations/*/messages:stream', '/shadow/v1/conversations/{id}/messages:stream'));
  check('清单里有端脑不存在的路径 ⇒ 只警告不阻断', auditCapabilities(routes, [...fullList, '/api/gone'], capsNone).ghosts.length === 1);
  check('能力探测：开了 with_upgrades ⇒ 认得', readCapabilities('conn.with_upgrades().await', '').serverUpgrade === true);
  check('能力探测：没开 ⇒ 认得（反控）', readCapabilities('serve_connection(io, service).await', '').serverUpgrade === false);
  check('能力探测：客户端流式 API 在 ⇒ 认得', readCapabilities('', 'pub async fn request_over_stream<S>(').clientStream === true);
  check('能力探测：客户端流式 API 不在 ⇒ 认得（反控）', readCapabilities('', 'pub async fn request(').clientStream === false);

  const zitiSample = [
    'pub const UNSUPPORTED: &[UnsupportedEndpoint] = &[',
    '    UnsupportedEndpoint {',
    '        pattern: "/a2a",',
    '        kind: "sse",',
    '    },',
    '];',
  ].join('\n');
  check('能从 ziti.rs 里抽出清单', JSON.stringify(extractUnsupported(zitiSample)) === JSON.stringify(['/a2a']));
  check('抽不到清单 ⇒ 返回 null（不是空数组）', extractUnsupported('fn nothing() {}') === null);
  // ⚠️ **样例跟着新判据改** —— 判据现在要求「文件里有 serve，且 serve 所在
  // 函数套了 guard」⇒ ⇒ 只写 `guard(` 而没有 serve 那不算数。
  check(
    'spawn 走 guard ⇒ 判绿',
    spawnUsesGuard(
      ['pub fn spawn_with(r: axum::Router) {', '  let r = guard(r);', '  ziti::serve(r, a, b).await', '}'].join('\n'),
    ),
  );
  check(
    'spawn 没过 guard ⇒ 判红',
    !spawnUsesGuard(
      ['pub fn spawn_with(r: axum::Router) {', '  let r = r;', '  ziti::serve(r, a, b).await', '}'].join('\n'),
    ),
  );
  check('serve 调用点被认出', serveCallSites('a.rs', 'synapse::transport::ziti::serve(router, a, b)').length === 1);
  check('普通调用不算 serve', serveCallSites('a.rs', 'foo::serve(router)').length === 0);
  // ⚠️ **`serve_with_ready` 也是 serve**（2026-11-05）—— 它是同一个入口的
  // 「带就绪信号」那个形状 ⇒ ⇒ 判据不认它 ⇒ ⇒ 「唯一 serve 入口」会变成
  // 「零个 serve 入口」⇒ ⇒ 而那不是「通过」，是「看不见」。
  check(
    'serve_with_ready 也算 serve 调用点',
    serveCallSites('a.rs', 'synapse::transport::ziti::serve_with_ready(router, a, b, c)').length === 1,
  );
  check(
    'serve_with_ready 走 guard ⇒ 判绿',
    spawnUsesGuard(
      [
        'pub fn start(&self, router: axum::Router) {',
        '  let router = guard(router);',
        '  ziti::serve_with_ready(router, a, b, c).await',
        '}',
      ].join('\n'),
    ),
  );
  check(
    'serve_with_ready 没过 guard ⇒ 判红（反控）',
    !spawnUsesGuard(
      [
        'pub fn start(&self, router: axum::Router) {',
        '  let router = router;',
        '  ziti::serve_with_ready(router, a, b, c).await',
        '}',
      ].join('\n'),
    ),
  );
  // ⚠️ **宿主侧的新形状** —— 「造句柄 + start」也是起面。
  check(
    '宿主：造句柄 + start ⇒ 认得它起了零信任面',
    mentionsZitiSpawn(
      ['let face = ziti::ZitiFaceHandle::new(&opts);', 'face.start(app.clone());'].join('\n'),
    ),
  );
  check(
    '宿主：只造句柄、从不 start ⇒ 判红（反控）',
    !mentionsZitiSpawn('let face = ziti::ZitiFaceHandle::new(&opts);'),
  );
  check(
    '宿主：spawn_if_configured ⇒ 认得',
    mentionsZitiSpawn('ziti::spawn_if_configured(router);'),
  );

  // ⚠️ 替代路径这一族 —— 「501 指的路」是不是真的存在。
  const fbSample = [
    'pub const UNSUPPORTED: &[UnsupportedEndpoint] = &[',
    '    UnsupportedEndpoint {',
    '        pattern: "/a2a",',
    '        kind: "sse",',
    '        fallback_endpoint: Some("/a2a/tasks/send"),',
    '    },',
    '    UnsupportedEndpoint {',
    '        pattern: "/api/trace/stream",',
    '        kind: "websocket",',
    '        fallback_endpoint: None,',
    '    },',
    '];',
  ].join('\n');
  const fbs = extractFallbacks(fbSample);
  check('能从清单里抽出替代路径', fbs.length === 2 && fbs[0].fallback === '/a2a/tasks/send');
  check('None 的替代路径读成 null（不是空串）', fbs[1].fallback === null);
  check('「明写 None」与「没写字段」能分开', fbs[1].hasField === true && extractFallbacks('pub const UNSUPPORTED: &[UnsupportedEndpoint] = &[ UnsupportedEndpoint { pattern: "/x" } ];')[0].hasField === false);
  check('路径归一化：{id} 与 * 等价', normPath('/shadow/v1/conversations/{id}/messages') === normPath('/shadow/v1/conversations/*/messages'));

  // ⚠️ 客户端侧这一族 —— 「服务端准备好了、客户端接不上」。
  const goodClient = {
    wsClientSrc: 'pub async fn connect_ws_over_stream<S>(...) { client_async(request, io) }',
    proxySrc:
      'pub fn proxy_router() {} pub async fn spawn_proxy() {} let s = Body::from_stream(stream);',
    modSrc: 'pub use ws_client::X; pub use proxy::Y;',
  };
  check(
    '客户端能力：WS 客户端 ＋ 本地代理 ＋ 逐帧转发 ＋ 导出 ⇒ 齐了',
    auditClientSide(goodClient).missing.length === 0,
  );
  check(
    '客户端能力：WS 客户端不在 ⇒ 判出来（反控）',
    auditClientSide({ ...goodClient, wsClientSrc: '' }).missing.includes('ws-client'),
  );
  check('客户端能力：本地代理在 ⇒ 认得', auditClientSide(goodClient).hasProxy === true);
  check(
    '客户端能力：本地代理不在 ⇒ 判出来（反控）',
    auditClientSide({ ...goodClient, proxySrc: '' }).missing.includes('local-proxy'),
  );
  check('客户端能力：代理逐帧转发 ⇒ 认得', auditClientSide(goodClient).streams === true);
  check(
    '客户端能力：代理整体缓冲 ⇒ 判出来（反控）',
    auditClientSide({
      ...goodClient,
      proxySrc: 'pub fn proxy_router() {} pub async fn spawn_proxy() {}',
    }).missing.includes('proxy-streaming'),
  );
  check('客户端能力：导出在 ⇒ 认得', auditClientSide(goodClient).exported === true);
  check(
    '客户端能力：导出不在 ⇒ 判出来（反控）',
    auditClientSide({ ...goodClient, modSrc: '' }).missing.includes('exports'),
  );
  check(
    '客户端宿主：两个都接 ⇒ 没有漏',
    auditClientHosts({ desktopSrc: 'ziti_client::x', mobileSrc: 'ziti_client::y' }).length === 0,
  );
  check(
    '客户端宿主：桌面端没接 ⇒ 判出来（反控）',
    auditClientHosts({ desktopSrc: 'x', mobileSrc: 'ziti_client::y' }).includes('桌面端'),
  );
  check(
    '客户端宿主：移动端没接 ⇒ 判出来（反控）',
    auditClientHosts({ desktopSrc: 'ziti_client::x', mobileSrc: 'y' }).includes('移动端'),
  );

  // ⚠️ 客户端模式的运行时实证这一族 —— 「只有编译级证据」。
  const goodEvidence = {
    clientSrc: [
      'pub async fn spawn_client_proxy_with(connector: Connector, options: &ClientOptions) {}',
      '#[tokio::test]',
      'async fn x() { let _ = spawn_client_proxy_with(c, &o).await; }',
    ].join('\n'),
  };
  check(
    '客户端模式：接缝 ＋ 运行时实证 ⇒ 齐了',
    auditClientEvidence(goodEvidence).missing.length === 0,
  );
  check(
    '客户端模式：没有接缝 ⇒ 判出来（反控）',
    auditClientEvidence({ clientSrc: 'pub async fn spawn_client_proxy() {}' }).missing.includes('runtime-seam'),
  );
  check(
    '客户端模式：接缝在但没有运行时实证 ⇒ 判出来（反控）',
    auditClientEvidence({ clientSrc: 'pub async fn spawn_client_proxy_with() {}' }).missing.includes('runtime-test'),
  );

  // ⚠️ **R2 的新形状** —— serve 被抽到 `spawn_with` 之后，判据也得跟着改。
  check(
    'serve 与 guard 在同一个函数里 ⇒ 守得住（正控）',
    spawnUsesGuard(
      ['pub fn spawn_with(router: axum::Router) {', '  let r = guard(router);', '  ziti::serve(r, a, b).await', '}'].join('\n'),
    ),
  );
  check(
    'serve 在一个**没套** guard 的函数里 ⇒ 判出来（反控）',
    !spawnUsesGuard(
      ['pub fn spawn_with(router: axum::Router) {', '  ziti::serve(router, a, b).await', '}'].join('\n'),
    ),
  );
  check(
    '文件里一处 serve 都没有 ⇒ 那不是「guard 用对了」（反控）',
    !spawnUsesGuard('pub fn nothing() {}'),
  );

  // ⚠️ 海马体远放这一族 —— 「只有编译级证据」。
  const goodHippo = {
    targetSrc: 'pub fn set_base_url(url: Option<String>) {}',
    storeSrc: 'synapse::hippo_target::resolve()',
    mobileSrc: 'pub fn encephalon_mobile_set_hippocampus_base_url(url: &str) -> i32 {}',
    testSrc: 'set_base_url ... upsert_memory ... AtomicUsize',
  };
  check('海马体远端：四环齐 ⇒ 不判红', auditHippocampusRemote(goodHippo).length === 0);
  check(
    '海马体远端：规则不在共享 crate ⇒ 判出来（反控）',
    auditHippocampusRemote({ ...goodHippo, targetSrc: 'x' }).includes('shared-rule'),
  );
  check(
    '海马体远端：客户端不走那条规则 ⇒ 判出来（反控）',
    auditHippocampusRemote({ ...goodHippo, storeSrc: 'x' }).includes('client-uses-rule'),
  );
  check(
    '海马体远端：移动端没有显式入口 ⇒ 判出来（反控）',
    auditHippocampusRemote({ ...goodHippo, mobileSrc: 'x' }).includes('mobile-entry'),
  );
  check(
    '海马体远端：没有承载级实证 ⇒ 判出来（反控）',
    auditHippocampusRemote({ ...goodHippo, testSrc: 'x' }).includes('runtime-evidence'),
  );

  // ⚠️ 叶区放置这一族 —— 「切远端切了个寂寞」。
  const goodLobe = {
    placementSrc: 'pub fn remote(...) {}',
    registrySrc: 'placements',
    routerSrc: 'async fn a_lobe_placed_remotely_is_called_over_the_wire() {}',
  };
  check('叶区放置：三环齐 ⇒ 不判红', auditLobePlacement(goodLobe).length === 0);
  check(
    '叶区放置：没有远端这一档 ⇒ 判出来（反控）',
    auditLobePlacement({ ...goodLobe, placementSrc: 'x' }).includes('placement-mode'),
  );
  check(
    '叶区放置：没有承载级实证 ⇒ 判出来（反控）',
    auditLobePlacement({ ...goodLobe, routerSrc: 'x' }).includes('runtime-evidence'),
  );

  console.log('─'.repeat(72));
  if (fails === 0) {
    console.log('✓ 自检全绿（50 条）');
    process.exit(0);
  }
  console.error('✗ 自检 ' + fails + ' / 50 条红');
  process.exit(1);
}

main();

console.log('─'.repeat(72));
console.log('零信任面校验 —— 大脑那张面的第二个入口');
console.log('─'.repeat(72));
if (warnings.length > 0) {
  console.log('提醒（不阻断）：');
  for (const w of warnings) console.log('  · [' + w.rule + '] ' + w.where + ' ⇒ ' + w.what);
}
if (findings.length === 0) {
  console.log('  · 零信任面：serve 唯一 · 经 guard · 清单与承载能力对账一致');
  console.log('  · 移动端网面须显式 · 独立服务器与桌面端都接');
  console.log('  · 501 的替代路径都真的存在');
  console.log('  · 客户端：WS 客户端 ＋ 本地代理 ＋ 逐帧转发 · 桌面端与移动端都接');
  console.log('  · 客户端模式：接缝 ＋ 承载级运行时实证');
  console.log('  · 海马体远端：共享规则 ＋ 移动端入口 ＋ 承载级运行时实证');
  console.log('  · 叶区放置：远端这一档 ＋ 承载级运行时实证');
  console.log('─'.repeat(72));
  console.log('阻断 0 项');
  process.exit(0);
}
console.log('─'.repeat(72));
for (const f of findings) {
  console.log('  ✗ [' + f.rule + '] ' + f.where);
  console.log('      ' + f.what);
  console.log('      ⇒ ' + f.why);
}
console.log('─'.repeat(72));
console.log('阻断 ' + findings.length + ' 项');
process.exit(1);
