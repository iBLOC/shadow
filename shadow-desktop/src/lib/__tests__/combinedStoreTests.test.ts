import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('certificateStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with null certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { certificate } = useCertificateStore.getState();
    expect(certificate).toBeNull();
  });

  it('starts with isLoading false', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { isLoading } = useCertificateStore.getState();
    expect(isLoading).toBe(false);
  });

  it('starts with null error', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { error } = useCertificateStore.getState();
    expect(error).toBeNull();
  });

  it('clearCertificate clears certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { clearCertificate } = useCertificateStore.getState();

    clearCertificate();

    const { certificate, error } = useCertificateStore.getState();
    expect(certificate).toBeNull();
    expect(error).toBeNull();
  });

  it('clearCertificate removes shadow_id from localStorage', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { clearCertificate } = useCertificateStore.getState();

    localStorage.setItem('shadow_id', 'test-id');
    clearCertificate();

    expect(localStorage.getItem('shadow_id')).toBeNull();
  });

  it('isCertificateValid returns false when no certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { isCertificateValid } = useCertificateStore.getState();

    const result = isCertificateValid();

    expect(result).toBe(false);
  });
});

describe('skillStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with empty executions', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { executions } = useSkillStore.getState();
    expect(executions).toEqual([]);
  });

  it('addExecution adds execution to list', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });

    const { executions } = useSkillStore.getState();
    expect(executions).toHaveLength(1);
  });

  it('updateExecution updates execution fields', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution, updateExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });
    updateExecution('exec-1', { status: 'completed' });

    const { executions } = useSkillStore.getState();
    expect(executions[0].status).toBe('completed');
  });

  it('addExecution preserves existing executions', async () => {
    const { useSkillStore } = await import('../../stores/skillStore');
    const { addExecution } = useSkillStore.getState();

    addExecution({ id: 'exec-1', skillId: 'skill-1', status: 'running', startedAt: new Date() });
    addExecution({ id: 'exec-2', skillId: 'skill-2', status: 'running', startedAt: new Date() });

    const { executions } = useSkillStore.getState();
    expect(executions).toHaveLength(2);
  });
});

describe('databaseStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with internal db type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('internal');
  });

  it('starts with connected status', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { status } = useDatabaseStore.getState();
    expect(status).toBe('connected');
  });

  it('starts with null master password', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { masterPassword } = useDatabaseStore.getState();
    expect(masterPassword).toBeNull();
  });

  it('setMasterPassword updates password', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setMasterPassword } = useDatabaseStore.getState();

    setMasterPassword('secret');

    const { masterPassword } = useDatabaseStore.getState();
    expect(masterPassword).toBe('secret');
  });
});

describe('memoryStore', () => {
  const mockFetch = vi.fn();

  const okResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

  const wireMemory = {
    id: 'mem-1',
    uri: 'memory://1',
    content: 'Test',
    dimension: 'Agent',
    layer: 'L2Detail',
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
  };

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(okResponse([]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with empty memories', async () => {
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

  it('addMemory writes to hippocampus then appends locally', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    mockFetch.mockResolvedValueOnce(okResponse(wireMemory));

    await useMemoryStore.getState().addMemory({
      content: 'Test',
      dimension: 'Agent',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory');
    expect(init.method).toBe('POST');
    expect(useMemoryStore.getState().memories).toHaveLength(1);
  });

  it('removeMemory deletes on hippocampus and drops locally', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    mockFetch.mockResolvedValueOnce(okResponse([wireMemory]));
    await useMemoryStore.getState().fetchMemories();

    mockFetch.mockResolvedValueOnce(okResponse({ success: true }));
    await useMemoryStore.getState().removeMemory('mem-1');

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('DELETE');
    expect(useMemoryStore.getState().memories).toHaveLength(0);
  });

  it('updateMemory puts to hippocampus and replaces locally', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    mockFetch.mockResolvedValueOnce(okResponse([wireMemory]));
    await useMemoryStore.getState().fetchMemories();

    mockFetch.mockResolvedValueOnce(
      okResponse({ ...wireMemory, content: 'Updated' })
    );
    await useMemoryStore.getState().updateMemory('mem-1', { content: 'Updated' });

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(useMemoryStore.getState().memories[0].content).toBe('Updated');
  });

  it('setSession updates session id', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { setSession } = useMemoryStore.getState();

    setSession('session-123');

    const { currentSessionId } = useMemoryStore.getState();
    expect(currentSessionId).toBe('session-123');
  });

  it('clearError clears error', async () => {
    const { useMemoryStore } = await import('../../stores/memoryStore');
    const { clearError } = useMemoryStore.getState();

    clearError();

    const { error } = useMemoryStore.getState();
    expect(error).toBeNull();
  });
});