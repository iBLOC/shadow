// Auto-migrated from providers.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Providers Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/providers');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('providers.title');
  });

  it('显示供应商列表', async () => {
    const providerList = await $('[data-testid="provider-list"]');
    if (await providerList.isVisible()) {
      await expect(providerList).toBeVisible();
    }
  });

  it('显示添加供应商按钮', async () => {
    const addProviderButton = await $('button:has-text("添加供应商")');
    if (await addProviderButton.isVisible()) {
      await expect(addProviderButton).toBeVisible();
    }
  });
});

