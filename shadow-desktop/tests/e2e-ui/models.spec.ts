import { test, expect } from '@playwright/test';

test.describe('Models Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set setup complete to skip onboarding
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/models');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('模型');
  });

  test('云供应商和本地模型 tab 切换', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    const localTab = page.locator('button:has-text("本地引擎")');
    
    await expect(cloudTab).toBeVisible();
    await expect(localTab).toBeVisible();
    
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    await localTab.click();
    await page.waitForTimeout(500);
  });

  test('添加供应商按钮存在', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await expect(addButton).toBeVisible();
  });

  test('打开添加供应商模态框', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    // Check for the modal heading
    await expect(page.getByRole('heading', { name: '添加供应商' })).toBeVisible();
  });

  test('模态框显示供应商列表', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    // Check for provider buttons in the modal
    await expect(page.locator('button:has-text("Xiaomi MiMo")')).toBeVisible();
    await expect(page.locator('button:has-text("OpenAI")')).toBeVisible();
    await expect(page.locator('button:has-text("DeepSeek")')).toBeVisible();
    await expect(page.locator('button:has-text("Anthropic")')).toBeVisible();
  });

  test('选择供应商后自动填充 API 地址', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    await page.locator('button:has-text("Xiaomi MiMo")').click();
    
    const apiBaseInput = page.locator('input[placeholder*="api"]');
    await expect(apiBaseInput).toHaveValue('https://api.xiaomimimo.com/v1');
  });

  test('添加供应商成功', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    const nameInput = page.locator('input[placeholder="OpenAI"]');
    await nameInput.fill('Test Provider');
    
    await page.locator('button:has-text("DeepSeek")').click();
    
    // Use the button with exact text "添加" (not "添加供应商")
    const submitButton = page.getByRole('button', { name: '添加', exact: true });
    await submitButton.click();
    
    await page.waitForTimeout(1000);
  });

  test('取消添加供应商', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    const cancelButton = page.locator('button:has-text("取消")');
    await cancelButton.click();
    
    await page.waitForTimeout(500);
  });
});
