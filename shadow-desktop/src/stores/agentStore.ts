import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { prefrontalClient } from '../lib/prefrontalClient';
import type { Agent, AgentTask } from '../types';

interface AgentState {
  agents: Agent[];
  tasks: AgentTask[];
  activeAgentId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  setActiveAgent: (id: string | null) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (id: string, updates: Partial<AgentTask>) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      agents: [],
      tasks: [],
      activeAgentId: null,
      isLoading: false,
      error: null,
      fetchAgents: async () => {
        set({ isLoading: true, error: null });
        try {
          const pfAgents = await prefrontalClient.listAgents();
          const agents: Agent[] = pfAgents.map((a) => ({
            ...a,
            category: 'external' as const,
            status: 'online' as const,
            capabilities: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
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
    }),
    {
      name: 'shadow-agent-storage',
      partialize: (state) => ({
        agents: state.agents,
      }),
    }
  )
);
