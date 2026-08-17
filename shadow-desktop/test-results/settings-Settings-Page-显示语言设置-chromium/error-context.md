# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.ts >> Settings Page >> 显示语言设置
- Location: tests/e2e-ui/settings.spec.ts:22:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=语言').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=语言').first()

```

```yaml
- alertdialog "HTTP 请求失败（还有 11 个排队中）":
  - heading "HTTP 请求失败（还有 11 个排队中）" [level=2]:
    - img
    - text: HTTP 请求失败（还有 11 个排队中）
  - paragraph: GET http://localhost:60080/models/providers
  - paragraph: "Network error: Failed to fetch"
  - button "堆栈跟踪":
    - text: 堆栈跟踪
    - img
  - paragraph: 时间：2026-08-17T09:25:41.755Z
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
  3  | test.describe('Settings Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/settings');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  15 |   });
  16 | 
  17 |   test('显示 Cortex 状态', async ({ page }) => {
  18 |     const cortexSection = page.getByRole('heading', { name: /Cortex/ });
  19 |     await expect(cortexSection).toBeVisible();
  20 |   });
  21 | 
  22 |   test('显示语言设置', async ({ page }) => {
  23 |     const langSection = page.locator('text=语言').first();
> 24 |     await expect(langSection).toBeVisible();
     |                               ^ Error: expect(locator).toBeVisible() failed
  25 |   });
  26 | 
  27 |   test('显示主题设置', async ({ page }) => {
  28 |     const themeSection = page.locator('text=主题').first();
  29 |     await expect(themeSection).toBeVisible();
  30 |   });
  31 | 
  32 |   test('显示记忆集成', async ({ page }) => {
  33 |     const memorySection = page.locator('text=记忆').first();
  34 |     if (await memorySection.isVisible()) {
  35 |       await expect(memorySection).toBeVisible();
  36 |     }
  37 |   });
  38 | });
  39 | 
```