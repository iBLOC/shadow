import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/router/app_router.dart';
import 'package:shadow_mobile/screens/conversation_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'test_helper.dart';

/// 端脑那边回什么。
///
/// ⚠️ **为什么必须显式给一份响应**（这条以前踩过）：
/// 不覆盖 client ⇒ 真 client 去打 `127.0.0.1:60080` ⇒ 本机没人监听
/// ⇒ **连接被拒** ⇒ 而「读不到」在旧 UI 上被画成「**暂无会话**」
/// ⇒ ⇒ 这份测试**过去是绿的，但绿的原因不是它想测的东西**
/// （它以为在测「空列表」，其实测的是「**失败**」）。
/// ⇒ 现在失败会**说真话** ⇒ ⇒ 不给响应，这份测试就没有意义了。
///
/// 「失败 ≠ 空」那一面（连同真 client + 真传输层的契约）在
/// `mobile_conversation_contract_test.dart` 里。
Future<http.Response> Function(http.Request) _server(
  String body, {
  int status = 200,
}) => (req) async => http.Response(
      body,
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

Future<void> pumpConversationScreen(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) handler,
}) async {
  final container = ProviderContainer(
    overrides: [
      telencephalonClientProvider.overrideWithValue(
        TelencephalonClient(
          baseUrl: 'http://127.0.0.1:60080',
          client: MockClient(handler),
        ),
      ),
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
        ],
        supportedLocales: const [Locale('en')],
        locale: const Locale('en'),
        home: const ConversationScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// 端脑**真的**会回的那份会话 JSON —— 逐字照抄 Rust 那边的 serde 形状。
///
/// 判据源：
/// - `telencephalon/src/api/shadow.rs` 的 `ConversationView`
///   `{ id, agent, created_at, updated_at, history[] }`
/// - `telencephalon/src/api/shadow/conversations.rs` 的 `ConversationTurn`
///   `{ role, text, at }`（`role` 是 serde 的**小写**变体名：`user` / `agent`）
Map<String, dynamic> _serverConv(
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

void main() {
  testSetup();
    testWidgets('从会话页 push 出去再退回 ⇒ 列表必须**重新拉过**', (
      WidgetTester tester,
    ) async {
      // ⚠️ 这条量的是「**退回**列表」这条路径 —— 列表页是**从对话页 push
      // 上去**的 ⇒ ⇒ 退回时它**仍然挂载** ⇒ ⇒ `initState` **不会重跑**
      // ⇒ ⇒ 只在 `initState` 拉 ⇒ ⇒ 列表会**停在旧值**。
      // ⇒ ⇒ 2026-11-01 真机实测逮到这条（设备上退回列表后新会话不出现）。
      var gets = 0;
      final router = GoRouter(
        initialLocation: '/conversations',
        observers: [appRouteObserver],
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
          telencephalonClientProvider.overrideWithValue(
            TelencephalonClient(
              baseUrl: 'http://127.0.0.1:60080',
              client: MockClient((req) async {
                if (req.method == 'GET') gets++;
                return http.Response(
                  jsonEncode([
                    _serverConv('conv-a', 'temporal', const [
                      {'role': 'user', 'text': '第一条问题'},
                    ]),
                  ]),
                  200,
                  headers: {'content-type': 'application/json; charset=utf-8'},
                );
              }),
            ),
          ),
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
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(gets, 1);

      // 点一条会话 ⇒ **push** 到对话页（列表页仍然挂载，只是被盖住）。
      await tester.tap(find.text('第一条问题'));
      await tester.pumpAndSettle();
      expect(gets, 1, reason: '被盖住的时候不必重拉');

      // 退回列表 ⇒ 必须**重新拉一次** ⇒ ⇒ 否则列表停在旧值。
      router.pop();
      await tester.pumpAndSettle();
      expect(gets, 2, reason: '退回列表必须重新拉一次');
    });
  group('ConversationScreen Widget Tests', () {
    testWidgets('renders conversation screen with scaffold', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(tester, handler: _server('[]'));

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows the conversation management title', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(tester, handler: _server('[]'));

      expect(find.text(l10nOf(tester).conversationManagement), findsOneWidget);
    });

    testWidgets('has floating action button', (WidgetTester tester) async {
      await pumpConversationScreen(tester, handler: _server('[]'));

      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('FAB has the new-chat label', (WidgetTester tester) async {
      await pumpConversationScreen(tester, handler: _server('[]'));

      expect(find.text(l10nOf(tester).conversationNewChat), findsOneWidget);
    });

    testWidgets('has refresh button', (WidgetTester tester) async {
      await pumpConversationScreen(tester, handler: _server('[]'));

      // ⚠️ 断的是 **AppBar 上那一个** —— 失败态里还有一个「重试」按钮
      //（也是 refresh 图标）⇒ 断言整个屏上的 refresh 数量会把两者混起来。
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.refresh),
        ),
        findsOneWidget,
      );
    });

    testWidgets('shows empty state when no conversations', (
      WidgetTester tester,
    ) async {
      // 端脑**真的**回了一个空数组 ⇒ 这才是「暂无会话」。
      await pumpConversationScreen(tester, handler: _server('[]'));

      expect(find.text(l10nOf(tester).conversationEmpty), findsOneWidget);
    });

    testWidgets('同一叶区的两条会话 ⇒ 标题是各自的用户第一句话', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(
        tester,
        handler: _server(
          jsonEncode([
            _serverConv('conv-a', 'temporal', const [
              {'role': 'user', 'text': '帮我把主题换成靛蓝'},
              {'role': 'agent', 'text': '好，换好了'},
            ]),
            _serverConv('conv-b', 'temporal', const [
              {'role': 'user', 'text': '解释一下海马体'},
            ]),
          ]),
        ),
      );

      // ⚠️ 这两条**同一个叶区**（temporal）⇒ 标题以前都是「temporal」
      // ⇒ ⇒ 列表里两行长得**一模一样** ⇒ 用户根本分不出哪条是哪条
      // ⇒ ⇒ 「管理多个会话」在**视觉上**就不成立。
      // 现在标题取**用户自己说过的第一句话**。
      expect(find.text('帮我把主题换成靛蓝'), findsOneWidget);
      expect(find.text('解释一下海马体'), findsOneWidget);
      // 叶区名不再占标题位（它挪到副标签去了）。
      expect(find.text('temporal'), findsNothing);
      // ⚠️ 但它**没丢** —— 副标签那行还带着它（两条 ⇒ 两处）。
      expect(find.textContaining('temporal'), findsNWidgets(2));
    });

    testWidgets('人设那条轮次不进标题（它是配置，不是对话）', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(
        tester,
        handler: _server(
          jsonEncode([
            _serverConv('conv-a', 'temporal', const [
              {'role': 'agent', 'text': '[system] 你是影'},
              {'role': 'user', 'text': '你好'},
            ]),
          ]),
        ),
      );

      expect(find.text('你好'), findsOneWidget);
      expect(find.textContaining('[system]'), findsNothing);
    });

    testWidgets('空会话（只有人设）⇒ 标题是「新会话」，叶区名仍在副标签', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(
        tester,
        handler: _server(
          jsonEncode([
            _serverConv('conv-a', 'temporal', const [
              {'role': 'agent', 'text': '[system] 你是影'},
            ]),
          ]),
        ),
      );

      expect(find.text(l10nOf(tester).conversationNewSession), findsOneWidget);
      expect(find.textContaining('[system]'), findsNothing);
      expect(find.textContaining('temporal'), findsOneWidget);
    });

    testWidgets('过长的第一句 ⇒ 截断（带省略号），全文不出现', (
      WidgetTester tester,
    ) async {
      final long = '一' * 60;
      await pumpConversationScreen(
        tester,
        handler: _server(
          jsonEncode([
            _serverConv('conv-a', 'temporal', [
              {'role': 'user', 'text': long},
            ]),
          ]),
        ),
      );

      expect(find.textContaining('…'), findsOneWidget);
      expect(find.text(long), findsNothing);
    });

    testWidgets('进入会话列表 ⇒ 真的重新拉一次（不显示陈旧数据）', (
      WidgetTester tester,
    ) async {
      var gets = 0;
      final container = ProviderContainer(
        overrides: [
          telencephalonClientProvider.overrideWithValue(
            TelencephalonClient(
              baseUrl: 'http://127.0.0.1:60080',
              client: MockClient((req) async {
                gets++;
                return http.Response(
                  '[]',
                  200,
                  headers: {
                    'content-type': 'application/json; charset=utf-8',
                  },
                );
              }),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      Widget screen() => UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          locale: const Locale('en'),
          home: const ConversationScreen(),
        ),
      );

      await tester.pumpWidget(screen());
      await tester.pumpAndSettle();
      expect(gets, 1);

      // 离开列表（模拟去对话页）。
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();

      // 再进列表 ⇒ ⚠️ **同一个 notifier 还在**（provider 不是 autoDispose）
      // ⇒ ⇒ 它手里的数据是**陈旧的** ⇒ ⇒ 除非**重新拉一次**。
      await tester.pumpWidget(screen());
      await tester.pumpAndSettle();
      expect(gets, 2);
    });

    testWidgets('消息数**不含**人设那条（与对话页一致）', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(
        tester,
        handler: _server(
          jsonEncode([
            _serverConv('conv-a', 'temporal', const [
              {'role': 'agent', 'text': '[system] 你是影'},
              {'role': 'user', 'text': '第一条问题'},
              {'role': 'agent', 'text': '第一条回答'},
            ]),
          ]),
        ),
      );

      // 对话页**不画**人设那条 ⇒ ⇒ 列表里的条数也**不含**它
      // ⇒ ⇒ 2 条（用户 1 + 回答 1），**不是** 3。
      expect(
        find.descendant(
          of: find.byType(CircleAvatar),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(CircleAvatar),
          matching: find.text('3'),
        ),
        findsNothing,
      );
    });

    testWidgets('读不到 ⇒ **不是**空态（失败要说真话）', (
      WidgetTester tester,
    ) async {
      await pumpConversationScreen(
        tester,
        handler: _server(
          '{"error":{"code":4010,"message":"unauthorized"}}',
          status: 401,
        ),
      );

      expect(find.text(l10nOf(tester).conversationEmpty), findsNothing);
      expect(find.textContaining('401'), findsWidgets);
    });
  });
}
