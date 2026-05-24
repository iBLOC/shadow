import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'model_config.dart';
import 'model_engine.dart';

/// 引擎配置提供者
/// 根据引擎类型加载对应的模型配置
final engineConfigProvider = FutureProvider.family<EngineConfig, String>((
  ref,
  engine,
) async {
  return EngineConfig.loadFromAssets(engine);
});

/// 当前选中的引擎类型
final selectedEngineProvider = StateProvider<EngineType>(
  (ref) => EngineType.litert,
);

/// 当前选中的引擎配置
final currentEngineConfigProvider = FutureProvider<EngineConfig>((ref) async {
  final engine = ref.watch(selectedEngineProvider);
  return EngineConfig.loadFromAssets(engine.id);
});

/// 当前选中的模型ID
final selectedModelIdProvider = StateProvider<String?>((ref) => null);

/// 当前选中的模型信息
final selectedModelProvider = Provider<ModelInfo?>((ref) {
  final configAsync = ref.watch(currentEngineConfigProvider);
  final modelId = ref.watch(selectedModelIdProvider);

  return configAsync.whenOrNull(
    data: (config) {
      if (modelId != null) {
        return config.getModelById(modelId);
      }
      return config.defaultModelInfo;
    },
  );
});

/// 所有可用模型列表（扁平化）
final allAvailableModelsProvider = Provider<List<ModelInfo>>((ref) {
  final configsAsync = ref.watch(engineConfigProvider('litert'));
  final mnnConfigsAsync = ref.watch(engineConfigProvider('mnn'));

  final models = <ModelInfo>[];

  configsAsync.whenData((config) => models.addAll(config.models));
  mnnConfigsAsync.whenData((config) => models.addAll(config.models));

  return models;
});

/// 引擎Provider工厂
/// 用于创建指定引擎的实例
final engineFactoryProvider = Provider<EngineFactory>((ref) {
  return EngineFactory();
});

class EngineFactory {
  /// 创建指定引擎的实例
  ModelEngine createEngine(EngineType type) {
    switch (type) {
      case EngineType.litert:
        return LiteRTEngine();
      case EngineType.mnn:
        return MNNEngine();
    }
  }
}

// 注意: LiteRTEngine 和 MNNEngine 的实现需要根据实际SDK来完成
// 这里先给出接口定义，实际实现需要在Android Native层通过Platform Channel调用

/// LiteRT引擎实现（占位）
/// 实际实现需要通过Platform Channel调用Android Native的LiteRT SDK
class LiteRTEngine implements ModelEngine {
  @override
  String get name => 'liteRT';

  @override
  EngineType get type => EngineType.litert;

  @override
  bool get isInitialized => _isInitialized;

  @override
  ModelInfo? get currentModel => _currentModel;

  bool _isInitialized = false;
  ModelInfo? _currentModel;

  @override
  Future<void> initialize(ModelInfo model) async {
    // TODO: 通过Platform Channel调用Android Native LiteRT SDK
    // Platform: MethodChannel('com.ibloc.shadow/litert')
    _currentModel = model;
    _isInitialized = true;
  }

  @override
  bool supportsCapability(String capability) {
    return currentModel?.supportsCapability(capability) ?? false;
  }

  @override
  Future<String> generate(String prompt) async {
    // TODO: 通过Platform Channel调用模型推理
    throw UnimplementedError('LiteRT generate not implemented');
  }

  @override
  Stream<String> generateStream(String prompt) async* {
    // TODO: 通过Platform Channel调用流式推理
    throw UnimplementedError('LiteRT generateStream not implemented');
  }

  @override
  Future<void> release() async {
    // TODO: 释放LiteRT资源
    _isInitialized = false;
    _currentModel = null;
  }
}

/// MNN引擎实现（占位）
/// 实际实现需要通过Platform Channel调用Android Native的MNN SDK
class MNNEngine implements ModelEngine {
  @override
  String get name => 'MNN';

  @override
  EngineType get type => EngineType.mnn;

  @override
  bool get isInitialized => _isInitialized;

  @override
  ModelInfo? get currentModel => _currentModel;

  bool _isInitialized = false;
  ModelInfo? _currentModel;

  @override
  Future<void> initialize(ModelInfo model) async {
    // TODO: 通过Platform Channel调用Android Native MNN SDK
    // Platform: MethodChannel('com.ibloc.shadow/mnn')
    _currentModel = model;
    _isInitialized = true;
  }

  @override
  bool supportsCapability(String capability) {
    return currentModel?.supportsCapability(capability) ?? false;
  }

  @override
  Future<String> generate(String prompt) async {
    // TODO: 通过Platform Channel调用模型推理
    throw UnimplementedError('MNN generate not implemented');
  }

  @override
  Stream<String> generateStream(String prompt) async* {
    // TODO: 通过Platform Channel调用流式推理
    throw UnimplementedError('MNN generateStream not implemented');
  }

  @override
  Future<void> release() async {
    // TODO: 释放MNN资源
    _isInitialized = false;
    _currentModel = null;
  }
}
