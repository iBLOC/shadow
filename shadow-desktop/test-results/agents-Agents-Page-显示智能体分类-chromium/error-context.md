# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents.spec.ts >> Agents Page >> 显示智能体分类
- Location: tests/e2e-ui/agents.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '内部智能体' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: '内部智能体' })

```

```yaml
- alertdialog "HTTP 请求失败（还有 13 个排队中）":
  - heading "HTTP 请求失败（还有 13 个排队中）" [level=2]:
    - img
    - text: HTTP 请求失败（还有 13 个排队中）
  - paragraph: GET http://localhost:60080/models/providers
  - paragraph: "Network error: Failed to fetch"
  - button "堆栈跟踪":
    - text: 堆栈跟踪
    - img
  - paragraph: 时间：2026-08-17T09:23:40.262Z
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
  3  | test.describe('Agents Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/agents');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.locator('h1')).toContainText('智能体');
  15 |   });
  16 | 
  17 |   test('显示智能体分类', async ({ page }) => {
> 18 |     await expect(page.getByRole('button', { name: '内部智能体' })).toBeVisible();
     |                                                               ^ Error: expect(locator).toBeVisible() failed
  19 |     await expect(page.getByRole('button', { name: 'WASM 智能体' })).toBeVisible();
  20 |   });
  21 | 
  22 |   test('显示搜索功能', async ({ page }) => {
  23 |     const searchInput = page.locator('input[placeholder*="weather"]');
  24 |     await expect(searchInput).toBeVisible();
  25 |   });
  26 | 
  27 |   test('显示新建自定义智能体按钮', async ({ page }) => {
  28 |     const newAgentButton = page.getByRole('button', { name: '新建自定义智能体' }).first();
  29 |     await expect(newAgentButton).toBeVisible();
  30 |   });
  31 | 
  32 |   test('打开新建智能体模态框', async ({ page }) => {
  33 |     const newAgentButton = page.getByRole('button', { name: '新建自定义智能体' }).first();
  34 |     await newAgentButton.click();
  35 |     
  36 |     await expect(page.getByRole('heading', { name: '新建自定义智能体' })).toBeVisible();
  37 |   });
  38 | });
  39 | 
```