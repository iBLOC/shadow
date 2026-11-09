import { test, expect } from '@playwright/test';

test.describe('Skills Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/skills');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('技能');
  });

  test('显示技能列表', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：'[data-testid="skill-list"]' 产品里不存在
    //   ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 断言从未执行 ⇒ ⇒ 改认产品真实的列表锚点：
    //   「内置技能」那个分组标题。
    const builtinHeading = page.getByRole('heading', { name: '内置技能' });
    await expect(builtinHeading).toBeVisible();
  });

  test('显示新建技能按钮', async ({ page }) => {
    // ⚠️ 2026-11-11 真机实测（刀 O）：产品按钮是「**添加**技能」
    //   ⇒ ⇒ 原来找的「新建技能」不存在 ⇒ ⇒ 软守卫恒 false ⇒ ⇒ 零断言通过。
    const addSkillButton = page.getByRole('button', { name: '添加技能', exact: true });
    await expect(addSkillButton).toBeVisible();
  });
});
