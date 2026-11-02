#!/usr/bin/env node
/**
 * 公布地址静态闸 —— 抓「公布的地址不是真的」
 *
 * ## 为什么要有这个闸（2026-11-01）
 *
 * 「**监听哪儿**」与「**公布哪儿**」是**两件事**（synapse::net::bind 的
 * 两个槽）⇒ ⇒ 而**公布地址**这条线**一直没有闸** ⇒ ⇒ 它的规矩只能靠
 * **人记着** ⇒ ⇒ 记不住的那天就是「**注册成功、永远连不上**」
 * （失败长得像成功）。
 *
 * ⇒ 这台闸把那条线的规矩变成**机器可判**：
 *
 * ### R1 可连接性（位置无关）
 *
 * 源码里不许出现**主机是通配**的 URL 文本（http://0.0.0.0… /
 * http://[::]…）。
 *
 * ⇒ 0.0.0.0 / :: **不是一个可连接的地址** —— 它是「监听所有网卡」。
 * ⇒ 单机上碰巧能通（本机把 0.0.0.0 当回环）⇒ ⇒ 换台机器它指的是
 * **那台机器自己的回环** ⇒ ⇒ **注册成功、永远连不上**。
 *
 * ⇒ 位置无关：通配主机在**任何** URL 文本里都是错的（被公布出去 ⇒ 别人
 * 连不上；被当成连接目标 ⇒ 跨机失联）。
 *
 * ### R2 单一来源（发布体里不许手写端口）
 *
 * **发布体** = AgentCard / LobeRecord（这两个结构体就是「别人怎么连我」
 * 那个地址住的地方）+ 名字里带 card 的构造调用（build_card /
 * AgentCard::new / get_telencephalon_agent_card）。
 *
 * ⇒ 它们的 url 字段**不许**是**带字面端口**的手写地址 ⇒ ⇒ 端口必须来自
 * **真实监听**（resolve_public_http / public_url_for_base /
 * resolve_listen_and_public）。
 *
 * ⇒ 「写死端口」= 公布出去的地址与**实际监听的端口**各说各话 ⇒ ⇒ 别人
 * 照着它连 ⇒ ⇒ **连不上**（或者**连错人**）。
 *
 * ⚠️ **只认「发布体」**：客户端自己**要去连**的地址（hippocampus_url /
 * CORS 名单 / LLM 的 base_url / 客户端回退地址）**不是**公布地址 ⇒ ⇒
 * 判据越界就会变成噪音 ⇒ ⇒ 闸会被当成噪音关掉。
 *
 * ### R3 正向锚点（判据自己也要有牙齿）
 *
 * 已知的发布点必须**走共享解析器** ⇒ ⇒ 锚点对不上 ⇒ **判不了**（退出码 2）
 * ⇒ ⇒ 逼人重新转写，而不是让闸默默变成恒绿。
 *
 * ## 逃生阀
 *
 * 同一行（或上一行）写 `publish-address: <理由>` ⇒ 放行。
 * ⚠️ 逃生阀是**逃生阀**，不是「修好了」的证明 ⇒ 理由要写清楚。
 *
 * ## 防假绿
 *
 * * **一个文件都没读到 ⇒ 退出码 2**，不是 0。
 * * 探测器先跑 --self-test（10 只样本）⇒ 探测器坏了 ⇒ 退出码 2。
 * * 锚点对不上 ⇒ 退出码 2（**判不了**，不许当绿）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-publish-address.mjs
 * node scripts/check-publish-address.mjs --json
 * node scripts/check-publish-address.mjs --lobes
 * node scripts/check-publish-address.mjs --self-test
 * ```
 *
 * 退出码：0 = 没有问题；1 = 抓到了（每条带 file:line）；2 = 闸门自己坏了。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripComments,
  makeLineIndex,
  stripTestModules,
  matchDelim,
  skipString,
  skipCharOrLifetime,
} from './lib/strip-comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 逃生阀标记（同一行或上一行）。 */
const MARKER = 'publish-address:';

/** 发布体 —— 「别人怎么连我」这个地址住在这些结构体里。 */
const PUBLISH_STRUCTS = ['AgentCard', 'LobeRecord'];

/** 发布体里承载地址的字段名。 */
const PUBLISH_FIELDS = ['url', 'public_url', 'published_url', 'reachable_url', 'advertise_url'];

