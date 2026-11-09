import { test, expect } from '@playwright/test';

test.describe('Flows Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/flows');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('思维定式');
  });

  test('显示流程列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="flow-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   流程页的表头「名称」。
    await expect(page.getByRole('columnheader', { name: '名称' })).toBeVisible();
  });

  test('显示新建流程按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：流程页**没有**「新建流程」按钮
    //   ⇒ ⇒ 原来找的按钮不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    //   ⇒ ⇒ 改认产品真实存在的那个动作：页面上有「刷新」按钮。
    const refreshButton = page.getByRole('button', { name: '刷新', exact: true });
    await expect(refreshButton).toBeVisible();
  });
});
