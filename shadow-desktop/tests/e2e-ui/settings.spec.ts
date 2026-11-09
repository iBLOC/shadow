import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('显示端脑状态', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测：这条原来找 heading「端脑」⇒ ⇒ 但设置页
    //    **改版成了侧栏 section 布局**（SettingsPage 的 activeSection）⇒ ⇒
    //    「端脑」那个 heading **不再存在**⇒ ⇒ 恒红 ⇒ ⇒ 改认侧栏里的
    //    「服务与智能体」那一项 ⇒ ⇒ 它就是端脑那一片。
    const serviceSection = page.getByRole('button', { name: /服务与智能体/ }).first();
    await expect(serviceSection).toBeVisible();
  });

  test('显示语言设置', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测：语言/主题在「界面」那一 section 里 ⇒ ⇒
    //    落在默认 section 上**看不到**⇒ ⇒ 先切 section 再断言。
    await page.getByRole('button', { name: /^界面$/ }).first().click();
    const langSection = page.locator('text=语言').first();
    await expect(langSection).toBeVisible();
  });

  test('显示主题设置', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测：同上 ⇒ ⇒ 先切到「界面」section。
    await page.getByRole('button', { name: /^界面$/ }).first().click();
    const themeSection = page.locator('text=主题').first();
    await expect(themeSection).toBeVisible();
  });

  test('显示记忆集成', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：设置页改版成侧栏 section 布局
    //   ⇒ ⇒ 「记忆」在「子系统」那一 section 里 ⇒ ⇒ 默认 section 上看不到
    //   ⇒ ⇒ 先切 section 再断言 ⇒ ⇒ 断言恒进（不再靠软守卫）。
    await page.getByRole('button', { name: /^子系统$/ }).first().click();
    const memorySection = page.getByText('记忆').first();
    await expect(memorySection).toBeVisible();
  });
});
