import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDatabaseStore } from '../../src/stores/databaseStore';
import type { DatabaseType } from '../../src/stores/databaseStore';

const mockSafeInvoke = vi.fn();

vi.mock('../../src/lib/tauriSafe', () => ({
 safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

describe('DatabaseStore', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockSafeInvoke.mockReset();
 useDatabaseStore.setState({
 dbType: 'embedded',
 status: 'disconnected',
 embeddedPort: null,
 externalConfig: {
 host: 'localhost',
 port: 5432,
 username: 'postgres',
 password: '',
 database: 'shadow',
 },
 masterPassword: null,
 error: null,
 });
 });

 describe('initial state', () => {
 it('starts with embedded dbType and disconnected status', () => {
 const state = useDatabaseStore.getState();
 expect(state.dbType).toBe('embedded');
 expect(state.status).toBe('disconnected');
 expect(state.embeddedPort).toBeNull();
 expect(state.masterPassword).toBeNull();
 expect(state.error).toBeNull();
 });

 it('exposes default external config', () => {
 const state = useDatabaseStore.getState();
 expect(state.externalConfig).toEqual({
 host: 'localhost',
 port: 5432,
 username: 'postgres',
 password: '',
 database: 'shadow',
 });
 });
 });

 describe('setDbType', () => {
 it('updates dbType and clears error', () => {
 useDatabaseStore.setState({ error: 'previous error' });
 const { setDbType } = useDatabaseStore.getState();

 setDbType('external');

 const state = useDatabaseStore.getState();
 expect(state.dbType).toBe('external');
 expect(state.error).toBeNull();
 });

 it('accepts all valid DatabaseType values', () => {
 const types: DatabaseType[] = ['embedded', 'external', 'neon'];
 for (const t of types) {
 const { setDbType } = useDatabaseStore.getState();
 setDbType(t);
 expect(useDatabaseStore.getState().dbType).toBe(t);
 }
 });
 });

 describe('setExternalConfig', () => {
 it('merges partial config', () => {
 const { setExternalConfig } = useDatabaseStore.getState();
 setExternalConfig({ host: 'db.example.com', port: 6543 });

 const config = useDatabaseStore.getState().externalConfig;
 expect(config.host).toBe('db.example.com');
 expect(config.port).toBe(6543);
 expect(config.username).toBe('postgres');
 expect(config.database).toBe('shadow');
 });

 it('keeps untouched fields intact', () => {
 useDatabaseStore.setState({
 externalConfig: {
 host: 'first',
 port: 1111,
 username: 'u1',
 password: 'p1',
 database: 'd1',
 },
 });
 const { setExternalConfig } = useDatabaseStore.getState();
 setExternalConfig({ host: 'second' });

 const config = useDatabaseStore.getState().externalConfig;
 expect(config.host).toBe('second');
 expect(config.port).toBe(1111);
 expect(config.username).toBe('u1');
 });
 });

 describe('setMasterPassword', () => {
 it('sets the master password', () => {
 const { setMasterPassword } = useDatabaseStore.getState();
 setMasterPassword('secret-123');

 expect(useDatabaseStore.getState().masterPassword).toBe('secret-123');
 });
 });

 describe('startEmbedded', () => {
 it('sets connected status with port on success', async () => {
 mockSafeInvoke.mockResolvedValueOnce(54329);
 const { startEmbedded } = useDatabaseStore.getState();

 await startEmbedded();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('connected');
 expect(state.embeddedPort).toBe(54329);
 expect(state.error).toBeNull();
 });

 it('sets error status on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Port already in use'));
 const { startEmbedded } = useDatabaseStore.getState();

 await startEmbedded();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('error');
 expect(state.error).toBe('Port already in use');
 });
 });

 describe('stopEmbedded', () => {
 it('disconnects and clears port on success', async () => {
 mockSafeInvoke.mockResolvedValueOnce(undefined);
 useDatabaseStore.setState({ status: 'connected', embeddedPort: 54329 });
 const { stopEmbedded } = useDatabaseStore.getState();

 await stopEmbedded();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('disconnected');
 expect(state.embeddedPort).toBeNull();
 });

 it('sets error on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Stop failed'));
 const { stopEmbedded } = useDatabaseStore.getState();

 await stopEmbedded();

 const state = useDatabaseStore.getState();
 expect(state.error).toBe('Stop failed');
 });
 });

 describe('testExternalConnection', () => {
 it('returns true on success and sets connected', async () => {
 const { testExternalConnection } = useDatabaseStore.getState();
 const result = await testExternalConnection();

 expect(result).toBe(true);
 expect(useDatabaseStore.getState().status).toBe('connected');
 });
 });

 describe('encryptValue / decryptValue', () => {
 it('encryptValue throws when master password not set', async () => {
 const { encryptValue } = useDatabaseStore.getState();

 await expect(encryptValue('plain')).rejects.toThrow('Master password not set');
 });

 it('encryptValue calls safeInvoke with passphrase', async () => {
 mockSafeInvoke.mockResolvedValueOnce('encrypted-cipher');
 useDatabaseStore.setState({ masterPassword: 'mp' });
 const { encryptValue } = useDatabaseStore.getState();

 const result = await encryptValue('plain');

 expect(mockSafeInvoke).toHaveBeenCalledWith('encrypt_value', {
 value: 'plain',
 passphrase: 'mp',
 });
 expect(result).toBe('encrypted-cipher');
 });

 it('encryptValue throws when safeInvoke returns null', async () => {
 mockSafeInvoke.mockResolvedValueOnce(null);
 useDatabaseStore.setState({ masterPassword: 'mp' });
 const { encryptValue } = useDatabaseStore.getState();

 await expect(encryptValue('plain')).rejects.toThrow(
 'encrypt_value returned null'
 );
 });

 it('decryptValue calls safeInvoke with passphrase', async () => {
 mockSafeInvoke.mockResolvedValueOnce('decrypted');
 useDatabaseStore.setState({ masterPassword: 'mp' });
 const { decryptValue } = useDatabaseStore.getState();

 const result = await decryptValue('encrypted-cipher');

 expect(mockSafeInvoke).toHaveBeenCalledWith('decrypt_value', {
 encrypted: 'encrypted-cipher',
 passphrase: 'mp',
 });
 expect(result).toBe('decrypted');
 });

 it('decryptValue throws when master password not set', async () => {
 const { decryptValue } = useDatabaseStore.getState();

 await expect(decryptValue('x')).rejects.toThrow('Master password not set');
 });
 });
});
