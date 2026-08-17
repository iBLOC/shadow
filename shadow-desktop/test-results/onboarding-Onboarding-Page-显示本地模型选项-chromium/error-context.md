# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.spec.ts >> Onboarding Page >> 显示本地模型选项
- Location: tests/e2e-ui/onboarding.spec.ts:18:3

# Error details

```
Error: locator.isVisible: Error: strict mode violation: locator('text=下载本地模型') resolved to 2 elements:
    1) <p class="text-sm text-muted-foreground">在使用 Shadow 之前，请配置一个云供应商或下载本地模型</p> aka getByText('在使用 Shadow 之前，请配置一个云供应商或下载本地模型')
    2) <h3 class="text-lg font-semibold">下载本地模型</h3> aka locator('button').filter({ hasText: '下载本地模型推荐完全在本地设备运行，无需联网或 API' })

Call log:
    - checking visibility of locator('text=下载本地模型')

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
      - heading "HTTP 请求失败（还有 3 个排队中）" [level=2] [ref=f1e4]
      - paragraph [ref=f1e7]:
        - generic [ref=f1e8]: GET http://localhost:60080/models/providers
    - generic [ref=f1e9]:
      - paragraph [ref=f1e11]: "Network error: Failed to fetch"
      - button "堆栈跟踪" [ref=f1e12] [cursor=pointer]
      - generic [ref=f1e14]:
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:25:19.790Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Onboarding Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/onboarding');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面可访问', async ({ page }) => {
  14 |     // The page should be accessible - it may redirect to / if models are available
  15 |     expect(page.url()).toContain('localhost:5173');
  16 |   });
  17 | 
  18 |   test('显示本地模型选项', async ({ page }) => {
  19 |     const localOption = page.locator('text=下载本地模型');
> 20 |     if (await localOption.isVisible()) {
     |                           ^ Error: locator.isVisible: Error: strict mode violation: locator('text=下载本地模型') resolved to 2 elements:
  21 |       await expect(localOption).toBeVisible();
  22 |     }
  23 |   });
  24 | 
  25 |   test('显示云端模型选项', async ({ page }) => {
  26 |     const cloudOption = page.locator('text=使用云端模型');
  27 |     if (await cloudOption.isVisible()) {
  28 |       await expect(cloudOption).toBeVisible();
  29 |     }
  30 |   });
  31 | 
  32 |   test('显示跳过按钮', async ({ page }) => {
  33 |     const skipButton = page.locator('button:has-text("稍后配置")');
  34 |     if (await skipButton.isVisible()) {
  35 |       await expect(skipButton).toBeVisible();
  36 |     }
  37 |   });
  38 | });
  39 | 
```