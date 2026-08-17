# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: models.spec.ts >> Models Page >> 取消添加供应商
- Location: tests/e2e-ui/models.spec.ts:102:3

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
    51 × waiting for element to be visible, enabled and stable
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
        - paragraph [ref=f1e15]: 时间：2026-08-17T09:25:16.135Z
        - paragraph [ref=f1e16]: UA：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - generic [ref=f1e17]:
      - button "复制" [ref=f1e18] [cursor=pointer]
      - button "关闭" [ref=f1e19] [cursor=pointer]
```

# Test source

```ts
  4   |   test.beforeEach(async ({ page }) => {
  5   |     // Set setup complete to skip onboarding
  6   |     await page.goto('/');
  7   |     await page.evaluate(() => {
  8   |       localStorage.setItem('shadow_setup_complete', 'true');
  9   |     });
  10  |     await page.goto('/models');
  11  |     await page.waitForLoadState('networkidle');
  12  |   });
  13  | 
  14  |   test('页面标题正确显示', async ({ page }) => {
  15  |     await expect(page.locator('h1')).toContainText('模型');
  16  |   });
  17  | 
  18  |   test('云供应商和本地模型 tab 切换', async ({ page }) => {
  19  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  20  |     const localTab = page.locator('button:has-text("本地引擎")');
  21  |     
  22  |     await expect(cloudTab).toBeVisible();
  23  |     await expect(localTab).toBeVisible();
  24  |     
  25  |     await cloudTab.click();
  26  |     await page.waitForTimeout(500);
  27  |     
  28  |     await localTab.click();
  29  |     await page.waitForTimeout(500);
  30  |   });
  31  | 
  32  |   test('添加供应商按钮存在', async ({ page }) => {
  33  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  34  |     await cloudTab.click();
  35  |     await page.waitForTimeout(500);
  36  |     
  37  |     const addButton = page.locator('button:has-text("添加供应商")');
  38  |     await expect(addButton).toBeVisible();
  39  |   });
  40  | 
  41  |   test('打开添加供应商模态框', async ({ page }) => {
  42  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  43  |     await cloudTab.click();
  44  |     await page.waitForTimeout(500);
  45  |     
  46  |     const addButton = page.locator('button:has-text("添加供应商")');
  47  |     await addButton.click();
  48  |     
  49  |     // Check for the modal heading
  50  |     await expect(page.getByRole('heading', { name: '添加供应商' })).toBeVisible();
  51  |   });
  52  | 
  53  |   test('模态框显示供应商列表', async ({ page }) => {
  54  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  55  |     await cloudTab.click();
  56  |     await page.waitForTimeout(500);
  57  |     
  58  |     const addButton = page.locator('button:has-text("添加供应商")');
  59  |     await addButton.click();
  60  |     
  61  |     // Check for provider buttons in the modal
  62  |     await expect(page.locator('button:has-text("Xiaomi MiMo")')).toBeVisible();
  63  |     await expect(page.locator('button:has-text("OpenAI")')).toBeVisible();
  64  |     await expect(page.locator('button:has-text("DeepSeek")')).toBeVisible();
  65  |     await expect(page.locator('button:has-text("Anthropic")')).toBeVisible();
  66  |   });
  67  | 
  68  |   test('选择供应商后自动填充 API 地址', async ({ page }) => {
  69  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  70  |     await cloudTab.click();
  71  |     await page.waitForTimeout(500);
  72  |     
  73  |     const addButton = page.locator('button:has-text("添加供应商")');
  74  |     await addButton.click();
  75  |     
  76  |     await page.locator('button:has-text("Xiaomi MiMo")').click();
  77  |     
  78  |     const apiBaseInput = page.locator('input[placeholder*="api"]');
  79  |     await expect(apiBaseInput).toHaveValue('https://api.xiaomimimo.com/v1');
  80  |   });
  81  | 
  82  |   test('添加供应商成功', async ({ page }) => {
  83  |     const cloudTab = page.locator('button:has-text("云端供应商")');
  84  |     await cloudTab.click();
  85  |     await page.waitForTimeout(500);
  86  |     
  87  |     const addButton = page.locator('button:has-text("添加供应商")');
  88  |     await addButton.click();
  89  |     
  90  |     const nameInput = page.locator('input[placeholder="OpenAI"]');
  91  |     await nameInput.fill('Test Provider');
  92  |     
  93  |     await page.locator('button:has-text("DeepSeek")').click();
  94  |     
  95  |     // Use the button with exact text "添加" (not "添加供应商")
  96  |     const submitButton = page.getByRole('button', { name: '添加', exact: true });
  97  |     await submitButton.click();
  98  |     
  99  |     await page.waitForTimeout(1000);
  100 |   });
  101 | 
  102 |   test('取消添加供应商', async ({ page }) => {
  103 |     const cloudTab = page.locator('button:has-text("云端供应商")');
> 104 |     await cloudTab.click();
      |                    ^ Error: locator.click: Test timeout of 30000ms exceeded.
  105 |     await page.waitForTimeout(500);
  106 |     
  107 |     const addButton = page.locator('button:has-text("添加供应商")');
  108 |     await addButton.click();
  109 |     
  110 |     const cancelButton = page.locator('button:has-text("取消")');
  111 |     await cancelButton.click();
  112 |     
  113 |     await page.waitForTimeout(500);
  114 |   });
  115 | });
  116 | 
```