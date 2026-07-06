import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauriSafe', () => ({
  safeInvoke: vi.fn(),
}));

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

  it('starts with disconnected status', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { status } = useDatabaseStore.getState();
    expect(status).toBe('disconnected');
  });

  it('starts with null internal port', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { internalPort } = useDatabaseStore.getState();
    expect(internalPort).toBeNull();
  });

  it('starts with null master password', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { masterPassword } = useDatabaseStore.getState();
    expect(masterPassword).toBeNull();
  });

  it('starts with null error', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { error } = useDatabaseStore.getState();
    expect(error).toBeNull();
  });

  it('setDbType updates to distributed type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('distributed');

    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('distributed');
  });

  it('setDbType clears error', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('distributed');

    const { error } = useDatabaseStore.getState();
    expect(error).toBeNull();
  });

  it('setMasterPassword updates password', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setMasterPassword } = useDatabaseStore.getState();

    setMasterPassword('secret123');

    const { masterPassword } = useDatabaseStore.getState();
    expect(masterPassword).toBe('secret123');
  });

  it('setDbType accepts distributed type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('distributed');

    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('distributed');
  });
});
