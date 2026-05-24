import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App-Level Integration Tests', () {
    testWidgets('app launches successfully', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(MaterialApp), findsOneWidget);
    });

    testWidgets('app has navigation elements', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(NavigationBar), findsWidgets);
    });

    testWidgets('app shows scaffold', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('app initializes without crash', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));
    });
  });
}
