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
 * · R2 **拆了尺子**：暂存区把受保护的闸/判据/workflow **删掉**了。
 * · R4 **台账被退回**：暂存面的台账里少了 HEAD 有的条目符号。
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
      violations.push({
        code: 'R1',
        path: row.path,
        msg: '暂存面把 `' + row.path + '` 退回成**旧版本**（＝历史提交 ' + old + ' 的内容）⇒ ⇒ 这是一次静悄悄的回退（提交前）',
      });
    } else {
      hints.push({ code: 'H1', path: row.path, msg: '暂存面改了 `' + row.path + '`（不是旧版本回退）' });
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
  return { violations, hints };
}
