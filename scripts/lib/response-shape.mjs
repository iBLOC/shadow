/**
 * 响应形状判据 —— 「客户端这一发期望什么形状」×「端脑这一面返什么形状」。
 *
 * ## 这份判据解决的是什么坑
 *
 * 桌面端有**两个** client 打**同一台端脑**（`lib/platform.ts` 自己写着：
 * `prefrontalUrl()` 其实是端脑的地址）：
 *   - `lib/telencephalonClient.ts` —— **端脑方言**：裸体；
 *   - `lib/prefrontalClient.ts`    —— **prefrontal 独立仓方言**：`{success,data}` 信封。
 * ⇒ ⇒ 「路径对得上、方法对得上」**不等于**「响应形状对得上」
 * ⇒ ⇒ 而路径对不上的那些**先 404** ⇒ ⇒ 形状问题被路由错误**盖住**了
 * ⇒ ⇒ 只有「路径与方法都对得上」的那些，形状才真正决定成败。
 *
 * ## 为什么判据是**单向**的（客户端 → 端脑）
 *
 * 端脑这一面**压根没有信封**（机器可判：`telencephalonEnvelopePremise()`
 * ⇒ src 下没有任何 struct 同时带 `success` 与 `data`，也没有手写的
 * `json!({ "success": …, "data": … })`）⇒ ⇒ 所以
 * 「客户端硬要信封 ＋ 打的确实是端脑面上真实存在的那条路由」⇒ ⇒ **必炸**
 * （`env.success` 是 undefined ⇒ 抛错）⇒ ⇒ 那是真缺陷 ⇒ ⇒ 红。
 *
 * ⚠️ **保守方向**：宁可漏报，不误报 —— 前提（端脑面有没有信封）判错时
 * 一律往「有信封」偏 ⇒ ⇒ 因为「红」比漏报**更坑**（会让人去改已经改对的
 * 代码 ⇒ ⇒ 引入新 bug）。
 *
 * ## 「两种都认」不算硬要信封
 *
 * 客户端若用**统一的解包 helper**（`unwrapEnvelope`）⇒ ⇒ 它认信封也认裸体
 * ⇒ ⇒ 迁移期不会因为对方换了信封就炸 ⇒ ⇒ 不算硬要信封 ⇒ ⇒ 绿。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './strip-comments.mjs';

// ── 路径归一化（**与 check-client-endpoint-map.mjs 共用这一份**）────────────

// ⚠️ **只认首字符**（与 check-client-endpoint-map.mjs 的那份**逐字等价**）
//    —— 用 charCode 判首字符，不是一整串里找有没有 ⇒ ⇒ `' a'` 判 false。
export function isIdentChar(ch) {
  if (!ch) return false;
  return /^[A-Za-z0-9_$]/.test(ch);
}

/** 客户端路径归一化：模板插值 ⇒ {param}；查询串去掉。 */
export function normalizeClientPath(p) {
  return p.split('?')[0].replace(/\$\{[^}]*\}/g, '{param}');
}

/** Dart 路径归一化：`$name` / `${…}` ⇒ `{param}`；查询串去掉。 */
export function normalizeDartPath(p) {
  const q = p.indexOf('?');
  const s = q >= 0 ? p.slice(0, q) : p;
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') { depth--; if (depth === 0) break; }
        j++;
      }
      out += '{param}';
      i = j + 1;
      continue;
    }
    if (s[i] === '$' && i + 1 < s.length && isIdentChar(s[i + 1])) {
      out += '{param}';
      i++;
      while (i < s.length && isIdentChar(s[i])) i++;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

/** 两条路径是否**同形**（参数名可以不同 ⇒ `{id}` 与 `{session_id}` 算同形）。 */
export function samePath(a, b) {
  const sa = a.split('/');
  const sb = b.split('/');
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] === sb[i]) continue;
    if (/^\{[^}]*\}$/.test(sa[i]) && /^\{[^}]*\}$/.test(sb[i])) continue;
    return false;
  }
  return true;
}

// ── 客户端侧：这一发期望什么形状 ──────────────────────────────────────────

/** 「两种都认」的解包 helper —— 用了它就不算硬要信封。 */
export const TOLERANT_HELPERS = /\b(unwrapEnvelope|unwrapData|envelopeOf)\b/;

