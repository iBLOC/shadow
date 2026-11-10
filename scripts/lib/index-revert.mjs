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
