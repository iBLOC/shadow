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
    // ⚠️ 2026-11-11 真机实测（刀 O）：名字必须**唯一** ⇒ ⇒ 否则同一个名字
    //   会被写进端脑**多次**（E2E 之间共享端脑状态）⇒ ⇒ 页面上出现多个同名卡片
    //   ⇒ ⇒ Playwright strict mode 直接判红（实测：resolved to 2 elements）。
    const providerName = 'Test Provider ' + Date.now();
    await nameInput.fill(providerName);
    
    await page.locator('button:has-text("DeepSeek")').click();
    
    // Use the button with exact text "添加" (not "添加供应商")
    const submitButton = page.getByRole('button', { name: '添加', exact: true });
    await submitButton.click();
    
    // ⚠️ 2026-11-11 真机实测（刀 O）：这条原来**一条断言都没有**
    //   ⇒ ⇒ 点完就结束 ⇒ ⇒ 「添加供应商成功」这个宣称**没有任何东西在核**
    //   ⇒ ⇒ 补结果断言。
    //   ⚠️ 真机实测：提交后弹窗**没关**（按钮仍可见）⇒ ⇒ 不能断言它消失。
    //   ⇒ ⇒ 断言「供应商名字出现在页面上」——那才是「添加成功」被核到了。
    //   ⚠️ 用 `.first()`：端脑里可能已经有**同名**的历史条目（E2E 共享状态）
    //   ⇒ ⇒ strict mode 会因为多个同名元素判红 ⇒ ⇒ 认第一个即可。
    await expect(page.getByText(providerName).first()).toBeVisible();
  });

  test('取消添加供应商', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    const addButton = page.locator('button:has-text("添加供应商")').first();
    await addButton.click();
    
    const cancelButton = page.locator('button:has-text("取消")');
    await cancelButton.click();
    
    // ⚠️ 2026-11-11 真机实测（刀 O）：这条原来**一条断言都没有**
    //   ⇒ ⇒ 「取消」这个宣称没有任何东西在核 ⇒ ⇒ 补结果断言：
    //   ⇒ ⇒ 弹窗真的关掉了（取消按钮不见了）。
    await expect(cancelButton).toBeHidden();
  });
});
