import { browser, expect } from '@wdio/globals';
import '../wdio-hooks';

const TELENCEPHALON_URL = 'http://localhost:60080';

describe('Shadow Desktop - 端脑 API (Tauri Wdio)', () => {
  it('应该检查端脑健康状态', async () => {
    await browser.url(`${TELENCEPHALON_URL}/health`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('neuron');
  });

  it('应该获取智能体列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('lobes');
  });

  it('应该创建对话', async () => {
    await browser.url(`${TELENCEPHALON_URL}/shadow/v1/conversations`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该获取供应商列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/models/providers`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});