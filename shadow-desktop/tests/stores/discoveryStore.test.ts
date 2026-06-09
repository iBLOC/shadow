import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDiscoveryStore } from '../../src/stores/discoveryStore';
import type { DiscoveredDevice } from '../../src/lib/discoveryClient';

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    healthCheck: vi.fn().mockResolvedValue(true),
  },
}));

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

const STORAGE_KEY = 'shadow-discovery';

function getPersistedState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

describe('DiscoveryStore', () => {
  beforeEach(() => {
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
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.healthCheck).mockRejectedValueOnce(new Error('Network error'));
      
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
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.healthCheck).mockRejectedValueOnce(new Error('Failed'));
      
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