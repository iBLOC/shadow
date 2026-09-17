import { beforeEach, describe, it, vi, expect } from 'vitest';
import { useSubsystemStore } from '../../src/stores/subsystemStore';

vi.mock('../../src/lib/cortexClient', () => ({
  cortexClient: {
    thalamus: {
      listSensors: vi.fn().mockResolvedValue(['sensor1', 'sensor2']),
    },
    hippocampus: {
      stats: vi.fn().mockResolvedValue({ memory_count: 10, session_count: 5 }),
      recent: vi.fn().mockResolvedValue({ entries: [{ id: '1' }] }),
    },
    neure: {
      models: vi.fn().mockResolvedValue([{ model_id: 'gpt-4' }]),
    },
  },
}));

describe('subsystemStore', () => {
  beforeEach(() => {
    useSubsystemStore.setState({
      thalamusSensors: [],
      thalamusStats: {},
      hippocampusStats: null,
      hippocampusRecent: [],
      neureModels: [],
      lastPollAt: null,
    });
  });

  it('refreshAll populates state on success', async () => {
    const store = useSubsystemStore.getState();
    await store.refreshAll();

    const state = useSubsystemStore.getState();
    expect(state.thalamusSensors).toEqual(['sensor1', 'sensor2']);
    expect(state.hippocampusStats).toEqual({ memory_count: 10, session_count: 5 });
    expect(state.neureModels).toEqual([{ model_id: 'gpt-4' }]);
    expect(state.lastPollAt).toBeInstanceOf(Date);
  });

  it('refreshAll swallows errors', async () => {
    const { cortexClient } = await import('../../src/lib/cortexClient');
    vi.mocked(cortexClient.thalamus.listSensors).mockRejectedValueOnce(new Error('network error'));

    const store = useSubsystemStore.getState();
    await expect(store.refreshAll()).resolves.not.toThrow();

    const state = useSubsystemStore.getState();
    expect(state.thalamusSensors).toEqual([]);
  });

  it('startPolling polls on a 5s timer', () => {
    vi.useFakeTimers();
    const store = useSubsystemStore.getState();
    const clearSpy = vi.fn();

    vi.spyOn(global, 'setInterval').mockImplementation((callback: TimerHandler) => {
      return 1 as unknown as NodeJS.Timeout;
    });
    vi.spyOn(global, 'clearInterval').mockImplementation(clearSpy);

    const stop = store.startPolling();

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);

    stop();

    expect(clearInterval).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });
});
