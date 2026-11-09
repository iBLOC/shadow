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

/**
 * 一格失败的**说法** —— 失败有两种：① 请求失败（带 reason）② **形状不对**。
 * ⚠️ **两种都要说得出** —— 以前只有一句 `refresh failed` ⇒ ⇒ 看不出是谁、
 *   也看不出是「没答」还是「答歪了」。
 */
function describeCell(result: { status: string; reason?: unknown }, value: unknown): string {
  if (result.status === 'rejected') return String(result.reason);
  const shape = value === null ? 'null' : Array.isArray(value) ? `array(${value.length})` : typeof value;
  return `形状不对：${shape}`;
}

/** 对象格（不是数组、不是 null）的形状闸。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const useSubsystemStore = create<SubsystemState>((set, get) => ({
  thalamusSensors: [],
  thalamusStats: {},
  hippocampusStats: null,
  hippocampusRecent: [],
  consolidatorState: null,
  neuronModels: [],
  lastPollAt: null,

  // ⚠️⚠️ **一格失败不许把整栏清空** —— 以前这里是 `Promise.all` ⇒ ⇒ **任一格失败**
  //   ⇒ ⇒ 整个 `set()` 都不执行 ⇒ ⇒ **五格全部停在旧值** ⇒ ⇒ 界面上「已加载模型」
  //   显示 **0**、「暂无加载的模型」⇒ ⇒ 而**端脑其实真的答了**（本机真端脑实测：
  //   `preview/models` 回 **200** ＋ 真形状 `{"capability":"llm","model_id":
  //   "qwen2.5-0.5b","engine":"Candle"}`）⇒ ⇒ ⇒ **失败长得像成功**：
  //   界面说「没有模型」，实际是**海马体那一格**回 500 ⇒ ⇒ **一处的毛病 ⇒ 另一处
  //   显示「没有」**。
  //
  //   ⇒ ⇒ 修法：**`Promise.allSettled` ＋ 逐项落地** ⇒ ⇒ 成功的那几格照常更新 ⇒ ⇒
  //   **失败的那一格保留上一次的**（不让一次抖动把已经显示的数据抹掉）⇒ ⇒
  //   并且**说清是哪一格失败**（以前只有一句 `refresh failed`，看不出是谁）。
  refreshAll: async () => {
    const [sensors, hstats, recent, consolidator, models] = await Promise.allSettled([
      telencephalonClient.thalamus.listSensors(),
      telencephalonClient.hippocampus.stats(),
      telencephalonClient.hippocampus.recent({ limit: 10 }),
      telencephalonClient.hippocampus.consolidator(),
      telencephalonClient.neuron.models(),
    ]);

    const failed: string[] = [];
    const patch: Partial<SubsystemState> = { lastPollAt: new Date() };

    // ⚠️⚠️ **两道闸，分工不同，别揉成一道** ——
    //   ❶ **一格失败不许连坐别的那几格** ⇒ ⇒ `allSettled` ＋ 逐项落地；
    //   ❷ **一格形状不对不许抹掉已显示的数据、更不许把整页打崩**。
    //
    //   ⚠️ **❷ 是真浏览器级实测出来的，不是推演** —— 探针里把丘脑那一格
    //   stub 成**裸数组**（端脑真发的是 `{sensors:[...]}`）⇒ ⇒ 客户端
    //   `.then(r => r.sensors)` 拿到 **undefined** ⇒ ⇒ 面板 `sensors.length`
    //   ⇒ ⇒ **整页崩**（React 树被卸载，`main` 都读不到）⇒ ⇒ 而
    //   TypeScript 对此**一声不吭**（`Promise<string[]>` 在运行时是
    //   **一纸空文**）⇒ ⇒ ⇒ 只能靠**运行时形状闸**。
    //
    //   ⚠️ **❷ 为什么不写在客户端** —— 客户端是「形状适配层」，让它对
    //   端脑的形状**兜底**＝让它**自己造端脑的形状** ⇒ ⇒ 与上一刀那条
    //   纪律（**端脑发什么，桌面就得认什么**）相反 ⇒ ⇒ 闸落在**写入状态
    //   的那一刻**（store 是**唯一的写入口**）。
    const sensorList: unknown = sensors.status === 'fulfilled' ? sensors.value : undefined;
    if (sensors.status === 'fulfilled' && Array.isArray(sensorList)) {
      patch.thalamusSensors = sensorList as string[];
    } else {
      failed.push(`thalamus.sensors（${describeCell(sensors, sensorList)}）`);
    }

    const statsValue: unknown = hstats.status === 'fulfilled' ? hstats.value : undefined;
    if (hstats.status === 'fulfilled' && isPlainObject(statsValue)) {
      patch.hippocampusStats = statsValue as unknown as HippocampusStats;
    } else {
      failed.push(`hippocampus.stats（${describeCell(hstats, statsValue)}）`);
    }

    const recentEntries: unknown = recent.status === 'fulfilled' ? recent.value.entries : undefined;
    if (recent.status === 'fulfilled' && Array.isArray(recentEntries)) {
      patch.hippocampusRecent = recentEntries as HippocampusMemory[];
    } else {
      failed.push(`hippocampus.recent（${describeCell(recent, recentEntries)}）`);
    }

    const consolidatorValue: unknown = consolidator.status === 'fulfilled' ? consolidator.value : undefined;
    if (consolidator.status === 'fulfilled' && isPlainObject(consolidatorValue)) {
      patch.consolidatorState = consolidatorValue as unknown as ConsolidatorState;
    } else {
      failed.push(`hippocampus.consolidator（${describeCell(consolidator, consolidatorValue)}）`);
    }

    const modelList: unknown = models.status === 'fulfilled' ? models.value : undefined;
    if (models.status === 'fulfilled' && Array.isArray(modelList)) {
      patch.neuronModels = modelList as NeuronModelSummary[];
    } else {
      failed.push(`neuron.models（${describeCell(models, modelList)}）`);
    }

    set(patch);

    // ⚠️ **点名是哪一格失败** —— 以前只有一句 `refresh failed` ⇒ ⇒ 看不出是谁
    if (failed.length > 0) {
      console.warn('[subsystemStore] 部分刷新失败 ⇒ ⇒ 只影响那几格，其余照常更新 ⇒ ⇒ 失败：' + failed.join(' ｜ '));
    }
  },

  startPolling: () => {
    void get().refreshAll();
    const id = setInterval(() => void get().refreshAll(), 5_000);
    return () => clearInterval(id);
  },
}));