/** 通配主机 —— 「不是一个可连接的地址」。 */
const WIDE_HOSTS = new Set(['0.0.0.0', '::', '[::]']);

/** 叶区各仓（--lobes 那一档）。 */
const LOBE_REPOS = ['amygdala', 'temporal', 'occipital', 'parietal'];

/**
 * 正向锚点 —— 已知的发布点必须**走共享解析器**。
 *
 * ⚠️ 锚点对不上 ⇒ **判不了**（退出码 2）⇒ ⇒ 逼人重新转写。
 * ⇒ 锚点是「规则还在不在」的证据，**不是**「行为对不对」的证据
 * ⇒ ⇒ 行为由 Rust 侧的测试钉着（本仓只钉「规矩还在」）。
 */
const ANCHORS = [
  {
    repo: 'telencephalon',
    file: 'src/api/well_known_router.rs',
    must: 'resolve_public_http',
    why: '端脑 card 的公布地址必须走共享解析器（不许写死端口）',
  },
  {
    repo: 'telencephalon',
    file: 'src/registry/mod.rs',
    must: 'fn reachable_url',
    why: '「优先 public_url、没有才回落 url」这条解析规则（对外可达地址）',
  },
  {
    repo: 'synapse',
    file: 'src/lobe/encephalon_registration.rs',
    must: 'public_url_for_base',
    why: '叶区注册体的公布地址必须过共享解析器',
  },
  {
    repo: 'synapse',
    file: 'src/net/bind.rs',
    must: 'sanitize_public_url',
    why: '共享解析器本身（宽绑定 ⇒ 回环 ⇒ 可连接）',
  },
];

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    [
      '用法: node scripts/check-publish-address.mjs [选项]',
      '',
      '  --root <dir>        兄弟仓的父目录（默认 <repo>/..）',
      '  --source <dir>      端脑仓根目录（默认 <root>/telencephalon）',
      '  --shared <dir>      共享库 synapse 仓根目录（默认 <root>/synapse）',
      '  --lobes             额外扫**叶区**那一档（杏仁核/颞叶/枕叶/顶叶）',
      '  --lobes-root <dir>  叶区各仓的父目录（默认 <root>）',
      '  --json              输出 JSON',
      '  --self-test         只跑探测器自检',
      '  -h, --help          这段话',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = {
    root: resolve(REPO, '..'),
    source: null,
    shared: null,
    lobes: false,
    lobesRoot: null,
    json: false,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--root':
        opts.root = resolve(argv[++i]);
        break;
      case '--source':
        opts.source = resolve(argv[++i]);
        break;
      case '--shared':
        opts.shared = resolve(argv[++i]);
        break;
      case '--lobes':
        opts.lobes = true;
        break;
      case '--lobes-root':
        opts.lobesRoot = resolve(argv[++i]);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error('不认识的参数: ' + a);
        printHelp();
        process.exit(2);
    }
  }
  if (!opts.source) opts.source = join(opts.root, 'telencephalon');
  if (!opts.shared) opts.shared = join(opts.root, 'synapse');
  if (!opts.lobesRoot) opts.lobesRoot = opts.root;
  return opts;
}

// ---------------------------------------------------------------------------
// URL 文本
// ---------------------------------------------------------------------------

const URL_SCHEME_RE = /(?:https?|wss?):\/\//g;

/**
 * 解析「URL 文本」的主机与端口。
 *
 * ⚠️ 只认**文本形状** —— 它可以在 format! 里（http://{bind}）、
 * 也可以是普通字面量（http://localhost:60080）。
 */
