import { browser, expect } from '@wdio/globals';

/**
 * 这一族原来断言的是 `expect(text).toBeTruthy()` —— **任何**渲染出来的页面都有字
 * ⇒ ⇒ 404 页也算过 ⇒ ⇒ 「页面可用」这件事**从来没被证明过**。
 * ⇒ ⇒ 现在断言：路由对得上 ＋ **应用真的挂上了**（`#root` 在、且不是白屏）。
 */

describe('Shadow Desktop - 模型管理', () => {
  before(async () => {
    await browser.url('/models');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/models') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该显示模型管理页面或引导页', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(models|setup|onboarding)/);
    // ⚠️ 「应用真的挂上了」——`#root` 在、且不是白屏
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 智能体管理', () => {
  before(async () => {
    await browser.url('/agents');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/agents') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该显示智能体管理页面或引导页', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(agents|setup|onboarding)/);
    // ⚠️ 「应用真的挂上了」——`#root` 在、且不是白屏
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 设置页面', () => {
  before(async () => {
    await browser.url('/settings');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/settings') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该显示设置页或引导页', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(settings|setup|onboarding)/);
    // ⚠️ 「应用真的挂上了」——`#root` 在、且不是白屏
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 任务看板', () => {
  before(async () => {
    await browser.url('/tasks');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/tasks') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该显示任务看板或引导页', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(tasks|setup|onboarding)/);
    // ⚠️ 「应用真的挂上了」——`#root` 在、且不是白屏
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});