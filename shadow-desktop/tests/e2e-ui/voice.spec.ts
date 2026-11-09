import { test, expect } from '@playwright/test';

test.describe('Voice Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/voice');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('语音对话');
  });

  test('显示语音设置', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="voice-settings"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实存在的语音区块：
    //   页面上的「转写 (0)」那一栏。
    await expect(page.getByText(/转写/).first()).toBeVisible();
  });
});
