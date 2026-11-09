import { expect } from '@wdio/globals';
import { brainGet } from '../support/brain-api';

describe('Shadow Desktop - 端脑 API', () => {
  it('应该检查端脑健康状态', async () => {
    // ⚠️ **探的是公开健康面 `/healthz`** —— `/health` 在**读门后** ⇒ ⇒ 403
    //   ⇒ ⇒ 而 403 的响应体是**空的** ⇒ ⇒ 「body 含 neuron」这种断言**永远不成立**
    //   ⇒ ⇒ 真机实测（2026-11-09）：`/healthz` → 200
    //   ⇒ ⇒ `{"status":"healthy","encephalon":"running",…}`。
    const res = await brainGet('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toContain('healthy');
  });

  it('应该获取智能体列表', async () => {
    const res = await brainGet('/api/telencephalon/agents');
    expect(res.status).toBe(200);
    expect(res.body).toContain('lobes');
  });

  it('应该列出对话', async () => {
    // ⚠️ 断言**状态码 + JSON 形状**，不是「body 非空」⇒ ⇒ 404/401 的错误页也非空
    const res = await brainGet('/shadow/v1/conversations');
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('应该获取供应商列表', async () => {
    const res = await brainGet('/models/providers');
    expect(res.status).toBe(200);
    expect(res.body).toContain('provider_type');
  });
});