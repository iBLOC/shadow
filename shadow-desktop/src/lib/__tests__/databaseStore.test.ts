import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauriSafe', () => ({
  safeInvoke: vi.fn(),
}));

describe('databaseStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with embedded db type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('embedded');
  });

  it('starts with disconnected status', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { status } = useDatabaseStore.getState();
    expect(status).toBe('disconnected');
  });

  it('starts with null embedded port', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { embeddedPort } = useDatabaseStore.getState();
    expect(embeddedPort).toBeNull();
  });

  it('starts with default external config', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { externalConfig } = useDatabaseStore.getState();
    expect(externalConfig.host).toBe('localhost');
    expect(externalConfig.port).toBe(5432);
    expect(externalConfig.database).toBe('shadow');
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

  it('setDbType updates db type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('external');

    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('external');
  });

  it('setDbType clears error', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('external');

    const { error } = useDatabaseStore.getState();
    expect(error).toBeNull();
  });

  it('setExternalConfig updates external config', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setExternalConfig } = useDatabaseStore.getState();

    setExternalConfig({ host: 'neon.host', port: 5433 });

    const { externalConfig } = useDatabaseStore.getState();
    expect(externalConfig.host).toBe('neon.host');
    expect(externalConfig.port).toBe(5433);
  });

  it('setExternalConfig merges with existing config', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setExternalConfig } = useDatabaseStore.getState();

    setExternalConfig({ host: 'neon.host' });

    const { externalConfig } = useDatabaseStore.getState();
    expect(externalConfig.host).toBe('neon.host');
    expect(externalConfig.port).toBe(5432);
  });

  it('setMasterPassword updates password', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setMasterPassword } = useDatabaseStore.getState();

    setMasterPassword('secret123');

    const { masterPassword } = useDatabaseStore.getState();
    expect(masterPassword).toBe('secret123');
  });

  it('setDbType accepts neon type', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setDbType } = useDatabaseStore.getState();

    setDbType('neon');

    const { dbType } = useDatabaseStore.getState();
    expect(dbType).toBe('neon');
  });

  it('setExternalConfig accepts partial updates', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setExternalConfig } = useDatabaseStore.getState();

    setExternalConfig({ username: 'admin' });

    const { externalConfig } = useDatabaseStore.getState();
    expect(externalConfig.username).toBe('admin');
  });

  it('setExternalConfig accepts password update', async () => {
    const { useDatabaseStore } = await import('../../stores/databaseStore');
    const { setExternalConfig } = useDatabaseStore.getState();

    setExternalConfig({ password: 'secret' });

    const { externalConfig } = useDatabaseStore.getState();
    expect(externalConfig.password).toBe('secret');
  });
});