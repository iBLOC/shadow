#!/usr/bin/env node
/**
 * 客户端调用点 ↔ 端脑路由 **对照表**的完整性闸。
 *
 * ## 为什么要有这个闸
 *
 * 端脑面上有 126 条路由；桌面端那个 PrefrontalClient 有 29 个调用点
 * （2026-11-01 实测）。两边**从来没有人对过账** ⇒ ⇒ 客户端打
 * /api/agents（端脑上是 /api/telencephalon/agents）这种事
 * ⇒ **没有任何机器会报错** ⇒ ⇒ 用户看到的是「功能坏了」。
 *
 * ⚠️ 这不是假设 —— 2026-11-01 实测：同一个客户端里，
 * 任务板打的 /hippocampus/api/tasks（**路径对得上** ⇒ 通的），
 * 而 agent 列表打的 /api/agents（**404**）⇒ ⇒ 一屏里一半能用一半不能用。
 *
 * ## 比什么
 *
 * - **客户端侧**：解析桌面端客户端文件里**真的**在发的请求（路径 + 方法）。
 * - **服务端侧**：端脑**实际合并进 router** 的那批路由（surfaceRoutes）
 *   ＋ 两张 outer 面（neuron 在根、hippocampus nest 在 /hippocampus）。
 * - **表侧**：scripts/client-endpoint-map.txt。
 *
 * ## 判定
 *
 * - **客户端有调用点、表里没登记** ⇒ 退出码 1（新调用点漏登记）。
 * - **表里有过期行**（客户端已经不打它了）⇒ 退出码 1（表不许过期）。
 * - **表里说服务端有、但服务端实际没有** ⇒ 退出码 1（端脑改了路由 ⇒ 表过期）。
 * - **表里标 missing、但服务端其实有同路径的路由** ⇒ 退出码 1（表说谎了）。
 * - **表里标 missing 且服务端确实没有** ⇒ 只报告，不失败
 *   （需要产品决定，不是机器能判的）。
 * - **防假绿**：客户端解析出 0 个调用点 ⇒ 退出码 2。
 *
 * ## 用法
 *
 *   node scripts/check-client-endpoint-map.mjs
 *   node scripts/check-client-endpoint-map.mjs --source C:\Projects\iBLOC\telencephalon
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceRoutes, routesIn } from './lib/telencephalon-routes.mjs';
// ⚠️ 路径归一化**共用一份**（scripts/lib/response-shape.mjs）⇒ ⇒ 别再各抄一份
//    —— 抄一份就会漂（两处对「什么算同一个路径」的判断一旦不同 ⇒ 表与闸各说各话）。
import { isIdentChar, normalizeClientPath, normalizeDartPath } from './lib/response-shape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MAP_PATH = join(HERE, 'client-endpoint-map.txt');
const BT = String.fromCharCode(96);
const D = '$';

/** 空白字符 / 裸标识符（两个小工具，顺带避开正则里的反斜杠）。 */
function isSpaceChar(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c === 32 || c === 9 || c === 10 || c === 13;
}
function isBareIdent(s) {
  if (!s) return false;
  const f = s.charCodeAt(0);
  if (!((f >= 97 && f <= 122) || (f >= 65 && f <= 90) || f === 95 || f === 36)) return false;
  for (let i = 1; i < s.length; i++) if (!isIdentChar(s[i])) return false;
  return true;
}

/**
 * 往前找 const/let/var <name> = <初始化表达式> ⇒ 返回初始化表达式的文本。
 *
 * ⚠️ 启发式：只看「文本上最后一次声明」，不判作用域
 * ⇒ ⇒ 同一个名字在两个函数里含义不同时会认错
 * ⇒ ⇒ 但本仓客户端里查询串变量只有一个名字（qs），不踩这个坑。
 */
function findDeclaration(text, name, before) {
  const limit = before < 0 ? text.length : before;
  let found = -1;
  let i = 0;
  const kws = ['const', 'let', 'var'];
  while (i < limit) {
    let matched = false;
    for (let ki = 0; ki < kws.length; ki++) {
      const kw = kws[ki];
      if (!text.startsWith(kw, i)) continue;
      if (isIdentChar(i > 0 ? text[i - 1] : ' ')) continue;
      let j = i + kw.length;
      while (j < limit && isSpaceChar(text[j])) j++;
      if (!text.startsWith(name, j)) continue;
      if (isIdentChar(text[j + name.length] || ' ')) continue;
      let k = j + name.length;
      while (k < limit && isSpaceChar(text[k])) k++;
      if (text[k] !== '=' || text[k + 1] === '=') continue;
      found = k + 1;
      matched = true;
      break;
    }
    if (matched) { i = found; continue; }
    i++;
  }
  if (found < 0) return null;
  const semi = text.indexOf(';', found);
  return text.slice(found, semi < 0 || semi > limit ? limit : semi);
}

