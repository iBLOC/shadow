import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Memory, SearchResult } from '../types';

interface MemoryState {
  memories: Memory[];
  searchResults: SearchResult[];
  isLoading: boolean;
  error: string | null;
  currentSessionId: string | null;
  apiBase: string;
  addMemory: (memory: Memory) => void;
  removeMemory: (id: string) => void;
  updateMemory: (id: string, updates: Partial<Memory>) => void;
  searchMemories: (query: string, dimension?: string, limit?: number) => Promise<void>;
  fetchMemories: () => Promise<void>;
  setApiBase: (base: string) => void;
  setSession: (sessionId: string) => void;
  clearError: () => void;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      searchResults: [],
      isLoading: false,
      error: null,
      currentSessionId: null,
      apiBase: 'http://localhost:8081',
      addMemory: (memory) => set((state) => ({ 
        memories: [...state.memories, memory] 
      })),
      removeMemory: (id) => set((state) => ({ 
        memories: state.memories.filter(m => m.id !== id) 
      })),
      updateMemory: (id, updates) => set((state) => ({
        memories: state.memories.map(m => 
          m.id === id ? { ...m, ...updates } : m
        )
      })),
      searchMemories: async (query, dimension, limit = 10) => {
        set({ isLoading: true, error: null });
        try {
          const { apiBase } = get();
          const response = await fetch(`${apiBase}/memories/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, dimension, limit }),
          });
          if (!response.ok) throw new Error('Search failed');
          const results = await response.json();
          set({ searchResults: results, isLoading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Search failed', 
            isLoading: false 
          });
        }
      },
      fetchMemories: async () => {
        set({ isLoading: true, error: null });
        try {
          const { apiBase } = get();
          const response = await fetch(`${apiBase}/memories`);
          if (!response.ok) throw new Error('Failed to fetch memories');
          const memories = await response.json();
          set({ memories, isLoading: false });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch', 
            isLoading: false 
          });
        }
      },
      setApiBase: (base) => set({ apiBase: base }),
      setSession: (sessionId) => set({ currentSessionId: sessionId }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'shadow-memory-storage',
      partialize: (state) => ({ 
        apiBase: state.apiBase,
        currentSessionId: state.currentSessionId 
      }),
    }
  )
);
