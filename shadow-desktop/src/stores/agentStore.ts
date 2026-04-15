import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { Agent, AgentTask, OpenCodeInstance, OpenCodeConfig } from '../types';

interface AgentState {
  agents: Agent[];
  tasks: AgentTask[];
  activeAgentId: string | null;
  isLoading: boolean;
  error: string | null;
  // OpenCode management
  opencodeConfig: OpenCodeConfig;
  opencodeInstances: OpenCodeInstance[];
  opencodeInstalled: boolean;
  isLoadingOpenCode: boolean;
  fetchAgents: () => Promise<void>;
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  setActiveAgent: (id: string | null) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (id: string, updates: Partial<AgentTask>) => void;
  // OpenCode methods
  setOpenCodeConfig: (config: Partial<OpenCodeConfig>) => void;
  fetchOpenCodeInstances: () => Promise<void>;
  launchOpenCode: (port: number) => Promise<OpenCodeInstance>;
  stopOpenCode: (instanceId: string) => Promise<void>;
  checkOpenCodeInstalled: () => Promise<boolean>;
  installOpenCode: () => Promise<void>;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      agents: [],
      tasks: [],
      activeAgentId: null,
      isLoading: false,
      error: null,
      opencodeConfig: {
        port: 3000,
        autoLaunch: false,
        autoInstall: false,
      },
      opencodeInstances: [],
      opencodeInstalled: false,
      isLoadingOpenCode: false,
      fetchAgents: async () => {
        set({ isLoading: true, error: null });
        try {
          const agents = await invoke<Agent[]>('prefrontal_list_agents');
          set({ agents, isLoading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch', 
            isLoading: false 
          });
        }
      },
      addAgent: (agent) => set((state) => ({ 
        agents: [...state.agents, agent] 
      })),
      removeAgent: (id) => set((state) => ({ 
        agents: state.agents.filter(a => a.id !== id) 
      })),
      updateAgent: (id, updates) => set((state) => ({
        agents: state.agents.map(a => 
          a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a
        )
      })),
      setActiveAgent: (id) => set({ activeAgentId: id }),
      addTask: (task) => set((state) => ({ 
        tasks: [...state.tasks, task] 
      })),
      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === id ? { ...t, ...updates } : t
        )
      })),
      setOpenCodeConfig: (config) => set((state) => ({
        opencodeConfig: { ...state.opencodeConfig, ...config }
      })),
      fetchOpenCodeInstances: async () => {
        set({ isLoadingOpenCode: true });
        try {
          const instances = await invoke<OpenCodeInstance[]>('opencode_list_instances');
          set({ opencodeInstances: instances, isLoadingOpenCode: false });
        } catch (error) {
          console.error('Failed to fetch OpenCode instances:', error);
          set({ isLoadingOpenCode: false });
        }
      },
      launchOpenCode: async (port: number) => {
        set({ isLoadingOpenCode: true });
        try {
          const instance = await invoke<OpenCodeInstance>('opencode_launch', { port });
          set((state) => ({
            opencodeInstances: [...state.opencodeInstances, instance],
            isLoadingOpenCode: false
          }));
          return instance;
        } catch (error) {
          set({ isLoadingOpenCode: false });
          throw error;
        }
      },
      stopOpenCode: async (instanceId: string) => {
        set({ isLoadingOpenCode: true });
        try {
          await invoke('opencode_stop', { instanceId });
          set((state) => ({
            opencodeInstances: state.opencodeInstances.filter(i => i.id !== instanceId),
            isLoadingOpenCode: false
          }));
        } catch (error) {
          set({ isLoadingOpenCode: false });
          throw error;
        }
      },
      checkOpenCodeInstalled: async () => {
        try {
          const installed = await invoke<boolean>('opencode_check_installed');
          set({ opencodeInstalled: installed });
          return installed;
        } catch (error) {
          console.error('Failed to check OpenCode installation:', error);
          return false;
        }
      },
      installOpenCode: async () => {
        set({ isLoadingOpenCode: true });
        try {
          await invoke('opencode_install');
          set({ opencodeInstalled: true, isLoadingOpenCode: false });
        } catch (error) {
          set({ isLoadingOpenCode: false });
          throw error;
        }
      },
    }),
    {
      name: 'shadow-agent-storage',
      partialize: (state) => ({
        agents: state.agents,
        opencodeConfig: state.opencodeConfig,
      }),
    }
  )
);
