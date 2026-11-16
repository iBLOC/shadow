import { AGUI_CUSTOM_NAMES } from './types';
import { initialAguiTurnState, isKnownAguiEvent, reduceAguiEvent } from './protocol';
import type { AguiToolCallState } from './protocol';
import type { AguiClient } from './client';
import type { AguiMessage } from './types';

/** 端脑点名让**这台设备**干的一次活（**参数已拼齐**）。 */
export interface AguiToolCall {
  toolCallId: string;
  toolCallName: string;
  args: string;
  parentMessageId?: string;
}

/** 设备执行完的结果（**成功与失败分两路**：失败不许长得像成功）。 */
export interface AguiToolOutcome {
  ok: boolean;
  /** 结果正文（成功时给什么就带什么）。 */
  content: string;
  /** 失败原因（失败时必填 —— 空着就等于把失败说成成功）。 */
  error?: string;
}

/** 设备本地工具的执行入口 —— **界面那一侧给**（审批／输入／真跑都在那边）。 */
export type AguiToolExecutor = (call: AguiToolCall) => Promise<AguiToolOutcome>;

export type AguiDriverEvent =
  | { kind: 'text'; messageId: string; delta: string }
  | { kind: 'tool_call'; call: AguiToolCall }
  | { kind: 'tool_failed'; call: AguiToolCall; error: string }
  | { kind: 'tool_result'; toolCallId?: string; name: string; result: unknown }
  | { kind: 'progress'; name: string; value: unknown }
  | { kind: 'finished'; runId: string | null; outcome: string | null; endState: string | null };

export interface AguiDriverOptions {
  client: AguiClient;
  /**
   * 设备本地工具的执行入口。
   *
   * ⚠️ **没有它也能跑**：端脑点了名而这台设备干不了 ⇒ ⇒ driver 自己合成一条
   * **失败**的工具结果回传 ⇒ ⇒ 模型不会干等一个永远不来的结果（与 legacy
   * 路「unsupported tool → 回传失败」同一口径）。
   */
  executeTool?: AguiToolExecutor;
  /** 一轮最多续几次（工具结果要随**下一次请求**带回去 ⇒ ⇒ 一次请求不够）。 */
  maxContinuations?: number;
}

export const AGUI_DEFAULT_MAX_CONTINUATIONS = 4;

function toToolCall(call: AguiToolCallState): AguiToolCall {
  return {
    toolCallId: call.toolCallId,
    toolCallName: call.toolCallName,
    args: call.args,
    parentMessageId: call.parentMessageId,
  };
}

/**
 * AG-UI 的**一轮对话驱动** —— 把协议层变成「客户端真的能跑的一轮」。
 *
 * ⚠️ **AG-UI 的工具闭环是「下一次请求带回去」**（不是 legacy 路的
 * `/tool-results` 旁路）：端脑在 AG-UI 这一路**不等**设备回传 ⇒ ⇒ 客户端
 * 跑完工具后，必须**重发**这一轮（`messages[]` 末尾追加 tool 消息）⇒ ⇒
 * 端脑把它当**续轮**喂回模型 ⇒ ⇒ 模型这一轮就能接着说「换好了」。
 *
 * ⚠️ **失败不许长得像成功**：
 * · 工具失败 ⇒ ⇒ 回传的 tool 消息**必须带 `error`**（端脑那边「error 在场
 *   ⇒ 状态就是 failed」）⇒ ⇒ 不能只把失败原因塞进 content；
 * · 流没跑完就断（没有 RUN_FINISHED）⇒ ⇒ **抛**，不许当成「跑完了」；
 * · RUN_ERROR ⇒ ⇒ 抛，且**带上端脑的原话**。
 */
export class AguiDriver {
  private readonly client: AguiClient;
  private readonly executeTool: AguiToolExecutor | undefined;
  private readonly maxContinuations: number;

  constructor(opts: AguiDriverOptions) {
    this.client = opts.client;
    this.executeTool = opts.executeTool;
    this.maxContinuations = opts.maxContinuations ?? AGUI_DEFAULT_MAX_CONTINUATIONS;
  }

