# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents.spec.ts >> Agents Page >> 打开新建智能体模态框
- Location: tests/e2e-ui/agents.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '新建自定义智能体' }).first()

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
  18 |     await expect(page.getByRole('button', { name: '内部智能体' })).toBeVisible();
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
> 34 |     await newAgentButton.click();
     |                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  35 |     
  36 |     await expect(page.getByRole('heading', { name: '新建自定义智能体' })).toBeVisible();
  37 |   });
  38 | });
  39 | 
```