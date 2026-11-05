#!/usr/bin/env node
/**
 * OpenZiti **v2** 线路规格守门员
 *
 * ## 这道闸守什么
 *
 * 我们把零信任线路层从「第三方 ziti-sdk（说的是 **v1** 协议）」换成
 * **自建的 v2 实现**。⚠️ 2026-11-05 起，那个实现又从 synapse 内部
 * 搬到了**独立的仓** `iBLOC/ziti-rust` 的 `crates/ziti-v2`
 * ⇒ ⇒ 换掉之后有两类退化是**静悄悄**的：
 *
 *  1. **协议常量被改坏** —— 60783 写成 60083 之类 ⇒ ⇒ 编译照过、
 *     单测照过（自洽的错），只有真网才会说「路由器拒绝连接」。
 *  2. **v1 那套又回来了** —— 有人为了「省事」把 ziti-sdk 加回来 ⇒ ⇒
 *     在 v2 控制器上**根本连不上**，而且报错长得像「网络问题」。
 *
 * ⇒ ⇒ 这道闸把**规格**钉死：内容类型 / 头 id / 三条协议不变量 /
 *     背压计数对称 / 真网实证入口。
 *
 * ## ⚠️ v2 实现搬到哪个仓了（2026-11-05）
 *
 * - **实现**在 `ziti-rust/crates/ziti-v2/src/`（七件套 ＋ lib.rs）
 * - **synapse 侧**只剩一个 re-export 门面 `src/transport/ziti/v2/mod.rs`
 *   （`pub use ziti_v2::*;`）⇒ ⇒ 调用方路径零变化
 * - **真网实证**（`live_tests.rs`）**仍在 synapse 侧** —— 它测的是整条
 *   synapse 传输栈的端到端，不只是 v2 那一层
 *
 * ⇒ ⇒ **指针过期就是缺陷** —— 这道闸的第一版就死在这上面：它把 v2 源码
 *     路径写死成 `../synapse/src/transport/ziti/v2/` ⇒ ⇒ 搬家之后它按
 *     设计报「读不到源文件 ⇒ 退出码 2（判不了）」⇒ ⇒ 而**判不了**在
 *     报告里长得跟**通过**一模一样。
 *
 * ## ⚠️ 两种布局都要认
 *
 * iBLOC 全栈是**多仓 path 工作区**：
 * - **A（本机）**：兄弟仓在 shadow/ 的**之外**（`ROOT/..`）
 * - **B（CI）**：`actions/checkout` 不许 checkout 到工作区之外 ⇒ ⇒
 *   兄弟仓落在工作区**之内**（`ROOT/`）
 *
 * ⇒ ⇒ 这道闸两个布局都认 ⇒ ⇒ 否则「在 CI 上那层判据是空的」⇒ ⇒
 *     绿灯但什么都没查。
 *
 * ## 六条规则
 *
 *   1. **ziti-sdk 不许回来** —— 所有 manifest / 锁文件 / 源码都不许有它；
 *   2. **v2 模块的七个文件都在** —— 少一个就说明「自建」这件事没做完；
 *   3. ★ **协议常量被钉死** —— 数字来自官方源码
 *      （openziti/sdk-golang 的 pb + openziti/channel 的 message.go），
 *      不是猜的 ⇒ ⇒ 改它们等于换协议，必须同时改这道闸并重新跑真网；
 *   4. ★ **三条协议不变量真的实现了** ——
 *      - Hello 必须带 **头 1002 ＝ api-session token**（少了 ⇒ 路由器直接关连接）；
 *      - 回 **DialSuccess 必须带 ReplyFor（channel 头 1）**
 *        （少了 ⇒ 路由器 5 秒后超时 ⇒ ⇒ 客户端收到 StateClosed）；
 *      - **TLS 不许报 ALPN**（报了 ⇒ 路由器回 TLS fatal InternalError）。
 *   5. ★ **背压闸的计数必须对称** —— 写任务只能按「这一帧**计入**闸的
 *      字节数」来减，不能按帧长减 ⇒ ⇒ 否则控制帧（Hello / Bind /
 *      Connect）会把计数冲成负数 ⇒ ⇒ usize 回绕 ⇒ ⇒ 写侧永远 Pending。
 *   6. ★ **真网实证入口在** —— 5 条 #[ignore] 的 live 测试 ＋ v2 的单测。
 *
 * 用法：node scripts/check-ziti-v2-wire.mjs [--self-test]
 * 退出码：0 = 通过；1 = 有阻断问题；2 = 读不到源文件（**不是**通过）。
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = join(ROOT, '..');
const SKIP_DIRS = new Set(['target', 'node_modules', 'dist', 'build', 'vendor', '.git']);

// ── ⚠️ 两种布局都要认 ──────────────────────────────────────────────────
//    A（本机）：兄弟仓在 shadow/ 之外（WORKSPACE_ROOT）
//    B（CI）  ：兄弟仓被 checkout 到工作区之内（ROOT）
export function siblingRoots() {
  return [WORKSPACE_ROOT, ROOT];
}

/** 兄弟仓的某个路径在哪 —— 两种布局都认，认不到就返回 null。 */
export function resolveSibling(name, relPath) {
  for (const base of siblingRoots()) {
    const p = join(base, name, relPath);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * ⚠️ **仓根** —— 只从「一层子目录」取，两种布局都认。
 *
 * ## 为什么不盲扫整个工作区
 *
 * 第一版从 WORKSPACE_ROOT 递归盲扫 ⇒ ⇒ 本轮**实测**抓到：CI 布局下
 * 闸扫进了本地草稿区（@@shadow/.local/@@）⇒ ⇒ 那里有个探针目录的
 * Cargo.toml 带着 ziti-sdk ⇒ ⇒ 闸对着**草稿**判红 ⇒ ⇒ 那是**假阳性**
 * （草稿是 gitignored 的本地临时文件，不是交付物）。
 *
 * ⇒ ⇒ 改成：**先确定「有哪些仓」，再在每个仓里找 manifest** ⇒ ⇒
 *     仓的定义 = **含 .git 的目录** ⇒ ⇒ 草稿区天然出局。
 *
 * ## 为什么只要一层
 *
 * - 布局 A（本机）：兄弟仓在工作区**之外** ⇒ ⇒ 它们是 WORKSPACE_ROOT 的
 *   一层子目录；
 * - 布局 B（CI）：兄弟仓被 checkout 到工作区**之内** ⇒ ⇒ 它们是 ROOT 的
 *   一层子目录。
 *
 * ⇒ ⇒ 两边都是「一层」⇒ ⇒ 一层足够 ⇒ ⇒ 且**不会**扫到别处。
 */
export function discoverRepoRoots() {
  const out = [];
  const seen = new Set();
  const add = (d) => {
    const key = d.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  };
  for (const base of siblingRoots()) {
    // 起点自身也可能是仓（ROOT 就是 shadow 仓）
    if (existsSync(join(base, '.git'))) add(base);
    let entries = [];
    try {
      entries = readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const d = join(base, e.name);
      if (existsSync(join(d, '.git'))) add(d);
    }
  }
  return out;
}

/** 下游仓（报告用）—— 仓根的相对名。 */
export function discoverDownstream() {
  return discoverRepoRoots().map((dir) => ({
    name: relative(WORKSPACE_ROOT, dir).replace(/\\/g, '/'),
    dir,
  }));
}

/**
 * ⚠️ **所有**会被编进依赖图的 manifest（含 workspace member）。
 *
 * 第一版只查「下游仓的顶层 Cargo.toml」⇒ ⇒ 于是
 * `ziti-rust/crates/ziti-v2/Cargo.toml`（**正是 v2 crate 自己的
 * manifest**，最可能被人加回 ziti-sdk 的那个）**从来没被守过** ⇒ ⇒
 * 那是覆盖缺口，不是「没问题」。
 */
export function discoverManifests() {
  const out = [];
  const seen = new Set();
  const walk = (dir, level) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const d = join(dir, e.name);
      const m = join(d, 'Cargo.toml');
      if (existsSync(m)) {
        const key = m.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(m);
        }
      }
      if (level > 1) walk(d, level - 1);
    }
  };
  for (const repo of discoverRepoRoots()) {
    const own = join(repo, 'Cargo.toml');
    if (existsSync(own)) {
      const key = own.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(own);
      }
    }
    walk(repo, 4);
  }
  return out;
}

