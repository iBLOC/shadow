import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cortexClient, type CortexVideoSourcesSnapshot, type VideoSource } from '../lib/cortexClient';

export type { VideoSource } from '../lib/cortexClient';

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

  refreshFromCortex: () => Promise<void>;
  addFromAvailable: (deviceId: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function pushToCortex(catalog: Map<string, VideoSource>, activeId: string | null) {
  const sources = Array.from(catalog.values());
  const snapshot: CortexVideoSourcesSnapshot = {
    sources,
    activeId,
    device: { platform: 'web', hostname: location?.hostname ?? 'browser', cortexVersion: 'unknown' },
  };
  // fire-and-forget push; UI stays optimistic
  cortexClient
    .putVideoSources(snapshot, '*')
    .then(() => {})
    .catch(() => {});
}

export const useVideoSourceStore = create<VideoSourceState>()(
  persist(
    (set, get) => ({
      catalog: new Map(),
      activeId: null,
      available: new Map(),
      sync: 'idle',

      refreshFromCortex: async () => {
        set({ sync: 'pushing' });
        try {
          const snapshot = await cortexClient.listVideoSources();
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
        pushToCortex(nextCatalog, activeId);
      },

      setActive: async (id: string) => {
        const nextCatalog = new Map(get().catalog);
        for (const [, src] of nextCatalog) {
          src.active = src.id === id;
          src.updatedAt = new Date().toISOString();
        }
        set({ catalog: nextCatalog, activeId: id });
        pushToCortex(nextCatalog, id);
      },

      remove: async (id: string) => {
        const nextCatalog = new Map(get().catalog);
        const toRemove = Array.from(nextCatalog.values()).find((s) => s.id === id);
        if (toRemove) nextCatalog.delete(toRemove.deviceId);
        const activeId = get().activeId === id ? null : get().activeId;
        set({ catalog: nextCatalog, activeId });
        pushToCortex(nextCatalog, activeId);
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
