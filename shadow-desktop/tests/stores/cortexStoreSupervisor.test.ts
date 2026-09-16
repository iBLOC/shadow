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

describe('cortexStore supervisor state', () => {
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

  it('setSupervision(false) updates enabled and persists to Tauri', async () => {
    mockSafeInvoke.mockResolvedValueOnce(false);
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    await useCortexStore.getState().setSupervision(false);
    expect(useCortexStore.getState().supervisor.enabled).toBe(false);
    expect(mockSafeInvoke).toHaveBeenCalledWith('cortex_set_supervision', { enabled: false });
  });

  it('refreshStatus pulls supervision_enabled + restart_count from cortex_status', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'cortex-test' });
    mockSafeInvoke.mockResolvedValueOnce({
      supervision_enabled: false,
      restart_count: 3,
    });
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    await useCortexStore.getState().refreshStatus();
    const sup = useCortexStore.getState().supervisor;
    expect(sup.enabled).toBe(false);
    expect(sup.restartCount).toBe(3);
  });

  it('refreshStatus tolerates Tauri unavailable (web build) — keeps previous state', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'cortex-test' });
    mockSafeInvoke.mockResolvedValueOnce(null);
    const { useCortexStore } = await import('../../src/stores/cortexStore');
    // Pin a known initial state before the refresh so the assertion
    // does not depend on whatever the previous test left behind.
    useCortexStore.setState({
      supervisor: { enabled: true, restartCount: 0 },
    });
    await useCortexStore.getState().refreshStatus();
    const sup = useCortexStore.getState().supervisor;
    expect(sup.enabled).toBe(true);
    expect(sup.restartCount).toBe(0);
  });
});