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
 dbType: 'internal',
 status: 'disconnected',
 internalPort: null,
 masterPassword: null,
 error: null,
 });
 });

 describe('initial state', () => {
 it('starts with internal dbType and disconnected status', () => {
 const state = useDatabaseStore.getState();
 expect(state.dbType).toBe('internal');
 expect(state.status).toBe('disconnected');
 expect(state.internalPort).toBeNull();
 expect(state.masterPassword).toBeNull();
 expect(state.error).toBeNull();
 });
 });

 describe('setDbType', () => {
 it('updates dbType and clears error', () => {
 useDatabaseStore.setState({ error: 'previous error' });
 const { setDbType } = useDatabaseStore.getState();

 setDbType('distributed');

 const state = useDatabaseStore.getState();
 expect(state.dbType).toBe('distributed');
 expect(state.error).toBeNull();
 });

 it('accepts all valid DatabaseType values', () => {
 const types: DatabaseType[] = ['internal', 'distributed'];
 for (const t of types) {
 const { setDbType } = useDatabaseStore.getState();
 setDbType(t);
 expect(useDatabaseStore.getState().dbType).toBe(t);
 }
 });
 });

 describe('setMasterPassword', () => {
 it('sets the master password', () => {
 const { setMasterPassword } = useDatabaseStore.getState();
 setMasterPassword('secret-123');

 expect(useDatabaseStore.getState().masterPassword).toBe('secret-123');
 });
 });

 describe('startInternal', () => {
 it('sets connected status with port on success', async () => {
 mockSafeInvoke.mockResolvedValueOnce(54329);
 const { startInternal } = useDatabaseStore.getState();

 await startInternal();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('connected');
 expect(state.internalPort).toBe(54329);
 expect(state.error).toBeNull();
 });

 it('sets error status on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Port already in use'));
 const { startInternal } = useDatabaseStore.getState();

 await startInternal();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('error');
 expect(state.error).toBe('Port already in use');
 });
 });

 describe('stopInternal', () => {
 it('disconnects and clears port on success', async () => {
 mockSafeInvoke.mockResolvedValueOnce(undefined);
 useDatabaseStore.setState({ status: 'connected', internalPort: 54329 });
 const { stopInternal } = useDatabaseStore.getState();

 await stopInternal();

 const state = useDatabaseStore.getState();
 expect(state.status).toBe('disconnected');
 expect(state.internalPort).toBeNull();
 });

 it('sets error on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Stop failed'));
 const { stopInternal } = useDatabaseStore.getState();

 await stopInternal();

 const state = useDatabaseStore.getState();
 expect(state.error).toBe('Stop failed');
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
