import { browser, expect } from '@wdio/globals';

const CORTEX_URL = 'http://localhost:60080';

describe('Shadow Desktop - Cortex API', () => {
  it('应该检查 Cortex 健康状态', async () => {
    const response = await browser.executeAsync(async (url: string, done: Function) => {
      try {
        const res = await fetch(`${url}/health`);
        const data = await res.json();
        done(data);
      } catch (e) {
        done({ error: String(e) });
      }
    }, CORTEX_URL);
    
    console.log('Cortex health:', response);
    expect(response).toBeTruthy();
  });

  it('应该获取智能体列表', async () => {
    const response = await browser.executeAsync(async (url: string, done: Function) => {
      try {
        const res = await fetch(`${url}/api/cortex/agents`);
        const data = await res.json();
        done(data);
      } catch (e) {
        done({ error: String(e) });
      }
    }, CORTEX_URL);
    
    console.log('Agents:', JSON.stringify(response).substring(0, 200));
    expect(response).toBeTruthy();
  });

  it('应该创建对话', async () => {
    const response = await browser.executeAsync(async (url: string, done: Function) => {
      try {
        const res = await fetch(`${url}/shadow/v1/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        done(data);
      } catch (e) {
        done({ error: String(e) });
      }
    }, CORTEX_URL);
    
    console.log('Created conversation:', response);
    expect(response).toBeTruthy();
    expect(response.id).toBeTruthy();
  });

  it('应该获取供应商列表', async () => {
    const response = await browser.executeAsync(async (url: string, done: Function) => {
      try {
        const res = await fetch(`${url}/models/providers`);
        const data = await res.json();
        done(data);
      } catch (e) {
        done({ error: String(e) });
      }
    }, CORTEX_URL);
    
    console.log('Providers:', JSON.stringify(response).substring(0, 200));
    expect(response).toBeTruthy();
  });
});
