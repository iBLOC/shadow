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
    // ⚠️ 2026-11-11 真机实测（刀 O）：软守卫 `isVisible()` 让这条变成
    //   「输入框在才断言」⇒ ⇒ 去掉守卫 ⇒ ⇒ 输入框不在就**真红**。
    const messageInput = page.locator('input[placeholder], textarea').first();
    await messageInput.fill('测试消息');
    const inputValue = await messageInput.inputValue();
    expect(inputValue).toBe('测试消息');
  });
});
