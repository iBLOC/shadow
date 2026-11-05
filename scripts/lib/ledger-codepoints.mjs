/**
 * 「账本圈码」的自洽性 —— **纯函数**判据（判据与 I/O 分离，脚本层只管跑）。
 *
 * ## 判据只有两条
 *
 * **R1（不撞号）**：每个条目标题里那个**方块字**的**原始码位**必须两两不同。
 * ⇒ ⇒ 这一条挡的是「两个条目占同一个码位」⇒ ⇒ 那正是 2026-11-05 那次
 *    撞号事故（两条都写 U+33A0 ⇒ 引用变歧义 ⇒ 连累两条闸红）。
 *
 * **R2（注解自洽）**：一个条目若在正文里声明了「本条占 **U+XXXX**」，
 * 那么这个 U+XXXX **必须等于**它自己标题里那个字的**原始码位**。
 * ⇒ ⇒ 这一条挡的是「注解写错」⇒ ⇒ 2026-11-05 实测：五条条目的注解
 *    写的是 U+340x（**CJK 扩展 A 的汉字**），而落盘的字符是 U+334x
 *    （**CJK 兼容表意文字**）⇒ ⇒ 差 0xC0 ⇒ ⇒ 注解在说假话。
 *
 * ⚠️ **为什么不能用 NFKC 判重**：`㍀`（U+3340）的 NFKC 是**磅**（片假名）
 * ⇒ ⇒ 拿 NFKC 去重会把几个**不同**的条目全判成重复 ⇒ ⇒ **只认原始码位**。
 *
 * ⚠️ **为什么 R2 只看「本条占」**：正文里大量出现**别条的引用**
 * （「承 U+33A0 那笔…」）与**反例**（「U+FFFD 是损坏字符」）
 * ⇒ ⇒ 若把正文里**所有** `U+XXXX` 都当声明 ⇒ ⇒ 必然误报。
 */

export const HEADER_PREFIX = '**Updated**';
export const OWN_CLAIM = /本条占\s*\*\*U\+([0-9A-Fa-f]{4,6})/;

export function hex4(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

/** 切出每个条目：标题行、标题里那个字、它的原始码位、正文里的「本条占」声明。 */
export function extractEntries(text) {
  const lines = text.split(/\r?\n/);
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(HEADER_PREFIX)) continue;
    const m = lines[i].match(/\(([^\s(])/);
    heads.push({ line: i + 1, ch: m ? m[1] : null, cp: m ? m[1].codePointAt(0) : null });
  }
  const entries = [];
  for (let k = 0; k < heads.length; k++) {
    const start = heads[k].line - 1;
    const end = k + 1 < heads.length ? heads[k + 1].line - 1 : lines.length;
    const body = lines.slice(start, end).join('\n');
    const own = body.match(OWN_CLAIM);
    entries.push({
      line: heads[k].line,
      ch: heads[k].ch,
      cp: heads[k].cp,
      actual: heads[k].cp == null ? null : hex4(heads[k].cp),
      claimed: own ? own[1].toUpperCase() : null,
    });
  }
  return entries;
}

/** 判据本体：返回 { dups, mismatched, entries }。 */
export function findViolations(text) {
  const entries = extractEntries(text);
  const byCp = new Map();
  for (const e of entries) {
    if (e.actual == null) continue;
    if (!byCp.has(e.actual)) byCp.set(e.actual, []);
    byCp.get(e.actual).push(e.line);
  }
  const dups = [...byCp.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([cp, lines]) => ({ cp, lines }));
  const mismatched = entries
    .filter((e) => e.claimed && e.actual != null && e.claimed !== e.actual)
    .map((e) => ({ line: e.line, ch: e.ch, actual: e.actual, claimed: e.claimed }));
  return { entries, dups, mismatched };
}