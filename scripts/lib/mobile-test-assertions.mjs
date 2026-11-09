#!/usr/bin/env node
/**
 * **移动端用例的「断言承重」** —— 引擎（纯函数 · 零 I/O · 可被自检直接喂字符串）。
 * ============================================================================
 *
 * ## 它守什么
 *
 * 一条用例「跑过了」这句话，本身**也要被证一次**。
 *
 * ⚠️ **为什么这件事在移动端格外危险**（2026-11-09 实测，本仓 iBLOC/shadow）：
 *   · Flutter 的 `testWidgets` 里，只要**没有抛异常**，用例就是绿的
 *     ⇒ ⇒ 「用例体里一条断言都没有」照样绿；
 *   · `find.byType(X)` 找不到时，`if (finder.evaluate().isNotEmpty) { … }`
 *     ⇒ ⇒ **整条承重挂在分支上** ⇒ ⇒ 分支不进 ⇒ ⇒ 零断言通过；
 *   · `expect(true, isTrue)` ⇒ ⇒ 断言结果在**编译期**就定了
 *     ⇒ ⇒ 与被测物无关 ⇒ ⇒ 零信息量。
 *
 * ⇒ ⇒ 这三种在真机上都表现为「**PASS**」⇒ ⇒ 而**什么都没被证明**。
 * ⇒ ⇒ 所以要有闸。
 *
 * ## 两条红线
 *
 *   **R1 · 恒真断言** —— 断言的**主体是字面量常量**
 *     （true / false / null / 数字 / 字符串字面量）
 *     ⇒ ⇒ 断言结果与被测物无关 ⇒ ⇒ 零信息量。
 *     ⚠️ **只抓「字面量」不抓「标识符」** —— `expect(kMaxDepth, 20)`
 *     是**常量钉桩**（钉住一个会被人改掉的常量）⇒ ⇒ 那是有承重的
 *     ⇒ ⇒ 所以主体是标识符时**不判红**。
 *
 *   **R2 · 空断言用例** —— 用例体里**一条断言都没有**
 *     ⇒ ⇒ 用例名宣称的那个主张，**没有任何东西在核**
 *     ⇒ ⇒ 「跑过了」这个事实是空的。
 *     ⚠️ **不给豁免** —— 连「不抛异常」这个契约都有**显式写法**：
 *     `expect(() => f(), returnsNormally)`（单测）／
 *     `expect(tester.takeException(), isNull)`（widget 用例）
 *     ⇒ ⇒ 所以 R2 **没有**「合法的零断言用例」这种例外。
 *
 * ## 读数（**不判红**，但要看得见）
 *
 *   · **条件化断言** —— 部分断言落在「没有 else 的 if」分支里
 *     ⇒ ⇒ 分支不进 ⇒ ⇒ 那部分断言不承重；
 *   · **弱匹配器** —— `isNotNull` / `isNotEmpty` / `anything`
 *     ⇒ ⇒ 本身不是缺陷（可空类型上完全正当）⇒ ⇒ 但要**看得见**。
 *
 * ## 覆盖面：**靠发现**
 *
 * 扫到 `*_test.dart` 就算进面 ⇒ ⇒ 新写的用例**自动**进面
 * ⇒ ⇒ 漏判在结构上不可能发生。
 *
 * ## 防假绿
 *
 * · **注释与字符串都遮罩** ⇒ ⇒ 注释里写的 `expect(true, isTrue)`
 *   是说明文字 ⇒ ⇒ 不许抓；
 * · **一个文件都没读到 ⇒ ⇒ 退出码 2，不是 0** ⇒ ⇒ 「没红」≠「没问题」。
 *
 * @module mobile-test-assertions
 */

/** 跳过的目录（构建产物 / 依赖 / 工作树残留）。 */
export const SKIP_DIRS = new Set([
  'node_modules', 'build', '.dart_tool', '.git', '.local', '.symlinks',
  'coverage', 'out', 'Pods', '.gradle', '.idea', '.vscode', 'test-results',
]);

