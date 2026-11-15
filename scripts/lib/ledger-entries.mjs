/**
 * 台账「**条目正文**」那一层 —— 两把尺子共用的判据（2026-11-11 抽）。
 *
 * ## 它是什么
 * 台账不是一整块文本，它是**若干条**。这一层只回答一件事：
 * **「某一份台账文本里，每一条的正文逐字是什么？」**
 * 形状：**条正文 ＝ 从该条的 `**Updated**:` 行到下一条的 `**Updated**:` 行**（尾部空行裁掉）**。
 *
 * ## 为什么它住在**自己的文件**里
 * ⚠️ **两把尺子判的是同一族**：
 *   · `scripts/lib/index-revert.mjs`（**暂存面**那把）—— 提交前：暂存区相对 HEAD 有没有静悄悄回退
 *   · `scripts/lib/commit-revert.mjs`（**提交面**那把）—— 提交后：历史里有没有静悄悄回退
 * ⇒ ⇒ 两边都要判「**某一条台账条目的正文 == 它历史上逐字相同的那一版**」⇒ ⇒
 * ⇒ ⇒ **「台账一条怎么切」必须只有一份** ⇒ ⇒ 否则迟早漂（一个裁尾部空行、一个不裁
 * ⇒ ⇒ ⇒ 同一族两种结论 ⇒ ⇒ 那道闸就不可信）。
 * ⇒ ⇒ 而它原来住在**暂存面那把的文件里** ⇒ ⇒ 提交面那把要接同一份判据 ⇒ ⇒ 就得动在飞面
 * ⇒ ⇒ ⇒ **共享的东西必须住在自己的文件里** ⇒ ⇒ 与「谁在飞」无关。
 *
 * ## 换行归一（⚠️ 硬需求）
 * Windows 上工作树是 CRLF、blob 里是 LF ⇒ ⇒ 不归一 ⇒ ⇒ 同一份内容在两个面上**逐字不等**
 * ⇒ ⇒ 「这条正文 == 历史上那一版」的比较**永远不成立** ⇒ ⇒ 那一档**恒不触发**
 * ⇒ ⇒ 而且**自检抓不到它**（夹具在同一台机器上生成 ⇒ ⇒ 两面同形）⇒ ⇒ 真形状必须在另一个面上造。
 */
export function normalizeEol(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 一行台账条目的形状 —— **两种标题形状都认**。
 *
 * ⚠️ **父仓与移动端／桌面端的冒号位置不一样**（官方码位判据 `scripts/lib/ledger-codepoints.mjs`
 *    逐字记着这一点）：
 *   · 父仓：`\*\*Updated\*\*: 2026-11-08 (㐃 **…`（冒号在加粗**外**）
 *   · 移动端／桌面端：`\*\*Updated:\*\* 2026-11-08 (㐃 **…`（冒号在加粗**内**）
 * ⇒ ⇒ 原来这里只认父仓那一种 ⇒ ⇒ **移动端／桌面端两本账本一条都切不出来**
 * ⇒ ⇒ 「条目级」那一档在它们身上**恒不触发** ⇒ ⇒ **静默的射程缺口**。
 * ⇒ ⇒ 官方码位判据自己用的是**合并形状**（`^\*\*Updated(?::)?\*\*:?\s*[12]\d{3}-…`）
 * ⇒ ⇒ 这里与它**对齐** ⇒ ⇒ 两处判据不许各认各的。
 */
export const ENTRY_HEADER_RE = /^\*\*Updated(?::)?\*\*:?\s+\S+\s+\((.)\s+\*\*/;
export const ENTRY_HEADER_RE_G = new RegExp(ENTRY_HEADER_RE.source, 'gm');

/** 台账条目的**符号**集合。 */
export function ledgerSymbols(text) {
  const out = new Set();
  for (const m of normalizeEol(text).matchAll(ENTRY_HEADER_RE_G)) out.add(m[1]);
  return out;
}

/**
 * 台账**条目正文**（按符号分块）—— 返回 `Map<符号, 正文逐字>`。
 *
 * ⚠️ **尾部空行必须裁掉** ⇒ ⇒ 否则「在两条之间插一条新条目」会把**前一条**的正文切短
 *   ⇒ ⇒ 制造假阳性（台账的惯例是**往顶上插** ⇒ ⇒ 前一条的正文不受影响）。
 * ⚠️ 同一符号出现多次 ⇒ ⇒ 取**第一次**（先说的先得）。
 */
export function ledgerEntries(text) {
  const lines = normalizeEol(text).split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ENTRY_HEADER_RE);
    if (m) starts.push({ sym: m[1], line: i });
  }
  const out = new Map();
  for (let k = 0; k < starts.length; k++) {
    const sym = starts[k].sym;
    if (out.has(sym)) continue;
    const from = starts[k].line;
    const to = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    let end = to;
    while (end > from && lines[end - 1].trim() === '') end--;
    out.set(sym, lines.slice(from, end).join('\n'));
  }
  return out;
}

