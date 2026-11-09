/**
 * **提交面 import 自足性** —— 判据库（纯函数 · 零 I/O）
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 「提交树能编译吗」这一格，此前**只由 CI 的 tsc / vitest / vite 顺带回答**
 * ⇒ ⇒ 而那三样各自有别的先决条件（工具链、node_modules、缓存）
 * ⇒ ⇒ **提交树里悬空一条 import**（引用方进了提交树、被引用模块没进）这件事，
 * 要等到**整套工具链在 CI 上装好、跑起来**才暴露 ⇒ ⇒ 而那已经是**红灯**了。
 *
 * 2026-11-11 实测：并行会话的 `6ea630a` 提交了 `src/pages/SettingsPage.tsx`
 * （它 `import { fileToBackgroundDataUrl, isChatBackgroundDataUrl } from '../lib/chatBackground'`），
 * 而 `src/lib/chatBackground.ts` **从未进提交树** ⇒ ⇒ 提交树自相矛盾
 * ⇒ ⇒ 主 CI 的 Desktop Build / Desktop Tests 双红 ＋ E2E Typecheck 红
 * —— 三个红灯，**同一个根因**。
 *
 * ## 判据
 *
 * 提交树里**每一条相对 import**（`./x` / `../x`）都必须解析得到**树内真实存在的文件**。
 * 非相对 import（`react`、`vitest`…）**不在射程内** ⇒ ⇒ 那是依赖包，不是提交树的债。
 *
 * ## 解析方式：分词，不靠正则扫正文
 *
 * ⚠️ **正则扫正文会看见不该看见的东西** ⇒ ⇒ 字符串字面量里的
 *    `"import x from './missing'"` 会被当成真 import ⇒ ⇒ 假红。
 * ⇒ ⇒ 这里**先分词**（注释跳过、字符串单独成 token）⇒ ⇒ 再在 token 流里认 import 形状。
 */

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/** 从源文件路径推出它所在的目录（仓内路径一律用 `/`）。 */
export function dirOf(filePath) {
  const i = String(filePath).lastIndexOf('/');
  return i < 0 ? '' : String(filePath).slice(0, i);
}

/**
 * 把 `a/b/../c` 规整成 `a/c`（**不碰文件系统**，纯字符串）。
 * 越界的 `..` 直接吃掉前面的段（像 Node 的 resolve 那样不再往上找）。
 */
export function normalizePath(p) {
  const parts = String(p).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/**
 * **分词** —— 注释被丢掉、字符串单独成 token、其余按 id/num/punct 切。
 * ⚠️ 正则字面量要单独跳过 ⇒ ⇒ 否则 `/['"]/` 里的引号会被当成字符串开头。
 */
export function tokenize(source) {
  const text = String(source || '');
  const tokens = [];
  let i = 0;
  let line = 1;
  let prev = null;
  const regexCanStart = (t) => {
    if (!t) return true;
    if (t.type === 'punct') return '(,=:[!&|?{};+-*%<>^~'.includes(t.value);
    if (t.type === 'id') return ['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await'].includes(t.value);
    return false;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { line += 1; i += 1; continue; }
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '/' && regexCanStart(prev)) {
      // 正则字面量 ⇒ ⇒ 原样跳过（但要数换行）
      i += 1;
      let inClass = false;
      while (i < text.length) {
        const c = text[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '\n') { line += 1; i += 1; break; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i += 1; break; }
        i += 1;
      }
      prev = { type: 'punct', value: '/' };
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i;
      const startLine = line;
      i += 1;
      let value = '';
      while (i < text.length) {
        const c = text[i];
        if (c === '\\') {
          value += text[i + 1] === undefined ? '' : text[i + 1];
          i += 2;
          continue;
        }
        if (c === ch) { i += 1; break; }
        if (c === '\n') line += 1;
        value += c;
        i += 1;
      }
      prev = { type: 'str', value };
      tokens.push({ type: 'str', value, start, end: i, line: startLine });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      let id = '';
      while (i < text.length && /[A-Za-z0-9_$]/.test(text[i])) {
        id += text[i];
        i += 1;
      }
      prev = { type: 'id', value: id };
      tokens.push({ type: 'id', value: id, start, end: i, line });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < text.length && /[0-9.]/.test(text[i])) i += 1;
      prev = { type: 'num', value: text.slice(start, i) };
      tokens.push({ type: 'num', value: prev.value, start, end: i, line });
      continue;
    }
    prev = { type: 'punct', value: ch };
    tokens.push({ type: 'punct', value: ch, start: i, end: i + 1, line });
    i += 1;
  }
  return tokens;
}

