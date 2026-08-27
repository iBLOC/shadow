import { test, expect } from '@playwright/test';

test.describe('Video Sources Card', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings page
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('renders video sources card in settings page', async ({ page }) => {
    // The video sources section should be visible in the settings page
    const videoSection = page.getByText(/Video Sources|视频源/).first();
    await expect(videoSection).toBeVisible();
  });

  test('shows empty state when no video sources configured', async ({ page }) => {
    // Mock cortex API to return empty video sources
    await page.route('**/api/cortex/video-sources', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: 'v1' },
        body: JSON.stringify({ sources: [], activeId: null, device: null }),
      });
    });

    // Navigate to settings page
    await page.goto('/settings');
    // Click on video sources section
    await page.getByText(/Video Sources|视频源/).first().click();
    // Should show empty state message
    await expect(page.getByText(/No video sources found|未发现视频设备/)).toBeVisible();
  });

  test('displays video source when configured', async ({ page }) => {
    // Mock cortex API to return one video source
    await page.route('**/api/cortex/video-sources', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: 'v2' },
        body: JSON.stringify({
          sources: [
            {
              id: 'vsrc_test',
              deviceId: 'dev_test',
              label: 'Test Camera',
              kind: 'uvc',
              transport: 'browser',
              capabilities: { widths: [1920], heights: [1080], frameRates: [30] },
              active: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          activeId: 'vsrc_test',
          device: { platform: 'linux', hostname: 'test-host', cortexVersion: '0.1.0' },
        }),
      });
    });

    await page.goto('/settings');
    await page.getByText(/Video Sources|视频源/).first().click();
    // Should display the test camera label
    await expect(page.getByText('Test Camera')).toBeVisible();
    // Should show active badge
    await expect(page.getByText(/Active|活动/)).toBeVisible();
  });
});
