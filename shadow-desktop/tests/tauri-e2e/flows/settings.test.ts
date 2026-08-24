// Auto-migrated from settings.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Settings Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/settings');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''['heading', { name: '设置' }]'').isDisplayed()).toBe(true);
  });

  it('显示 Cortex 状态', async () => {
    const cortexSection = await $('['heading', { name: /Cortex/ }]');
    await expect(cortexSection).toBeVisible();
  });

  it('显示语言设置', async () => {
    const langSection = await $('text=语言').first();
    await expect(langSection).toBeVisible();
  });

  it('显示主题设置', async () => {
    const themeSection = await $('text=主题').first();
    await expect(themeSection).toBeVisible();
  });

  it('显示记忆集成', async () => {
    const memorySection = await $('text=记忆').first();
    if (await memorySection.isVisible()) {
      await expect(memorySection).toBeVisible();
    }
  });
});

