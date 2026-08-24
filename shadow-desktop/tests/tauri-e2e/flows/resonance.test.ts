// Auto-migrated from resonance.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Resonance Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/resonance');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('共鸣');
  });

  it('显示共鸣实例列表', async () => {
    const instanceList = await $('[data-testid="resonance-list"]');
    if (await instanceList.isVisible()) {
      await expect(instanceList).toBeVisible();
    }
  });

  it('显示添加实例按钮', async () => {
    const addInstanceButton = await $('button:has-text("添加实例")');
    if (await addInstanceButton.isVisible()) {
      await expect(addInstanceButton).toBeVisible();
    }
  });
});

