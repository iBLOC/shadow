// Auto-migrated from mcp.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('MCP Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/mcp');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('MCP');
  });

  it('显示添加服务器按钮', async () => {
    const addButton = await $('button:has-text("添加服务器")');
    await expect(addButton).toBeVisible();
  });
});