/**
 * Dart 感知的遮罩 —— **注释 → 空格**（保留换行），**字符串原样保留** ＋ 记下区间。
 *
 * ⚠️ **为什么字符串要原样保留**：我们要判断「断言主体是不是字面量」
 * ⇒ ⇒ 那必须看得到引号 ⇒ ⇒ 抹掉内容就分不出 'abc' 和 abc。
 * ⇒ ⇒ 于是**匹配后再核对「命中位置不在字符串里」**。
 *
 * ⚠️ **插值**：字符串里套字符串（形如 a['b'] 那种写法）
 * ⇒ ⇒ 朴素扫描会在内层的引号上把字符串**提前关掉**
 * ⇒ ⇒ 后面的配对全乱 ⇒ ⇒ 所以这里用**栈**（str / interp 两态）。
 *
 * @param {string} src
 * @returns {{code: string, ranges: Array<[number, number]>}}
 */
export function maskDart(src) {
  const s = String(src == null ? '' : src);
  const n = s.length;
  const out = new Array(n);
  const ranges = [];
  let i = 0;
  /** frame: {kind:'str', quote, raw, triple, start} | {kind:'interp', depth} */
  const stack = [];

  while (i < n) {
    const top = stack.length ? stack[stack.length - 1] : null;
    const inString = !!top && top.kind === 'str';

    // ── 代码态 ──────────────────────────────────────────────────────────
    if (!inString) {
      const ch = s[i];
      const nx = i + 1 < n ? s[i + 1] : '';
      if (ch === '/' && nx === '/') {
        while (i < n && s[i] !== '\n') { out[i] = ' '; i += 1; }
        continue;
      }
      if (ch === '/' && nx === '*') {
        out[i] = ' '; out[i + 1] = ' '; i += 2;
        while (i < n) {
          if (s[i] === '*' && s[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; break; }
          out[i] = s[i] === '\n' ? '\n' : ' ';
          i += 1;
        }
        continue;
      }
      if (ch === "'" || ch === '"') {
        const triple = nx === ch && s[i + 2] === ch;
        const prev = i > 0 ? s[i - 1] : '';
        const raw = prev === 'r' && !/[A-Za-z0-9_$]/.test(prev);
        const len = triple ? 3 : 1;
        stack.push({ kind: 'str', quote: ch, raw, triple, start: i });
        for (let k = 0; k < len; k += 1) out[i + k] = ch;
        i += len;
        continue;
      }
      if (ch === '$' && nx === '{' && top && top.kind === 'interp') {
        stack.push({ kind: 'interp', depth: 0 });
        out[i] = '$'; out[i + 1] = '{'; i += 2;
        continue;
      }
      if (ch === '}' && top && top.kind === 'interp' && top.depth === 0) {
        stack.pop();
        out[i] = '}'; i += 1;
        continue;
      }
      if (ch === '{' && top && top.kind === 'interp') top.depth += 1;
      else if (ch === '}' && top && top.kind === 'interp') top.depth -= 1;
      out[i] = ch; i += 1;
      continue;
    }

    // ── 字符串态 ────────────────────────────────────────────────────────
    const ch = s[i];
    const nx = i + 1 < n ? s[i + 1] : '';
    if (!top.raw && ch === '\\') { out[i] = ch; out[i + 1] = nx; i += 2; continue; }
    if (ch === '$' && nx === '{') {
      stack.push({ kind: 'interp', depth: 0 });
      out[i] = '$'; out[i + 1] = '{'; i += 2;
      continue;
    }
    if (top.triple) {
      if (ch === top.quote && nx === top.quote && s[i + 2] === top.quote) {
        out[i] = ch; out[i + 1] = nx; out[i + 2] = top.quote; i += 3;
        ranges.push([top.start, i - 1]);
        stack.pop();
        continue;
      }
    } else if (ch === top.quote) {
      out[i] = ch; i += 1;
      ranges.push([top.start, i - 1]);
      stack.pop();
      continue;
    } else if (ch === '\n') {
      out[i] = ch; i += 1;
      ranges.push([top.start, i - 1]);
      stack.pop();
      continue;
    }
    out[i] = ch; i += 1;
  }

  // 收尾：没闭合的字符串（源码坏了）⇒ ⇒ 也要记区间，别让它漏成「代码」
  while (stack.length) {
    const t = stack.pop();
    if (t.kind === 'str') ranges.push([t.start, Math.max(t.start, n - 1)]);
  }
  return { code: out.join(''), ranges };
}

/** 位置是否落在某个字符串区间里。 */
export function inRanges(ranges, idx) {
  for (const r of ranges) if (idx >= r[0] && idx <= r[1]) return true;
  return false;
}

/** 配对括号（跳过字符串区间）。 */
export function matchPair(code, ranges, open, openCh, closeCh) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (inRanges(ranges, i)) continue;
    const ch = code[i];
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 从 `from` 起算的**相对括号深度**序列（跳过字符串区间）。
 *
 * ⚠️ **为什么必须是「相对」深度**：判「这个 if 在不在用例体**顶层**」时，
 *   绝对深度没有意义（用例体在文件里的嵌套位置各不相同）⇒ ⇒ 只能看**相对**用例体起点的深度。
 *   用例体起点那个 `{` 之后 ⇒ ⇒ **顶层语句**的深度是 **1**。
 *
 * @returns {Int32Array} 长度 = to - from，marks[i] = 位置 i 处的深度
 */
export function relativeDepths(code, ranges, from, to) {
  const marks = new Int32Array(Math.max(0, to - from));
  let depth = 0;
  for (let i = from; i < to; i += 1) {
    if (!inRanges(ranges, i)) {
      const ch = code[i];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    }
    marks[i - from] = depth;
  }
  return marks;
}

/** 顶层逗号切分（跳过字符串与嵌套括号）。 */
export function splitTopArgs(text, ranges, base) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let curStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inRanges(ranges, base + i)) {
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ',' && depth === 0) {
        parts.push({ text: cur, start: curStart });
        cur = '';
        curStart = base + i + 1;
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim().length) parts.push({ text: cur, start: curStart });
  return parts;
}

