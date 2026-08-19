# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-task-scheduling.spec.ts >> End-to-End: Conversation to Task Scheduling >> 智能体页面加载
- Location: tests/e2e-ui/e2e-task-scheduling.spec.ts:123:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h1, h2, h3').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('h1, h2, h3').first()

```

# Test source

```ts
  28  | 
  29  |     if (sendStatus === 200) {
  30  |       const sendResult = await sendResponse.json();
  31  |       expect(sendResult.conversation_id).toBe(conv.id);
  32  | 
  33  |       const getConvResponse = await page.request.get(`${CORTEX_URL}/shadow/v1/conversations/${conv.id}`);
  34  |       expect(getConvResponse.ok()).toBeTruthy();
  35  |       const convDetail = await getConvResponse.json();
  36  |       
  37  |       const userMessages = convDetail.history.filter((h: { role: string }) => h.role === 'user');
  38  |       expect(userMessages.length).toBeGreaterThanOrEqual(1);
  39  |       expect(userMessages.some((m: { text: string }) => m.text.includes(taskMessage))).toBeTruthy();
  40  |     }
  41  | 
  42  |     const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
  43  |     expect(agentsResponse.ok()).toBeTruthy();
  44  |     const agents = await agentsResponse.json();
  45  | 
  46  |     const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
  47  |     expect(temporal).toBeTruthy();
  48  |     expect(temporal.enabled).toBe(true);
  49  | 
  50  |     const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
  51  |     expect(prefrontal).toBeTruthy();
  52  |     expect(prefrontal.enabled).toBe(true);
  53  |   });
  54  | 
  55  |   test('验证颞叶到前额叶的A2A通信', async ({ page }) => {
  56  |     const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
  57  |     expect(agentsResponse.ok()).toBeTruthy();
  58  |     const agents = await agentsResponse.json();
  59  | 
  60  |     const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
  61  |     expect(temporal).toBeTruthy();
  62  |     expect(temporal.url).toContain('temporal');
  63  |     expect(temporal.config).toBeTruthy();
  64  | 
  65  |     const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
  66  |     expect(prefrontal).toBeTruthy();
  67  |     expect(prefrontal.url).toContain('prefrontal');
  68  |     expect(prefrontal.config).toBeTruthy();
  69  | 
  70  |     const discoverResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents/discover`);
  71  |     expect(discoverResponse.ok()).toBeTruthy();
  72  |     const discovery = await discoverResponse.json();
  73  |     expect(discovery.agents.length).toBeGreaterThanOrEqual(4);
  74  |   });
  75  | 
  76  |   test('验证智能体模型配置和调度能力', async ({ page }) => {
  77  |     const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
  78  |     expect(agentsResponse.ok()).toBeTruthy();
  79  |     const agents = await agentsResponse.json();
  80  | 
  81  |     const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
  82  |     expect(temporal).toBeTruthy();
  83  |     expect(temporal.config).toBeTruthy();
  84  |     expect(temporal.config.required_capabilities).toContain('asr');
  85  |     expect(temporal.config.required_capabilities).toContain('tts');
  86  |     expect(temporal.config.required_capabilities).toContain('llm');
  87  | 
  88  |     const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
  89  |     expect(prefrontal).toBeTruthy();
  90  |     expect(prefrontal.config).toBeTruthy();
  91  |     expect(prefrontal.config.required_capabilities).toContain('llm');
  92  |   });
  93  | 
  94  |   test('验证供应商和模型持久化', async ({ page }) => {
  95  |     const providersResponse = await page.request.get(`${CORTEX_URL}/models/providers`);
  96  |     expect(providersResponse.ok()).toBeTruthy();
  97  |     const providers = await providersResponse.json();
  98  |     expect(providers.length).toBeGreaterThanOrEqual(1);
  99  | 
  100 |     const firstProvider = providers[0];
  101 |     expect(firstProvider.models.length).toBeGreaterThan(0);
  102 |   });
  103 | 
  104 |   test('对话页面输入定时任务消息', async ({ page }) => {
  105 |     await page.goto('/conversation');
  106 |     await page.waitForLoadState('networkidle');
  107 | 
  108 |     const messageInput = page.locator('input[placeholder], textarea').first();
  109 |     if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  110 |       await messageInput.fill('每天下午18点总结全网最新的AI咨询');
  111 |       expect(await messageInput.inputValue()).toContain('18点');
  112 |     }
  113 |   });
  114 | 
  115 |   test('任务看板页面加载', async ({ page }) => {
  116 |     await page.goto('/tasks');
  117 |     await page.waitForLoadState('networkidle');
  118 | 
  119 |     const heading = page.locator('h1, h2, h3').first();
  120 |     await expect(heading).toBeVisible({ timeout: 10000 });
  121 |   });
  122 | 
  123 |   test('智能体页面加载', async ({ page }) => {
  124 |     await page.goto('/agents');
  125 |     await page.waitForLoadState('networkidle');
  126 | 
  127 |     const heading = page.locator('h1, h2, h3').first();
> 128 |     await expect(heading).toBeVisible({ timeout: 10000 });
      |                           ^ Error: expect(locator).toBeVisible() failed
  129 |   });
  130 | 
  131 |   test('模型页面加载', async ({ page }) => {
  132 |     await page.goto('/models');
  133 |     await page.waitForLoadState('networkidle');
  134 | 
  135 |     const heading = page.locator('h1, h2, h3').first();
  136 |     await expect(heading).toBeVisible({ timeout: 10000 });
  137 |   });
  138 | });
  139 | 
```