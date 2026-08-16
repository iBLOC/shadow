import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

  it('starts with default apiBase', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { apiBase } = useMemoryStore.getState();
    expect(apiBase).toBe('http://localhost:8081');
  });

  it('addMemory adds memory to list', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { addMemory } = useMemoryStore.getState();

    addMemory({ id: 'mem-1', content: 'Test memory', createdAt: new Date() });

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('mem-1');
  });

  it('removeMemory removes memory by id', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { addMemory, removeMemory } = useMemoryStore.getState();

    addMemory({ id: 'mem-1', content: 'Test', createdAt: new Date() });
    removeMemory('mem-1');

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(0);
  });

  it('updateMemory updates memory fields', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { addMemory, updateMemory } = useMemoryStore.getState();

    addMemory({ id: 'mem-1', content: 'Test', createdAt: new Date() });
    updateMemory('mem-1', { content: 'Updated' });

    const { memories } = useMemoryStore.getState();
    expect(memories[0].content).toBe('Updated');
  });

  it('setApiBase updates api base', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { setApiBase } = useMemoryStore.getState();

    setApiBase('http://custom:8081');

    const { apiBase } = useMemoryStore.getState();
    expect(apiBase).toBe('http://custom:8081');
  });

  it('setSession updates session id', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { setSession } = useMemoryStore.getState();

    setSession('session-123');

    const { currentSessionId } = useMemoryStore.getState();
    expect(currentSessionId).toBe('session-123');
  });

  it('clearError clears error state', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { clearError } = useMemoryStore.getState();

    clearError();

    const { error } = useMemoryStore.getState();
    expect(error).toBeNull();
  });

  it('addMemory preserves existing memories', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { addMemory } = useMemoryStore.getState();

    addMemory({ id: 'mem-1', content: 'First', createdAt: new Date() });
    addMemory({ id: 'mem-2', content: 'Second', createdAt: new Date() });

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(2);
  });

  it('removeMemory preserves other memories', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { addMemory, removeMemory } = useMemoryStore.getState();

    addMemory({ id: 'mem-1', content: 'First', createdAt: new Date() });
    addMemory({ id: 'mem-2', content: 'Second', createdAt: new Date() });
    removeMemory('mem-1');

    const { memories } = useMemoryStore.getState();
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('mem-2');
  });

  it('searchMemories sets loading state', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { searchMemories } = useMemoryStore.getState();

    searchMemories('test');

    const { isLoading } = useMemoryStore.getState();
    expect(isLoading).toBe(true);
  });

  it('fetchMemories sets loading state', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { fetchMemories } = useMemoryStore.getState();

    fetchMemories();

    const { isLoading } = useMemoryStore.getState();
    expect(isLoading).toBe(true);
  });
});