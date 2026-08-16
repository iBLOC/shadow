import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/models/model_config.dart';

void main() {
  group('ModelInfo', () {
    test('creates from JSON', () {
      final json = {
        'id': 'test-model',
        'name': 'Test Model',
        'description': 'A test model',
        'path': '/models/test',
        'context_length': 4096,
        'quantization': 'q4km',
        'supports': ['chat', 'vision'],
      };

      final model = ModelInfo.fromJson(json);

      expect(model.id, 'test-model');
      expect(model.name, 'Test Model');
      expect(model.description, 'A test model');
      expect(model.path, '/models/test');
      expect(model.contextLength, 4096);
      expect(model.quantization, 'q4km');
      expect(model.supports, ['chat', 'vision']);
    });

    test('toJson returns correct map', () {
      const model = ModelInfo(
        id: 'model-1',
        name: 'Model One',
        description: 'Description',
        path: '/path/to/model',
        contextLength: 8192,
        quantization: 'q8km',
        supports: ['chat'],
      );

      final json = model.toJson();

      expect(json['id'], 'model-1');
      expect(json['name'], 'Model One');
      expect(json['context_length'], 8192);
    });

    test('supportsCapability returns true when capability exists', () {
      const model = ModelInfo(
        id: 'test',
        name: 'Test',
        description: '',
        path: '',
        contextLength: 4096,
        quantization: 'q4km',
        supports: ['chat', 'vision', 'audio'],
      );

      expect(model.supportsCapability('chat'), true);
      expect(model.supportsCapability('vision'), true);
      expect(model.supportsCapability('audio'), true);
    });

    test('supportsCapability returns false when capability missing', () {
      const model = ModelInfo(
        id: 'test',
        name: 'Test',
        description: '',
        path: '',
        contextLength: 4096,
        quantization: 'q4km',
        supports: ['chat'],
      );

      expect(model.supportsCapability('vision'), false);
      expect(model.supportsCapability('unknown'), false);
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'minimal-model',
        'name': 'Minimal',
        'path': '/model',
      };

      final model = ModelInfo.fromJson(json);

      expect(model.id, 'minimal-model');
      expect(model.contextLength, 4096);
      expect(model.quantization, 'q4km');
      expect(model.supports, isEmpty);
    });
  });

  group('EngineConfig', () {
    test('creates from JSON', () {
      final json = {
        'engine': 'mnn',
        'default_model': 'model-1',
        'models': [
          {
            'id': 'model-1',
            'name': 'Model 1',
            'description': 'First',
            'path': '/models/1',
            'context_length': 4096,
            'quantization': 'q4km',
            'supports': ['chat'],
          },
          {
            'id': 'model-2',
            'name': 'Model 2',
            'description': 'Second',
            'path': '/models/2',
            'context_length': 8192,
            'quantization': 'q8km',
            'supports': ['chat', 'vision'],
          },
        ],
      };

      final config = EngineConfig.fromJson(json);

      expect(config.engine, 'mnn');
      expect(config.defaultModel, 'model-1');
      expect(config.models.length, 2);
      expect(config.models[0].name, 'Model 1');
      expect(config.models[1].supports, ['chat', 'vision']);
    });

    test('toJson returns correct map', () {
      const config = EngineConfig(
        engine: 'litert',
        defaultModel: 'default',
        models: [],
      );

      final json = config.toJson();

      expect(json['engine'], 'litert');
      expect(json['default_model'], 'default');
    });

    test('defaultModelInfo returns correct model', () {
      const config = EngineConfig(
        engine: 'test',
        defaultModel: 'model-2',
        models: [
          ModelInfo(
            id: 'model-1',
            name: 'Model 1',
            description: '',
            path: '',
            contextLength: 4096,
            quantization: 'q4km',
            supports: [],
          ),
          ModelInfo(
            id: 'model-2',
            name: 'Model 2',
            description: '',
            path: '',
            contextLength: 4096,
            quantization: 'q4km',
            supports: [],
          ),
        ],
      );

      expect(config.defaultModelInfo?.id, 'model-2');
    });

    test('getModelById returns correct model', () {
      const config = EngineConfig(
        engine: 'test',
        defaultModel: 'default',
        models: [
          ModelInfo(
            id: 'find-me',
            name: 'Find Me',
            description: '',
            path: '',
            contextLength: 4096,
            quantization: 'q4km',
            supports: [],
          ),
        ],
      );

      expect(config.getModelById('find-me')?.name, 'Find Me');
      expect(config.getModelById('nonexistent'), isNull);
    });
  });

  group('EngineType', () {
    test('has correct id and displayName', () {
      expect(EngineType.litert.id, 'litert');
      expect(EngineType.litert.displayName, 'liteRT');
      expect(EngineType.mnn.id, 'mnn');
      expect(EngineType.mnn.displayName, 'MNN');
    });

    test('fromId returns correct type', () {
      expect(EngineType.fromId('litert'), EngineType.litert);
      expect(EngineType.fromId('mnn'), EngineType.mnn);
    });

    test('fromId returns litert for unknown id', () {
      expect(EngineType.fromId('unknown'), EngineType.litert);
    });
  });
}
