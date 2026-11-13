import type { Conversation, Message } from '../types';

/**
 * 聊天记录 → JSON 的**唯一**一份序列化（桌面端）。
 *
 * 用户在消息上右键 ⇒「复制为 JSON / 复制聊天记录为 JSON」⇒ 把结果贴给
 * 开发 agent 调试。移动端有一份**同 schema** 的孪生
 * （`shadow-mobile/lib/utils/chat_debug_json.dart`）—— 信封字段、键名、
 * schema 字符串两端一致，只有 `source` 与平台特有的消息字段不同。
 *
 * ⚠️ **为什么不直接 `JSON.stringify(message)`**：
 *  ① `timestamp` 是 `Date` ⇒ 需要显式转 ISO，否则不同运行时格式不一；
 *  ② 调试最需要的是**上下文**（会话 id / 叶区 / 第几条 / 一共几条），
 *     这些住在 `Conversation` 而不是消息里；
 *  ③ 键名必须稳定 —— 开发 agent 会按名字取，改一次就废掉一批经验。
 */

/** 信封版本 —— **加了字段不升版本，改了/删了字段才升**。 */
export const CHAT_DEBUG_SCHEMA_VERSION = 1;

export const CHAT_DEBUG_MESSAGE_SCHEMA = 'shadow.chat.message';
export const CHAT_DEBUG_CONVERSATION_SCHEMA = 'shadow.chat.conversation';

/** 复制来源 —— 两端同 schema，靠这个字段区分。 */
export const CHAT_DEBUG_SOURCE_DESKTOP = 'shadow-desktop';

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 一条消息的裸载荷（不带信封）—— 与移动端同 schema 的那部分。 */
export function messageToDebugJson(message: Message): Record<string, unknown> {
  const { timestamp, ...rest } = message;
  return {
    ...rest,
    // 显式归一 —— 其余字段（tool_call / token_stats / chatbi / …）原样
    // 带上：调试时「这条消息为什么长这样」的答案经常就在那些字段里。
    timestamp: toIso(timestamp),
  };
}

function conversationMeta(conversation: Conversation): Record<string, unknown> {
  return {
    id: conversation.id,
    session_id: conversation.sessionId ?? null,
    agent: conversation.agentId ?? null,
    title: conversation.title,
    // 老数据没有 kind ⇒ 界面按文本会话渲染，这里同样如实写 text。
    kind: conversation.kind ?? 'text',
    archived: conversation.archived ?? false,
    message_count: conversation.messages.length,
    created_at: toIso(conversation.createdAt),
    updated_at: toIso(conversation.updatedAt),
  };
}

function envelope(
  schema: string,
  conversation: Conversation,
  copiedAt: Date,
): Record<string, unknown> {
  return {
    schema,
    schema_version: CHAT_DEBUG_SCHEMA_VERSION,
    source: CHAT_DEBUG_SOURCE_DESKTOP,
    copied_at: copiedAt.toISOString(),
    conversation: conversationMeta(conversation),
  };
}

/**
 * 单条消息 → 可直接贴给开发 agent 的 JSON 文本。
 *
 * `index` 是这条在 `conversation.messages` 里的下标 —— 没有上下文的一条
 * 消息在调试里几乎没用（不知道它是第几轮、哪个会话）。
 */
export function buildChatMessageDebugJson({
  conversation,
  message,
  index,
  copiedAt = new Date(),
}: {
  conversation: Conversation;
  message: Message;
  index: number;
  copiedAt?: Date;
}): string {
  return JSON.stringify(
    {
      ...envelope(CHAT_DEBUG_MESSAGE_SCHEMA, conversation, copiedAt),
      message_index: index,
      message: messageToDebugJson(message),
    },
    null,
    2,
  );
}

/**
 * 整段聊天记录 → JSON 文本。
 *
 * `streamingText` / `errorMessage` 是**状态**而不是消息（流式气泡还没
 * 落进 `messages`、错误也不在消息列表里）—— 调试时它们往往正是要看的那
 * 一半 ⇒ 有就带上，没有就不写这两个键。
 */
export function buildChatConversationDebugJson({
  conversation,
  streamingText = '',
  errorMessage = null,
  copiedAt = new Date(),
}: {
  conversation: Conversation;
  streamingText?: string;
  errorMessage?: string | null;
  copiedAt?: Date;
}): string {
  return JSON.stringify(
    {
      ...envelope(CHAT_DEBUG_CONVERSATION_SCHEMA, conversation, copiedAt),
      messages: conversation.messages.map(messageToDebugJson),
      ...(streamingText !== '' ? { streaming_text: streamingText } : {}),
      ...(errorMessage != null ? { error_message: errorMessage } : {}),
    },
    null,
    2,
  );
}
