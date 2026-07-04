import { create } from 'zustand';

export type ErrorSource = 'http' | 'react' | 'unhandled' | 'promise';

export interface AppError {
  id: string;
  timestamp: string;
  source: ErrorSource;
  endpoint?: string;
  method?: string;
  status?: number;
  statusText?: string;
  message: string;
  stack?: string;
  userAgent?: string;
  componentStack?: string;
}

interface ErrorDialogState {
  current: AppError | null;
  queue: AppError[];
  show: (
    error: Omit<AppError, 'id' | 'timestamp' | 'userAgent'> & {
      id?: string;
      timestamp?: string;
      userAgent?: string;
    }
  ) => void;
  dismiss: () => void;
  clearQueue: () => void;
}

function enrichError(
  error: Parameters<ErrorDialogState['show']>[0]
): AppError {
  return {
    id: error.id ?? crypto.randomUUID(),
    timestamp: error.timestamp ?? new Date().toISOString(),
    userAgent:
      error.userAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    ...error,
  };
}

export const useErrorDialogStore = create<ErrorDialogState>((set, get) => ({
  current: null,
  queue: [],
  show: (error) => {
    const fullError = enrichError(error);
    const { current, queue } = get();
    if (current) {
      set({ queue: [...queue, fullError] });
    } else {
      set({ current: fullError });
    }
  },
  dismiss: () => {
    const { queue } = get();
    if (queue.length > 0) {
      set({ current: queue[0], queue: queue.slice(1) });
    } else {
      set({ current: null });
    }
  },
  clearQueue: () => set({ queue: [], current: null }),
}));