function parseUrlAt(code, i) {
  const m = /^(https?|wss?):\/\/(\[[^\]]*\]|[^\/?#\s"``)\]]+)/.exec(code.slice(i));
  if (!m) return null;
  const authority = m[2];
  let host = authority;
  let port = null;
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close < 0) return null;
    host = authority.slice(0, close + 1);
    const after = authority.slice(close + 1);
    if (after.startsWith(':')) port = after.slice(1);
  } else {
    const idx = authority.lastIndexOf(':');
    if (idx >= 0) {
      host = authority.slice(0, idx);
      port = authority.slice(idx + 1);
    }
  }
  // ⚠️ 主机必须像个主机 ⇒ 否则那是**文案**（"use http://, https://, …"）。
  if (!/^[A-Za-z0-9{[]/.test(host)) return null;
  return { scheme: m[1], host, port, start: i, end: i + m[0].length };
}

/** 这一段文字里所有 URL 文本。 */
function urlTextsIn(code, start, end) {
  const out = [];
  URL_SCHEME_RE.lastIndex = start;
  let m;
  while ((m = URL_SCHEME_RE.exec(code)) !== null) {
    if (m.index >= end) break;
    const u = parseUrlAt(code, m.index);
    if (!u) continue;
    if (u.end > end) continue;
    out.push(u);
  }
  return out;
}

/** 端口是「写死」的？（字面数字 ⇒ 写死；{...} ⇒ 派生；null ⇒ 没有端口） */
function isLiteralPort(port) {
  return typeof port === 'string' && /^[0-9]+$/.test(port);
}

/** 主机是「纯占位符」？（{bind} 这种 ⇒ 派生） */
function isPlaceholderHost(host) {
  return /^\{[^{}]*\}$/.test(host);
}

// ---------------------------------------------------------------------------
// 探测器
// ---------------------------------------------------------------------------

/** 逃生阀：同一行或上一行写了理由 ⇒ 放行。 */
function escaped(origLines, line) {
  const here = origLines[line - 1] ?? '';
  const prev = origLines[line - 2] ?? '';
  return here.includes(MARKER) || prev.includes(MARKER);
}

/**
 * R1 —— 主机是通配的 URL 文本（位置无关）。
 */
function findWideHostUrls(code, lineOf, origLines) {
  const hits = [];
  URL_SCHEME_RE.lastIndex = 0;
  let m;
  while ((m = URL_SCHEME_RE.exec(code)) !== null) {
    const u = parseUrlAt(code, m.index);
    if (!u) continue;
    if (!WIDE_HOSTS.has(u.host)) continue;
    const line = lineOf(u.start);
    if (escaped(origLines, line)) continue;
    hits.push({
      kind: 'wide-host',
      what: 'URL 的主机是通配地址（' + u.host + ' 不是一个可连接的地址）',
      line,
      text: (origLines[line - 1] ?? '').trim().slice(0, 160),
    });
  }
  return hits;
}

/** 按顶层逗号切一段文字（括号/字符串里的逗号不算）。 */
function splitTopLevel(code, start, end) {
  const parts = [];
  let depth = 0;
  let segStart = start;
  let i = start;
  while (i < end) {
    const ch = code[i];
    if (ch === '"') { i = skipString(code, i); continue; }
    if (ch === "'") { i = skipCharOrLifetime(code, i); continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth += 1; i += 1; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; i += 1; continue; }
    if (ch === ',' && depth === 0) {
      parts.push([segStart, i]);
      segStart = i + 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  parts.push([segStart, end]);
  return parts;
}

/**
 * 在一段「发布体」里找出承载地址的片段。
 *
 * * 结构体字面量 ⇒ 取**顶层**那些地址字段的右值；
 * * 构造调用 ⇒ 取**全部实参**（位置参数 ⇒ 说不出第几个是 url）。
 */
function publishRegions(code, bodyStart, bodyEnd, isCall) {
  const regions = [];
  if (isCall) {
    for (const [s, e] of splitTopLevel(code, bodyStart, bodyEnd)) {
      if (e > s) regions.push({ field: '(实参)', start: s, end: e });
    }
    return regions;
  }
  let depth = 0;
  let i = bodyStart;
  while (i < bodyEnd) {
    const ch = code[i];
    if (ch === '"') { i = skipString(code, i); continue; }
    if (ch === "'") { i = skipCharOrLifetime(code, i); continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth += 1; i += 1; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; i += 1; continue; }
    if (depth === 0) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!:)/.exec(code.slice(i, bodyEnd));
      if (m && PUBLISH_FIELDS.includes(m[1])) {
        const rhsStart = i + m[0].length;
        const parts = splitTopLevel(code, rhsStart, bodyEnd);
        const rhsEnd = parts[0][1];
        regions.push({ field: m[1], start: rhsStart, end: rhsEnd });
        i = rhsEnd;
        continue;
      }
    }
    i += 1;
  }
  return regions;
}

/** 找出所有「发布体」。 */
function findPublishBodies(code) {
  const bodies = [];
  for (const name of PUBLISH_STRUCTS) {
    const re = new RegExp('\\b' + name + '\\s*\\{', 'g');
    let m;
    while ((m = re.exec(code)) !== null) {
      const open = code.indexOf('{', m.index);
      const close = matchDelim(code, open);
      if (close < 0) continue;
      bodies.push({ isCall: false, start: m.index, bodyStart: open + 1, bodyEnd: close });
    }
  }
  // 名字里带 card 的调用 ⇒ 构造卡片的地方（build_card / AgentCard::new …）。
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g;
  let m;
  while ((m = callRe.exec(code)) !== null) {
    if (!/card/i.test(m[1])) continue;
    const open = m.index + m[0].length - 1;
    const close = matchDelim(code, open);
    if (close < 0) continue;
    bodies.push({ isCall: true, start: m.index, bodyStart: open + 1, bodyEnd: close });
  }
  return bodies;
}

/** 找下一个**顶层**的某个字符（括号/字符串里的不算）。 */
function findTopLevel(code, start, end, target) {
  let depth = 0;
  let i = start;
  while (i < end) {
    const ch = code[i];
    if (ch === '"') { i = skipString(code, i); continue; }
    if (ch === "'") { i = skipCharOrLifetime(code, i); continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth += 1; i += 1; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; i += 1; continue; }
    if (ch === target && depth === 0) return i;
    i += 1;
  }
  return -1;
}

/**
 * 局部绑定表：let <name> = <expr>; ⇒ 表达式那一段。
 *
 * ⚠️ **为什么需要它**：发布体里的地址**常常不是字面量** ——
 * 形如 url: Some(placeholder_url.clone()) ⇒ ⇒ 那个手写地址在**别处**
 * ⇒ ⇒ 只看发布体那一行 ⇒ ⇒ **看不见**它 ⇒ ⇒ 闸会漏。
 */
function buildBindings(code) {
  const out = [];
  const re = /\blet\s+(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;]+)?=/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const exprStart = m.index + m[0].length;
    const semi = findTopLevel(code, exprStart, code.length, ';');
    const exprEnd = semi < 0 ? code.length : semi;
    out.push({ name: m[1], start: m.index, exprStart, exprEnd });
  }
  return out;
}

