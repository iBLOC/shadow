# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: models.spec.ts >> Models Page >> 云供应商和本地模型 tab 切换
- Location: tests/e2e-ui/models.spec.ts:13:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("models.cloudProviders")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("models.cloudProviders")')

```

```yaml
- img
- heading "Shadow" [level=1]
- paragraph: 欢迎使用 Shadow 设置向导
- text: 1 设置密码 2 选择数据库 3 添加供应商 4 管理模型
- heading "保护您的数据" [level=2]
- paragraph: 创建主密码以加密敏感信息，使用机器ID作为盐值
- img
- text: 主密码
- textbox "********"
- text: 确认密码
- textbox "********"
- paragraph:
  - img
  - text: 此密码用于加密您存储的凭据，机器ID将作为盐值
- paragraph:
  - text: "机器ID:"
  - code: ...
- button "下一步" [disabled]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Models Page', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     await page.goto('/models');
  6   |     await page.waitForLoadState('networkidle');
  7   |   });
  8   | 
  9   |   test('页面标题正确显示', async ({ page }) => {
  10  |     await expect(page.locator('h1')).toContainText('models');
  11  |   });
  12  | 
  13  |   test('云供应商和本地模型 tab 切换', async ({ page }) => {
  14  |     // 默认显示本地模型 tab
  15  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  16  |     const localTab = page.locator('button:has-text("models.localEngine")');
  17  |     
> 18  |     await expect(cloudTab).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  19  |     await expect(localTab).toBeVisible();
  20  |     
  21  |     // 点击云供应商 tab
  22  |     await cloudTab.click();
  23  |     await page.waitForTimeout(500);
  24  |     
  25  |     // 点击本地模型 tab
  26  |     await localTab.click();
  27  |     await page.waitForTimeout(500);
  28  |   });
  29  | 
  30  |   test('添加供应商按钮存在', async ({ page }) => {
  31  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  32  |     await cloudTab.click();
  33  |     await page.waitForTimeout(500);
  34  |     
  35  |     const addButton = page.locator('button:has-text("models.addProvider")');
  36  |     await expect(addButton).toBeVisible();
  37  |   });
  38  | 
  39  |   test('打开添加供应商模态框', async ({ page }) => {
  40  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  41  |     await cloudTab.click();
  42  |     await page.waitForTimeout(500);
  43  |     
  44  |     const addButton = page.locator('button:has-text("models.addProvider")');
  45  |     await addButton.click();
  46  |     
  47  |     // 验证模态框打开
  48  |     await expect(page.locator('text=models.addProviderDesc')).toBeVisible();
  49  |   });
  50  | 
  51  |   test('模态框显示供应商列表', async ({ page }) => {
  52  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  53  |     await cloudTab.click();
  54  |     await page.waitForTimeout(500);
  55  |     
  56  |     const addButton = page.locator('button:has-text("models.addProvider")');
  57  |     await addButton.click();
  58  |     
  59  |     // 验证供应商列表
  60  |     await expect(page.locator('text=Xiaomi MiMo')).toBeVisible();
  61  |     await expect(page.locator('text=OpenAI')).toBeVisible();
  62  |     await expect(page.locator('text=DeepSeek')).toBeVisible();
  63  |     await expect(page.locator('text=Anthropic')).toBeVisible();
  64  |   });
  65  | 
  66  |   test('选择供应商后自动填充 API 地址', async ({ page }) => {
  67  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  68  |     await cloudTab.click();
  69  |     await page.waitForTimeout(500);
  70  |     
  71  |     const addButton = page.locator('button:has-text("models.addProvider")');
  72  |     await addButton.click();
  73  |     
  74  |     // 选择 Xiaomi MiMo
  75  |     await page.locator('button:has-text("Xiaomi MiMo")').click();
  76  |     
  77  |     // 验证 API 地址自动填充
  78  |     const apiBaseInput = page.locator('input[placeholder*="api"]');
  79  |     await expect(apiBaseInput).toHaveValue('https://api.xiaomimimo.com/v1');
  80  |   });
  81  | 
  82  |   test('添加供应商成功', async ({ page }) => {
  83  |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  84  |     await cloudTab.click();
  85  |     await page.waitForTimeout(500);
  86  |     
  87  |     const addButton = page.locator('button:has-text("models.addProvider")');
  88  |     await addButton.click();
  89  |     
  90  |     // 填写供应商名称
  91  |     const nameInput = page.locator('input[placeholder="OpenAI"]');
  92  |     await nameInput.fill('Test Provider');
  93  |     
  94  |     // 选择供应商类型
  95  |     await page.locator('button:has-text("DeepSeek")').click();
  96  |     
  97  |     // 点击添加按钮
  98  |     const submitButton = page.locator('button:has-text("common.add")');
  99  |     await submitButton.click();
  100 |     
  101 |     // 等待模态框关闭
  102 |     await page.waitForTimeout(1000);
  103 |   });
  104 | 
  105 |   test('取消添加供应商', async ({ page }) => {
  106 |     const cloudTab = page.locator('button:has-text("models.cloudProviders")');
  107 |     await cloudTab.click();
  108 |     await page.waitForTimeout(500);
  109 |     
  110 |     const addButton = page.locator('button:has-text("models.addProvider")');
  111 |     await addButton.click();
  112 |     
  113 |     // 点击取消按钮
  114 |     const cancelButton = page.locator('button:has-text("common.cancel")');
  115 |     await cancelButton.click();
  116 |     
  117 |     // 验证模态框关闭
  118 |     await page.waitForTimeout(500);
```