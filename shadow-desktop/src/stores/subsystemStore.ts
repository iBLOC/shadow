import { create } from 'zustand';
import { telencephalonClient, ConsolidatorState, HippocampusMemory, HippocampusStats } from '../lib/telencephalonClient';

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
        telencephalonClient.thalamus.listSensors(),
        telencephalonClient.hippocampus.stats(),
        telencephalonClient.hippocampus.recent({ limit: 10 }),
        telencephalonClient.hippocampus.consolidator(),
        telencephalonClient.neuron.models(),
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
