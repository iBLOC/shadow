import { beforeEach, describe, it, vi, expect } from 'vitest';
import { useSubsystemStore } from '../../src/stores/subsystemStore';
import type { NeuronModelSummary } from '../../src/lib/telencephalonClient';

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
    thalamus: {
      listSensors: vi.fn().mockResolvedValue(['sensor1', 'sensor2']),
    },
    hippocampus: {
      stats: vi.fn().mockResolvedValue({ memory_count: 10, graph_node_count: 3, pending_consolidations: 5 }),
      recent: vi.fn().mockResolvedValue({ entries: [{ id: '1', uri: 'test://uri', content: 'test content', layer: 'L0', dimension: 'User', memory_type: 'fact', created_at: '2026-01-01', updated_at: '2026-01-01' }] }),
      consolidator: vi.fn().mockResolvedValue({ pending: 5, last_consolidated_id: 'uuid-123', last_run_at: '2026-01-01T00:00:00Z', last_status: 'success' }),
    },
    neuron: {
      // ⚠️ **形状照端脑真发**（`src/neuron_embed.rs` 的 `ModelSummary`）——
      //   以前这里是 `{ model_id: 'gpt-4' }`（**只有一格**）⇒ ⇒ 而 store
      //   那一格写的是 `unknown[]` ⇒ ⇒ **两边都不受约束** ⇒ ⇒ 端脑真发的
      //   `capability` / `engine` 从来没在判据里出现过 ⇒ ⇒ 漂移无人发现。
      models: vi.fn().mockResolvedValue([
        { capability: 'llm', model_id: 'gpt-4', engine: 'Candle' },
      ]),
    },
  },
}));

