# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: conversation-chat.spec.ts >> Conversation Page >> 对话页面加载成功
- Location: tests/e2e-ui/conversation-chat.spec.ts:13:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h3').filter({ hasText: /对话/ }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('h3').filter({ hasText: /对话/ }).first()

```

```yaml
- alertdialog "HTTP 请求失败（还有 7 个排队中）":
  - heading "HTTP 请求失败（还有 7 个排队中）" [level=2]:
    - img
    - text: HTTP 请求失败（还有 7 个排队中）
  - paragraph: GET http://localhost:60080/models/providers
  - paragraph: "Network error: Failed to fetch"
  - button "堆栈跟踪":
    - text: 堆栈跟踪
    - img
  - paragraph: 时间：2026-08-17T09:23:55.046Z
  - paragraph: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
  - button "复制":
    - img
    - text: 复制
  - button "关闭"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Conversation Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/conversation');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('对话页面加载成功', async ({ page }) => {
> 14 |     await expect(page.locator('h3').filter({ hasText: /对话/ }).first()).toBeVisible({ timeout: 10000 });
     |                                                                        ^ Error: expect(locator).toBeVisible() failed
  15 |   });
  16 | 
  17 |   test('新建对话按钮存在', async ({ page }) => {
  18 |     const newChatButton = page.locator('button').filter({ has: page.locator('svg') }).first();
  19 |     await expect(newChatButton).toBeVisible({ timeout: 10000 });
  20 |   });
  21 | 
  22 |   test('发送消息框存在', async ({ page }) => {
  23 |     const messageInput = page.locator('input[placeholder], textarea').first();
  24 |     await expect(messageInput).toBeVisible({ timeout: 10000 });
  25 |   });
  26 | 
  27 |   test('发送消息后显示用户消息', async ({ page }) => {
  28 |     const messageInput = page.locator('input[placeholder], textarea').first();
  29 |     if (await messageInput.isVisible()) {
  30 |       await messageInput.fill('测试消息');
  31 |       const inputValue = await messageInput.inputValue();
  32 |       expect(inputValue).toBe('测试消息');
  33 |     }
  34 |   });
  35 | });
  36 | 
```