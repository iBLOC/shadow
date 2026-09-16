import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cortexClient, type LobeInfo, type FlowMeta } from '../lib/cortexClient';

export type CortexStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'unreachable' | 'error';

export interface CortexConnection {
  baseUrl: string;
  apiKey: string;
}

export interface CortexSupervisorInfo {
  enabled: boolean;
  restartCount: number;
}

interface CortexState {
  connection: CortexConnection;
  status: CortexStatus;
  cortexId: string | null;
  defaultAgent: string | null;
  lobes: LobeInfo[];
  flows: FlowMeta[];
  lastCheck: Date | null;
  error: string | null;
  supervisor: CortexSupervisorInfo;

  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  refreshStatus: () => Promise<void>;
  refreshLobes: () => Promise<void>;
  refreshFlows: () => Promise<void>;
  startCortex: () => Promise<void>;
  stopCortex: () => Promise<void>;
  setSupervision: (enabled: boolean) => Promise<void>;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8443';

export const useCortexStore = create<CortexState>()(
  persist(
    (set, get) => ({
      connection: {
        baseUrl: DEFAULT_BASE_URL,
        apiKey: '',
      },
      status: 'stopped',
      cortexId: null,
      defaultAgent: null,
      lobes: [],
      flows: [],
      lastCheck: null,
      error: null,
      supervisor: { enabled: true, restartCount: 0 },

      setBaseUrl: (url) => {
        cortexClient.setBaseUrl(url);
        set((state) => ({ connection: { ...state.connection, baseUrl: url } }));
      },

      setApiKey: (apiKey) => {
        set((state) => ({ connection: { ...state.connection, apiKey } }));
      },

      refreshStatus: async () => {
        set({ status: 'starting' });
        try {
          const resp = await cortexClient.health();
          set({
            status: 'running',
            cortexId: (resp as { id?: string }).id ?? 'cortex',
            error: null,
            lastCheck: new Date(),
          });
        } catch (e) {
          set({
            status: 'unreachable',
            error: e instanceof Error ? e.message : String(e),
            lastCheck: new Date(),
          });
        }
        // Pull supervisor state from the sidecar (Tauri-only; on
        // the web build the invoke returns null and we keep the
        // previous value).
        try {
          const { safeInvoke } = await import('../lib/tauriSafe');
          const raw = await safeInvoke<{
            supervision_enabled?: boolean;
            restart_count?: number;
          }>('cortex_status');
          if (raw && typeof raw === 'object') {
            set((prev) => ({
              supervisor: {
                enabled: raw.supervision_enabled ?? prev.supervisor.enabled,
                restartCount: raw.restart_count ?? prev.supervisor.restartCount,
              },
            }));
          }
        } catch {
          /* keep previous supervisor state on transient Tauri errors */
        }
      },

      refreshLobes: async () => {
        try {
          const resp = await cortexClient.listAgents();
          set({
            lobes: resp.agents,
            cortexId: resp.cortex?.id ?? get().cortexId,
            defaultAgent: resp.cortex?.default_agent ?? get().defaultAgent,
            lastCheck: new Date(),
            error: null,
          });
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : String(e),
            lastCheck: new Date(),
          });
        }
      },

      refreshFlows: async () => {
        try {
          const flows = await cortexClient.listFlows();
          set({ flows });
        } catch { }
      },

      startCortex: async () => {
        set({ status: 'starting' });
        try {
          const { safeInvoke } = await import('../lib/tauriSafe');
          await safeInvoke('cortex_start');
          await get().refreshStatus();
          await get().refreshLobes();
        } catch (e) {
          set({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      stopCortex: async () => {
        try {
          const { safeInvoke } = await import('../lib/tauriSafe');
          await safeInvoke('cortex_stop');
          set({ status: 'stopped', lobes: [], cortexId: null });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      setSupervision: async (enabled) => {
        try {
          const { safeInvoke } = await import('../lib/tauriSafe');
          const newValue = await safeInvoke<boolean>('cortex_set_supervision', { enabled });
          set((prev) => ({
            supervisor: {
              enabled: newValue ?? enabled,
              restartCount: prev.supervisor.restartCount,
            },
          }));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },
    }),
    {
      name: 'shadow-cortex-store',
      partialize: (state) => ({ connection: state.connection }),
    },
  ),
);

export function useCortexConnected(): boolean {
  return useCortexStore((s) => s.status === 'running');
}