import { test } from '@playwright/test';
import { isTelencephalonReachable } from './global-setup';

/**
 * ⚠️⚠️ **「跳过」在 Playwright 里不算失败** —— 它进 `skipped` 计数，
 * 而 `playwright test` 的**退出码只由 failed 决定** ⇒ ⇒ 端脑没起来
 * ⇒ ⇒ 那几条 spec 被 `test.skip(...)` 整条跳过 ⇒ ⇒ **那一步照样绿**
 * ⇒ ⇒ ⇒ 「跳过也算绿」在 E2E 这一层**同样成立**（U+344F 条已在 vitest
 * 与 flutter 那一侧把它拆开过，这里补上 Playwright 这一侧）。
 *
 * ⇒ ⇒ 本地仍然允许 skip（本地常常没有端脑；而且本地绿不绿没有对外意义）
 * ⇒ ⇒ **CI 上必须红** —— 端脑不可达就是「判据没跑成」，不是「判据通过」。
 *
 * ⚠️ **为什么不是「skip 就 skip」**：CI 上「Run Playwright E2E」是
 * desktop-e2e workflow 里**唯一**证明「端脑 → 客户端 → 真实响应」那一格
 * 成立的读数 ⇒ ⇒ 它被跳过 ⇒ ⇒ 那一格就是**空的**，而 job 却是绿的
 * ⇒ ⇒ ⇒ 「失败长得像成功」的最省电版本：什么都没发生。
 */
export const E2E_CI = !!process.env.CI;

/**
 * 端脑可达性守卫 —— **CI 上抛错（红），本地 skip**。
 *
 * 用法：把 spec 里原来的
 *   `test.skip(!await isTelencephalonReachable(), 'telencephalon not reachable on :60080')`
 * 换成
 *   `await requireTelencephalon();`
 *
 * ⚠️ **不许自己再写 test.skip** —— 形状级尺子
 * （`tests/lib/e2eStrictness.test.ts`）会当场红。
 */
export async function requireTelencephalon(): Promise<void> {
  if (await isTelencephalonReachable()) return;
  const url = process.env.SHADOW_TELENCEPHALON_URL ?? 'http://localhost:60080';
  if (E2E_CI) {
    throw new Error(
      '端脑不可达（' + url +
      '）—— CI 上**不许 skip**：Playwright 把 skip 记成 skipped 而**不是** failed' +
      ' ⇒ ⇒ 退出码仍是 0 ⇒ ⇒ 「跳过也算绿」。' +
      ' 真因在上一步（Build the 端脑 server）或端脑自己起不来 ⇒ ⇒ 请看端脑日志。',
    );
  }
  // 本地：没端脑就跳过（本地读数不外传，且本地常常没起端脑）。
  test.skip(true, 'telencephalon not reachable on :60080');
}
