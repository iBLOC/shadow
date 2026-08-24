// Auto-migrated from providers-models.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
import { TEST_CONFIG } from './config';

describe('Providers - Model Fetching', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/models');
    await browser.pause(500);
  });

  it('添加 MiMo 供应商并获取模型', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    await $('button:has-text("Xiaomi MiMo")').click();
    
    const nameInput = await $('input[placeholder="OpenAI"]');
    await nameInput.fill('MiMo Test');
    
    const apiKeyInput = await $('input[type="password"]');
    await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);
    
    const submitButton = await $('['button', { name: '添加', exact: true }]');
    await submitButton.click();
    
    await browser.pause(3000);
    
    const autoMatchDialog = page.getByText('自动匹配模型');
    if (await autoMatchDialog.isVisible()) {
      const confirmButton = await $('['button', { name: '自动匹配' }]');
      await confirmButton.click();
      await browser.pause(1000);
    }
  });

  it('供应商添加后显示模型列表', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const providerCards = await $('[data-testid="provider-card"]');
    const count = await providerCards.count();
    
    if (count > 0) {
      const firstProvider = providerCards.first();
      await firstProvider.click();
      await browser.pause(500);
      
      const modelItems = await $('[data-testid="model-item"]');
      const modelCount = await modelItems.count();
      expect(modelCount).toBeGreaterThan(0);
    }
  });

  it('供应商持久化测试', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const providerCards = await $('[data-testid="provider-card"]');
    const countBefore = await providerCards.count();
    
    await page.reload();
    await browser.pause(500);
    
    const cloudTabAfterReload = await $('button:has-text("云端供应商")');
    await cloudTabAfterReload.click();
    await browser.pause(500);
    
    const providerCardsAfterReload = await $('[data-testid="provider-card"]');
    const countAfter = await providerCardsAfterReload.count();
    
    expect(countAfter).toBe(countBefore);
  });
});

