import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

class MockTts extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

/// 捕获「每次发消息的请求体」的端脑 mock。
class CaptureClient extends TelencephalonClient {
  final List<SendMessageRequest> requests = [];

  CaptureClient() : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    final now = DateTime.now();
    return Conversation(
      id: 'conv-1',
      agent: agent ?? 'test-agent',
      createdAt: now,
      updatedAt: now,
      history: const [],
    );
  }

  @override
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    requests.add(req);
    yield StreamEvent(type: 'delta', delta: 'ok');
  }
}

/// **「档位进端脑」那一格的端到端判据** ——
/// 证明「档位」**真的随消息发出去了**，而不只是「有个函数能算出来」。
///
/// ⚠️ 为什么必须有这一层：纯函数判据只证明「`capabilityModesPayload` 能算」
/// ⇒ ⇒ **不证明**发送点把它接上了 ⇒ ⇒ 那正是「构造了但没发出去」
/// ⇒ ⇒ **失败长得像成功**的经典形态。
void main() {
  group('档位随消息发出去（端到端）', () {
    test('发出去的那条消息里，真带着每一档', () async {
      final client = CaptureClient();
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry(),
        capabilityModeFor: (c) => switch (c) {
          Capability.calendarRead => AuthorizationMode.fullAccess,
          Capability.calendarWrite => AuthorizationMode.askEveryTime,
          Capability.contacts => AuthorizationMode.disabled,
          Capability.sms => AuthorizationMode.askEveryTime,
          Capability.photos => AuthorizationMode.askEveryTime,
          Capability.notificationsRead => AuthorizationMode.askEveryTime,
          Capability.mobileUse => AuthorizationMode.fullAccess,
        },
      );

      await notifier.generateResponse('你好');

      expect(client.requests, isNotEmpty);
      final req = client.requests.single;
      expect(req.capabilityModes, isNotNull);
      expect(req.capabilityModes!['calendar_read'], 'full');
      expect(req.capabilityModes!['calendar_write'], 'ask');
      expect(req.capabilityModes!['contacts'], 'off');
      expect(req.capabilityModes!['mobile_use'], 'full');
    });

    test('⚠️ 档位是在**运行时**读的（用户在设置里改完 ⇒ ⇒ 下一条消息就变了）', () async {
      final client = CaptureClient();
      var mode = AuthorizationMode.askEveryTime;
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry(),
        capabilityModeFor: (c) => mode,
      );

      await notifier.generateResponse('第一条');
      expect(client.requests.single.capabilityModes!['calendar_read'], 'ask');

      // ⇒ ⇒ 用户在设置里把它改成「完全访问」。
      mode = AuthorizationMode.fullAccess;
      await notifier.generateResponse('第二条');
      expect(client.requests.last.capabilityModes!['calendar_read'], 'full');
    });

    test('⚠️ 老端脑：字段是**多出来**的 ⇒ ⇒ 不影响既有字段', () async {
      final client = CaptureClient();
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry(),
      );

      await notifier.generateResponse('你好');
      final json = client.requests.single.toJson();
      expect(json.containsKey('text'), isTrue);
      expect(json.containsKey('capability_modes'), isTrue);
    });
  });
}
