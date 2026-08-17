# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-provider-conversation.spec.ts >> End-to-End: Provider Binding to Conversation >> 添加 MiMo 供应商后进行对话
- Location: tests/e2e-ui/e2e-provider-conversation.spec.ts:5:3

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
    53 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div data-state="open" aria-hidden="true" data-aria-hidden="true" class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"></div> intercepts pointer events
     - retrying click action
       - waiting 500ms

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
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:24:10.443Z
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
> 15 |     await cloudTab.click();
     |                    ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  68 |     await internalSection.click();
  69 |     await page.waitForTimeout(1000);
  70 | 
  71 |     const cards = page.locator('.rounded-lg.border.border-border.bg-card');
  72 |     const count = await cards.count();
  73 |     expect(count).toBeGreaterThanOrEqual(1);
  74 |   });
  75 | });
  76 | 
```