/**
 * **条目级回退的收窄条件** —— **面无关**的那一条（2026-11-11 抽）。
 * ============================================================================
 *
 * ## 它是什么
 * 一句话：**「从【from】退回【to】」这一族里，只有当【from】**真的含有**【to】没有的行时，
 * 才算「被退回」；否则那是**合法演进**（去重／回填旧内容）。**
 *
 * ## 为什么它必须**面无关**
 * ⚠️ **同一族的收窄条件，两面拿得到的东西不一样**（这是 2026-11-11 兄弟会话提的问题）：
 *   · **提交面**（`commit-revert.mjs`）—— 事件里有「A」＝ B 的父链上最近改过该文件的提交
 *     ⇒ ⇒ 「A 的增量」拿得到 ⇒ ⇒ 收窄条件天然可判；
 *   · **暂存面**（`index-revert.mjs` 的 R5）—— **没有「A」这个对象**
 *     ⇒ ⇒ 若把条件写成「A 真的引入过新行」⇒ ⇒ 那一条在暂存面**落进「判不了」那一格**。
 * ⇒ ⇒ **解法不是给两面各写一条判据（那会漂），而是把条件改写成面无关的形状。**
 *
 * ## 面无关的写法
 * 把「A 的增量」换成「**退回前的那一版 vs 被退回到的那一版**」：
 *   · 提交面：`from` ＝ A 的那一版（退回事件里的 A），`to` ＝ A^ 的那一版；
 *   · 暂存面：`from` ＝ **HEAD** 的那一版（暂存面拿得到，且逐字就在判据手里），
 *     `to` ＝ 历史上被匹配到的那一版。
 * ⇒ ⇒ **两面都判得了 ⇒ ⇒ 不落「判不了」那一格** ⇒ ⇒ 而且**同一份实现** ⇒ ⇒ 不会两处漂。
 *
 * ## 为什么这一条**必须**成立（真历史实测，不是推的）
 * 真样本 `0ab9bec`（**合法去重**）—— A 把同一段**重复插了两份**，B 删掉一份
 * ⇒ ⇒ 这一条的正文**逐字**变回 A 之前的版本 ⇒ ⇒ 「逐字等于旧版」这一条**单独**会误判红
 * ⇒ ⇒ 而那一笔**一行新内容都没引入**（行集合一模一样，只是份数变了）
 * ⇒ ⇒ ⇒ **判据要问「退回前的那一版到底有没有多出来的东西」，而不只是「是不是回到了旧版」**。
 *
 * ⚠️ **归一**：行比较一律 `trimEnd()` 后去空行 ⇒ ⇒ Windows 上工作树是 CRLF、blob 里是 LF
 *   ⇒ ⇒ 不归一 ⇒ ⇒ 同一份内容在两个面上逐字不等 ⇒ ⇒ 这一档**恒不触发**。
 */
export function entryContentLines(body) {
  return String(body == null ? '' : body)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
}

/** 这一条在【from】里比【to】**多出来的行**（行集合，去掉空白行）。 */
export function entryIntroducedLines(fromBody, toBody) {
  const to = new Set(entryContentLines(toBody));
  return entryContentLines(fromBody).filter((l) => !to.has(l));
}

/**
 * **收窄条件**（面无关）：`from` ＝ 退回**前**的那一版，`to` ＝ 被退回到的那一版。
 * 返回 true ＝ 这一族**够格**判红；false ＝ 合法演进（去重等）⇒ ⇒ 留在提示层。
 *
 * ⚠️ **两个面传进来的【from】来源不同，但形状一样** —— 这就是「面无关」的含义：
 *   · 提交面：`entryRevertNarrowing(tAfter, tBefore)`（A 的版本 vs A^ 的版本）；
 *   · 暂存面：`entryRevertNarrowing(headBody, oldBody)`（HEAD 的版本 vs 历史上那一版）。
 */
export function entryRevertNarrowing(fromBody, toBody) {
  return entryIntroducedLines(fromBody, toBody).length > 0;
}

/** 台账面（符号不许在暂存面里凭空消失）。 */
export const LEDGER_PATHS = [
  'AGENTS.md',
  'shadow-mobile/AGENTS.md',
  'shadow-desktop/AGENTS.md',
];

/** 条目级豁免登记（要把某条退回旧版时，必须在这里写清为什么）。 */
export const LEDGER_ENTRY_EXEMPTIONS = [
  // { ledger: 'AGENTS.md', symbol: '㓵', why: '…' }
];

/** 条目级豁免查表。 */
export function isEntryExempt(ledger, symbol) {
  return LEDGER_ENTRY_EXEMPTIONS.some(e => e && e.ledger === ledger && e.symbol === symbol);
}
