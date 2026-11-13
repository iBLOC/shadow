import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/utils/chat_debug_json.dart';

/// 固定时刻 —— 断言的确定性来源（不让 `DateTime.now()` 进期望值）。
final DateTime fixedNow = DateTime.utc(2026, 11, 13, 12, 34, 56, 789);

void main() {
  group('单条消息 JSON', () {
    test('信封：schema/版本/来源/会话上下文/第几条 —— 一个不少', () {
      final messages = [
        ChatMessageModel(
          '你好，帮我看看这个报错',
          ChatRole.user,
          createdAt: DateTime.utc(2026, 11, 13, 12, 0),
        ),
        ChatMessageModel(
          '好的',
          ChatRole.assistant,
          createdAt: DateTime.utc(2026, 11, 13, 12, 1),
        ),
      ];

      final text = buildChatMessageDebugJson(
        message: messages[1],
        index: 1,
        messages: messages,
        sessionId: 'conv-42',
        agent: 'prefrontal',
        copiedAt: fixedNow,
      );
      final json = jsonDecode(text) as Map<String, dynamic>;

      expect(json['schema'], kChatDebugMessageSchema);
      expect(json['schema_version'], kChatDebugSchemaVersion);
      expect(json['source'], kChatDebugSourceMobile);
      expect(json['copied_at'], '2026-11-13T12:34:56.789Z');
      expect(json['conversation'], {
        'session_id': 'conv-42',
        'agent': 'prefrontal',
        // 标题 = 第一条**用户**发言（与界面同一条规则）。
        'title': '你好，帮我看看这个报错',
        'message_count': 2,
      });
      expect(json['message_index'], 1);
      expect(json['message']['role'], 'assistant');
      expect(json['message']['content'], '好的');
      expect(json['message']['created_at'], '2026-11-13T12:01:00.000Z');
    });

    test('工具调用：状态用连字符词、能力用线上词、参数/结果原样带上', () {
      final call = ToolCallModel(
        id: 'call-1',
        name: 'calendar_read_events',
        description: '读取日历',
        capability: Capability.calendarRead,
        requiredPermissions: const ['calendar_read'],
        args: const {'from': '2026-11-13'},
        status: ToolCallStatus.awaitingApproval,
        result: const {'events': <Object>[]},
        latencyMs: 12,
        reported: true,
        a2uiSurfaceIds: const ['surface-1'],
      );
      final message = ChatMessageModel(
        '',
        ChatRole.assistant,
        toolCall: call,
        createdAt: DateTime.utc(2026, 11, 13, 12, 2),
      );

      final text = buildChatMessageDebugJson(
        message: message,
        index: 0,
        messages: [message],
        copiedAt: fixedNow,
      );
      final payload =
          (jsonDecode(text) as Map<String, dynamic>)['message']
              as Map<String, dynamic>;
      final tool = payload['tool_call'] as Map<String, dynamic>;

      // 与桌面端 `ToolCallStatus` 同词 —— 不写 Dart 枚举名。
      expect(tool['status'], 'awaiting-approval');
      expect(tool['capability'], 'calendar_read');
      expect(tool['name'], 'calendar_read_events');
      expect(tool['args'], {'from': '2026-11-13'});
      expect(tool['result'], {'events': <Object>[]});
      expect(tool['latency_ms'], 12);
      expect(tool['a2ui_surface_ids'], ['surface-1']);
      expect(tool['reported'], true);
      // 无内容的消息不许凭空造一个内容出来。
      expect(payload['content'], '');
    });

    test('token 读数与附件：有才写，键名 snake_case', () {
      final message = ChatMessageModel(
        'answer',
        ChatRole.assistant,
        createdAt: DateTime.utc(2026, 11, 13, 12, 3),
        tokenStats: const MessageTokenStats(
          tokens: 42,
          durationMs: 2000,
          tokensPerSecond: 21.0,
        ),
      );
      final text = buildChatMessageDebugJson(
        message: message,
        index: 0,
        messages: [message],
        copiedAt: fixedNow,
      );
      final payload =
          (jsonDecode(text) as Map<String, dynamic>)['message']
              as Map<String, dynamic>;

      expect(payload['token_stats'], {
        'tokens': 42,
        'duration_ms': 2000,
        'tokens_per_second': 21.0,
      });
      // 没有附件 / 工具调用 ⇒ 那两个键不出现（不是 null 占位）。
      expect(payload.containsKey('attachment'), isFalse);
      expect(payload.containsKey('tool_call'), isFalse);
    });
  });

  group('整段聊天记录 JSON', () {
    test('逐条按原顺序、带流式尾巴与原始错误', () {
      final messages = [
        ChatMessageModel('问', ChatRole.user),
        ChatMessageModel('答', ChatRole.assistant),
        ChatMessageModel('Error: boom', ChatRole.system),
      ];
      final text = buildChatConversationDebugJson(
        messages: messages,
        sessionId: 'conv-7',
        agent: 'occipital',
        streamingText: '正在生成',
        errorMessage: 'Error: boom',
        copiedAt: fixedNow,
      );
      final json = jsonDecode(text) as Map<String, dynamic>;

      expect(json['schema'], kChatDebugConversationSchema);
      expect(json['conversation']['message_count'], 3);
      expect(
        (json['messages'] as List)
            .map((m) => (m as Map<String, dynamic>)['role'])
            .toList(),
        ['user', 'assistant', 'system'],
      );
      expect(
        (json['messages'] as List)
            .map((m) => (m as Map<String, dynamic>)['content'])
            .toList(),
        ['问', '答', 'Error: boom'],
      );
      expect(json['streaming_text'], '正在生成');
      expect(json['error_message'], 'Error: boom');
    });

    test('没有流式尾巴 / 没有错误 ⇒ 两个键都不出现', () {
      final text = buildChatConversationDebugJson(
        messages: [ChatMessageModel('问', ChatRole.user)],
        copiedAt: fixedNow,
      );
      final json = jsonDecode(text) as Map<String, dynamic>;

      expect(json.containsKey('streaming_text'), isFalse);
      expect(json.containsKey('error_message'), isFalse);
      expect(json['conversation']['session_id'], isNull);
      expect(json['conversation']['agent'], isNull);
    });
  });
}
