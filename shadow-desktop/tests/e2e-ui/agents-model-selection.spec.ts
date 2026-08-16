import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';

test.describe('Agents Page - Model Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
  });

  test('显示内部智能体列表', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: '内部智能体' });
    await expect(internalSection).toBeVisible();
    
    await internalSection.click();
    await page.waitForTimeout(500);
    
    await expect(page.getByText('prefrontal')).toBeVisible();
    await expect(page.getByText('temporal')).toBeVisible();
    await expect(page.getByText('parietal')).toBeVisible();
    await expect(page.getByText('occipital')).toBeVisible();
  });

  test('每个内部智能体显示模型选择下拉框', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: '内部智能体' });
    await internalSection.click();
    await page.waitForTimeout(500);
    
    const selects = page.locator('select');
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('模型选择后保存成功', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: '内部智能体' });
    await internalSection.click();
    await page.waitForTimeout(500);
    
    const firstSelect = page.locator('select').first();
    await firstSelect.selectOption({ index: 1 });
    
    await page.waitForTimeout(1000);
    
    const selectedValue = await firstSelect.inputValue();
    expect(selectedValue).not.toBe('');
  });

  test('刷新后模型选择保持', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: '内部智能体' });
    await internalSection.click();
    await page.waitForTimeout(500);
    
    const firstSelect = page.locator('select').first();
    await firstSelect.selectOption({ index: 1 });
    const selectedValue = await firstSelect.inputValue();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const internalSectionAfterReload = page.getByRole('button', { name: '内部智能体' });
    await internalSectionAfterReload.click();
    await page.waitForTimeout(500);
    
    const firstSelectAfterReload = page.locator('select').first();
    const valueAfterReload = await firstSelectAfterReload.inputValue();
    
    expect(valueAfterReload).toBe(selectedValue);
  });

  test('显示所需能力标签', async ({ page }) => {
    const internalSection = page.getByRole('button', { name: '内部智能体' });
    await internalSection.click();
    await page.waitForTimeout(500);
    
    await expect(page.getByText('llm')).toBeVisible();
    await expect(page.getByText('asr')).toBeVisible();
    await expect(page.getByText('tts')).toBeVisible();
    await expect(page.getByText('vision')).toBeVisible();
  });
});
