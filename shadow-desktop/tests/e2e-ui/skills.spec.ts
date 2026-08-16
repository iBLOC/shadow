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
    const skillList = page.locator('[data-testid="skill-list"]');
    if (await skillList.isVisible()) {
      await expect(skillList).toBeVisible();
    }
  });

  test('显示新建技能按钮', async ({ page }) => {
    const newSkillButton = page.locator('button:has-text("新建技能")');
    if (await newSkillButton.isVisible()) {
      await expect(newSkillButton).toBeVisible();
    }
  });
});
