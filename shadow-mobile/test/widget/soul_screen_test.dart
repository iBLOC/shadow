import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/soul_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/soul_service.dart';
import 'test_helper.dart';

class MockSoulService extends SoulService {
  MockSoulService() : super(client: PrefrontalClient());

  @override
  Future<String?> getCurrentSoul(String agentId) async {
    return 'You are a helpful assistant.';
  }

  @override
  Future<List<SoulVersionResponse>> getVersionHistory(String agentId) async {
    return [
      SoulVersionResponse(
        id: '1',
        agentId: agentId,
        content: 'You are a helpful assistant.',
        source: 'user',
        reason: 'User directly edited Soul',
        conversationSummary: null,
        triggerType: 'user_edit',
        version: 1,
        createdAt: DateTime.now(),
      ),
    ];
  }

  @override
  Future<void> updateSoulByUser({
    required String agentId,
    required String newSoul,
    String? triggerType = 'user_edit',
  }) async {
    // no-op for tests
  }
}

final mockSoulServiceProvider = Provider<SoulService>((ref) {
  return MockSoulService();
});

MaterialApp _localizedApp(Widget child) {
  return MaterialApp(
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: const [Locale('en')],
    locale: const Locale('en'),
    home: child,
  );
}

void main() {
  testSetup();

  testWidgets('SoulScreen renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    // 文案走 l10n，所以断言也从 l10n 取 —— 翻译一改测试不用跟着改。
    expect(find.text(l10nOf(tester).soulTitle), findsOneWidget);
    expect(find.text(l10nOf(tester).soulSubtitle), findsOneWidget);
  });

  testWidgets('SoulScreen shows AppBar with title', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(AppBar), findsOneWidget);
    expect(find.text(l10nOf(tester).soulTitle), findsOneWidget);
  });

  testWidgets('SoulScreen shows loading then content', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('SoulScreen shows version history section', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text(l10nOf(tester).soulUserModified), findsOneWidget);
  });

  testWidgets('SoulScreen has text field for soul editing', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.maxLines, null);
    expect(textField.expands, true);
  });

  testWidgets('can enter custom soul text', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    final textField = find.byType(TextField);
    expect(textField, findsOneWidget);

    await tester.enterText(textField, 'You are my personal assistant.');
    await tester.pumpAndSettle();

    expect(find.text('You are my personal assistant.'), findsOneWidget);
  });

  testWidgets('can tap save button', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: _localizedApp(const SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    // Change the text so the save button appears (_hasChanges becomes true)
    final textField = find.byType(TextField);
    await tester.enterText(textField, 'Modified soul text');
    await tester.pump();

    // After text change, AppBar actions should include the save button
    expect(find.text(l10nOf(tester).commonSave), findsOneWidget);

    await tester.tap(find.text(l10nOf(tester).commonSave));
    await tester.pump();

    // After save, _hasChanges resets to false so the button is hidden again
    expect(find.text(l10nOf(tester).commonSave), findsNothing);
  });
}