/**
 * 一个**裸标识符**动态段是不是查询串（标识符单独出现的那种形态）。
 *
 * ⚠️ 为什么单独立一条规则（2026-11-01 实测）：
 * 桌面端有两处查询串**不写在模板字面量里**：
 *   const qs = limit ? (问号 limit=…) : '';   ⇒ 声明里有问号
 *   const qs = params.toString();             ⇒ URLSearchParams 的 toString()
 * 而模板处写的是**裸标识符**（既不是调用、也不是问号判断）
 * ⇒ ⇒ 老规则只看「动态段里有没有问号」⇒ 认不出
 * ⇒ ⇒ 把它当成路径参数 ⇒ 路径变成 /…/tail/{param} ⇒ 与服务端路由对不上。
 *
 * ⇒ ⇒ 判据：把标识符**解析回它的声明** ⇒ 声明里带问号 ⇒ 查询串；
 * 声明是 <URLSearchParams>.toString() ⇒ 也是查询串；
 * 解析不出来 ⇒ **保守当成路径参数**（宁可假红，不要假绿）。
 */
function isQueryStringIdent(text, name, before) {
  const decl = findDeclaration(text, name, before);
  if (decl === null) return false;
  if (decl.indexOf('?') >= 0) return true;
  const marker = '.toString()';
  const at = decl.indexOf(marker);
  if (at >= 0) {
    const recv = decl.slice(0, at).trim();
    if (recv && recv.indexOf('.') < 0 && recv.indexOf('(') < 0) {
      const recvDecl = findDeclaration(text, recv, before);
      if (recvDecl && recvDecl.indexOf('URLSearchParams') >= 0) return true;
    }
  }
  return false;
}

function parseArgs(argv) {
  const opts = {
    source: resolve(REPO, '..', 'telencephalon'),
    neuron: resolve(REPO, '..', 'neuron'),
    hippocampus: resolve(REPO, '..', 'hippocampus'),
    selfTest: false,
    dump: null,
    discover: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--neuron') opts.neuron = resolve(argv[++i]);
    else if (argv[i] === '--hippocampus') opts.hippocampus = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '--dump') opts.dump = argv[++i];
    else if (argv[i] === '--discover') opts.discover = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法: node scripts/check-client-endpoint-map.mjs [--source <端脑>] [--neuron <neuron 仓>] [--hippocampus <海马体仓>] [--self-test] [--dump <客户端文件>]');
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 客户端侧：解析「真的在发的请求」
// ---------------------------------------------------------------------------

/** 跳过一个简单引号字符串（' 或 "）⇒ 返回结束引号之后的下标。 */
function skipSimpleString(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === quote) return j + 1;
    j++;
  }
  return text.length;
}

/**
 * 扫一个模板字面量 ⇒ ⇒ **动态段**（${…}）不许把内容原样抄进来。
 *
 * ⚠️ 为什么要专门扫：模板里可以**再嵌模板**
 * （`/api/flows${qs ? \`?${qs}\` : ''}`）⇒ ⇒ 朴素的「遇到反引号就结束」
 * 会把后面整段源码吞成字面量 ⇒ ⇒ 路径变成垃圾（`/api/flows${qs `）
 * ⇒ ⇒ 一半调用点的路径**凭空错掉**（2026-11-01 实测）。
 *
 * 动态段的处理规则：
 * - **开头**的那个动态段 = base（${this.getBaseUrl()}）⇒ ⇒ 丢掉；
 * - 含 `?` 的动态段 = 查询串 ⇒ ⇒ 丢掉；
 * - 其余 = 路径参数 ⇒ ⇒ 记成 `{param}`。
 */
function scanTemplate(text, start) {
  let content = '';
  let i = start + 1;
  let atStart = true;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { content += text[i + 1] === undefined ? '' : text[i + 1]; i += 2; atStart = false; continue; }
    if (ch === BT) return { end: i, content: content };
    if (ch === '$' && text[i + 1] === '{') {
      const region = scanBalancedRegion(text, i + 1);
      const raw = text.slice(i, region.end + 1);
      const expr = raw.slice(2, raw.length - 1).trim();
      const isQuery = isBareIdent(expr) && isQueryStringIdent(text, expr, start);
      if (!atStart && raw.indexOf('?') < 0 && !isQuery) content += '{param}';
      i = region.end + 1;
      atStart = false;
      continue;
    }
    content += ch;
    atStart = false;
    i++;
  }
  return { end: text.length - 1, content: content };
}

