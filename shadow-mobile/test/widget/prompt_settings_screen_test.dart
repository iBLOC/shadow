import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/prompt_settings_screen.dart';
import 'package:shadow_mobile/agents/providers/agent_provider.dart';
import 'test_helper.dart';

void main() {
  testSetup();

  group('PromptSettingsScreen Widget Tests', () {
    testWidgets('renders scaffold with app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('shows 提示词设置 title in app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.text('提示词设置'), findsOneWidget);
    });

    testWidgets('shows save button in app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.text('保存'), findsOneWidget);
    });

    testWidgets('shows TextField for prompt input', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('shows reset button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.text('恢复默认'), findsOneWidget);
      expect(find.byIcon(Icons.restore), findsOneWidget);
    });

    testWidgets('shows prompt section title', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            customPromptProvider.overrideWith((ref) => null),
          ],
          child: const MaterialApp(home: PromptSettingsScreen()),
        ),
      );

      expect(find.text('主Agent系统提示词'), findsOneWidget);
    });
  });
}
