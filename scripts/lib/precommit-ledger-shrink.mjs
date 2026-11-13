/**
 * 「提交前的台账**条目数不许少于 HEAD**」—— **纯判定**（不碰 git，好测）。
 *
 * ## 为什么要有这一条
 *
 * 2026-11-13 一天里出现过两次同一形态的损失：
 *   · 并行会话用**过期的整文件快照**去写 `AGENTS.md` ⇒ ⇒ 把别人刚落链的
 *     几条条目顶掉（那次丢 876 行）；
 *   · 我自己也有一次「工作树面比 HEAD 落后」，提交前靠手工 `grep -c` 才核出来。
 * ⇒ ⇒ 台账是本仓**唯一的存证面**：条目被静默顶掉 ⇒ ⇒ 读账的人会以为
 *     那几刀没发生过 ⇒ ⇒ **失败长得像成功**。
 *
 * ## 判据（只判一种形态，宁漏不误）
 *
 * 「**HEAD 里有这个台账** ＋ **暂存面里的条目数比 HEAD 少**」⇒ ⇒ 判红。
 * ⇒ ⇒ 其余一律放行：新增台账文件、条目数持平或变多、读不到任一侧正文。
 *
 * ⚠️ **为什么按「条目头部行」数，而不是按 `ledgerEntries` 的 Map 大小**：
 * 那份共享判据**按符号去重**（同一符号出现多次取第一次）⇒ ⇒ 而本仓台账
 * 里**存在合法撞号**（基线登记在案）⇒ ⇒ 用 Map 大小会把「两条同号条目」
 * 数成一条 ⇒ ⇒ 计数偏低 ⇒ ⇒ 这条闸自己就会误报。
 *
 * ⚠️ **fail-safe**：任何一侧读不出来 ⇒ ⇒ 判不了 ⇒ ⇒ 放行（钩子绝不卡人）。
 */

import { ENTRY_HEADER_RE } from './ledger-entries.mjs';

/** 台账里的**条目数**（按头部行数；每条 `**Updated**:` 算一条）。 */
export function countLedgerEntries(text) {
  if (typeof text !== 'string' || text === '') return 0;
  // ⚠️ 每次**新建**正则：共享的是带 `g` 的字面量，直接 matchAll 会踩
  // lastIndex 的残留（同一进程里连跑两次会少算）。
  const re = new RegExp(ENTRY_HEADER_RE.source, 'gm');
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

/**
 * 判定：暂存面里的台账条目数**少于** HEAD 吗？
 *
 * 入参：
 *   · [headHasFile] —— HEAD 里有没有这个台账（`false` ⇒ 新增文件 ⇒ 不判）
 *   · [headText]    —— HEAD 侧正文（读不到传 `null`）
 *   · [stagedText]  —— 暂存面正文（读不到传 `null`）
 *
 * 返回 `{ violation, note }`：`violation` 为 null 表示放行。
 */
export function checkLedgerShrunk({ headHasFile, headText, stagedText }) {
  if (!headHasFile) {
    return { violation: null, note: 'HEAD 里没有这个台账（新增文件）⇒ ⇒ 不判' };
  }
  if (typeof headText !== 'string' || typeof stagedText !== 'string') {
    return { violation: null, note: '台账两侧正文读不全 ⇒ ⇒ 判不了 ⇒ ⇒ 放行（fail-safe）' };
  }
  const head = countLedgerEntries(headText);
  const staged = countLedgerEntries(stagedText);
  if (head === 0) {
    // HEAD 侧一条都数不出来（空文件 / 形状不认识）⇒ ⇒ 没有可比基线 ⇒ ⇒ 放行。
    return { violation: null, note: 'HEAD 侧数不出条目（没有可比基线）⇒ ⇒ 放行' };
  }
  if (staged < head) {
    return {
      violation: { head, staged, lost: head - staged },
      note: '',
    };
  }
  return { violation: null, note: `台账条目数 ${staged} ≥ HEAD ${head} ⇒ ⇒ 放行` };
}
