import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMemoryStore } from '../../src/stores/memoryStore';

/**
 * 记忆 store 的行为。
 *
 * 记忆本体在**端脑里嵌着的海马体**（`{端脑}/hippocampus/api/*`），
 * 所以这里 mock 掉 `fetch`，断言的是「真的走了海马体端点」。
 * 端点细节另见 `src/lib/__tests__/hippocampusClient.test.ts`。
 */

/** 线上形状：snake_case 字段 + PascalCase dimension + 全名 layer。 */
const wireMemory = {
  id: 'mem-1',
  uri: 'memory://1',
  content: 'User prefers dark mode',
  dimension: 'Agent',
  layer: 'L2Detail',
  session_id: null,
  tenant_id: 'default',
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-01T10:00:00Z',
};

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const okJson = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

describe('MemoryStore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    useMemoryStore.getState().setPersona(null);
    useMemoryStore.setState({
      memories: [],
      searchResults: [],
      hasSearched: false,
      isLoading: false,
      error: null,
      currentSessionId: null,
      personaId: null,
    });
  });

  describe('initial state', () => {
    it('starts empty', () => {
      const state = useMemoryStore.getState();
      expect(state.memories).toEqual([]);
      expect(state.searchResults).toEqual([]);
      expect(state.hasSearched).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('不再持有自己的 apiBase —— 地址只来自端脑运行时配置', () => {
      expect(useMemoryStore.getState()).not.toHaveProperty('apiBase');
      expect(useMemoryStore.getState()).not.toHaveProperty('setApiBase');
    });
  });

  describe('addMemory', () => {
    it('POSTs 到海马体并把服务端返回的记忆放进列表', async () => {
      mockFetch.mockResolvedValueOnce(okJson(wireMemory));
      const { addMemory } = useMemoryStore.getState();

      await addMemory({ content: 'User prefers dark mode', dimension: 'Agent' });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/hippocampus/api/memory');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body).dimension).toBe('agent');

      const { memories } = useMemoryStore.getState();
      expect(memories).toHaveLength(1);
      expect(memories[0].id).toBe('mem-1');
      expect(memories[0].layer).toBe('L2');
    });

    it('写失败时保留原列表并记录错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('boom'),
      });
      const { addMemory } = useMemoryStore.getState();

      await addMemory({ content: 'x', dimension: 'Agent' });

      const { memories, error, isLoading } = useMemoryStore.getState();
      expect(memories).toHaveLength(0);
      expect(error).toContain('500');
      expect(isLoading).toBe(false);
    });
  });

  describe('removeMemory', () => {
    it('DELETEs 后端并从本地移除', async () => {
      mockFetch.mockResolvedValueOnce(okJson([wireMemory]));
      await useMemoryStore.getState().fetchMemories();

      mockFetch.mockResolvedValueOnce(okJson({ success: true }));
      await useMemoryStore.getState().removeMemory('mem-1');

      const [url, init] = mockFetch.mock.calls[1];
      expect(url).toContain('/hippocampus/api/memory/mem-1');
      expect(init.method).toBe('DELETE');
      expect(useMemoryStore.getState().memories).toHaveLength(0);
    });
  });

  describe('updateMemory', () => {
    it('PUTs 后端并替换本地那一条', async () => {
      mockFetch.mockResolvedValueOnce(okJson([wireMemory]));
      await useMemoryStore.getState().fetchMemories();

      mockFetch.mockResolvedValueOnce(
        okJson({ ...wireMemory, content: 'Updated content' })
      );
      await useMemoryStore.getState().updateMemory('mem-1', {
        content: 'Updated content',
      });

      const [, init] = mockFetch.mock.calls[1];
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({ content: 'Updated content' });

      const { memories } = useMemoryStore.getState();
      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('Updated content');
    });
  });

  describe('searchMemories', () => {
    it('POSTs 到 /hippocampus/api/search 并存下结果', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson([{ memory: wireMemory, score: 0.95, source: 'Vector' }])
      );
      const { searchMemories } = useMemoryStore.getState();

      await searchMemories('dark mode');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/hippocampus/api/search');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ query: 'dark mode', limit: 10 });

      const state = useMemoryStore.getState();
      expect(state.searchResults).toHaveLength(1);
      expect(state.hasSearched).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('uses default limit of 10 when not provided', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));
      await useMemoryStore.getState().searchMemories('test');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.limit).toBe(10);
    });

    it('respects custom limit', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));
      await useMemoryStore.getState().searchMemories('test', 25);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.limit).toBe(25);
    });

    it('空查询清掉搜索态', async () => {
      await useMemoryStore.getState().searchMemories('  ');

      const state = useMemoryStore.getState();
      expect(state.searchResults).toEqual([]);
      expect(state.hasSearched).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sets error when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('boom'),
      });
      await useMemoryStore.getState().searchMemories('test');

      const state = useMemoryStore.getState();
      expect(state.error).toContain('500');
      expect(state.isLoading).toBe(false);
    });

    it('sets error when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));
      await useMemoryStore.getState().searchMemories('test');

      const state = useMemoryStore.getState();
      expect(state.error).toBe('Network down');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('fetchMemories', () => {
    it('GETs 海马体并存下映射后的记忆', async () => {
      mockFetch.mockResolvedValueOnce(okJson([wireMemory]));
      const { fetchMemories } = useMemoryStore.getState();

      await fetchMemories();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/hippocampus/api/memory');
      const { memories } = useMemoryStore.getState();
      expect(memories).toHaveLength(1);
      expect(memories[0].createdAt).toBeInstanceOf(Date);
    });

    it('带维度时用小写查询参数', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));
      await useMemoryStore.getState().fetchMemories('Agent');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('dimension=agent');
    });

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('boom'),
      });
      await useMemoryStore.getState().fetchMemories();

      expect(useMemoryStore.getState().error).toContain('500');
    });
  });

  describe('setSession / setPersona / clearError', () => {
    it('setSession updates currentSessionId', () => {
      const { setSession } = useMemoryStore.getState();
      setSession('session-42');

      expect(useMemoryStore.getState().currentSessionId).toBe('session-42');
    });

    it('setPersona 换人格 = 换海马体租户', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));
      const { setPersona } = useMemoryStore.getState();
      setPersona('persona-ada');

      await useMemoryStore.getState().fetchMemories();

      expect(useMemoryStore.getState().personaId).toBe('persona-ada');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('tenantId=persona-ada');
    });

    it('clearError resets error to null', () => {
      useMemoryStore.setState({ error: 'Something failed' });
      const { clearError } = useMemoryStore.getState();

      clearError();

      expect(useMemoryStore.getState().error).toBeNull();
    });
  });
});
