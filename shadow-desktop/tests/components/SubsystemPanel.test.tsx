/**
 *
 * 「已加载模型」那一栏 —— **界面级**判据（渲染面）。
 *
 * ## 这一条在守什么
 *
 * ⚠️⚠️ **端脑发什么，桌面就得认什么** —— 端脑
 * `GET /api/telencephalon/neuron/preview/models` 发的是
 * `{ capability, model_id, engine }`（`engine` ＝ 运行时实现，如 `Candle` /
 * `MistralRs` / `Burn`）⇒ ⇒ 而桌面这一栏以前声明的是 **`quantization`**
 * ⇒ ⇒ 端脑**从不**发这个字段 ⇒ ⇒ `m.quantization` 恒为 `undefined`
 * ⇒ ⇒ **那枚 Badge 永远渲染不出来** ⇒ ⇒ 界面少显示一个字段。
 *
 * ⇒ ⇒ 这一条把**端脑的真实响应形状**喂进去 ⇒ ⇒ 断言
 * **引擎实现那一枚徽章真的出现在界面上** ⇒ ⇒ 「字段漂移 ⇒ 界面少显示」
 * 这一族以后会**自己变红**。
 *
 * ⚠️ **为什么喂「真实形状」而不是随手编一个** —— 随手编的形状会与端脑
 * 一起漂 ⇒ ⇒ 那这条判据就成了一根**自己会烂的**桩 ⇒ ⇒ 这里照端脑
 * `src/neuron_embed.rs` 的 `ModelSummary` 逐字段对齐。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubsystemPanel } from '../../src/components/business/SubsystemPanel/SubsystemPanel';
import { useSubsystemStore } from '../../src/stores/subsystemStore';
import type { NeuronModelSummary } from '../../src/lib/telencephalonClient';

/** 端脑 `ModelSummary` 的**真实形状**（`src/neuron_embed.rs`）。 */
const BRAIN_SHAPED_MODEL = {
  capability: 'llm',
  model_id: 'qwen2.5-7b-instruct',
  engine: 'Candle',
};

describe('SubsystemPanel · 已加载模型', () => {
  beforeEach(() => {
    useSubsystemStore.setState({
      neuronModels: [],
      startPolling: () => () => {},
      refreshAll: async () => {},
    });
  });

  it('端脑真形状喂进去 ⇒ 引擎实现那一枚徽章**真的渲染出来**', () => {
    useSubsystemStore.setState({ neuronModels: [BRAIN_SHAPED_MODEL] });

    render(<SubsystemPanel />);

    // 模型 id 在（原来就显示）
    expect(screen.getByText('qwen2.5-7b-instruct')).toBeInTheDocument();
    // 能力徽章在（原来就显示）
    expect(screen.getByText('llm')).toBeInTheDocument();
    // ⚠️ **这一条才是要害** —— 引擎实现那一枚以前**永远出不来**
    expect(screen.getByText('Candle')).toBeInTheDocument();
  });

  it('端脑**不发**的那个字段（`quantization`）不许被当成引擎显示出来', () => {
    // ⚠️ **防「假修复」** —— 如果有人把端脑改成发 `quantization`、或者桌面
    //   同时认两个字段 ⇒ ⇒ 这一条要能看出来「界面显示的到底是哪一个」。
    useSubsystemStore.setState({
      // ⚠️ 这里故意喂一个端脑不发的字段 ⇒ ⇒ 被测类型（store 那一格）
      //   本来不接受它 ⇒ ⇒ 必须显式断言绕过（否则 TS2353 多余属性）
      //   ⇒ ⇒ 断言的是「故意的非法形状」⇒ ⇒ 不掩盖任何别的错。
      neuronModels: [
        { ...BRAIN_SHAPED_MODEL, quantization: 'Q4_K_M' } as unknown as NeuronModelSummary,
      ],
    });

    render(<SubsystemPanel />);

    expect(screen.getByText('Candle')).toBeInTheDocument();
    expect(screen.queryByText('Q4_K_M')).not.toBeInTheDocument();
  });

  it('引擎实现为空 ⇒ **不留空徽章**（那一格干脆不出现）', () => {
    useSubsystemStore.setState({
      neuronModels: [{ capability: 'llm', model_id: 'm1', engine: '' }],
    });

    render(<SubsystemPanel />);

    expect(screen.getByText('m1')).toBeInTheDocument();
    expect(screen.getByText('llm')).toBeInTheDocument();

    // ⚠️ **数「模型那一行」里的徽章**（而不是整块面板）—— 面板里别的卡片
    //   也有 Badge（模型计数、传感器数…）⇒ ⇒ 数全面板必然数出 3 枚 ⇒ ⇒ 判据
    //   必须**落在模型行这一层**。
    //   ⇒ ⇒ 锚点＝`模型 id 那一行`（`font-mono` 那一格）⇒ ⇒ 往上取它那一行。
    const idCell = screen.getByText('m1');
    const row = idCell.closest('.flex.items-center.justify-between');
    expect(row).not.toBeNull();
    const badges = row!.querySelectorAll('.inline-flex.items-center.rounded-full');
    // 能力徽章 **1** 枚；引擎为空 ⇒ ⇒ **不许**多出第 2 枚。
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('llm');
  });
  it('某一格被塞成非法形状 ⇒ **不许把整页打崩**', () => {
    // ⚠️⚠️ **这是真浏览器级实测出来的病** —— 端脑答歪了 ⇒ ⇒ 客户端交出
    //   `undefined` ⇒ ⇒ 面板 `models.length` ⇒ ⇒ **React 树被卸载** ⇒ ⇒
    //   整页空白（连 `main` 都读不到）⇒ ⇒ 而 TypeScript 对此**一声不吭**。
    useSubsystemStore.setState({
      // ⚠️ **故意的非法形状** ⇒ ⇒ 必须**显式**绕过类型
      neuronModels: undefined as unknown as NeuronModelSummary[],
    });

    // ⚠️ **判据是「不抛」** —— 这一格以前会把整棵树打崩
    expect(() => render(<SubsystemPanel />)).not.toThrow();
    // ⚠️ **并且要渲染出「0 枚模型」而不是空白**
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});
