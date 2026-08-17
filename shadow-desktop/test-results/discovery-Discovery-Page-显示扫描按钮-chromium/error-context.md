# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: discovery.spec.ts >> Discovery Page >> 显示扫描按钮
- Location: tests/e2e-ui/discovery.spec.ts:24:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '开始扫描' }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: '开始扫描' }).first()

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
  - paragraph: 时间：2026-08-17T09:24:10.099Z
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
  3  | test.describe('Discovery Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/discovery');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.locator('h1')).toContainText('Shadow 节点');
  15 |   });
  16 | 
  17 |   test('显示设备列表', async ({ page }) => {
  18 |     const deviceList = page.locator('[data-testid="device-list"]');
  19 |     if (await deviceList.isVisible()) {
  20 |       await expect(deviceList).toBeVisible();
  21 |     }
  22 |   });
  23 | 
  24 |   test('显示扫描按钮', async ({ page }) => {
  25 |     const scanButton = page.getByRole('button', { name: '开始扫描' }).first();
> 26 |     await expect(scanButton).toBeVisible();
     |                              ^ Error: expect(locator).toBeVisible() failed
  27 |   });
  28 | });
  29 | 
```