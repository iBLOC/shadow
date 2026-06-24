import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/prompt_settings_screen.dart';
import 'package:shadow_mobile/agents/providers/agent_provider.dart';
import 'test_helper.dart';

void main() {
  testSetup();

  group('PromptSettingsScreen Widget Tests', () {
    testWidgets('renders scaffold with app bar', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('shows Prompt Settings title in app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.text('Prompt Settings'), findsOneWidget);
    });

    testWidgets('shows save button in app bar', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.text('Save'), findsOneWidget);
    });

    testWidgets('shows TextField for prompt input', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('shows reset button', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.text('Reset to Default'), findsOneWidget);
      expect(find.byIcon(Icons.restore), findsOneWidget);
    });

    testWidgets('shows prompt section title', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      expect(find.text('Main Agent System Prompt'), findsOneWidget);
    });

    testWidgets('can enter custom prompt text', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);

      await tester.enterText(textField, 'You are a helpful assistant.');
      await tester.pumpAndSettle();

      expect(find.text('You are a helpful assistant.'), findsOneWidget);
    });

    testWidgets('can tap save button', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const PromptSettingsScreen(),
          ),
        ),
      );

      final saveButton = find.text('Save');
      expect(saveButton, findsOneWidget);

      await tester.tap(saveButton);
      await tester.pumpAndSettle();

      expect(find.text('Save'), findsOneWidget);
    });
  });
}
