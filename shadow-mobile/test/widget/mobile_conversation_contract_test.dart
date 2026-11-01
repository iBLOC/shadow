import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/router/app_router.dart';
import 'package:shadow_mobile/tts_engine.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/conversation_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// 端脑**真的**会回的那份 JSON —— 逐字照抄 Rust 那边的 serde 形状：
///
/// - `telencephalon/src/api/shadow.rs` 的 `ConversationView`
///   `{ id, agent, created_at, updated_at, history[] }`
/// - `telencephalon/src/api/shadow/conversations.rs` 的 `ConversationTurn`
///   `{ role, text, at }`
///
/// 两个容易踩空的点，都在这份 fixture 里：
/// ① `role` 是 serde 的**小写变体名**：`user` / `agent`（**不是** `assistant`）；
/// ② 时间是 chrono 的 RFC3339 ⇒ **可能带 9 位纳秒**（`SecondsFormat::AutoSi`）
///    ⇒ 客户端必须吃得下（实测 Dart 的 `DateTime.parse` 会截到微秒，不抛）。
Map<String, dynamic> serverConversation(
  String id,
  String agent,
  List<Map<String, String>> history,
) => {
  'id': id,
  'agent': agent,
  'created_at': '2026-11-01T04:23:45.123456789Z',
  'updated_at': '2026-11-01T05:00:00.987654321Z',
  'history': history
      .map(
        (h) => {
          'role': h['role'],
          'text': h['text'],
          'at': '2026-11-01T04:23:45.123456789Z',
        },
      )
      .toList(),
};

const _historyA = [
  {'role': 'user', 'text': '第一条问题'},
  {'role': 'agent', 'text': '第一条回答'},
];


/// TTS 不打真接口（测试里没有平台通道）。
class MockTtsEngine extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}
const _historyB = [
  {'role': 'user', 'text': '另一条会话的问题'},
];

