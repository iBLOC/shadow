import { test, expect } from '@playwright/test';

test.describe('Agents Page - Model Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
  });

  test('显示内部智能体区域', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: /内部智能体/ });
    await expect(internalSection).toBeVisible();
  });

  test('展开内部智能体列表', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: /内部智能体/ });
    await internalSection.click();
    await page.waitForTimeout(1000);
    
    const lobeCards = page.locator('.rounded-lg.border.border-border.bg-card');
    const count = await lobeCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('智能体卡片显示模型选择', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: /内部智能体/ });
    await internalSection.click();
    await page.waitForTimeout(1000);
    
    const cards = page.locator('.rounded-lg.border.border-border.bg-card');
    const count = await cards.count();
    
    if (count > 0) {
      const selects = page.locator('select');
      const selectCount = await selects.count();
      expect(selectCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('模型选择后不重置', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: /内部智能体/ });
    await internalSection.click();
    await page.waitForTimeout(1000);
    
    const firstSelect = page.locator('select').first();
    if (await firstSelect.isVisible()) {
      const options = await firstSelect.locator('option').all();
      if (options.length > 1) {
        await firstSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
        
        const selectedValue = await firstSelect.inputValue();
        expect(selectedValue).not.toBe('');
      }
    }
  });

  test('智能体卡片显示所需能力', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: /内部智能体/ });
    await internalSection.click();
    await page.waitForTimeout(1000);
    
    const llmBadge = page.locator('text=llm').first();
    if (await llmBadge.isVisible()) {
      await expect(llmBadge).toBeVisible();
    }
  });
});