/** 从 '{' 开始按花括号深度找配对的 '}'（跳过里面的字符串与嵌套模板）。 */
function scanBalancedRegion(text, open) {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') { i = skipSimpleString(text, i); continue; }
    if (ch === BT) { const t = scanTemplate(text, i); i = t.end + 1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return { end: i }; }
    i++;
  }
  return { end: text.length - 1 };
}

/** 扫一遍源码：抽出字符串字面量（' / " / 模板）＋ 标出「注释与字面量」的位置。 */
function scanSource(text) {
  const literals = [];
  const mask = new Uint8Array(text.length);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // ⚠️ **先跳注释** —— 否则注释里的撇号会把后面整段吞成字面量
    // （2026-11-01 实测：一次撇号吞掉 686 个字符 ⇒ 括号配对全乱 ⇒
    // ⇒ 一半调用点凭空消失 ⇒ ⇒ 表看起来像「客户端改了」）。
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      const stop = nl === -1 ? text.length : nl;
      for (let k = i; k < stop; k++) mask[k] = 1;
      i = stop;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let k = i; k < stop; k++) mask[k] = 1;
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let content = '';
      while (j < text.length) {
        const ch = text[j];
        if (ch === '\\') { content += text[j + 1] === undefined ? '' : text[j + 1]; j += 2; continue; }
        if (ch === quote) break;
        content += ch;
        j++;
      }
      for (let k = i; k <= j && k < mask.length; k++) mask[k] = 1;
      literals.push({ start: i, end: j, quote: quote, content: content });
      i = j + 1;
      continue;
    }
    if (c === BT) {
      const tpl = scanTemplate(text, i);
      for (let k = i; k <= tpl.end && k < mask.length; k++) mask[k] = 1;
      literals.push({ start: i, end: tpl.end, quote: BT, content: tpl.content });
      i = tpl.end + 1;
      continue;
    }
    i++;
  }
  return { literals: literals, mask: mask };
}

function lexStrings(text) {
  return scanSource(text).literals;
}

/** 字面量内容 ⇒ 路径候选（去掉 ${base} 前缀；不是路径就 null）。 */
function pathOf(content) {
  let s = content.trim();
  s = s.replace(/^\$\{[^}]*\}/, '');
  if (!s.startsWith('/')) return null;
  return s;
}

/** 路由路径归一化：路径参数一律 ⇒ {}（用来比路由，两边同形）。 */
function normalizeRoutePath(p) {
  return normalizeClientPath(p).replace(/\{[^}]*\}/g, '{}');
}

/** 找与 open 括号配对的右括号（跳过字符串字面量）。 */
function matchParen(text, open, mask) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (mask[i]) continue;
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return text.length - 1;
}

/** 往前找 const <name> = <字面量>（fetch(url) 这种变量形态）。 */
function findAssign(text, name, before, literals) {
  const re = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*', 'g');
  let m;
  let last = null;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= before) break;
    last = m;
  }
  if (!last) return null;
  const after = last.index + last[0].length;
  for (const l of literals) {
    if (l.start >= after && l.start < before) return l;
  }
  return null;
}

/** 一个客户端文件里**真的在发**的请求（路径 + 方法）。 */
/** Dart 客户端的调用名 ⇒ 方法（`_request` 的方法是第一个参数，单独处理）。 */
const DART_CALLS = [
  { name: '_request', method: null },
  { name: '_get', method: 'GET' },
  { name: '_post', method: 'POST' },
  { name: '_put', method: 'PUT' },
  { name: '_delete', method: 'DELETE' },
  { name: '_patch', method: 'PATCH' },
  { name: '_adminGet', method: 'GET' },
  { name: '_adminPost', method: 'POST' },
  { name: '_adminDelete', method: 'DELETE' },
  // ⚠️ 2026-11-02：公共 `request` / `requestList` 也是**真的在发**的形态
  // （移动端 `group_service.dart` 直接调 `client.request('POST', '/api/group/join')`）
  // ⇒ ⇒ 不认它们 ⇒ ⇒ 那批调用点**永远漏报**（闸说「客户端的每个调用点都在表里」，
  // 而它压根没看见过它们）。
  { name: 'request', method: null },
  { name: 'requestList', method: null },
];

