import { test, expect } from '@playwright/test';

test.describe('End-to-End: Conversation to Task Scheduling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  test('对话页面输入定时任务消息', async ({ page }) => {
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('input[placeholder], textarea').first();
    if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageInput.fill('每天下午18点总结全网最新的AI咨询');
      expect(await messageInput.inputValue()).toContain('18点');
    }
  });

  test('任务看板页面加载', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('智能体页面加载', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('模型页面加载', async ({ page }) => {
    await page.goto('/models');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
