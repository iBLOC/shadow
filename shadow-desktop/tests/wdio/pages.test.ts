import { browser, expect } from '@wdio/globals';

describe('Shadow Desktop - 模型管理', () => {
  before(async () => {
    await browser.url('/models');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/models') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该显示模型页面或引导页', async () => {
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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

  it('应该显示智能体页面或引导页', async () => {
    const url = await browser.getUrl();
    expect(url).toBeTruthy();
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

  it('应该显示设置页面或引导页', async () => {
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});