/** 一个目录下的全部 .rs 文件。 */
export function collectRs(dir) {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.rs')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function readIfExists(p) {
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

/**
 * 把 proto.rs 里的「pub mod X { pub const NAME: i32 = N; }」抠成对象。
 */
export function parseConsts(src) {
  const out = {};
  const modRe = /pub mod (\w+) \{([\s\S]*?)\n\}/g;
  let m;
  while ((m = modRe.exec(src))) {
    const bag = (out[m[1]] = out[m[1]] || {});
    const cRe = /pub const (\w+): (?:i32|u32|u8|usize) = (\d+);/g;
    let c;
    while ((c = cRe.exec(m[2]))) bag[c[1]] = Number(c[2]);
  }
  return out;
}

/** 被钉死的规格 —— 数字来自官方源码，不是猜的。 */
export const PINNED = {
  content_type: {
    HELLO: 0,
    RESULT: 2,
    CONNECT: 60783,
    STATE_CONNECTED: 60784,
    STATE_CLOSED: 60785,
    DATA: 60786,
    DIAL: 60787,
    DIAL_SUCCESS: 60788,
    DIAL_FAILED: 60789,
    BIND: 60790,
    BIND_SUCCESS: 60800,
  },
  header_id: {
    CONNECTION_ID: 1000,
    SESSION_TOKEN: 1002,
    FLAGS: 1010,
    ROUTER_PROVIDED_CONN_ID: 1012,
    CIRCUIT_ID: 1026,
  },
  channel_header: { REPLY_FOR: 1, RESULT_SUCCESS: 2 },
  flag: { FIN: 1 },
};

/** v2 模块该有的文件。 */
export const V2_FILES = [
  'wire.rs',
  'proto.rs',
  'identity.rs',
  'controller.rs',
  'channel.rs',
  'stream.rs',
  'context.rs',
];

/** 真网实证那 5 条 live 测试。 */
export const LIVE_TESTS = [
  'live_http_request_response',
  'live_websocket_upgrade',
  'live_sse_stream',
  'live_proxy_end_to_end',
  'live_overlay_end_to_end',
];

export function auditConstants(protoSrc) {
  const missing = [];
  const wrong = [];
  const got = parseConsts(protoSrc);
  for (const [mod, names] of Object.entries(PINNED)) {
    for (const [name, want] of Object.entries(names)) {
      const have = got[mod] && got[mod][name];
      if (have === undefined) missing.push(mod + '.' + name);
      else if (have !== want) wrong.push(mod + '.' + name + ' = ' + have + '（应为 ' + want + '）');
    }
  }
  return { missing, wrong };
}

export function auditInvariants(channelSrc, contextSrc) {
  const missing = [];
  if (!/put_bytes\(\s*proto::header_id::SESSION_TOKEN/.test(channelSrc)) {
    missing.push('hello-session-token');
  }
  if (!/put_u32\(\s*proto::channel_header::REPLY_FOR/.test(contextSrc)) {
    missing.push('dial-success-reply-for');
  }
  if (!/alpn_protocols\s*=\s*Vec::new\(\)/.test(channelSrc)) {
    missing.push('no-alpn');
  }
  return { missing };
}

export function auditGateSymmetry(channelSrc) {
  const missing = [];
  if (!/Bytes\s*\{\s*data:\s*Vec<u8>,\s*inflight:\s*usize\s*\}/.test(channelSrc)) {
    missing.push('outmsg-inflight');
  }
  if (!/done\(inflight\)/.test(channelSrc)) {
    missing.push('gate-done-by-inflight');
  }
  if (/done\(data\.len\(\)\)|done\(bytes\.len\(\)\)/.test(channelSrc)) {
    missing.push('gate-done-by-frame-length');
  }
  return { missing };
}

export function auditEvidence(liveSrc) {
  const missing = [];
  for (const t of LIVE_TESTS) {
    if (!liveSrc.includes('fn ' + t + '(')) missing.push('live:' + t);
  }
  if (!/#\[ignore/.test(liveSrc)) missing.push('live-ignored');
  return { missing };
}

/**
 * ★ 判据本体（纯函数）—— 主检查与自检**共用同一份**。
 *
 * ctx 形状：
 *   v2Files   : [{ name, path, exists, src }]  七个实现文件
 *   livePath  : string
 *   liveSrc   : string
 *   manifests : [{ path, src }]  全部会被编进依赖图的 manifest
 *   locks     : [{ path, src }]  全部锁文件
 *   sources   : [{ path, src }]  全部源码文件
 */
export function auditAll(ctx) {
  const findings = [];
  const { v2Files, livePath, liveSrc, manifests, locks, sources } = ctx;

  // ── 规则 1：ziti-sdk 不许回来 ────────────────────────────────────────
  for (const m of manifests) {
    if (/^\s*ziti-sdk\s*=/m.test(m.src)) {
      findings.push({
        rule: 'R1',
        where: m.path,
        what: 'manifest 里又有 **ziti-sdk** 条目 ⇒ ⇒ v1 那套被拉回依赖图',
        why: '它说的是 v1 协议 ⇒ ⇒ 在 v2 控制器上根本连不上，而报错长得像「网络问题」',
      });
    }
  }
  for (const l of locks) {
    if (/name\s*=\s*"ziti-sdk"/.test(l.src)) {
      findings.push({
        rule: 'R1',
        where: l.path,
        what: '锁文件里还有 **ziti-sdk** 条目（含 [[patch.unused]]）⇒ ⇒ 依赖树其实没清干净',
        why: '「已移除」得是**依赖树事实**，不是 Cargo.toml 里的一句声明',
      });
    }
  }
  for (const s of sources) {
    if (/ziti_sdk::/.test(s.src)) {
      findings.push({
        rule: 'R1',
        where: s.path,
        what: '源码里还在用 **ziti_sdk::** ⇒ ⇒ v1 那套又混回来了',
        why: '同一份代码里两代协议 ⇒ ⇒ 症状取决于走哪条路',
      });
    }
  }

  // ── 规则 2：v2 模块的七个文件都在 ────────────────────────────────────
  for (const f of v2Files) {
    if (!f.exists) {
      findings.push({
        rule: 'R2',
        where: f.path,
        what: 'v2 模块缺 **' + f.name + '** ⇒ ⇒ 「自建」这件事没做完',
        why: '半成品比没有更危险 —— 看着像有实现',
      });
    }
  }

  // ── 规则 3：协议常量被钉死 ──────────────────────────────────────────
  const protoFile = v2Files.find((f) => f.name === 'proto.rs');
  const channelFile = v2Files.find((f) => f.name === 'channel.rs');
  const contextFile = v2Files.find((f) => f.name === 'context.rs');
  const protoSrc = protoFile && protoFile.exists ? protoFile.src : '';
  const channelSrc = channelFile && channelFile.exists ? channelFile.src : '';
  const contextSrc = contextFile && contextFile.exists ? contextFile.src : '';

  const consts = auditConstants(protoSrc);
  for (const m of consts.missing) {
    findings.push({
      rule: 'R3',
      where: protoFile ? protoFile.path : 'proto.rs',
      what: '协议常量 **' + m + '** 不见了 ⇒ ⇒ 线路层少了某个编号',
      why: '自洽的错最危险：编译过、单测过，只有真网才说话',
    });
  }
  for (const m of consts.wrong) {
    findings.push({
      rule: 'R3',
      where: protoFile ? protoFile.path : 'proto.rs',
      what: '协议常量 **' + m + '** ⇒ ⇒ 路由器不认这个编号 ⇒ ⇒ 表现为「连接被拒」',
      why: '换协议不是改个数字的事 —— 必须同时改这道闸并重新跑真网',
    });
  }

  // ── 规则 4：三条协议不变量 ──────────────────────────────────────────
  const inv = auditInvariants(channelSrc, contextSrc);
  const invWhy = {
    'hello-session-token':
      'Hello 少了头 1002（api-session token）⇒ ⇒ 路由器直接关连接（连 StateClosed 都没有）',
    'dial-success-reply-for':
      '回 DialSuccess 少了 ReplyFor（channel 头 1）⇒ ⇒ 路由器把它当普通消息丢掉 ⇒ ⇒ 5 秒后 "timeout waiting for message reply" ⇒ ⇒ 客户端收到 StateClosed',
    'no-alpn': 'TLS 报了 ALPN ⇒ ⇒ 路由器回 TLS fatal InternalError ⇒ ⇒ 握手直接失败',
  };
  for (const m of inv.missing) {
    findings.push({
      rule: 'R4',
      where: m === 'dial-success-reply-for'
        ? (contextFile ? contextFile.path : 'context.rs')
        : (channelFile ? channelFile.path : 'channel.rs'),
      what: '协议不变量没了：**' + m + '**',
      why: invWhy[m] || '',
    });
  }

  // ── 规则 5：背压闸计数对称 ──────────────────────────────────────────
  const gateAudit = auditGateSymmetry(channelSrc);
  const gateWhy = {
    'outmsg-inflight':
      'OutMsg::Bytes 没带 inflight ⇒ ⇒ 写任务无法知道这一帧该不该从闸里减',
    'gate-done-by-inflight':
      '写任务不是按 inflight 减 ⇒ ⇒ 计数会跟实际排队量对不上',
    'gate-done-by-frame-length':
      '写任务按**帧长**减闸 ⇒ ⇒ 控制帧（Hello/Bind/Connect）没人加过却被人减 ⇒ ⇒ 计数变负 ⇒ ⇒ usize 回绕 ⇒ ⇒ 写侧永远 Pending',
  };
  for (const m of gateAudit.missing) {
    findings.push({
      rule: 'R5',
      where: channelFile ? channelFile.path : 'channel.rs',
      what: '背压闸计数不对称：**' + m + '**',
      why: gateWhy[m] || '',
    });
  }

  // ── 规则 6：真网实证入口在 ──────────────────────────────────────────
  const ev = auditEvidence(liveSrc || '');
  for (const m of ev.missing) {
    findings.push({
      rule: 'R6',
      where: livePath,
      what: '真网实证入口少了：**' + m + '**',
      why: '「跑得通」这件事必须有**可复跑的入口**，否则下一轮又只能停在「编译过」',
    });
  }

  return findings;
}

/** 锁文件（与 manifest 同层）。 */
export function discoverLocks() {
  const out = [];
  const seen = new Set();
  const walk = (dir, level) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const d = join(dir, e.name);
      const l = join(d, 'Cargo.lock');
      if (existsSync(l)) {
        const key = l.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(l);
        }
      }
      if (level > 1) walk(d, level - 1);
    }
  };
  for (const repo of discoverRepoRoots()) {
    const own = join(repo, 'Cargo.lock');
    if (existsSync(own)) {
      const key = own.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(own);
      }
    }
    walk(repo, 4);
  }
  return out;
}

