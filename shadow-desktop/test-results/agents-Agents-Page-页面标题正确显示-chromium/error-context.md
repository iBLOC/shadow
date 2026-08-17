# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents.spec.ts >> Agents Page >> 页面标题正确显示
- Location: tests/e2e-ui/agents.spec.ts:13:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "智能体"
Received string:    "配置你的第一个模型"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h1')
    14 × locator resolved to <h1 class="text-2xl font-bold">配置你的第一个模型</h1>
       - unexpected value "配置你的第一个模型"

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
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:23:30.140Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
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
> 14 |     await expect(page.locator('h1')).toContainText('智能体');
     |                                      ^ Error: expect(locator).toContainText(expected) failed
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
  34 |     await newAgentButton.click();
  35 |     
  36 |     await expect(page.getByRole('heading', { name: '新建自定义智能体' })).toBeVisible();
  37 |   });
  38 | });
  39 | 
```