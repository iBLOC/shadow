// Auto-migrated from e2e-task-scheduling.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
const CORTEX_URL = 'http://localhost:60080';

describe('End-to-End: Conversation to Task Scheduling', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  it('通过对话发布定时任务并验证调度链路', async () => {
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

      const getConvResponse = await fetch(`${CORTEX_URL}/shadow/v1/conversations/${conv.id}`);
      expect(getConvResponse.ok()).toBeTruthy();
      const convDetail = await getConvResponse.json();
      
      const userMessages = convDetail.history.filter((h: { role: string }) => h.role === 'user');
      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(userMessages.some((m: { text: string }) => m.text.includes(taskMessage))).toBeTruthy();
    }

    const agentsResponse = await fetch(`${CORTEX_URL}/api/cortex/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    const temporal = agents.lobes.find((l: { name: string }) => l.name === 'temporal');
    expect(temporal).toBeTruthy();
    expect(temporal.enabled).toBe(true);

    const prefrontal = agents.lobes.find((l: { name: string }) => l.name === 'prefrontal');
    expect(prefrontal).toBeTruthy();
    expect(prefrontal.enabled).toBe(true);
  });

  it('验证颞叶到前额叶的A2A通信', async () => {
    const agentsResponse = await fetch(`${CORTEX_URL}/api/cortex/agents`);
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

    const discoverResponse = await fetch(`${CORTEX_URL}/api/cortex/agents/discover`);
    expect(discoverResponse.ok()).toBeTruthy();
    const discovery = await discoverResponse.json();
    expect(discovery.agents.length).toBeGreaterThanOrEqual(4);
  });

  it('验证智能体模型配置和调度能力', async () => {
    const agentsResponse = await fetch(`${CORTEX_URL}/api/cortex/agents`);
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

  it('验证供应商和模型持久化', async () => {
    const providersResponse = await fetch(`${CORTEX_URL}/models/providers`);
    expect(providersResponse.ok()).toBeTruthy();
    const providers = await providersResponse.json();
    expect(providers.length).toBeGreaterThanOrEqual(1);

    const firstProvider = providers[0];
    expect(firstProvider.models.length).toBeGreaterThan(0);
  });

  it('对话页面输入定时任务消息', async () => {
    await browser.url('/conversation');
    await browser.pause(500);

    const messageInput = await $('input[placeholder], textarea').first();
    if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageInput.fill('每天下午18点总结全网最新的AI咨询');
      expect(await messageInput.inputValue()).toContain('18点');
    }
  });

  it('任务看板页面加载', async () => {
    await browser.url('/tasks');
    await browser.pause(500);

    const heading = await $('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  it('智能体页面加载', async () => {
    await browser.url('/agents');
    await browser.pause(500);

    const heading = await $('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  it('模型页面加载', async () => {
    await browser.url('/models');
    await browser.pause(500);

    const heading = await $('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});

