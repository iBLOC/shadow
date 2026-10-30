import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/identity_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/identity_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// 「当前是谁」这一页的行为测试。
///
/// 钉的是**语义**：
/// - 显示的是端脑报出来的身份（人 / 人格 / 设备）与**有效租户**；
/// - **导出的码默认不显示** —— 它不该出现在用户还没点之前（截屏/录屏）；
/// - 导不出的时候要**说话**，不能静默。
///
/// ⚠️ 这里不测导出通道本身（那是 JNI/Rust 的事，纯 Dart 环境没有
/// MethodChannel）⇒ 导出必然失败 —— 而这正好覆盖了「失败要说话」。
void main() {
  testSetup();

  Future<void> pumpIdentity(
    WidgetTester tester, {
    TelencephalonClient? telencephalon,
    PrefrontalClient? prefrontal,
  }) async {
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
          if (telencephalon != null)
            telencephalonClientProvider.overrideWithValue(telencephalon),
          if (prefrontal != null)
            prefrontalClientProvider.overrideWithValue(prefrontal),
        ],
        child: withShadTheme(
          MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const IdentityScreen(),
          ),
        ),
      ),
    );
  }

  group('身份页', () {
    testWidgets('渲染出「我是谁」这一页', (WidgetTester tester) async {
      await pumpIdentity(tester);

      expect(find.byType(Scaffold), findsOneWidget);
      final l10n = l10nOf(tester);
      expect(find.text(l10n.identityCurrentTitle), findsOneWidget);
      expect(find.text(l10n.identityExportTitle), findsOneWidget);
      expect(find.text(l10n.identityImportTitle), findsOneWidget);
      // ⚠️ 组标题与按钮可能同名（「导入账号」）⇒ 用 findsWidgets
      // 而不是 findsOneWidget。
      expect(find.text(l10n.identityExportAction), findsWidgets);
      expect(find.text(l10n.identityImportAction), findsWidgets);
    });

    testWidgets('显示端脑报出来的身份与有效租户', (WidgetTester tester) async {
      await pumpIdentity(tester);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(IdentityScreen)),
      );
      container.read(identityProvider.notifier).state = container
          .read(identityProvider.notifier)
          .state
          .copyWith(
            principal: 'principal:alice',
            persona: 'persona-ada',
            device: 'device-1',
            identified: true,
            tenantId: 'persona-ada',
          );
      await tester.pump();

      expect(find.text('principal:alice'), findsOneWidget);
      expect(find.text('device-1'), findsOneWidget);
    });

    testWidgets('导出的码默认不显示 —— 要点了才亮出来', (WidgetTester tester) async {
      await pumpIdentity(tester);

      final l10n = l10nOf(tester);
      // 页面上有导出入口，但**没有任何码**。
      expect(find.text(l10n.identityExportAction), findsOneWidget);
      expect(find.textContaining('persona-'), findsNothing);
    });

    testWidgets('导出失败要说话，不能静默', (WidgetTester tester) async {
      await pumpIdentity(tester);

      final l10n = l10nOf(tester);
      // 没有 MethodChannel ⇒ 导出必然失败。
      await tester.tap(find.text(l10n.identityExportAction));
      // ⚠️ **不能用 pumpAndSettle** —— 导出中的不定进度条永远在动 ⇒
      // settle 永远等不到「没有动画」⇒ 超时。
      //
      // ⚠️ 而且 `pump` 只推进**动画帧**时钟，不等 future 完成 ⇒ 导出
      // 那条 async 链（MethodChannel → MissingPluginException）还没走完。
      // `runAsync` 才真的把异步跑完（它不受假时钟约束）。
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pump();

      expect(find.text(l10n.identityExportFailed), findsOneWidget);
    });
  });
}
