import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/widgets/chat_bubble.dart';
import 'package:shadow_mobile/widgets/glass_bottom_nav.dart';
import 'package:shadow_mobile/widgets/main_shell.dart';
import 'package:shadow_mobile/widgets/responsive.dart';

/// 折叠屏 / 平板宽屏适配（Galaxy Z Fold5 展开 ≈ 700dp = medium 档）。
///
/// 锁三件事：
/// ① 窄屏（手机 / Fold5 外屏）保持底部导航，不出现侧边栏 —— 不能
///    为了平板把手机回归搞坏；
/// ② **700dp 必须出侧边栏** —— 这一条专门钉住 Fold5 的 medium 档；
///    阈值要是错取了 840（expanded），700dp 就会漏回底部导航；
/// ③ 气泡在宽屏下被绝对上限兜住 —— 分数宽度（0.75 × 900 = 675dp）
///    在折叠屏上是没法读的。
///
/// ⚠️ 反向验证不是恒绿：把 main_shell 的断点判断拆掉（恒走底部导航），
/// ②③ 组当场红；把气泡上限退回纯分数宽度，气泡组当场红。
void main() {
  /// 生产同形状的最小路由：每条路由自己包一层 MainShell
  /// （与 `app_router.dart` 的 `_wrapInShell` 同构）。
  GoRouter buildRouter() => GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) =>
            const MainShell(currentPath: '/', child: Text('HOME-BODY')),
      ),
      GoRoute(
        path: '/tasks',
        builder: (_, _) =>
            const MainShell(currentPath: '/tasks', child: Text('TASKS-BODY')),
      ),
    ],
  );

  Future<void> pumpShell(
    WidgetTester tester, {
    required Size logicalSize,
  }) async {
    tester.view.physicalSize = logicalSize;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp.router(
        routerConfig: buildRouter(),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: const [Locale('en')],
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('MainShell 断点切换', () {
    testWidgets('400dp（手机 / Fold5 外屏）⇒ 底部导航，无侧边栏', (tester) async {
      await pumpShell(tester, logicalSize: const Size(400, 800));

      expect(find.byType(GlassBottomNav), findsOneWidget);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
      expect(find.byType(GlassNavRail), findsNothing);
      expect(find.text('HOME-BODY'), findsOneWidget);
    });

    testWidgets('700dp（Fold5 展开的 medium 档）⇒ 侧边栏，无底部导航', (tester) async {
      await pumpShell(tester, logicalSize: const Size(700, 800));

      expect(find.byType(GlassNavRail), findsOneWidget);
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(GlassBottomNav), findsNothing);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.text('HOME-BODY'), findsOneWidget);
    });

    testWidgets('900dp（expanded 档）⇒ 侧边栏', (tester) async {
      await pumpShell(tester, logicalSize: const Size(900, 800));

      expect(find.byType(GlassNavRail), findsOneWidget);
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(GlassBottomNav), findsNothing);
    });

    testWidgets('侧边栏点「任务」⇒ 路由到 /tasks', (tester) async {
      await pumpShell(tester, logicalSize: const Size(700, 800));

      // nav.g.dart 里 tasks tab 的图标是 Icons.task_alt。
      await tester.tap(find.byIcon(Icons.task_alt));
      await tester.pumpAndSettle();

      expect(find.text('TASKS-BODY'), findsOneWidget);
    });
  });

  group('气泡宽屏上限', () {
    testWidgets('900dp 宽下用户气泡 ≤ 480dp（0.75 × 900 = 675 不允许）', (tester) async {
      tester.view.physicalSize = const Size(900, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MessageBubble(message: ChatMessage.user('hi')),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final boxes = tester.widgetList<ConstrainedBox>(
        find.descendant(
          of: find.byType(MessageBubble),
          matching: find.byType(ConstrainedBox),
        ),
      );
      expect(boxes, isNotEmpty);
      for (final box in boxes) {
        expect(
          box.constraints.maxWidth,
          lessThanOrEqualTo(480.01),
          reason:
              '折叠屏展开后气泡必须被绝对上限兜住，'
              '不能跟着屏宽的分数走（0.75 × 900 = 675dp 没法读）',
        );
      }
    });
  });

  group('responsive.dart 断点真相源', () {
    testWidgets('isWideScreen 的档位边界', (tester) async {
      bool? at600;
      bool? at599;

      tester.view.physicalSize = const Size(600, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      // ⚠️ isWideScreen 读的是 MediaQuery（视图逻辑宽），不是局部约束 ——
      // 断言前必须显式把视图尺寸设成目标宽度，别让默认 800 宽「碰巧」绿。
      await tester.pumpWidget(
        Builder(
          builder: (context) {
            at600 = isWideScreen(context);
            return const SizedBox.shrink();
          },
        ),
      );

      tester.view.physicalSize = const Size(599, 800);
      await tester.pumpWidget(
        Builder(
          builder: (context) {
            at599 = isWideScreen(context);
            return const SizedBox.shrink();
          },
        ),
      );

      expect(at600, isTrue, reason: '600dp 是宽屏下界（medium 档起点）');
      expect(at599, isFalse, reason: '599dp 仍是窄屏');
    });
  });
}
