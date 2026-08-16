import { test, expect } from '@playwright/test';

test.describe('Conversation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible();
  });

  test('显示新对话按钮', async ({ page }) => {
    const newChatButton = page.locator('button:has-text("新对话")');
    await expect(newChatButton).toBeVisible();
  });

  test('创建新对话', async ({ page }) => {
    const newChatButton = page.locator('button:has-text("新对话")');
    await newChatButton.click();
    await page.waitForTimeout(1000);
  });
});