/** 最近一个**在前面**的同名绑定。 */
function resolveBinding(bindings, name, useOffset) {
  let best = null;
  for (const b of bindings) {
    if (b.name !== name) continue;
    if (b.start >= useOffset) continue;
    if (!best || b.start > best.start) best = b;
  }
  return best;
}

/**
 * 把一层层包装剥掉 ⇒ ⇒ 剩下的若**只**是一个标识符 ⇒ 那就是「这个值」。
 *
 * ⚠️ **为什么要剥包装**：发布体里那个字段常常是
 * Some(placeholder_url.clone()) / &url / Box::new(x) ⇒ ⇒
 * 值的**名字**裹在包装里 ⇒ ⇒ 不剥就找不到它。
 */
function valueIdentifierOf(expr) {
  let s = expr.trim();
  for (;;) {
    let m = /^(?:&|\*)\s*(.+)$/.exec(s);
    if (m) {
      s = m[1].trim();
      continue;
    }
    m = /^(?:Some|None|Box::new|Arc::new|Rc::new)\s*\((.*)\)$/.exec(s);
    if (m) {
      s = m[1].trim();
      continue;
    }
    m = /^(.*)\.(?:clone|to_owned|to_string|into|as_str|as_ref|as_deref)\s*\(\s*\)$/.exec(s);
    if (m) {
      s = m[1].trim();
      continue;
    }
    break;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : null;
}

/**
 * 一段文字里的 URL 文本 —— **顺着「值」追**（不是顺着每个标识符追）。
 *
 * ⚠️⚠️ **为什么必须顺着「值」追**：发布体里那个实参常是 &url ⇒ ⇒ 它的
 * 绑定是 format!("http://{}/api/a2a", bind_addr) ⇒ ⇒ bind_addr 是
 * **格式化参数**、不是那个公布的地址 ⇒ ⇒ 顺着**每个标识符**追 ⇒ ⇒ 会把
 * bind_addr 的绑定（里面恰好另有**一个** URL）也算成「公布的地址」
 * ⇒ ⇒ **假阳性**（实测：枕叶的 unwrap_or_else(|_| "http://localhost:8085")
 * 被算成了「公布地址」—— 它其实是**神经元服务**的地址）。
 *
 * ⇒ ⇒ 顺着「值」追：包装剥掉 ⇒ 剩下一个标识符 ⇒ 追它的绑定 ⇒ **不再往里
 * 追标识符** ⇒ ⇒ 格式化参数不会被误当成公布的地址。
 */
function publishedUrlsIn(code, bindings, region, depth, seen) {
  const out = [];
  for (const u of urlTextsIn(code, region.start, region.end)) out.push(u);
  if (depth <= 0) return out;
  const name = valueIdentifierOf(code.slice(region.start, region.end));
  if (!name || seen.has(name)) return out;
  const b = resolveBinding(bindings, name, region.start);
  if (!b) return out;
  seen.add(name);
  out.push(
    ...publishedUrlsIn(code, bindings, { start: b.exprStart, end: b.exprEnd }, depth - 1, seen),
  );
  return out;
}

/**
 * R2 —— 发布体里手写的地址（端口写死 / 主机写死且省略端口）。
 */
function findHandwrittenPublishedUrls(code, lineOf, origLines) {
  const hits = [];
  const seen = new Set();
  const bindings = buildBindings(code);
  for (const body of findPublishBodies(code)) {
    for (const region of publishRegions(code, body.bodyStart, body.bodyEnd, body.isCall)) {
      for (const u of publishedUrlsIn(code, bindings, region, 3, new Set())) {
        // 通配主机归 R1 管 ⇒ 别报两次。
        if (WIDE_HOSTS.has(u.host)) continue;
        let bad = null;
        if (isLiteralPort(u.port)) {
          bad = '端口写死（' + u.port + '）—— 端口必须来自**真实监听**';
        } else if (u.port === null && !isPlaceholderHost(u.host)) {
          bad = '主机写死且**没有端口**（会落到默认端口 80）';
        }
        if (!bad) continue;
        const line = lineOf(u.start);
        if (escaped(origLines, line)) continue;
        // ⚠️ 同一个手写地址被两个发布体引用（同一个字面量）⇒ 只报一次。
        const key = line + '|' + bad;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          kind: 'handwritten-published-url',
          what: '发布体（' + region.field + '）里手写了地址：' + bad,
          line,
          text: (origLines[line - 1] ?? '').trim().slice(0, 160),
        });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 扫盘
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'out',
  '.dart_tool',
  '.verify-wt',
  'Pods',
  'DerivedData',
  '__pycache__',
]);

function isSkippedDir(name) {
  return SKIP_DIRS.has(name) || name === 'target' || name.startsWith('target-');
}

function walkRust(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (isSkippedDir(e.name)) continue;
        stack.push(p);
      } else if (e.isFile() && p.endsWith('.rs')) {
        out.push(p);
      }
    }
  }
  return out;
}

