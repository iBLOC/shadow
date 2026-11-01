import { test, expect, type Page } from '@playwright/test';

/**
 * 「读不到」不许长得像「没有」—— 在**真实浏览器**里验。
 *
 * ## 为什么要有这个文件（单测不够）
 *
 * ⚠️ 单测（lib/__tests__/modelConfigProbe.test.ts + ModelOnboardingPage.test.tsx）
 * 钉的是**判定函数**与**文案分支** ⇒ ⇒ 但它们**没钉「界面上长什么样」**。
 * ⇒ ⇒ 而这个病（读不到被显示成没有）**恰恰是一个「看起来对不对」的病**
 * ⇒ ⇒ ⇒ 必须有一双眼睛看真实渲染结果 ⇒ ⇒ 这里用 Playwright（真 Chromium
 * ⇒ ⇒ + 真 dev server）。
 *
 * ⚠️ **为什么用 page.route 拦截那一发**：端脑那扇门一上就是 401 ⇒ ⇒
 * ⇒ 「读不到」**正是常态** ⇒ ⇒ 但我们**不该**依赖真端脑（跑它要 Rust 构建）
 * ⇒ ⇒ 拦截这一发 ⇒ ⇒ 三档都能**复跑**。
 *
 * ⚠️ **断言钉在 data-state 上，不钉在文案上**：文案随语言走（默认 zh-CN）
 * ⇒ ⇒ 而「三档是不是真的分开了」是**状态**问题 ⇒ ⇒ 机器该看状态
 * ⇒ ⇒ （承 A2uiSurface 的 data-surface-empty 那个先例）。
 *
 * ⚠️ **本地那半为什么被 stub 成「有模型」**：AppInitializer 也在探测
 * ⇒ ⇒ 若判定成「确认没配」⇒ ⇒ 它会把用户**踢去 /onboarding** ⇒ ⇒
 * ⇒ ⇒ 设置页就渲染不出来了 ⇒ ⇒ ⇒ 与本文件要验的东西无关 ⇒ ⇒
 * ⇒ ⇒ 所以本地那半固定成「有可用模型」⇒ ⇒ 判定恒为 configured ⇒ ⇒ 停在设置页。
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/** 本地那半：固定「有可用模型」⇒ ⇒ 判定恒为 configured ⇒ ⇒ 不会被踢去向导。 */
async function stubLocalModels(page: Page) {
  await page.route('**/v1/models*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ data: [{ id: 'local-1', available: true }] }),
    }),
  );
}

/** 进设置页的「模型管理」那一格。 */
async function openModelsSection(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shadow_setup_complete', 'true'));
  await page.goto('/settings');
  await page.getByTestId('settings-section-models').click();
  await expect(page.getByTestId('provider-list-state')).toBeVisible();
}

test.describe('供应商列表的三态 —— 「读不到」不许长得像「没有」', () => {
  test('① 读不到（401）⇒ 显示「读不到供应商列表」⇒ **不是**「暂无模型供应商」', async ({ page }) => {
    await stubLocalModels(page);
    await page.route('**/models/providers', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: CORS,
        body: '{"error":"unauthorized"}',
      }),
    );
    await openModelsSection(page);

    await expect(page.getByTestId('provider-list-state')).toHaveAttribute('data-state', 'unreadable');
    // ⚠️ 「没有」那张皮**不许**出现 ⇒ ⇒ 否则用户会去重复配置已经配好的东西。
    await expect(page.getByText('暂无模型供应商')).toHaveCount(0);
    await expect(page.getByText('读不到供应商列表')).toBeVisible();
    // ⚠️ 底部计数也必须说「不知道」⇒ ⇒ 不许报一个假的数。
    await expect(page.getByTestId('provider-count')).toHaveAttribute('data-state', 'unknown');
    await expect(page.getByText('供应商数量未知')).toBeVisible();
  });

  test('② 确认空（200 + []）⇒ 显示「暂无模型供应商」⇒ **不是**「读不到」', async ({ page }) => {
    await stubLocalModels(page);
    await page.route('**/models/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: '[]',
      }),
    );
    await openModelsSection(page);

    await expect(page.getByTestId('provider-list-state')).toHaveAttribute('data-state', 'empty');
    await expect(page.getByText('读不到供应商列表')).toHaveCount(0);
    await expect(page.getByText('暂无模型供应商')).toBeVisible();
    await expect(page.getByTestId('provider-count')).toHaveAttribute('data-state', 'known');
  });

  test('③ 读得到且有货 ⇒ 列出供应商（不是上面两档之一）', async ({ page }) => {
    await stubLocalModels(page);
    await page.route('**/models/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify([
          {
            id: 'p1',
            name: 'probe-provider',
            provider_type: 'openai',
            models: [{ id: 'm1', name: 'probe-model' }],
          },
        ]),
      }),
    );
    await openModelsSection(page);

    await expect(page.getByTestId('provider-list-state')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByText('probe-provider')).toBeVisible();
    await expect(page.getByText('暂无模型供应商')).toHaveCount(0);
    await expect(page.getByText('读不到供应商列表')).toHaveCount(0);
  });

  test('④ 两档的文案**真的不一样**（状态对了、文案却一样 = 失败长得像成功）', async ({ page }) => {
    // ⚠️ 这一条是**本文件存在的理由**：①② 分别钉住了两档 ⇒ ⇒ 这里再钉一次
    // ⇒ ⇒ 「两档的文案不相同」⇒ ⇒ 免得有人把两档的文案改成一样，而状态标记还在
    // ⇒ ⇒ （看着还是三态）⇒ ⇒ 那就等于「读不到」又长得像「没有」。
    await stubLocalModels(page);
    await page.route('**/models/providers', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: CORS,
        body: '{"error":"unauthorized"}',
      }),
    );
    await openModelsSection(page);
    // ⚠️ 只比**整块文字**是不够的：提示语不同就能蒙过去 ⇒ ⇒ 所以比**标题那一行**
    // ⇒ ⇒ （标题才是告诉用户「现在是哪一档」的那句话 ⇒ ⇒ 提示语只是佐证）。
    const headlineOf = (text: string) => text.split('\n')[0].trim();
    const unreadableText = headlineOf((await page.getByTestId('provider-list-state').innerText()).trim());

    await page.unroute('**/models/providers');
    await page.route('**/models/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS,
        body: '[]',
      }),
    );
    await page.reload();
    await page.getByTestId('settings-section-models').click();
    await expect(page.getByTestId('provider-list-state')).toHaveAttribute('data-state', 'empty');
    const emptyText = headlineOf((await page.getByTestId('provider-list-state').innerText()).trim());

    expect(unreadableText.length).toBeGreaterThan(0);
    expect(emptyText.length).toBeGreaterThan(0);
    expect(unreadableText).not.toBe(emptyText);
  });
});
