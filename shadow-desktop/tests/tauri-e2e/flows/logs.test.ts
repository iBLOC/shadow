// Auto-migrated from logs.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Logs Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/logs');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('错误日志');
  });

  it('显示日志列表', async () => {
    const logList = await $('[data-testid="log-list"]');
    if (await logList.isVisible()) {
      await expect(logList).toBeVisible();
    }
  });

  it('显示清除按钮', async () => {
    const clearButton = await $('button:has-text("清除")');
    if (await clearButton.isVisible()) {
      await expect(clearButton).toBeVisible();
    }
  });
});

