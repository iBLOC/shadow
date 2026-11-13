library;

import 'dart:convert';

import '../providers/chat_provider.dart';
import '../services/client_tools/client_tool_registry.dart';
import 'conversation_title.dart';

/// 聊天记录 → JSON 的**唯一**一份序列化（移动端）。
///
/// 用户长按一条消息 ⇒ 菜单里「复制为 JSON / 复制聊天记录为 JSON」⇒
/// 把结果贴给开发 agent 调试。桌面端有一份**同 schema**的孪生
/// （`shadow-desktop/src/lib/chatDebugJson.ts`）—— 字段名、信封形状
/// 两端一致，只有 `source` 与平台特有的消息字段不同。
///
/// ⚠️ **为什么不直接 `jsonEncode(message)`**：
/// ① 客户端模型是**解析后**的形状 —— 枚举、DateTime、工具调用对象都
///    编不出稳定 JSON（枚举靠 `toString()`、时间靠平台默认格式）；
/// ② 调试最需要的是**上下文**（会话 id / 叶区 / 第几条 / 一共几条），
///    这些住在 `ChatState` 而不是消息里；
/// ③ 字段名必须稳定 —— 开发 agent 会按名字取，改一次名字就废掉一批经验。
/// ⇒ ⇒ 所以这里显式列字段（**不是** `toJson()` 的翻版，也不做兜底反射）。

/// 信封版本 —— **加了字段不升版本，改了/删了字段才升**。
const int kChatDebugSchemaVersion = 1;

const String kChatDebugMessageSchema = 'shadow.chat.message';
const String kChatDebugConversationSchema = 'shadow.chat.conversation';

/// 复制来源 —— 两端同 schema，靠这个字段区分。
const String kChatDebugSourceMobile = 'shadow-mobile';

const JsonEncoder _pretty = JsonEncoder.withIndent('  ');

/// 单条消息 → 可直接贴给开发 agent 的 JSON 文本。
///
/// [messages] 是**整段对话**（用来报 `message_count` 与推导标题），
/// [index] 是这条在其中的下标。⚠️ 两者都必填 —— 没有上下文的
/// 「一条消息 JSON」在调试里几乎没用（不知道它是第几轮、哪个会话）。
String buildChatMessageDebugJson({
  required ChatMessageModel message,
  required int index,
  required List<ChatMessageModel> messages,
  String? sessionId,
  String? agent,
  DateTime? copiedAt,
}) {
  return _pretty.convert({
    ..._envelope(
      schema: kChatDebugMessageSchema,
      messages: messages,
      sessionId: sessionId,
      agent: agent,
      copiedAt: copiedAt,
    ),
    'message_index': index,
    'message': messageToDebugJson(message),
  });
}

/// 整段聊天记录 → JSON 文本。
///
/// [streamingText] / [errorMessage] 是**状态**而不是消息（流式气泡还没
/// 落进 `messages`、错误横幅也不在消息列表里）—— 调试时它们往往正是
/// 要看的那一半 ⇒ ⇒ 有就带上，没有就不写这两个键。
String buildChatConversationDebugJson({
  required List<ChatMessageModel> messages,
  String? sessionId,
  String? agent,
  String streamingText = '',
  String? errorMessage,
  DateTime? copiedAt,
}) {
  return _pretty.convert({
    ..._envelope(
      schema: kChatDebugConversationSchema,
      messages: messages,
      sessionId: sessionId,
      agent: agent,
      copiedAt: copiedAt,
    ),
    'messages': messages.map(messageToDebugJson).toList(),
    if (streamingText.isNotEmpty) 'streaming_text': streamingText,
    'error_message': ?errorMessage,
  });
}

/// 一条消息的裸载荷（不带信封）—— 桌面/移动同 schema 的那部分。
Map<String, Object?> messageToDebugJson(ChatMessageModel message) {
  final toolCall = message.toolCall;
  final stats = message.tokenStats;
  return {
    'role': _roleWire(message.role),
    'content': message.content,
    'created_at': message.createdAt?.toUtc().toIso8601String(),
    if (message.attachmentPath != null || message.attachmentType != null)
      'attachment': {
        'path': message.attachmentPath,
        'type': message.attachmentType?.name,
      },
    if (toolCall != null) 'tool_call': _toolCallToDebugJson(toolCall),
    if (stats != null)
      'token_stats': {
        'tokens': stats.tokens,
        'duration_ms': stats.durationMs,
        'tokens_per_second': stats.tokensPerSecond,
      },
  };
}

Map<String, Object?> _envelope({
  required String schema,
  required List<ChatMessageModel> messages,
  required String? sessionId,
  required String? agent,
  required DateTime? copiedAt,
}) {
  return {
    'schema': schema,
    'schema_version': kChatDebugSchemaVersion,
    'source': kChatDebugSourceMobile,
    'copied_at': (copiedAt ?? DateTime.now()).toUtc().toIso8601String(),
    'conversation': {
      'session_id': sessionId,
      'agent': agent,
      // 标题与界面同源（`deriveConversationTitle`）—— 两端不会各写一份。
      'title': _conversationTitle(messages),
      'message_count': messages.length,
    },
  };
}

String? _conversationTitle(List<ChatMessageModel> messages) {
  for (final m in messages) {
    if (m.role != ChatRole.user) continue;
    final title = deriveConversationTitle(m.content);
    if (title != null) return title;
  }
  return null;
}

String _roleWire(ChatRole role) {
  switch (role) {
    case ChatRole.user:
      return 'user';
    case ChatRole.assistant:
      return 'assistant';
    case ChatRole.system:
      return 'system';
  }
}

/// 工具调用载荷 —— 键名与桌面端 `ToolCallMessage` 的线上形状一致。
///
/// ⚠️ `status` 用**连字符词**（`awaiting-approval`）而不是 Dart 枚举名
/// （`awaitingApproval`）：两端贴出来的 JSON 要与桌面端逐字同词，
/// 开发 agent 不必记两套。
Map<String, Object?> _toolCallToDebugJson(ToolCallModel call) {
  return {
    'id': call.id,
    'name': call.name,
    'description': call.description,
    'capability': call.capability?.wire,
    'required_permissions': call.requiredPermissions,
    'args': call.args,
    'status': _toolCallStatusWire(call.status),
    'result': call.result,
    'error_text': call.errorText,
    'latency_ms': call.latencyMs,
    'a2ui_surface_ids': call.a2uiSurfaceIds,
    'reported': call.reported,
    'report_error_text': call.reportErrorText,
  };
}

String _toolCallStatusWire(ToolCallStatus status) {
  switch (status) {
    case ToolCallStatus.pending:
      return 'pending';
    case ToolCallStatus.running:
      return 'running';
    case ToolCallStatus.awaitingApproval:
      return 'awaiting-approval';
    case ToolCallStatus.succeeded:
      return 'succeeded';
    case ToolCallStatus.failed:
      return 'failed';
  }
}
