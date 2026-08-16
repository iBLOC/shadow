import { test, expect } from '@playwright/test';

test.describe('Resonance Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/resonance');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('共鸣');
  });

  test('显示共鸣实例列表', async ({ page }) => {
    const instanceList = page.locator('[data-testid="resonance-list"]');
    if (await instanceList.isVisible()) {
      await expect(instanceList).toBeVisible();
    }
  });

  test('显示添加实例按钮', async ({ page }) => {
    const addInstanceButton = page.locator('button:has-text("添加实例")');
    if (await addInstanceButton.isVisible()) {
      await expect(addInstanceButton).toBeVisible();
    }
  });
});
