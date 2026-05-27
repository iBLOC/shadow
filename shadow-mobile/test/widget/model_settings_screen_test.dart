import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/model_settings_screen.dart';
import 'package:shadow_mobile/models/model_config.dart';
import 'package:shadow_mobile/models/model_providers.dart';
import 'test_helper.dart';

void main() {
  testSetup();

  final testConfig = const EngineConfig(
    engine: 'mnn',
    defaultModel: 'test-model',
    models: [
      ModelInfo(
        id: 'test-model',
        name: 'Test Model',
        description: 'A test model for unit testing',
        path: '/models/test',
        contextLength: 4096,
        quantization: 'q4km',
        supports: ['chat', 'vision'],
      ),
      ModelInfo(
        id: 'vision-model',
        name: 'Vision Model',
        description: 'Model with vision support',
        path: '/models/vision',
        contextLength: 8192,
        quantization: 'q8km',
        supports: ['chat', 'vision'],
      ),
    ],
  );

  group('ModelSettingsScreen Widget Tests', () {
    testWidgets('renders scaffold with app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            selectedEngineProvider.overrideWith((ref) => EngineType.mnn),
            currentEngineConfigProvider.overrideWith((ref) async => testConfig),
            selectedModelIdProvider.overrideWith((ref) => 'test-model'),
          ],
          child: const MaterialApp(home: ModelSettingsScreen()),
        ),
      );

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('shows 模型设置 title in app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            selectedEngineProvider.overrideWith((ref) => EngineType.mnn),
            currentEngineConfigProvider.overrideWith((ref) async => testConfig),
            selectedModelIdProvider.overrideWith((ref) => 'test-model'),
          ],
          child: const MaterialApp(home: ModelSettingsScreen()),
        ),
      );

      expect(find.text('模型设置'), findsOneWidget);
    });

    testWidgets('shows engine selector with liteRT and MNN options', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            selectedEngineProvider.overrideWith((ref) => EngineType.mnn),
            currentEngineConfigProvider.overrideWith((ref) async => testConfig),
            selectedModelIdProvider.overrideWith((ref) => 'test-model'),
          ],
          child: const MaterialApp(home: ModelSettingsScreen()),
        ),
      );

      expect(find.text('liteRT'), findsOneWidget);
      expect(find.text('MNN'), findsOneWidget);
      expect(find.byType(SegmentedButton<EngineType>), findsOneWidget);
    });

    testWidgets('shows 选择模型 section title', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            selectedEngineProvider.overrideWith((ref) => EngineType.mnn),
            currentEngineConfigProvider.overrideWith((ref) async => testConfig),
            selectedModelIdProvider.overrideWith((ref) => 'test-model'),
          ],
          child: const MaterialApp(home: ModelSettingsScreen()),
        ),
      );

      expect(find.text('选择模型'), findsOneWidget);
    });
  });
}
