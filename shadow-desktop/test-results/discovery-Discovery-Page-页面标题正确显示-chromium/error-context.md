# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: discovery.spec.ts >> Discovery Page >> 页面标题正确显示
- Location: tests/e2e-ui/discovery.spec.ts:13:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "Shadow 节点"
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
      - heading "HTTP 请求失败（还有 7 个排队中）" [level=2] [ref=f1e4]
      - paragraph [ref=f1e7]:
        - generic [ref=f1e8]: GET http://localhost:60080/models/providers
    - generic [ref=f1e9]:
      - paragraph [ref=f1e11]: "Network error: Failed to fetch"
      - button "堆栈跟踪" [ref=f1e12] [cursor=pointer]
      - generic [ref=f1e14]:
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:24:07.514Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
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
> 14 |     await expect(page.locator('h1')).toContainText('Shadow 节点');
     |                                      ^ Error: expect(locator).toContainText(expected) failed
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
  26 |     await expect(scanButton).toBeVisible();
  27 |   });
  28 | });
  29 | 
```