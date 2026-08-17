# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: conversation.spec.ts >> Conversation Page >> 显示新对话按钮
- Location: tests/e2e-ui/conversation.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("新对话")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("新对话")')

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
  - paragraph: 时间：2026-08-17T09:23:58.890Z
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
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible();
  15 |   });
  16 | 
  17 |   test('显示新对话按钮', async ({ page }) => {
  18 |     const newChatButton = page.locator('button:has-text("新对话")');
> 19 |     await expect(newChatButton).toBeVisible();
     |                                 ^ Error: expect(locator).toBeVisible() failed
  20 |   });
  21 | 
  22 |   test('创建新对话', async ({ page }) => {
  23 |     const newChatButton = page.locator('button:has-text("新对话")');
  24 |     await newChatButton.click();
  25 |     await page.waitForTimeout(1000);
  26 |   });
  27 | });
  28 | 
```