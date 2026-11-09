/**
 * 桌面端（TypeScript / Vitest / WebdriverIO / Playwright）用例的「断言承重闸」。
 * ============================================================================
 *
 * ## 它守什么
 *
 * 一条用例「跑过了」这句话，本身**也要被证一次**。
 *
 * ⚠️ **为什么桌面端也有这一族**（2026-11-09 真机实测，本仓 iBLOC/shadow）：
 *   · `expect(url).toBeTruthy()` ⇒ ⇒ URL 永远是**非空字符串** ⇒ ⇒ 恒真；
 *   · `expect(text).toBeTruthy()`（`text` = 整页 body 文本）⇒ ⇒ 任何**渲染出来的**
 *     页面都有文字 —— 包括「404 Not Found」「Internal Server Error」那种
 *     ⇒ ⇒ **端脑整个坏了它照样绿**；
 *   · `if (await input.isExisting()) { …断言… }` ⇒ ⇒ 元素不存在 ⇒ ⇒ **零断言通过**。
 *
 * ⇒ ⇒ 这三种在真跑时都表现为「**PASS**」⇒ ⇒ 而**什么都没被证明**。
 *
 * ## 红线（**判红**）
 *
 *   **R1 · 恒真断言** —— 断言的**主体是字面量常量**（`expect(true).toBe(true)`）
 *     ⇒ ⇒ 断言结果与被测物无关 ⇒ ⇒ 零信息量。
 *     ⚠️ **只抓「字面量」不抓「标识符」** —— `expect(count).toBe(3)` 是常量钉桩
 *     ⇒ ⇒ 结论由被测物决定 ⇒ ⇒ 有承重 ⇒ ⇒ 不判红。
 *
 *   **R2 · 空断言用例** —— 用例体里**一条断言都没有**
 *     ⇒ ⇒ 用例名宣称的那个主张，**没有任何东西在核**。
 *
 *   **R3 · 弱断言独占** —— 用例的**全部**断言都是 `toBeTruthy()` 挂在裸标识符上
 *     ⇒ ⇒ 它只能证明「某个值不是空的」⇒ ⇒ **证明不了用例名宣称的那件事**。
 *     ⚠️ `toBeFalsy()` / `toBeNull()` / `toThrow()` **不算弱** —— 它们要求
 *     被测物**恰好**是那个形状 ⇒ ⇒ 有承重。
 *
 * ## 读数（**不判红**，但要看得见）
 *
 *   · **条件化断言** —— 断言落在「没有 else 的 if」分支里（分支不进 ⇒ 零断言）；
 *   · **弱匹配器分布** —— `toBeTruthy` / `toBeDefined` / `toBeFalsy` 各多少处。
 *
 * ## 防假绿
 *
 * · 判据自检（**孪生成对**）⇒ ⇒ 证明尺子**有牙**且**不恒红**；
 * · 一个文件都没读到 ⇒ ⇒ 退出码 2（不是 0）。
 */

/* ── 掩码：把注释与字符串内容抹成空格（长度不变 ⇒ 行号不变）────────────── */

/**
 * @param {string} src
 * @returns {string} 同长度掩码副本：注释与字符串**内容**被抹成空格
 */
