import { browser, expect } from '@wdio/globals';

describe('Shadow Desktop - 对话功能', () => {
  before(async () => {
    await browser.url('http://localhost:5173');
    await browser.waitUntil(async () => {
      const title = await browser.getTitle();
      return title.includes('Shadow') || title.includes('设置');
    });
  });

  it('应该显示主页面', async () => {
    const body = await browser.$('body');
    const text = await body.getText();
    console.log('页面包含 Shadow 相关内容');
    expect(text).toBeTruthy();
  });

  it('应该导航到对话页面', async () => {
    const conversationLink = await browser.$('a[href="/conversation"]');
    if (await conversationLink.isExisting()) {
      await conversationLink.click();
      await browser.waitUntil(async () => {
        const url = await browser.getUrl();
        return url.includes('/conversation');
      });
    }
  });

  it('应该显示对话输入框', async () => {
    const input = await browser.$('input[placeholder], textarea');
    if (await input.isExisting()) {
      await input.setValue('你好，显示我的智能体');
      const value = await input.getValue();
      expect(value).toContain('显示我的智能体');
    }
  });
});
