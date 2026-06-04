import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiscoveredDevice } from '../lib/discoveryClient';
import { prefrontalClient } from '../lib/prefrontalClient';

interface DiscoveryState {
  devices: DiscoveredDevice[];
  activeNode: DiscoveredDevice | null;
  isScanning: boolean;
  lastScan: Date | null;
  error: string | null;

  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  setActiveNode: (device: DiscoveredDevice | null) => void;
  addManualDevice: (device: Omit<DiscoveredDevice, 'id' | 'lastSeen'>) => void;
  removeDevice: (id: string) => void;
  clearError: () => void;
}

const STORAGE_KEY = 'shadow-discovery';

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set) => ({
      devices: [],
      activeNode: null,
      isScanning: false,
      lastScan: null,
      error: null,

      startScan: async () => {
        set({ isScanning: true, error: null });
        try {
          await prefrontalClient.healthCheck();
          set({ lastScan: new Date() });
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : String(e),
          });
        } finally {
          set({ isScanning: false });
        }
      },

      stopScan: async () => {
        set({ isScanning: false, error: null });
      },

      refreshDevices: async () => {
        set({ error: null });
        try {
          await prefrontalClient.healthCheck();
          set({ lastScan: new Date() });
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      setActiveNode: (device: DiscoveredDevice | null) => {
        set({ activeNode: device });
        if (device) {
          localStorage.setItem('shadow-active-node', device.id);
        } else {
          localStorage.removeItem('shadow-active-node');
        }
      },

      addManualDevice: (deviceInput: Omit<DiscoveredDevice, 'id' | 'lastSeen'>) => {
        const device: DiscoveredDevice = {
          ...deviceInput,
          id: crypto.randomUUID(),
          lastSeen: new Date().toISOString(),
        };
        set((state) => ({
          devices: [...state.devices, device],
        }));
      },

      removeDevice: (id: string) => {
        set((state) => ({
          devices: state.devices.filter((d) => d.id !== id),
          activeNode: state.activeNode?.id === id ? null : state.activeNode,
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        devices: state.devices,
        activeNode: state.activeNode,
      }),
    }
  )
);