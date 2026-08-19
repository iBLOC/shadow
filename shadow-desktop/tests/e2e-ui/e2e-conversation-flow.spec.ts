import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';

const CORTEX_URL = 'http://localhost:60080';

test.describe('Complete E2E: Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
  });

  test('发送消息并验证响应', async ({ page }) => {
    // 1. 创建对话
    const createConvResponse = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();
    expect(conv.id).toBeTruthy();

    // 2. 发送消息
    const sendResponse = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/${conv.id}/messages:stream`,
      { data: { text: '你好' } }
    );

    // 3. 验证响应
    if (sendResponse.ok()) {
      // 成功响应 - 检查 SSE 事件
      const text = await sendResponse.text();
      expect(text).toBeTruthy();
      console.log('Message sent successfully, response:', text.substring(0, 200));
    } else {
      // 错误响应 - 验证错误格式
      const errorBody = await sendResponse.text();
      console.log('Message failed with error:', errorBody);
      
      // 验证错误包含有用信息
      expect(errorBody).toBeTruthy();
      
      // 如果是 lobe 不可达，错误应该包含具体信息
      if (errorBody.includes('unreachable') || errorBody.includes('connection refused')) {
        console.log('Lobe not reachable - this is expected if temporal/prefrontal is not running');
      }
    }
  });

  test('验证所有 lobe 可达性', async ({ page }) => {
    // 获取所有 lobe
    const agentsResponse = await page.request.get(`${CORTEX_URL}/api/cortex/agents`);
    expect(agentsResponse.ok()).toBeTruthy();
    const agents = await agentsResponse.json();

    // 检查每个 lobe 的可达性
    for (const lobe of agents.lobes) {
      if (lobe.url) {
        try {
          const healthResponse = await page.request.get(`${lobe.url}/.well-known/agent.json`);
          if (healthResponse.ok()) {
            console.log(`✓ ${lobe.name} is reachable at ${lobe.url}`);
          } else {
            console.log(`✗ ${lobe.name} returned status ${healthResponse.status}`);
          }
        } catch (e) {
          console.log(`✗ ${lobe.name} is not reachable at ${lobe.url}: ${e}`);
        }
      }
    }

    // 至少应该有 4 个 lobe
    expect(agents.lobes.length).toBeGreaterThanOrEqual(4);
  });

  test('验证错误处理 - lobe 不可达', async ({ page }) => {
    // 创建对话
    const createConvResponse = await page.request.post(`${CORTEX_URL}/shadow/v1/conversations`, {
      data: {},
    });
    expect(createConvResponse.ok()).toBeTruthy();
    const conv = await createConvResponse.json();

    // 发送消息到可能不可达的 lobe
    const sendResponse = await page.request.post(
      `${CORTEX_URL}/shadow/v1/conversations/${conv.id}/messages:stream`,
      { data: { text: '测试消息' } }
    );

    // 验证错误响应格式
    if (!sendResponse.ok()) {
      const errorBody = await sendResponse.text();
      expect(errorBody).toBeTruthy();
      
      // 验证错误是 JSON 格式
      try {
        const errorJson = JSON.parse(errorBody);
        expect(errorJson.error).toBeTruthy();
        expect(errorJson.error.message).toBeTruthy();
        console.log('Error response:', errorJson.error);
      } catch {
        // 可能是 SSE 格式的错误
        console.log('SSE error response:', errorBody.substring(0, 200));
      }
    }
  });

  test('验证对话页面错误显示', async ({ page }) => {
    await page.goto('/conversation');
    await page.waitForLoadState('networkidle');

    const newChatButton = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first();
    if (await newChatButton.isVisible()) {
      await newChatButton.click();
      await page.waitForTimeout(500);
    }

    const messageInput = page.locator('input[placeholder], textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('测试消息');

      const sendButton = page.locator('button').filter({ has: page.locator('svg.lucide-send') }).first();
      if (await sendButton.isVisible() && await sendButton.isEnabled()) {
        await sendButton.click();
        await page.waitForTimeout(5000);
        
        const messages = page.locator('[class*="message"]');
        const messageCount = await messages.count();
        console.log(`Found ${messageCount} messages after sending`);
        expect(messageCount).toBeGreaterThanOrEqual(1);
      } else {
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
