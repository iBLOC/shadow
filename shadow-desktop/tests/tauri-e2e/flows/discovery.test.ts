// Auto-migrated from discovery.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Discovery Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/discovery');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('Shadow 节点');
  });

  it('显示设备列表', async () => {
    const deviceList = await $('[data-testid="device-list"]');
    if (await deviceList.isVisible()) {
      await expect(deviceList).toBeVisible();
    }
  });

  it('显示扫描按钮', async () => {
    const scanButton = await $('['button', { name: '开始扫描' }]').first();
    await expect(scanButton).toBeVisible();
  });
});

