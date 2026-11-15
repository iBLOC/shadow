import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';
import 'test_helper.dart';

void main() {
  testSetup();
  group('ChatScreen Widget Tests', () {
    testWidgets('renders chat screen with app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows empty state when no messages', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Center), findsWidgets);
    });

    testWidgets('has send button', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.send), findsOneWidget);
    });

    testWidgets('has TextField for input', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('has attachment button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );

      // ⚠️ 2026-11-15 起附件入口挪到**右边**、形状是「＋」（回形针退休）。
      expect(find.byIcon(Icons.add), findsOneWidget);
      expect(find.byIcon(Icons.attach_file), findsNothing);
    });

    testWidgets('**没有**独立的麦克风钮（长按输入框就是录音）＋ 有相机钮', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );

      // ⚠️ 2026-11-15：输入区**统一成一个输入框**（轻触打字、长按说话）⇒ ⇒
      // 那个「键盘／麦克风」切换钮**退休**了 ⇒ ⇒ 也不许再有 VoiceInputView。
      expect(find.byIcon(Icons.mic), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
      // 相机钮（轻触拍照、长按录像）在。
      expect(find.byIcon(Icons.camera_alt), findsOneWidget);
    });

    testWidgets('can enter text and tap send button', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: getTestOverrides(),
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ChatScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);

      await tester.enterText(textField, 'Hello, Shadow!');
      await tester.pumpAndSettle();

      final sendButton = find.byIcon(Icons.send);
      expect(sendButton, findsOneWidget);

      await tester.tap(sendButton);
      await tester.pumpAndSettle();

      // 断言的是「**输入框**被清空」，而不是「页面上找不到这句话」。
      //
      // ⚠️ `find.text` 同时匹配 `Text` 和 `EditableText` —— 消息真的发出去
      // 之后，这句话会作为**用户消息气泡**留在会话里 ⇒ 那条「findsNothing」
      // 命中的将是气泡而不是输入框。
      //
      // 那条旧断言是在「消息根本发不出去」的年代写的：那时
      // `generateResponse` 带 `mode == litert && isLitertReady` 守卫，
      // 在没有本地模型的测试环境里直接 return —— 什么都没发生，
      // 测试也就「绿」了（`425e666` 修掉那个守卫之后才暴露）。
      final field = tester.widget<TextField>(textField);
      expect(field.controller?.text, isEmpty);

      // 消息真的进了会话 —— 这比「找不到文本」更能证明发送成功。
      expect(find.text('Hello, Shadow!'), findsOneWidget);
    });
  });
}
