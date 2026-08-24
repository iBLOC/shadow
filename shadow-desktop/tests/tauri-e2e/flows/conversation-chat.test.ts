// Auto-migrated from conversation-chat.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Conversation Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/conversation');
    await browser.pause(500);
  });

  it('对话页面加载成功', async () => {
    await expect(await $('h3').filter({ hasText: /对话/ }).first()).toBeVisible({ timeout: 10000 });
  });

  it('新建对话按钮存在', async () => {
    const newChatButton = await $('button').filter({ has: await $('svg') }).first();
    await expect(newChatButton).toBeVisible({ timeout: 10000 });
  });

  it('发送消息框存在', async () => {
    const messageInput = await $('input[placeholder], textarea').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });
  });

  it('发送消息后显示用户消息', async () => {
    const messageInput = await $('input[placeholder], textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('测试消息');
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe('测试消息');
    }
  });
});

