import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
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

      // ⚠️ **输入框必须一直在** —— 本地对话视图（LocalChatView）是**无条件渲染**的
      //   ⇒ ⇒ 以前那条 `if (textField.evaluate().isNotEmpty)` 把整条断言
      //   ⇒ ⇒ 挂在「找得到才验」的条件上 ⇒ ⇒ 找不到就**零断言通过**。
      final textField = find.byType(TextField);
      expect(textField, findsWidgets, reason: '聊天页必须有一个能收字的输入框');

      await tester.enterText(textField.first, 'Hello');
      await tester.pump();

      // ⚠️ **字真的进去了** —— 光调 `enterText` 不算（它不保证落到控件上）。
      expect(find.text('Hello'), findsWidgets, reason: '字没进到输入框里');
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
