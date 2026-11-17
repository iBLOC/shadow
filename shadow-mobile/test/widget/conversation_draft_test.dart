import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/conversation_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

import '../unit/agui_fakes.dart';
import 'test_helper.dart';

/// 端脑会回的那份会话 JSON —— 逐字照抄 Rust 的 serde 形状
/// （telencephalon/src/api/shadow.rs 的 ConversationView：
/// id / agent / created_at / updated_at / history）。
Map<String, dynamic> serverConversation(String id, String agent) => {
  'id': id,
  'agent': agent,
  'created_at': '2026-11-01T04:23:45.123456789Z',
  'updated_at': '2026-11-01T05:00:00.987654321Z',
  'history': <Map<String, dynamic>>[],
};


class MockTtsEngine extends TtsEngine {
  @override
  Future<TtsSpeakResult> speak(String text, {String lang = 'zh-CN', bool allowFallback = true, String? lobe}) async =>
      const TtsSpeakResult.spoke();
}

/// 端脑那边收到的一切请求 —— 记下来，才能断言「客户端没在端脑造垃圾」。
class Endbrain {
  final List<http.Request> requests = <http.Request>[];
  int createCount = 0;
  int streamCount = 0;
  int listCount = 0;
  String? streamPath;

  /// ⚠️ **AG-UI 那一路用的**同一个**运输层** —— 真 `AguiClient`／真 SSE
  /// 解析／真协议归约**全在** ⇒ ⇒ 只有端脑那一面是假的。
  ///
  /// ⚠️ **为什么必须是同一个** —— `TelencephalonClient` 自己那些调用走它
  /// 自己的 `http.Client`，AG-UI 那一路走**另一个** ⇒ ⇒ 不共用 ⇒ ⇒ 假端脑
  /// **看不见** AG-UI 的请求 ⇒ ⇒ 失败长得像成功。
  late final MockClient transport = MockClient(handle);

