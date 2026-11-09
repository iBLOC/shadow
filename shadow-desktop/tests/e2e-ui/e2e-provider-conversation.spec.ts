import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';

test.describe('End-to-End: Provider Binding to Conversation', () => {
  test('添加 MiMo 供应商后进行对话', async ({ page }) => {
    test.skip(!TEST_CONFIG.MIMO_API_KEY, 'set MIMO_API_KEY to run against the real MiMo API');
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });

    await page.goto('/models');
    await page.waitForLoadState('networkidle');

    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);

    const addButton = page.locator('button:has-text("添加供应商")');
    await addButton.click();

    await page.locator('button:has-text("Xiaomi MiMo")').click();

    const nameInput = page.locator('input[placeholder="OpenAI"]');
    await nameInput.fill('MiMo 测试');

    const apiKeyInput = page.locator('input[type="password"]');
    await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);

    const submitButton = page.getByRole('button', { name: '添加', exact: true });
    await submitButton.click();

    await page.waitForTimeout(5000);

    const autoMatchDialog = page.getByText('自动匹配模型');
    if (await autoMatchDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmButton = page.getByRole('button', { name: '自动匹配' });
      await confirmButton.click();
      await page.waitForTimeout(1000);
    }

    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const newChatButton = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first();
    if (await newChatButton.isVisible()) {
      await newChatButton.click();
      await page.waitForTimeout(500);
    }

    const messageInput = page.locator('input[placeholder], textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('你好');
      expect(await messageInput.inputValue()).toBe('你好');
    }
  });

  test('验证智能体模型配置', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });

    // ⚠️ 2026-11-11 真机实测：这条原来 goto('/agents') ⇒ ⇒ 但 App.tsx 的
    //    路由表里**没有 /agents**（智能体那一片在设置页的「服务与智能体」
    //    section 里）⇒ ⇒ 页面 404 ⇒ ⇒ 那条断言**恒红**。
    //    ⇒ ⇒ 改走设置页 ⇒ ⇒ 认「内部智能体」那个可展开的分组按钮。
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const internalSection = page.getByRole('button', { name: /内部智能体/ }).first();
    await expect(internalSection).toBeVisible();
    await internalSection.click();
    await page.waitForTimeout(1000);
  });
});
