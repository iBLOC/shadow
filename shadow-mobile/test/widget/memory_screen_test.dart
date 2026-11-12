import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/memory_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'test_helper.dart';

void main() {
  testSetup();
  group('MemoryScreen Widget Tests', () {
    testWidgets('renders memory screen with scaffold', (
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
            home: const MemoryScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('has search text field', (WidgetTester tester) async {
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
            home: const MemoryScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.search), findsOneWidget);
    });

    testWidgets('has filter chips', (WidgetTester tester) async {
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
            home: const MemoryScreen(),
          ),
        ),
      );

      expect(find.byType(FilterChip), findsWidgets);
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
            home: const MemoryScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.refresh), findsOneWidget);
    });

    testWidgets('can enter search query', (WidgetTester tester) async {
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
            home: const MemoryScreen(),
          ),
        ),
      );

      final searchField = find.byIcon(Icons.search);
      expect(searchField, findsOneWidget);

      await tester.tap(searchField);
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });
  });

  /// **第三态：读不到 ≠ 没有**（2026-11-12）。
  ///
  /// ⚠️ 这一格是手机上**必然**走的那一条：内嵌大脑是 `mobile` profile
  /// （不含 hippocampus）⇒ `/hippocampus/api/search` 404 ⇒ 以前画成
  /// 「暂无记忆」⇒ ⇒ **把「这台设备没有记忆面」说成「你还没存过东西」**。
  group('三态：空 / 读不到 / 有值 必须长得不一样', () {
    Widget app() => MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      locale: const Locale('en'),
      home: const MemoryScreen(),
    );

    testWidgets('请求失败 ⇒ 说「读不到记忆库」并带上原因，不画「暂无记忆」', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            prefrontalClientProvider.overrideWithValue(_ThrowingClient()),
          ],
          child: app(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cannot reach the memory store'), findsOneWidget);
      // ⚠️ **这一句是这一格的全部意义**：失败不许被画成「空」。
      expect(find.text('No memories yet'), findsNothing);
      // 原因要带上（用户/支持人员据此区分「没配」与「请求坏了」）。
      expect(find.textContaining('404'), findsOneWidget);
    });

    testWidgets('真的没有记忆 ⇒ 才画「暂无记忆」', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            prefrontalClientProvider.overrideWithValue(_EmptyClient()),
          ],
          child: app(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No memories yet'), findsOneWidget);
      expect(find.text('Cannot reach the memory store'), findsNothing);
    });
  });
}

/// 记忆面**没挂**（手机上就是这个）—— 打一下就抛。
class _ThrowingClient extends PrefrontalClient {
  _ThrowingClient() : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<MemoryResponse>> searchMemory(
    String query, {
    int limit = 20,
    String? tenantId,
  }) async {
    throw StateError('POST /hippocampus/api/search → 404');
  }
}

/// 海马体在、但库是空的。
class _EmptyClient extends PrefrontalClient {
  _EmptyClient() : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<MemoryResponse>> searchMemory(
    String query, {
    int limit = 20,
    String? tenantId,
  }) async => const <MemoryResponse>[];
}
