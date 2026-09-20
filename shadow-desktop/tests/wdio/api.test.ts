import { browser, expect } from '@wdio/globals';

const CORTEX_URL = 'http://localhost:60080';

describe('Shadow Desktop - Cortex API', () => {
  it('应该检查 Cortex 健康状态', async () => {
    await browser.url(`${CORTEX_URL}/health`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('neuron');
  });

  it('应该获取智能体列表', async () => {
    await browser.url(`${CORTEX_URL}/api/cortex/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('lobes');
  });

  it('应该创建对话', async () => {
    await browser.url(`${CORTEX_URL}/shadow/v1/conversations`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该获取供应商列表', async () => {
    await browser.url(`${CORTEX_URL}/models/providers`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});
