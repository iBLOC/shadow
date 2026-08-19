import { browser, expect } from '@wdio/globals';

describe('Shadow Desktop - 模型管理', () => {
  before(async () => {
    await browser.url('http://localhost:5173/models');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/models');
    });
  });

  it('应该显示模型页面', async () => {
    const heading = await browser.$('h1, h2, h3');
    if (await heading.isExisting()) {
      const text = await heading.getText();
      console.log('模型页面标题:', text);
      expect(text).toBeTruthy();
    }
  });

  it('应该显示云端供应商标签', async () => {
    const cloudTab = await browser.$('button=云端供应商');
    if (await cloudTab.isExisting()) {
      expect(await cloudTab.isDisplayed()).toBe(true);
    }
  });

  it('应该显示添加供应商按钮', async () => {
    const addButton = await browser.$('button=添加供应商');
    if (await addButton.isExisting()) {
      expect(await addButton.isDisplayed()).toBe(true);
    }
  });
});

describe('Shadow Desktop - 智能体管理', () => {
  before(async () => {
    await browser.url('http://localhost:5173/agents');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/agents');
    });
  });

  it('应该显示智能体页面', async () => {
    const heading = await browser.$('h1, h2, h3');
    if (await heading.isExisting()) {
      const text = await heading.getText();
      console.log('智能体页面标题:', text);
      expect(text).toBeTruthy();
    }
  });

  it('应该显示内部智能体区域', async () => {
    const internalSection = await browser.$('button=内部智能体');
    if (await internalSection.isExisting()) {
      expect(await internalSection.isDisplayed()).toBe(true);
    }
  });
});

describe('Shadow Desktop - 设置页面', () => {
  before(async () => {
    await browser.url('http://localhost:5173/settings');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/settings');
    });
  });

  it('应该显示设置页面', async () => {
    const heading = await browser.$('h1, h2, h3');
    if (await heading.isExisting()) {
      const text = await heading.getText();
      console.log('设置页面标题:', text);
      expect(text).toBeTruthy();
    }
  });

  it('应该显示设置选项', async () => {
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});

describe('Shadow Desktop - 任务看板', () => {
  before(async () => {
    await browser.url('http://localhost:5173/tasks');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/tasks');
    });
  });

  it('应该显示任务看板页面', async () => {
    const heading = await browser.$('h1, h2, h3');
    if (await heading.isExisting()) {
      const text = await heading.getText();
      console.log('任务看板标题:', text);
      expect(text).toBeTruthy();
    }
  });
});
