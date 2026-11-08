import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const { mockSafeInvoke, mockHealth } = vi.hoisted(() => ({
  mockSafeInvoke: vi.fn(),
  mockHealth: vi.fn(),
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
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

// ⚠️⚠️ 修法：stub localStorage 的**安装**放进 beforeEach、**还原**放进 afterEach。
//   原因：原生 `Object.defineProperty` **不受** `vi.unstubAllGlobals` 保护
//   ⇒ ⇒ 装在文件头的 stub 会**泄漏给后续文件**
//   ⇒ ⇒ 后续受害者从 stub 读到 `undefined`（而不是 `null`）⇒ ⇒ 飘红。
const __origLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function __installMockLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', { value: storageStub, writable: true, configurable: true });
}
function __restoreLocalStorage() {
  if (__origLocalStorage) Object.defineProperty(globalThis, 'localStorage', __origLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

afterEach(() => {
  __restoreLocalStorage();
});

describe('telencephalonStore — encephalon-backed supervisor mapping', () => {
  beforeEach(() => {
    __installMockLocalStorage();
    mockSafeInvoke.mockReset();
    mockHealth.mockReset();
    mockHealth.mockResolvedValue({ id: 'telencephalon-test' });
  });

  it('starts with supervisor enabled and restart_count 0', async () => {
    const { useTelencephalonStore } = await import('../../src/stores/telencephalonStore');
    const state = useTelencephalonStore.getState();
    expect(state.supervisor.enabled).toBe(true);
    expect(state.supervisor.restartCount).toBe(0);
  });

  it('refreshStatus maps encephalon_status.telencephalon_attached → supervisor.enabled', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'telencephalon-test' });
    mockSafeInvoke.mockResolvedValueOnce({
      bus_receivers: 1,
      thalamus_sensor_count: 0,
      thalamus_sensors: [],
      thalamus_video_cameras: 0,
      telencephalon_attached: false,
    });
    const { useTelencephalonStore } = await import('../../src/stores/telencephalonStore');
    await useTelencephalonStore.getState().refreshStatus();
    const sup = useTelencephalonStore.getState().supervisor;
    expect(sup.enabled).toBe(false);
    expect(mockSafeInvoke).toHaveBeenCalledWith('encephalon_status');
  });

  it('refreshStatus keeps previous supervisor state when telencephalon is attached', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'telencephalon-test' });
    mockSafeInvoke.mockResolvedValueOnce({
      bus_receivers: 2,
      thalamus_sensor_count: 3,
      thalamus_sensors: ['mic', 'camera'],
      thalamus_video_cameras: 1,
      telencephalon_attached: true,
    });
    const { useTelencephalonStore } = await import('../../src/stores/telencephalonStore');
    await useTelencephalonStore.getState().refreshStatus();
    const sup = useTelencephalonStore.getState().supervisor;
    expect(sup.enabled).toBe(true);
    expect(mockSafeInvoke).toHaveBeenCalledWith('encephalon_status');
  });

  it('refreshStatus tolerates Tauri unavailable (web build) — keeps previous state', async () => {
    mockHealth.mockResolvedValueOnce({ id: 'telencephalon-test' });
    mockSafeInvoke.mockResolvedValueOnce(null);
    const { useTelencephalonStore } = await import('../../src/stores/telencephalonStore');
    useTelencephalonStore.setState({
      supervisor: { enabled: true, restartCount: 0 },
    });
    await useTelencephalonStore.getState().refreshStatus();
    const sup = useTelencephalonStore.getState().supervisor;
    expect(sup.enabled).toBe(true);
    expect(sup.restartCount).toBe(0);
  });
});
