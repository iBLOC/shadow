/**
 * 「暂存面回退」判定内核（2026-11-11）。
 *
 * ## 它量的是哪一族（分族）
 *
 * ⚠️ **`scripts/lib/commit-revert.mjs` 量的是提交后**（git 历史里谁把谁的增量退掉了）。
 * ⇒ ⇒ 本族量的是**提交前**：**暂存区（index）相对 HEAD** 里有没有静悄悄的回退。
 * ⇒ ⇒ 两把尺子各自承重一族，**不许越界**（越界的那一刻，它们就变成同一把）。
 *
 * ## 为什么需要它（2026-11-11 真机实测）
 *
 * 共享工作树里有人把**旧基线** `read-tree` 进了**共享索引**（`GIT_INDEX_FILE` 没生效）
 * ⇒ ⇒ 索引变成「旧树 ＋ 少量新文件」⇒ ⇒ `git status` 里表现为：
 *   · 刚落地的闸与 workflow 被**暂存为删除**；
 *   · 用户拍板过的值（CI 并发 `cancel-in-progress`）被**暂存改回旧值**；
 *   · 台账条目被**暂存退回旧版**。
 * ⇒ ⇒ **任何一次 `git commit` 都会把它原样带进历史** ⇒ ⇒ 那是一次静悄悄的回退。
 * ⇒ ⇒ 而「提交面回退闸」只扫历史 ⇒ ⇒ **扫不到还没提交的这一格** ⇒ ⇒ 缺口在这里。
 *
 * ## 五条判据（红线三条 ＋ 提示两条）
 *
 * · R1 **退回旧版**：暂存区里某个文件的内容 == 历史上某个旧提交的内容。
 *   ⚠️ **R1 带归因档位**（2026-11-11 补）：`stale`（过期暂存：工作树已经是 HEAD 的内容
 *   ⇒ ⇒ **没有任何人在回退内容**）／`worktree-old`（工作树也是旧版 ⇒ ⇒ 需要人确认意图）／
 *   `third`（第三种内容 ⇒ ⇒ 意图判不了）⇒ ⇒ **判红照旧，归因分档**。
 * · R2 **拆了尺子**：暂存区把受保护的闸/判据/workflow **删掉**了。
 * · R4 **台账被退回**：暂存面的台账里少了 HEAD 有的条目符号。
 * · R5 **台账被段落级退回**：暂存面把**某一条**已提交的台账条目退回成它**历史上逐字相同**的旧版
 *   ⇒ ⇒ 整文件**不是**旧版（R1 看不见）＋ 条目**符号还在**（R4 看不见）⇒ ⇒ **段落级**那一格。
 * · H1 **普通改动**：暂存面改了内容，但那份内容历史上没出现过 ⇒ ⇒ 不是回退。
 * · M1 **只翻了权限位**：内容**逐字相同**，只有 mode 变了 ⇒ ⇒ 零内容差，
 *   但它会随下一次提交进历史（纯噪声）⇒ ⇒ 提示层，不判红。
 *
 * ## 退出码
 *
 * - 0：绿；- 1：红；- 2：判不了（索引/HEAD 读不到 ⇒ ⇒ 「没红」不等于「没问题」）。
 */

/** 闸与判据文件：静悄悄删掉 = 把尺子拆了 ⇒ ⇒ 红（除非登记豁免）。 */
export const PROTECTED_GLOBS = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^scripts\/check-[^/]+\.mjs$/,
  /^scripts\/lib\/[^/]+\.mjs$/,
];

/** 豁免清单（每条必须写清为什么）。 */
export const EXEMPTIONS = [
  // { path: '…', why: '…' }
];

/** 台账面（符号不许在暂存面里凭空消失）。 */
export const LEDGER_PATHS = [
  'AGENTS.md',
  'shadow-mobile/AGENTS.md',
  'shadow-desktop/AGENTS.md',
];

