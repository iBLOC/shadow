# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mcp.spec.ts >> MCP Page >> 显示添加服务器按钮
- Location: tests/e2e-ui/mcp.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("添加服务器")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("添加服务器")')

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
  - paragraph: 时间：2026-08-17T09:24:36.220Z
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
  3  | test.describe('MCP Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/mcp');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.locator('h1')).toContainText('MCP');
  15 |   });
  16 | 
  17 |   test('显示添加服务器按钮', async ({ page }) => {
  18 |     const addButton = page.locator('button:has-text("添加服务器")');
> 19 |     await expect(addButton).toBeVisible();
     |                             ^ Error: expect(locator).toBeVisible() failed
  20 |   });
  21 | });
  22 | 
```