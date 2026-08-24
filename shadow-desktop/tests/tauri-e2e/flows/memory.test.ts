// Auto-migrated from memory.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Memory Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/memory');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('记忆');
  });

  it('显示搜索功能', async () => {
    const searchInput = await $('input[placeholder*="搜索记忆"]');
    await expect(searchInput).toBeVisible();
  });
});

