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

# Page snapshot

```yaml
- generic [active]:
  - generic:
    - generic:
      - generic:
        - generic:
          - generic:
            - heading [level=1]: 配置你的第一个模型
            - paragraph: 在使用 Shadow 之前，请配置一个云供应商或下载本地模型
        - paragraph: Shadow 需要至少一个可用的模型才能运行对话和任务。请选择一种方式继续：
        - button:
          - generic:
            - generic:
              - heading [level=3]: 下载本地模型
              - generic: 推荐
            - paragraph: 完全在本地设备运行，无需联网或 API 密钥。推荐 Gemma 4 E4B。
        - button:
          - generic:
            - heading [level=3]: 使用云端模型
            - paragraph: 接入 OpenAI、Anthropic、DeepSeek 等云端供应商（最快）
        - button: 稍后配置
  - alertdialog [ref=f1e2]:
    - generic [ref=f1e3]:
      - heading "HTTP 请求失败（还有 13 个排队中）" [level=2] [ref=f1e4]
      - paragraph [ref=f1e7]:
        - generic [ref=f1e8]: GET http://localhost:60080/models/providers
    - generic [ref=f1e9]:
      - paragraph [ref=f1e11]: "Network error: Failed to fetch"
      - button "堆栈跟踪" [ref=f1e12] [cursor=pointer]
      - generic [ref=f1e14]:
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:24:11.868Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
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