void main() {
  testSetup();

  /// 造一个**真 client**，只是把 socket 换成 `MockClient`。
  ///
  /// ⚠️ 为什么不用「整个 client 都 mock 掉」（上一轮那份多会话测试那样做）：
  /// 那样测的是「我们以为服务端长什么样」⇒ **端点不存在 / JSON 形状对不上 /
  /// 钥匙没带 ⇒ 全都测不出来** ⇒ 失败长得像成功。
  /// 这里只替换**传输层**：请求路径、请求头、JSON 解析、错误映射
  /// 全都是生产代码在跑。
  TelencephalonClient liveClient(
    Future<http.Response> Function(http.Request) handler, {
    String? apiKey = 'shadow-key-abc',
  }) => TelencephalonClient(
    baseUrl: 'http://127.0.0.1:60080',
    apiKey: apiKey,
    client: MockClient(handler),
  );

  group('端脑会话契约（真 client + 真 HTTP 传输层）', () {
    test('列表：端脑那份 JSON 能被解析，且请求带着端脑面的钥匙', () async {
      final seen = <http.Request>[];
      final client = liveClient((req) async {
        seen.add(req);
        return http.Response(
          jsonEncode([
            serverConversation('conv-a', 'temporal', _historyA),
            serverConversation('conv-b', 'prefrontal', _historyB),
          ]),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final list = await client.listConversations();

      expect(list.length, 2);
      expect(list[0].id, 'conv-a');
      expect(list[0].agent, 'temporal');
      expect(list[0].history.length, 2);
      // 线上角色是 `user` / `agent` ⇒ 只认 `assistant` 的话，
      // 每一句助手回复都会被画成「系统消息」气泡。
      expect(list[0].history[0].role, 'user');
      expect(list[0].history[1].role, 'agent');
      // chrono 的 9 位纳秒时间戳也要吃得下。
      expect(list[0].createdAt.year, 2026);
      expect(list[0].updatedAt.month, 11);

      // 请求打在哪、带没带钥匙 —— 端脑面是 **shadow ∪ admin** 的读门，
      // 没带 `X-Shadow-Key` 就是 401 ⇒ 而 401 在旧 UI 上**长得像「没有会话」**。
      expect(seen.single.url.path, '/shadow/v1/conversations');
      expect(seen.single.headers['X-Shadow-Key'], 'shadow-key-abc');
    });

    test('端脑拒了（401）⇒ 客户端**抛**，不是回一个空列表', () async {
      final client = liveClient(
        (req) async => http.Response(
          jsonEncode({
            'error': {'code': 4010, 'message': 'unauthorized'},
          }),
          401,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      );

      await expectLater(
        client.listConversations(),
        throwsA(isA<TelencephalonException>()),
      );
    });

    test('取单条会话：端脑那份 JSON 也能被解析', () async {
      final client = liveClient(
        (req) async => http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      );

      final conversation = await client.getConversation('conv-a');
      expect(conversation.id, 'conv-a');
      expect(conversation.history.length, 2);
    });
  });

  group('会话列表：「真的没有」与「问不到」不是一回事', () {
    Future<ProviderContainer> pumpList(
      WidgetTester tester,
      Future<http.Response> Function(http.Request) handler,
    ) async {
      final container = ProviderContainer(
        overrides: [
          telencephalonClientProvider.overrideWithValue(liveClient(handler)),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh')],
            home: const ConversationScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return container;
    }

    testWidgets('读失败 ⇒ 显示真实原因，**不是**「暂无会话」', (tester) async {
      await pumpList(tester, (req) async {
        return http.Response(
          jsonEncode({
            'error': {'code': 4010, 'message': 'unauthorized'},
          }),
          401,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final l10n = l10nOf(tester);
      // 失败要说真话：状态码得**看得见**。
      expect(find.textContaining('401'), findsWidgets);
      // 而「真的没有会话」那句话**不许出现** ——
      // 出现它就等于把「问不到」说成「没有」⇒ 失败长得像成功。
      expect(find.text(l10n.conversationEmpty), findsNothing);
      expect(find.text(l10n.conversationEmptyHint), findsNothing);
    });

    testWidgets('真的没有会话 ⇒ 显示「暂无会话」', (tester) async {
      await pumpList(tester, (req) async {
        return http.Response(
          '[]',
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final l10n = l10nOf(tester);
      expect(find.text(l10n.conversationEmpty), findsOneWidget);
      expect(find.textContaining('错误'), findsNothing);
    });

    testWidgets('读成功 ⇒ 两条会话各占一行（标题取用户第一句话）', (tester) async {
      await pumpList(tester, (req) async {
        return http.Response(
          jsonEncode([
            serverConversation('conv-a', 'temporal', _historyA),
            serverConversation('conv-b', 'prefrontal', _historyB),
          ]),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final l10n = l10nOf(tester);
      // ⚠️ 标题以前是**叶区名** ⇒ 同一个叶区的所有会话长得一模一样 ⇒
      // 现在标题取**用户自己说过的第一句话**（端脑的 history 带着完整轮次 ⇒
      // 零成本）。
      expect(find.text('第一条问题'), findsOneWidget);
      expect(find.text('另一条会话的问题'), findsOneWidget);
      // 叶区名没丢 —— 它在副标签那行。
      expect(find.textContaining('temporal'), findsOneWidget);
      expect(find.textContaining('prefrontal'), findsOneWidget);
      expect(find.text(l10n.conversationEmpty), findsNothing);
    });

    testWidgets('失败态点「刷新」⇒ 真的重发一次请求', (tester) async {
      var gets = 0;
      await pumpList(tester, (req) async {
        if (req.method == 'GET') gets++;
        return http.Response(
          jsonEncode({
            'error': {'code': 4010, 'message': 'unauthorized'},
          }),
          401,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final l10n = l10nOf(tester);
      expect(gets, 1);

      await tester.tap(find.text(l10n.commonRefresh));
      await tester.pumpAndSettle();

      expect(gets, 2);
    });
  });

  group('切会话 / 新开会话（真 client + 真 HTTP）', () {
    test('切会话：拉的是**那条**会话，下一条消息**续在它上面**（不新建）', () async {
      final requests = <http.Request>[];
      final client = liveClient((req) async {
        requests.add(req);
        if (req.url.path.endsWith(':stream')) {
          return http.Response(
            'data: {"type":"delta","delta":"续上的回复"}\n'
            'data: {"type":"done","conversation_id":"conv-a"}\n',
            200,
            headers: {'content-type': 'text/event-stream; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      final ok = await notifier.switchTo('conv-a');
      expect(ok, isTrue);

      // 拉的是**那条**会话（路径带 id），历史照端脑那份形状装进来。
      expect(requests.single.url.path, '/shadow/v1/conversations/conv-a');
      expect(notifier.state.sessionId, 'conv-a');
      expect(notifier.state.messages.length, 2);
      expect(notifier.state.messages[0].role, ChatRole.user);
      expect(notifier.state.messages[1].role, ChatRole.assistant);
      expect(notifier.state.messages[1].content, '第一条回答');

      // 下一条消息**续在它上面** ⇒ 不新建会话。
      await notifier.generateResponse('继续');
      final stream = requests.lastWhere((r) => r.url.path.endsWith(':stream'));
      expect(
        stream.url.path,
        '/shadow/v1/conversations/conv-a/messages:stream',
      );
      expect(
        requests.where(
          (r) => r.method == 'POST' && r.url.path == '/shadow/v1/conversations',
        ),
        isEmpty,
      );
      // SSE 里的 delta 真的变成了气泡。
      expect(notifier.state.messages.last.content, '续上的回复');
      expect(notifier.state.messages.last.role, ChatRole.assistant);
    });

    test('切会话 ⇒ **人设**那条轮次不变成气泡（它是配置，不是对话）', () async {
      final client = liveClient((req) async {
        return http.Response(
          jsonEncode(
            serverConversation('conv-a', 'temporal', const [
              {'role': 'agent', 'text': '[system] 你是影'},
              {'role': 'user', 'text': '第一条问题'},
              {'role': 'agent', 'text': '第一条回答'},
            ]),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      expect(await notifier.switchTo('conv-a'), isTrue);

      // ⚠️ 端脑把会话的**人设**存成**第一条**轮次（`role=agent` +
      // `[system] ` 前缀）⇒ 原样画出来 ⇒ 用户看到**自己的配置原文**
      // 被当成大脑发言顶在最上面。
      // 口径与服务端一致：`history_of()` 喂模型时也**只跳人设**。
      expect(
        notifier.state.messages.any((m) => m.content.contains('[system]')),
        isFalse,
      );
      expect(notifier.state.messages.length, 2);
      expect(notifier.state.messages.first.content, '第一条问题');
    });

    test('切会话 ⇒ 工具结果那条**剥掉** `[tool_result] ` 前缀（正文留着）', () async {
      final client = liveClient((req) async {
        return http.Response(
          jsonEncode(
            serverConversation('conv-a', 'temporal', const [
              {'role': 'user', 'text': '把主题换成靛蓝'},
              {'role': 'agent', 'text': '[tool_result] set_theme → ok'},
            ]),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      expect(await notifier.switchTo('conv-a'), isTrue);

      // 用户该看见「工具跑过了」⇒ 但**不该**看见这个协议内部标记。
      expect(notifier.state.messages.length, 2);
      expect(notifier.state.messages.last.content, 'set_theme → ok');
      expect(notifier.state.messages.last.content.contains('[tool_result]'), isFalse);
    });

    test('切会话失败 ⇒ **不换会话** ＋ **闸门关上** ＋ 错误说真话', () async {
      final client = liveClient((req) async {
        if (req.url.path == '/shadow/v1/conversations/conv-missing') {
          return http.Response(
            jsonEncode({
              'error': {'code': 4040, 'message': 'conversation not found'},
            }),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      // 先切到一条**能打开**的会话。
      expect(await notifier.switchTo('conv-a'), isTrue);
      expect(notifier.state.activeConversationAgent, 'temporal');
      expect(notifier.state.canChat, isTrue);

      // 再切一条**打不开**的。
      expect(await notifier.switchTo('conv-missing'), isFalse);

      // ⚠️ **没有换会话** —— 当前会话还是原来那条（界面显示的没变）。
      expect(notifier.state.activeConversationAgent, 'temporal');
      expect(notifier.state.messages.length, 2);
      expect(notifier.state.messages.first.content, '第一条问题');
      // ⚠️ **闸门关上** ⇒ 不许再往别的会话里写（否则消息落错会话）。
      expect(notifier.state.canChat, isFalse);
      expect(notifier.state.failedSwitchSessionId, 'conv-missing');
      // 错误说真话（真实状态码看得见）。
      expect(notifier.state.errorMessage, contains('404'));
    });

    test('切会话失败 ⇒ 再发消息**一条都不发出去**（不许落进别的会话）', () async {
      final requests = <http.Request>[];
      final client = liveClient((req) async {
        requests.add(req);
        if (req.url.path == '/shadow/v1/conversations/conv-missing') {
          return http.Response(
            jsonEncode({'error': {'code': 4040}}),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith(':stream')) {
          return http.Response(
            'data: {"type":"delta","delta":"这条回复不该出现"}\n',
            200,
            headers: {'content-type': 'text/event-stream; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      await notifier.switchTo('conv-a');
      await notifier.switchTo('conv-missing'); // 失败
      requests.clear();

      await notifier.generateResponse('这条消息绝不能落进别的会话');

      // ⚠️ 一条请求都不该发出去（连 SSE 都不该发）。
      expect(requests.where((r) => r.url.path.endsWith(':stream')), isEmpty);
      // 界面上也不该多出这条用户消息（它根本没发出去）。
      expect(
        notifier.state.messages.any(
          (m) => m.content.contains('绝不能落进'),
        ),
        isFalse,
      );
    });

    test('关掉错误横幅 ⇒ 闸门重新打开（用户明确接受留在当前这条）', () async {
      final client = liveClient((req) async {
        if (req.url.path == '/shadow/v1/conversations/conv-missing') {
          return http.Response(
            jsonEncode({'error': {'code': 4040}}),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(MockTtsEngine(), client);
      await notifier.switchTo('conv-a');
      await notifier.switchTo('conv-missing');
      expect(notifier.state.canChat, isFalse);

      notifier.clearError();

      expect(notifier.state.canChat, isTrue);
      expect(notifier.state.failedSwitchSessionId, isNull);
      // 而当前会话**没变** ⇒ 用户知道自己还在哪条。
      expect(notifier.state.activeConversationAgent, 'temporal');
    });

    test('方言层：客户端认得端脑那两个机器前缀', () async {
      final client = liveClient((req) async {
        return http.Response(
          jsonEncode(
            serverConversation('conv-a', 'temporal', const [
              {'role': 'agent', 'text': '[system] 你是影'},
              {'role': 'agent', 'text': '[tool_result] set_theme → ok'},
              {'role': 'user', 'text': '你好'},
            ]),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final conv = await client.getConversation('conv-a');
      // 判据源：`telencephalon/src/api/shadow/conversations.rs`
      //   `SYSTEM_TURN_PREFIX = "[system] "`
      // `telencephalon/src/api/shadow.rs`
      //   `TOOL_RESULT_TURN_PREFIX = "[tool_result] "`
      expect(conv.history[0].isSystemTurn, isTrue);
      expect(conv.history[1].isToolResultTurn, isTrue);
      expect(conv.history[1].bodyText, 'set_theme → ok');
      expect(conv.history[2].isSystemTurn, isFalse);
      expect(conv.history[2].isToolResultTurn, isFalse);
    });

    test('新开会话：真的 POST 建一条（人设随会话带过去）', () async {
      final requests = <http.Request>[];
      final client = liveClient((req) async {
        requests.add(req);
        return http.Response(
          jsonEncode(
            serverConversation(
              'conv-new',
              'temporal',
              const <Map<String, String>>[],
            ),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final notifier = ChatNotifier(
        MockTtsEngine(),
        client,
        systemPromptProvider: () => '你是影',
      );
      final ok = await notifier.startNewConversation();
      expect(ok, isTrue);

      final post = requests.single;
      expect(post.method, 'POST');
      expect(post.url.path, '/shadow/v1/conversations');
      // 人设随会话创建送过去（端脑把它记进会话并转发给叶区）。
      expect(
        (jsonDecode(post.body) as Map<String, dynamic>)['system'],
        '你是影',
      );
      expect(notifier.state.sessionId, 'conv-new');
      expect(notifier.state.messages, isEmpty);
    });

    testWidgets('路由级：带 sessionId 导航 ⇒ 真 client 真的去拉那条会话', (
      tester,
    ) async {
      final requests = <http.Request>[];
      final client = liveClient((req) async {
        requests.add(req);
        return http.Response(
          jsonEncode(serverConversation('conv-a', 'temporal', _historyA)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
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

      appRouter.go(AppRoutes.chat, extra: {'sessionId': 'conv-a'});
      await tester.pump();
      await tester.pump();

      expect(container.read(chatProvider).sessionId, 'conv-a');
      expect(container.read(chatProvider).messages.length, 2);
      expect(
        requests
            .firstWhere((r) => r.url.path.contains('/conversations/conv-a'))
            .url
            .path,
        '/shadow/v1/conversations/conv-a',
      );
    });
  });
}
