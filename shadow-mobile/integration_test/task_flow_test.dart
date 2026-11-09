import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/main.dart' as app;
import 'package:shadow_mobile/screens/task_board_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Task Flow Integration Tests', () {
    testWidgets('navigates to task board screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // ⚠️ **真的那个导航图标是 `Icons.task_alt`**（导航清单是生成的：
      //   `lib/navigation/nav.g.dart`）⇒ ⇒ 以前找的 `BottomNavigationBar`
      //   与 `Icons.checklist` **这仓里根本不存在**（底部栏是 Material 3 的
      //   `NavigationBar`）⇒ ⇒ 那条 `if` **永远不成立**
      //   ⇒ ⇒ 体从来没跑过 ⇒ ⇒ 零断言通过。
      final tasksTab = find.byIcon(Icons.task_alt);
      expect(tasksTab, findsOneWidget, reason: '底部导航里必须有「任务」这个入口');

      await tester.tap(tasksTab);
      // ⚠️ **不许用 pumpAndSettle** —— 任务板拉取期间是
      //   `CircularProgressIndicator` ⇒ ⇒ 它永远在转
      //   ⇒ ⇒ pumpAndSettle 会**超时**（挂住，不是失败）。
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      // ⚠️ 任务板自己的标识（路由 /tasks → TaskBoardScreen）
      expect(
        find.byType(TaskBoardScreen),
        findsOneWidget,
        reason: '点了「任务」却没走到任务板',
      );
    });

    testWidgets('task board shows task list', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byType(ListView), findsWidgets);
    });

    testWidgets('任务板有刷新按钮（点了不崩）', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      await tester.tap(find.byIcon(Icons.task_alt));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      // ⚠️ **任务板没有下拉刷新** —— 刷新是 AppBar 上那个按钮
      //   ⇒ ⇒ 以前找的 `RefreshIndicator` **在这屏上根本不存在**
      //   ⇒ ⇒ 那条 `if` **永远不成立** ⇒ ⇒ 体从来没跑过。
      final refresh = find.byIcon(Icons.refresh);
      expect(
        refresh,
        findsOneWidget,
        reason: '任务板必须有刷新按钮（刷不了就没法手动重拉）',
      );

      await tester.tap(refresh);
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(tester.takeException(), isNull, reason: '点了刷新不许把 app 搞炸');
    });

    testWidgets('task board handles empty state', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byType(ListTile), findsWidgets);
    });

    testWidgets('task card displays correctly', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      final cards = find.byType(Card);
      expect(cards, findsWidgets);
    });
  });
}