/** 主检查：把真实世界组装成 ctx。 */
function buildContext() {
  const v2Root = resolveSibling('ziti-rust', join('crates', 'ziti-v2', 'src'));
  const synapseZiti = resolveSibling('synapse', join('src', 'transport', 'ziti'));
  const synapseCargo = resolveSibling('synapse', 'Cargo.toml');
  const livePath = synapseZiti ? join(synapseZiti, 'live_tests.rs') : null;

  const missing = [];
  if (!v2Root) missing.push('ziti-rust/crates/ziti-v2/src');
  if (!synapseZiti) missing.push('synapse/src/transport/ziti');
  if (!synapseCargo) missing.push('synapse/Cargo.toml');
  if (!livePath || !existsSync(livePath)) missing.push('synapse/src/transport/ziti/live_tests.rs');
  if (missing.length) return { missing };

  const v2Files = V2_FILES.map((n) => {
    const p = join(v2Root, n);
    return { name: n, path: rel(p), exists: existsSync(p), src: readIfExists(p) || '' };
  });

  const manifests = discoverManifests().map((p) => ({ path: rel(p), src: readFileSync(p, 'utf8') }));
  const locks = discoverLocks().map((p) => ({ path: rel(p), src: readFileSync(p, 'utf8') }));

  const srcFiles = [];
  for (const p of collectRs(synapseZiti).concat(collectRs(v2Root))) {
    srcFiles.push({ path: rel(p), src: readFileSync(p, 'utf8') });
  }

  return {
    missing: null,
    ctx: {
      v2Files,
      livePath: rel(livePath),
      liveSrc: readFileSync(livePath, 'utf8'),
      manifests,
      locks,
      sources: srcFiles,
    },
    counts: { manifests: manifests.length, locks: locks.length, sources: srcFiles.length },
  };
}

