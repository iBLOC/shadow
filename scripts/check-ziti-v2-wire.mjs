#!/usr/bin/env node
/**
 * OpenZiti **v2** 线路规格守门员
 *
 * ## 这道闸守什么
 *
 * 我们把零信任线路层从「第三方 ziti-sdk（说的是 **v1** 协议）」换成
 * **自建的 v2 实现**（synapse/src/transport/ziti/v2/）。换掉之后有两类
 * 退化是**静悄悄**的：
 *
 *  1. **协议常量被改坏** —— 60783 写成 60083 之类 ⇒ ⇒ 编译照过、
 *     单测照过（自洽的错），只有真网才会说「路由器拒绝连接」。
 *  2. **v1 那套又回来了** —— 有人为了「省事」把 ziti-sdk 加回来 ⇒ ⇒
 *     在 v2 控制器上**根本连不上**，而且报错长得像「网络问题」。
 *
 * ⇒ ⇒ 这道闸把**规格**钉死：内容类型 / 头 id / 三条协议不变量 /
 *     背压计数对称 / 真网实证入口。
 *
 * ## 六条规则
 *
 *   1. **ziti-sdk 不许回来** —— Cargo.toml 与源码里都不许有它；
 *      **下游三棵树（telencephalon / encephalon / shadow-desktop）也守**：
 *      ① 它们的 [patch.crates-io] 里不许再有 ziti-sdk 条目
 *      （那是「把 v1 拉回依赖图」的入口）；
 *      ② 它们的 Cargo.lock 里不许再有 ziti-sdk 条目或 [[patch.unused]]
 *      （有 ⇒ ⇒ 「已移除」只是**声明**，依赖树其实没清干净）。
 *   2. **v2 模块的七个文件都在** —— 少一个就说明「自建」这件事没做完。
 *   3. ★ **协议常量被钉死** —— 数字来自官方源码
 *      （openziti/sdk-golang 的 pb + openziti/channel 的 message.go），
 *      不是猜的 ⇒ ⇒ 改它们等于换协议，必须同时改这道闸并重新跑真网。
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
 * 用法：node scripts/check-ziti-v2-wire.mjs
 * 退出码：0 = 通过；1 = 有阻断问题；2 = 读不到源文件（**不是**通过）。
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNAPSE = join(ROOT, '..', 'synapse');
const ZITI = join(SYNAPSE, 'src', 'transport', 'ziti');
const V2 = join(ZITI, 'v2');

// ⚠️ 下游树 —— synapse 移除 ziti-sdk 之后，这里是「v1 会不会回来」的
//    最后一道口子 ⇒ ⇒ 它们的 patch 条目与 Cargo.lock 都要守。
//
// ⚠️ 2026-11-04：这份清单原来**硬编码三棵树** ⇒ ⇒ 结果漏掉了
//    telencephalon-verify（第五棵）⇒ ⇒ 硬编码清单必然漏 ⇒ ⇒ 改成**自动发现**：
//    扫工作区根下三层，凡是有 Cargo.toml 的目录都算一棵下游树。
const WORKSPACE_ROOT = join(ROOT, '..');
const SKIP_DIRS = new Set(['target', 'node_modules', 'dist', 'build', 'vendor']);

export function discoverDownstream(root = WORKSPACE_ROOT, depth = 3) {
  const found = [];
  const scan = (dir, level) => {
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
      if (existsSync(join(d, 'Cargo.toml'))) {
        found.push({ name: relative(root, d).replace(/\\/g, '/'), dir: d });
      } else if (level > 1) {
        scan(d, level - 1);
      }
    }
  };
  scan(root, depth);
  return found;
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

function main() {
  const findings = [];
  const warnings = [];

  const protoPath = join(V2, 'proto.rs');
  const channelPath = join(V2, 'channel.rs');
  const contextPath = join(V2, 'context.rs');
  const livePath = join(ZITI, 'live_tests.rs');
  const cargoPath = join(SYNAPSE, 'Cargo.toml');

  for (const p of [protoPath, channelPath, contextPath, livePath, cargoPath]) {
    if (!existsSync(p)) {
      console.error('读不到源文件：' + rel(p) + ' ⇒ ⇒ **不是通过**');
      process.exit(2);
    }
  }

  const cargoSrc = readFileSync(cargoPath, 'utf8');
  const protoSrc = readFileSync(protoPath, 'utf8');
  const channelSrc = readFileSync(channelPath, 'utf8');
  const contextSrc = readFileSync(contextPath, 'utf8');
  const liveSrc = readFileSync(livePath, 'utf8');

  // ── 规则 1：ziti-sdk 不许回来 ──────────────────────────────────────────
  // ⚠️ 只看**真正的依赖项** —— 注释里提到 ziti-sdk 是允许的
  //    （那恰恰是「为什么不要它」的说明）。
  if (/^\s*ziti-sdk\s*=/m.test(cargoSrc)) {
    findings.push({
      rule: 'R1',
      where: rel(cargoPath),
      what: 'synapse 又依赖 **ziti-sdk** 了 ⇒ ⇒ 那套说的是 v1 协议 ⇒ ⇒ 在 v2 控制器上根本连不上',
      why: '报错会长得像「网络问题」，而不是「协议不对」',
    });
  }
  const scanFiles = V2_FILES.concat(['mod.rs', 'gateway.rs', 'listener.rs', 'connection_pool.rs', 'ws_client.rs']);
  for (const f of scanFiles) {
    const src = readIfExists(join(ZITI, f));
    if (src && /ziti_sdk::/.test(src)) {
      findings.push({
        rule: 'R1',
        where: rel(join(ZITI, f)),
        what: '源码里还在用 **ziti_sdk::** ⇒ ⇒ v1 那套又混回来了',
        why: '同一份代码里两代协议 ⇒ ⇒ 症状取决于走哪条路',
      });
    }
  }

  // ⚠️ 2026-11-04：下游三棵树也得守 ——
  //    ① [patch.crates-io] 里的 ziti-sdk 条目是「把 v1 拉回依赖图」的入口
  //       （真被拉回来时，crates.io 的 0.3.0 要求的 reqwest feature 已被删除
  //        ⇒ ⇒ 整个仓直接编不过）；
  //    ② Cargo.lock 里残留 ziti-sdk 条目或 [[patch.unused]]
  //       ⇒ ⇒ 说明「已经移除」只是**声明**，依赖树里其实还有。
  const downstream = discoverDownstream();
  for (const d of downstream) {
    const tomlPath = join(d.dir, 'Cargo.toml');
    const tomlSrc = readIfExists(tomlPath);
    if (tomlSrc && /^\s*ziti-sdk\s*=/m.test(tomlSrc)) {
      findings.push({
        rule: 'R1',
        where: rel(tomlPath),
        what: d.name + ' 的 Cargo.toml 里又有 **ziti-sdk** 条目 ⇒ ⇒ v1 那套被拉回依赖图',
        why: '没有 patch 时它会解析到 crates.io 的 0.3.0（要求已删除的 reqwest feature）⇒ ⇒ 整个仓编不过',
      });
    }
    const lockPath = join(d.dir, 'Cargo.lock');
    const lockSrc = readIfExists(lockPath);
    if (lockSrc && /name\s*=\s*"ziti-sdk"/.test(lockSrc)) {
      findings.push({
        rule: 'R1',
        where: rel(lockPath),
        what: d.name + ' 的 Cargo.lock 里还有 **ziti-sdk** 条目（含 [[patch.unused]]）⇒ ⇒ 依赖树其实没清干净',
        why: '「已移除」得是**依赖树事实**，不是 Cargo.toml 里的一句声明',
      });
    }
  }

  // ── 规则 2：v2 模块的七个文件都在 ─────────────────────────────────────
  for (const f of V2_FILES) {
    if (!existsSync(join(V2, f))) {
      findings.push({
        rule: 'R2',
        where: rel(join(V2, f)),
        what: 'v2 模块缺 **' + f + '** ⇒ ⇒ 「自建」这件事没做完',
        why: '半成品比没有更危险 —— 看着像有实现',
      });
    }
  }

  // ── 规则 3：协议常量被钉死 ────────────────────────────────────────────
  const consts = auditConstants(protoSrc);
  for (const m of consts.missing) {
    findings.push({
      rule: 'R3',
      where: rel(protoPath),
      what: '协议常量 **' + m + '** 不见了 ⇒ ⇒ 线路层少了某个编号',
      why: '自洽的错最危险：编译过、单测过，只有真网才说话',
    });
  }
  for (const m of consts.wrong) {
    findings.push({
      rule: 'R3',
      where: rel(protoPath),
      what: '协议常量 **' + m + '** ⇒ ⇒ 路由器不认这个编号 ⇒ ⇒ 表现为「连接被拒」',
      why: '换协议不是改个数字的事 —— 必须同时改这道闸并重新跑真网',
    });
  }

  // ── 规则 4：三条协议不变量 ────────────────────────────────────────────
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
      where: rel(m === 'dial-success-reply-for' ? contextPath : channelPath),
      what: '协议不变量没了：**' + m + '**',
      why: invWhy[m] || '',
    });
  }

  // ── 规则 5：背压闸计数对称 ────────────────────────────────────────────
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
      where: rel(channelPath),
      what: '背压闸计数不对称：**' + m + '**',
      why: gateWhy[m] || '',
    });
  }

  // ── 规则 6：真网实证入口在 ────────────────────────────────────────────
  const ev = auditEvidence(liveSrc);
  for (const m of ev.missing) {
    findings.push({
      rule: 'R6',
      where: rel(livePath),
      what: '真网实证入口少了：**' + m + '**',
      why: '「跑得通」这件事必须有**可复跑的入口**，否则下一轮又只能停在「编译过」',
    });
  }

  // ── 报告 ─────────────────────────────────────────────────────────────
  console.log('─'.repeat(72));
  console.log('OpenZiti v2 线路规格守门员 —— 协议常量 / 不变量 / 真网实证');
  console.log('─'.repeat(72));
  const ruleNames = {
    R1: 'v1 那套（ziti-sdk）不许回来（所有下游树都守）',
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
  if (warnings.length) {
    console.log('');
    console.log('提醒：');
    for (const w of warnings) console.log('  ! [' + w.rule + '] ' + w.what);
  }
  console.log('');
  console.log('  依赖树扫描：' + downstream.length + ' 棵下游树（自动发现）');
  for (const d of downstream) console.log('   · ' + d.name);
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
