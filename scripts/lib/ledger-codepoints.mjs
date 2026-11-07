/**
 * 「账本圈码」的自洽性 —— **纯函数**判据（判据与 I/O 分离，脚本层只管跑）。
 *
 * ## 判据四条
 *
 * **R1（不撞号）**：每个条目标题里那个**方块字**的**原始码位**必须两两不同。
 * ⇒ ⇒ 这一条挡的是「两个条目占同一个码位」⇒ ⇒ 那正是 2026-11-05 那次
 *    撞号事故（两条都写 U+33A0 ⇒ 引用变歧义 ⇒ 连累两条闸红）。
 *
 * **R2（注解自洽）**：一个条目若在正文里声明了「本条占 **U+XXXX**」，
 * 那么这个 U+XXXX **必须等于**它自己标题里那个字的**原始码位**。
 * ⇒ ⇒ 2026-11-05 实测：五条条目的注解写的是 U+340x（CJK 扩展 A 的汉字），
 *    而落盘的字符是 U+334x（CJK 兼容表意文字）⇒ ⇒ 差 0xC0 ⇒ ⇒ 注解在说假话。
 *
 * **R3（缝合残迹）**：任何一行只要**不是**以「**Updated**」开头、却嵌着
 * 「**Updated**: 日期」的标题形状 ⇒ ⇒ 行首锚被吞（插入工具的换行符变成了
 * 字面文本，把上一条与此条粘成一行）⇒ ⇒ 前一条与这一条**并体**。
 * ⇒ ⇒ 2026-11-06 ㌳ 插入事故实证：node -e 的 \r\n 转义经 pwsh 层加倍，
 *    缝合处出现 8 个可见字符，㎲ 条整个并进 ㌳ 条体 ⇒ ⇒ 当时闸**假绿**，
 *    唯一报警是条目计数 102≠应 103。R3 把那次形状变成**会红的读数**。
 *
 * **R4（异体声明）**：一个条目体里 OWN_CLAIM（「本条占 **U+十六进制**」）
 * 命中的码位若**不等于**它自己标题字的码位 ⇒ ⇒ 体里躺着**别条**的声明
 * ⇒ ⇒ 又是「并体」的签名（R3 挡得住带日期的锚残迹；R4 挡的是锚没了
 * 日期形态的残余）。
 * ⇒ ⇒ 为什么不会误报：真账本上的规则**引文**要么写占位符「U+XXXX」
 *    （非十六进制 ⇒ OWN_CLAIM 不命中），要么「本条占」后面不跟 **U+
 *    ⇒ 同样不命中（㎝ 条实测：3 处「本条占」只有自己那条真声明命中）。
 *
 * ⚠️ **为什么不能用 NFKC 判重**：`㍀`（U+3340）的 NFKC 是**磅**（片假名）
 * ⇒ ⇒ 拿 NFKC 去重会把几个**不同**的条目全判成重复 ⇒ ⇒ **只认原始码位**。
 *
 * ⚠️ **为什么 R2/R4 只看「本条占」**：正文里大量出现**别条的引用**
 * （「承 U+33A0 那笔…」）与**反例**（「U+FFFD 是损坏字符」）
 * ⇒ ⇒ 若把正文里**所有** `U+XXXX` 都当声明 ⇒ ⇒ 必然误报。
 */

export const HEADER_PREFIX = '**Updated**';
export const OWN_CLAIM = /本条占\s*\*\*U\+([0-9A-Fa-f]{4,6})/g;
// 标题形状：前缀 + 冒号 + 日期（R3 只认带日期的完整形状，免得把正文里
// 对插入锚点的工具性引用误伤——那些引用不带冒号日期）。
const HEADER_SHAPE = /\*\*Updated\*\*:\s*[12]\d{3}-/;

export function hex4(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

/** 切出每个条目：标题行、标题里那个字、它的原始码位、正文里的全部「本条占」声明。 */
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
    const bodyLines = lines.slice(start, end);
    const body = bodyLines.join('\n');
    const claims = [];
    let m;
    OWN_CLAIM.lastIndex = 0;
    while ((m = OWN_CLAIM.exec(body)) !== null) {
      claims.push({ claimed: m[1].toUpperCase(), offset: m.index });
    }
    entries.push({
      line: heads[k].line,
      ch: heads[k].ch,
      cp: heads[k].cp,
      actual: heads[k].cp == null ? null : hex4(heads[k].cp),
      claimed: claims.length > 0 ? claims[0].claimed : null,
      claims,
    });
  }
  return { entries, lines };
}

/** 判据本体：返回 { dups, mismatched, swallowed, foreign, entries }。 */
export function findViolations(text) {
  const { entries, lines } = extractEntries(text);
  const byCp = new Map();
  for (const e of entries) {
    if (e.actual == null) continue;
    if (!byCp.has(e.actual)) byCp.set(e.actual, []);
    byCp.get(e.actual).push(e.line);
  }
  const dups = [...byCp.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([cp, ls]) => ({ cp, lines: ls }));
  const mismatched = entries
    .filter((e) => e.claimed && e.actual != null && e.claimed !== e.actual)
    .map((e) => ({ line: e.line, ch: e.ch, actual: e.actual, claimed: e.claimed }));
  // R3：非标题行里嵌着「**Updated**: 日期」⇒ 缝合残迹（行首锚被吞）。
  const swallowed = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(HEADER_PREFIX)) continue;
    if (HEADER_SHAPE.test(lines[i])) {
      swallowed.push({ line: i + 1, snippet: lines[i].slice(0, 60) });
    }
  }
  // R4：条目体里 OWN_CLAIM 命中的码位 ≠ 自己标题码位 ⇒ 别条的声明躺在体里。
  const foreign = [];
  for (const e of entries) {
    if (e.actual == null) continue;
    const others = e.claims.filter((c) => c.claimed !== e.actual);
    if (others.length > 0) {
      foreign.push({ line: e.line, actual: e.actual, claimed: others.map((c) => c.claimed) });
    }
  }
  return { entries, dups, mismatched, swallowed, foreign };
}
