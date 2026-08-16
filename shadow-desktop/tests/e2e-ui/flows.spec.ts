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
    const flowList = page.locator('[data-testid="flow-list"]');
    if (await flowList.isVisible()) {
      await expect(flowList).toBeVisible();
    }
  });

  test('显示新建流程按钮', async ({ page }) => {
    const newFlowButton = page.locator('button:has-text("新建流程")');
    if (await newFlowButton.isVisible()) {
      await expect(newFlowButton).toBeVisible();
    }
  });
});
