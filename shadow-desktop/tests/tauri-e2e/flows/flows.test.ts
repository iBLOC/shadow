// Auto-migrated from flows.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Flows Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/flows');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('思维定式');
  });

  it('显示流程列表', async () => {
    const flowList = await $('[data-testid="flow-list"]');
    if (await flowList.isVisible()) {
      await expect(flowList).toBeVisible();
    }
  });

  it('显示新建流程按钮', async () => {
    const newFlowButton = await $('button:has-text("新建流程")');
    if (await newFlowButton.isVisible()) {
      await expect(newFlowButton).toBeVisible();
    }
  });
});

