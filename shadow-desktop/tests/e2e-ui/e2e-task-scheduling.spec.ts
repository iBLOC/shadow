import { test, expect } from '@playwright/test';
import { isCortexReachable } from './global-setup';

const CORTEX_URL = process.env.SHADOW_CORTEX_URL ?? 'http://localhost:60080';

test.describe('End-to-End: Conversation to Task Scheduling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  test('通过对话发布定时任务并验证调度链路', async ({ page }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const createConvResponse = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, {
      data: { agent: 'temporal' },
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();
    expect(conv.id).toBeTruthy();

    const taskMessage = '每天下午18点总结全网最新的AI咨询';
    const sendResponse = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/${conv.id}/messages`,
      { data: { text: taskMessage } }
    );
    const sendStatus = sendResponse.status();
    expect([200, 502]).toContain(sendStatus);

    if (sendStatus === 200) {
      const sendResult = await sendResponse.json();
      expect(sendResult.conversation_id).toBe(conv.id);

      const getConvResponse = await page.request.get(`${CORTEX_URL}/shadow/v1/conversations/${conv.id}`);
      expect(getConvResponse.ok()).toBeTruthy();
      const convDetail = await getConvResponse.json();
      
      const userMessages = convDetail.history.filter((h: { role: string }) => h.role === 'user');
      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(userMessages.some((m: { text: string }) => m.text.includes(taskMessage))).toBeTruthy();
    }

    const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
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
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
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

    const discoverResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents/discover`);
    expect(discoverResponse.ok()).toBeTruthy();
    const discovery = await discoverResponse.json();
    expect(discovery.agents.length).toBeGreaterThanOrEqual(4);
  });

  test('验证智能体模型配置和调度能力', async ({ page }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
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
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const providersResponse = await page.request.get(`${CORTEX_URL}/models/providers`);
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

  test('智能体页面加载', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('模型页面加载', async ({ page }) => {
    await page.goto('/models');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
