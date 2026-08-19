# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.ts >> Settings Page >> 显示语言设置
- Location: tests/e2e-ui/settings.spec.ts:22:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=语言').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=语言').first()

```

```yaml
- complementary:
  - img
  - text: Shadow 影
  - navigation:
    - link "任务看板":
      - /url: /tasks
      - img
      - text: 任务看板
    - link "对话":
      - /url: /conversation
      - img
      - text: 对话
    - link "发现":
      - /url: /discovery
      - img
      - text: 发现
    - link "思维定式":
      - /url: /flows
      - img
      - text: 思维定式
    - link "执行追踪":
      - /url: /trace
      - img
      - text: 执行追踪
    - link "共鸣":
      - /url: /resonance
      - img
      - text: 共鸣
    - link "模型":
      - /url: /models
      - img
      - text: 模型
    - link "MCP":
      - /url: /mcp
      - img
      - text: MCP
    - link "技能":
      - /url: /skills
      - img
      - text: 技能
    - link "记忆":
      - /url: /memory
      - img
      - text: 记忆
    - link "错误日志":
      - /url: /logs
      - img
      - text: 错误日志
  - text: 未连接
  - link "设置":
    - /url: /settings
    - img
    - text: 设置
- main:
  - complementary:
    - navigation:
      - button "服务":
        - img
        - text: 服务
        - img
      - button "智能体":
        - img
        - text: 智能体
      - button "界面":
        - img
        - text: 界面
      - button "数据":
        - img
        - text: 数据
      - button "系统":
        - img
        - text: 系统
  - main:
    - heading "设置" [level=1]
    - paragraph: 配置 Shadow 桌面端（Cortex 客户端）
    - button "重置全部":
      - img
      - text: 重置全部
    - button "保存更改":
      - img
      - text: 保存更改
    - img
    - heading "Cortex 状态" [level=3]
    - paragraph: 查看 Cortex 内核和智能体状态
    - text: 运行状态
    - img
    - text: running 端点地址 Cortex 服务的访问地址
    - code: http://localhost:60080
    - text: 共 4 个，4 个健康
    - button:
      - img
    - img
    - heading "已注册的智能体" [level=3]
    - paragraph: Cortex 中当前可用的智能体列表
    - img
    - text: parietal native
    - img
    - img
    - text: occipital native
    - img
    - img
    - text: prefrontal native
    - img
    - img
    - text: temporal native
    - img
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Settings Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.setItem('shadow_setup_complete', 'true');
  8  |     });
  9  |     await page.goto('/settings');
  10 |     await page.waitForLoadState('networkidle');
  11 |   });
  12 | 
  13 |   test('页面标题正确显示', async ({ page }) => {
  14 |     await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  15 |   });
  16 | 
  17 |   test('显示 Cortex 状态', async ({ page }) => {
  18 |     const cortexSection = page.getByRole('heading', { name: /Cortex/ });
  19 |     await expect(cortexSection).toBeVisible();
  20 |   });
  21 | 
  22 |   test('显示语言设置', async ({ page }) => {
  23 |     const langSection = page.locator('text=语言').first();
> 24 |     await expect(langSection).toBeVisible();
     |                               ^ Error: expect(locator).toBeVisible() failed
  25 |   });
  26 | 
  27 |   test('显示主题设置', async ({ page }) => {
  28 |     const themeSection = page.locator('text=主题').first();
  29 |     await expect(themeSection).toBeVisible();
  30 |   });
  31 | 
  32 |   test('显示记忆集成', async ({ page }) => {
  33 |     const memorySection = page.locator('text=记忆').first();
  34 |     if (await memorySection.isVisible()) {
  35 |       await expect(memorySection).toBeVisible();
  36 |     }
  37 |   });
  38 | });
  39 | 
```