/** 从 token 流的第 `from` 位置起找 `from '<字符串>'`（带花括号/圆括号配平）。 */
function findFromString(tokens, start) {
  let depth = 0;
  const limit = Math.min(tokens.length, start + 400);
  for (let i = start; i < limit; i += 1) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.value === '{' || t.value === '(' || t.value === '[') depth += 1;
      else if (t.value === '}' || t.value === ')' || t.value === ']') depth -= 1;
      else if (t.value === ';' && depth <= 0) return null;
      continue;
    }
    if (t.type === 'id' && t.value === 'from' && depth <= 0) {
      const s = tokens[i + 1];
      if (s && s.type === 'str') return s;
      return null;
    }
  }
  return null;
}

/**
 * 抽出源码里的**相对 import**（含 export-from / require / 动态 import）。
 * 返回 `[{ specifier, line }]` ⇒ ⇒ 行号是**源文件里的真实行号**。
 */
export function extractRelativeImports(source) {
  const tokens = tokenize(source);
  const hits = [];
  const add = (tok) => {
    if (!tok || tok.type !== 'str') return;
    const spec = tok.value;
    if (!spec.startsWith('./') && !spec.startsWith('../')) return;
    hits.push({ specifier: spec, line: tok.line });
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'id') continue;
    const prevTok = tokens[i - 1];
    // 「成员访问」不算 import 关键字 ⇒ ⇒ `obj.import` / `foo.require` 不算数
    if (prevTok && prevTok.type === 'punct' && prevTok.value === '.') continue;
    if (t.value === 'import') {
      const n = tokens[i + 1];
      if (!n) continue;
      if (n.type === 'punct' && n.value === '(') {
        const s = tokens[i + 2];
        if (s && s.type === 'str') add(s);
        continue;
      }
      if (n.type === 'str') { add(n); continue; }
      const s = findFromString(tokens, i + 1);
      if (s) add(s);
      continue;
    }
    if (t.value === 'export') {
      const s = findFromString(tokens, i + 1);
      if (s) add(s);
      continue;
    }
    if (t.value === 'require') {
      const p = tokens[i + 1];
      if (p && p.type === 'punct' && p.value === '(') {
        const s = tokens[i + 2];
        if (s && s.type === 'str') add(s);
      }
      continue;
    }
  }
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const key = h.line + '|' + h.specifier;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

/**
 * 一条相对 import 能不能解析到**树里的某个文件**。
 * @param {string} fromFile 引用方在树里的路径
 * @param {string} specifier import 串（相对形式）
 * @param {Set<string>} fileSet 树内所有文件路径
 * @returns {{ok: boolean, resolved: ?string, tried: string[]}}
 */
export function resolveRelativeImport(fromFile, specifier, fileSet) {
  const raw = String(specifier).split('?')[0].split('#')[0];
  const base = normalizePath(dirOf(fromFile) + '/' + raw);
  const tried = [];
  // ⚠️ **总是**把「原样」与「原样 ＋ 扩展名」都试一遍 ⇒ ⇒ 因为存在**复合扩展名**
  //    （仓里的生成物：`../styles/accent.g` ⇒ ⇒ 真身是 `accent.g.ts`）
  //    ⇒ ⇒ 只在「没扩展名」时才补扩展名 ⇒ ⇒ 会把生成物误报成悬空 ⇒ ⇒ 假红。
  tried.push(base);
  for (const e of SOURCE_EXTENSIONS) tried.push(base + e);
  tried.push(base + '/index.ts', base + '/index.tsx', base + '/index.js', base + '/index.mjs');
  // ESM 风格：`./x.js` 在 TS 源里常常指的是 `./x.ts`
  if (base.endsWith('.js')) tried.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx');
  if (base.endsWith('.jsx')) tried.push(base.slice(0, -4) + '.tsx');
  if (base.endsWith('.mjs')) tried.push(base.slice(0, -4) + '.mts');
  if (base.endsWith('.cjs')) tried.push(base.slice(0, -4) + '.cts');
  for (const t of tried) {
    if (fileSet.has(t)) return { ok: true, resolved: t, tried };
  }
  return { ok: false, resolved: null, tried };
}

/**
 * 扫一棵树 ⇒ ⇒ 列出所有**悬空**的相对 import。
 * @param {string[]} files 树内文件路径
 * @param {(p: string) => (string|null)} read 读一个文件的内容
 */
export function findDanglingImports(files, read) {
  const fileSet = new Set(files);
  const dangling = [];
  let relativeCount = 0;
  let scanned = 0;
  for (const file of files) {
    if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)) continue;
    scanned += 1;
    let source;
    try {
      source = read(file);
    } catch (err) {
      source = null;
    }
    if (source === null || source === undefined) continue;
    const imports = extractRelativeImports(source);
    for (const imp of imports) {
      relativeCount += 1;
      const res = resolveRelativeImport(file, imp.specifier, fileSet);
      if (!res.ok) {
        dangling.push({ from: file, line: imp.line, specifier: imp.specifier, tried: res.tried });
      }
    }
  }
  return { dangling, relativeCount, scanned };
}
