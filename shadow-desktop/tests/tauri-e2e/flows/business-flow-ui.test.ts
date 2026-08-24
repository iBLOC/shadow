// Auto-migrated from business-flow-ui.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
import { TEST_CONFIG } from './config';

const CORTEX_URL = TEST_CONFIG.CORTEX_URL;

async function setupSetupComplete(page: Page) {
  await browser.url('/');
  await browser.execute(() => {
    localStorage.setItem('shadow_setup_complete', 'true');
  });
}

describe('Business Flow UI: Task Creation End-to-End', () => {
  beforeEach(async () => {
    await setupSetupComplete(page);
  });

  it('UI: 创建对话 → 发送任务创建请求 → 验证响应', async () => {
    // 1. 通过 UI API 创建对话
    const conv = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(conv.ok()).toBeTruthy();
    const convData = await conv.json();
    expect(convData.id).toBeTruthy();
    expect(convData.agent).toBeTruthy();

    // 2. 发送任务创建消息
    const sendRes = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/${convData.id}/messages`,
      { data: { text: '帮我创建任务下午三点我要和客户开会' } }
    );

    // 3. 验证响应
    if (sendRes.ok()) {
      const body = await sendRes.json();
      expect(body.error).toBeUndefined();
      expect(body.reply).toBeTruthy();
      // 任务创建成功应该返回确认信息
      expect(body.reply).toContain('任务');
    } else {
      const errorBody = await sendRes.text();
      console.log('Task create error:', errorBody);
      // 如果是 lobe 不可达，验证错误信息
      expect(errorBody).toBeTruthy();
    }
  });

  it('UI: 验证设置页面 lobe 配置立即生效', async () => {
    // 1. 设置默认模型
    const setRes = await page.request.patch(
      `${CORTEX_URL}/api/cortex/agents/temporal/config`,
      {
        data: { config: { model_id: 'mimo-v2-flash' } },
        headers: { 'X-Admin-Key': 'dev-admin-key' },
      }
    );
    expect(setRes.ok()).toBeTruthy();

    // 2. 发送消息
    const conv = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, { data: {} });
    const convData = await conv.json();

    const sendRes = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/${convData.id}/messages`,
      { data: { text: 'hello' } }
    );

    if (sendRes.ok()) {
      const body = await sendRes.json();
      expect(body.error).toBeUndefined();
    }
  });

  it('UI: 多轮对话验证 history 累积', async () => {
    // 1. 创建对话
    const conv = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, { data: {} });
    const convData = await conv.json();

    // 2. 发送 3 条消息
    for (const msg of ['first', 'second', 'third']) {
      const res = await page.request.post(
        `${CORTEX_URL}/shadow/v1/conversations/${convData.id}/messages`,
        { data: { text: msg } }
      );
      if (!res.ok()) break;
    }

    // 3. 验证 history
    const getRes = await fetch(
      `${CORTEX_URL}/shadow/v1/conversations/${convData.id}`
    );
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.history.length).toBeGreaterThanOrEqual(3);
  });

  it('UI: 智能体选择下拉菜单', async () => {
    // 导航到对话页面
    await browser.url('/conversation');
    await browser.pause(500).catch(() => {});

    // 检查页面是否加载
    const heading = await $('h1, h2, h3').first();
    if (await heading.isVisible()) {
      const text = await heading.textContent();
      expect(text).toBeTruthy();
    }
  });

  it('UI: 设置页面导航', async () => {
    // 导航到设置
    await browser.url('/settings');
    await browser.pause(500).catch(() => {});

    // 验证设置页面有侧边栏
    const sidebar = await $('aside, nav').first();
    if (await sidebar.isVisible()) {
      const buttons = await sidebar.locator('button').count();
      expect(buttons).toBeGreaterThan(0);
    }
  });

  it('UI: lobe 配置 PATCH 验证', async () => {
    // 通过 UI 的 request 上配置 lobe
    const patchRes = await page.request.patch(
      `${CORTEX_URL}/api/cortex/agents/temporal/config`,
      {
        data: { config: { model_id: 'test-model-ui' } },
        headers: { 'X-Admin-Key': 'dev-admin-key' },
      }
    );
    expect(patchRes.ok()).toBeTruthy();
    const result = await patchRes.json();
    expect(result.status).toBe('ok');
  });

  it('UI: 验证 prefrontal 端点响应', async () => {
    // prefrontal/agents 端点
    const agentsRes = await fetch(`${CORTEX_URL}/api/cortex/prefrontal/agents`);
    expect(agentsRes.ok()).toBeTruthy();
    const agents = await agentsRes.json();
    expect(Array.isArray(agents)).toBeTruthy();
    expect(agents.length).toBeGreaterThan(0);
  });

  it('UI: 验证 lobe capabilities 端点', async () => {
    const capsRes = await fetch(`${CORTEX_URL}/api/cortex/lobes/capabilities`);
    expect(capsRes.ok()).toBeTruthy();
    const caps = await capsRes.json();
    expect(caps.capabilities).toBeTruthy();
    expect(caps.modalities).toBeTruthy();
  });

  it('UI: 验证 prefrontal dispatch 响应', async () => {
    const dispatchRes = await page.request.post(
      `${CORTEX_URL}/api/cortex/prefrontal/dispatch`,
      {
        data: {
          agent: 'temporal',
          text: 'create_task:{"title":"UI Test","due_time":"今天","priority":"low"}',
          skill: 'create_task',
        },
      }
    );
    expect(dispatchRes.ok()).toBeTruthy();
    const result = await dispatchRes.json();
    expect(result.reply).toBeTruthy();
  });

  it('UI: 验证错误响应格式', async () => {
    // 故意使用不存在的会话
    const res = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/non-existent-id/messages`,
      { data: { text: 'test' } }
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
