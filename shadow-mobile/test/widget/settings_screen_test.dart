import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/settings_screen.dart';
import 'test_helper.dart';

void main() {
  testSetup();
  group('SettingsScreen Widget Tests', () {
    testWidgets('renders settings screen with scaffold', (
      WidgetTester tester,
    ) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows back button', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });

    testWidgets('shows Settings title in app bar', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('shows model info section', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.text('Test Model'), findsOneWidget);
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
    });

    testWidgets('shows theme toggle section', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.byType(SegmentedButton<ThemeMode>), findsOneWidget);
    });

    testWidgets('shows service status section', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.text('Service Status'), findsOneWidget);
      expect(find.byIcon(Icons.cloud), findsOneWidget);
    });

    testWidgets('shows model store section', (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.byType(ListTile), findsWidgets);
    });

    testWidgets('Backend (Telencephalon) card renders with URL + token fields',
        (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(find.text('Backend (Telencephalon)'), findsOneWidget);
      // Two TextFields: Base URL + Admin Token
      expect(find.byType(TextField), findsNWidgets(2));
      expect(find.text('Base URL'), findsOneWidget);
      expect(find.text('Admin Token (optional)'), findsOneWidget);
      expect(find.text('Save'), findsOneWidget);
    });

    testWidgets('flows list tile subtitle mentions telencephalon (not cortex)',
        (WidgetTester tester) async {
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
            home: SettingsScreen(modelInfo: 'Test Model', onReset: () {}),
          ),
        ),
      );

      expect(
        find.text('Browse and run telencephalon flows'),
        findsOneWidget,
      );
    });
  });
}
