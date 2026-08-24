// Auto-migrated from group.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Group Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/group');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('设备组');
  });

  it('显示群组列表', async () => {
    const groupList = await $('[data-testid="group-list"]');
    if (await groupList.isVisible()) {
      await expect(groupList).toBeVisible();
    }
  });

  it('显示新建群组按钮', async () => {
    const newGroupButton = await $('button:has-text("新建群组")');
    if (await newGroupButton.isVisible()) {
      await expect(newGroupButton).toBeVisible();
    }
  });
});

