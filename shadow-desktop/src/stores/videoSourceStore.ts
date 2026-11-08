import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { telencephalonClient, type TelencephalonVideoSourcesSnapshot, type VideoSource } from '../lib/telencephalonClient';

export type { VideoSource } from '../lib/telencephalonClient';

export interface RawDevice {
  deviceId: string;
  label: string;
  serial?: string;
}

export type SyncState = 'idle' | 'pushing' | 'stale';

interface VideoSourceState {
  catalog: Map<string /* deviceId */, VideoSource>;
  activeId: string | null;
  available: Map<string /* deviceId */, RawDevice>;
  sync: SyncState;
  lastSyncAt?: number;
  /** ⚠️ 最近一次**推送失败**的原因（原文）⇒ ⇒ 「读不到/写不进」的现场证据。 */
  syncError?: string;

  refreshFromTelencephalon: () => Promise<void>;
  addFromAvailable: (deviceId: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * 把本地目录**推**给端脑。
 *
 * ⚠️ **失败不许被吞** —— 以前这里是 `.catch(() => {})` ⇒ ⇒ PUT 失败（401 / 422 / 网络）
 * ⇒ ⇒ 界面**照样**说「已同步」（`VideoSourcesCard` 的徽章看的就是 `sync === 'idle'`）
 * ⇒ ⇒ **失败长得像成功**（界面与端脑说的不是一回事）⇒ ⇒ 现在把 Promise **交回去**
 * ⇒ ⇒ 由调用方按成败把 `sync` 置成 `'stale'` ⇒ ⇒ 徽章变「未同步」。
 */
async function pushToTelencephalon(
  catalog: Map<string, VideoSource>,
  activeId: string | null,
): Promise<void> {
  const sources = Array.from(catalog.values());
  const snapshot: TelencephalonVideoSourcesSnapshot = {
    sources,
    activeId,
    // ⚠️ **字段名必须和服务端的 DTO 对齐（camelCase）** —— 服务端的
    // `DeviceBlock` 早已改名（`telencephalon_version` ⇒ DTO 改成 camelCase
    // 之后就是 `telencephalonVersion`）⇒ ⇒ 以前这里发的是 `cortexVersion`
    // ⇒ ⇒ 服务端反序列化**整个 `device` 块失败** ⇒ ⇒ 整个 PUT bodies 被拒
    // （422）⇒ ⇒ 而**当时**下面的 `.catch(() => {})` 把错误吞了 ⇒ ⇒ **失败长得像成功**
    // （界面说「已与端脑同步」，其实一条都没写进去）⇒ ⇒ **那个吞异常的写法已经删掉**：
    // ⇒ ⇒ 现在 PUT 失败会把 `sync` 置成 `'stale'` ⇒ ⇒ 徽章如实说「未同步」。
    device: { platform: 'web', hostname: location?.hostname ?? 'browser', telencephalonVersion: 'unknown' },
  };
  // ⚠️ **UI 仍然乐观**（本地目录先变），但**成败必须回到 store** ⇒ ⇒
  // ⇒ 不许在这里吞错误（吞掉＝界面说「已同步」而端脑一条都没收到）。
  await telencephalonClient.putVideoSources(snapshot, '*');
}

/**
 * 推给端脑，并把**成败**写回 `sync`。
 *
 * ⚠️ **失败 ⇒ ⇒ `sync = 'stale'`**（本地有、端脑没有）⇒ ⇒ `VideoSourcesCard`
 * 的徽章从「已同步」变成「未同步」⇒ ⇒ **界面不再说谎**；成功 ⇒ ⇒ `'idle'` ＋ 时间戳。
 */
function pushAndReport(
  set: (partial: Partial<VideoSourceState>) => void,
  catalog: Map<string, VideoSource>,
  activeId: string | null,
): void {
  pushToTelencephalon(catalog, activeId).then(
    () => set({ sync: 'idle', lastSyncAt: Date.now(), syncError: undefined }),
    (e: unknown) =>
      set({
        sync: 'stale',
        syncError: e instanceof Error ? e.message : String(e),
      }),
  );
}

export const useVideoSourceStore = create<VideoSourceState>()(
  persist(
    (set, get) => ({
      catalog: new Map(),
      activeId: null,
      available: new Map(),
      sync: 'idle',

      refreshFromTelencephalon: async () => {
        set({ sync: 'pushing' });
        try {
          const snapshot = await telencephalonClient.listVideoSources();
          const newCatalog = new Map<string, VideoSource>();
          for (const s of snapshot.sources) {
            newCatalog.set(s.deviceId, { ...s });
          }
          set({
            catalog: newCatalog,
            activeId: snapshot.activeId ?? null,
            sync: 'idle',
            lastSyncAt: Date.now(),
          });
        } catch {
          set({ sync: 'stale' });
        }
      },

      addFromAvailable: async (deviceId: string) => {
        const dev = get().available.get(deviceId);
        if (!dev) return;
        const id = `vsrc_${Date.now().toString(36)}`;
        const now = new Date().toISOString();
        const newSource: VideoSource = {
          id,
          deviceId,
          label: dev.label,
          kind: 'uvc',
          serial: dev.serial,
          transport: 'browser',
          capabilities: {},
          active: false,
          createdAt: now,
          updatedAt: now,
        };
        const nextCatalog = new Map(get().catalog);
        nextCatalog.set(deviceId, newSource);
        const activeId = get().activeId ?? id;
        if (!get().activeId) {
          newSource.active = true;
        }
        set({ catalog: nextCatalog, activeId });
        pushAndReport(set, nextCatalog, activeId);
      },

      setActive: async (id: string) => {
        const nextCatalog = new Map(get().catalog);
        for (const [, src] of nextCatalog) {
          src.active = src.id === id;
          src.updatedAt = new Date().toISOString();
        }
        set({ catalog: nextCatalog, activeId: id });
        pushAndReport(set, nextCatalog, id);
      },

      remove: async (id: string) => {
        const nextCatalog = new Map(get().catalog);
        const toRemove = Array.from(nextCatalog.values()).find((s) => s.id === id);
        if (toRemove) nextCatalog.delete(toRemove.deviceId);
        const activeId = get().activeId === id ? null : get().activeId;
        set({ catalog: nextCatalog, activeId });
        pushAndReport(set, nextCatalog, activeId);
      },
    }),
    {
      name: 'shadow.videoSources.v1',
      storage: {
        getItem: (key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              catalog: new Map(parsed.state.catalog ?? []),
            },
          };
        },
        setItem: (key, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              catalog: Array.from((value.state.catalog as Map<string, VideoSource>).entries()),
            },
          };
          localStorage.setItem(key, JSON.stringify(toStore));
        },
        removeItem: (key) => localStorage.removeItem(key),
      },
    },
  ),
);
