import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';

test.describe('Providers - Model Fetching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/models');
    await page.waitForLoadState('networkidle');
  });

  test('添加 MiMo 供应商并获取模型', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")');
    await addButton.click();
    
    await page.locator('button:has-text("Xiaomi MiMo")').click();
    
    const nameInput = page.locator('input[placeholder="OpenAI"]');
    await nameInput.fill('MiMo Test');
    
    const apiKeyInput = page.locator('input[type="password"]');
    await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);
    
    const submitButton = page.getByRole('button', { name: '添加', exact: true });
    await submitButton.click();
    
    await page.waitForTimeout(3000);
    
    const autoMatchDialog = page.getByText('自动匹配模型');
    if (await autoMatchDialog.isVisible()) {
      const confirmButton = page.getByRole('button', { name: '自动匹配' });
      await confirmButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test('供应商添加后显示模型列表', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const providerCards = page.locator('[data-testid="provider-card"]');
    const count = await providerCards.count();
    
    if (count > 0) {
      const firstProvider = providerCards.first();
      await firstProvider.click();
      await page.waitForTimeout(500);
      
      const modelItems = page.locator('[data-testid="model-item"]');
      const modelCount = await modelItems.count();
      expect(modelCount).toBeGreaterThan(0);
    }
  });

  test('供应商持久化测试', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const providerCards = page.locator('[data-testid="provider-card"]');
    const countBefore = await providerCards.count();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const cloudTabAfterReload = page.locator('button:has-text("云端供应商")');
    await cloudTabAfterReload.click();
    await page.waitForTimeout(500);
    
    const providerCardsAfterReload = page.locator('[data-testid="provider-card"]');
    const countAfter = await providerCardsAfterReload.count();
    
    expect(countAfter).toBe(countBefore);
  });
});
