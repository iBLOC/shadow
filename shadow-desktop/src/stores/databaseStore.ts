import { create } from 'zustand';
import { safeInvoke } from '../lib/tauriSafe';

export type DatabaseType = 'internal' | 'distributed';
export type DatabaseStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface DatabaseState {
  dbType: DatabaseType;
  status: DatabaseStatus;
  internalPort: number | null;
  masterPassword: string | null;
  error: string | null;

  setDbType: (type: DatabaseType) => void;
  setMasterPassword: (password: string) => void;
  startInternal: () => Promise<void>;
  stopInternal: () => Promise<void>;
  encryptValue: (value: string) => Promise<string>;
  decryptValue: (encrypted: string) => Promise<string>;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  dbType: 'internal',
  status: 'disconnected',
  internalPort: null,
  masterPassword: null,
  error: null,

  setDbType: (type) => set({ dbType: type, error: null }),

  setMasterPassword: (password) => set({ masterPassword: password }),

  startInternal: async () => {
    set({ status: 'connecting', error: null });
    try {
      const port = await safeInvoke<number>('start_embedded_pg');
      set({ status: 'connected', internalPort: port });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  stopInternal: async () => {
    try {
      await safeInvoke('stop_embedded_pg');
      set({ status: 'disconnected', internalPort: null });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  encryptValue: async (value: string): Promise<string> => {
    const { masterPassword } = get();
    if (!masterPassword) {
      throw new Error('Master password not set');
    }
    const result = await safeInvoke<string>('encrypt_value', {
      value,
      passphrase: masterPassword,
    });
    if (result === null) throw new Error('encrypt_value returned null');
    return result;
  },

  decryptValue: async (encrypted: string): Promise<string> => {
    const { masterPassword } = get();
    if (!masterPassword) {
      throw new Error('Master password not set');
    }
    const result = await safeInvoke<string>('decrypt_value', {
      encrypted,
      passphrase: masterPassword,
    });
    if (result === null) throw new Error('decrypt_value returned null');
    return result;
  },
}));