/**
 * **用例体**的区间。
 *
 * ⚠️ **为什么不能「找 test( 的收尾括号之后再找 '{'」**
 *   （2026-11-09 实测踩到）：Dart 的用例体是 test('名字', () { … })
 * ⇒ ⇒ 体的 '{' 在 **test( 的收尾括号之前** ⇒ ⇒ 那样找会永远找不到
 * ⇒ ⇒ 症状：**每一条用例都被算成「零断言」**（790 条全红）。
 * ⇒ ⇒ 所以这里在**参数区里**找「括号深度为 0 的第一个 '{'」。
 */
export function findCaseBody(code, ranges, open, close) {
  const region = code.slice(open + 1, close);
  let depth = 0;
  for (let i = 0; i < region.length; i += 1) {
    const abs = open + 1 + i;
    if (inRanges(ranges, abs)) continue;
    const ch = region[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === '{' && depth === 0) {
      const end = matchPair(code, ranges, abs, '{', '}');
      return { start: abs, end: end > 0 ? end : code.length };
    }
  }
  return { start: open + 1, end: close };
}

/** 匹配器的分类（只用于**读数**，不判红）。 */
export function classifyMatcher(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (/^anything$/.test(t)) return 'anything';
  if (/^isNotNull$/.test(t)) return 'isNotNull';
  if (/^isNull$/.test(t)) return 'isNull';
  if (/^isNotEmpty$/.test(t)) return 'isNotEmpty';
  if (/^isEmpty$/.test(t)) return 'isEmpty';
  if (/^isTrue$/.test(t)) return 'isTrue';
  if (/^isFalse$/.test(t)) return 'isFalse';
  if (/^isA</.test(t)) return 'isA';
  return 'other';
}

/**
 * 这个主体是不是**字面量常量**？
 *
 * ⚠️ **只认字面量，不认标识符** —— expect(kMaxDepth, 20) 是常量钉桩
 * ⇒ ⇒ 它钉住一个会被人改掉的常量 ⇒ ⇒ 那是有承重的 ⇒ ⇒ 不该判红。
 *
 * ⚠️⚠️ **2026-11-09 实测踩到（这条闸的第一版失真）**：
 *   第一版把「以 '(' 开头」也算集合字面量 ⇒ ⇒ 于是
 *   `expect((landing - target).distance, lessThan(25.0))`
 *   被判成恒真 ⇒ ⇒ **21 条假红**（全是「带括号的表达式」）。
 *   ⇒ ⇒ 集合字面量**只认 '[' 与 '{'** ⇒ ⇒ '(' 一律是**括号表达式**，不是字面量。
 */
