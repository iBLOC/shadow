import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListFlows = vi.fn();

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
    listFlows: (...args: unknown[]) => mockListFlows(...args),
    listAgents: vi.fn(),
    getBaseUrl: () => 'http://127.0.0.1:60080',
    getApiKey: () => undefined,
    setBaseUrl: vi.fn(),
    setApiKey: vi.fn(),
  },
}));

import { useTelencephalonStore } from '../../src/stores/telencephalonStore';

/**
 * ⚠️ **「读不到」≠「没有」** —— `refreshFlows` 以前是 `catch { }`（空 catch）
 * ⇒ ⇒ 读失败 ⇒ 列表空着、**连错误都不记** ⇒ ⇒ 界面说「没有流程」
 * ⇒ ⇒ 而同一个 store 的 `refreshLobes` / `checkHealth` 都是**记错误**的
 * ⇒ ⇒ ⇒ 这条钉住它与兄弟们同款。
 */
describe('telencephalonStore.refreshFlows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTelencephalonStore.setState({ flows: [], error: null });
  });

  it('读流程失败 ⇒ **记错误**（不许空 catch ⇒ 「读不到」被说成「没有」）', async () => {
    mockListFlows.mockRejectedValue(new Error('HTTP 500: boom'));

    await useTelencephalonStore.getState().refreshFlows();

    expect(useTelencephalonStore.getState().error).toContain('HTTP 500');
  });

  it('孪生：读到流程 ⇒ 列表落下**且**错误清空（两格必须分得开）', async () => {
    mockListFlows.mockResolvedValue([{ id: 'flow-1' }]);
    useTelencephalonStore.setState({ error: 'Previous error' });

    await useTelencephalonStore.getState().refreshFlows();

    expect(useTelencephalonStore.getState().flows).toEqual([{ id: 'flow-1' }]);
    expect(useTelencephalonStore.getState().error).toBeNull();
  });
});