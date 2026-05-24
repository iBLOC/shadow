import 'model_config.dart';

/// 模型引擎抽象接口
/// 定义所有推理引擎需要实现的通用接口
abstract class ModelEngine {
  /// 引擎名称
  String get name;

  /// 引擎类型
  EngineType get type;

  /// 是否已初始化
  bool get isInitialized;

  /// 当前使用的模型
  ModelInfo? get currentModel;

  /// 初始化引擎
  Future<void> initialize(ModelInfo model);

  /// 生成文本（非流式）
  Future<String> generate(String prompt);

  /// 生成文本（流式）
  Stream<String> generateStream(String prompt);

  /// 释放引擎资源
  Future<void> release();

  /// 检查引擎是否支持指定能力
  bool supportsCapability(String capability) {
    return currentModel?.supportsCapability(capability) ?? false;
  }
}

/// 引擎初始化异常
class EngineInitializationException implements Exception {
  final String message;
  final String? cause;

  EngineInitializationException(this.message, [this.cause]);

  @override
  String toString() =>
      'EngineInitializationException: $message${cause != null ? ' (Caused by: $cause)' : ''}';
}

/// 引擎执行异常
class EngineExecutionException implements Exception {
  final String message;
  final String? cause;

  EngineExecutionException(this.message, [this.cause]);

  @override
  String toString() =>
      'EngineExecutionException: $message${cause != null ? ' (Caused by: $cause)' : ''}';
}
