/**
 * 设备工具的「结算闸」—— **一次调用只兑现一次**。
 *
 * ⚠️ **为什么需要它**：AG-UI 的工具闭环是「**下一次请求**带回去」⇒ ⇒ 端脑在
 * AG-UI 这一路**不等**设备 ⇒ ⇒ 设备这边**必须一定**把结果交出去（成功或失败）
 * ⇒ ⇒ 否则模型永远等一个不来的结果 ⇒ ⇒ 那正是「失败长得像成功」。
 *
 * ⚠️ **兑现的两种结局**：
 * · 成功 ⇒ ⇒ 内容给模型；
 * · 失败 ⇒ ⇒ **必须带 error**（端脑那边「error 在场 ⇒ 状态就是 failed」）
 *   ⇒ ⇒ 不能只把失败原因塞进 content。
 */

/** 设备工具交回端脑的结果。 */
export interface ClientToolOutcome {
  ok: boolean;
  /** 给模型看的那一句（成功时）。 */
  content: string;
  /** 失败原因（失败时**必填**）。 */
  error?: string;
}

/**
 * 失败的兜底结局 —— **error 必填**（空着＝把失败说成成功）。
 *
 * @param reason 失败原因（空白 ⇒ ⇒ 换成一句通用的话，**不许**留空）。
 */
export function failedOutcome(reason: string): ClientToolOutcome {
  const why = reason.trim() === '' ? 'tool failed' : reason.trim();
  return { ok: false, content: '', error: why };
}

/**
 * 结算闸 —— **一次调用只兑现一次**。
 *
 * ⚠️ 「只第一次有效」不是洁癖：用户点两次「批准」／工具既失败又超时 ⇒ ⇒
 * 第二次兑现会把已经结算过的那次**再喂一遍**给模型 ⇒ ⇒ 模型看见两条结果
 * ⇒ ⇒ 那是「重复执行」而不是「重复回话」。
 */
export class ToolOutcomeGate {
  private readonly pending = new Map<string, (outcome: ClientToolOutcome) => void>();

  /** 登记一次调用 ⇒ ⇒ 返回它的结算 promise（页面在批准/输入完成后兑现）。 */
  open(callId: string): Promise<ClientToolOutcome> {
    return new Promise<ClientToolOutcome>((resolve) => {
      this.pending.set(callId, resolve);
    });
  }

  /** 兑现（**只第一次有效**）⇒ ⇒ 返回这次是否真的兑现了。 */
  settle(callId: string, outcome: ClientToolOutcome): boolean {
    const resolve = this.pending.get(callId);
    if (!resolve) return false;
    this.pending.delete(callId);
    resolve(outcome);
    return true;
  }

  /** 这条调用还欠着结果吗？ */
  isOpen(callId: string): boolean {
    return this.pending.has(callId);
  }

  /** 还欠着几条（诊断用）。 */
  get openCount(): number {
    return this.pending.size;
  }

  /**
   * 放弃全部（页面卸载／用户中断）⇒ ⇒ **每一条都兑现成失败**
   * ⇒ ⇒ 模型不会干等一个永远不来的结果。
   */
  abandonAll(reason: string): void {
    const ids = [...this.pending.keys()];
    for (const id of ids) this.settle(id, failedOutcome(reason));
  }
}
