/**
 * 闸的**分母覆盖**存量债清单（数据）
 * ============================================================================
 *
 * ⚠️ 判据（算法）在 ./gate-coverage.mjs（唯一一份）⇒ ⇒ 这里只有**数据**。
 *
 * ── 这张清单管的是什么 ──────────────────────────────────────────────────
 *
 * 「**有闸但没人跑**」那一族（2026-11-05 解决）是**第一层**：
 *   ⇒ ⇒ 闸在不在 CI 里跑。
 * 「**有闸但没分母**」这一族（2026-11-11 本刀）是**第二层**：
 *   ⇒ ⇒ 闸跑了 ⇒ ⇒ 但它的结论**没人收** ⇒ ⇒ 「一盏绿灯」的分母是假的
 *   ⇒ ⇒ （实测：中心流水线的分母只有 4 道，而闸实际有 30 道）。
 *
 * ⇒ ⇒ 处置与第一层**同款**：**存量登记，增量纪律**
 *   · 登记在册的 workflow ⇒ ⇒ 本闸**放行**（但仍然打印出来）；
 *   · **没登记的新缺口** ⇒ ⇒ 直接红（不许悄悄长出来）；
 *   · 登记了、但缺口已经没了 ⇒ ⇒ 红（**要销账** ⇒ ⇒ 清单不许过期）。
 *
 * ⚠️ 每条都写清「为什么还没修」＋「什么时候修」⇒ ⇒ 债不许变成坟场。
 */

/**
 * 还没接判读通道的 workflow（**逐个文件**登记 ⇒ ⇒ 销账要逐个销）。
 *
 * ⚠️ 为什么登记成**逐文件**而不是一条通配：
 *   登记粒度太粗 ⇒ ⇒ 「一个文件修好了」会把整条一起销账 ⇒ ⇒
 *   ⇒ ⇒ 别的文件还在欠着 ⇒ ⇒ **假销账**。
 */
export const NOT_TALLIED_WORKFLOWS = {
  'blank-blob-history.yml': {
    why: '历史闸的独立 workflow（2026-11 上旬建的）⇒ ⇒ 当年还没有「分母」这个概念 ⇒ ⇒ 闸是直跑的',
    when: '下次动这个 workflow 时补：落盘步 ＋ 闸步走 run-gate-once ＋ 汇总步 ⇒ ⇒ 然后从这张表里销掉',
  },
  'brain-route-surface.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'ci-actually-ran.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'commit-import-integrity.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'commit-revert.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'dead-env-vars-commit-tree.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'desktop-e2e-coverage.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'desktop-e2e.yml': {
    why: '重型 E2E 的独立 workflow（Playwright）⇒ ⇒ 闸是直跑的 ⇒ ⇒ 它那个 job 跑完要很久 ⇒ ⇒ 落盘/汇总的接线还没做',
    when: '它那轮跑得久 ⇒ ⇒ 接判读通道要在 job 的**最后**加汇总步 ⇒ ⇒ 下次动它时一起做',
  },
  'desktop-test-assertions.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'door-policy.yml': {
    why: '独立 workflow（跨仓闸，直跑）⇒ ⇒ 2026-11-09 接进去的时候还没有「分母」这个概念',
    when: '同上',
  },
  'e2e-endbrain-wiring.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'i18n-key-completeness.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'index-revert.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'mobile-test-assertions.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'precommit-hook.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
  'secret-plaintext.yml': {
    why: '独立 workflow（跨仓闸，直跑）⇒ ⇒ 2026-11-09 接进去的时候还没有「分母」这个概念',
    when: '同上',
  },
  'test-global-leaks.yml': {
    why: '同上（独立 workflow，直跑）',
    when: '同上',
  },
};
