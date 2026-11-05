/**
 * E2E 凭据头的**形状**判据 —— 纯函数（零依赖 · 零 I/O）。
 * ============================================================================
 *
 * ## 守什么
 *
 * 端脑那几扇门要凭据（`x-admin-token` / `x-shadow-key`）⇒ ⇒ Playwright 这边
 * 必须把头**注入到每一个请求上** ⇒ ⇒ 而唯一一处注入点是 `use.extraHTTPHeaders`。
 *
 * ⚠️ **那个形状错了不会报错** —— 2026-11-05 真机实测：把
 * `{ 'x-admin-token': …, 'x-shadow-key': … }` 直接 spread 到 `use` 的**顶层**
 * ⇒ ⇒ Playwright **既不报错也不告警**（它不认这个 use 选项）⇒ ⇒ 测试照样 pass
 * ⇒ ⇒ 而**一个头都发不出去** ⇒ ⇒ 端脑那扇门一律 401 ⇒ ⇒ CI 上那批红
 * 「长得像」鉴权失败，其实是**配置形状写错了**。
 *
 * ⇒ ⇒ 所以判据是**形状**的：凭据头字面量**只允许**出现在 `extraHTTPHeaders`
 * 那个配平的块里 ⇒ ⇒ 出现在别处（典型：use 的顶层）⇒ ⇒ 红。
 *
 * ## 防假绿
 *
 * · **注释是噪声** —— 判据前先剥注释（复用 `strip-comments.mjs`）⇒ ⇒ 注释里
 *   提到头名不误报；
 * · **块要配平** —— 花括号不配平 ⇒ ⇒ 判**「形状不可解析」**（红）⇒ ⇒ 不许
 *   因为「解析不出来」而当成「没问题」。
 */

export const CREDENTIAL_HEADERS = ['x-admin-token', 'x-shadow-key'];

/** 从 openBrace 起找配平的 '}'；找不到返回 -1。 */
export function matchBrace(code, openBrace) {
  const text = String(code || '');
  if (openBrace < 0 || text[openBrace] !== '{') return -1;
  let depth = 0;
  for (let i = openBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineOf(text, index) {
  return String(text).slice(0, Math.max(0, index)).split('\n').length;
}

/**
 * @param {string} code **已剥注释**的源码
 * @returns {{issues: Array<object>, total: number, hasExtraBlock: boolean}}
 */
export function findCredentialShapeIssues(code) {
  const text = String(code || '');
  const issues = [];

  // ── 定位 extraHTTPHeaders 的那个配平块 ──
  const kw = text.indexOf('extraHTTPHeaders');
  let range = null;
  let unparsable = false;
  if (kw >= 0) {
    const open = text.indexOf('{', kw);
    const close = matchBrace(text, open);
    if (open >= 0 && close > 0) range = [open, close];
    else unparsable = true;
  }

  // ── 凭据头字面量必须只出现在那个块里 ──
  let total = 0;
  for (const h of CREDENTIAL_HEADERS) {
    const re = new RegExp('[\'"`]' + h + '[\'"`]\\s*:', 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      total += 1;
      const inside = !!range && m.index >= range[0] && m.index < range[1];
      if (!inside) {
        issues.push({ kind: 'outside-extraHTTPHeaders', header: h, line: lineOf(text, m.index) });
      }
    }
  }

  // ── 有凭据头却没有那个块 ⇒ ⇒ 形状压根没落地 ──
  if (total > 0 && !range) {
    issues.push({ kind: 'missing-extraHTTPHeaders', header: null, line: lineOf(text, kw >= 0 ? kw : 0) });
  }
  // ── 块在、但花括号不配平 ⇒ ⇒ 判「形状不可解析」（红，不许当没问题）──
  if (unparsable) {
    issues.push({ kind: 'unparsable-extraHTTPHeaders', header: null, line: lineOf(text, kw) });
  }

  return { issues, total, hasExtraBlock: !!range };
}