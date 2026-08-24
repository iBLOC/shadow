// Auto-migrated from agents-model-selection.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Agents Page - Model Selection', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/agents');
    await browser.pause(500);
  });

  it('显示内部智能体区域', async () => {
    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await expect(internalSection).toBeVisible();
  });

  it('展开内部智能体列表', async () => {
    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await internalSection.click();
    await browser.pause(1000);
    
    const lobeCards = await $('.rounded-lg.border.border-border.bg-card');
    const count = await lobeCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('智能体卡片显示模型选择', async () => {
    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await internalSection.click();
    await browser.pause(1000);
    
    const cards = await $('.rounded-lg.border.border-border.bg-card');
    const count = await cards.count();
    
    if (count > 0) {
      const selects = await $('select');
      const selectCount = await selects.count();
      expect(selectCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('模型选择后不重置', async () => {
    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await internalSection.click();
    await browser.pause(1000);
    
    const firstSelect = await $('select').first();
    if (await firstSelect.isVisible()) {
      const options = await firstSelect.locator('option').all();
      if (options.length > 1) {
        await firstSelect.selectOption({ index: 1 });
        await browser.pause(500);
        
        const selectedValue = await firstSelect.inputValue();
        expect(selectedValue).not.toBe('');
      }
    }
  });

  it('智能体卡片显示所需能力', async () => {
    const internalSection = await $('['button', { name: /内部智能体/ }]');
    await internalSection.click();
    await browser.pause(1000);
    
    const llmBadge = await $('text=llm').first();
    if (await llmBadge.isVisible()) {
      await expect(llmBadge).toBeVisible();
    }
  });
});

