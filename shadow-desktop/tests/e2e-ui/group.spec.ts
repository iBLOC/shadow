import { test, expect } from '@playwright/test';

test.describe('Group Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/group');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('设备组');
  });

  test('显示群组列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="group-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   「已配对设备」那个列表标题。
    const peersHeading = page.getByText(/已配对设备/);
    await expect(peersHeading).toBeVisible();
  });

  test('显示新建群组按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：产品按钮是「**创建配对**」
    //   ⇒ ⇒ 原来找的「新建群组」不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    const createPairingButton = page.getByRole('button', { name: '创建配对', exact: true });
    await expect(createPairingButton).toBeVisible();
  });
});