  Future<http.Response> handle(http.Request req) async {
    requests.add(req);
    final path = req.url.path;
    if (req.method == 'POST' && path == '/shadow/v1/conversations') {
      createCount++;
      return http.Response(
        jsonEncode(serverConversation('conv-new-1', 'temporal')),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    // ⚠️ **只服务 AG-UI 那条**（`ag-ui:stream`）—— legacy 的
    // `messages:stream` **故意不服务** ⇒ ⇒ 万一客户端退回 legacy 那条
    // ⇒ ⇒ 请求会掉进下面的兜底 ⇒ ⇒ 判据当场红（而不是悄悄通过）。
    if (path.endsWith('/ag-ui:stream')) {
      streamCount++;
      streamPath = path;
      // ⚠️ **AG-UI 的帧**（不是 legacy 的 delta）⇒ ⇒ 真 driver／真协议
      // 归约**全在** ⇒ ⇒ 只有端脑那一面是假的。
      return http.Response(
        '${aguiText('好，换好了')}${aguiFinished()}',
        200,
        headers: {'content-type': 'text/event-stream; charset=utf-8'},
      );
    }
    if (req.method == 'GET' && path == '/shadow/v1/conversations') {
      listCount++;
      return http.Response(
        '[]',
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (req.method == 'GET' && path.startsWith('/shadow/v1/conversations/')) {
      // 取单条会话打不开（404）⇒ 用来测「切会话失败」。
      return http.Response(
        jsonEncode({
          'error': {'code': 4040, 'message': 'conversation not found'},
        }),
        404,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response(
      '{}',
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }
}

/// 真 client + 真传输层（只把 socket 换成 MockClient）⇒ 请求路径、
/// 请求头、JSON 解析、错误映射全是生产代码在跑。
TelencephalonClient liveClient(Endbrain endbrain) => TelencephalonClient(
  baseUrl: 'http://127.0.0.1:60080',
  apiKey: 'shadow-key-abc',
  // ⚠️ **与 AG-UI 那一路共用同一个运输层** ⇒ ⇒ 假端脑两边都看得见。
  client: endbrain.transport,
);

void main() {
  testSetup();

  group('草稿会话：客户端不许在端脑造垃圾', () {
    test('「新对话」⇒ 端脑那边**一个请求都没有**', () async {
      final endbrain = Endbrain();
      final notifier = ChatNotifier(
        MockTtsEngine(),
        liveClient(endbrain),
        // ⚠️ **AG-UI 那一路的运输层** ⇒ ⇒ 假端脑**看得见**那些请求。
        aguiHttpClient: endbrain.transport,
      );
      addTearDown(notifier.dispose);

      await notifier.startNewConversation();

      // ⚠️ 端脑**没有删会话的端点**（shadow.rs 的路由表里只有
      // list / create / get / messages / messages:stream / tool-results /
      // import）⇒ ⇒ 每点一次「新对话」就多一条**永久留着、还删不掉**的
      // 空会话 ⇒ ⇒ 列表被自己的垃圾填满 ⇒ ⇒ 客户端不许制造它。
      expect(endbrain.requests, isEmpty);
      expect(endbrain.createCount, 0);

      final state = notifier.state;
      expect(state.sessionId, isNull);
      expect(state.messages, isEmpty);
      // 草稿是干净的 ⇒ ⇒ 闸门开着（能说话）。
      expect(state.canChat, isTrue);
    });

    test('草稿里的第一条消息 ⇒ 恰好建一条会话，消息落进它', () async {
      final endbrain = Endbrain();
      final notifier = ChatNotifier(
        MockTtsEngine(),
        liveClient(endbrain),
        // ⚠️ **AG-UI 那一路的运输层** ⇒ ⇒ 假端脑**看得见**那些请求。
        aguiHttpClient: endbrain.transport,
      );
      addTearDown(notifier.dispose);

      await notifier.startNewConversation();
      await notifier.generateResponse('帮我把主题换成靛蓝');

      expect(endbrain.createCount, 1);
      expect(endbrain.streamCount, 1);
      // ⇒ ⇒ 消息落在**刚建出来的那条**会话上（不是别的）。
      expect(
        endbrain.streamPath,
        '/shadow/v1/conversations/conv-new-1/ag-ui:stream',
      );
      expect(notifier.state.sessionId, 'conv-new-1');
      expect(notifier.state.activeConversationAgent, 'temporal');
      expect(notifier.state.messages.first.content, '帮我把主题换成靛蓝');
    });

    test('切会话失败之后「新对话」⇒ 闸门解开（草稿是干净的）', () async {
      final endbrain = Endbrain();
      final notifier = ChatNotifier(
        MockTtsEngine(),
        liveClient(endbrain),
        // ⚠️ **AG-UI 那一路的运输层** ⇒ ⇒ 假端脑**看得见**那些请求。
        aguiHttpClient: endbrain.transport,
      );
      addTearDown(notifier.dispose);

      final ok = await notifier.switchTo('conv-missing');
      expect(ok, isFalse);
      // 切失败 ⇒ ⇒ 闸门关上（不许往别的会话里写）。
      expect(notifier.state.canChat, isFalse);
      expect(notifier.state.failedSwitchSessionId, 'conv-missing');

      await notifier.startNewConversation();
      // 新开一条 ⇒ 上一次失败作废 ⇒ ⇒ 闸门重新打开。
      expect(notifier.state.canChat, isTrue);
      expect(notifier.state.failedSwitchSessionId, isNull);
      expect(notifier.state.sessionId, isNull);
    });
  });

  group('列表页的「新对话」按钮', () {
    testWidgets('点「新对话」⇒ 端脑那边**什么都没多**', (tester) async {
      final endbrain = Endbrain();
      final router = GoRouter(
        initialLocation: '/conversations',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const Scaffold(body: Text('chat')),
          ),
          GoRoute(
            path: '/conversations',
            builder: (context, state) => const ConversationScreen(),
          ),
        ],
      );
      addTearDown(router.dispose);

      final container = ProviderContainer(
        overrides: [
          telencephalonClientProvider.overrideWithValue(liveClient(endbrain)),
          ttsEngineProvider.overrideWithValue(MockTtsEngine()),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh')],
            locale: const Locale('zh'),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 列表确实拉过（否则「零请求」是因为压根没进列表）。
      expect(endbrain.listCount, 1);

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(endbrain.createCount, 0);
      // 草稿**没有**服务端会话 ⇒ ⇒ 对话页那行「当前会话」不画
      //（没有会话可指）⇒ ⇒ 等第一条消息建出来，它自己会出现。
      expect(container.read(chatProvider).sessionId, isNull);
    });
  });
}
