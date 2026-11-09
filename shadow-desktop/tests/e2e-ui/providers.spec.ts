import { test, expect } from '@playwright/test';

test.describe('Providers Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/providers');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('大模型服务提供商');
  });

  test('显示供应商列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="provider-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   没配提供商时显示「暂未配置提供商」。
    await expect(page.getByText('暂未配置提供商')).toBeVisible();
  });

  test('显示添加供应商按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：产品按钮是「**添加提供商**」
    //   ⇒ ⇒ 原来找的「添加供应商」不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    const addProviderButton = page.getByRole('button', { name: '添加提供商', exact: true });
    await expect(addProviderButton).toBeVisible();
  });
});
