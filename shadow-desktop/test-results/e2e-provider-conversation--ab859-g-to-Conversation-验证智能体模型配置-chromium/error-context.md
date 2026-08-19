# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-provider-conversation.spec.ts >> End-to-End: Provider Binding to Conversation >> 验证智能体模型配置
- Location: tests/e2e-ui/e2e-provider-conversation.spec.ts:58:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /内部智能体/ })

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { TEST_CONFIG } from './config';
  3  | 
  4  | test.describe('End-to-End: Provider Binding to Conversation', () => {
  5  |   test('添加 MiMo 供应商后进行对话', async ({ page }) => {
  6  |     await page.goto('/');
  7  |     await page.evaluate(() => {
  8  |       localStorage.setItem('shadow_setup_complete', 'true');
  9  |     });
  10 | 
  11 |     await page.goto('/models');
  12 |     await page.waitForLoadState('networkidle');
  13 | 
  14 |     const cloudTab = page.locator('button:has-text("云端供应商")');
  15 |     await cloudTab.click();
  16 |     await page.waitForTimeout(500);
  17 | 
  18 |     const addButton = page.locator('button:has-text("添加供应商")');
  19 |     await addButton.click();
  20 | 
  21 |     await page.locator('button:has-text("Xiaomi MiMo")').click();
  22 | 
  23 |     const nameInput = page.locator('input[placeholder="OpenAI"]');
  24 |     await nameInput.fill('MiMo 测试');
  25 | 
  26 |     const apiKeyInput = page.locator('input[type="password"]');
  27 |     await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);
  28 | 
  29 |     const submitButton = page.getByRole('button', { name: '添加', exact: true });
  30 |     await submitButton.click();
  31 | 
  32 |     await page.waitForTimeout(5000);
  33 | 
  34 |     const autoMatchDialog = page.getByText('自动匹配模型');
  35 |     if (await autoMatchDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
  36 |       const confirmButton = page.getByRole('button', { name: '自动匹配' });
  37 |       await confirmButton.click();
  38 |       await page.waitForTimeout(1000);
  39 |     }
  40 | 
  41 |     await page.goto('/conversation');
  42 |     await page.waitForLoadState('networkidle');
  43 |     await page.waitForTimeout(1000);
  44 | 
  45 |     const newChatButton = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first();
  46 |     if (await newChatButton.isVisible()) {
  47 |       await newChatButton.click();
  48 |       await page.waitForTimeout(500);
  49 |     }
  50 | 
  51 |     const messageInput = page.locator('input[placeholder], textarea').first();
  52 |     if (await messageInput.isVisible()) {
  53 |       await messageInput.fill('你好');
  54 |       expect(await messageInput.inputValue()).toBe('你好');
  55 |     }
  56 |   });
  57 | 
  58 |   test('验证智能体模型配置', async ({ page }) => {
  59 |     await page.goto('/');
  60 |     await page.evaluate(() => {
  61 |       localStorage.setItem('shadow_setup_complete', 'true');
  62 |     });
  63 | 
  64 |     await page.goto('/agents');
  65 |     await page.waitForLoadState('networkidle');
  66 | 
  67 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
> 68 |     await internalSection.click();
     |                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  69 |     await page.waitForTimeout(1000);
  70 | 
  71 |     const cards = page.locator('.rounded-lg.border.border-border.bg-card');
  72 |     const count = await cards.count();
  73 |     expect(count).toBeGreaterThanOrEqual(1);
  74 |   });
  75 | });
  76 | 
```