import { create } from 'zustand';
import { telencephalonClient, ConsolidatorState, HippocampusMemory, HippocampusStats, NeuronModelSummary } from '../lib/telencephalonClient';

interface SubsystemState {
  thalamusSensors: string[];
  thalamusStats: Record<string, unknown>;
  hippocampusStats: HippocampusStats | null;
  hippocampusRecent: HippocampusMemory[];
  consolidatorState: ConsolidatorState | null;
  // ⚠️ **不许写 `unknown[]`** —— 那会让「端脑发的字段」与「界面认的字段」
  //   **各说各话**：以前这一格是 `unknown[]` ⇒ ⇒ 面板只好自己手写一份
  //   `as Array<{...}>` ⇒ ⇒ 那份手写类型与端脑**没有任何约束关系**
  //   ⇒ ⇒ 端脑发 `engine`、桌面写 `quantization` ⇒ ⇒ **谁都不报错**
  //   ⇒ ⇒ 那枚徽章**永远不显示**。⇒ ⇒ 这里改成**端脑那一侧的真类型**
  //   ⇒ ⇒ 字段漂移 ⇒ ⇒ **TypeScript 就响**。
  neuronModels: NeuronModelSummary[];
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
