import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { telencephalonClient, type LobeInfo, type FlowMeta } from '../lib/telencephalonClient';

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
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:60080';

/** Response shape from the embedded `encephalon_status` Tauri command
 *  (`src-tauri/src/lib.rs::encephalon_status`). The supervisor-style
 *  fields used here are derived from `telencephalon_attached`:
 *  encephalon has no supervision concept, so being attached is the
 *  closest equivalent. */
interface EncephalonStatus {
  bus_receivers: number;
  thalamus_sensor_count: number;
  thalamus_sensors: string[];
  thalamus_video_cameras: number;
  telencephalon_attached: boolean;
}

export const useTelencephalonStore = create<CortexState>()(
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
        telencephalonClient.setBaseUrl(url);
        set((state) => ({ connection: { ...state.connection, baseUrl: url } }));
      },

      setApiKey: (apiKey) => {
        set((state) => ({ connection: { ...state.connection, apiKey } }));
      },

      refreshStatus: async () => {
        set({ status: 'starting' });
        try {
          const resp = await telencephalonClient.health();
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
        // Probe the in-process encephalon (Tauri-only; on the web
        // build the invoke returns null and we keep the previous
        // value). Replaces the legacy `cortex_status` sidecar call —
        // encephalon has no `supervision_enabled`/`restart_count`
        // fields, so we map `telencephalon_attached` onto
        // `supervisor.enabled`.
        try {
          const { safeInvoke } = await import('../lib/tauriSafe');
          const raw = await safeInvoke<EncephalonStatus>('encephalon_status');
          if (raw && typeof raw === 'object') {
            set((prev) => ({
              supervisor: {
                enabled: raw.telencephalon_attached ?? prev.supervisor.enabled,
                restartCount: prev.supervisor.restartCount,
              },
            }));
          }
        } catch {
          /* keep previous supervisor state on transient Tauri errors */
        }
      },

      refreshLobes: async () => {
        try {
          const resp = await telencephalonClient.listAgents();
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
          const flows = await telencephalonClient.listFlows();
          set({ flows });
        } catch { }
      },
    }),
    {
      name: 'shadow-cortex-store',
      partialize: (state) => ({ connection: state.connection }),
    },
  ),
);

export function useCortexConnected(): boolean {
  return useTelencephalonStore((s) => s.status === 'running');
}
