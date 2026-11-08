import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { telencephalonClient, type LobeInfo, type FlowMeta } from '../lib/telencephalonClient';
import { DEFAULT_TELEENCEPHALON_URL, buildTimeTelencephalonUrl } from '../lib/endpointDefaults';

export type TelencephalonStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'unreachable' | 'error';

export interface TelencephalonConnection {
  baseUrl: string;
  apiKey: string;
}

export interface TelencephalonSupervisorInfo {
  enabled: boolean;
  restartCount: number;
}

interface TelencephalonState {
  connection: TelencephalonConnection;
  status: TelencephalonStatus;
  telencephalonId: string | null;
  defaultAgent: string | null;
  lobes: LobeInfo[];
  flows: FlowMeta[];
  lastCheck: Date | null;
  error: string | null;
  supervisor: TelencephalonSupervisorInfo;

  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  refreshStatus: () => Promise<void>;
  refreshLobes: () => Promise<void>;
  refreshFlows: () => Promise<void>;
}

/**
 * 端脑地址的**默认值** —— 构建期可用 VITE_PREFRONTAL_URL 指过来
 * （web 形态没有 sidecar ⇒ 只能靠它指到真脑）。
 *
 * ⚠️ **真相源只有这一处** —— connection.baseUrl 是「用户可配、持久化、重启后复原」的那个
 * ⇒ ⇒ 客户端**只读**它（lib/prefrontalClient.ts / lib/hippocampusClient.ts）
 * ⇒ ⇒ 任何模块**不许**在加载时改写它 ⇒ ⇒ 改写 = 把用户配的地址抹掉。
 */
const DEFAULT_BASE_URL = buildTimeTelencephalonUrl() ?? DEFAULT_TELEENCEPHALON_URL;

// ⚠️ **持久化键改名** —— 旧键名 `shadow-cortex-store` 是**历史拼写**，
// 但它是**存储键**（不是概念）⇒ ⇒ 直接改名会让用户已配置的端脑地址 /
// 影子锁**静默丢失**（失败长得像成功）⇒ ⇒ 这里读旧键、搬一次、再用新键。
const STORE_KEY = 'shadow-telencephalon-store';
const LEGACY_STORE_KEY = 'shadow-cortex-store';
try {
  if (typeof localStorage !== 'undefined'
    && !localStorage.getItem(STORE_KEY)
    && localStorage.getItem(LEGACY_STORE_KEY)) {
    localStorage.setItem(STORE_KEY, localStorage.getItem(LEGACY_STORE_KEY) as string);
  }
} catch {
  /* localStorage 不可用（隐私模式 / 非浏览器）⇒ 忽略 */
}

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

export const useTelencephalonStore = create<TelencephalonState>()(
  persist(
    (set, get) => ({
      connection: {
        baseUrl: DEFAULT_BASE_URL,
        apiKey: '',
      },
      status: 'stopped',
      telencephalonId: null,
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
        // ⚠️ **必须同步给 client** —— 否则 store 里有 key、client 里没有
        // ⇒ 所有走 `telencephalonClient.request()` 的请求都不带 `X-Shadow-Key`
        // ⇒ 端脑一旦开了 `shadow.api_key`（非开发模式），客户端全量 401。
        // （`setBaseUrl` 一直有同步，`setApiKey` 之前漏了。）
        telencephalonClient.setApiKey(apiKey);
        set((state) => ({ connection: { ...state.connection, apiKey } }));
      },

      refreshStatus: async () => {
        set({ status: 'starting' });
        try {
          const resp = await telencephalonClient.health();
          set({
            status: 'running',
            telencephalonId: (resp as { id?: string }).id ?? 'telencephalon',
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
        // value). Replaces the legacy sidecar status call —
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
            telencephalonId: resp.telencephalon?.id ?? get().telencephalonId,
            defaultAgent: resp.telencephalon?.default_agent ?? get().defaultAgent,
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
      name: STORE_KEY,
      partialize: (state) => ({ connection: state.connection }),
      // ⚠️ **恢复持久化状态时必须同步给 client** ——
      // `persist` 只把 `connection` 灌回 store，**不会**调 `setBaseUrl`/`setApiKey`
      // ⇒ client 永远停在构造时的默认值（`http://127.0.0.1:60080`、无 key）
      // ⇒ 用户改过地址或配过 key 的话，**重启后全部失效**，
      // 而 store 里看着是对的（最迷惑的那种坏法）。
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        telencephalonClient.setBaseUrl(state.connection.baseUrl);
        telencephalonClient.setApiKey(state.connection.apiKey);
      },
    },
  ),
);

export function useTelencephalonConnected(): boolean {
  return useTelencephalonStore((s) => s.status === 'running');
}
