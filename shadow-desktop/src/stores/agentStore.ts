import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, AgentTask } from '../types';

interface AgentState {
  agents: Agent[];
  tasks: AgentTask[];
  activeAgentId: string | null;
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
      // ⚠️ **这里曾有一个 fetchAgents** —— 它打的是旧的 /api/agents（今天 404），
      // 而且它 set({ agents }) ⇒ ⇒ 会把**用户自建的 custom agents**（这个 store 是
      // 持久化的）**整份覆盖**成大脑的叶区列表 ⇒ ⇒ 那是一次**静默的数据覆盖**
      // ⇒ ⇒ 它没有调用方 ⇒ ⇒ 所以是**删掉**，不是「修好」——
      // ⇒ 大脑那一边的 agent 列表在 stores/telencephalonStore.ts 的 lobes 里
      // ⇒ ⇒ （GET /shadow/v1/agents，已在 scripts/client-endpoint-map.txt 里对齐）。
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
