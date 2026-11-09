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
    // ⚠️ 2026-11-11 真机实测（刀 O）：这条原来**一条断言都没有**
    //   ⇒ ⇒ 点了按钮就结束 ⇒ ⇒ 用例名宣称「创建了新对话」
    //   ⇒ ⇒ 但**没有任何东西在核**「对话真的建出来了」⇒ ⇒ 零断言通过。
    //   ⇒ ⇒ 补上结果断言。
    //   ⚠️ 真机实测：「新对话」那个按钮是**下拉触发器** ⇒ ⇒ 点了它
    //   ⇒ ⇒ 按钮本身会消失（菜单展开了）⇒ ⇒ 不能断言它还在。
    //   ⇒ ⇒ 断言「会话列表里出现了一条对话」——那才是「创建了对话」。
    const newChatButton = page.locator('button:has-text("新对话")');
    await newChatButton.click();
    const conversationItems = page.locator('[data-testid="conversation-item-text"]');
    await expect(conversationItems.first()).toBeVisible();
    const archiveToggle = page.locator('[data-testid="conversation-archive-box-toggle"]');
    await expect(archiveToggle).toBeVisible();
  });
});
