import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/log_provider.dart';
import 'package:shadow_mobile/screens/settings_screen.dart';
import 'package:shadow_mobile/services/log_service.dart';
import 'package:shadow_mobile/widgets/log_panel_section.dart';
import 'package:shadow_mobile/widgets/settings/settings_row.dart';

import 'test_helper.dart';

/// 设置页 —— 重构后的契约。
///
/// 2026-10-29 之前这里是 18 个平铺 `ListTile`（审计 F6）。现在改成
/// **4 组 + 高级折叠 + 危险操作隔离**，并整体换成 shadcn 组件。
///
/// 这些测试锁的是**结构契约**，不是像素：
///  - 分组存在且标题正确
///  - 折叠区**折叠时不构建**子树（不是「不显示」）
///  - TTS 从 4 个平铺 tile 收成 1 组 2 项
///  - 破坏性操作单独隔离，且**必须二次确认**
/// 日志服务替身 —— 真身会去连 MNN / Prefrontal 的流，测试里没这个通道。
class _MockLogService extends LogService {
  @override
  void connectMnn() {}
}

void main() {
  testSetup();

  Future<void> pumpSettings(
    WidgetTester tester, {
    VoidCallback? onReset,
  }) async {
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
          logServiceProvider.overrideWith((ref) => _MockLogService()),
          // 内存是异步读的；加载态用的是不定进度条（永远在动），
          // `pumpAndSettle` 会因此超时。测试里直接给一个确定值。
          systemMemoryProvider.overrideWith(
            (ref) async => SystemMemoryInfo(
              totalMb: 4096,
              usedMb: 2048,
              freeMb: 2048,
              usagePercent: 50,
            ),
          ),
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
            home: SettingsScreen(
              onReset: onReset ?? () {},
            ),
          ),
        ),
      ),
    );
  }

  /// 设置页很长，危险操作区在 800×600 测试窗之外 —— 先滚到可见再点。
  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  group('设置页分组结构', () {
    testWidgets('渲染设置页并有返回入口', (WidgetTester tester) async {
      await pumpSettings(tester);

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('四个主分组都在', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.settingsGroupAppearance), findsOneWidget);
      expect(find.text(l10n.settingsGroupVoice), findsOneWidget);
      expect(find.text(l10n.settingsGroupRuntime), findsOneWidget);
      expect(find.text(l10n.settingsGroupConnections), findsOneWidget);
    });

    testWidgets('高级分组默认折叠 —— 内容根本不构建', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      // 三个折叠标题在
      expect(find.text(l10n.settingsAdvancedLogs), findsOneWidget);
      expect(find.text(l10n.settingsAdvancedBackend), findsOneWidget);
      // 但折叠区里的内容不在（后端表单只有展开后才渲染）
      expect(find.text(l10n.commonSave), findsNothing);
      // 旧入口整条删除 ⇒ 那两个标题不该再出现。
      // ⚠️ 这里用**字面量**而不是 l10nOf —— 那些键随旧入口一起删了，
      //    用 l10nOf 反而要留着死键。测试跑的 locale 是 supportedLocales 的
      //    第一个 ⇒ zh。
      expect(find.text('遗留运行时'), findsNothing);
      expect(find.text('嵌入式 Prefrontal'), findsNothing);
    });

    testWidgets('折叠时日志面板不会被构建（不会偷偷连日志流）', (WidgetTester tester) async {
      await pumpSettings(tester);

      expect(find.byType(LogPanelSection), findsNothing);
    });

    testWidgets('展开「日志」后能看到日志面板', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      await tapVisible(tester, find.text(l10n.settingsAdvancedLogs));

      expect(find.byType(LogPanelSection), findsOneWidget);
      expect(find.text(l10n.logsEmpty), findsOneWidget);
    });

    testWidgets('展开「端脑后端地址」后能看到保存按钮', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      await tapVisible(tester, find.text(l10n.settingsAdvancedBackend));

      expect(find.text(l10n.commonSave), findsOneWidget);
    });

    testWidgets('弹层里没有 Material 祖先也不崩（ShadSheet 不提供 Material）', (
      WidgetTester tester,
    ) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      await tapVisible(tester, find.text(l10n.settingsDialogBackground));

      // 弹层里的选项用的是 SettingsRow（不依赖 Material），不是 InkWell ——
      // InkWell 在没有 Material 祖先时会直接断言失败。
      expect(find.text(l10n.settingsSurfaceInk), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('TTS 合并为 1 组 2 项', () {
    testWidgets('TTS 不再是 4 个平铺 tile，而是 2 行', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      // 引擎选择 + 试听 —— 两行
      expect(find.text(l10n.ttsEngine), findsOneWidget);
      expect(find.text(l10n.ttsTest), findsOneWidget);
      // 原来的「引擎状态」标题行不再单独成行
      expect(find.text(l10n.ttsStatus), findsNothing);
    });
  });

  group('破坏性操作隔离', () {
    testWidgets('重置引擎在独立的危险操作组里', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.settingsDangerZone), findsOneWidget);
      expect(find.text(l10n.resetEngine), findsOneWidget);
    });

    testWidgets('点重置引擎不会直接执行 —— 先弹确认框', (WidgetTester tester) async {
      var resetCalled = false;
      await pumpSettings(tester, onReset: () => resetCalled = true);

      final l10n = l10nOf(tester);
      await tapVisible(tester, find.text(l10n.resetEngine));

      // 确认框出现，且此时还没执行
      expect(find.text(l10n.resetEngineConfirmDesc), findsOneWidget);
      expect(resetCalled, isFalse);

      // 取消 → 仍然不执行
      await tester.tap(find.text(l10n.cancel));
      await tester.pumpAndSettle();
      expect(resetCalled, isFalse);
    });

    testWidgets('确认后才执行重置', (WidgetTester tester) async {
      var resetCalled = false;
      await pumpSettings(tester, onReset: () => resetCalled = true);

      final l10n = l10nOf(tester);
      await tapVisible(tester, find.text(l10n.resetEngine));

      await tester.tap(find.text(l10n.resetEngineConfirm));
      await tester.pumpAndSettle();

      expect(resetCalled, isTrue);
    });
  });

  group('能力入口可达', () {
    // 2026-10-29：`/settings/encephalon` 的路由与页面早就有了，但设置页里
    // **没有入口** —— 那个页面在 App 里点不到。这条测试锁住入口。
    testWidgets('嵌入式大脑入口在连接组里', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.settingsEncephalonEmbedded), findsOneWidget);
      expect(find.text(l10n.settingsEncephalonEmbeddedDesc), findsOneWidget);
    });

    testWidgets('旧的嵌入式 Prefrontal 入口已经彻底删除', (WidgetTester tester) async {
      await pumpSettings(tester);

      // 「遗留运行时」折叠区整体没了 ⇒ 「嵌入式 Prefrontal」那行再也点不到。
      // ⚠️ 用**字面量**而不是 l10n 键钉 —— 那些键随旧入口一起删了；
      // 这里要钉的是「那两行字不许再出现在设置页里」。
      expect(find.text('遗留运行时'), findsNothing);
      expect(find.text('嵌入式 Prefrontal'), findsNothing);
    });

    testWidgets('设备发现 / 端脑流程 / Resonance 入口都在', (WidgetTester tester) async {
      await pumpSettings(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.settingsDeviceDiscovery), findsOneWidget);
      expect(find.text(l10n.telencephalonFlows), findsOneWidget);
      expect(find.text(l10n.resonanceTitle), findsOneWidget);
    });
  });

  group('已去 Material', () {
    testWidgets('不再使用 Material 的 ListTile', (WidgetTester tester) async {
      await pumpSettings(tester);

      expect(find.byType(ListTile), findsNothing);
    });

    testWidgets('不再使用 Material 的 SegmentedButton / Switch', (
      WidgetTester tester,
    ) async {
      await pumpSettings(tester);

      expect(find.byType(SegmentedButton<ThemeMode>), findsNothing);
      expect(find.byType(Switch), findsNothing);
    });

    testWidgets('行用自建的 SettingsRow（不依赖 Material 祖先）', (
      WidgetTester tester,
    ) async {
      await pumpSettings(tester);

      expect(find.byType(SettingsRow), findsWidgets);
      expect(find.byType(SettingsGroup), findsWidgets);
    });
  });
}
