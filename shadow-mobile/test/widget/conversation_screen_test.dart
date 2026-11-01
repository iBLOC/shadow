import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
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

void main() {
  testSetup();
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
