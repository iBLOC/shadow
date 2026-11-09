import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
beforeEach(() => {
  // 每个测试前重装（afterEach 清过 ⇒ ⇒ 这里补回来）
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});


/**
 * memoryStore 的行为测试。
 *
 * store 本身不含地址 —— 读写全部经由 `lib/hippocampusClient.ts` 打到端脑
 * 里嵌着的海马体（`{端脑}/hippocampus/api/*`）。所以这里 mock 掉 `fetch`，
 * 断言的是「store 真的走了海马体端点」以及「失败时状态是干净的」。
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const errorResponse = () => ({
  ok: false,
  status: 500,
  statusText: 'Internal Server Error',
  json: () => Promise.resolve({}),
  text: () => Promise.resolve('boom'),
});

const wireMemory = {
  id: 'mem-1',
  uri: 'memory://123',
  content: 'likes dark mode',
  dimension: 'Agent',
  layer: 'L2Detail',
  session_id: null,
  tenant_id: 'default',
  created_at: '2026-10-29T01:02:03Z',
  updated_at: '2026-10-29T01:02:04Z',
};

describe('memoryStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts with empty memories array', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { memories } = useMemoryStore.getState();
    expect(memories).toEqual([]);
  });

  it('starts with empty searchResults', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { searchResults } = useMemoryStore.getState();
    expect(searchResults).toEqual([]);
  });

  it('starts with isLoading false', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { isLoading } = useMemoryStore.getState();
    expect(isLoading).toBe(false);
  });

  it('starts with null error', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { error } = useMemoryStore.getState();
    expect(error).toBeNull();
  });

  it('starts with null currentSessionId', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { currentSessionId } = useMemoryStore.getState();
    expect(currentSessionId).toBeNull();
  });

  it('不再持有自己的 apiBase —— 地址只来自端脑运行时配置', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    expect(useMemoryStore.getState()).not.toHaveProperty('apiBase');
    expect(useMemoryStore.getState()).not.toHaveProperty('setApiBase');
  });

  it('fetchMemories 走 GET /hippocampus/api/memory 并映射成 UI 形状', async () => {
    mockFetch.mockResolvedValue(jsonResponse([wireMemory]));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().fetchMemories();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory');
    expect(init.method).toBe('GET');

    const { memories, isLoading, error } = useMemoryStore.getState();
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('mem-1');
    expect(memories[0].layer).toBe('L2');
    expect(memories[0].createdAt).toBeInstanceOf(Date);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('fetchMemories 带维度时用小写查询参数', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().fetchMemories('Agent');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('dimension=agent');
  });

  it('searchMemories 走 POST /hippocampus/api/search', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([{ memory: wireMemory, score: 0.9, source: 'Vector' }])
    );
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().searchMemories('coffee');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ query: 'coffee' });

    const { searchResults, hasSearched } = useMemoryStore.getState();
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].memory.content).toBe('likes dark mode');
    expect(hasSearched).toBe(true);
  });

  it('空查询清掉搜索态（回到完整列表）', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().searchMemories('   ');

    const { searchResults, hasSearched } = useMemoryStore.getState();
    expect(searchResults).toEqual([]);
    expect(hasSearched).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('addMemory 先写后端再进本地列表', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireMemory));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().addMemory({
      content: 'likes dark mode',
      dimension: 'Agent',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).dimension).toBe('agent');

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('mem-1');
  });

  it('addMemory 带当前会话 id', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireMemory));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    useMemoryStore.getState().setSession('session-77');
    await useMemoryStore.getState().addMemory({
      content: 'x',
      dimension: 'Agent',
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body).sessionId).toBe('session-77');
  });

  it('removeMemory 走后端并从本地移除', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    mockFetch.mockResolvedValueOnce(jsonResponse([wireMemory]));
    await useMemoryStore.getState().fetchMemories();
    expect(useMemoryStore.getState().memories).toHaveLength(1);

    await useMemoryStore.getState().removeMemory('mem-1');

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('DELETE');
    expect(useMemoryStore.getState().memories).toHaveLength(0);
  });

  it('updateMemory 走后端并替换本地那一条', async () => {
    mockFetch.mockResolvedValue(jsonResponse([wireMemory]));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().fetchMemories();

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...wireMemory, content: 'Updated' })
    );
    await useMemoryStore.getState().updateMemory('mem-1', { content: 'Updated' });

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ content: 'Updated' });

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('Updated');
  });

  it('后端失败时把错误放进 error，并且不改本地数据', async () => {
    mockFetch.mockResolvedValue(errorResponse());
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().addMemory({
      content: 'x',
      dimension: 'Agent',
    });

    const { memories, error, isLoading } = useMemoryStore.getState();
    expect(memories).toHaveLength(0);
    expect(error).toContain('500');
    expect(isLoading).toBe(false);
  });

  it('setSession updates session id', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { setSession } = useMemoryStore.getState();

    setSession('session-123');

    const { currentSessionId } = useMemoryStore.getState();
    expect(currentSessionId).toBe('session-123');
  });

  it('setPersona 换人格 = 换海马体租户', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { useMemoryStore } = await import('../../stores/memoryStore');

    useMemoryStore.getState().setPersona('persona-ada');
    await useMemoryStore.getState().fetchMemories();

    expect(useMemoryStore.getState().personaId).toBe('persona-ada');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('tenantId=persona-ada');
  });

  it('clearError clears error state', async () => {
    mockFetch.mockResolvedValue(errorResponse());
    const { useMemoryStore } = await import('../../stores/memoryStore');

    await useMemoryStore.getState().fetchMemories();
    expect(useMemoryStore.getState().error).not.toBeNull();

    useMemoryStore.getState().clearError();
    expect(useMemoryStore.getState().error).toBeNull();
  });
});
