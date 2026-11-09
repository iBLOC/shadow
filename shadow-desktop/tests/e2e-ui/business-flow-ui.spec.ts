import { test, expect, Page } from '@playwright/test';
import { TEST_CONFIG } from './config';
import { requireTelencephalon } from './e2e-strict';

const TELENCEPHALON_URL = TEST_CONFIG.TELENCEPHALON_URL;
const FULL_STACK = process.env.SHADOW_FULL_STACK === '1';

async function setupSetupComplete(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('shadow_setup_complete', 'true');
  });
}

test.describe('Business Flow UI: Task Creation End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    await setupSetupComplete(page);
  });

  test('UI: 创建对话 → 发送任务创建请求 → 验证响应', async ({ page }) => {
    await requireTelencephalon();
    // 1. 通过 UI API 创建对话
    const conv = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(conv.ok()).toBeTruthy();
    const convData = await conv.json();
    expect(convData.id).toBeTruthy();
    expect(convData.agent).toBeTruthy();

    // 2. 发送任务创建消息
    const sendRes = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${convData.id}/messages`,
      { data: { text: '帮我创建任务下午三点我要和客户开会' } }
    );

    // 3. 验证响应
    // ⚠️⚠️ **原来这里是 `if (sendRes.ok()) { …断言… } else { 只断言「错误体非空」 }`**
    //    ⇒ ⇒ 端脑 502（意图契约对不上 / 自调用丢钥匙 / 没配模型）时
    //    ⇒ ⇒ **这条测试照样绿** ⇒ ⇒ 「失败长得像成功」。
    //    ⇒ ⇒ 现在端脑可达已经由 `requireTelencephalon()` 断言过了
    //    ⇒ ⇒ ⇒ 502 不再是「可原谅的分支」，而是**真失败**。
    const sendBody = await sendRes.text();
    expect(sendRes.status(), `任务创建失败：${sendBody.slice(0, 300)}`).toBe(200);
    const body = JSON.parse(sendBody);
    expect(body.error).toBeUndefined();
    expect(body.reply).toBeTruthy();
    if (FULL_STACK) {
      // Hard assertion in full-stack mode: reply must echo the task back.
      expect(body.reply).toContain('任务');
    }
  });

  test('UI: 验证设置页面 lobe 配置立即生效', async ({ page }) => {
    await requireTelencephalon();
    // 1. 设置默认模型
    const setRes = await page.request.patch(
      `${TELENCEPHALON_URL}/api/telencephalon/agents/temporal/config`,
      {
        // ⚠️ 模型名用 mock 通道注册的 `test-model-ui`（global-setup ⇒ NEURON_REMOTE_*）。
        //    这条 PATCH 测的是「管理面收下配置」（`{"status":"ok"}`），名字本身无所谓；
        //    但 **端脑状态跨测试持久**：曾硬编码 `mimo-v2-flash` ⇒ 后续 history 测试发消息
        //    ⇒ neuron `no_engine_for_model: 'mimo-v2-flash'` ⇒ 502 ⇒ history 恒 0
        //    （CI run 42074569869 与本地污染状态复跑逐字同形，均已归档）。
        //    与下方 `lobe 配置 PATCH 验证` 那条（同样 PATCH `test-model-ui`）同形状。
        data: { config: { model_id: 'test-model-ui' } },
        // ⚠️ **凭据不再手写在这个请求上** —— 端脑只认 `x-admin-token`
        //    （`telencephalon/src/security/api_key.rs`），而 `X-Admin-Key`
        //    **不是那扇门** ⇒ ⇒ 2026-11-05 真机实测：这条 PATCH 401。
        // ⇒ ⇒ 钥匙由 `playwright.config.ts` 的 `extraHTTPHeaders` 统一带
        //    （头名与钥匙**只有一处** ⇒ ⇒ 不会漂）。
      }
    );
    expect(setRes.ok()).toBeTruthy();

    // 2. 发送消息
    const conv = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, { data: {} });
    const convData = await conv.json();

    const sendRes = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${convData.id}/messages`,
      { data: { text: 'hello' } }
    );

    // ⚠️⚠️ **原来这里是 `if (sendRes.ok()) { … }`**（**没有 else**）
    //    ⇒ ⇒ 端脑 502 ⇒ ⇒ **整条测试零断言通过** ⇒ ⇒ 连「失败」都没有，
    //    ⇒ ⇒ 只有一个空壳 —— 最省电的那种「失败长得像成功」。
    const sendBody = await sendRes.text();
    expect(sendRes.status(), `发消息失败：${sendBody.slice(0, 300)}`).toBe(200);
    const body = JSON.parse(sendBody);
    expect(body.error).toBeUndefined();
    expect(body.reply).toBeTruthy();
  });

  test('UI: 多轮对话验证 history 累积', async ({ page }) => {
    // 1. 创建对话
    const conv = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, { data: {} });
    const convData = await conv.json();

    // 2. 发送 3 条消息
    for (const msg of ['first', 'second', 'third']) {
      const res = await page.request.post(
        `${TELENCEPHALON_URL}/shadow/v1/conversations/${convData.id}/messages`,
        { data: { text: msg } }
      );
      // ⚠️ 原来是 `if (!res.ok()) break;` ⇒ ⇒ 失败时**悄悄少发一条**
      //    ⇒ ⇒ 后面那条 history 断言会红，但**看不出是哪条消息失败**
      //    ⇒ ⇒ 「红得莫名其妙」那一族 ⇒ ⇒ 现在把失败当场钉住。
      const body = await res.text();
      expect(res.status(), `第 ${msg} 条消息失败：${body.slice(0, 300)}`).toBe(200);
    }

    // 3. 验证 history
    const getRes = await page.request.get(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${convData.id}`
    );
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.history.length).toBeGreaterThanOrEqual(3);
  });

  test('UI: 智能体选择下拉菜单', async ({ page }) => {
    // 导航到对话页面
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 检查页面是否加载
    const heading = page.locator('h1, h2, h3').first();
    // ⚠️ 原来是 `if (await heading.isVisible()) { … }` ⇒ ⇒ 标题不在 ⇒
    //    ⇒ ⇒ **整条零断言通过** ⇒ ⇒ 「什么都没发生」被记成「通过」。
    await expect(heading).toBeVisible({ timeout: 10000 });
    const text = await heading.textContent();
    expect(text).toBeTruthy();
  });

  test('UI: 设置页面导航', async ({ page }) => {
    // 导航到设置
    await page.goto('/settings');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 验证设置页面有侧边栏
    const sidebar = page.locator('aside, nav').first();
    // ⚠️ 同上：不可见就是红 ⇒ ⇒ 不许「什么都没发生」。
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    const buttons = await sidebar.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('UI: lobe 配置 PATCH 验证', async ({ page }) => {
    // 通过 UI 的 request 上配置 lobe
    const patchRes = await page.request.patch(
      `${TELENCEPHALON_URL}/api/telencephalon/agents/temporal/config`,
      {
        data: { config: { model_id: 'test-model-ui' } },
        // ⚠️ 同上：`X-Admin-Key` 不是端脑那扇门 ⇒ ⇒ 凭据统一在
        //    `playwright.config.ts` 的 `extraHTTPHeaders` 里。
      }
    );
    expect(patchRes.ok()).toBeTruthy();
    const result = await patchRes.json();
    expect(result.status).toBe('ok');
  });

  test('UI: 验证 prefrontal 端点响应', async ({ page }) => {
    await requireTelencephalon();
    // prefrontal/agents 端点
    const agentsRes = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/prefrontal/agents`);
    expect(agentsRes.ok()).toBeTruthy();
    const agents = await agentsRes.json();
    expect(Array.isArray(agents)).toBeTruthy();
    expect(agents.length).toBeGreaterThan(0);
  });

  test('UI: 验证 lobe capabilities 端点', async ({ page }) => {
    await requireTelencephalon();
    const capsRes = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/lobes/capabilities`);
    expect(capsRes.ok()).toBeTruthy();
    const caps = await capsRes.json();
    expect(caps.capabilities).toBeTruthy();
    expect(caps.modalities).toBeTruthy();
  });

  test('UI: 验证 prefrontal dispatch 响应', async ({ page }) => {
    await requireTelencephalon();
    const dispatchRes = await page.request.post(
      `${TELENCEPHALON_URL}/api/telencephalon/prefrontal/dispatch`,
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

  test('UI: 验证错误响应格式', async ({ page }) => {
    await requireTelencephalon();
    // 故意使用不存在的会话
    const res = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/non-existent-id/messages`,
      { data: { text: 'test' } }
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});