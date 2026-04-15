import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MCPServer, MCPTool, MCPResource } from '../types';

interface MCPState {
  servers: MCPServer[];
  activeTools: MCPTool[];
  resources: MCPResource[];
  addServer: (server: MCPServer) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<MCPServer>) => void;
  setTools: (tools: MCPTool[]) => void;
  setResources: (resources: MCPResource[]) => void;
}

export const useMCPStore = create<MCPState>()(
  persist(
    (set) => ({
      servers: [],
      activeTools: [],
      resources: [],
      addServer: (server) => set((state) => ({ 
        servers: [...state.servers, server] 
      })),
      removeServer: (id) => set((state) => ({ 
        servers: state.servers.filter(s => s.id !== id) 
      })),
      updateServer: (id, updates) => set((state) => ({
        servers: state.servers.map(s => 
          s.id === id ? { ...s, ...updates } : s
        )
      })),
      setTools: (tools) => set({ activeTools: tools }),
      setResources: (resources) => set({ resources }),
    }),
    {
      name: 'prefrontal-mcp-storage',
    }
  )
);
