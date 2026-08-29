import { test, expect } from '@playwright/test';

test.describe('Visual QA Clarification Chip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');
  });

  test('当 cortex 返回 clarification event 时,UI 显示候选 chip', async ({ page }) => {
    await page.route('**/shadow/v1/conversations/*/messages:stream', async (route) => {
      const sseBody = [
        'data: {"type":"delta","agent":"temporal","delta":"[visual_qa] 请选择摄像头"}\n\n',
        'data: {"type":"clarification","agent":"temporal","clarification":{"kind":"vsrc_pick","candidates":[{"source_id":"vsrc_a","device_label":"Logitech BRIO","host_label":"this-cortex"},{"source_id":"vsrc_b","device_label":"MacBook Camera","host_label":"ibloc-mbp"}]}}\n\n',
        'data: {"type":"done","conversation_id":"conv-test","agent":"temporal","state":"COMPLETED","timestamp":1700000000}\n\n',
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody,
      });
    });

    const messageInput = page.locator('input[placeholder], textarea').first();
    await messageInput.fill('看看前面有什么');
    const sendButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await sendButton.click();

    await expect(page.getByTestId('visual-qa-clarification-chip')).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByTestId('visual-qa-candidate-vsrc_a')).toBeVisible();
    await expect(page.getByTestId('visual-qa-candidate-vsrc_b')).toBeVisible();
  });

  test('点击 candidate 后发送 picked message 并复用 conversation', async ({ page }) => {
    let streamCallCount = 0;
    let capturedSecondBody: string | null = null;
    await page.route('**/shadow/v1/conversations/*/messages:stream', async (route, request) => {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        const sseBody = [
          'data: {"type":"clarification","agent":"temporal","clarification":{"kind":"vsrc_pick","candidates":[{"source_id":"vsrc_a","device_label":"Logitech BRIO","host_label":"this-cortex"}]}}\n\n',
          'data: {"type":"done","conversation_id":"conv-test","agent":"temporal","state":"COMPLETED","timestamp":1700000000}\n\n',
        ].join('');
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody,
        });
      } else {
        capturedSecondBody = request.postData() ?? '';
        const sseBody = [
          'data: {"type":"delta","agent":"temporal","delta":"看到一台 Logitech BRIO 摄像头"}\n\n',
          'data: {"type":"done","conversation_id":"conv-test","agent":"temporal","state":"COMPLETED","timestamp":1700000001}\n\n',
        ].join('');
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody,
        });
      }
    });

    const messageInput = page.locator('input[placeholder], textarea').first();
    await messageInput.fill('看看前面');
    const sendButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await sendButton.click();

    await expect(page.getByTestId('visual-qa-clarification-chip')).toBeVisible({
      timeout: 5000,
    });

    await page.getByTestId('visual-qa-candidate-vsrc_a').click();

    expect(capturedSecondBody).toBeTruthy();
    expect(capturedSecondBody).toContain('vsrc_a');
  });
});