/** 取一段文本里的第一个标识符（跳过空白）。 */
function firstIdent(s) {
  let i = 0;
  while (i < s.length && isSpaceChar(s[i])) i++;
  if (i >= s.length || !isIdentChar(s[i])) return null;
  const start = i;
  while (i < s.length && isIdentChar(s[i])) i++;
  return s.slice(start, i);
}

/** Dart 的赋值形态：`final path = …` / `var path = …` / `String path = …`。 */
function findDartAssign(text, name, before, literals) {
  const kws = ['final', 'var', 'const', 'late', 'String'];
  let found = -1;
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0 || at >= before) break;
    from = at + name.length;
    let k = at + name.length;
    while (k < text.length && isSpaceChar(text[k])) k++;
    if (text[k] !== '=' || text[k + 1] === '=') continue;
    // 往前读一个词：只有关键字 / 类型名才算「声明」
    let j = at - 1;
    while (j >= 0 && isSpaceChar(text[j])) j--;
    const wordEnd = j + 1;
    while (j >= 0 && isIdentChar(text[j])) j--;
    const word = text.slice(j + 1, wordEnd);
    if (kws.indexOf(word) < 0) continue;
    found = k + 1;
  }
  if (found < 0) return null;
  for (const l of literals) {
    if (l.start > found && l.start < before) return l;
  }
  return null;
}

/** 跳过空白与逗号后取第一个标识符（`_request('GET', path)` 的第二个参数）。 */
function firstIdentAfterComma(s) {
  let i = 0;
  while (i < s.length && (isSpaceChar(s[i]) || s[i] === ',')) i++;
  if (i >= s.length || !isIdentChar(s[i])) return null;
  const start = i;
  while (i < s.length && isIdentChar(s[i])) i++;
  return s.slice(start, i);
}

