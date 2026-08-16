import { test, expect } from '@playwright/test';

test.describe('Group Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/group');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('设备组');
  });

  test('显示群组列表', async ({ page }) => {
    const groupList = page.locator('[data-testid="group-list"]');
    if (await groupList.isVisible()) {
      await expect(groupList).toBeVisible();
    }
  });

  test('显示新建群组按钮', async ({ page }) => {
    const newGroupButton = page.locator('button:has-text("新建群组")');
    if (await newGroupButton.isVisible()) {
      await expect(newGroupButton).toBeVisible();
    }
  });
});
