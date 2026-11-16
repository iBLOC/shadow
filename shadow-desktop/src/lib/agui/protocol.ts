import { AGUI_CUSTOM_NAMES, AGUI_KNOWN_EVENT_TYPES } from './types';
import type { AguiCustomRecord, AguiEvent, AguiKnownEvent } from './types';

/** 读一个「可能是字符串」的值（**不猜**）—— 形状不对就当没有。 */
function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * SSE 的 `data:` 载荷 —— 端脑只发 `data:`（**不带 event 名**）⇒ ⇒ 读 data JSON
 * 里的 `type` 判事件（端脑 `agui.rs` 模块头逐字记着这一条）。
 *
 * ⚠️ **为什么按行取而不是按空行取**：SSE 规范里 `data:` 可以多行、空行收尾；
 * 但端脑发的**每一帧就是一行 data**（axum 的 `Sse` 逐事件写一行）⇒ ⇒ 按行取
 * 既够用又与移动端那份**同一口径** ⇒ ⇒ 两端的 SSE 解析不会各写各的。
 *
 * @param buffer 已经收到的文本（可能以半行结尾）
 * @returns 完整的 data 载荷 ＋ 留在 buffer 里的半行
 */
export function parseSseDataLines(buffer: string): { payloads: string[]; rest: string } {
  const lines = buffer.split('\n');
  // 最后一段可能还没收全 ⇒ ⇒ 留到下一块（**不是**丢掉）。
  const rest = lines.pop() ?? '';
  const payloads: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '').trim();
    if (line === '' || line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload !== '') payloads.push(payload);
  }
  return { payloads, rest };
}

/**
 * 一行 data ⇒ ⇒ 一个事件。
 *
 * ⚠️ **坏 JSON ⇒ 抛**（响亮）—— 静默跳过事件＝用户看着「回复少了一段」却不知道为什么。
 * ⚠️ **类型不认识 ⇒ 不抛**（规范要求消费者忽略未知类型）⇒ ⇒ 但**记下来**。
 */
export function parseAguiEvent(payload: string): AguiEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('ag-ui event is not valid JSON: ' + payload.slice(0, 200));
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('ag-ui event must be a JSON object');
  }
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== 'string') {
    throw new Error('ag-ui event carries no type');
  }
  return parsed as AguiEvent;
}

/** 一轮对话在客户端这一侧归约出来的状态。 */
export interface AguiTurnState {
  runId: string | null;
  threadId: string | null;
  protocolVersion: string | null;
  status: 'running' | 'finished' | 'failed';
  /** 文本消息段（一段 = 一条 messageId）。 */
  messages: AguiMessageSegment[];
  /** 工具调用（一次 = 一个 toolCallId）。 */
  toolCalls: AguiToolCallState[];
  /** 失败时端脑的原话（**不改写**）。 */
  error: string | null;
  /** 1.0 的收口结果（缺省即 success ⇒ ⇒ 没有这一项时是 null）。 */
  outcome: string | null;
  /** 不认识的事件类型（规范：忽略，但**出声**）。 */
  unknownEventTypes: string[];
  /** 端脑发的 CUSTOM（工具结果／step／route／handoff）—— **原样收着，不丢**。 */
  customs: AguiCustomRecord[];
  /** 端脑自己的收口状态（`RUN_FINISHED.metadata.telencephalonState`）—— 原样带出。 */
  endState: string | null;
}

export interface AguiMessageSegment {
  messageId: string;
  role: string;
  text: string;
  ended: boolean;
}

export interface AguiToolCallState {
  toolCallId: string;
  toolCallName: string;
  args: string;
  parentMessageId?: string;
  ended: boolean;
}

export function initialAguiTurnState(): AguiTurnState {
  return {
    runId: null,
    threadId: null,
    protocolVersion: null,
    status: 'running',
    messages: [],
    toolCalls: [],
    error: null,
    outcome: null,
    unknownEventTypes: [],
    customs: [],
    endState: null,
  };
}

/**
 * 归约一个事件 ⇒ ⇒ 新状态（**纯函数**：不碰 DOM、不发请求）。
 *
 * ⚠️ 归约**只认自己那一档**的事件 ⇒ ⇒ 别的类型原样透传（客户端层要能自己处理）。
 */
/** 认得的事件？⇒ ⇒ 归约器里才能拿到**具体字段**（类型收窄靠它）。 */
export function isKnownAguiEvent(event: AguiEvent): event is AguiKnownEvent {
  return (AGUI_KNOWN_EVENT_TYPES as readonly string[]).indexOf(event.type) >= 0;
}

