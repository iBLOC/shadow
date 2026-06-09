import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMemoryStore } from '../../src/stores/memoryStore';
import type { Memory, SearchResult } from '../../src/types';

const sampleMemory: Memory = {
 id: 'mem-1',
 uri: 'memory://1',
 content: 'User prefers dark mode',
 dimension: 'User',
 layer: 'L1',
 createdAt: new Date('2024-01-01T10:00:00Z'),
 updatedAt: new Date('2024-01-01T10:00:00Z'),
};

const sampleResult: SearchResult = {
 memory: sampleMemory,
 score: 0.95,
 source: 'Vector',
};

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('MemoryStore', () => {
 beforeEach(() => {
 mockFetch.mockReset();
 localStorage.clear();
 useMemoryStore.setState({
 memories: [],
 searchResults: [],
 isLoading: false,
 error: null,
 currentSessionId: null,
 apiBase: 'http://localhost:8081',
 });
 });

 describe('initial state', () => {
 it('starts empty with default apiBase', () => {
 const state = useMemoryStore.getState();
 expect(state.memories).toEqual([]);
 expect(state.searchResults).toEqual([]);
 expect(state.isLoading).toBe(false);
 expect(state.error).toBeNull();
 expect(state.apiBase).toBe('http://localhost:8081');
 });
 });

 describe('addMemory', () => {
 it('appends memory to list', () => {
 const { addMemory } = useMemoryStore.getState();
 addMemory(sampleMemory);

 expect(useMemoryStore.getState().memories).toHaveLength(1);
 expect(useMemoryStore.getState().memories[0]).toEqual(sampleMemory);
 });
 });

 describe('removeMemory', () => {
 it('removes memory by id', () => {
 useMemoryStore.setState({ memories: [sampleMemory] });
 const { removeMemory } = useMemoryStore.getState();

 removeMemory('mem-1');

 expect(useMemoryStore.getState().memories).toHaveLength(0);
 });

 it('leaves other memories untouched', () => {
 const second = { ...sampleMemory, id: 'mem-2' };
 useMemoryStore.setState({ memories: [sampleMemory, second] });
 const { removeMemory } = useMemoryStore.getState();

 removeMemory('mem-1');

 const remaining = useMemoryStore.getState().memories;
 expect(remaining).toHaveLength(1);
 expect(remaining[0].id).toBe('mem-2');
 });
 });

 describe('updateMemory', () => {
 it('merges updates into matching memory', () => {
 useMemoryStore.setState({ memories: [sampleMemory] });
 const { updateMemory } = useMemoryStore.getState();

 updateMemory('mem-1', { content: 'Updated content' });

 const updated = useMemoryStore.getState().memories[0];
 expect(updated.content).toBe('Updated content');
 expect(updated.id).toBe('mem-1');
 });
 });

 describe('searchMemories', () => {
 it('POSTs to /memories/search and stores results', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () => Promise.resolve([sampleResult]),
 });
 const { searchMemories } = useMemoryStore.getState();

 await searchMemories('dark mode', 'User');

 expect(mockFetch).toHaveBeenCalledWith(
 'http://localhost:8081/memories/search',
 expect.objectContaining({
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 query: 'dark mode',
 dimension: 'User',
 limit: 10,
 }),
 })
 );

 const state = useMemoryStore.getState();
 expect(state.searchResults).toEqual([sampleResult]);
 expect(state.isLoading).toBe(false);
 expect(state.error).toBeNull();
 });

 it('uses default limit of 10 when not provided', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () => Promise.resolve([]),
 });
 const { searchMemories } = useMemoryStore.getState();

 await searchMemories('test');

 const body = JSON.parse(mockFetch.mock.calls[0][1].body);
 expect(body.limit).toBe(10);
 });

 it('respects custom limit', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () => Promise.resolve([]),
 });
 const { searchMemories } = useMemoryStore.getState();

 await searchMemories('test', undefined, 25);

 const body = JSON.parse(mockFetch.mock.calls[0][1].body);
 expect(body.limit).toBe(25);
 });

 it('sets error when response not ok', async () => {
 mockFetch.mockResolvedValueOnce({ ok: false });
 const { searchMemories } = useMemoryStore.getState();

 await searchMemories('test');

 const state = useMemoryStore.getState();
 expect(state.error).toBe('Search failed');
 expect(state.isLoading).toBe(false);
 });

 it('sets error when fetch throws', async () => {
 mockFetch.mockRejectedValueOnce(new Error('Network down'));
 const { searchMemories } = useMemoryStore.getState();

 await searchMemories('test');

 const state = useMemoryStore.getState();
 expect(state.error).toBe('Network down');
 expect(state.isLoading).toBe(false);
 });
 });

 describe('fetchMemories', () => {
 it('GETs /memories and stores them', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () => Promise.resolve([sampleMemory]),
 });
 const { fetchMemories } = useMemoryStore.getState();

 await fetchMemories();

 expect(mockFetch).toHaveBeenCalledWith('http://localhost:8081/memories');
 expect(useMemoryStore.getState().memories).toEqual([sampleMemory]);
 });

 it('sets error on failure', async () => {
 mockFetch.mockResolvedValueOnce({ ok: false });
 const { fetchMemories } = useMemoryStore.getState();

 await fetchMemories();

 expect(useMemoryStore.getState().error).toBe('Failed to fetch memories');
 });
 });

 describe('setApiBase / setSession / clearError', () => {
 it('setApiBase updates base', () => {
 const { setApiBase } = useMemoryStore.getState();
 setApiBase('http://neon.example.com');

 expect(useMemoryStore.getState().apiBase).toBe(
 'http://neon.example.com'
 );
 });

 it('setSession updates currentSessionId', () => {
 const { setSession } = useMemoryStore.getState();
 setSession('session-42');

 expect(useMemoryStore.getState().currentSessionId).toBe('session-42');
 });

 it('clearError resets error to null', () => {
 useMemoryStore.setState({ error: 'Something failed' });
 const { clearError } = useMemoryStore.getState();

 clearError();

 expect(useMemoryStore.getState().error).toBeNull();
 });
 });
});
