import { create } from 'zustand';
import { safeInvoke } from '../lib/tauriSafe';

export type DatabaseType = 'internal';
export type DatabaseStatus = 'connected';

interface DatabaseState {
  dbType: DatabaseType;
  status: DatabaseStatus;
  masterPassword: string | null;

  setMasterPassword: (password: string) => void;
  encryptValue: (value: string) => Promise<string>;
  decryptValue: (encrypted: string) => Promise<string>;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  dbType: 'internal',
  status: 'connected',
  masterPassword: null,

  setMasterPassword: (password) => set({ masterPassword: password }),

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
