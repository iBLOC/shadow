export interface DownloadState {
  modelId: string;
  modelName: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  isDownloading: boolean;
  isComplete: boolean;
  error: string | null;
}

export interface AvailableModel {
  id: string;
  name: string;
  repo: string;
  filename: string;
  sizeBytes: number;
  quantization: string;
  contextLength: number;
  recommended: boolean;
}

export const AVAILABLE_MODELS: AvailableModel[] = [
  {
    id: 'qwen2.5-3b-q4km',
    name: 'Qwen2.5 3B (Q4_K_M)',
    repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    sizeBytes: 2_100_000_000,
    quantization: 'Q4_K_M',
    contextLength: 32768,
    recommended: true,
  },
  {
    id: 'llama3.2-3b-q4km',
    name: 'Llama 3.2 3B (Q4_K_M)',
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_000_000_000,
    quantization: 'Q4_K_M',
    contextLength: 131072,
    recommended: true,
  },
  {
    id: 'phi3.5-mini-q4km',
    name: 'Phi-3.5 Mini 3.8B (Q4_K_M)',
    repo: 'microsoft/Phi-3.5-mini-instruct-GGUF',
    filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sizeBytes: 2_500_000_000,
    quantization: 'Q4_K_M',
    contextLength: 32768,
    recommended: false,
  },
  {
    id: 'gemma2-2b-q8',
    name: 'Gemma 2 2B (Q8_0)',
    repo: 'bartowski/gemma-2-2b-it-GGUF',
    filename: 'gemma-2-2b-it-Q8_0.gguf',
    sizeBytes: 2_500_000_000,
    quantization: 'Q8_0',
    contextLength: 8192,
    recommended: false,
  },
];

const HF_MIRROR = 'https://huggingface.co';

export function getModelDownloadUrl(model: AvailableModel): string {
  return `${HF_MIRROR}/${model.repo}/resolve/main/${model.filename}`;
}

const DB_NAME = 'shadow-models';
const DB_VERSION = 1;
const STORE = 'models';

interface StoredModel {
  id: string;
  blob: Blob;
  filename: string;
  sizeBytes: number;
  downloadedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      resolve(db);
    };
  });
}

export async function hasDownloadedModel(modelId: string): Promise<boolean> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getKey(modelId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  } catch (_err) {
    return false;
  }
}

export async function getDownloadedModel(modelId: string): Promise<StoredModel | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(modelId);
      req.onsuccess = () => resolve((req.result as StoredModel) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function listDownloadedModels(): Promise<StoredModel[]> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredModel[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteDownloadedModel(modelId: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(modelId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (_err) {
    return;
  }
}

export interface DownloadOptions {
  model: AvailableModel;
  onProgress?: (state: DownloadState) => void;
  signal?: AbortSignal;
}

export async function downloadModel({ model, onProgress, signal }: DownloadOptions): Promise<Blob | null> {
  const url = getModelDownloadUrl(model);
  const update = (patch: Partial<DownloadState>) => {
    onProgress?.({
      modelId: model.id,
      modelName: model.name,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: model.sizeBytes,
      isDownloading: true,
      isComplete: false,
      error: null,
      ...patch,
    });
  };

  try {
    update({ isDownloading: true });
    const resp = await fetch(url, { signal });
    if (!resp.ok || !resp.body) {
      update({ error: `HTTP ${resp.status}`, isDownloading: false });
      return null;
    }

    const contentLength = Number(resp.headers.get('Content-Length')) || model.sizeBytes;
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) {
        update({ error: 'Cancelled', isDownloading: false });
        return null;
      }
      chunks.push(value);
      received += value.length;
      update({
        downloadedBytes: received,
        progress: received / contentLength,
      });
    }

    const blob = new Blob(chunks);
    update({ isComplete: true, isDownloading: false, progress: 1 });

    try {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id: model.id,
        blob,
        filename: model.filename,
        sizeBytes: blob.size,
        downloadedAt: Date.now(),
      } satisfies StoredModel);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (_err) {
      void _err;
    }

    return blob;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      update({ error: 'Cancelled', isDownloading: false });
    } else {
      update({ error: String(e), isDownloading: false });
    }
    return null;
  }
}
