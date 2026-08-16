import { create } from 'zustand';
import {
  AVAILABLE_MODELS,
  downloadModel,
  hasDownloadedModel,
  listDownloadedModels,
  deleteDownloadedModel,
  getDownloadedModel,
  type AvailableModel,
  type DownloadState,
} from '../lib/modelDownloadService';

interface ModelDownloadStoreState {
  availableModels: AvailableModel[];
  downloads: Record<string, DownloadState>;
  downloadedIds: Set<string>;
  isInitialized: boolean;

  init: () => Promise<void>;
  startDownload: (model: AvailableModel) => Promise<void>;
  cancelDownload: (modelId: string) => void;
  removeDownload: (modelId: string) => Promise<void>;
  getBlob: (modelId: string) => Promise<Blob | null>;
}

const downloadControllers = new Map<string, AbortController>();

export const useModelDownloadStore = create<ModelDownloadStoreState>((set, get) => ({
  availableModels: AVAILABLE_MODELS,
  downloads: {},
  downloadedIds: new Set(),
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    const stored = await listDownloadedModels();
    set({ downloadedIds: new Set(stored.map((m) => m.id)), isInitialized: true });
  },

  startDownload: async (model) => {
    const existing = get().downloads[model.id];
    if (existing?.isDownloading) return;

    const controller = new AbortController();
    downloadControllers.set(model.id, controller);

    const blob = await downloadModel({
      model,
      signal: controller.signal,
      onProgress: (state) => {
        set((s) => ({ downloads: { ...s.downloads, [model.id]: state } }));
      },
    });

    downloadControllers.delete(model.id);

    if (blob) {
      const stored = await listDownloadedModels();
      set({
        downloadedIds: new Set(stored.map((m) => m.id)),
        downloads: { ...get().downloads, [model.id]: { ...get().downloads[model.id], isComplete: true, isDownloading: false, progress: 1 } },
      });
    }
  },

  cancelDownload: (modelId) => {
    const controller = downloadControllers.get(modelId);
    if (controller) {
      controller.abort();
      downloadControllers.delete(modelId);
    }
    set((s) => {
      const next = { ...s.downloads };
      const dl = next[modelId];
      if (dl) {
        next[modelId] = { ...dl, isDownloading: false, error: 'Cancelled' };
      }
      return { downloads: next };
    });
  },

  removeDownload: async (modelId) => {
    await deleteDownloadedModel(modelId);
    const stored = await listDownloadedModels();
    set({
      downloadedIds: new Set(stored.map((m) => m.id)),
      downloads: Object.fromEntries(
        Object.entries(get().downloads).filter(([id]) => id !== modelId),
      ),
    });
  },

  getBlob: async (modelId) => {
    const stored = await getDownloadedModel(modelId);
    return stored?.blob ?? null;
  },
}));

export async function refreshDownloadedIds() {
  const stored = await listDownloadedModels();
  useModelDownloadStore.setState({ downloadedIds: new Set(stored.map((m) => m.id)) });
}

export async function checkHasDownloaded(modelId: string): Promise<boolean> {
  return hasDownloadedModel(modelId);
}
