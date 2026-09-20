import { beforeEach, describe, it, vi, expect } from 'vitest';
import { useSubsystemStore } from '../../src/stores/subsystemStore';

vi.mock('../../src/lib/cortexClient', () => ({
  cortexClient: {
    thalamus: {
      listSensors: vi.fn().mockResolvedValue(['sensor1', 'sensor2']),
    },
    hippocampus: {
      stats: vi.fn().mockResolvedValue({ memory_count: 10, graph_node_count: 3, pending_consolidations: 5 }),
      recent: vi.fn().mockResolvedValue({ entries: [{ id: '1', uri: 'test://uri', content: 'test content', layer: 'L0', dimension: 'User', memory_type: 'fact', created_at: '2026-01-01', updated_at: '2026-01-01' }] }),
      consolidator: vi.fn().mockResolvedValue({ pending: 5, last_consolidated_id: 'uuid-123', last_run_at: '2026-01-01T00:00:00Z', last_status: 'success' }),
    },
    neuron: {
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
      consolidatorState: null,
      neuronModels: [],
      lastPollAt: null,
    });
  });

  it('refreshAll populates state on success', async () => {
    const store = useSubsystemStore.getState();
    await store.refreshAll();

    const state = useSubsystemStore.getState();
    expect(state.thalamusSensors).toEqual(['sensor1', 'sensor2']);
    expect(state.hippocampusStats).toEqual({ memory_count: 10, graph_node_count: 3, pending_consolidations: 5 });
    expect(state.consolidatorState).toEqual({ pending: 5, last_consolidated_id: 'uuid-123', last_run_at: '2026-01-01T00:00:00Z', last_status: 'success' });
    expect(state.neuronModels).toEqual([{ model_id: 'gpt-4' }]);
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
