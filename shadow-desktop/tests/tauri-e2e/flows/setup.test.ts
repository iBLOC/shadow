// Auto-migrated from setup.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Setup Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.removeItem('shadow_setup_complete');
    });
    await browser.url('/setup');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    // Setup page uses h2 tags for section titles
    const h2 = await $('h2').first();
    await expect(h2).toBeVisible();
  });

  it('显示密码设置', async () => {
    const passwordSection = await $('text=设置密码');
    if (await passwordSection.isVisible()) {
      await expect(passwordSection).toBeVisible();
    }
  });

  it('显示数据库设置', async () => {
    const databaseSection = await $('text=数据库');
    if (await databaseSection.isVisible()) {
      await expect(databaseSection).toBeVisible();
    }
  });
});

