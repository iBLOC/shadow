// Auto-migrated from conversation.spec.ts by tools/migrate-spec.js
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

  it('页面标题正确显示', async () => {
    expect(await $(''['heading', { name: '对话', exact: true }]'').isDisplayed()).toBe(true);
  });

  it('显示新对话按钮', async () => {
    const newChatButton = await $('button:has-text("新对话")');
    await expect(newChatButton).toBeVisible();
  });

  it('创建新对话', async () => {
    const newChatButton = await $('button:has-text("新对话")');
    await newChatButton.click();
    await browser.pause(1000);
  });
});