export function maskSource(src) {
  const out = new Array(src.length);
  const n = src.length;
  const blank = (a, b) => {
    for (let k = Math.max(0, a); k < Math.min(n, b); k += 1) {
      out[k] = src[k] === '\n' ? '\n' : ' ';
    }
  };
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (ch === '/' && next === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) { j += 1; break; }
        j += 1;
      }
      blank(i + 1, j - 1);
      out[i] = ch;
      out[j - 1] = ch;
      i = j;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const c2 = src[j];
        if (c2 === '\\') { j += 2; continue; }
        if (depth === 0 && c2 === '`') { j += 1; break; }
        if (depth === 0 && c2 === '$' && src[j + 1] === '{') { depth = 1; j += 2; continue; }
        if (depth > 0) {
          if (c2 === '{') depth += 1;
          else if (c2 === '}') depth -= 1;
        }
        j += 1;
      }
      blank(i + 1, j - 1);
      out[i] = '`';
      // ⚠️⚠️ **收尾的反引号也必须赋值**（2026-11-09 实测踩到的坑）：
      //   漏掉它 ⇒ ⇒ `out` 留一个**洞** ⇒ ⇒ `join('')` 把洞当成空串
      //   ⇒ ⇒ **掩码比源码短一个字符** ⇒ ⇒ 后面所有偏移全部错位
      //   ⇒ ⇒ 判据开始报**假阳性**（实测：模板串之后的字符串整段没被抹掉）。
      out[j - 1] = '`';
      i = j;
      continue;
    }
    if (ch === '/' && looksLikeRegexStart(out, i)) {
      let j = i + 1;
      let closed = false;
      let inClass = false;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { j += 1; closed = true; break; }
        else if (src[j] === '\n') break;
        j += 1;
      }
      if (closed) {
        blank(i + 1, j - 1);
        out[i] = '/';
        out[j - 1] = '/';
        i = j;
        continue;
      }
    }
    out[i] = ch;
    i += 1;
  }
  return out.join('');
}

/**
 * 这个 `/` 是不是**正则字面量的开头**（而不是除号）？
 *
 * 判据：前一个非空白字符是「值开头」的那一类（`( , = : [ ! & | ? { ; + - * % ~ ^`）
 * 或前一个词是 `return` / `typeof` / `case` / `in` / `of` / `instanceof`。
 */
export function looksLikeRegexStart(chars, index) {
  const at = (k) => {
    const v = chars[k];
    return typeof v === 'string' ? v : ' ';
  };
  let k = index - 1;
  while (k >= 0 && /\s/.test(at(k))) k -= 1;
  if (k < 0) return true;
  const prev = at(k);
  if ('(,=:[!&|?{;+-*%~^'.includes(prev)) return true;
  if (/[A-Za-z0-9_$]/.test(prev)) {
    let w = k;
    while (w >= 0 && /[A-Za-z0-9_$]/.test(at(w))) w -= 1;
    let word = '';
    for (let z = w + 1; z <= k; z += 1) word += at(z);
    return ['return', 'typeof', 'case', 'in', 'of', 'instanceof', 'void', 'delete'].includes(word);
  }
  return false;
}

/* ── 括号配对（在掩码上做 ⇒ 字符串里的括号不算）──────────────────────── */

/** @returns {number} 与 `open` 配对的收尾括号下标；找不到 ⇒ -1 */
export function matchBracket(masked, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (let i = open; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') { stack.push(pairs[c]); continue; }
    if (c === ')' || c === ']' || c === '}') {
      const want = stack.pop();
      if (want !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/* ── 字面量判定 ──────────────────────────────────────────────────────── */

const LITERAL_RE = /^(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^'\\]*'|"[^"\\]*"|`[^$`]*`)$/;

/** 主体是不是「字面量常量」⇒ ⇒ 断言结果与被测物无关。 */
export function isLiteral(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return LITERAL_RE.test(t);
}

/** 裸标识符（`url` / `text` / `el`）⇒ ⇒ 结论由被测物决定。 */
export function isBareIdentifier(text) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(text ?? '').trim());
}

/* ── 用例与断言的抽取 ────────────────────────────────────────────────── */

const WEAK_MATCHERS = new Set(['toBeTruthy', 'toBeFalsy', 'toBeDefined', 'toBeUndefined']);
/** `toBeFalsy` / `toBeNull` 要求被测物**恰好**是那个形状 ⇒ ⇒ 有承重 ⇒ 不算弱。 */
export const TRULY_WEAK_MATCHERS = new Set(['toBeTruthy']);

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/**
 * 抽一条用例体里的全部断言。
 * @returns {Array<{matcher:string,subject:string,arg:string|null,line:number}>}
 */
export function extractAssertions(body, bodyStart, src) {
  const found = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== 'e') { i += 1; continue; }
    if (body.slice(i, i + 6) !== 'expect' ) { i += 1; continue; }
    let j = i + 6;
    while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j += 1;
    if (body[j] !== '(') { i = j; continue; }
    const close = matchBracket(body, j);
    if (close < 0) { i = j + 1; continue; }
    const subject = src.slice(bodyStart + j + 1, bodyStart + close);
    let k = close + 1;
    while (k < body.length && body[k] === ' ') k += 1;
    let matcher = '';
    if (body[k] === '.') {
      k += 1;
      const mStart = k;
      while (k < body.length && /[A-Za-z0-9_$]/.test(body[k])) k += 1;
      matcher = body.slice(mStart, k);
    }
    let arg = null;
    let m = k;
    while (m < body.length && body[m] === ' ') m += 1;
    if (body[m] === '(') {
      const aClose = matchBracket(body, m);
      if (aClose > 0) arg = src.slice(bodyStart + m + 1, bodyStart + aClose);
    }
    found.push({
      matcher,
      subject,
      arg,
      line: lineOf(src, bodyStart + i),
      offset: bodyStart + i,
    });
    i = close + 1;
  }
  return found;
}

