import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('显示 Cortex 状态', async ({ page }) => {
    const cortexSection = page.getByRole('heading', { name: 'Cortex 状态' });
    await expect(cortexSection).toBeVisible();
  });

  test('显示数据库设置', async ({ page }) => {
    const dbSection = page.getByRole('heading', { name: '数据库' });
    await expect(dbSection).toBeVisible();
  });

  test('显示语言设置', async ({ page }) => {
    const langSection = page.locator('text=语言').first();
    await expect(langSection).toBeVisible();
  });

  test('显示主题设置', async ({ page }) => {
    const themeSection = page.locator('text=主题').first();
    await expect(themeSection).toBeVisible();
  });
});
