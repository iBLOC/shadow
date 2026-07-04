import { create } from 'zustand';
import { loadJson, saveJson } from '../lib/storage';
import { useErrorDialogStore, type AppError } from './errorDialogStore';

const STORAGE_KEY = 'errorLog';
export const MAX_ENTRIES = 100;

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  source: AppError['source'];
  endpoint?: string;
  method?: string;
  status?: number;
  statusText?: string;
  message: string;
  stack?: string;
}

interface ErrorLogState {
  entries: ErrorLogEntry[];
  add: (error: AppError) => void;
  clear: () => void;
  rehydrate: () => void;
}

function toLogEntry(error: AppError): ErrorLogEntry {
  return {
    id: error.id,
    timestamp: error.timestamp,
    source: error.source,
    endpoint: error.endpoint,
    method: error.method,
    status: error.status,
    statusText: error.statusText,
    message: error.message,
    stack: error.stack,
  };
}

export const useErrorLogStore = create<ErrorLogState>((set, get) => ({
  entries: [],
  add: (error) => {
    const entry = toLogEntry(error);
    const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
    set({ entries: next });
    saveJson(STORAGE_KEY, next);
  },
  clear: () => {
    set({ entries: [] });
    saveJson(STORAGE_KEY, []);
  },
  rehydrate: () => {
    const persisted = loadJson<ErrorLogEntry[]>(STORAGE_KEY);
    if (persisted && Array.isArray(persisted)) {
      set({ entries: persisted.slice(0, MAX_ENTRIES) });
    }
  },
}));

let bridgeInstalled = false;

/**
 * Wire the error dialog store into the error log store so every reported
 * error is also persisted to localStorage. Idempotent.
 */
export function installErrorLogBridge(): void {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  useErrorLogStore.getState().rehydrate();

  useErrorDialogStore.subscribe((state, prev) => {
    if (state.current && state.current !== prev.current) {
      useErrorLogStore.getState().add(state.current);
    }
  });
}