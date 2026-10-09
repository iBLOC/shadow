import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSafeInvoke, mockHealth } = vi.hoisted(() => ({
  mockSafeInvoke: vi.fn(),
  mockHealth: vi.fn(),
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

vi.mock('../../src/lib/cortexClient', () => ({
  cortexClient: {
    health: (...args: unknown[]) => mockHealth(...args),
    listAgents: vi.fn().mockRejectedValue(new Error('not used')),
  },
}));

// zustand persist middleware touches localStorage — provide a stub.
const storageStub = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  };
})();

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: storageStub, writable: true });
}

describe('cortexStore — encephalon-backed supervisor mapping', () => {
  beforeEach(() => {
    mockSafeInvoke.mockReset();
    mockHealth.mockReset();
    mockHealth.mockResolvedValue({ id: 'cortex-test' });
  });

  it('starts with supervisor enabled and restart_count 0', async () => {
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    const state = useCortexStore.getState();
    expect(state.supervisor.enabled).toBe(true);
    expect(state.supervisor.restartCount).toBe(0);
  });

  it('refreshStatus maps encephalon_status.telencephalon_attached → supervisor.enabled', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'cortex-test' });
    mockSafeInvoke.mockResolvedValueOnce({
      bus_receivers: 1,
      thalamus_sensor_count: 0,
      thalamus_sensors: [],
      thalamus_video_cameras: 0,
      telencephalon_attached: false,
    });
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    await useCortexStore.getState().refreshStatus();
    const sup = useCortexStore.getState().supervisor;
    expect(sup.enabled).toBe(false);
    expect(mockSafeInvoke).toHaveBeenCalledWith('encephalon_status');
  });

  it('refreshStatus keeps previous supervisor state when telencephalon is attached', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'cortex-test' });
    mockSafeInvoke.mockResolvedValueOnce({
      bus_receivers: 2,
      thalamus_sensor_count: 3,
      thalamus_sensors: ['mic', 'camera'],
      thalamus_video_cameras: 1,
      telencephalon_attached: true,
    });
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    await useCortexStore.getState().refreshStatus();
    const sup = useCortexStore.getState().supervisor;
    expect(sup.enabled).toBe(true);
    expect(mockSafeInvoke).toHaveBeenCalledWith('encephalon_status');
  });

  it('refreshStatus tolerates Tauri unavailable (web build) — keeps previous state', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'cortex-test' });
    mockSafeInvoke.mockResolvedValueOnce(null);
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    useCortexStore.setState({
      supervisor: { enabled: true, restartCount: 0 },
    });
    await useCortexStore.getState().refreshStatus();
    const sup = useCortexStore.getState().supervisor;
    expect(sup.enabled).toBe(true);
    expect(sup.restartCount).toBe(0);
  });
});
