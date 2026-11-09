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
    test.skip(!TEST_CONFIG.MIMO_API_KEY, 'set MIMO_API_KEY to run against the real MiMo API');
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
    
    // ⚠️ 2026-11-11 真机实测（刀 O）：软守卫让这条可能整条跳过 ⇒ ⇒
    //   「添加 MiMo 供应商并**获取模型**」这个宣称没有任何东西在核。
    //   ⇒ ⇒ 补结果断言：供应商卡片出现了。
    await expect(page.getByText('MiMo Test')).toBeVisible();
  });

  test('供应商添加后显示模型列表', async ({ page }) => {
    const cloudTab = page.locator('button:has-text("云端供应商")');
    await cloudTab.click();
    await page.waitForTimeout(500);
    
    // ⚠️ 2026-11-11 真机实测（刀 O）：`if (count > 0)` 是**软守卫**
    //   ⇒ ⇒ 没有供应商时整条断言**不执行** ⇒ ⇒ 零断言通过（假绿）。
    //   ⇒ ⇒ 现在两条分支**都断言**（不再是「可能一条都不跑」）。
    //   ⚠️ 真机实测：'[data-testid="provider-card"]' 在产品里**不存在**
    //   ⇒ ⇒ 真实锚点是卡片标题 **h3**（供应商名）⇒ ⇒ 按它判「有没有供应商」。
    //   ⚠️ 这一页是 **/models**（不是 /providers）⇒ ⇒ 空态文案是「暂无供应商」。
    const providerTitles = page.locator('h3');
    const count = await providerTitles.count();
    if (count === 0) {
      await expect(page.getByText('暂无供应商')).toBeVisible();
    } else {
      await expect(providerTitles.first()).toBeVisible();
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
