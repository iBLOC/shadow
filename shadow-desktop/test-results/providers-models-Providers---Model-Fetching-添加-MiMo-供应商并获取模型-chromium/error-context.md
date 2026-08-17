# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: providers-models.spec.ts >> Providers - Model Fetching >> 添加 MiMo 供应商并获取模型
- Location: tests/e2e-ui/providers-models.spec.ts:14:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button:has-text("云端供应商")')
    - locator resolved to <button class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">云端供应商</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div data-state="open" aria-hidden="true" data-aria-hidden="true" class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"></div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div data-state="open" aria-hidden="true" data-aria-hidden="true" class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"></div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    50 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div data-state="open" aria-hidden="true" data-aria-hidden="true" class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"></div> intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [active]:
  - generic:
    - generic:
      - complementary:
        - generic:
          - generic:
            - generic:
              - generic: Shadow
              - generic: 影
        - navigation:
          - link:
            - /url: /tasks
            - generic: 任务看板
          - link:
            - /url: /conversation
            - generic: 对话
          - link:
            - /url: /discovery
            - generic: 发现
          - link:
            - /url: /agents
            - generic: 智能体
          - link:
            - /url: /flows
            - generic: 思维定式
          - link:
            - /url: /resonance
            - generic: 共鸣
          - link:
            - /url: /models
            - generic: 模型
          - link:
            - /url: /mcp
            - generic: MCP
          - link:
            - /url: /skills
            - generic: 技能
          - link:
            - /url: /memory
            - generic: 记忆
          - link:
            - /url: /logs
            - generic: 错误日志
        - generic:
          - generic: 未连接
          - link:
            - /url: /settings
            - generic: 设置
      - main:
        - generic:
          - generic:
            - heading [level=1]: 模型管理
          - generic:
            - button: 云端供应商
            - button: 本地引擎
          - generic:
            - generic:
              - button: LLM
              - button: TTS
              - button: ASR
              - button: Rerank
              - button: Embedding
              - button: Vision
            - generic:
              - button
            - generic: Failed to fetch
            - generic:
              - heading [level=3]: 暂无此类模型
              - paragraph: 切换其他类型查看更多模型
  - alertdialog [ref=f1e2]:
    - generic [ref=f1e3]:
      - heading "HTTP 请求失败（还有 10 个排队中）" [level=2] [ref=f1e4]
      - paragraph [ref=f1e7]:
        - generic [ref=f1e8]: GET http://localhost:60080/v1/models?engine=llm
    - generic [ref=f1e9]:
      - paragraph [ref=f1e11]: "Network error: Failed to fetch"
      - button "堆栈跟踪" [ref=f1e12] [cursor=pointer]
      - generic [ref=f1e14]:
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:25:21.574Z
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
  4  | test.describe('Providers - Model Fetching', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await page.goto('/');
  7  |     await page.evaluate(() => {
  8  |       localStorage.setItem('shadow_setup_complete', 'true');
  9  |     });
  10 |     await page.goto('/models');
  11 |     await page.waitForLoadState('networkidle');
  12 |   });
  13 | 
  14 |   test('添加 MiMo 供应商并获取模型', async ({ page }) => {
  15 |     const cloudTab = page.locator('button:has-text("云端供应商")');
> 16 |     await cloudTab.click();
     |                    ^ Error: locator.click: Test timeout of 30000ms exceeded.
  17 |     await page.waitForTimeout(500);
  18 |     
  19 |     const addButton = page.locator('button:has-text("添加供应商")');
  20 |     await addButton.click();
  21 |     
  22 |     await page.locator('button:has-text("Xiaomi MiMo")').click();
  23 |     
  24 |     const nameInput = page.locator('input[placeholder="OpenAI"]');
  25 |     await nameInput.fill('MiMo Test');
  26 |     
  27 |     const apiKeyInput = page.locator('input[type="password"]');
  28 |     await apiKeyInput.fill(TEST_CONFIG.MIMO_API_KEY);
  29 |     
  30 |     const submitButton = page.getByRole('button', { name: '添加', exact: true });
  31 |     await submitButton.click();
  32 |     
  33 |     await page.waitForTimeout(3000);
  34 |     
  35 |     const autoMatchDialog = page.getByText('自动匹配模型');
  36 |     if (await autoMatchDialog.isVisible()) {
  37 |       const confirmButton = page.getByRole('button', { name: '自动匹配' });
  38 |       await confirmButton.click();
  39 |       await page.waitForTimeout(1000);
  40 |     }
  41 |   });
  42 | 
  43 |   test('供应商添加后显示模型列表', async ({ page }) => {
  44 |     const cloudTab = page.locator('button:has-text("云端供应商")');
  45 |     await cloudTab.click();
  46 |     await page.waitForTimeout(500);
  47 |     
  48 |     const providerCards = page.locator('[data-testid="provider-card"]');
  49 |     const count = await providerCards.count();
  50 |     
  51 |     if (count > 0) {
  52 |       const firstProvider = providerCards.first();
  53 |       await firstProvider.click();
  54 |       await page.waitForTimeout(500);
  55 |       
  56 |       const modelItems = page.locator('[data-testid="model-item"]');
  57 |       const modelCount = await modelItems.count();
  58 |       expect(modelCount).toBeGreaterThan(0);
  59 |     }
  60 |   });
  61 | 
  62 |   test('供应商持久化测试', async ({ page }) => {
  63 |     const cloudTab = page.locator('button:has-text("云端供应商")');
  64 |     await cloudTab.click();
  65 |     await page.waitForTimeout(500);
  66 |     
  67 |     const providerCards = page.locator('[data-testid="provider-card"]');
  68 |     const countBefore = await providerCards.count();
  69 |     
  70 |     await page.reload();
  71 |     await page.waitForLoadState('networkidle');
  72 |     
  73 |     const cloudTabAfterReload = page.locator('button:has-text("云端供应商")');
  74 |     await cloudTabAfterReload.click();
  75 |     await page.waitForTimeout(500);
  76 |     
  77 |     const providerCardsAfterReload = page.locator('[data-testid="provider-card"]');
  78 |     const countAfter = await providerCardsAfterReload.count();
  79 |     
  80 |     expect(countAfter).toBe(countBefore);
  81 |   });
  82 | });
  83 | 
```