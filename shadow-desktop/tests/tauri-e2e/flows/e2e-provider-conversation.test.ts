// Auto-migrated from e2e-provider-conversation.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
import { TEST_CONFIG } from './config';

describe('End-to-End: Provider Binding to Conversation', () => {
  it('添加 MiMo 供应商后进行对话', async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });

    await browser.url('/models');
    await browser.pause(500);

    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);

    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();

    await $('button:has-text("Xiaomi MiMo")').click();

    const nameInput = await $('input[placeholder="OpenAI"]');
    await nameInput.fill('MiMo 测试');

    const apiKeyInput = await $('input[type="password"]');
    await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);

    const submitButton = await $('['button', { name: '添加', exact: true }]');
    await submitButton.click();

    await browser.pause(5000);

    const autoMatchDialog = page.getByText('自动匹配模型');
    if (await autoMatchDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmButton = await $('['button', { name: '自动匹配' }]');
      await confirmButton.click();
      await browser.pause(1000);
    }

    await browser.url('/conversation');
    await browser.pause(500);
    await browser.pause(1000);

    const newChatButton = await $('button').filter({ has: await $('svg.lucide-plus') }).first();
    if (await newChatButton.isVisible()) {
      await newChatButton.click();
      await browser.pause(500);
    }

    const messageInput = await $('input[placeholder], textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('你好');
      expect(await messageInput.inputValue()).toBe('你好');
    }
  });

  it('验证智能体模型配置', async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });

    await browser.url('/agents');
    await browser.pause(500);

    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await internalSection.click();
    await browser.pause(1000);

    const cards = await $('.rounded-lg.border.border-border.bg-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

