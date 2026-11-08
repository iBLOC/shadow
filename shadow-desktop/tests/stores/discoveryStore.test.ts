import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDiscoveryStore } from '../../src/stores/discoveryStore';
import type { DiscoveredDevice } from '../../src/lib/discoveryClient';

const mockSafeInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// ⚠️⚠️ 修法：mock localStorage 的**安装**放进 beforeEach、**还原**放进 afterEach。
//   原因：原生 `Object.defineProperty` **不受** `vi.unstubAllGlobals` 保护
//   ⇒ ⇒ 装在文件头的 mock 会**泄漏给后续文件**
//   ⇒ ⇒ 后续受害者从 mock 读到 `undefined`（而不是 `null`）⇒ ⇒ 飘红。
const __origLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function __installMockLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}
function __restoreLocalStorage() {
  if (__origLocalStorage) Object.defineProperty(globalThis, 'localStorage', __origLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

const STORAGE_KEY = 'shadow-discovery';

function getPersistedState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

describe('DiscoveryStore', () => {
  beforeEach(() => {
    __installMockLocalStorage();
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    
    useDiscoveryStore.setState({
      devices: [],
      activeNode: null,
      isScanning: false,
      lastScan: null,
      error: null,
    });
  });

  afterEach(() => {
    __restoreLocalStorage();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('starts with empty devices', () => {
      const state = useDiscoveryStore.getState();
      expect(state.devices).toEqual([]);
      expect(state.activeNode).toBeNull();
      expect(state.isScanning).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('startScan', () => {
    it('sets isScanning to true', async () => {
      const { startScan } = useDiscoveryStore.getState();
      
      const promise = startScan();
      
      const stateDuring = useDiscoveryStore.getState();
      expect(stateDuring.isScanning).toBe(true);
      
      await promise;
      
      const stateAfter = useDiscoveryStore.getState();
      expect(stateAfter.isScanning).toBe(false);
      expect(stateAfter.lastScan).toBeInstanceOf(Date);
    });

    it('sets error on failure', async () => {
      mockSafeInvoke.mockRejectedValueOnce(new Error('Network error'));

      const { startScan } = useDiscoveryStore.getState();
      await startScan();

      const state = useDiscoveryStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isScanning).toBe(false);
    });
  });

  describe('stopScan', () => {
    it('sets isScanning to false', async () => {
      useDiscoveryStore.setState({ isScanning: true });
      
      const { stopScan } = useDiscoveryStore.getState();
      await stopScan();
      
      const state = useDiscoveryStore.getState();
      expect(state.isScanning).toBe(false);
    });
  });

  describe('refreshDevices', () => {
    it('updates lastScan on success', async () => {
      const { refreshDevices } = useDiscoveryStore.getState();
      await refreshDevices();
      
      const state = useDiscoveryStore.getState();
      expect(state.lastScan).toBeInstanceOf(Date);
    });

    it('sets error on failure', async () => {
      mockSafeInvoke.mockRejectedValueOnce(new Error('Failed'));

      const { refreshDevices } = useDiscoveryStore.getState();
      await refreshDevices();

      const state = useDiscoveryStore.getState();
      expect(state.error).toBe('Failed');
    });
  });

  describe('setActiveNode', () => {
    it('updates activeNode', () => {
      const device: DiscoveredDevice = {
        id: 'device-1',
        name: 'Test Device',
        type: 'agent',
        capabilities: ['llm'],
        host: 'localhost',
        port: 8082,
        lastSeen: new Date().toISOString(),
      };
      
      const { setActiveNode } = useDiscoveryStore.getState();
      setActiveNode(device);
      
      const state = useDiscoveryStore.getState();
      expect(state.activeNode).toEqual(device);
    });

    it('writes active node id to localStorage', () => {
      const device: DiscoveredDevice = {
        id: 'device-1',
        name: 'Test Device',
        type: 'agent',
        capabilities: ['llm'],
        host: 'localhost',
        port: 8082,
        lastSeen: new Date().toISOString(),
      };
      
      const { setActiveNode } = useDiscoveryStore.getState();
      setActiveNode(device);
      
      expect(localStorage.setItem).toHaveBeenCalledWith('shadow-active-node', 'device-1');
    });

    it('removes from localStorage when null', () => {
      useDiscoveryStore.setState({ 
        activeNode: { 
          id: 'device-1', 
          name: 'Test',
          type: 'agent',
          capabilities: [],
          host: 'localhost',
          port: 8082,
          lastSeen: new Date().toISOString(),
        } 
      });
      
      const { setActiveNode } = useDiscoveryStore.getState();
      setActiveNode(null);
      
      expect(localStorage.removeItem).toHaveBeenCalledWith('shadow-active-node');
    });
  });

  describe('addManualDevice', () => {
    it('adds device with generated id and timestamp', () => {
      const { addManualDevice } = useDiscoveryStore.getState();
      
      addManualDevice({
        name: 'Manual Device',
        type: 'agent',
        capabilities: ['llm'],
        host: '192.168.1.100',
        port: 8082,
      });
      
      const state = useDiscoveryStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].name).toBe('Manual Device');
      expect(state.devices[0].id).toBeDefined();
      expect(state.devices[0].lastSeen).toBeDefined();
    });
  });

  describe('removeDevice', () => {
    it('removes device by id', () => {
      useDiscoveryStore.setState({
        devices: [
          {
            id: 'device-1',
            name: 'Device 1',
            type: 'agent',
            capabilities: [],
            host: 'localhost',
            port: 8082,
            lastSeen: new Date().toISOString(),
          },
        ],
      });
      
      const { removeDevice } = useDiscoveryStore.getState();
      removeDevice('device-1');
      
      const state = useDiscoveryStore.getState();
      expect(state.devices).toHaveLength(0);
    });

    it('clears activeNode if removed device was active', () => {
      const device: DiscoveredDevice = {
        id: 'device-1',
        name: 'Device 1',
        type: 'agent',
        capabilities: [],
        host: 'localhost',
        port: 8082,
        lastSeen: new Date().toISOString(),
      };
      
      useDiscoveryStore.setState({
        devices: [device],
        activeNode: device,
      });
      
      const { removeDevice } = useDiscoveryStore.getState();
      removeDevice('device-1');
      
      const state = useDiscoveryStore.getState();
      expect(state.activeNode).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears error message', () => {
      useDiscoveryStore.setState({ error: 'Some error' });
      
      const { clearError } = useDiscoveryStore.getState();
      clearError();
      
      const state = useDiscoveryStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('persistence', () => {
    it('stores preserve devices in state', () => {
      const { addManualDevice } = useDiscoveryStore.getState();
      
      addManualDevice({
        name: 'Persisted Device',
        type: 'agent',
        capabilities: ['llm'],
        host: 'localhost',
        port: 8082,
      });
      
      const state = useDiscoveryStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].name).toBe('Persisted Device');
    });
  });
});