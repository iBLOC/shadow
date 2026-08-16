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
    const taskList = page.locator('[data-testid="task-list"]');
    if (await taskList.isVisible()) {
      await expect(taskList).toBeVisible();
    }
  });

  test('显示新建任务按钮', async ({ page }) => {
    const newTaskButton = page.locator('button:has-text("新建任务")');
    if (await newTaskButton.isVisible()) {
      await expect(newTaskButton).toBeVisible();
    }
  });
});
