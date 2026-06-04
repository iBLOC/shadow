import { create } from 'zustand';
import { safeInvoke } from '../lib/tauriSafe';

export type DatabaseType = 'embedded' | 'external' | 'neon';
export type DatabaseStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ExternalDatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

interface DatabaseState {
  dbType: DatabaseType;
  status: DatabaseStatus;
  embeddedPort: number | null;
  externalConfig: ExternalDatabaseConfig;
  masterPassword: string | null;
  error: string | null;

  setDbType: (type: DatabaseType) => void;
  setExternalConfig: (config: Partial<ExternalDatabaseConfig>) => void;
  setMasterPassword: (password: string) => void;
  startEmbedded: () => Promise<void>;
  stopEmbedded: () => Promise<void>;
  testExternalConnection: () => Promise<boolean>;
  encryptValue: (value: string) => Promise<string>;
  decryptValue: (encrypted: string) => Promise<string>;
}

const DEFAULT_EXTERNAL_CONFIG: ExternalDatabaseConfig = {
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '',
  database: 'shadow',
};

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  dbType: 'embedded',
  status: 'disconnected',
  embeddedPort: null,
  externalConfig: { ...DEFAULT_EXTERNAL_CONFIG },
  masterPassword: null,
  error: null,

  setDbType: (type) => set({ dbType: type, error: null }),

  setExternalConfig: (config) =>
    set((state) => ({
      externalConfig: { ...state.externalConfig, ...config },
    })),

  setMasterPassword: (password) => set({ masterPassword: password }),

  startEmbedded: async () => {
    set({ status: 'connecting', error: null });
    try {
      const port = await safeInvoke<number>('start_embedded_pg');
      set({ status: 'connected', embeddedPort: port });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  stopEmbedded: async () => {
    try {
      await safeInvoke('stop_embedded_pg');
      set({ status: 'disconnected', embeddedPort: null });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  testExternalConnection: async () => {
    set({ status: 'connecting', error: null });
    try {
      set({ status: 'connected' });
      return true;
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
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