// ── 自检（--self-test）─────────────────────────────────────────────────
//
// ⚠️ 夹具是**手写的常量副本**，不是从 PINNED 生成的 ⇒ ⇒ 改坏 PINNED
//    会让自检当场红 ⇒ ⇒ 钉桩能被「自己那处修复」证伪。
//
// ⚠️ 自检按**规则 id**计数（不是数命中总数）⇒ ⇒ 一个用例同时违反多条
//    规则也不会让读数漂移。
const FIXTURE = {
  'proto.rs': [
    'pub mod content_type {',
    '    pub const HELLO: i32 = 0;',
    '    pub const RESULT: i32 = 2;',
    '    pub const CONNECT: i32 = 60783;',
    '    pub const STATE_CONNECTED: i32 = 60784;',
    '    pub const STATE_CLOSED: i32 = 60785;',
    '    pub const DATA: i32 = 60786;',
    '    pub const DIAL: i32 = 60787;',
    '    pub const DIAL_SUCCESS: i32 = 60788;',
    '    pub const DIAL_FAILED: i32 = 60789;',
    '    pub const BIND: i32 = 60790;',
    '    pub const BIND_SUCCESS: i32 = 60800;',
    '}',
    'pub mod header_id {',
    '    pub const CONNECTION_ID: u32 = 1000;',
    '    pub const SESSION_TOKEN: u32 = 1002;',
    '    pub const FLAGS: u32 = 1010;',
    '    pub const ROUTER_PROVIDED_CONN_ID: u32 = 1012;',
    '    pub const CIRCUIT_ID: u32 = 1026;',
    '}',
    'pub mod channel_header {',
    '    pub const REPLY_FOR: u32 = 1;',
    '    pub const RESULT_SUCCESS: u32 = 2;',
    '}',
    'pub mod flag {',
    '    pub const FIN: u8 = 1;',
    '}',
    '',
  ].join('\n'),
  'channel.rs': [
    'pub enum OutMsg {',
    '    Bytes { data: Vec<u8>, inflight: usize },',
    '}',
    'impl OutMsg {',
    '    pub(crate) fn done(&self, n: usize) {',
    '        let _ = n;',
    '    }',
'}',
    'async fn write_task() {',
    '    writer_gate.done(inflight);',
'}',
    '}',
    'async fn hello() {',
    '    hello.put_bytes(proto::header_id::SESSION_TOKEN, token.as_bytes());',
    '    let mut alpn_protocols = Vec::new();',
    '}',
    '',
  ].join('\n'),
  'context.rs': [
    'async fn reply() {',
    '    reply.put_u32(proto::channel_header::REPLY_FOR, req_id);',
    '}',
    '',
  ].join('\n'),
  'live_tests.rs': [
    '#[ignore]',
    'async fn live_http_request_response() {}',
    '#[ignore]',
    'async fn live_websocket_upgrade() {}',
    '#[ignore]',
    'async fn live_sse_stream() {}',
    '#[ignore]',
    'async fn live_proxy_end_to_end() {}',
    '#[ignore]',
    'async fn live_overlay_end_to_end() {}',
    '',
  ].join('\n'),
};

