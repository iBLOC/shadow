import { test, expect } from '@playwright/test';

test.describe('Setup Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('shadow_setup_complete');
    });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    // Setup page uses h2 tags for section titles
    const h2 = page.locator('h2').first();
    await expect(h2).toBeVisible();
  });

  test('显示密码设置', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：向导第一步的标题就是「设置密码」
    //   ⇒ ⇒ 元素真实存在 ⇒ ⇒ 但软守卫让它变成「存在才断言」
    //   ⇒ ⇒ 去掉守卫 ⇒ ⇒ Playwright 的 expect 自带重试 ⇒ ⇒ 不在就真红。
    const passwordSection = page.getByText('设置密码', { exact: true });
    await expect(passwordSection).toBeVisible();
  });

  test('显示数据库设置', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：向导第三步是「管理模型」
    //   ⇒ ⇒ 页面里**没有**「数据库」这一节（那是旧版向导）
    //   ⇒ ⇒ 原来找的元素不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    //   ⇒ ⇒ 改认向导真实存在的第三步「管理模型」。
    const modelStep = page.getByText('管理模型', { exact: true });
    await expect(modelStep).toBeVisible();
  });
});
