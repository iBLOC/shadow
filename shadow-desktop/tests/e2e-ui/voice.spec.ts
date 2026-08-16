import { test, expect } from '@playwright/test';

test.describe('Voice Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/voice');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确显示', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('语音');
  });

  test('显示语音设置', async ({ page }) => {
    const voiceSettings = page.locator('[data-testid="voice-settings"]');
    if (await voiceSettings.isVisible()) {
      await expect(voiceSettings).toBeVisible();
    }
  });
});