function scanFile(absPath, label, displayRoot) {
  let raw;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch {
    return { scanned: 0, hits: [] };
  }
  // ⚠️ **测试模块不进产物** ⇒ 它里面的字面量不是「源码默认值」⇒ 抹掉再扫。
  const code = stripTestModules(stripComments(raw, { nested: true, rust: true }));
  const lineOf = makeLineIndex(code);
  const origLines = raw.split(/\r?\n/);
  const hits = [
    ...findWideHostUrls(code, lineOf, origLines),
    ...findHandwrittenPublishedUrls(code, lineOf, origLines),
  ].map((h) => ({
    ...h,
    file: label + '/' + relative(displayRoot, absPath).replace(/\\/g, '/'),
  }));
  return { scanned: 1, hits };
}

// ---------------------------------------------------------------------------
// 自检（防假绿）
// ---------------------------------------------------------------------------

function detectAll(src) {
  const code = stripTestModules(stripComments(src, { nested: true, rust: true }));
  const lineOf = makeLineIndex(code);
  const origLines = src.split(/\r?\n/);
  return [
    ...findWideHostUrls(code, lineOf, origLines),
    ...findHandwrittenPublishedUrls(code, lineOf, origLines),
  ];
}

function selfTest() {
  const cases = [
    {
      name: '发布体里写死端口（该抓到）',
      src: 'let card = AgentCard {\n    url: format!("http://{}.local:8082", name),\n};',
      expect: 1,
    },
    {
      // ⚠️ **这条钉的是「经变量流进来」那一支** —— 发布体里写的是变量名，
      // 那个手写地址在**别处** ⇒ ⇒ 只看发布体那一行 ⇒ ⇒ 闸会漏。
      name: '发布体里经变量流进来的手写地址（该抓到）',
      src: 'let placeholder_url = format!("http://{}.local:8082", name);\nlet record = LobeRecord { url: Some(placeholder_url.clone()) };',
      expect: 1,
    },
    {
      name: '通配主机当地址（该抓到）',
      src: 'let x = "http://0.0.0.0:9500";',
      expect: 1,
    },
    {
      // ⚠️⚠️ **这条钉的是「顺着每个标识符追」的假阳性**：发布体的实参是
      // 「变量」⇒ 那个变量的绑定里有个**格式化参数**指向**别的**地址
      // ⇒ ⇒ 顺着每个标识符追 ⇒ ⇒ 那个别的地址被算成了「公布的地址」。
      name: '发布体的值经格式化参数指向别的地址（不该抓）',
      src: 'let neuron_url = std::env::var("NEURON_URL").unwrap_or_else(|_| "http://localhost:8085".into());\nlet bind_addr = neuron_url;\nlet url = format!("http://{}/api/a2a", bind_addr);\nlet card = AgentCard::new("occipital", "desc", &url, "0.1.0");',
      expect: 0,
    },
    {
      // ⚠️ **这条钉的是判据原型踩过的坑**：客户端回退地址**不是**公布地址。
      name: '客户端回退地址（不该抓）',
      src: 'let telencephalon_base = telencephalon_public_url.unwrap_or("http://localhost:60080");',
      expect: 0,
    },
    {
      name: '注释里的写死端口（不该抓）',
      src: '// 以前是 url: format!("http://{}.local:8082", name)\nlet x = 1;',
      expect: 0,
    },
    {
      name: 'cfg(test) 里的发布体（不该抓）',
      src: '#[cfg(test)]\nmod tests {\n    fn t() {\n        let c = AgentCard { url: format!("http://{}.local:8082", name) };\n    }\n}\nlet x = 1;',
      expect: 0,
    },
    {
      name: '走共享解析器（不该抓）',
      src: 'let published_url = resolve_public_http(&config.telencephalon.bind, &name);',
      expect: 0,
    },
    {
      name: '发布体里派生地址（不该抓）',
      src: 'let card = AgentCard { url: format!("http://{bind}") };',
      expect: 0,
    },
    {
      name: '非发布体的字面端口（不该抓）',
      src: 'let origins = vec!["http://localhost:1420".to_string()];',
      expect: 0,
    },
    {
      name: '逃生阀（该放行）',
      src: 'let card = AgentCard { url: format!("http://{}.local:8082", name) }; // publish-address: 占位哨兵',
      expect: 0,
    },
    {
      name: '通配主机不在 URL 里（不该抓）',
      src: 'if host == "0.0.0.0" { warn!("wide"); }',
      expect: 0,
    },
  ];

  const failures = [];
  for (const c of cases) {
    const hits = detectAll(c.src);
    if (hits.length !== c.expect) {
      failures.push(
        '自检用例「' + c.name + '」：期望 ' + c.expect + ' 条，实际 ' + hits.length + ' 条',
      );
    }
  }
  return { failures, total: cases.length };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selfTest) {
    const { failures, total } = selfTest();
    if (failures.length) {
      console.error('❌ 探测器自检失败：');
      for (const f of failures) console.error('   - ' + f);
      process.exit(2);
    }
    console.log('✅ 探测器自检全过（' + total + ' 只样本）');
    process.exit(0);
  }

  // 探测器先自检 —— 探测器坏了 ⇒ 后面的一切结论都不成立。
  const { failures: stFailures } = selfTest();
  if (stFailures.length) {
    console.error('❌ 探测器自检失败 ⇒ 闸门自己坏了（退出码 2）');
    for (const f of stFailures) console.error('   - ' + f);
    process.exit(2);
  }

  const repos = [
    { label: 'telencephalon', root: opts.source },
    { label: 'synapse', root: opts.shared },
  ];
  if (opts.lobes) {
    for (const name of LOBE_REPOS) {
      repos.push({ label: name, root: join(opts.lobesRoot, name) });
    }
  }

  const hits = [];
  let scanned = 0;
  let lobeScanned = 0;
  const missing = [];
  const scannedRepos = [];

  for (const repo of repos) {
    const srcRoot = join(repo.root, 'src');
    if (!existsSync(srcRoot)) {
      missing.push(srcRoot);
      continue;
    }
    scannedRepos.push(repo);
    for (const f of walkRust(srcRoot)) {
      const r = scanFile(f, repo.label, repo.root);
      scanned += r.scanned;
      if (LOBE_REPOS.includes(repo.label)) lobeScanned += r.scanned;
      hits.push(...r.hits);
    }
  }

  // 防假绿：一个文件都没读到 ⇒ 不是「没问题」，是「闸门瞎了」。
  if (scanned === 0) {
    console.error('❌ 一个文件都没读到 ⇒ 闸门自己坏了（路径写错 / 仓库挪了家）');
    for (const m of missing) console.error('   缺失: ' + m);
    process.exit(2);
  }

  // 防假绿（叶区那一档）：端脑面读到了，不代表叶区读到了 ⇒ 分开算。
  if (opts.lobes && lobeScanned === 0) {
    console.error('❌ 显式要了 --lobes，却一个叶区文件都没读到 ⇒ 那一档闸门自己坏了');
    for (const m of missing) console.error('   缺失: ' + m);
    process.exit(2);
  }

  // R3 正向锚点 —— 锚点对不上 ⇒ **判不了**（不许当绿）。
  const anchorProblems = [];
  for (const a of ANCHORS) {
    const repo = scannedRepos.find((r) => r.label === a.repo);
    if (!repo) {
      anchorProblems.push(
        '仓「' + a.repo + '」没扫到 ⇒ 锚点无法核对（' + a.file + '：' + a.why + '）',
      );
      continue;
    }
    const p = join(repo.root, a.file);
    if (!existsSync(p)) {
      anchorProblems.push('文件不在：' + a.repo + '/' + a.file + '（' + a.why + '）');
      continue;
    }
    const text = readFileSync(p, 'utf8');
    if (!text.includes(a.must)) {
      anchorProblems.push(
        '锚点对不上：' + a.repo + '/' + a.file + ' 里没有「' + a.must + '」（' + a.why + '）',
      );
    }
  }
  if (anchorProblems.length) {
    console.error('❌ 正向锚点对不上 ⇒ **判不了**（退出码 2）—— 规矩可能被搬走了，请重新转写：');
    for (const m of anchorProblems) console.error('   - ' + m);
    process.exit(2);
  }

  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (opts.json) {
    console.log(
      JSON.stringify(
        { scanned, count: hits.length, hits },
        null,
        2,
      ),
    );
    process.exit(hits.length ? 1 : 0);
  }

  if (hits.length === 0) {
    console.log('✅ 公布地址：0 条（扫了 ' + scanned + ' 个 .rs 文件）');
    console.log('   公布地址的端口来自**真实监听**（共享解析器）⇒ 没有写死的端口。');
    console.log('   公布出去的地址里也没有通配主机 ⇒ 别人照着它连得上。');
    if (opts.lobes) {
      console.log('   叶区那一档也在内（--lobes）。');
    }
    process.exit(0);
  }

  console.error('❌ 公布地址这条线上有 ' + hits.length + ' 处（扫了 ' + scanned + ' 个 .rs 文件）：');
  for (const h of hits) {
    console.error('   ' + h.file + ':' + h.line + '  ' + h.what);
    console.error('      ' + h.text);
  }
  console.error('');
  console.error('   公布地址必须来自共享解析器（resolve_public_http / public_url_for_base /');
  console.error('   resolve_listen_and_public）⇒ ⇒ 端口来自**真实监听**，不会与实际脱节。');
  console.error('   确实需要留在源码里 ⇒ 同一行写 ' + MARKER + ' <理由>。');
  if (!opts.lobes) {
    console.error('   （叶区那一档默认不扫 ⇒ 要一起查请显式加 --lobes。）');
  }
  process.exit(1);
}

main();