export function reduceAguiEvent(state: AguiTurnState, event: AguiEvent): AguiTurnState {
  // ⚠️ **不认识的事件类型 ⇒ 记下来、不炸**（规范:消费者忽略未知类型）
  // ⇒ ⇒ 这一段**必须在 switch 之前** ⇒ ⇒ 否则类型收窄不出来。
  if (!isKnownAguiEvent(event)) {
    if (state.unknownEventTypes.indexOf(event.type) >= 0) return state;
    return {
      ...state,
      unknownEventTypes: state.unknownEventTypes.concat(event.type),
    };
  }
  switch (event.type) {
    case 'RUN_STARTED':
      return {
        ...state,
        runId: event.runId,
        threadId: event.threadId,
        protocolVersion: event.protocolVersion ?? state.protocolVersion,
      };
    case 'TEXT_MESSAGE_START': {
      const messages = state.messages.slice();
      const at = messages.findIndex((m) => m.messageId === event.messageId);
      if (at >= 0) {
        messages[at] = { ...messages[at], role: event.role || messages[at].role };
      } else {
        messages.push({ messageId: event.messageId, role: event.role, text: '', ended: false });
      }
      return { ...state, messages };
    }
    case 'TEXT_MESSAGE_CONTENT': {
      const messages = state.messages.slice();
      const at = messages.findIndex((m) => m.messageId === event.messageId);
      if (at >= 0) {
        messages[at] = { ...messages[at], text: messages[at].text + event.delta };
      }
      return { ...state, messages };
    }
    case 'TEXT_MESSAGE_END': {
      const messages = state.messages.map((m) =>
        m.messageId === event.messageId ? { ...m, ended: true } : m,
      );
      return { ...state, messages };
    }
    case 'TOOL_CALL_START': {
      const toolCalls = state.toolCalls.slice();
      const at = toolCalls.findIndex((t) => t.toolCallId === event.toolCallId);
      if (at >= 0) {
        toolCalls[at] = { ...toolCalls[at], toolCallName: event.toolCallName };
      } else {
        toolCalls.push({
          toolCallId: event.toolCallId,
          toolCallName: event.toolCallName,
          args: '',
          parentMessageId: event.parentMessageId,
          ended: false,
        });
      }
      return { ...state, toolCalls };
    }
    case 'TOOL_CALL_ARGS': {
      const toolCalls = state.toolCalls.map((t) =>
        t.toolCallId === event.toolCallId ? { ...t, args: t.args + event.delta } : t,
      );
      return { ...state, toolCalls };
    }
    case 'TOOL_CALL_END': {
      const toolCalls = state.toolCalls.map((t) =>
        t.toolCallId === event.toolCallId ? { ...t, ended: true } : t,
      );
      return { ...state, toolCalls };
    }
    case 'RUN_FINISHED':
      return {
        ...state,
        status: 'finished',
        runId: event.runId ?? state.runId,
        threadId: event.threadId ?? state.threadId,
        outcome: event.outcome ? event.outcome.type : null,
        endState: readString(event.metadata?.telencephalonState),
      };
    case 'RUN_ERROR':
      // ⚠️ `RunErrorEvent` 的 schema 是闭合的 ⇒ ⇒ runId 配在 metadata 里
      // ⇒ ⇒ **失败也要能对上这一轮**（不然报错落不到具体哪一轮）。
      return {
        ...state,
        status: 'failed',
        error: event.message,
        runId: event.metadata?.runId ?? state.runId,
      };
    case 'CUSTOM':
      // ⚠️ lobe 本地工具的结果、step／route／handoff **全走 CUSTOM**
      // ⇒ ⇒ 归约器**不许吞掉** ⇒ ⇒ 原样收着（**不解释、不改写**）。
      return {
        ...state,
        customs: state.customs.concat({ name: event.name, value: event.value }),
      };
    default:
      // ⚠️ `isKnownAguiEvent` 已经把未知类型挡在前面 ⇒ ⇒ 这里**到不了**
      // ⇒ ⇒ 留着只是为了让 TS 知道这个 switch 是穷尽的。
      return state;
  }
}

/** 端脑发的那种工具结果（**lobe 本地工具**，走 CUSTOM 而不是 TOOL_CALL_RESULT）。 */
export interface AguiToolResultRecord {
  agent: string;
  name: string;
  result: unknown;
  toolCallId?: string;
}

/**
 * 从 CUSTOM 里挑出工具结果 —— **只挑端脑真发的那种名字**（不猜、不编）。
 *
 * ⚠️ 端脑**刻意不发** AG-UI 的 `TOOL_CALL_RESULT`（那要客户端把结果回传上去，
 * 与影仓「结果直接落在会话里」的架构不合）⇒ ⇒ 工具结果只走 CUSTOM 这一条路。
 */
export function aguiToolResults(state: AguiTurnState): AguiToolResultRecord[] {
  const out: AguiToolResultRecord[] = [];
  for (const c of state.customs) {
    if (c.name !== AGUI_CUSTOM_NAMES.toolResult) continue;
    const v = (
      typeof c.value === 'object' && c.value !== null ? c.value : {}
    ) as Record<string, unknown>;
    out.push({
      agent: readString(v.agent) ?? '',
      name: readString(v.name) ?? '',
      result: v.result,
      ...(typeof v.toolCallId === 'string' ? { toolCallId: v.toolCallId } : {}),
    });
  }
  return out;
}
