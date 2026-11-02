import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/providers_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'test_helper.dart';

/// 供应商页的**三态**测试 —— ⚠️ 钉的是「读不到 ≠ 没有」。
///
/// ⚠️ 旧实现只有两态 ⇒ ⇒ 端脑回 404 时界面画成「还没有供应商」⇒ ⇒
/// 失败长得像成功（用户去查自己的 key，而真因是「没连上大脑」）。
void main() {
  testSetup();

  TelencephalonClient clientReturning(
    http.Response Function(http.Request req) handler,
  ) {
    return TelencephalonClient(
      baseUrl: 'http://127.0.0.1:60080',
      client: MockClient((req) async => handler(req)),
    );
  }

  Widget app(ProvidersNotifier notifier) {
    return ProviderScope(
      overrides: [
        providersNotifierProvider.overrideWith((ref) => notifier),
      ],
      child: MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: const [Locale('en')],
        locale: const Locale('en'),
        home: const ProvidersScreen(),
      ),
    );
  }

  group('ProvidersScreen Widget Tests', () {
    testWidgets('renders providers screen with app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ProvidersScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('has floating action button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ProvidersScreen(),
          ),
        ),
      );

      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('FAB has add icon', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ProvidersScreen(),
          ),
        ),
      );

      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('has refresh button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ProvidersScreen(),
          ),
        ),
      );

      // ⚠️ 现在**至少**有一个刷新图标：AppBar 的刷新 ＋ 「读不到」态里的
      // 「重试」按钮（那个态的语义就是「再试一次」）⇒ ⇒ 断言从「恰好一个」
      // 放宽成「至少一个」⇒ 意图（页面有刷新入口）不变。
      expect(find.byIcon(Icons.refresh), findsAtLeastNWidgets(1));
    });
  });

  group('供应商页的三态（读不到 ≠ 没有）', () {
    testWidgets('⚠️ 读不到 ⇒ 显示原因，且**不**显示「还没有供应商」', (
      WidgetTester tester,
    ) async {
      final notifier = ProvidersNotifier(
        clientReturning((req) => http.Response('boom', 500)),
      );
      await pumpWidgetForTest(tester, app(notifier));
      await tester.pumpAndSettle();

      // 说真话：把失败原因显示出来。
      expect(
        find.textContaining('Error:'),
        findsOneWidget,
        reason: '读不到必须把原因说出来',
      );
      // ⚠️ **承重断言**：不得画成空态（那才是「失败长得像成功」）。
      expect(
        find.text('No providers configured'),
        findsNothing,
        reason: '读不到绝不能长得像「还没有供应商」',
      );
    });

    testWidgets('✅ 读到空 ⇒ 显示空态（正控：证明上一条不是文案缺失）', (
      WidgetTester tester,
    ) async {
      final notifier = ProvidersNotifier(
        clientReturning((req) => http.Response(jsonEncode(<Object>[]), 200)),
      );
      await pumpWidgetForTest(tester, app(notifier));
      await tester.pumpAndSettle();

      expect(find.text('No providers configured'), findsOneWidget);
      expect(find.textContaining('Error:'), findsNothing);
    });

    testWidgets('✅ 读到有 ⇒ 显示供应商名、地址与启停开关', (
      WidgetTester tester,
    ) async {
      final notifier = ProvidersNotifier(
        clientReturning((req) {
          if (req.url.path.endsWith('/presets')) {
            return http.Response(jsonEncode(<Object>[]), 200);
          }
          return http.Response(
            jsonEncode([
              {
                'id': 'prov-1',
                'name': 'OpenAI',
                'base_url': 'https://api.openai.com/v1',
                'api_standard': 'openai',
                'enabled': true,
                'selected_model': 'gpt-4o',
                'preset_id': 'openai',
                'models': [
                  {'id': 'gpt-4o', 'name': 'GPT-4o'},
                ],
              },
            ]),
            200,
          );
        }),
      );
      await pumpWidgetForTest(tester, app(notifier));
      await tester.pumpAndSettle();

      expect(find.text('OpenAI'), findsOneWidget);
      expect(find.text('https://api.openai.com/v1'), findsOneWidget);
      expect(find.text('openai · gpt-4o'), findsOneWidget);
      expect(find.byType(Switch), findsOneWidget);
    });
  });
}
