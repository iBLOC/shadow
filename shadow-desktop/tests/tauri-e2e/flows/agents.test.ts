// Auto-migrated from agents.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Agents Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/agents');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('智能体');
  });

  it('显示智能体分类', async () => {
    expect(await $(''['button', { name: '内部智能体' }]'').isDisplayed()).toBe(true);
    expect(await $(''['button', { name: 'WASM 智能体' }]'').isDisplayed()).toBe(true);
  });

  it('显示搜索功能', async () => {
    const searchInput = await $('input[placeholder*="weather"]');
    await expect(searchInput).toBeVisible();
  });

  it('显示新建自定义智能体按钮', async () => {
    const newAgentButton = await $('['button', { name: '新建自定义智能体' }]').first();
    await expect(newAgentButton).toBeVisible();
  });

  it('打开新建智能体模态框', async () => {
    const newAgentButton = await $('['button', { name: '新建自定义智能体' }]').first();
    await newAgentButton.click();
    
    expect(await $(''['heading', { name: '新建自定义智能体' }]'').isDisplayed()).toBe(true);
  });
});

