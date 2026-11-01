import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/router/app_router.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

import 'test_helper.dart';

/// 移动端的「多会话」—— 以前**切不了**。
///
/// ① `ChatNotifier` 只有**一条**会话（`_currentSessionId`）
/// ⇒ 会话列表页点开任何一条历史会话，**看到的还是当前那条**
/// ⇒ 「点了一下像切了会话，实际没切」⇒ **失败长得像成功**；
/// ② 会话列表页把 `sessionId` 用 `context.push(..., extra: {...})` 带过去，
/// 而**路由压根不读 `state.extra`** ⇒ ⇒ 那个 id **带过去就丢了**；
/// ③ 「新对话」对话框里那个**标题输入框无处可存**（端脑的会话没有标题
/// 字段）⇒ 而「创建」按钮只是 `Navigator.pop` ⇒ **什么也没创建**；
/// ④ 会话管理页在 UI 上**没有入口** ⇒ 用户根本进不去。
class MockTelencephalonClient extends TelencephalonClient {
  MockTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:60080');

  int createConversationCalls = 0;
  int streamMessageCalls = 0;
  String? lastStreamedConversationId;

  /// 端脑侧「存着」的会话。
  final Map<String, Conversation> conversations = {};

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    createConversationCalls++;
    final now = DateTime.now();
    final conversation = Conversation(
      id: 'conv-new-$createConversationCalls',
      agent: agent ?? 'temporal',
      createdAt: now,
      updatedAt: now,
      history: const [],
    );
    conversations[conversation.id] = conversation;
    return conversation;
  }

  @override
  Future<Conversation> getConversation(String id) async {
    final conversation = conversations[id];
    if (conversation == null) {
      throw Exception('no such conversation: $id');
    }
    return conversation;
  }

  @override
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    streamMessageCalls++;
    lastStreamedConversationId = conversationId;
    yield StreamEvent(type: 'delta', delta: '这是一条测试回复');
    yield StreamEvent(
      type: 'done',
      agent: 'temporal',
      conversationId: conversationId,
    );
  }
}

class MockTtsEngine extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

void main() {
  testSetup();

  MockTelencephalonClient clientWithHistory() {
    final client = MockTelencephalonClient();
    final now = DateTime.now();
    client.conversations['conv-1'] = Conversation(
      id: 'conv-1',
      agent: 'temporal',
      createdAt: now,
      updatedAt: now,
      history: [
        ConversationTurn(role: 'user', text: '第一条问题', timestamp: now),
        ConversationTurn(role: 'agent', text: '第一条回答', timestamp: now),
      ],
    );
    return client;
  }

  group('移动端多会话', () {
    test('switchTo：载入历史 + 角色映射 + 之后的消息续在它上面', () async {
      final client = clientWithHistory();
      final container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(MockTtsEngine(), client),
          ),
        ],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(chatProvider.notifier)
          .switchTo('conv-1');
      expect(ok, isTrue);

      final state = container.read(chatProvider);
      expect(state.sessionId, 'conv-1');
      expect(state.messages.length, 2);
      expect(state.messages[0].role, ChatRole.user);
      // ⚠️ 线上角色是 `agent`（不是 `assistant`）⇒ 只认 assistant 的话，
      // 每一句助手回复都会被画成「系统消息」气泡。
      expect(state.messages[1].role, ChatRole.assistant);
      expect(state.messages[1].content, '第一条回答');

      // 下一条消息**续在它上面** ⇒ 不再新建会话。
      await container.read(chatProvider.notifier).generateResponse('继续');
      expect(client.lastStreamedConversationId, 'conv-1');
      expect(client.createConversationCalls, 0);
    });

    test('switchTo 到不存在的会话 ⇒ 失败并说清楚，不静默', () async {
      final client = clientWithHistory();
      final container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(MockTtsEngine(), client),
          ),
        ],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(chatProvider.notifier)
          .switchTo('conv-missing');
      expect(ok, isFalse);
      expect(container.read(chatProvider).errorMessage, isNotNull);
    });

    test('startNewConversation：开一条新会话并切过去', () async {
      final client = clientWithHistory();
      final container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(MockTtsEngine(), client),
          ),
        ],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(chatProvider.notifier)
          .startNewConversation();
      expect(ok, isTrue);

      final state = container.read(chatProvider);
      expect(state.sessionId, 'conv-new-1');
      expect(state.messages, isEmpty);
      expect(client.createConversationCalls, 1);
    });

    testWidgets('从会话列表点开一条历史会话 ⇒ 真的切过去（路由级）', (
      tester,
    ) async {
      final client = clientWithHistory();
      final container = ProviderContainer(
        overrides: [
          telencephalonClientProvider.overrideWithValue(client),
          chatProvider.overrideWith(
            (ref) => ChatNotifier(MockTtsEngine(), client),
          ),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: appRouter,
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh')],
          ),
        ),
      );
      await tester.pump();

      // 「点开会话列表里的一条」⇒ 路由带 extra 过去。
      // ⚠️ 这一条就是**回归点**：路由以前压根不读 `state.extra`
      // ⇒ 那个 sessionId 带过去就丢了 ⇒ 看到的还是当前那条会话。
      appRouter.go(AppRoutes.chat, extra: {'sessionId': 'conv-1'});
      await tester.pump();
      await tester.pump();

      expect(container.read(chatProvider).sessionId, 'conv-1');
      final messages = container.read(chatProvider).messages;
      expect(messages.length, 2);
      expect(messages[1].role, ChatRole.assistant);
    });
  });
}
