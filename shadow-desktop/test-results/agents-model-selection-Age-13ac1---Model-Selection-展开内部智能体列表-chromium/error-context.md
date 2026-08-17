# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents-model-selection.spec.ts >> Agents Page - Model Selection >> 展开内部智能体列表
- Location: tests/e2e-ui/agents-model-selection.spec.ts:18:3

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
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:23:29.590Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Agents Page - Model Selection', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/agents');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('显示内部智能体区域', async ({ page }) => {
  14 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
  15 |     await expect(internalSection).toBeVisible();
  16 |   });
  17 | 
  18 |   test('展开内部智能体列表', async ({ page }) => {
  19 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
> 20 |     await internalSection.click();
     |                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  21 |     await page.waitForTimeout(1000);
  22 |     
  23 |     const lobeCards = page.locator('.rounded-lg.border.border-border.bg-card');
  24 |     const count = await lobeCards.count();
  25 |     expect(count).toBeGreaterThanOrEqual(4);
  26 |   });
  27 | 
  28 |   test('智能体卡片显示模型选择', async ({ page }) => {
  29 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
  30 |     await internalSection.click();
  31 |     await page.waitForTimeout(1000);
  32 |     
  33 |     const cards = page.locator('.rounded-lg.border.border-border.bg-card');
  34 |     const count = await cards.count();
  35 |     
  36 |     if (count > 0) {
  37 |       const selects = page.locator('select');
  38 |       const selectCount = await selects.count();
  39 |       expect(selectCount).toBeGreaterThanOrEqual(0);
  40 |     }
  41 |   });
  42 | 
  43 |   test('模型选择后不重置', async ({ page }) => {
  44 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
  45 |     await internalSection.click();
  46 |     await page.waitForTimeout(1000);
  47 |     
  48 |     const firstSelect = page.locator('select').first();
  49 |     if (await firstSelect.isVisible()) {
  50 |       const options = await firstSelect.locator('option').all();
  51 |       if (options.length > 1) {
  52 |         await firstSelect.selectOption({ index: 1 });
  53 |         await page.waitForTimeout(500);
  54 |         
  55 |         const selectedValue = await firstSelect.inputValue();
  56 |         expect(selectedValue).not.toBe('');
  57 |       }
  58 |     }
  59 |   });
  60 | 
  61 |   test('智能体卡片显示所需能力', async ({ page }) => {
  62 |     const internalSection = page.getByRole('button', { name: /内部智能体/ });
  63 |     await internalSection.click();
  64 |     await page.waitForTimeout(1000);
  65 |     
  66 |     const llmBadge = page.locator('text=llm').first();
  67 |     if (await llmBadge.isVisible()) {
  68 |       await expect(llmBadge).toBeVisible();
  69 |     }
  70 |   });
  71 | });
  72 | 
```