/**
 * 文本里有没有「两种都认」的解包 helper **调用**。
 *
 * ⚠️ **不能**直接用 `名字\s*\(` 判：`unwrapEnvelope<X[]>(…)` 的泛型夹在
 * 名字与左括号**之间** ⇒ ⇒ 那种写法会认不出来 ⇒ ⇒ 把「两种都认」误判成
 * 「硬要信封」⇒ ⇒ 假红。
 */
export function hasTolerantHelper(text) {
  const re = /\b(unwrapEnvelope|unwrapData|envelopeOf)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rest = text.slice(m.index, m.index + 160);
    const open = rest.indexOf('(');
    if (open === -1) continue;
    if (/[\n;]/.test(rest.slice(0, open))) continue;
    return true;
  }
  return false;
}

/** 找与 open 括号配对的右括号（跳过字符串里的括号）。 */
export function matchParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return text.length - 1;
}

/** 一段调用文本里的**第一个路径字面量**。 */
export function firstPathLiteral(span) {
  const m = /(['"`])(\/[^'"`\n]*)\1/.exec(span);
  return m ? m[2] : null;
}

/** 泛型参数（`<ApiEnvelope<SessionResponse[]>>`）—— 深度跳，`<[^>]*>` 会停在第一个 > 上。 */
function skipGenerics(text, i) {
  if (text[i] !== '<') return i;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === '<') depth++;
    else if (text[j] === '>') { depth--; if (depth === 0) return j + 1; }
  }
  return text.length;
}

/**
 * 从某个下标往后取一段文本，但**遇到下一个调用就截断**。
 *
 * ⚠️ **为什么必须截断**：固定长度的窗口会**越界到下一个方法** ⇒ ⇒
 * `healthCheck()` 那发的窗口伸进了 `createSession()` ⇒ ⇒ 把后者的
 * `env.success` 算到自己头上 ⇒ ⇒ **假「硬要信封」**⇒ ⇒ 假红。
 * ⇒ ⇒ 判据不许看见**别的调用点**的东西。
 */
export function scopeWindow(text, from, stopRe, max = 400) {
  const win = text.slice(from, from + max);
  const m = stopRe.exec(win);
  return m ? win.slice(0, m.index) : win;
}

/** 文本里某个下标所在的行号（1 起）。 */
export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function tsSites(text) {
  const sites = [];
  const re = /\b(this\.request|fetch)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i++;
    let generic = '';
    if (text[i] === '<') {
      const j = skipGenerics(text, i);
      generic = text.slice(i, j);
      i = j;
      while (i < text.length && /\s/.test(text[i])) i++;
    }
    if (text[i] !== '(') continue;
    const open = i;
    const close = matchParen(text, open);
    const span = text.slice(open, close + 1);
    const p = firstPathLiteral(span);
    if (!p) continue;
    const method = (((/method\s*:\s*'([A-Za-z]+)'/.exec(span) || [])[1]) || 'GET').toUpperCase();
    const after = scopeWindow(text, close + 1, /\b(this\.request|fetch)\b/);
    const strict = /ApiEnvelope\s*</.test(generic) || /\b(env|res|resp|body)\.success\b/.test(after);
    const tolerant = hasTolerantHelper(after);
    sites.push({ method: method, path: normalizeClientPath(p), strict: strict, tolerant: tolerant, kind: 'ts', line: lineOf(text, m.index) });
  }
  return sites;
}

const DART_CALL_METHOD = {
  _get: 'GET', _post: 'POST', _put: 'PUT', _delete: 'DELETE', _patch: 'PATCH',
  _adminGet: 'GET', _adminPost: 'POST', _adminDelete: 'DELETE',
};

function dartSites(text) {
  const sites = [];
  const names = Object.keys(DART_CALL_METHOD).concat(['_request']);
  const re = new RegExp('\\b(' + names.join('|') + ')\\b', 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === '<') {
      i = skipGenerics(text, i);
      while (i < text.length && /\s/.test(text[i])) i++;
    }
    if (text[i] !== '(') continue;
    const open = i;
    const close = matchParen(text, open);
    const span = text.slice(open, close + 1);
    const p = firstPathLiteral(span);
    if (!p) continue;
    let method = DART_CALL_METHOD[m[1]] || null;
    if (!method) {
      const mm = /^\s*'([A-Za-z]+)'/.exec(span.slice(1));
      method = mm ? mm[1].toUpperCase() : 'GET';
    }
    const after = scopeWindow(text, close + 1, /\b(_request|_get|_post|_put|_delete|_patch|_adminGet|_adminPost|_adminDelete)\b/);
    const strict = /\b(data|res|resp|body|json)\s*\[\s*'success'\s*\]/.test(after);
    const tolerant = hasTolerantHelper(after);
    sites.push({ method: method, path: normalizeDartPath(p), strict: strict, tolerant: tolerant, kind: 'dart', line: lineOf(text, m.index) });
  }
  return sites;
}

