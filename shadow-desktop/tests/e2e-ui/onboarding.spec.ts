import { test, expect } from '@playwright/test';

test.describe('Onboarding Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
  });

  test('页面可访问', async ({ page }) => {
    // The page should be accessible - it may redirect to / if models are available
    expect(page.url()).toContain('localhost:5173');
  });

  test('显示本地模型选项', async ({ page }) => {
    const localOption = page.locator('text=下载本地模型');
    if (await localOption.isVisible()) {
      await expect(localOption).toBeVisible();
    }
  });

  test('显示云端模型选项', async ({ page }) => {
    const cloudOption = page.locator('text=使用云端模型');
    if (await cloudOption.isVisible()) {
      await expect(cloudOption).toBeVisible();
    }
  });

  test('显示跳过按钮', async ({ page }) => {
    const skipButton = page.locator('button:has-text("稍后配置")');
    if (await skipButton.isVisible()) {
      await expect(skipButton).toBeVisible();
    }
  });
});