/** 一行台账条目的形状：`> 信封：` 之前的 `**Updated**: 日期 (符号 **标题**`。 */
export function ledgerSymbols(text) {
  const out = new Set();
  for (const m of text.matchAll(/^\*\*Updated\*\*: \S+ \((.)\s+\*\*/gm)) out.add(m[1]);
  return out;
}

/**
 * 换行归一（CRLF ⇒ LF）—— ⚠️ **必须归一**：
 *   Windows 上工作树是 CRLF、blob 里是 LF ⇒ ⇒ 不归一 ⇒ ⇒ 同一份内容在两个面上**逐字不等**
 *   ⇒ ⇒ 「这条正文 == 历史上那一版」的比较**永远不成立** ⇒ ⇒ R5 恒不触发（自检会抓住它）。
 */
export function normalizeEol(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 台账**条目正文**（按符号分块）—— 台账不是一整块文本，它是**若干条**。
 *
 * ⚠️ **为什么要分块**：R1 抓「整文件退回旧版」、R4 抓「条目符号消失」
 *   ⇒ ⇒ 两头都漏掉**段落级**那一格：条目**还在**（符号在）、整文件**不是**旧版，
 *   而这一条的**正文**被换成了它**历史上逐字相同**的旧版。
 *
 * 形状：**条正文 ＝ 从该条的 `**Updated**:` 行到下一条的 `**Updated**:` 行**（尾部空行裁掉）**。
 * ⚠️ **尾部空行必须裁掉** ⇒ ⇒ 否则「在两条之间插一条新条目」会把**前一条**的正文切短
 *   ⇒ ⇒ 制造假阳性（台账的惯例是**往顶上插** ⇒ ⇒ 前一条的正文不受影响）。
 */
export function ledgerEntries(text) {
  const lines = normalizeEol(text).split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\*\*Updated\*\*: \S+ \((.)\s+\*\*/);
    if (m) starts.push({ sym: m[1], line: i });
  }
  const out = new Map();
  for (let k = 0; k < starts.length; k++) {
    const sym = starts[k].sym;
    if (out.has(sym)) continue; // 同一符号出现多次 ⇒ 取第一次（先说的先得）
    const from = starts[k].line;
    const to = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    let end = to;
    while (end > from && lines[end - 1].trim() === '') end--;
    out.set(sym, lines.slice(from, end).join('\n'));
  }
  return out;
}

/** R5 的豁免登记（要把某条退回旧版时，必须在这里写清为什么）。 */
export const LEDGER_ENTRY_EXEMPTIONS = [
  // { ledger: 'AGENTS.md', symbol: '㓵', why: '…' }
];

/** R5 的豁免查表。 */
export function isEntryExempt(ledger, symbol) {
  return LEDGER_ENTRY_EXEMPTIONS.some(e => e && e.ledger === ledger && e.symbol === symbol);
}

/** R5 的修法（读数要能直接照着做 ⇒ ⇒ 不许只说「有回退」）。 */
export const R5_FIX = '把它改回**新的**内容（回填），或在 `LEDGER_ENTRY_EXEMPTIONS` 里登记这一条 ＋ 写清为什么 ⇒ ⇒ **不要**把旧版正文原样放回暂存区';

/** 是不是受保护面（闸/判据/workflow）。 */
export function isProtected(path) {
  return PROTECTED_GLOBS.some(re => re.test(path));
}

/** 豁免登记查表。 */
export function isExempt(path) {
  return EXEMPTIONS.some(e => e.path === path);
}

/** 权限位可读形式（100644 ⇒ 644，100755 ⇒ 755）。 */
export function modeLabel(mode) {
  if (!mode || mode === '0' || mode === '000000') return '（无）';
  return mode.slice(-3);
}

/**
 * R1 的**归因档位**（2026-11-11 真机实测补）—— 判红一样，归因不同。
 *
 * ⚠️ **为什么必须分档**：R1 说得出「索引面是旧版」，**说不出「谁把它放进去的」**
 *   ⇒ ⇒ 而这两种情况的处理方式**完全不同**：
 *   · 过期暂存 ⇒ ⇒ **没有任何人在回退内容**（只是索引没跟上工作树）⇒ ⇒ 清索引即可；
 *   · 工作树也是旧版 ⇒ ⇒ 有人**在工作树里**把旧版写了回来 ⇒ ⇒ 需要人确认意图。
 * ⇒ ⇒ 不分档 ⇒ ⇒ 读数会把人指向一个**不存在的人**（2026-11-11 实测：5 处全是过期暂存）。
 *
 * ⚠️ **分档不放松判红** —— 危害一样（下次 commit 会把索引那份带进历史）⇒ ⇒ 判红照旧。
 */
export const R1_KIND_LABEL = {
  stale: '**过期暂存**（工作树已经是 HEAD 的内容 ⇒ ⇒ **没有任何人在回退内容**，只是索引没跟上工作树）',
  'worktree-old': '**工作树也是旧版**（有人在**工作树**里把旧版写了回来 ⇒ ⇒ 需要人确认意图）',
  third: '**第三种内容**（工作树既不是 HEAD 也不是索引那份 ⇒ ⇒ 意图判不了）',
  nowt: '**工作树里读不到**（意图判不了）',
};

/** 各档位的修法（读数要能直接照着做 ⇒ ⇒ 不许只说「有回退」）。 */
export const R1_FIX = {
  stale: '把索引恢复成 HEAD（`git restore --staged <路径>`）或重新 add —— **工作树不用动** ⇒ ⇒ 零内容丢失',
  'worktree-old': '先确认是谁在工作树里写的旧版；若是无意 ⇒ ⇒ 恢复索引 ／ 重新 add（`git restore --staged <路径>`）',
  third: '先看工作树那一面（`git diff -- <路径>`）再决定 ⇒ ⇒ **下一次 commit 前必须重新 add**',
  nowt: '确认这个文件是否已被从工作树里删掉 ⇒ ⇒ 再决定索引该是什么',
};

/**
 * 分类暂存面相对 HEAD 的差异。
 *
 * @param {Array<{path:string,status:string,indexBlob:string|null,headBlob:string|null,
 *               indexMode?:string,headMode?:string}>} rows
 * @param {{oldCommitFor:(path:string, blob:string)=>string|null,
 *        headLedgerSymbols:Record<string,string[]>,
 *        indexLedgerSymbols:Record<string,string[]>}} ctx
 * @returns {{violations:Array, hints:Array}}
 */
export function classifyIndexFace(rows, ctx) {
  const violations = [];
  const hints = [];
  // ⚠️ **R1 已经说清楚的文件，不再用 R5 重复数一遍**（同一个事实数两遍 ⇒ ⇒ 分母失真）
  const r1Paths = new Set();
  for (const row of rows) {
    if (row.status === 'A') continue; // 新增文件：不是回退形状
    if (row.status === 'R' || row.status === 'C') {
      hints.push({ code: 'H3', path: row.path, msg: '暂存面有一处重命名／复制（' + row.status + '）⇒ ⇒ 本闸不判这一族（请人工看）' });
      continue;
    }
    if (row.status === 'D') {
      if (isProtected(row.path) && !isExempt(row.path)) {
        violations.push({
          code: 'R2',
          path: row.path,
          msg: '暂存面**删掉**了受保护的闸/判据/workflow `' + row.path + '` ⇒ ⇒ 尺子被拆 ⇒ ⇒ 请确认这是有意删除并登记豁免',
        });
      } else {
        hints.push({ code: 'H2', path: row.path, msg: '暂存面删除了一个文件（非受保护面）：' + row.path });
      }
      continue;
    }
    if (!row.indexBlob) continue;
    if (row.indexBlob === row.headBlob) {
      // 内容逐字相同 ⇒ ⇒ 只可能是权限位变了 ⇒ ⇒ M1（纯噪声，不判红）
      if (row.indexMode && row.headMode && row.indexMode !== row.headMode) {
        hints.push({
          code: 'M1',
          path: row.path,
          msg: '暂存面只翻了权限位（' + modeLabel(row.headMode) + ' → ' + modeLabel(row.indexMode) + '，内容零差异）⇒ ⇒ 它会随下一次提交进历史（纯噪声）',
        });
      }
      continue;
    }
    const old = ctx.oldCommitFor(row.path, row.indexBlob);
    if (old) {
      // ⚠️ **归因必须分档**（2026-11-11 真机实测补）—— R1 说得出「索引面是旧版」，
      //   说不出「**谁**把它放进去的」⇒ ⇒ 而这两种情况的处理方式完全不同：
      //   · stale：工作树已经是 HEAD 的内容 ⇒ ⇒ **没有任何人在回退内容**，只是索引没跟上；
      //   · worktree-old：有人在**工作树**里把旧版写了回来 ⇒ ⇒ 需要人确认意图；
      //   · third：工作树是第三种内容 ⇒ ⇒ 意图判不了。
      //   ⇒ ⇒ **判红不因分档而放松**（危害一样：下次 commit 会把索引那份带进历史）
      //   ⇒ ⇒ 但**归因**必须分档 ⇒ ⇒ 否则读数会把人指向一个**不存在的人**。
      const wt = typeof ctx.worktreeBlobFor === 'function' ? ctx.worktreeBlobFor(row.path) : null;
      let kind = 'third';
      if (!wt) kind = 'nowt';
      else if (row.headBlob && wt === row.headBlob) kind = 'stale';
      else if (row.indexBlob && wt === row.indexBlob) kind = 'worktree-old';
      r1Paths.add(row.path);
      violations.push({
        code: 'R1',
        path: row.path,
        kind,
        msg: '暂存面把 `' + row.path + '` 退回成**旧版本**（＝历史提交 ' + old + ' 的内容）⇒ ⇒ 这是一次静悄悄的回退（提交前）',
        fix: R1_FIX[kind],
      });
    } else {
      hints.push({ code: 'H1', path: row.path, msg: '暂存面改了 `' + row.path + '`（不是旧版本回退）' });
    }
  }
  // ⚠️ **工作树面那一格**（2026-11-11 真机实测补）—— 台账符号在 HEAD 有、在**工作树**没有
  //   ⇒ ⇒ 这一格**工作树正在删一条已提交的台账条目** ⇒ ⇒ 若 `git add` 它 ⇒ ⇒ 暂存面那一格
  //   会判红（R4）⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 所以这里**提前出声**（**提示层，不判红**）——
  //   ⚠️ **工作树本来就在飞** ⇒ ⇒ 「少了」不总是错（**有意**删一条条目也是合法的）
  //   ⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 而「旧基线重建工作树」这种误伤** ⇒ ⇒ 只有这一格能提前看见 ⇒ ⇒
  //   ⇒ ⇒ 所以它**必须出声**，但**不许改退出码**（零行为回归）。
  //   ⚠️ 只在 **HEAD 侧存在**该台账时才比（子仓里没有那本账 ⇒ ⇒ 不该被算成「少了」）。
  for (const [ledger, headSymbols] of Object.entries(ctx.headLedgerSymbols || {})) {
    const wt = (ctx.worktreeLedgerSymbols || {})[ledger];
    if (wt === undefined) continue;
    if (wt === null) {
      hints.push({
        code: 'W1',
        path: ledger,
        msg: '工作树面**没有**这个台账文件（HEAD 有）⇒ ⇒ 这一格**工作树正在删整本账** ⇒ ⇒ 若 `git add` 它 ⇒ ⇒ 暂存面会判红 ⇒ ⇒ **提前出声**（不判红）',
      });
      continue;
    }
    const wtSymbols = new Set(wt);
    for (const sym of headSymbols) {
      if (!wtSymbols.has(sym)) {
        hints.push({
          code: 'W1',
          path: ledger,
          msg: '工作树面少了已提交的台账条目（符号 ' + sym + '）⇒ ⇒ 这一格**工作树正在删一条已提交的台账条目** ⇒ ⇒ 若 `git add` 它 ⇒ ⇒ 暂存面那一格会判红（R4）⇒ ⇒ **提前出声**（不判红：工作树本来就在飞）',
        });
      }
    }
  }
  for (const [ledger, headSymbols] of Object.entries(ctx.headLedgerSymbols || {})) {
    const indexSymbols = new Set((ctx.indexLedgerSymbols || {})[ledger] || []);
    for (const sym of headSymbols) {
      if (!indexSymbols.has(sym)) {
        violations.push({
          code: 'R4',
          path: ledger,
          msg: '暂存面的 `' + ledger + '` 里**少了条目**（符号 ' + sym + '）⇒ ⇒ 台账被暂存面退回了旧版 ⇒ ⇒ 请确认这是有意删除并登记豁免',
        });
      }
    }
  }
  // ── R5：条目级（段落级）静悄悄回退 ────────────────────────────────────
  // ⚠️ **这一格是 R1 与 R4 中间的那条缝**（2026-11-11 真机实测补）：
  //   · 整文件**不是**旧版 ⇒ ⇒ R1 不响；
  //   · 条目**符号还在** ⇒ ⇒ R4 不响；
  //   · 而那一条的**正文**被换成了它**历史上逐字相同**的旧版 ⇒ ⇒ **段落级回退**。
  // ⇒ ⇒ 判据 ＝「index 那条正文 == 历史上某一版那条正文」＋「且 != HEAD 那条正文」
  //   ⇒ ⇒ **合法回填不会命中**（回填产生的是**全新**内容，历史里没有）⇒ ⇒ **零噪声**：
  //   只有「把旧版原样搬回来」才命中。
  // ⚠️ **整文件已经是旧版的（R1 已说清楚）⇒ ⇒ 不再重复数** —— 同一个事实数两遍 ⇒ ⇒ 分母失真。
  for (const [ledger, headEntries] of Object.entries(ctx.headLedgerEntries || {})) {
    if (r1Paths.has(ledger)) continue;
    const idxEntries = (ctx.indexLedgerEntries || {})[ledger];
    if (!idxEntries) continue;
    const history = (ctx.historyLedgerEntries || {})[ledger] || [];
    for (const [sym, body] of idxEntries) {
      const headBody = headEntries.get(sym);
      if (headBody === undefined) continue;   // 新条目 ⇒ ⇒ 没有历史 ⇒ ⇒ 不是回退
      if (body === headBody) continue;        // 没改 ⇒ ⇒ 不是回退
      if (isEntryExempt(ledger, sym)) continue;
      const hit = history.find(h => (h.entries.get(sym) || null) === body);
      if (!hit) continue;
      violations.push({
        code: 'R5',
        path: ledger,
        symbol: sym,
        msg: '暂存面把一条**已提交的台账条目**（符号 ' + sym + '）退回成它**历史上逐字相同**的旧版（历史提交 ' + hit.rev + ' 的那一版）⇒ ⇒ 这是**段落级**的静悄悄回退 ⇒ ⇒ 整文件不是旧版（R1 看不见）＋ 条目符号还在（R4 看不见）',
        fix: R5_FIX,
      });
    }
  }
  // ── W2：工作树面上的同一格（提示层）───────────────────────────────────
  // ⚠️ **工作树面是三个面里最早的那一个**（还没 `git add` 就能看见）⇒ ⇒ 越早出声越好
  //   ⇒ ⇒ 但工作树本来就在飞 ⇒ ⇒ **只出声，不判红**（零行为回归）。
  for (const [ledger, headEntries] of Object.entries(ctx.headLedgerEntries || {})) {
    if ((ctx.worktreeWholeOld || {})[ledger]) continue;  // 整份工作树就是旧版 ⇒ ⇒ 另一个事实
    const wtEntries = (ctx.worktreeLedgerEntries || {})[ledger];
    if (!wtEntries) continue;
    const history = (ctx.historyLedgerEntries || {})[ledger] || [];
    for (const [sym, body] of wtEntries) {
      const headBody = headEntries.get(sym);
      if (headBody === undefined) continue;
      if (body === headBody) continue;
      if (isEntryExempt(ledger, sym)) continue;
      const hit = history.find(h => (h.entries.get(sym) || null) === body);
      if (!hit) continue;
      hints.push({
        code: 'W2',
        path: ledger,
        symbol: sym,
        msg: '工作树面把一条**已提交的台账条目**（符号 ' + sym + '）退回成它**历史上逐字相同**的旧版（历史提交 ' + hit.rev + ' 的那一版）⇒ ⇒ 这一格**工作树正在段落级回退** ⇒ ⇒ 若 `git add` 它 ⇒ ⇒ 暂存面那一格会判红（R5）⇒ ⇒ **提前出声**（不判红：工作树本来就在飞）',
      });
    }
  }
  return { violations, hints };
}
