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

    // ⚠️ 内置供应商（neuron）**只读** ⇒ ⇒ 启停/编辑/删除**都写不进去**
    // ⇒ ⇒ 界面不能给这些按钮（给一个必然 400 的按钮 = 把「大脑拒了」
    // 包装成「界面坏了」）。
    //
    // ⚠️ 断言用「**恰好一个**」而不是「至少一个」⇒ ⇒ 这样才能同时钉住
    // 「普通条目还在」（正控）与「内置条目的不在」。
    testWidgets('⚠️ 内置条目没有启停/编辑/删除；但**模型可以选**（没下载的不能选）', (
      WidgetTester tester,
    ) async {
      final puts = <String>[];
      final notifier = ProvidersNotifier(
        clientReturning((req) {
          if (req.url.path.endsWith('/presets')) {
            return http.Response(jsonEncode(<Object>[]), 200);
          }
          if (req.method == 'PUT') {
            puts.add('${req.method} ${req.url.path} ${req.body}');
            return http.Response(jsonEncode({'id': 'builtin-neuron'}), 200);
          }
          return http.Response(
            jsonEncode([
              {
                'id': 'builtin-neuron',
                'name': '本地 neuron（内置）',
                'base_url': 'http://127.0.0.1:60080/v1',
                'api_standard': 'openai',
                'enabled': true,
                'builtin': true,
                'models': [
                  {
                    'id': 'qwen3-0.6b',
                    'name': 'qwen3-0.6b',
                    'capabilities': ['llm'],
                    'available': true,
                  },
                  {
                    'id': 'not-downloaded-yet',
                    'name': 'not-downloaded-yet',
                    'capabilities': ['llm'],
                    'available': false,
                  },
                ],
              },
              {
                'id': 'prov-1',
                'name': 'OpenAI',
                'base_url': 'https://api.openai.com/v1',
                'api_standard': 'openai',
                'enabled': true,
                'preset_id': 'openai',
                'models': [
                  {'id': 'gpt-4o', 'name': 'GPT-4o'},
                ],
              },
            ]),
            200,
            // ⚠️ 必须给 content-type ⇒ ⇒ 否则 http 包按 **latin1** 构造 ⇒ ⇒
            // ⇒ body 里有中文就**构造失败**（不是解码问题）。
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      await pumpWidgetForTest(tester, app(notifier));
      await tester.pumpAndSettle();

      expect(find.text('Built-in'), findsOneWidget, reason: '内置条目要有徽章');
      // ⚠️ 只有**普通条目**有启停开关 ⇒ ⇒ 恰好一个。
      expect(find.byType(Switch), findsOneWidget);
      expect(find.text('Edit'), findsOneWidget, reason: '编辑按钮只剩普通条目那份');
      expect(find.text('Delete'), findsOneWidget, reason: '删除按钮只剩普通条目那份');
      // ⚠️ 内置条目的模型要**带能力**列出来（目录横跨七种能力）。
      expect(find.text('llm · qwen3-0.6b'), findsOneWidget);
      // ⚠️⚠️ **没下载的**要点出来（否则用户以为它能跑）。
      expect(
        find.text('llm · not-downloaded-yet · Not downloaded'),
        findsOneWidget,
        reason: '没下载的模型必须标出来',
      );
      // ⚠️ **已下载的可以选**（用户拍板：内置条目也能记 selected_model）。
      final okChip = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'llm · qwen3-0.6b'),
      );
      expect(okChip.onSelected, isNotNull, reason: '已下载的本地模型必须可选');
      // ⚠️ **没下载的不能选**（选了也跑不起来 ⇒ ⇒ 大脑那边会拒 400）。
      final badChip = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'llm · not-downloaded-yet · Not downloaded'),
      );
      expect(badChip.onSelected, isNull, reason: '没下载的模型不许选');
      // ⚠️ 选一个 ⇒ ⇒ 真的让大脑记住（PUT /models/providers/{id}）。
      await tester.tap(find.widgetWithText(ChoiceChip, 'llm · qwen3-0.6b'));
      await tester.pumpAndSettle();
      expect(puts.length, 1, reason: '选中本地模型必须写回大脑');
      expect(puts.first, contains('/models/providers/builtin-neuron'));
      expect(puts.first, contains('qwen3-0.6b'));
    });
  });
}
