import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Memory, SearchResult } from '../types';
import { hippocampusClient } from '../lib/hippocampusClient';

/** 新增记忆时调用方能给的东西（其余字段由服务端生成）。 */
export interface NewMemoryInput {
  content: string;
  dimension: Memory['dimension'];
  /** 默认用 store 里的 `currentSessionId`。 */
  sessionId?: string;
}

/** 更新记忆时能改的字段 —— 与海马体 `UpdateMemoryRequest` 对齐（只有这两个）。 */
export interface MemoryPatch {
  content?: string;
  dimension?: Memory['dimension'];
}

interface MemoryState {
  memories: Memory[];
  searchResults: SearchResult[];
  /** 是否已经执行过一次搜索 —— 用来区分「搜索到 0 条」和「还没搜」。 */
  hasSearched: boolean;
  isLoading: boolean;
  error: string | null;
  currentSessionId: string | null;
  /**
   * 当前人格 / 租户 id —— `null` = 海马体的默认租户 `"default"`。
   *
   * 它决定「这个助理的记忆」在海马体里的哪一份：将来一个海马体承载多个
   * 灵魂（家庭里只部署一个海马体、每人各有一个助理）时，各助理用各自的
   * tenant id，同一份数据里互不串味，**不用改海马体 schema**。
   */
  personaId: string | null;
  addMemory: (input: NewMemoryInput) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  updateMemory: (id: string, patch: MemoryPatch) => Promise<void>;
  searchMemories: (query: string, limit?: number) => Promise<void>;
  fetchMemories: (dimension?: Memory['dimension']) => Promise<void>;
  setSession: (sessionId: string) => void;
  setPersona: (personaId: string | null) => void;
  clearError: () => void;
}

const toMessage = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

/**
 * 记忆 store。
 *
 * ## 数据从哪来
 *
 * 全部走 **端脑里嵌着的海马体**（`{端脑}/hippocampus/api/*`），细节见
 * `lib/hippocampusClient.ts`。这个 store **不再持有自己的 base URL** ——
 * 地址统一取 `useTelencephalonStore.connection.baseUrl`，避免两个真相源
 * 各自漂移（之前这里硬编码 `http://localhost:8081`，而桌面端根本没有
 * 独立的海马体进程，那个地址从来就不通）。
 *
 * ## 语义变化（相对旧版）
 *
 * - `addMemory` / `removeMemory` / `updateMemory` 以前是**纯本地**操作
 *   （改了 store 数组就完事），现在会**先写后端再更新本地**，失败时
 *   保留原状态并把错误放进 `error`。
 * - `searchMemories` 不再接受 `dimension` —— 海马体的搜索端点
 *   （`POST /api/search`）只吃 `query/limit/minScore/tenantId`；维度过滤
 *   改走 `fetchMemories(dimension)`（`GET /api/memory?dimension=`）。
 */
export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      searchResults: [],
      hasSearched: false,
      isLoading: false,
      error: null,
      currentSessionId: null,
      personaId: null,

      addMemory: async (input) => {
        set({ isLoading: true, error: null });
        try {
          const memory = await hippocampusClient.addMemory({
            uri: `memory://${Date.now()}`,
            content: input.content,
            dimension: input.dimension,
            sessionId: input.sessionId ?? get().currentSessionId ?? undefined,
          });
          set((state) => ({
            memories: [memory, ...state.memories],
            isLoading: false,
          }));
        } catch (e) {
          set({
            error: toMessage(e, 'Failed to add memory'),
            isLoading: false,
          });
        }
      },

      removeMemory: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await hippocampusClient.deleteMemory(id);
          set((state) => ({
            memories: state.memories.filter((m) => m.id !== id),
            searchResults: state.searchResults.filter(
              (r) => r.memory.id !== id
            ),
            isLoading: false,
          }));
        } catch (e) {
          set({
            error: toMessage(e, 'Failed to delete memory'),
            isLoading: false,
          });
        }
      },

      updateMemory: async (id, patch) => {
        set({ isLoading: true, error: null });
        try {
          const memory = await hippocampusClient.updateMemory(id, patch);
          set((state) => ({
            memories: state.memories.map((m) => (m.id === id ? memory : m)),
            searchResults: state.searchResults.map((r) =>
              r.memory.id === id ? { ...r, memory } : r
            ),
            isLoading: false,
          }));
        } catch (e) {
          set({
            error: toMessage(e, 'Failed to update memory'),
            isLoading: false,
          });
        }
      },

      searchMemories: async (query, limit = 10) => {
        const trimmed = query.trim();
        if (!trimmed) {
          // 空查询 = 清掉搜索态，回落到完整列表。
          set({ searchResults: [], hasSearched: false, error: null });
          return;
        }
        set({ isLoading: true, error: null });
        try {
          const searchResults = await hippocampusClient.searchMemories(
            trimmed,
            limit
          );
          set({ searchResults, hasSearched: true, isLoading: false });
        } catch (e) {
          set({
            error: toMessage(e, 'Search failed'),
            isLoading: false,
          });
        }
      },

      fetchMemories: async (dimension) => {
        set({ isLoading: true, error: null });
        try {
          const memories = await hippocampusClient.listMemories(
            dimension ? { dimension } : {}
          );
          set({ memories, isLoading: false });
        } catch (e) {
          set({
            error: toMessage(e, 'Failed to fetch memories'),
            isLoading: false,
          });
        }
      },

      setSession: (sessionId) => set({ currentSessionId: sessionId }),

      // 人格 id 同时也是海马体的租户 —— 改它就等于换一副「灵魂的记忆」。
      setPersona: (personaId) => {
        hippocampusClient.setTenantId(personaId);
        set({ personaId });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'shadow-memory-storage',
      // 只持久化「当前会话」和「当前人格」—— 记忆本体在海马体里，不该在
      // localStorage 存第二份（以前持久化的 `apiBase` 指向一个不存在的
      // 服务，已移除）。
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
        personaId: state.personaId,
      }),
      // 持久化的人格要同步给 client —— 否则重开应用后 store 记得是谁，
      // 海马体那边却还停在默认租户。
      onRehydrateStorage: () => (state) => {
        if (state) hippocampusClient.setTenantId(state.personaId);
      },
    }
  )
);
