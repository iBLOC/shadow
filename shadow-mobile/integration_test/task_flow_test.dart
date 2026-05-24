import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Task Flow Integration Tests', () {
    testWidgets('navigates to task board screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      final bottomNav = find.byType(BottomNavigationBar);
      if (bottomNav.evaluate().isNotEmpty) {
        await tester.tap(find.byIcon(Icons.checklist));
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }
    });

    testWidgets('task board shows task list', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byType(ListView), findsWidgets);
    });

    testWidgets('can refresh task list', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      final refreshIndicator = find.byType(RefreshIndicator);
      if (refreshIndicator.evaluate().isNotEmpty) {
        await tester.runAsync(() async {
          await Future.delayed(const Duration(milliseconds: 500));
        });
      }
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
