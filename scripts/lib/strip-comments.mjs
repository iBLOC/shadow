/**
 * 剥注释 —— 把注释**抹成空格**（保留换行 ⇒ 行号不变）⇒ 后面只在「代码」上找模式。
 *
 * ⚠️ 为什么必须剥：源码里**到处是注释**，其中**恰好**写着被查的那些字样
 * （例如 `dev-admin-key` 在注释里出现 4 处、`0.0.0.0` 在注释里出现多处）
 * ⇒ 不剥就是一堆误报 ⇒ 闸门会被当成噪音关掉。
 *
 * ⚠️ **Rust 的块注释可嵌套，TS/Dart 的不可** ⇒ 同一对块注释记号（斜杠星 /
 * 星斜杠）在两种语言里含义不同 ⇒ 这里用 `nested` 参数区分
 * （这个坑本仓已踩过一次，见 AGENTS.md ㊺ 条）。
 *
 * ⚠️ **Rust 的 `'` 不是字符串引号** —— 它是**生命周期**（`&'a str`）。
 * 把 `'` 一律当引号 ⇒ 会从生命周期一路吞到下一个 `'` ⇒ 代码结构被吃乱
 * ⇒ 函数体边界失配 ⇒ 正则在超长片段上反复跑 ⇒ 平方级变慢。
 * ⇒ 只有**真的像字符字面量**（`'x'` / `'\n'`）才当引号。
 *
 * 这个模块是**共享**的：`check-auth-backdoors.mjs`（认证后门闸）与
 * `check-bind-exposure.mjs`（宽绑定闸）共用同一份实现 ——
 * ⚠️ 之前把 `stripComments` 放在认证闸里并 `import` 它 ⇒ **认证闸的
 * `main()` 在导入时被一起执行了**（闸门跑闸门）⇒ ⇒ 抽成独立模块。
 */

/**
 * @param {string} src 源文件内容
 * @param {{nested?: boolean, rust?: boolean}} opts
 *   `nested` = 块注释可嵌套（Rust）；`rust` = 按 Rust 的词法规则处理引号。
 * @returns {string} 注释被抹成空格后的代码（长度与行数不变）
 */
export function stripComments(src, { nested, rust }) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      out += '  ';
      i += 2;
      while (i < n && depth > 0) {
        if (nested && src[i] === '/' && src[i + 1] === '*') {
          depth++;
          out += '  ';
          i += 2;
          continue;
        }
        if (src[i] === '*' && src[i + 1] === '/') {
          depth--;
          out += '  ';
          i += 2;
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    if (ch === '"') {
      // 字符串字面量：原样保留，但**跳过**里面的注释符号
      out += ch;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          out += '"';
          i++;
          break;
        }
        out += src[i] === '\n' ? '\n' : src[i];
        i++;
      }
      continue;
    }
    if (ch === "'") {
      if (rust) {
        const isChar =
          (src[i + 1] !== undefined && src[i + 2] === "'") ||
          (src[i + 1] === '\\' && src[i + 2] !== undefined);
        if (!isChar) {
          out += "'";
          i++;
          continue;
        }
      }
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          out += quote;
          i++;
          break;
        }
        out += src[i] === '\n' ? '\n' : src[i];
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 抹掉 `#[cfg(test)]` 块 —— **测试代码不进产物** ⇒ 它里面的字面量
 * **不是**「源码默认值」。
 *
 * ⚠️ 为什么必须做：Rust 的单元测试**住在同一个文件里** ⇒ 闸扫
 * 「源码级宽绑定」时会把测试里的 `parse_bind("0.0.0.0:…")`
 * 这类**调用**算进去 ⇒ ⇒ 假红 ⇒ ⇒ 「闸红了」会被归错因
 * （本仓已踩：synapse `src/net/bind.rs` 的测试让闸多报 5 条 ⇒
 * 「9 条红」一度被说成「14 条红」）。
 *
 * 做法：找到 `#[cfg(...)]`（**内含 test**）之后的第一对花括号，
 * **整块抹成空格**（保留换行 ⇒ 行号不变 ⇒ 报出的行号仍对得上原文件）。
 *
 * ⚠️ 只抹**块**：`#[cfg(test)] let x = …;` 这种没有花括号 ⇒ 不抹
 * （它是行内语句，仍会被正常扫描）。
 */
export function stripTestModules(src) {
  const ranges = [];
  const re = /#\[cfg\(([^)]*)\)\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!/\btest\b/.test(m[1])) continue;
    const open = nextBrace(src, m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    ranges.push([m.index, close + 1]);
    re.lastIndex = close + 1;
  }
  if (ranges.length === 0) return src;
  let out = '';
  let pos = 0;
  for (const [a, b] of ranges) {
    out += src.slice(pos, a);
    out += src.slice(a, b).replace(/[^\n]/g, ' ');
    pos = b;
  }
  return out + src.slice(pos);
}

/** 跳过字符串字面量（返回它后面的下标）。 */
export function skipString(src, i) {
  const n = src.length;
  i += 1;
  while (i < n) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '"') return i + 1;
    i += 1;
  }
  return n;
}

/** 跳过字符字面量**或**生命周期标记（Rust 的 `'` 不是引号 ⇒ 两者要分开）。 */
export function skipCharOrLifetime(src, i) {
  const n = src.length;
  if (src[i + 1] === '\\') {
    let j = i + 2;
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === "'") return j + 1;
      j += 1;
    }
    return n;
  }
  if (src[i + 2] === "'") return i + 3;
  return i + 1;
}

/** 从 `from` 起找下一个花括号；先遇到 `;` ⇒ 不是块（返回 -1）。 */
function nextBrace(src, from) {
  const n = src.length;
  let i = from;
  while (i < n) {
    const ch = src[i];
    if (ch === '"') { i = skipString(src, i); continue; }
    if (ch === "'") { i = skipCharOrLifetime(src, i); continue; }
    if (ch === '{') return i;
    if (ch === ';') return -1;
    i += 1;
  }
  return -1;
}

/**
 * 配对（跳过字符串/字符字面量 ⇒ 里面的括号不算）。
 *
 * 支持 `{`/`}`、`(`/`)`、`[`/`]`。
 *
 * ⚠️ **一处实现** —— 公布地址闸与 `stripTestModules` 共用这一份
 * ⇒ ⇒ 别在闸里再抄一份括号扫描器（抄的那份迟早与这份漂）。
 */
export function matchDelim(src, open) {
  const n = src.length;
  const openCh = src[open];
  const closeCh =
    openCh === '{' ? '}' : openCh === '(' ? ')' : openCh === '[' ? ']' : null;
  if (!closeCh) return -1;
  let depth = 0;
  let i = open;
  while (i < n) {
    const ch = src[i];
    if (ch === '"') { i = skipString(src, i); continue; }
    if (ch === "'") { i = skipCharOrLifetime(src, i); continue; }
    if (ch === openCh) { depth += 1; i += 1; continue; }
    if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

/** 花括号配对（跳过字符串/字符字面量 ⇒ 里面的括号不算）。 */
export function matchBrace(src, open) {
  return matchDelim(src, open);
}

/**
 * 行号换算：给「代码里的偏移」找「原文件里的行号」。
 */
export function makeLineIndex(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') starts.push(i + 1);
  }
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
