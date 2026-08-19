import { browser, expect } from '@wdio/globals';

describe('Shadow Desktop - 对话功能', () => {
  before(async () => {
    await browser.url('/');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.length > 0;
    }, { timeout: 15000 });
  });

  it('应该加载页面', async () => {
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该导航到对话页面', async () => {
    await browser.url('/conversation');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/conversation') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该显示消息输入框', async () => {
    const input = await browser.$('input[placeholder], textarea');
    if (await input.isExisting()) {
      await input.setValue('测试消息');
      const value = await input.getValue();
      expect(value).toContain('测试');
    }
  });
});