export function isLiteralSubject(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^(true|false|null)$/.test(t)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return true;
  const m = /^('{1,3}|"{1,3})([\s\S]*)\1$/.exec(t);
  if (m) return true;
  // Dart 的 const 表达式是**编译期常量**
  if (/^const\s/.test(t)) return true;
  // 集合字面量（**只认 '[' 与 '{'**）⇒ ⇒ 且内容里不许有「字符串之外的标识符」
  if (/^[\[{]/.test(t)) {
    const inner = t.slice(1, -1);
    return !hasIdentifierOutsideStrings(inner);
  }
  return false;
}

/** 字符串之外的任何标识符？（用来判「集合字面量里全是常量」） */
export function hasIdentifierOutsideStrings(text) {
  const s = String(text == null ? '' : text);
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    const nx = i + 1 < n ? s[i + 1] : '';
    if (ch === "'" || ch === '"') {
      const triple = nx === ch && s[i + 2] === ch;
      const q = ch;
      const len = triple ? 3 : 1;
      i += len;
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue; }
        if (triple) {
          if (s[i] === q && s[i + 1] === q && s[i + 2] === q) { i += len; break; }
        } else if (s[i] === q) { i += len; break; }
        i += 1;
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) return true;
    i += 1;
  }
  return false;
}

/** 已知的**无参 / 纯常量**匹配器名（白名单）。 */
export const MATCHER_NAMES = new Set([
  'isTrue', 'isFalse', 'isNull', 'isNotNull', 'isEmpty', 'isNotEmpty',
  'anything', 'isA', 'equals', 'isNot', 'contains', 'containsPair',
  'greaterThan', 'greaterThanOrEqualTo', 'lessThan', 'lessThanOrEqualTo',
  'closeTo', 'startsWith', 'endsWith', 'matches', 'hasLength', 'isIn',
  'allOf', 'anyOf', 'predicate', 'throwsA', 'throws', 'returnsNormally',
  'completes', 'completion', 'isNotNaN', 'isNaN', 'isPositive', 'isNegative',
  'isZero', 'orderedEquals', 'unorderedEquals', 'findsOneWidget',
  'findsNothing', 'findsWidgets', 'findsNWidgets', 'same', 'inInclusiveRange',
  'isValid', 'isNotEmpty', 'allOf', 'isNot', 'emits', 'emitsInOrder',
  'emitsThrough', 'isA', 'isNot', 'hasLength', 'isTrue',
]);

/** 字面量关键字（出现在匹配器参数里也不代表运行时依赖）。 */
const LITERAL_KEYWORDS = new Set(['true', 'false', 'null', 'const']);

/**
 * 这个匹配器是不是**恒定的**（结论只取决于编译期常量）？
 *
 * ⚠️⚠️ **为什么主体恒定**不够**（2026-11-09 实测踩到，本闸第一版的第二个错）：
 *   `expect(['Reminder', 'Overdue'], contains(n.type))`
 * ⇒ ⇒ 主体是常量集合 ⇒ ⇒ **但结论由 n.type 决定** ⇒ ⇒ 那是一条**真断言**
 * ⇒ ⇒ 把它判成恒真就是**假红**。
 * ⇒ ⇒ 所以恒真必须**两头都恒定**：主体恒定 **且** 匹配器恒定。
 *
 * ⚠️ **保守方向**：认不出来的匹配器 ⇒ ⇒ 当成「**不是**恒定」⇒ ⇒ 不判红
 * ⇒ ⇒ 新引入的匹配器不会把 CI 撞红（宁可漏抓，不许误伤）。
 */
export function isConstantMatcher(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  // ⚠️ **字面量当匹配器** —— Dart 里 `expect(x, 'abc')` 等价于 `equals('abc')`
  // ⇒ ⇒ 它是恒定的 ⇒ ⇒ 主体恒定 + 它恒定 ⇒ ⇒ 整条断言是恒真。
  if (isLiteralSubject(t)) return true;
  const m = /^([A-Za-z_$][\w$]*)\s*(?:<([^<>]*)>)?\s*(?:\(([\s\S]*)\))?$/.exec(t);
  if (!m) return false;
  const name = m[1];
  const args = m[3];
  if (args === undefined) return MATCHER_NAMES.has(name);
  const { code } = maskDart(args);
  const ids = code.match(/[A-Za-z_$][\w$]*/g) || [];
  for (const id of ids) {
    if (!MATCHER_NAMES.has(id) && !LITERAL_KEYWORDS.has(id)) return false;
  }
  return true;
}

const ASSERT_RE = /\b(expect|expectLater|expectError|fail)\s*\(/g;

/**
 * **恒进**判定 —— 「找不到就抛」的访问 ⇒ ⇒ 分支**必然执行** ⇒ ⇒ 断言一定跑到。
 *
 * ⚠️ **为什么要有这一层**（2026-11-09，桌面端那条线先踩到）：
 *   承重的断言若全在「可能不进的 if」里 ⇒ ⇒ 分支不进 ⇒ ⇒ **零断言通过**（假绿）
 *   ⇒ ⇒ 该判红；**但**若那个分支**恒进** ⇒ ⇒ 分支必进 ⇒ ⇒ 断言一定跑到
 *   ⇒ ⇒ **不是**假绿 ⇒ ⇒ **不许**判红。
 *
 * 恒进有两种形状（Dart 版）：
 *   ① 条件里出现「**找不到就抛**」的访问 ——
 *      `tester.widget<T>(finder)` / `tester.getSemantics(finder)` /
 *      `tester.renderObject(finder)` ⇒ ⇒ 找不到就**用例直接红**；
 *   ② 条件是「某个标识符 **!= null**」、而它在同一用例里被赋值自上述调用
 *      ⇒ ⇒ 那个标识符**不可能是 null** ⇒ ⇒ 条件恒真。
 *      ⚠️ **裸标识符不算**（`if (f)` 里的 f 可能是 bool ⇒ ⇒ 可能为 false）
 *      ⚠️ **`== null` 也不算**（那让分支**不执行** ⇒ ⇒ 是假绿，不是恒进）。
 *
 * ⚠️ **两种都是「事实」而不是「猜测」** ⇒ ⇒ 认得出来的才算恒进
 * ⇒ ⇒ 认不出来 ⇒ ⇒ 按「**不是**恒进」处理（⇒ ⇒ 该红就红 ⇒ ⇒ 不放过假绿）。
 */
export const THROWING_ACCESSORS = [
  /\.widget\s*</,
  /\.getSemantics\s*\(/,
  /\.renderObject\s*\(/,
];

/**
 * 这个 if 条件是不是**恒进**（分支必然执行）？
 * @param {string} cond 条件文本（括号里的那一段）
 * @param {string} [bodyText] 同一用例的体（用来认「标识符被赋值自抛调用」）
 */
export function isAlwaysTakenCondition(cond, bodyText) {
  const c = String(cond || '');
  if (!c.trim()) return false;
  // ① 条件**自己**就调了「找不到就抛」的访问
  //    ⇒ ⇒ 要么抛（用例直接红），要么条件为真 ⇒ ⇒ 分支必然执行。
  if (THROWING_ACCESSORS.some((re) => re.test(c))) return true;

  // ② 条件是「某个标识符 **!= null**」，而那个标识符在**同一用例**里
  //    被赋值自上述「找不到就抛」的访问
  //    ⇒ ⇒ 赋值成功则它**非 null**；赋值失败则用例**已经红了**（到不了这里）
  //    ⇒ ⇒ 该条件恒真。
  //
  // ⚠️ **只认 `!= null`，不认裸标识符、也不认 `== null`**（2026-11-11 收紧）：
  //   · 裸标识符 `if (f)`：Dart 里 `if (f)` 要么 f 是 bool（**可能为 false**）
  //     要么 f 是引用类型（**不可能做条件**）⇒ ⇒ 认不出来的类型 ⇒ ⇒ 不判恒进
  //     （宁可漏抓，不许误伤）。
  //   · `== null`：f 非 null 时恒为 **false** ⇒ ⇒ 分支**不执行**
  //     ⇒ ⇒ 那正是**假绿**（该红），不是恒进。
  const m = /^([A-Za-z_$][\w$]*)\s*!=\s*null$/.exec(c.trim());
  if (m && bodyText) {
    const name = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // ⚠️ `[^;]*` 允许**跨行**（赋值语句常折行）⇒ ⇒ 但**遇分号就停**
  //   ⇒ ⇒ 不会吃到别的语句里去。
    const assign = new RegExp('\\b' + name + '\\s*=\\s*[^;]*', 'g');
    const hit = assign.exec(String(bodyText));
    if (hit && THROWING_ACCESSORS.some((re) => re.test(hit[0]))) return true;
  }
  return false;
}

/**
 * 「**没有 else** 的 if」的块范围 ⇒ ⇒ 落在里面的断言是**条件化**的。
 *
 * ⚠️ **「没有 else」是命根子**（2026-11-09，桌面端那条线踩过）：
 *   有 `else`（含 `else if`）的分支 ⇒ ⇒ **两边都会跑其中一边**
 *   ⇒ ⇒ 它**不可能**造成「零断言通过」⇒ ⇒ **不许**算进条件化。
 *
 * @returns {Array<{start:number,end:number,cond:string}>} **字符偏移**区间（不用行号）
 */
export function ifOnlyRegions(code, ranges, bodyStart, bodyEnd) {
  const regions = [];
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(code.slice(bodyStart, bodyEnd))) !== null) {
    const abs = bodyStart + m.index;
    if (inRanges(ranges, abs)) continue;
    const popen = code.indexOf('(', abs);
    const pclose = matchPair(code, ranges, popen, '(', ')');
    if (pclose < 0) continue;
    let brace = -1;
    for (let i = pclose + 1; i < bodyEnd; i += 1) {
      if (inRanges(ranges, i)) continue;
      if (code[i] === '{') { brace = i; break; }
      if (code[i] === ';') { brace = -1; break; }
    }
    if (brace < 0) continue;
    const bclose = matchPair(code, ranges, brace, '{', '}');
    if (bclose < 0) continue;
    let k = bclose + 1;
    while (k < code.length && /\s/.test(code[k])) k += 1;
    const hasElse = /^else\b/.test(code.slice(k, k + 8));
    if (!hasElse) {
      regions.push({
        start: brace,
        end: bclose,
        cond: code.slice(popen + 1, pclose),
      });
    }
  }
  return regions;
}

export const lineOf = (code, idx) => code.slice(0, Math.max(0, idx)).split('\n').length;

/**
 * 「**用例级早退守卫**」：用例体**顶层**（相对深度 1）的、没有 else 的 if 分支，
 * 且分支里有 `return` / `continue` / `break` ⇒ ⇒ 条件不成立时**整个用例提前结束**
 * ⇒ ⇒ 后面的断言一条都不跑 ⇒ ⇒ 用例**零断言通过**（假绿的另一种形态）。
 *
 * ⚠️ **为什么必须限定在「顶层」**：HTTP mock 的 route handler 里也有
 *   `if (path == '/x') { return; }` ⇒ ⇒ 那个 `return` 只是「这次不处理这个请求」，
 *   与「用例跑没跑断言」无关 ⇒ ⇒ 它在闭包里（相对深度 ≥ 2）⇒ ⇒ 天然被排除。
 *   ⚠️ 深度口径：分支 `{` **处**的深度 = `if` 所在层 + 1 ⇒ ⇒ 顶层 `if` ⇒ 分支 `{` 处 = **2**。
 *
 * ⚠️ **为什么它只作读数、不判红**（2026-11-11 实测决策）：
 *   实测全仓 26 处这一族**全部**在 `integration_test/` ⇒ ⇒ 而 CI 的 `flutter test`
 *   （`.github/workflows/ci.yml`）**只跑 `test/`** ⇒ ⇒ `integration_test/` **不被执行**
 *   ⇒ ⇒ 判红 = 红一个 CI 从不执行的用例 ⇒ ⇒ **假红**（判据恒红 ⇒ ⇒ 尺子坏了）。
 *   ⇒ ⇒ 它们是**有意的环境守卫**（端脑不可达就跳过）⇒ ⇒ 但必须**逐条点名登记**，
 *   因为真机跑这一族时端脑一挂 ⇒ ⇒ 这 26 条会**静默全绿**（失败长得像成功）。
 *
 * @returns {Array<{start:number,end:number,cond:string,line:number}>}
 */
export function findGuardRegions(code, ranges, bodyStart, bodyEnd) {
  const marks = relativeDepths(code, ranges, bodyStart, bodyEnd);
  const out = [];
  for (const r of ifOnlyRegions(code, ranges, bodyStart, bodyEnd)) {
    const rel = marks[r.start - bodyStart];
    if (rel !== 2) continue;
    const inner = code.slice(r.start, r.end);
    if (!/\b(return|continue|break)\b/.test(inner)) continue;
    out.push({ start: r.start, end: r.end, cond: r.cond, line: lineOf(code, r.start) });
  }
  return out;
}

/**
 * 扫**一段 Dart 源码** ⇒ 用例与断言的清单（纯函数 ⇒ 自检可以直接喂字符串）。
 *
 * @param {string} text 源码
 * @param {string} [relPath] 相对路径（只用于读数）
 */
export function scanDartSource(text, relPath) {
  const { code, ranges } = maskDart(text);
  const cases = [];
  const tautologies = [];
  const zeroAssert = [];
  const conditional = [];
  const guards = [];
  const weakTally = {};
  let assertCount = 0;

  // ── 断言普查 ────────────────────────────────────────────────────────────
  const re = /\b(expect|expectLater)\s*\(/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (inRanges(ranges, m.index)) continue;
    const open = code.indexOf('(', m.index);
    const close = matchPair(code, ranges, open, '(', ')');
    if (close < 0) continue;
    const args = splitTopArgs(code.slice(open + 1, close), ranges, open + 1);
    if (args.length < 2) continue;
    const subject = args[0].text.trim();
    const matcher = args[1].text.trim();
    assertCount += 1;
    const kind = classifyMatcher(matcher);
    if (kind === 'isNotNull' || kind === 'isNotEmpty' || kind === 'anything') {
      weakTally[kind] = (weakTally[kind] || 0) + 1;
    }
    if (isLiteralSubject(subject) && isConstantMatcher(matcher)) {
      tautologies.push({
        file: relPath || null,
        line: lineOf(code, m.index),
        subject,
        matcher: matcher.slice(0, 60),
      });
    }
  }

  // ── 用例普查 ────────────────────────────────────────────────────────────
  const tre = /\b(test|testWidgets)\s*\(/g;
  let t;
  while ((t = tre.exec(code)) !== null) {
    if (inRanges(ranges, t.index)) continue;
    const open = code.indexOf('(', t.index);
    const close = matchPair(code, ranges, open, '(', ')');
    if (close < 0) continue;
    const args = splitTopArgs(code.slice(open + 1, close), ranges, open + 1);
    const name = args[0] ? args[0].text.trim().slice(0, 80) : '(无名)';
    const body = findCaseBody(code, ranges, open, close);

    const asserts = [];
    const cre = new RegExp(ASSERT_RE.source, 'g');
    let c;
    while ((c = cre.exec(code.slice(body.start, body.end))) !== null) {
      if (!inRanges(ranges, body.start + c.index)) asserts.push(body.start + c.index);
    }

    const regions = ifOnlyRegions(code, ranges, body.start, body.end);
    const guardRegions = findGuardRegions(code, ranges, body.start, body.end);
    const bodyText = code.slice(body.start, body.end);
    const condCount = asserts.filter((o) => regions.some((r) => o >= r.start && o <= r.end)).length;
    const unconditionalCount = asserts.length - condCount;
    // ⚠️ **恒进**：含断言的那些分支里，**至少有一个**是恒进的
    // ⇒ ⇒ 那个分支的断言**一定跑到** ⇒ ⇒ 即使别的分支不进，也**不是**零断言通过。
    const alwaysTaken = regions.some(
      (r) => asserts.some((o) => o >= r.start && o <= r.end)
        && isAlwaysTakenCondition(r.cond, bodyText),
    );

    const rec = {
      file: relPath || null,
      line: lineOf(code, t.index),
      name,
      asserts: asserts.length,
      conditionalAsserts: condCount,
      unconditionalAsserts: unconditionalCount,
      alwaysTaken,
    };
    cases.push(rec);

    // ── 用例级早退守卫（只作读数 ⇒ 不进三层分类）────────────────────
    if (guardRegions.length) {
      guards.push({
        file: relPath || null,
        line: guardRegions[0].line,
        name,
        asserts: asserts.length,
        guardCount: guardRegions.length,
        conds: guardRegions.map((g) => g.cond.trim().slice(0, 60)),
      });
    }

    // ── 三层分类（互斥且穷尽「含条件断言的用例」）─────────────────────
    if (asserts.length === 0) {
      zeroAssert.push(rec);
    } else if (condCount === 0) {
      // 无条件承重 ⇒ ⇒ 不进三层
    } else if (condCount === asserts.length && alwaysTaken) {
      conditional.push({ ...rec, kind: 'always-taken' });     // 层 1：恒进
    } else if (condCount === asserts.length) {
      conditional.push({ ...rec, kind: 'false-green' });      // 层 3：真·假绿 ⇒ ⇒ R3 红
    } else {
      conditional.push({ ...rec, kind: 'some-conditional' });  // 层 2：另有无条件承重
    }
  }

  return { cases, tautologies, zeroAssert, conditional, guards, weakTally, assertCount };
}

/**
 * 普查一棵仓 ⇒ 清单 ＋ 读数（读盘版）。
 *
 * ⚠️ **覆盖面靠发现**：扫到 *_test.dart 就算进面 ⇒ ⇒ 新用例自动进面。
 *
 * @param {string} root 仓根
 * @param {object} fsMod node:fs
 * @param {object} pathMod node:path
 */
export function censusMobileAssertions(root, fsMod, pathMod) {
  const fs = fsMod;
  const path = pathMod;
  const files = [];
  const unjudged = [];

  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(p);
      } else if (e.isFile() && e.name.endsWith('_test.dart')) {
        files.push(p);
      }
    }
  };
  walk(root);

  const allTautologies = [];
  const allZero = [];
  const allConditional = [];
  const allGuards = [];
  const weakTally = {};
  let cases = 0;
  let assertCount = 0;

  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    let raw;
    try { raw = fs.readFileSync(abs, 'utf8'); } catch {
      unjudged.push({ file: rel, reason: '读不出来' });
      continue;
    }
    const r = scanDartSource(raw, rel);
    cases += r.cases.length;
    assertCount += r.assertCount;
    allTautologies.push(...r.tautologies);
    allZero.push(...r.zeroAssert);
    allConditional.push(...r.conditional);
    allGuards.push(...r.guards);
    for (const k of Object.keys(r.weakTally)) {
      weakTally[k] = (weakTally[k] || 0) + r.weakTally[k];
    }
  }

  return {
    files: files.length,
    cases,
    assertCount,
    tautologies: allTautologies,
    zeroAssert: allZero,
    conditional: allConditional,
    guards: allGuards,
    weakTally,
    unjudged,
    summary: {
      files: files.length,
      cases,
      assertCount,
      tautologies: allTautologies.length,
      zeroAssert: allZero.length,
      alwaysTaken: allConditional.filter((c) => c.kind === 'always-taken').length,
      someConditional: allConditional.filter((c) => c.kind === 'some-conditional').length,
      falseGreen: allConditional.filter((c) => c.kind === 'false-green').length,
      conditionalCases: allConditional.length,
      guardCases: allGuards.length,
      unjudged: unjudged.length,
    },
  };
}
