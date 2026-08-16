import { test, expect } from '@playwright/test';

test.describe('MCP Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/mcp');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('MCP');
  });

  test('显示添加服务器按钮', async ({ page }) => {
    const addButton = page.locator('button:has-text("添加服务器")');
    await expect(addButton).toBeVisible();
  });
});