  async *streamTurn(
    conversationId: string,
    messages: AguiMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<AguiDriverEvent> {
    // 每一轮**重发全量** messages[]（AG-UI 的哲学）⇒ ⇒ 用副本，别动调用方的数组。
    const sent: AguiMessage[] = messages.slice();

    for (let round = 0; ; round++) {
      if (round > this.maxContinuations) {
        throw new Error(
          'ag-ui driver exceeded ' + this.maxContinuations + ' continuations (tool loop did not settle)',
        );
      }
      let state = initialAguiTurnState();
      /** 本轮跑完、等着回传的工具结果（**按调用顺序**）。 */
      const toolResults: AguiMessage[] = [];

      for await (const ev of this.client.streamTurn(
        conversationId,
        { messages: sent },
        signal,
      )) {
        state = reduceAguiEvent(state, ev);
        if (!isKnownAguiEvent(ev)) continue;
        switch (ev.type) {
          case 'TEXT_MESSAGE_CONTENT':
            yield { kind: 'text', messageId: ev.messageId, delta: ev.delta };
            break;
          case 'TOOL_CALL_END': {
            const call = state.toolCalls.find((t) => t.toolCallId === ev.toolCallId);
            if (!call) break;
            const view = toToolCall(call);
            yield { kind: 'tool_call', call: view };
            const outcome = await this.runTool(view);
            if (!outcome.ok) {
              yield {
                kind: 'tool_failed',
                call: view,
                error: outcome.error ?? 'tool failed',
              };
            }
            toolResults.push({
              role: 'tool',
              toolCallId: call.toolCallId,
              content: outcome.content,
              ...(outcome.error ? { error: outcome.error } : {}),
            });
            break;
          }
          case 'CUSTOM': {
            const raw = ev.value;
            const v = (
              typeof raw === 'object' && raw !== null ? raw : {}
            ) as Record<string, unknown>;
            if (ev.name === AGUI_CUSTOM_NAMES.toolResult) {
              yield {
                kind: 'tool_result',
                toolCallId: typeof v.toolCallId === 'string' ? v.toolCallId : undefined,
                name: typeof v.name === 'string' ? v.name : '',
                result: v.result,
              };
            } else {
              yield { kind: 'progress', name: ev.name, value: ev.value };
            }
            break;
          }
          case 'RUN_ERROR':
            throw new Error(ev.message || 'ag-ui run failed');
          default:
            break;
        }
      }

      // ⚠️ 流跑完了但**没有** RUN_FINISHED ⇒ ⇒ 这一轮没跑完
      // ⇒ ⇒ **不许当成成功**（那会让界面显示「好了」而其实没跑完）。
      if (state.status !== 'finished') {
        throw new Error('ag-ui stream ended without RUN_FINISHED');
      }

      if (toolResults.length === 0) {
        yield {
          kind: 'finished',
          runId: state.runId,
          outcome: state.outcome,
          endState: state.endState,
        };
        return;
      }
      // ⇒ ⇒ 工具结果随**下一次请求**带回去（端脑那边就是「续轮」）。
      for (const r of toolResults) sent.push(r);
    }
  }

  private async runTool(call: AguiToolCall): Promise<AguiToolOutcome> {
    if (!this.executeTool) {
      // 这台设备干不了 ⇒ ⇒ **合成一条失败结果**回传 ⇒ ⇒ 模型不会干等。
      return {
        ok: false,
        content: '',
        error: 'this client cannot execute tool: ' + call.toolCallName,
      };
    }
    const outcome = await this.executeTool(call);
    if (!outcome || typeof outcome.content !== 'string') {
      throw new Error('ag-ui tool executor returned no content for ' + call.toolCallName);
    }
    if (!outcome.ok && !outcome.error) {
      // 失败却不说为什么 ⇒ ⇒ 等于把失败说成成功 ⇒ ⇒ 不许。
      throw new Error(
        'ag-ui tool executor reported failure without a reason: ' + call.toolCallName,
      );
    }
    return outcome;
  }
}
