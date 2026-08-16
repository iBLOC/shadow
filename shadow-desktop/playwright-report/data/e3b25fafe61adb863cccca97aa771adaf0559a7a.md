# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents.spec.ts >> Agents Page >> 页面标题正确显示
- Location: tests/e2e-ui/agents.spec.ts:9:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "agents"
Received string:    "Shadow"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h1')
    2 × locator resolved to <h1>智能体管理</h1>
      - unexpected value "智能体管理"
    9 × locator resolved to <h1 class="text-3xl font-bold">Shadow</h1>
      - unexpected value "Shadow"

```

```yaml
- heading "Shadow" [level=1]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Agents Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/agents');
  6  |     await page.waitForLoadState('networkidle');
  7  |   });
  8  | 
  9  |   test('页面标题正确显示', async ({ page }) => {
> 10 |     await expect(page.locator('h1')).toContainText('agents');
     |                                      ^ Error: expect(locator).toContainText(expected) failed
  11 |   });
  12 | 
  13 |   test('显示智能体分类', async ({ page }) => {
  14 |     await expect(page.locator('text=agents.internalAgents')).toBeVisible();
  15 |     await expect(page.locator('text=agents.customAgents')).toBeVisible();
  16 |     await expect(page.locator('text=agents.wasmAgents')).toBeVisible();
  17 |     await expect(page.locator('text=agents.externalAgents')).toBeVisible();
  18 |   });
  19 | 
  20 |   test('显示搜索功能', async ({ page }) => {
  21 |     const searchSection = page.locator('text=agents.searchTitle');
  22 |     await expect(searchSection).toBeVisible();
  23 |   });
  24 | 
  25 |   test('搜索智能体', async ({ page }) => {
  26 |     const searchInput = page.locator('input[placeholder*="agents.searchQueryPlaceholder"]');
  27 |     await searchInput.fill('test');
  28 |     
  29 |     const searchButton = page.locator('button:has-text("agents.search")');
  30 |     await searchButton.click();
  31 |     
  32 |     await page.waitForTimeout(1000);
  33 |   });
  34 | 
  35 |   test('显示新建自定义智能体按钮', async ({ page }) => {
  36 |     const newAgentButton = page.locator('button:has-text("agents.newCustomAgent")');
  37 |     await expect(newAgentButton).toBeVisible();
  38 |   });
  39 | 
  40 |   test('打开新建智能体模态框', async ({ page }) => {
  41 |     const newAgentButton = page.locator('button:has-text("agents.newCustomAgent")');
  42 |     await newAgentButton.click();
  43 |     
  44 |     await expect(page.locator('text=agents.newCustomAgent')).toBeVisible();
  45 |   });
  46 | });
  47 | 
```