import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeInvoke } from '../lib/tauriSafe';
import type { OpenCodeInstance, OpenCodeConfig } from '../types';

interface OpenCodeState {
  config: OpenCodeConfig;
  instances: OpenCodeInstance[];
  installed: boolean;
  isLoading: boolean;
  error: string | null;
  setConfig: (config: Partial<OpenCodeConfig>) => void;
  fetchInstances: () => Promise<void>;
  launch: (port: number) => Promise<OpenCodeInstance>;
  stop: (instanceId: string) => Promise<void>;
  checkInstalled: () => Promise<boolean>;
  install: () => Promise<void>;
}

export const useOpenCodeStore = create<OpenCodeState>()(
  persist(
    (set) => ({
      config: {
        port: 3000,
        autoLaunch: false,
        autoInstall: false,
      },
      instances: [],
      installed: false,
      isLoading: false,
      error: null,
      setConfig: (config) => set((state) => ({
        config: { ...state.config, ...config }
      })),
      fetchInstances: async () => {
        set({ isLoading: true, error: null });
        try {
          const instances = await safeInvoke<OpenCodeInstance[]>('opencode_list_instances');
          set({ instances: instances ?? [], isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch instances';
          console.error('Failed to fetch OpenCode instances:', error);
          set({ isLoading: false, error: message });
        }
      },
      launch: async (port: number): Promise<OpenCodeInstance> => {
        set({ isLoading: true, error: null });
        try {
          const instance = await safeInvoke<OpenCodeInstance>('opencode_launch', { port });
          if (!instance) throw new Error('opencode_launch returned null');
          set((state) => ({
            instances: [...state.instances, instance],
            isLoading: false
          }));
          return instance;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to launch';
          set({ isLoading: false, error: message });
          throw error;
        }
      },
      stop: async (instanceId: string) => {
        set({ isLoading: true, error: null });
        try {
          await safeInvoke('opencode_stop', { instanceId });
          set((state) => ({
            instances: state.instances.filter(i => i.id !== instanceId),
            isLoading: false
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to stop';
          set({ isLoading: false, error: message });
          throw error;
        }
      },
      checkInstalled: async (): Promise<boolean> => {
        try {
          const installed = await safeInvoke<boolean>('opencode_check_installed');
          const value = installed ?? false;
          set({ installed: value });
          return value;
        } catch (error) {
          console.error('Failed to check OpenCode installation:', error);
          return false;
        }
      },
      install: async () => {
        set({ isLoading: true, error: null });
        try {
          await safeInvoke('opencode_install');
          set({ installed: true, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to install';
          set({ isLoading: false, error: message });
          throw error;
        }
      },
    }),
    {
      name: 'shadow-opencode-storage',
      partialize: (state) => ({
        config: state.config,
        installed: state.installed,
      }),
    }
  )
);
