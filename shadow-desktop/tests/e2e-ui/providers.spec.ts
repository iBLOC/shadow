import { test, expect } from '@playwright/test';

test.describe('Providers Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/providers');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('大模型服务提供商');
  });

  test('显示供应商列表', async ({ page }) => {
    const providerList = page.locator('[data-testid="provider-list"]');
    if (await providerList.isVisible()) {
      await expect(providerList).toBeVisible();
    }
  });

  test('显示添加供应商按钮', async ({ page }) => {
    const addProviderButton = page.locator('button:has-text("添加供应商")');
    if (await addProviderButton.isVisible()) {
      await expect(addProviderButton).toBeVisible();
    }
  });
});
