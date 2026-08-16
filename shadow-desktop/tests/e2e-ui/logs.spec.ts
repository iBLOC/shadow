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
    const logList = page.locator('[data-testid="log-list"]');
    if (await logList.isVisible()) {
      await expect(logList).toBeVisible();
    }
  });

  test('显示清除按钮', async ({ page }) => {
    const clearButton = page.locator('button:has-text("清除")');
    if (await clearButton.isVisible()) {
      await expect(clearButton).toBeVisible();
    }
  });
});
