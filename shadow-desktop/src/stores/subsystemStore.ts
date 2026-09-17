import { create } from 'zustand';
import { cortexClient } from '../lib/cortexClient';

interface SubsystemState {
  thalamusSensors: string[];
  thalamusStats: Record<string, unknown>;
  hippocampusStats: unknown;
  hippocampusRecent: unknown[];
  neureModels: unknown[];
  lastPollAt: Date | null;
  refreshAll: () => Promise<void>;
  startPolling: () => () => void;
}

export const useSubsystemStore = create<SubsystemState>((set, get) => ({
  thalamusSensors: [],
  thalamusStats: {},
  hippocampusStats: null,
  hippocampusRecent: [],
  neureModels: [],
  lastPollAt: null,

  refreshAll: async () => {
    try {
      const [sensors, hstats, recent, models] = await Promise.all([
        cortexClient.thalamus.listSensors(),
        cortexClient.hippocampus.stats(),
        cortexClient.hippocampus.recent({ limit: 10 }),
        cortexClient.neure.models(),
      ]);
      set({
        thalamusSensors: sensors,
        hippocampusStats: hstats,
        hippocampusRecent: recent.entries,
        neureModels: models,
        lastPollAt: new Date(),
      });
    } catch (e) {
      console.warn('[subsystemStore] refresh failed', e);
    }
  },

  startPolling: () => {
    void get().refreshAll();
    const id = setInterval(() => void get().refreshAll(), 5_000);
    return () => clearInterval(id);
  },
}));
