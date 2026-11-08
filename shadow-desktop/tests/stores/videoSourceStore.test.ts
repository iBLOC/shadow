import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';

const mockListVideoSources = vi.fn();
const mockPutVideoSources = vi.fn();

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
    listVideoSources: (...args: unknown[]) => mockListVideoSources(...args),
    putVideoSources: (...args: unknown[]) => mockPutVideoSources(...args),
  },
}));

import { useVideoSourceStore } from '../../src/stores/videoSourceStore';

/**
 * ⚠️ **失败长得像成功**（这一族）—— 以前 `pushToTelencephalon` 末尾是
 * `.catch(() => {})` ⇒ ⇒ PUT 失败（401 / 422 / 网络）被吞掉 ⇒ ⇒ `sync` 仍是
 * `'idle'` ⇒ ⇒ `VideoSourcesCard` 的徽章显示**「已同步」** ⇒ ⇒
 * **界面与端脑说的不是一回事**。
 *
 * ⇒ ⇒ 现在：失败 ⇒ ⇒ `sync = 'stale'` ⇒ ⇒ 徽章如实说「未同步」＋记下原因。
 */
describe('videoSourceStore 的推送', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useVideoSourceStore.setState({
      catalog: new Map(),
      activeId: null,
      available: new Map([['dev-1', { deviceId: 'dev-1', label: 'Cam 1' }]]),
      sync: 'idle',
      syncError: undefined,
    });
    mockListVideoSources.mockResolvedValue({ sources: [], activeId: null });
    mockPutVideoSources.mockResolvedValue({});
  });

  it('推送失败 ⇒ sync 变 stale，**不许**留在 idle（＝界面说「已同步」）', async () => {
    mockPutVideoSources.mockRejectedValue(new Error('HTTP 422: Unprocessable Entity'));

    await useVideoSourceStore.getState().addFromAvailable('dev-1');

    await waitFor(() => {
      expect(useVideoSourceStore.getState().sync).toBe('stale');
    });
    // ⚠️ 原因**也要在**（现场证据）
    expect(useVideoSourceStore.getState().syncError).toContain('HTTP 422');
  });

  it('孪生：推送成功 ⇒ sync 留在 idle（徽章「已同步」是真的）', async () => {
    mockPutVideoSources.mockResolvedValue({});

    await useVideoSourceStore.getState().addFromAvailable('dev-1');

    await waitFor(() => {
      expect(useVideoSourceStore.getState().sync).toBe('idle');
    });
    expect(useVideoSourceStore.getState().syncError).toBeUndefined();
    expect(mockPutVideoSources).toHaveBeenCalledTimes(1);
  });
});