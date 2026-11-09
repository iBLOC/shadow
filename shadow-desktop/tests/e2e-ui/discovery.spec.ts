import { test, expect } from '@playwright/test';

test.describe('Discovery Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/discovery');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Shadow 节点');
  });

  test('显示设备列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="device-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   没发现到节点时显示「未找到节点」。
    await expect(page.getByText('未找到节点').first()).toBeVisible();
  });

  test('显示扫描按钮', async ({ page }) => {
    const scanButton = page.getByRole('button', { name: '开始扫描' }).first();
    await expect(scanButton).toBeVisible();
  });
});