/** 一个 Dart 客户端文件里**真的在发**的请求。 */
function extractDartCallSites(text) {
  const scanned = scanSource(text);
  const literals = scanned.literals;
  const mask = scanned.mask;
  const sites = [];
  for (const call of DART_CALLS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(call.name, from);
      if (at < 0) break;
      from = at + call.name.length;
      if (mask[at]) continue;
      const prev = at > 0 ? text[at - 1] : ' ';
      if (isIdentChar(prev)) continue;
      let i = from;
      while (i < text.length && isSpaceChar(text[i])) i++;
      if (text[i] === '<') {
        let depth = 0;
        while (i < text.length) {
          if (text[i] === '<') depth++;
          else if (text[i] === '>') { depth--; if (depth === 0) { i++; break; } }
          i++;
        }
        while (i < text.length && isSpaceChar(text[i])) i++;
      }
      if (text[i] !== '(') continue;
      const open = i;
      const close = matchParen(text, open, mask);
      const span = text.slice(open, close + 1);
      const lits = literals.filter((l) => l.start > open && l.start < close);
      if (lits.length === 0) continue;
      let method = call.method;
      let pathLit = lits[0];
      if (call.method === null) {
        // `_request('GET', 'path')` ⇒ 第一个是方法，第二个是路径
        method = lits[0].content.trim().toUpperCase();
        if (!/^[A-Z]+$/.test(method)) continue;
        const rest = text.slice(lits[0].end + 1, close);
        const restLits = literals.filter((l) => l.start > lits[0].end && l.start < close);
        if (restLits.length > 0 && restLits[0].content.indexOf('/') === 0) {
          pathLit = restLits[0];
        } else {
          // 变量形态：`_request('GET', path)`
          const ident = firstIdentAfterComma(rest);
          if (!ident) continue;
          const found = findDartAssign(text, ident, at, literals);
          if (!found) continue;
          pathLit = found;
        }
      } else if (pathLit.content.indexOf('/') !== 0) {
        const ident = firstIdent(span.slice(1));
        if (!ident) continue;
        const found = findDartAssign(text, ident, at, literals);
        if (!found) continue;
        pathLit = found;
      }
      const p = normalizeDartPath(pathLit.content);
      if (p.indexOf('/') !== 0) continue;
      sites.push({ method: method, path: p });
    }
  }
  const seen = new Set();
  return sites.filter((s) => {
    const k = s.method + ' ' + s.path;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 客户端文件（TS / Dart）里**真的在发**的请求。 */
function extractCallSites(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.dart')) return extractDartCallSites(text);
  return extractTsCallSites(text);
}
function extractTsCallSites(text) {
  const scanned = scanSource(text);
  const literals = scanned.literals;
  const mask = scanned.mask;
  const sites = [];
  const callRe = /(this\.request|fetch)/g;
  let m;
  while ((m = callRe.exec(text)) !== null) {
    if (mask[m.index]) continue;
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i++;
    // ⚠️ 泛型参数可能**嵌套**（this.request<ApiEnvelope<SessionResponse[]>>(…)）
    // ⇒ ⇒ 必须按深度跳 —— <[^>]*> 会停在第一个 > 上 ⇒ 整条调用点漏掉。
    if (text[i] === '<') {
      let depth = 0;
      while (i < text.length) {
        if (text[i] === '<') depth++;
        else if (text[i] === '>') { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
      while (i < text.length && /\s/.test(text[i])) i++;
    }
    if (text[i] !== '(') continue;
    const open = i;
    const close = matchParen(text, open, mask);
    const span = text.slice(open, close + 1);
    let lit = null;
    for (const l of literals) {
      if (l.start > open && l.start < close && pathOf(l.content) !== null) { lit = l; break; }
    }
    if (!lit) {
      const ident = /^\s*([A-Za-z_$][\w$]*)/.exec(span.slice(1));
      if (ident) lit = findAssign(text, ident[1], m.index, literals);
    }
    if (!lit) continue;
    const p = pathOf(lit.content);
    if (!p) continue;
    const method = (/method:\s*'([A-Za-z]+)'/.exec(span) || [])[1] || 'GET';
    sites.push({ method: method.toUpperCase(), path: normalizeClientPath(p) });
  }
  const seen = new Set();
  return sites.filter((s) => {
    const k = s.method + ' ' + s.path;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 表侧
// ---------------------------------------------------------------------------

const FACES = new Set(['telencephalon', 'hippocampus', 'neuron', 'none']);
const STATUS = new Set(['aligned', 'outer', 'differs', 'missing']);

function parseMap(text) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const parts = t.split(/\s+/);
    if (parts.length !== 7) {
      errors.push('line ' + (i + 1) + ': expected 7 fields, got ' + parts.length + ' :: ' + t);
      return;
    }
    if (!STATUS.has(parts[3])) { errors.push('line ' + (i + 1) + ': unknown status ' + parts[3]); return; }
    if (!FACES.has(parts[4])) { errors.push('line ' + (i + 1) + ': unknown face ' + parts[4]); return; }
    rows.push({
      file: parts[0],
      method: parts[1],
      path: parts[2],
      status: parts[3],
      face: parts[4],
      serverMethod: parts[5],
      serverPath: parts[6],
      line: i + 1,
    });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// 客户端侧：**自己发现**，不靠表里的登记
// ---------------------------------------------------------------------------

/**
 * 客户端源码树 —— 表里的文件只是「已登记的」，**不是全部**。
 *
 * ⚠️ 2026-11-02 实测：闸原来用 `rows.map(r => r.file)` 决定扫哪些文件
 * ⇒ ⇒ **只扫表里登记过的** ⇒ ⇒ 一个**新写的**客户端文件（移动端
 * `services/group_service.dart`）**永远看不见** ⇒ ⇒ 「客户端的每个调用点
 * 都在表里」这句话**只在已登记的文件内成立** ⇒ ⇒ **漏报**。
 */
// ⚠️ 2026-11-02：**发现范围目前只覆盖移动端**（shadow-mobile/lib 全树）⇒ ⇒
// 桌面端仍只扫「表里登记过的文件」⇒ ⇒ 桌面端**还有漏报**（实测 ≈35 条：
// discoveryClient / hippocampusClient / openaiClient / ModelsPage /
// certificateStore / resonanceStore 等）⇒ ⇒ 桌面端此刻有 200+ 文件在飞
// ⇒ ⇒ 现在给它们登记 = **给在飞改动埋雷**（对方一改 ⇒ 表立刻过期 ⇒ 闸红）
// ⇒ ⇒ **待桌面端那批改动落地后再扩扫** ⇒ ⇒ 这里**如实标注**，不装作「全绿」。
//
// ⚠️ 另：抽取器只认**几种调用形态**（Dart：_request 家族 + request /
// requestList）⇒ ⇒ 直接用 http.get / http.post 发的**仍会漏**。
const CLIENT_ROOTS = ['shadow-mobile/lib'];

/** 测试文件不算客户端（它们的 fetch 是断言，不是产品发出去的请求）。 */
function isTestClientFile(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.includes('/test/') ||
    rel.includes('/tests/') ||
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel.endsWith('_test.dart')
  );
}

function walkClientFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkClientFiles(full, out);
    else if (/\.(dart|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * 发现**所有**真的在发请求的客户端文件（相对仓根）。
 *
 * ⚠️ 判据 = 「这个文件里抽得出调用点」⇒ ⇒ 本地 SQLite / 纯 UI 文件不算。
 */
function discoverClientFiles() {
  const found = new Set();
  for (const root of CLIENT_ROOTS) {
    for (const full of walkClientFiles(join(REPO, root))) {
      const rel = full.slice(REPO.length + 1).replace(/\\/g, '/');
      if (isTestClientFile(rel)) continue;
      let sites;
      try {
        sites = extractCallSites(full);
      } catch (e) {
        continue;
      }
      if (sites.length > 0) found.add(rel);
    }
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// 服务端侧：三张面
// ---------------------------------------------------------------------------

function walkRs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkRs(full, out);
    else if (entry.endsWith('.rs')) out.push(full);
  }
  return out;
}

function setOf(routes) {
  const s = new Set();
  for (const r of routes) s.add(r.method + ' ' + normalizeRoutePath(r.path));
  return s;
}

function buildUniverses(opts) {
  // ⚠️ **端脑源码不在位 ⇒ ⇒ 判不了（退出码 2），不是「没有问题」**
  //    （2026-11-11 真 CI 实测：兄弟仓没检出时，下面那行**抛 ENOENT 崩掉**
  //    ⇒ ⇒ 崩溃的退出码是 1 ⇒ ⇒ CI 当成「有问题」⇒ ⇒ **「读不到」被写成了「有问题」**。
  //    ⇒ ⇒ 这一格该说的是「我没验成」，不是「我验过了，没问题」。）
  if (!existsSync(join(opts.source, 'src', 'api', 'mod.rs'))) {
    console.error('判不了：端脑源码不在位（' + opts.source + '）⇒ ⇒ 这一格**没验成**，不是「没问题」。');
    console.error('   ⇒ ⇒ CI 上需要检出兄弟仓（iBLOC/telencephalon）—— 见 .github/workflows/unwired-gates.yml');
    process.exit(2);
  }
  const telencephalon = setOf(surfaceRoutes(opts.source));
  const hippoRoutes = [];
  for (const f of walkRs(join(opts.hippocampus, 'hippocampus-server', 'src'))) {
    for (const r of routesIn(f)) hippoRoutes.push({ method: r.method, path: '/hippocampus' + r.path });
  }
  const neuronRoutes = [];
  for (const f of walkRs(join(opts.neuron, 'src', 'server'))) {
    for (const r of routesIn(f)) neuronRoutes.push({ method: r.method, path: r.path });
  }
  return {
    telencephalon: telencephalon,
    hippocampus: setOf(hippoRoutes),
    neuron: setOf(neuronRoutes),
  };
}

// ---------------------------------------------------------------------------
// 判据自检
// ---------------------------------------------------------------------------

function selfTest() {
  let failed = 0;
  let total = 0;
  const check = (name, ok) => {
    total++;
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  };
  console.log('判据自检：');

  const SID = D + '{sessionId}';
  check('模板插值归一化成 {param}', normalizeClientPath('/api/sessions/' + SID) === '/api/sessions/{param}');
  check('路由路径参数归一化成 {}', normalizeRoutePath('/api/sessions/{session_id}') === '/api/sessions/{}');
  check('查询串去掉', normalizeClientPath('/hippocampus/api/tasks?tenantId=x') === '/hippocampus/api/tasks');

  const snippet = [
    'class C {',
    '  async a() { return this.request' + BT + '/api/sessions/' + D + '{id}' + BT + ', { method: ' + "'POST'" + ' }); }',
    '  async b() { const url = ' + BT + D + '{this.getBaseUrl()}/hippocampus/api/tasks' + BT + '; return fetch(url, { method: ' + "'DELETE'" + ' }); }',
    '  async c() { return this.request' + BT + D + '{this.getBaseUrl()}' + D + '{endpoint}' + BT + ', {}); }',
    '}',
  ].join('\n');
  const lit = lexStrings(snippet);
  check('字面量抽得出（含模板）', lit.length === 5);
  check('模板里的 base 前缀被剥掉', pathOf(D + '{this.getBaseUrl()}/hippocampus/api/tasks') === '/hippocampus/api/tasks');
  check('非路径字面量不误判', pathOf(D + '{this.getBaseUrl()}' + D + '{endpoint}') === null);

  // ⚠️⚠️ **Dart 侧**（移动端两个客户端）—— 夹具必须与真实输入**同形**：
  //   ① 直接字面量 ② $name 插值 ③ **变量形态**（先 final path = … 再 _request(… path)）
  // ⇒ ③ 这一支漏了 ⇒ ⇒ 那个调用点**凭空消失** ⇒ ⇒ 表看起来像「客户端改了」。
  const dartSnippet = [
    "class C {",
    "  Future<void> a() async {",
    "    await _request<List<dynamic>>('GET', '/api/providers');",
    "    await _request('DELETE', '/api/providers/$name');",
    "    final path =",
    "      '/hippocampus/api/memory?x=1';",
    "    await _request<List<dynamic>>('GET', path);",
    "  }",
    "}",
  ].join(String.fromCharCode(10));
  const dartSites = extractDartCallSites(dartSnippet);
  check('Dart：抽得出调用点', dartSites.length === 3);
  check('Dart：$name 插值 ⇒ {param}', dartSites.some((s) => s.method === 'DELETE' && s.path === '/api/providers/{param}'));
  check('Dart：变量形态的路径 ⇒ 查回声明', dartSites.some((s) => s.method === 'GET' && s.path === '/hippocampus/api/memory'));
  check('Dart：查询串去掉', dartSites.every((s) => s.path.indexOf('?') < 0));

  // ⚠️ 2026-11-03：钉住「**PATCH** 也抽得出」——
  // 端脑的「改单个叶区配置」走的是 PATCH
  // （`PATCH /api/telencephalon/agents/{name}/config`）
  // ⇒ ⇒ 抽取器不认 PATCH ⇒ ⇒ 那个调用点**凭空消失**
  // ⇒ ⇒ 表看起来像「客户端没改」⇒ ⇒ 闸说「全对」而其实**看不见它**。
  const patchSnippet = [
    'class C {',
    '  Future<void> a() async {',
    "    await _patch('/api/telencephalon/agents/$name/config', {'config': {}});",
    '  }',
    '}',
  ].join(String.fromCharCode(10));
  const patchSites = extractDartCallSites(patchSnippet);
  check('Dart：PATCH 调用点抽得出', patchSites.length === 1);
  check(
    'Dart：PATCH 路径 ⇒ {param}',
    patchSites.some(
      (s) => s.method === 'PATCH' && s.path === '/api/telencephalon/agents/{param}/config',
    ),
  );

  // ⚠️ 2026-11-02：钉住「客户端文件是**自己发现**的」——
  // 原来闸只扫表里登记过的文件 ⇒ ⇒ 新写的客户端文件**永远漏报**。
  const discovered = discoverClientFiles();
  const groupService = 'shadow-mobile/lib/services/group_service.dart';
  check('客户端文件能被自己发现（不止表里登记的那些）', discovered.length > 2);
  check('移动端 group_service 也在被发现的范围里', discovered.indexOf(groupService) >= 0);
  const groupSites = extractCallSites(join(REPO, groupService));
  check('group_service 的调用点抽得出（否则闸看不见它们）', groupSites.length > 0);

  console.log('  自检：' + (total - failed) + '/' + total);
  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest();
} else if (opts.discover) {
  // --discover：**自己发现**客户端文件 ⇒ 看看「表里没登记的」还有谁
  const files = discoverClientFiles();
  console.log('发现 ' + files.length + ' 个客户端文件：');
  for (const f of files) console.log('  ' + f);
} else if (opts.dump) {
  // --dump：让抽取器**自证**（2026-11-01 教训：数出来的条数必须能自己看）
  const full = resolve(REPO, opts.dump);
  if (!existsSync(full)) { console.error('文件不存在: ' + full); process.exit(2); }
  const sites = extractCallSites(full);
  if (sites.length === 0) { console.error('抽出 0 个调用点 —— 抽取器坏了，不是「没有」。'); process.exit(2); }
  console.log(opts.dump + ' ⇒ ' + sites.length + ' 个调用点');
  for (const s of sites) console.log('  ' + s.method + ' ' + s.path);
  process.exit(0);
} else {
  if (!existsSync(MAP_PATH)) {
    console.error('读不到对照表: ' + MAP_PATH);
    process.exit(2);
  }
  const { rows, errors } = parseMap(readFileSync(MAP_PATH, 'utf8'));
  if (errors.length > 0) {
    console.log('对照表本身有问题：');
    for (const e of errors) console.log('  ✘ ' + e);
    process.exit(1);
  }

  const universes = buildUniverses(opts);
  if (universes.telencephalon.size === 0) {
    console.error('在 ' + opts.source + ' 里解析出 0 条端脑路由 —— 解析器坏了，不是「全对」。');
    process.exit(2);
  }

  // ⚠️ 2026-11-02：**不只扫表里登记的文件** —— 表里没有的新客户端文件
  // （例如移动端 `services/group_service.dart`）必须自己被发现 ⇒ ⇒ 否则
  // 「客户端的每个调用点都在表里」是**假话**（漏报）。
  const files = [...new Set([...rows.map((r) => r.file), ...discoverClientFiles()])];
  const extracted = new Map();
  let totalSites = 0;
  for (const f of files) {
    const full = join(REPO, f);
    if (!existsSync(full)) {
      console.error('对照表指向的客户端文件不存在: ' + f);
      process.exit(1);
    }
    const sites = extractCallSites(full);
    extracted.set(f, sites);
    totalSites += sites.length;
  }
  if (totalSites === 0) {
    console.error('客户端解析出 0 个调用点 —— 这不是「全对」，是解析器坏了。');
    process.exit(2);
  }

  const unregistered = [];
  for (const [f, sites] of extracted) {
    for (const s of sites) {
      const hit = rows.find((r) => r.file === f && r.method === s.method && r.path === s.path);
      if (!hit) unregistered.push(f + '  ' + s.method + ' ' + s.path);
    }
  }

  const stale = [];
  for (const r of rows) {
    const sites = extracted.get(r.file) || [];
    if (!sites.some((s) => s.method === r.method && s.path === r.path)) {
      stale.push(r.file + '  ' + r.method + ' ' + r.path + '   (表第 ' + r.line + ' 行)');
    }
  }

  const wrongServer = [];
  for (const r of rows) {
    if (r.status === 'missing') continue;
    const u = universes[r.face];
    if (!u) { wrongServer.push('未知面 ' + r.face + '（表第 ' + r.line + ' 行）'); continue; }
    if (!u.has(r.serverMethod + ' ' + normalizeRoutePath(r.serverPath))) {
      wrongServer.push(r.file + '  ' + r.method + ' ' + r.path + '  ⇒ ' + r.face + ' 上没有 ' + r.serverMethod + ' ' + r.serverPath);
    }
  }

  const lying = [];
  const realGaps = [];
  for (const r of rows) {
    if (r.status !== 'missing') continue;
    const key = r.method + ' ' + normalizeRoutePath(r.path);
    let found = false;
    for (const face of ['telencephalon', 'hippocampus', 'neuron']) {
      if (universes[face].has(key)) {
        lying.push(r.file + '  ' + r.method + ' ' + r.path + '  ⇒ 表说「端脑没有」，但 ' + face + ' 上有同路径的路由');
        found = true;
        break;
      }
    }
    if (!found) realGaps.push(r.file + '  ' + r.method + ' ' + r.path);
  }

  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  console.log('对照表：' + MAP_PATH);
  console.log('  ' + rows.length + ' 条登记 · ' + byStatus.aligned + ' aligned / ' + byStatus.outer + ' outer / ' + byStatus.differs + ' differs / ' + byStatus.missing + ' missing');
  console.log('客户端侧：' + files.length + ' 个文件 · ' + totalSites + ' 个调用点');
  console.log('服务端侧：端脑 ' + universes.telencephalon.size + ' 条 · hippocampus ' + universes.hippocampus.size + ' 条 · neuron ' + universes.neuron.size + ' 条');

  const problems = [];
  if (unregistered.length) { console.log(''); console.log('❌ 客户端有调用点、但表里没登记：'); for (const p of unregistered) console.log('  ' + p); problems.push('unregistered'); }
  if (stale.length) { console.log(''); console.log('❌ 表里的行客户端已经不打它了（表不许过期）：'); for (const p of stale) console.log('  ' + p); problems.push('stale'); }
  if (wrongServer.length) { console.log(''); console.log('❌ 表里说服务端有、但服务端实际没有：'); for (const p of wrongServer) console.log('  ' + p); problems.push('wrong-server'); }
  if (lying.length) { console.log(''); console.log('❌ 表说「端脑没有」、但端脑其实有同路径的路由（表说谎了）：'); for (const p of lying) console.log('  ' + p); problems.push('lying'); }
  if (realGaps.length) {
    console.log('');
    console.log('⚠️ ' + realGaps.length + ' 条调用点在服务端**没有对应面** ⇒ 需要产品决定（不阻断）：');
    for (const p of realGaps) console.log('  ' + p);
  }
  console.log('');
  if (problems.length === 0) {
    console.log('✔ 客户端的每个调用点都在表里，表里的每条映射都对得上服务端 ⇒ 没有「静默打错服务」。');
    process.exit(0);
  }
  console.log('⇒ ⇒ 修 scripts/client-endpoint-map.txt（或改客户端），别让表过期。');
  process.exit(1);
}
