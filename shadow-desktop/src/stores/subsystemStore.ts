import { create } from 'zustand';
import { cortexClient, ConsolidatorState, HippocampusMemory, HippocampusStats } from '../lib/cortexClient';

interface SubsystemState {
  thalamusSensors: string[];
  thalamusStats: Record<string, unknown>;
  hippocampusStats: HippocampusStats | null;
  hippocampusRecent: HippocampusMemory[];
  consolidatorState: ConsolidatorState | null;
  neuronModels: unknown[];
  lastPollAt: Date | null;
  refreshAll: () => Promise<void>;
  startPolling: () => () => void;
}

export const useSubsystemStore = create<SubsystemState>((set, get) => ({
  thalamusSensors: [],
  thalamusStats: {},
  hippocampusStats: null,
  hippocampusRecent: [],
  consolidatorState: null,
  neuronModels: [],
  lastPollAt: null,

  refreshAll: async () => {
    try {
      const [sensors, hstats, recent, consolidator, models] = await Promise.all([
        cortexClient.thalamus.listSensors(),
        cortexClient.hippocampus.stats(),
        cortexClient.hippocampus.recent({ limit: 10 }),
        cortexClient.hippocampus.consolidator(),
        cortexClient.neuron.models(),
      ]);
      set({
        thalamusSensors: sensors,
        hippocampusStats: hstats,
        hippocampusRecent: recent.entries,
        consolidatorState: consolidator,
        neuronModels: models,
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