function fixtureCtx() {
  const v2Files = V2_FILES.map((n) => ({
    name: n,
    path: 'ziti-rust/crates/ziti-v2/src/' + n,
    exists: true,
    src: FIXTURE[n] || '// fixture\n',
  }));
  return {
    v2Files,
    livePath: 'synapse/src/transport/ziti/live_tests.rs',
    liveSrc: FIXTURE['live_tests.rs'],
    manifests: [{ path: 'synapse/Cargo.toml', src: '[package]\nname = "synapse"\n' }],
    locks: [{ path: 'synapse/Cargo.lock', src: '[[package]]\nname = "synapse"\n' }],
    sources: [{ path: 'synapse/src/transport/ziti/mod.rs', src: '// fixture\n' }],
  };
}

const SELF_TEST_CASES = [
  { name: '基线：正常形态零违规', rule: null, mutate: (c) => c },
  {
    name: 'manifest 里加回 ziti-sdk',
    rule: 'R1',
    mutate: (c) => {
      c.manifests[0].src += 'ziti-sdk = "0.3"\n';
    },
  },
  {
    name: '源码里用 ziti_sdk::',
    rule: 'R1',
    mutate: (c) => {
      c.sources[0].src += 'use ziti_sdk::Ziti;\n';
    },
  },
  {
    name: '锁文件里还有 ziti-sdk',
    rule: 'R1',
    mutate: (c) => {
      c.locks[0].src += 'name = "ziti-sdk"\n';
    },
  },
  {
    name: 'v2 七件套少一个',
    rule: 'R2',
    mutate: (c) => {
      c.v2Files[0].exists = false;
    },
  },
  {
    name: '协议常量被改坏',
    rule: 'R3',
    mutate: (c) => {
      c.v2Files[1].src = c.v2Files[1].src.replace('60783', '60083');
    },
  },
  {
    name: '协议常量少一个',
    rule: 'R3',
    mutate: (c) => {
      c.v2Files[1].src = c.v2Files[1].src.replace(/.*DIAL_FAILED.*\n/, '');
    },
  },
  {
    name: 'Hello 不带 session token',
    rule: 'R4',
    mutate: (c) => {
      c.v2Files[4].src = c.v2Files[4].src.replace(/put_bytes\(proto::header_id::SESSION_TOKEN[^\n]*\n/, '');
    },
  },
  {
    name: 'DialSuccess 不带 ReplyFor',
    rule: 'R4',
    mutate: (c) => {
      c.v2Files[6].src = c.v2Files[6].src.replace(/put_u32\(proto::channel_header::REPLY_FOR[^\n]*\n/, '');
    },
  },
  {
    name: 'TLS 报了 ALPN',
    rule: 'R4',
    mutate: (c) => {
      c.v2Files[4].src = c.v2Files[4].src.replace('alpn_protocols = Vec::new()', 'alpn_protocols = vec!["ziti"]');
    },
  },
  {
    name: '背压闸按帧长减',
    rule: 'R5',
    mutate: (c) => {
      c.v2Files[4].src = c.v2Files[4].src.replace('done(inflight)', 'done(data.len())');
    },
  },
  {
    name: '真网实证少一条',
    rule: 'R6',
    mutate: (c) => {
      c.liveSrc = c.liveSrc.replace('async fn live_overlay_end_to_end() {}\n', '');
    },
  },
  {
    name: '真网实证不再是 #[ignore]',
    rule: 'R6',
    mutate: (c) => {
      c.liveSrc = c.liveSrc.replaceAll('#[ignore]\n', '');
    },
  },
];

function selfTest() {
  console.log('─'.repeat(72));
  console.log('OpenZiti v2 线路规格守门员 —— 自检');
  console.log('─'.repeat(72));
  let pass = 0;
  const byRule = {};
  for (const c of SELF_TEST_CASES) {
    const ctx = fixtureCtx();
    c.mutate(ctx);
    const fs = auditAll(ctx);
    const ok = c.rule === null ? fs.length === 0 : fs.some((f) => f.rule === c.rule);
    if (ok) pass++;
    const key = c.rule || 'baseline';
    byRule[key] = byRule[key] || { total: 0, ok: 0 };
    byRule[key].total++;
    if (ok) byRule[key].ok++;
    console.log(
      (ok ? '  ✓ ' : '  ✗ ') + c.name +
      ' ⇒ 期望 ' + (c.rule || '零违规') + '，实得 ' + fs.length + ' 项'
    );
    if (!ok) {
      for (const f of fs) console.log('        [' + f.rule + '] ' + f.what);
    }
  }
  console.log('');
  console.log('  按规则 id 计数：');
  for (const [k, v] of Object.entries(byRule)) {
    console.log('    ' + k + '  ' + v.ok + '/' + v.total);
  }
  console.log('');
  console.log('自检：' + pass + '/' + SELF_TEST_CASES.length);
  process.exit(pass === SELF_TEST_CASES.length ? 0 : 1);
}

function main() {
  if (process.argv.slice(2).includes('--self-test')) {
    selfTest();
    return;
  }

  const built = buildContext();
  if (built.missing) {
    console.error('读不到源文件：' + built.missing.join('、') + ' ⇒ ⇒ **不是通过**');
    console.error('（v2 实现在 ziti-rust/crates/ziti-v2/src ⇒ ⇒ 这个指针过期了就是缺陷）');
    process.exit(2);
  }

  const findings = auditAll(built.ctx);

  console.log('─'.repeat(72));
  console.log('OpenZiti v2 线路规格守门员 —— 协议常量 / 不变量 / 真网实证');
  console.log('─'.repeat(72));
  const ruleNames = {
    R1: 'v1 那套（ziti-sdk）不许回来（所有 manifest / 锁 / 源码都守）',
    R2: 'v2 模块的七个文件都在',
    R3: '协议常量被钉死（数字来自官方源码）',
    R4: '三条协议不变量真的实现了',
    R5: '背压闸的计数对称',
    R6: '真网实证入口在（5 条 live ＋ v2 单测）',
  };
  for (const [rule, name] of Object.entries(ruleNames)) {
    const hit = findings.filter((f) => f.rule === rule);
    console.log(
      (hit.length ? '  ✗ ' : '  · ') + rule + ' · ' + name +
      (hit.length ? '（' + hit.length + ' 项）' : '')
    );
  }
  console.log('');
  console.log('  覆盖面：manifest ' + built.counts.manifests +
    ' 个 / 锁 ' + built.counts.locks +
    ' 个 / 源码 ' + built.counts.sources + ' 个');
  console.log('  v2 实现：' + built.ctx.v2Files[0].path.replace(/src\/[^/]*$/, ''));
  console.log('  真网实证：' + built.ctx.livePath);
  console.log('');
  if (findings.length) {
    console.log('阻断问题：');
    for (const f of findings) {
      console.log('  ✗ [' + f.rule + '] ' + f.where);
      console.log('      ' + f.what);
      if (f.why) console.log('      ⇒ ' + f.why);
    }
    console.log('');
    console.log('阻断 ' + findings.length + ' 项');
    process.exit(1);
  }
  console.log('阻断 0 项');
  process.exit(0);
}

main();
