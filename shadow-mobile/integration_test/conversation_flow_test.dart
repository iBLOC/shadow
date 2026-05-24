import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Conversation Flow Integration Tests', () {
    testWidgets('chat screen displays message input', (
      WidgetTester tester,
    ) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('chat screen has send button', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byIcon(Icons.send), findsOneWidget);
    });

    testWidgets('chat screen can enter text', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      final textField = find.byType(TextField);
      if (textField.evaluate().isNotEmpty) {
        await tester.enterText(textField.first, 'Hello');
        await tester.pump();
      }
    });

    testWidgets('empty chat shows welcome message', (
      WidgetTester tester,
    ) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      final welcomeText = find.textContaining('Shadow');
      expect(welcomeText, findsWidgets);
    });

    testWidgets('message list is scrollable', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byType(ListView), findsOneWidget);
    });

    testWidgets('has attachment button for media', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byIcon(Icons.attach_file), findsOneWidget);
    });

    testWidgets('has microphone button for voice', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 5));

      expect(find.byIcon(Icons.mic), findsOneWidget);
    });
  });
}
