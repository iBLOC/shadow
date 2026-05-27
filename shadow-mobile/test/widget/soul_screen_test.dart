import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/soul_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/soul_service.dart';
import 'package:shadow_mobile/widgets/glass_card.dart';
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
}

final mockSoulServiceProvider = Provider<SoulService>((ref) {
  return MockSoulService();
});

void main() {
  testSetup();

  testWidgets('SoulScreen renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: const MaterialApp(home: SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Soul 设置'), findsOneWidget);
    expect(find.text('Soul - 你的个人助理灵魂'), findsOneWidget);
  });

  testWidgets('SoulScreen shows AppBar with title', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: const MaterialApp(home: SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(AppBar), findsOneWidget);
    expect(find.text('Soul 设置'), findsOneWidget);
  });

  testWidgets('SoulScreen shows loading then content', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: const MaterialApp(home: SoulScreen(agentId: 'test-agent')),
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
        child: const MaterialApp(home: SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('版本历史'), findsOneWidget);
  });

  testWidgets('SoulScreen has text field for soul editing', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          soulServiceProvider.overrideWith((ref) => MockSoulService()),
        ],
        child: const MaterialApp(home: SoulScreen(agentId: 'test-agent')),
      ),
    );

    await tester.pump(const Duration(milliseconds: 500));

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.maxLines, null);
    expect(textField.expands, true);
  });
}
