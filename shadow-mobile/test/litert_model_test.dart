import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/litert_model.dart';

void main() {
  group('LiteRTModels', () {
    test('getById returns the registered model', () {
      final model = LiteRTModels.getById('gemma4-e4b');
      expect(model, isNotNull);
      expect(model!.displayName, 'Gemma-4-E4B');
    });

    test('getById returns null for unknown id', () {
      final model = LiteRTModels.getById('nonexistent-model');
      expect(model, isNull);
    });

    test('allModels exposes both registered models', () {
      expect(LiteRTModels.allModels.length, 2);
      expect(
        LiteRTModels.allModels.map((m) => m.id),
        containsAll(['gemma4-e4b', 'gemma3-1b']),
      );
    });

    test('defaultModel is the heavier gemma4-e4b', () {
      expect(LiteRTModels.defaultModel.id, 'gemma4-e4b');
    });

    test('mobileModel is the lighter gemma3-1b', () {
      expect(LiteRTModels.mobileModel.id, 'gemma3-1b');
    });
  });

  group('Agent', () {
    test('copyWith preserves unchanged fields', () {
      final original = Agents.chatAgent;
      final updated = original.copyWith(isInitialized: true);
      expect(updated.type, original.type);
      expect(updated.model, original.model);
      expect(updated.isInitialized, isTrue);
    });
  });
}