/**
 * 客户端文件里「每一发期望什么形状」。
 *
 * ⚠️ **同一个 (method, path) 可能出现多次**（同一文件里两处打同一条路由）
 * ⇒ ⇒ 聚合规则在 `aggregateSites()`：**只要有一处是 tolerant ⇒ 就算 tolerant**
 * （那处解包已经能认两种 ⇒ 这一发不会炸）⇒ ⇒ 保守方向（少报）。
 */
export function clientShapeSites(text, kind) {
  const raw = kind === 'dart' ? dartSites(text) : tsSites(text);
  return aggregateSites(raw);
}

export function aggregateSites(sites) {
  const byKey = new Map();
  for (const s of sites) {
    const k = s.method + ' ' + s.path;
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, { method: s.method, path: s.path, strict: s.strict, tolerant: s.tolerant, kind: s.kind, line: s.line, count: 1 });
      continue;
    }
    cur.count++;
    cur.tolerant = cur.tolerant || s.tolerant;
    cur.strict = cur.strict || s.strict;
  }
  return [...byKey.values()];
}

// ── 端脑侧：这一面到底有没有信封（**判据的前提**）─────────────────────────

export function walkRs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkRs(full, out);
    else if (entry.endsWith('.rs')) out.push(full);
  }
  return out;
}

/** 与 open 处的 '{' 配对的整块文本。 */
export function balanced(text, open) {
  let d = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === '{') d++;
    else if (text[j] === '}') { d--; if (d === 0) return text.slice(open, j + 1); }
  }
  return null;
}

/**
 * 端脑这一面**有没有 `{success,data}` 信封** —— 判据的**前提**。
 *
 * ⚠️ **判错的方向是保守的**：判成「有信封」⇒ ⇒ 少红（漏报）⇒ ⇒ 可接受；
 * 判成「无信封」而其实有 ⇒ ⇒ **假红** ⇒ ⇒ 会让人去改已经改对的代码。
 */
export function envelopePremiseInTexts(items) {
  const envelopes = [];
  for (const item of items) {
    const f = item.file || '<memory>';
    const t = item.text;
    const sre = /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
    let m;
    while ((m = sre.exec(t)) !== null) {
      const body = balanced(t, m.index + m[0].length - 1);
      if (!body) continue;
      // ⚠️ **不能要求字段在行首** —— 单行写完的 struct（`struct E { success: bool, data: String }`）
      //    会认不出来 ⇒ ⇒ 可能把「端脑面有信封」误判成「没有」⇒ ⇒ **假红风险**。
      const hasSuccess = /\bsuccess\s*:/.test(body) || /rename\s*=\s*"success"/.test(body);
      const hasData = /\bdata\s*:/.test(body) || /rename\s*=\s*"data"/.test(body);
      if (hasSuccess && hasData) envelopes.push({ kind: 'struct', name: m[1], file: f });
    }
    const jre = /json!\s*\{/g;
    while ((m = jre.exec(t)) !== null) {
      const body = balanced(t, m.index + m[0].length - 1);
      if (!body) continue;
      if (/"success"/.test(body) && /"data"/.test(body)) envelopes.push({ kind: 'json!', file: f });
    }
  }
  return { hasEnvelope: envelopes.length > 0, envelopes: envelopes };
}

/** 端脑源码树上的前提（`items` = [{file, text}]）。 */
export function telencephalonEnvelopePremise(sourceRoot) {
  const files = walkRs(join(sourceRoot, 'src'));
  const items = files.map((f) => ({
    file: f,
    text: stripComments(readFileSync(f, 'utf8'), { nested: true, rust: true }),
  }));
  return envelopePremiseInTexts(items);
}