import { AguiDriver } from './driver';
import type { AguiClient } from './client';
import type { AguiToolCall } from './driver';
import type { AguiContentPart, AguiMessage, AguiTool } from './types';
import type { ClientToolOutcome } from './toolOutcomeGate';

/**
 * 一轮对话的**运输层无关**驱动 —— 页面只跟这层说话。
 *
 * ⚠️ **为什么要这一层**：页面那一千行里原本直接读 `telencephalonClient.streamMessage`
 * 的事件 ⇒ ⇒ 换协议就得改那一大块 ⇒ ⇒ 而**那一页零判据覆盖** ⇒ ⇒ 换线＝盲改。
 * ⇒ ⇒ 这一层把「一轮里发生了什么」收进**可判据**的地方（文本累积／工具闭环／
 * 失败原话），页面只负责界面。
 */
export interface ConversationTurnSink {
  /** 文本增量（**逐字**）＋ 累积文本（界面自己拼气泡）。 */
  onTextDelta(delta: string, accumulated: string): void;
  /** 端脑点了名 ⇒ ⇒ 界面执行设备工具 ⇒ ⇒ **交回结局**（成功/失败都要交）。 */
  onToolCall(call: AguiToolCall): Promise<ClientToolOutcome>;
  /** 设备工具失败（**已经**交回端脑了，这里只是让界面标出来）。 */
  onToolFailed(call: AguiToolCall, error: string): void;
  /** lobe 那边自己跑的工具结果（走 CUSTOM）。 */
  onToolResult(name: string, result: unknown): void;
}

export interface ConversationTurnRequest {
  conversationId: string;
  /** 这一轮的用户内容（文本 ＋ 内联附件）。 */
  content: AguiContentPart[];
  /** 这台设备会干的工具（AG-UI 的扁平形状）。 */
  tools?: AguiTool[];
}

export interface ConversationTurnResult {
  /** 这一轮累积的文本。 */
  text: string;
  /** 第一个增量到达的时刻（null ＝ 这一轮一个字都没有）。 */
  firstDeltaAt: number | null;
  /** 这一轮里被点名执行过的设备工具。 */
  toolCalls: { id: string; name: string; ok: boolean }[];
}

/**
 * 跑一轮（AG-UI）。
 *
 * ⚠️ **失败不许长得像成功**：RUN_ERROR ⇒ ⇒ 抛，且**带上端脑的原话**；
 * 流没跑完就断 ⇒ ⇒ 抛（driver 那一层兜着）⇒ ⇒ 界面不会把半截回复当成完成。
 */
export async function runAguiTurn(
  client: AguiClient,
  request: ConversationTurnRequest,
  sink: ConversationTurnSink,
  opts?: { signal?: AbortSignal; maxContinuations?: number },
): Promise<ConversationTurnResult> {
  const toolCalls: { id: string; name: string; ok: boolean }[] = [];
  const driver = new AguiDriver({
    client,
    executeTool: async (call: AguiToolCall): Promise<ClientToolOutcome> => {
      const outcome = await sink.onToolCall(call);
      toolCalls.push({ id: call.toolCallId, name: call.toolCallName, ok: outcome.ok });
      return outcome;
    },
    ...(opts?.maxContinuations != null
      ? { maxContinuations: opts.maxContinuations }
      : {}),
  });
  const messages: AguiMessage[] = [{ role: 'user', content: request.content }];
  let text = '';
  let firstDeltaAt: number | null = null;
  for await (const ev of driver.streamTurn(
    request.conversationId,
    // ⚠️ **工具清单要带上** ⇒ ⇒ 模型才知道这台设备会什么（少了它 ⇒ 设备工具静默失灵）。
    { messages, ...(request.tools ? { tools: request.tools } : {}) },
    opts?.signal,
  )) {
    switch (ev.kind) {
      case 'text':
        text += ev.delta;
        if (firstDeltaAt === null) firstDeltaAt = Date.now();
        sink.onTextDelta(ev.delta, text);
        break;
      case 'tool_failed':
        sink.onToolFailed(ev.call, ev.error);
        break;
      case 'tool_result':
        sink.onToolResult(ev.name, ev.result);
        break;
      default:
        break;
    }
  }
  return { text, firstDeltaAt, toolCalls };
}
