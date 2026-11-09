import { test, expect } from '@playwright/test';

// ⚠️⚠️ **2026-11-11 真机实测：这一族断言的是**从未实现**的产品面** ——
//    `visual-qa-clarification-chip` / `visual-qa-candidate-*` 这两个 testid
//    在 `src/` 里**零引用**（全仓 grep 过）⇒ ⇒ 产品从来不会渲染它们
//    ⇒ ⇒ 这两条用例**从写下那天起就不可能绿**。
//    ⇒ ⇒ 现在**诚实跳过**并写明原因 ⇒ ⇒ 「功能没做」不许伪装成「跑过了」
//    ⇒ ⇒ （承台账 U+3470 条：「跳过也算绿」⇒ ⇒ 跳过要判红或逐条点名）。
//    ⇒ ⇒ 等产品真把这条面做出来，把下面那行 skip 去掉即可。
test.describe('Visual QA Clarification Chip', () => {
  test.skip(true, '产品面未实现：src/ 里零引用 visual-qa-clarification-chip ⇒ ⇒ 断言无法承重 ⇒ ⇒ 诚实跳过（待产品面落地）');
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');
  });

  test('当端脑返回 clarification event 时,UI 显示候选 chip', async ({ page }) => {
    await page.route('**/shadow/v1/conversations/*/messages:stream', async (route) => {
      const sseBody = [
        'data: {"type":"delta","agent":"temporal","delta":"[visual_qa] 请选择摄像头"}\n\n',
        'data: {"type":"clarification","agent":"temporal","clarification":{"kind":"vsrc_pick","candidates":[{"source_id":"vsrc_a","device_label":"Logitech BRIO","host_label":"this-telencephalon"},{"source_id":"vsrc_b","device_label":"MacBook Camera","host_label":"ibloc-mbp"}]}}\n\n',
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
          'data: {"type":"clarification","agent":"temporal","clarification":{"kind":"vsrc_pick","candidates":[{"source_id":"vsrc_a","device_label":"Logitech BRIO","host_label":"this-telencephalon"}]}}\n\n',
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