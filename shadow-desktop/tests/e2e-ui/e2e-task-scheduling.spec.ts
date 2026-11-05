import { test, expect } from '@playwright/test';
import { isTelencephalonReachable } from './global-setup';

const TELENCEPHALON_URL = process.env.SHADOW_TELENCEPHALON_URL ?? 'http://localhost:60080';

test.describe('End-to-End: Conversation to Task Scheduling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  test('通过对话发布定时任务并验证调度链路', async ({ page }) => {
    test.skip(!await isTelencephalonReachable(), 'telencephalon not reachable on :60080');
    const createConvResponse = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, {
      data: { agent: 'temporal' },
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();
    expect(conv.id).toBeTruthy();

    const taskMessage = '每天下午18点总结全网最新的AI咨询';
    const sendResponse = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${conv.id}/messages`,
      { data: { text: taskMessage } }
    );
    const sendStatus = sendResponse.status();
    expect([200, 502]).toContain(sendStatus);

    if (sendStatus === 200) {
      const sendResult = await sendResponse.json();
      expect(sendResult.conversation_id).toBe(conv.id);

      const getConvResponse = await page.request.get(`${TELENCEPHALON_URL}/shadow/v1/conversations/${conv.id}`);
      expect(getConvResponse.ok()).toBeTruthy();
      const convDetail = await getConvResponse.json();
      
      const userMessages = convDetail.history.filter((h: { role: string }) => h.role === 'user');
      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(userMessages.some((m: { text: string }) => m.text.includes(taskMessage))).toBeTruthy();
    }

    const agentsResponse = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
    expect(temporal).toBeTruthy();
    expect(temporal.enabled).toBe(true);

    const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
    expect(prefrontal).toBeTruthy();
    expect(prefrontal.enabled).toBe(true);
  });

  test('验证颞叶到前额叶的A2A通信', async ({ page }) => {
    test.skip(!await isTelencephalonReachable(), 'telencephalon not reachable on :60080');
    const agentsResponse = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
    expect(temporal).toBeTruthy();
    expect(temporal.url).toContain('temporal');
    expect(temporal.config).toBeTruthy();

    const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
    expect(prefrontal).toBeTruthy();
    expect(prefrontal.url).toContain('prefrontal');
    expect(prefrontal.config).toBeTruthy();

    const discoverResponse = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/agents/discover`);
    expect(discoverResponse.ok()).toBeTruthy();
    const discovery = await discoverResponse.json();
    expect(discovery.agents.length).toBeGreaterThanOrEqual(4);
  });

  test('验证智能体模型配置和调度能力', async ({ page }) => {
    test.skip(!await isTelencephalonReachable(), 'telencephalon not reachable on :60080');
    const agentsResponse = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
    expect(temporal).toBeTruthy();
    expect(temporal.config).toBeTruthy();
    expect(temporal.config.required_capabilities).toContain('asr');
    expect(temporal.config.required_capabilities).toContain('tts');
    expect(temporal.config.required_capabilities).toContain('llm');

    const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
    expect(prefrontal).toBeTruthy();
    expect(prefrontal.config).toBeTruthy();
    expect(prefrontal.config.required_capabilities).toContain('llm');
  });

  test('验证供应商和模型持久化', async ({ page }) => {
    test.skip(!await isTelencephalonReachable(), 'telencephalon not reachable on :60080');
    const providersResponse = await page.request.get(`${TELENCEPHALON_URL}/models/providers`);
    expect(providersResponse.ok()).toBeTruthy();
    const providers = await providersResponse.json();
    expect(providers.length).toBeGreaterThanOrEqual(1);

    const firstProvider = providers[0];
    expect(firstProvider.models.length).toBeGreaterThan(0);
  });

  test('对话页面输入定时任务消息', async ({ page }) => {
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('input[placeholder], textarea').first();
    if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageInput.fill('每天下午18点总结全网最新的AI咨询');
      expect(await messageInput.inputValue()).toContain('18点');
    }
  });

  test('任务看板页面加载', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ⚠️⚠️ **这里原来有一条「智能体页面加载」**（`page.goto('/agents')` ＋ 找 h1/h2/h3）
  //    ⇒ ⇒ 2026-11-05 真 CI 上第一次真跑就红 ⇒ ⇒ 根因**不是「页面慢」**，是
  //    **桌面端压根没有 `/agents` 这条路由**：
  //      · `src/App.tsx` 的路由表里没有 `agents`，也**没有 catch-all** ⇒ ⇒ 渲染空白
  //        （实测：页面里 h1/h2/h3 一个都找不到 ⇒ ⇒ Playwright 报 element(s) not found）
  //      · `agent-surface.json` 里 `agents` 这条能力的 `desktop.route` 是 **null**
  //        （只有移动端是 `/manage/agents`；`/agents` 是**移动端**的 legacy 路由）
  //      · 桌面端的智能体管理面在 **`/settings`**（SettingsPage 渲染
  //        InternalAgentCard / CustomAgentCard）⇒ ⇒ 那条路由另有测法。
  //    ⇒ ⇒ **过期测试，不是回归** ⇒ ⇒ 删掉；并把「它本来该测什么」写在这里，
  //    免得下一个人以为桌面端「漏做」了一个页面。

  test('模型页面加载', async ({ page }) => {
    await page.goto('/models');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