describe('subsystemStore', () => {
  beforeEach(() => {
    useSubsystemStore.setState({
      thalamusSensors: [],
      thalamusStats: {},
      hippocampusStats: null,
      hippocampusRecent: [],
      consolidatorState: null,
      neuronModels: [],
      lastPollAt: null,
    });
  });

  it('refreshAll populates state on success', async () => {
    const store = useSubsystemStore.getState();
    await store.refreshAll();

    const state = useSubsystemStore.getState();
    expect(state.thalamusSensors).toEqual(['sensor1', 'sensor2']);
    expect(state.hippocampusStats).toEqual({ memory_count: 10, graph_node_count: 3, pending_consolidations: 5 });
    expect(state.consolidatorState).toEqual({ pending: 5, last_consolidated_id: 'uuid-123', last_run_at: '2026-01-01T00:00:00Z', last_status: 'success' });
    expect(state.neuronModels).toEqual([
      { capability: 'llm', model_id: 'gpt-4', engine: 'Candle' },
    ]);
    expect(state.lastPollAt).toBeInstanceOf(Date);
  });

  it('refreshAll swallows errors', async () => {
    const { telencephalonClient } = await import('../../src/lib/telencephalonClient');
    vi.mocked(telencephalonClient.thalamus.listSensors).mockRejectedValueOnce(new Error('network error'));

    const store = useSubsystemStore.getState();
    await expect(store.refreshAll()).resolves.not.toThrow();

    const state = useSubsystemStore.getState();
    expect(state.thalamusSensors).toEqual([]);
  });

  // ⚠️⚠️ **一格失败不许把整栏清空** —— 以前这里是 Promise.all ⇒ ⇒ **任一格失败**
  //   ⇒ ⇒ 整个 set() 都不执行 ⇒ ⇒ **五格全部停在旧值** ⇒ ⇒ 界面上「已加载模型」
  //   显示 **0**、「暂无加载的模型」⇒ ⇒ 而**端脑其实真的答了**（本机真端脑实测：
  //   preview/models 回 **200** ＋ 真形状 capability=llm / model_id=qwen2.5-0.5b /
  //   engine=Candle）⇒ ⇒ ⇒ **失败长得像成功**：界面说「没有模型」，实际是**海马体
  //   那一格**回 500 ⇒ ⇒ **一处的毛病 ⇒ 另一处显示「没有」**。⇒ ⇒ 下面三条判据承重这一族。
  it('refreshAll lands the healthy cells even when one cell fails', async () => {
    const { telencephalonClient } = await import('../../src/lib/telencephalonClient');
    // 海马体最近记忆那一格回 500（端脑仓在飞件的 lance schema 漂移 ⇒ ⇒ 真端脑实测过）
    vi.mocked(telencephalonClient.hippocampus.recent).mockRejectedValueOnce(new Error('telencephalon 500: lance scan stream: Schema error'));

    await useSubsystemStore.getState().refreshAll();

    const state = useSubsystemStore.getState();
    // ⚠️ **失败的那一格不许连坐别的那几格** —— 这一条在 Promise.all 形态下**必红**
    expect(state.neuronModels).toEqual([
      { capability: 'llm', model_id: 'gpt-4', engine: 'Candle' },
    ]);
    expect(state.thalamusSensors).toEqual(['sensor1', 'sensor2']);
    expect(state.hippocampusStats).toEqual({ memory_count: 10, graph_node_count: 3, pending_consolidations: 5 });
    expect(state.consolidatorState).toEqual({ pending: 5, last_consolidated_id: 'uuid-123', last_run_at: '2026-01-01T00:00:00Z', last_status: 'success' });
    expect(state.lastPollAt).toBeInstanceOf(Date);
  });

  it('refreshAll keeps the previous value of a failing cell', async () => {
    const { telencephalonClient } = await import('../../src/lib/telencephalonClient');
    useSubsystemStore.setState({
      neuronModels: [{ capability: 'llm', model_id: 'old-model', engine: 'Candle' }],
    });
    vi.mocked(telencephalonClient.neuron.models).mockRejectedValueOnce(new Error('telencephalon 500'));

    await useSubsystemStore.getState().refreshAll();

    // ⚠️ **一次抖动不许把已经显示的数据抹掉**
    expect(useSubsystemStore.getState().neuronModels).toEqual([
      { capability: 'llm', model_id: 'old-model', engine: 'Candle' },
    ]);
  });

  it('refreshAll names the failing cells instead of a bare refresh failed', async () => {
    const { telencephalonClient } = await import('../../src/lib/telencephalonClient');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(telencephalonClient.neuron.models).mockRejectedValueOnce(new Error('telencephalon 500'));
    vi.mocked(telencephalonClient.hippocampus.recent).mockRejectedValueOnce(new Error('lance schema error'));

    await useSubsystemStore.getState().refreshAll();

    const text = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    warn.mockRestore();
    // ⚠️ **点名是哪一格失败** —— 以前只有一句 refresh failed ⇒ ⇒ 看不出是谁
    expect(text).toContain('neuron.models');
    expect(text).toContain('hippocampus.recent');
    // ⚠️ **不许把没失败的格也点进去** —— 点名要准，不许宁可多报
    expect(text).not.toContain('thalamus.sensors');
    expect(text).not.toContain('hippocampus.stats');
  });
  // ⚠️⚠️ **形状闸** —— 端脑答歪了（客户端 `.then(r => r.sensors)` 那种）⇒ ⇒
  //   交回来的**不是数组** ⇒ ⇒ TypeScript **一声不吭**（`Promise<string[]>`
  //   在运行时是**一纸空文**）⇒ ⇒ 真浏览器里那一格会让面板 `undefined.length`
  //   ⇒ ⇒ **整页崩**（React 树被卸载）⇒ ⇒ ⇒ 这一条承重那族。
  it('refreshAll keeps the previous value when a cell answers with the wrong shape', async () => {
    const { telencephalonClient } = await import('../../src/lib/telencephalonClient');
    useSubsystemStore.setState({
      neuronModels: [{ capability: 'llm', model_id: 'old-model', engine: 'Candle' }],
    });
    // ⚠️ **故意的非法形状** ⇒ ⇒ 必须**显式**绕过类型（否则 TS2353/TS2345）
    //   ⇒ ⇒ 断言的是「故意的非法形状」⇒ ⇒ 不掩盖任何别的错。
    vi.mocked(telencephalonClient.neuron.models).mockResolvedValueOnce(
      undefined as unknown as NeuronModelSummary[],
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await useSubsystemStore.getState().refreshAll();

    const text = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    warn.mockRestore();
    // ⚠️ **不许把已显示的数据抹掉**
    expect(useSubsystemStore.getState().neuronModels).toEqual([
      { capability: 'llm', model_id: 'old-model', engine: 'Candle' },
    ]);
    // ⚠️ **而且要点名「是形状不对」，不是「请求失败」**
    expect(text).toContain('neuron.models');
    expect(text).toContain('形状不对');
  });

  it('startPolling polls on a 5s timer', () => {
    vi.useFakeTimers();
    const store = useSubsystemStore.getState();
    const clearSpy = vi.fn();

    vi.spyOn(global, 'setInterval').mockImplementation(() => {
      return 1 as unknown as NodeJS.Timeout;
    });
    vi.spyOn(global, 'clearInterval').mockImplementation(clearSpy);

    const stop = store.startPolling();

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);

    stop();

    expect(clearInterval).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });
});
