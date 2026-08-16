import { test, expect } from '@playwright/test';

test.describe('Memory Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/memory');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('记忆');
  });

  test('显示搜索功能', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索记忆"]');
    await expect(searchInput).toBeVisible();
  });
});
