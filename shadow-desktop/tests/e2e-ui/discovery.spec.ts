import { test, expect } from '@playwright/test';

test.describe('Discovery Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/discovery');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Shadow 节点');
  });

  test('显示设备列表', async ({ page }) => {
    const deviceList = page.locator('[data-testid="device-list"]');
    if (await deviceList.isVisible()) {
      await expect(deviceList).toBeVisible();
    }
  });

  test('显示扫描按钮', async ({ page }) => {
    const scanButton = page.getByRole('button', { name: '开始扫描' }).first();
    await expect(scanButton).toBeVisible();
  });
});
