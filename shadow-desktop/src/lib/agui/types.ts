/**
 * AG-UI 1.0 的 wire 形状 —— **只认端脑真发的那几种**。
 *
 * ⚠️ 形状逐字对着端脑 `src/api/shadow/agui.rs` 的翻译表 ⇒ ⇒ 改那边就要改这边
 * （跨端对账的两份：桌面端这里 ＋ 移动端 `lib/agui/agui_events.dart`）。
 *
 * ⚠️ **官方没有 React 组件包**（`@ag-ui/react` / `ag-ui` 在 npm 上 404）⇒ ⇒ 这一层
 * 是**自己写的薄绑定**：协议用官方的形状，**不引入官方依赖** —— `@ag-ui/client`
 * 的核心是它自己的 `HttpAgent` 抽象与 endpoint 假设 ⇒ ⇒ 与影仓「会话史在服务端、
 * 自己写 driver」的架构不合 ⇒ ⇒ 我们要的是「事件类型 ＋ 归约 ＋ 我们自己的
 * wire 路径」⇒ ⇒ 这三样自己写更短，也**不与兄弟在飞的那两份 transport 文件相撞**。
 */

export interface AguiRunStarted {
  type: 'RUN_STARTED';
  threadId: string;
  runId: string;
  timestamp?: number;
  /** 1.0 producer 必须声明的协议版本（端脑填 `"1.0"`）。 */
  protocolVersion?: string;
}

export interface AguiTextMessageStart {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: string;
}

export interface AguiTextMessageContent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface AguiTextMessageEnd {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}

export interface AguiToolCallStart {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface AguiToolCallArgs {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;
}

export interface AguiToolCallEnd {
  type: 'TOOL_CALL_END';
  toolCallId: string;
}

export interface AguiRunFinished {
  type: 'RUN_FINISHED';
  runId: string;
  threadId: string;
  timestamp?: number;
  /** 1.0：缺省即 success ⇒ ⇒ 有值才带出来。 */
  outcome?: { type: string };
  metadata?: Record<string, unknown>;
}

export interface AguiRunError {
  type: 'RUN_ERROR';
  message: string;
  /** `RunErrorEvent` 的 schema 是闭合的 ⇒ ⇒ runId 配对在 metadata 里。 */
  metadata?: { runId?: string };
}

export interface AguiCustom {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}

/**
 * AG-UI 的 **activity** 事件（官方 `ACTIVITY_SNAPSHOT`）。
 *
 * ⚠️ 官方 `@ag-ui/core` 的 `ActivitySnapshotEvent` 字段就是这些 ⇒ ⇒
 * **字段数不许多**（官方 runtime 不认多字段）⇒ ⇒ 多了就是被拒 ⇒ ⇒
 * 界面上「什么都没有」⇒ ⇒ 失败长得像成功。
 *
 * ⚠️ `content` 的形状**按 activityType 走**：我们只认 `a2ui-surface`
 * 那一种（它的 content 是 A2UI v1.0 的 ops 数组）⇒ ⇒ 见 `a2uiActivity.ts`。
 */
export interface AguiActivitySnapshot {
  type: 'ACTIVITY_SNAPSHOT';
  messageId: string;
  activityType: string;
  content: unknown;
  /** 官方语义：这一条是**替换**同名 activity（不是追加）。 */
  replace?: boolean;
  timestamp?: number;
  rawEvent?: unknown;
  metadata?: Record<string, unknown>;
  subagentRunId?: string;
}

/** 归约后收着的一条 activity（**原样**：不解释、不改写）。 */
export interface AguiActivityRecord {
  messageId: string;
  activityType: string;
  content: unknown;
  replace?: boolean;
}

/** 端脑发的 CUSTOM 名字（**逐字**对着端脑 `agui.rs` 里那四处 `custom(...)` 调用）。 */
export const AGUI_CUSTOM_NAMES = {
  /** lobe 本地工具的结果（**不是** AG-UI 的 TOOL_CALL_RESULT —— 端脑刻意不发那个）。 */
  toolResult: 'telencephalon_tool_result',
  step: 'step',
  route: 'route',
  handoff: 'handoff',
} as const;

/** 归约后收着的一条 CUSTOM（**原样**：不解释、不改写）。 */
export interface AguiCustomRecord {
  name: string;
  value: unknown;
}

/** 规范要求消费者**忽略不认识的类型** ⇒ ⇒ 保留原样，不当错误。 */
export interface AguiUnknownEvent {
  type: string;
  [k: string]: unknown;
}

/** 我们真认的那几种（**判据里带具体字段的就是它们**）。 */
export type AguiKnownEvent =
  | AguiRunStarted
  | AguiTextMessageStart
  | AguiTextMessageContent
  | AguiTextMessageEnd
  | AguiToolCallStart
  | AguiToolCallArgs
  | AguiToolCallEnd
  | AguiRunFinished
  | AguiRunError
  | AguiActivitySnapshot
  | AguiCustom;

export type AguiEvent = AguiKnownEvent | AguiUnknownEvent;

/** 认得的事件类型（**逐字**对着端脑 `agui.rs` 的翻译表）。 */
export const AGUI_KNOWN_EVENT_TYPES = [
  'RUN_STARTED',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'TOOL_CALL_START',
  'TOOL_CALL_ARGS',
  'TOOL_CALL_END',
  'RUN_FINISHED',
  'RUN_ERROR',
  'ACTIVITY_SNAPSHOT',
  'CUSTOM',
] as const;

// ---- 请求面（端脑 `RunAgentInputLite`）------------------------------------

/**
 * 多模态 part 的 `source` —— AG-UI 规范形状。
 *
 * ⚠️ `data` = **内联 base64**（规范要求 `mimeType`）⇒ ⇒ 端脑直接收，不下载。
 * ⚠️ `url` = 规范允许 HTTP(S) **或 data URL** ⇒ ⇒ 但端脑**不去拉远程 URL**
 * ⇒ ⇒ 远程 URL 会**响亮地拒**（400，说清「请内联」）⇒ ⇒ 客户端**必须内联字节**。
 */
export interface AguiSource {
  type: 'data' | 'url';
  value: string;
  mimeType?: string;
}

export interface AguiTextPart {
  type: 'text';
  text: string;
}

export interface AguiBinaryPart {
  type: 'image' | 'document' | 'audio';
  source: AguiSource;
}

export type AguiContentPart = AguiTextPart | AguiBinaryPart;

export interface AguiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | AguiContentPart[];
  /** 工具结果消息要带它 —— 端脑按它把结果配回那次调用（缺了就认不出是哪一次）。 */
  toolCallId?: string;
  /**
   * 工具**失败**的原因 —— 端脑那边「`error` 在场 ⇒ ⇒ 状态就是 failed」。
   *
   * ⚠️ 失败**不许**长得像成功 ⇒ ⇒ 工具失败必须把这个字段带上，
   * 不能只把失败原因塞进 `content`（那样端脑会当成成功的结果）。
   */
  error?: string;
}

export interface AguiTool {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface AguiRunRequest {
  threadId?: string;
  runId?: string;
  messages: AguiMessage[];
  tools?: AguiTool[];
}
