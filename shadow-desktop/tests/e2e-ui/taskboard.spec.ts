import { test, expect } from '@playwright/test';

test.describe('TaskBoard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('任务');
  });

  test('显示任务列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：这条原来断言 '[data-testid="task-list"]'
    //   ⇒ ⇒ 但产品里**根本没有这个 testid** ⇒ ⇒ 软守卫 `isVisible()` 恒 false
    //   ⇒ ⇒ 分支从未进入 ⇒ ⇒ 断言**从未执行**（绿得毫无意义）。
    //   ⇒ ⇒ 改认产品**真实**的列表锚点：任务板有状态列（待办/计划中/…）
    //   ⇒ ⇒ 认「待办」那个列标题 ⇒ ⇒ 它是真实存在的。
    const backlogColumn = page.getByRole('heading', { name: '待办', exact: true }).first();
    await expect(backlogColumn).toBeVisible();
  });

  test('显示新建任务按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：产品按钮文案是「**添加**任务」
    //   ⇒ ⇒ 原来找的「新建任务」**不存在**⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    //   ⇒ ⇒ 改认真实文案，并去掉软守卫（Playwright 的 expect 自带重试）。
    const addTaskButton = page.getByRole('button', { name: '添加任务', exact: true }).first();
    await expect(addTaskButton).toBeVisible();
  });
});
