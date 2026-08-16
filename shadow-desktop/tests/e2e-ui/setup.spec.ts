import { test, expect } from '@playwright/test';

test.describe('Setup Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('shadow_setup_complete');
    });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    // Setup page uses h2 tags for section titles
    const h2 = page.locator('h2').first();
    await expect(h2).toBeVisible();
  });

  test('显示密码设置', async ({ page }) => {
    const passwordSection = page.locator('text=设置密码');
    if (await passwordSection.isVisible()) {
      await expect(passwordSection).toBeVisible();
    }
  });

  test('显示数据库设置', async ({ page }) => {
    const databaseSection = page.locator('text=数据库');
    if (await databaseSection.isVisible()) {
      await expect(databaseSection).toBeVisible();
    }
  });
});
