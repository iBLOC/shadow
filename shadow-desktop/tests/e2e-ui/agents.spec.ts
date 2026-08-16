import { test, expect } from '@playwright/test';

test.describe('Agents Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('智能体');
  });

  test('显示智能体分类', async ({ page }) => {
    await expect(page.getByRole('button', { name: '内部智能体' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'WASM 智能体' })).toBeVisible();
  });

  test('显示搜索功能', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="weather"]');
    await expect(searchInput).toBeVisible();
  });

  test('显示新建自定义智能体按钮', async ({ page }) => {
    const newAgentButton = page.getByRole('button', { name: '新建自定义智能体' }).first();
    await expect(newAgentButton).toBeVisible();
  });

  test('打开新建智能体模态框', async ({ page }) => {
    const newAgentButton = page.getByRole('button', { name: '新建自定义智能体' }).first();
    await newAgentButton.click();
    
    await expect(page.getByRole('heading', { name: '新建自定义智能体' })).toBeVisible();
  });
});
