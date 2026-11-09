import { test, expect } from '@playwright/test';

test.describe('Resonance Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/resonance');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('共鸣');
  });

  test('显示共鸣实例列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="resonance-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   没配实例时显示「尚未配置 Resonance 实例。添加一个开始。」。
    await expect(page.getByText(/尚未配置 Resonance 实例/)).toBeVisible();
  });

  test('显示添加实例按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：这条的按钮**真实存在**（「添加实例」）
    //   ⇒ ⇒ 但软守卫 `isVisible()` 让它变成「存在才断言」⇒ ⇒ 去掉守卫，
    //   ⇒ ⇒ Playwright 的 expect 自带重试 ⇒ ⇒ 元素不在就**真红**。
    const addInstanceButton = page.getByRole('button', { name: '添加实例', exact: true });
    await expect(addInstanceButton).toBeVisible();
  });
});