/**
 * 扫一个 TS 文件：找出全部用例 + 它们的断言承重。
 * @returns {{file:string,cases:Array,tautologies:Array,zeroAssert:Array,weakOnly:Array,conditional:Array}}
 */
export function scanTypeScriptSource(src, file) {
  const masked = maskSource(src);
  const cases = [];
  const re = /\b(?:it|test)\b/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const wordEnd = m.index + m[0].length;
    const after = masked.slice(wordEnd, wordEnd + 40);
    if (!/^\s*[.(\[]/.test(after)) { continue; }
    // 逐段吃掉 `.each` / `.skip` / `.only` 与括号组 ⇒ 最后一段括号才是「参数组」
    let j = wordEnd;
    let argsOpen = -1;
    let argsClose = -1;
    while (j < masked.length) {
      while (j < masked.length && /\s/.test(masked[j])) j += 1;
      if (masked[j] === '.') {
        j += 1;
        while (j < masked.length && /[A-Za-z0-9_$]/.test(masked[j])) j += 1;
        continue;
      }
      if (masked[j] === '(') {
        const close = matchBracket(masked, j);
        if (close < 0) break;
        argsOpen = j;
        argsClose = close;
        j = close + 1;
        continue;
      }
      break;
    }
    if (argsOpen < 0) continue;
    const argsText = masked.slice(argsOpen, argsClose + 1);
    const arrow = argsText.indexOf('=>');
    if (arrow < 0) continue;
    const braceRel = argsText.indexOf('{', arrow);
    if (braceRel < 0) continue;
    const bodyOpen = argsOpen + braceRel;
    const bodyClose = matchBracket(masked, bodyOpen);
    if (bodyClose < 0) continue;
    const body = masked.slice(bodyOpen, bodyClose + 1);
    const asserts = extractAssertions(body, bodyOpen, src);
    const branches = analyzeConditionalBranches(body, bodyOpen, src);
    let assertsInConditional = 0;
    for (const a of asserts) {
      for (const b of branches) {
        if (a.offset >= b.start && a.offset <= b.end) { assertsInConditional += 1; break; }
      }
    }
    const assertsOutsideConditional = asserts.length - assertsInConditional;
    // 分支外的「找不到就抛」查询 ⇒ ⇒ 也是无条件承重
    let queriesInside = 0;
    for (const b of branches) {
      queriesInside += countThrowQueries(body.slice(b.start - bodyOpen, b.end - bodyOpen + 1));
    }
    const queriesOutside = Math.max(0, countThrowQueries(body) - queriesInside);
    const conditionalAlwaysRuns = branches.length > 0 && branches.every((b) => b.alwaysRuns);
    // 「假绿」：整条用例的承重全挂在「可能不进的分支」上
    const falseGreen =
      asserts.length > 0 &&
      assertsOutsideConditional === 0 &&
      queriesOutside === 0 &&
      !conditionalAlwaysRuns;
    const nameMatch = /(['"`])([\s\S]*?)\1/.exec(src.slice(argsOpen, argsClose + 1));
    const name = nameMatch ? nameMatch[2] : '(未命名用例)';
    // ⚠️⚠️ **「抛异常的查询」也是承重断言**（2026-11-09 实测踩到的坑）：
    //   `await screen.findByText('tasks.title')` 找不到就会**抛异常** ⇒ ⇒ 用例红
    //   ⇒ ⇒ 它**就是**一条断言 ⇒ ⇒ 尺子若只认 `expect(` ⇒ ⇒ 会把
    //   「零断言」误判到**有承重**的用例上 ⇒ ⇒ 那叫**尺子在测错东西**。
    const queries = countThrowQueries(body);
    const weakOnly =
      asserts.length > 0 &&
      queries === 0 &&
      asserts.every(
        (a) => TRULY_WEAK_MATCHERS.has(a.matcher) && isBareIdentifier(a.subject),
      );
    cases.push({
      file,
      name,
      line: lineOf(src, argsOpen),
      asserts: asserts.length,
      queries,
      loadBearing: asserts.length + queries,
      weakOnly,
      assertionList: asserts,
      conditional: countConditional(body, bodyOpen, src),
      assertsInConditional,
      assertsOutsideConditional,
      conditionalAlwaysRuns,
      falseGreen,
    });
    re.lastIndex = bodyClose;
  }
  const tautologies = [];
  const zeroAssert = [];
  const weakOnly = [];
  for (const c of cases) {
    if (c.loadBearing === 0) zeroAssert.push(c);
    if (c.weakOnly) weakOnly.push(c);
    for (const a of c.assertionList || []) {
      // R1 只在「主体是字面量」时判红 —— expect(count).toBe(3) 的结论
      // 由被测物决定 ⇒ ⇒ 有承重 ⇒ ⇒ 不抓。
      if (!isLiteral(a.subject)) continue;
      // 匹配器**也**是字面量（或没有参数）⇒ ⇒ 结论在编译期就定了。
      if (a.arg !== null && !isLiteral(a.arg)) continue;
      tautologies.push({
        file: c.file,
        line: a.line,
        name: c.name,
        matcher: a.matcher,
        subject: a.subject.trim(),
      });
    }
  }
  return { file, cases, tautologies, zeroAssert, weakOnly, conditional: cases.filter((c) => c.conditional > 0), falseGreen: cases.filter((c) => c.falseGreen) };
}

/**
 * 条件化断言：断言落在「没有 else 的 if」分支里 ⇒ ⇒ 分支不进 ⇒ 零断言通过。
 */
/**
 * 数「找不到就抛异常」的查询调用（testing-library 的 findBy / getBy 家族）。
 * ⇒ ⇒ 它们本身就是承重断言 ⇒ ⇒ 零断言判定必须把它们算进去。
 *
 * ⚠️ 注释里**不许**出现「星号 + 斜杠」的组合 —— 它会**提前闭合**这段注释
 * ⇒ ⇒ 整个文件当场语法错（实测踩到过）。
 */
export function countThrowQueries(body) {
  const re = /\b(?:findBy|findAllBy|getBy|getAllBy)[A-Za-z]*\s*\(/g;
  let n = 0;
  let m;
  while ((m = re.exec(body)) !== null) n += 1;
  return n;
}

/**
 * 「没有 else 的 if」分支的条件是不会为假？
 *
 * ⚠️ **「分支恒进」也要认** —— 分支条件若是「找不到就抛异常」的查询
 *   （`getBy*` / `findBy*`，或由它赋值来的标识符）⇒ ⇒ 分支要么进、要么用例红
 *   ⇒ ⇒ 里面的断言**总会跑**⇒ ⇒ 不算风险。
 */
function isAlwaysRunningCondition(cond, maskedBody) {
  const c = String(cond || '').trim();
  if (new RegExp('\\b(?:findBy|findAllBy|getBy|getAllBy)[A-Za-z]*\\s*\\(').test(c)) return true;
  // 条件是裸标识符，而它在同一个用例里是被「找不到就抛」的查询赋值来的
  const id = c.replace(/^!/, '').replace(/\?$/, '').trim();
  if (!new RegExp('^[A-Za-z_$][A-Za-z0-9_$]*$').test(id)) return false;
  const assign = new RegExp(
    '(?:const|let|var)\\s+' + id + '\\s*=[^;]*\\b(?:findBy|findAllBy|getBy|getAllBy)[A-Za-z]*\\s*\\('
  );
  return assign.test(maskedBody);
}

/**
 * 逐条分析「没有 else 的 if」分支（含断言的那些）。
 * @returns {Array<{cond:string,start:number,end:number,alwaysRuns:boolean}>}
 */
export function analyzeConditionalBranches(body, bodyStart, src) {
  const branches = [];
  const re = new RegExp('\\bif\\s*\\(', 'g');
  let m;
  while ((m = re.exec(body)) !== null) {
    const condClose = matchBracket(body, m.index + m[0].length - 1);
    if (condClose < 0) continue;
    let k = condClose + 1;
    while (k < body.length && body[k] === ' ') k += 1;
    if (body[k] !== '{') continue;
    const blockClose = matchBracket(body, k);
    if (blockClose < 0) continue;
    const block = body.slice(k, blockClose + 1);
    if (!block.includes('expect')) { re.lastIndex = blockClose; continue; }
    let e = blockClose + 1;
    while (e < body.length && body[e] === ' ') e += 1;
    if (body.startsWith('else', e)) { re.lastIndex = blockClose; continue; }
    const cond = body.slice(m.index + m[0].length, condClose);
    branches.push({
      cond,
      start: bodyStart + k,
      end: bodyStart + blockClose,
      alwaysRuns: isAlwaysRunningCondition(cond, body),
    });
    re.lastIndex = blockClose;
  }
  return branches;
}
export function countConditional(body, bodyStart, src) {
  let count = 0;
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const condOpen = bodyStart + m.index + m[0].length - 1;
    const condClose = matchBracket(body, m.index + m[0].length - 1);
    if (condClose < 0) continue;
    let k = condClose + 1;
    while (k < body.length && body[k] === ' ') k += 1;
    if (body[k] !== '{') continue;
    const blockClose = matchBracket(body, k);
    if (blockClose < 0) continue;
    const block = body.slice(k, blockClose + 1);
    if (!block.includes('expect')) continue;
    let e = blockClose + 1;
    while (e < body.length && body[e] === ' ') e += 1;
    if (!body.startsWith('else', e)) count += 1;
    re.lastIndex = blockClose;
  }
  return count;
}

/* ── 普查：扫目录 ─────────────────────────────────────────────────────── */

/**
 * 扫一棵目录树里所有「看起来是用例」的 TS 文件。
 * @param {string} root
 * @param {typeof import('node:fs')} fs
 * @param {typeof import('node:path')} path
 */
export function censusDesktopAssertions(root, fs, path) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'dist-web') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(test|spec)\.(ts|tsx)$/.test(e.name)) continue;
      files.push(full);
    }
  };
  walk(root);
  files.sort();
  const results = [];
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    results.push(scanTypeScriptSource(src, f));
  }
  const summary = {
    files: results.length,
    cases: results.reduce((n, r) => n + r.cases.length, 0),
    assertions: results.reduce((n, r) => n + r.cases.reduce((m, c) => m + c.asserts, 0), 0),
    zeroAssert: results.reduce((n, r) => n + r.zeroAssert.length, 0),
    weakOnly: results.reduce((n, r) => n + r.weakOnly.length, 0),
    conditional: results.reduce((n, r) => n + r.conditional.length, 0),
  };
  return { files, results, summary };
}