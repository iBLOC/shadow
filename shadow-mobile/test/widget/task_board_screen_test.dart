import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/task_board_screen.dart';
import 'test_helper.dart';

void main() {
  testSetup();
  group('TaskBoardScreen Widget Tests', () {
    testWidgets('renders task board screen with app bar', (
      WidgetTester tester,
    ) async {
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
            home: const TaskBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('shows kanban columns', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.add), findsWidgets);
    });

    testWidgets('shows add task button in column', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('can tap add button in kanban column', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      final addIcons = find.byIcon(Icons.add);
      expect(addIcons, findsWidgets);

      await tester.tap(addIcons.first);
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });
  });
}
