import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';
import { requireTelencephalon } from './e2e-strict';

const TELENCEPHALON_URL = TEST_CONFIG.TELENCEPHALON_URL;
const FULL_STACK = process.env.SHADOW_FULL_STACK === '1';

test.describe('Complete E2E: Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  test('发送消息并验证响应', async ({ page }) => {
    await requireTelencephalon();
    // 1. 创建对话
    const createConvResponse = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();
    expect(conv.id).toBeTruthy();

    // 2. 发送消息
    const sendResponse = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${conv.id}/messages:stream`,
      { data: { text: '你好' } }
    );

    // 3. 验证响应
    // ⚠️⚠️ **原来这里是 `if (sendResponse.ok()) { … } else { 只断言「错误体非空」 }`**
    //    ⇒ ⇒ 端脑 502 ⇒ ⇒ 这条测试照样绿 ⇒ ⇒ 「失败长得像成功」。
    //    ⇒ ⇒ 端脑可达已经由 `requireTelencephalon()` 断言过 ⇒ ⇒ 502 就是真失败。
    const text = await sendResponse.text();
    expect(sendResponse.status(), `发消息失败：${text.slice(0, 300)}`).toBe(200);
    expect(text).toBeTruthy();
    if (FULL_STACK) {
      // Hard-assertion when full stack is requested: real reply must include
      // either Chinese content or the literal 'hello' echo.
      expect(text).toMatch(/[\u4e00-\u9fa5]|hello/i);
    } else {
      console.log('Message sent successfully, response:', text.substring(0, 200));
    }
  });

  test('验证所有 lobe 可达性', async ({ page }) => {
    await requireTelencephalon();
    // 获取所有 lobe
    const agentsResponse = await page.request.get(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    // 检查每个 lobe 的可达性
    // ⚠️ 原来每个 lobe 的可达性**只打日志** ⇒ ⇒ 全部 lobe 不可达时
    //    ⇒ ⇒ 这条测试**照样绿** ⇒ ⇒ 现在不可达就是红。
    const unreachable: string[] = [];
    for (const lobe of agents.lobes) {
      if (!lobe.url) continue;
      try {
        const healthResponse = await page.request.get(`${lobe.url}/.well-known/agent.json`);
        if (!healthResponse.ok()) {
          unreachable.push(`${lobe.name} → ${healthResponse.status}`);
        }
      } catch (e) {
        unreachable.push(`${lobe.name} → ${(e as Error).message}`);
      }
    }
    expect(unreachable, `不可达的 lobe：${unreachable.join('; ')}`).toEqual([]);

    // 至少应该有 4 个 lobe
    expect(agents.lobes.length).toBeGreaterThanOrEqual(4);
  });

  test('验证端脑可达时对话必须成功（失败不许被原谅）', async ({ page }) => {
    await requireTelencephalon();
    // 创建对话
    const createConvResponse = await page.request.post(`${TELENCEPHALON_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();

    // 发送消息到可能不可达的 lobe
    const sendResponse = await page.request.post(
      `${TELENCEPHALON_URL}/shadow/v1/conversations/${conv.id}/messages:stream`,
      { data: { text: '测试消息' } }
    );

    // ⚠️⚠️ **原来这条是「成功时零断言、失败时只断言错误体非空」**
    //    ⇒ ⇒ 它**什么都没验**（成功路径整段 if 不执行）
    //    ⇒ ⇒ 而且它把「端脑不可达」当成**预期**（注释里写着 expected）
    //    ⇒ ⇒ 「失败」被写进了这条测试的前提里。
    //    ⇒ ⇒ 现在：端脑可达已被 `requireTelencephalon()` 断言过 ⇒ ⇒ 必须成功。
    const body = await sendResponse.text();
    expect(sendResponse.status(), `发消息失败：${body.slice(0, 300)}`).toBe(200);
    expect(body.length).toBeGreaterThan(0);
  });

  test('验证对话页面错误显示', async ({ page }) => {
    await requireTelencephalon();
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');

    const newChatButton = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first();
    const newChatVisible = await newChatButton.isVisible();
    if (newChatVisible) {
      await newChatButton.click();
      await page.waitForTimeout(500);
    }

    // ⚠️⚠️ **原来整段是 `if (await messageInput.isVisible()) { … }`**
    //    ⇒ ⇒ 输入框不在 ⇒ 这条测试**零断言通过** ⇒ ⇒ 「什么都没发生」被记成「通过」。
    //    ⇒ ⇒ 现在：输入框必须在（对话页的承重契约）⇒ ⇒ 不可见就是红。
    // ⚠️⚠️ **这一段原来整段是 `if (await messageInput.isVisible()) { … }`**
    //    ⇒ ⇒ 元素不在 ⇒ 这条测试**零断言通过** ⇒ ⇒ 「什么都没发生」被记成「通过」。
    //    ⇒ ⇒ 现在：对话页必须落在**两个合法形态之一** ——
    //      ❶ 空态（「选择或创建新对话」）⇒ ⇒ 对话列表渲染出来了；
    //      ❷ 已有会话（消息输入框在）⇒ ⇒ 会话面渲染出来了。
    //    ⇒ ⇒ 两个都不是 ⇒ ⇒ 界面坏了 ⇒ ⇒ **红**。
    //
    // ⚠️⚠️ **别拿「搜索框」当消息输入框** —— 原来那个定位器是
    //    `input[placeholder], textarea` ⇒ ⇒ 实测它匹到的是「搜索对话...」
    //    那个**搜索框**（页面的空态里只有它）⇒ ⇒ 填进去的是搜索词，
    //    不是消息 ⇒ ⇒ 「填了」是个假动作 ⇒ ⇒ 定位器要排除搜索框。
    const emptyState = page.getByRole('heading', { name: /选择或创建新对话/ });
    const messageInput = page.locator('textarea, input:not([placeholder*="搜索"])').first();
    const emptyVisible = await emptyState.isVisible();
    const inputVisible = await messageInput.isVisible();
    expect(emptyVisible || inputVisible, '对话页既没有空态提示，也没有消息输入框').toBe(true);

    if (inputVisible) {
      await messageInput.fill('测试消息');
      // 填充必须真的落到输入框里（否则「填了」只是「调了个方法」）
      expect(await messageInput.inputValue()).toContain('测试消息');

      const sendButton = page.locator('button').filter({ has: page.locator('svg.lucide-send') }).first();
      const sendVisible = await sendButton.isVisible();
      const sendEnabled = sendVisible ? await sendButton.isEnabled() : false;
      if (sendVisible && sendEnabled) {
        await sendButton.click();
        await page.waitForTimeout(5000);

        const messages = page.locator('[class*="message"]');
        const messageCount = await messages.count();
        console.log(`Found ${messageCount} messages after sending`);
        expect(messageCount).toBeGreaterThanOrEqual(1);
      } else {
        // ⚠️ 发送按钮不可用（没选 lobe / 没配模型）⇒ ⇒ 那是**另一条**已知缺口
        //    ⇒ ⇒ 但这条测试**已经有承重断言**（上面的形态判定 ＋ 填充落账）
        //    ⇒ ⇒ **不许**因此零断言通过。
        console.log('Send button not enabled - likely no lobe selected or available');
      }
    }
  });

  test('验证对话页面显示智能体选择', async ({ page }) => {
    // 导航到对话页面
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');

    // 验证页面加载
    const heading = page.locator('h3').filter({ hasText: /对话/ }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('验证执行追踪页面', async ({ page }) => {
    // 导航到执行追踪页面
    await page.goto('/trace');
    await page.waitForLoadState('networkidle');

    // 验证页面加载
    const heading = page.locator('h1').filter({ hasText: /执行追踪/ }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
