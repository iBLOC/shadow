import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/model_management_screen.dart';
import 'test_helper.dart';

/// 模型管理页的 widget 测试。
///
/// 这一页现在只管**云端供应商模型**（嵌入式大脑的 `_applyCloudProvider()`
/// 读的就是它）—— 本地 LiteRT 下线之后，「本地模型」那一摊已经没有任何
/// 东西可显示（没有本地引擎会注册模型；`internalService` 这个来源
/// 全仓**没有任何一处**创建过），而且它剩下的「云端供应商」分段和
/// 「模型商店」tab **完全重复** ⇒ 两个 tab 合成一个。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  setUp(() {
    // 页面顶上的状态条看的是**嵌入式大脑**的运行态。
    //
    // 这里把 native 那边报成「已经在跑」⇒ provider 的 `_init()` 直接
    // 早退，**不会**去调 `start()`（也就不会进 2s/4s 的重试退避，
    // 更不会去等数据库 —— 那两样在 widget 测试的 fake-async 区里
    // 会把 `pumpAndSettle` 拖死）。
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          switch (call.method) {
            case 'getStatus':
              return {
                'running': true,
                'port': 41234,
                'agentPort': 41235,
                'healthy': true,
              };
            case 'setLlmProvider':
              return true;
          }
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Future<void> pumpModels(WidgetTester tester) async {
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
          home: const ModelManagementScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('ModelsScreen Widget Tests', () {
    testWidgets('renders model management screen with scaffold', (
      WidgetTester tester,
    ) async {
      await pumpModels(tester);

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows title "Models"', (WidgetTester tester) async {
      await pumpModels(tester);

      expect(find.text('Models'), findsOneWidget);
    });

    testWidgets('不再有「本地模型」tab（本地 LiteRT 已下线）', (
      WidgetTester tester,
    ) async {
      await pumpModels(tester);

      // 以前是两个 tab：「本地模型」/「模型商店」。
      expect(find.byType(TabBar), findsNothing);
      expect(find.text('Local Models'), findsNothing);
    });

    testWidgets('状态条显示的是嵌入式大脑，不是本地引擎', (
      WidgetTester tester,
    ) async {
      await pumpModels(tester);

      // 以前那根条显示的是本地 LiteRT 引擎的状态 ⇒ `isLitertReady` 恒假
      // ⇒ 永远显示「引擎未运行」。
      expect(find.text('Engine not running'), findsNothing);
      expect(find.text('Engine running'), findsNothing);
      // 现在显示嵌入式大脑（native 那边报的是 running）。
      expect(find.text('Embedded Brain'), findsOneWidget);
      expect(find.text('Running'), findsOneWidget);
    });

    });
}
