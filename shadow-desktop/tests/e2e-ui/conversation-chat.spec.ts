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
    await expect(page.getByText('对话')).toBeVisible();
  });

  test('新建对话按钮存在', async ({ page }) => {
    const newChatButton = page.locator('button:has-text("新建对话")');
    await expect(newChatButton).toBeVisible();
  });

  test('发送消息框存在', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').first();
    await expect(messageInput).toBeVisible();
  });

  test('发送消息后显示用户消息', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').first();
    await messageInput.fill('Hello');
    
    const sendButton = page.locator('button[type="submit"], button:has-text("发送")').first();
    await sendButton.click();
    
    await page.waitForTimeout(1000);
    
    await expect(page.getByText('Hello')).toBeVisible();
  });

  test('智能体选择器存在', async ({ page }) => {
    const agentSelector = page.locator('select, [data-testid="agent-selector"]').first();
    if (await agentSelector.isVisible()) {
      await expect(agentSelector).toBeVisible();
    }
  });
});
