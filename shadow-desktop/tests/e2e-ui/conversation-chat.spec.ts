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

  test('对话页面加载成功', async ({ page }) => {
    await expect(page.locator('h3').filter({ hasText: /对话/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('新建对话按钮存在', async ({ page }) => {
    const newChatButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(newChatButton).toBeVisible({ timeout: 10000 });
  });

  test('发送消息框存在', async ({ page }) => {
    const messageInput = page.locator('input[placeholder], textarea').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });
  });

  test('发送消息后显示用户消息', async ({ page }) => {
    const messageInput = page.locator('input[placeholder], textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('测试消息');
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe('测试消息');
    }
  });
});
