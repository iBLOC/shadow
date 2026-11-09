import { test, expect } from '@playwright/test';

test.describe('Logs Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/logs');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('错误日志');
  });

  test('显示日志列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="log-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   没有记录时日志页显示「暂无错误记录」。
    await expect(page.getByText('暂无错误记录')).toBeVisible();
  });

  test('显示清除按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：产品按钮是「**清空**」
    //   ⇒ ⇒ 原来找的「清除」不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    const clearButton = page.getByRole('button', { name: '清空', exact: true });
    await expect(clearButton).toBeVisible();
  });
});
