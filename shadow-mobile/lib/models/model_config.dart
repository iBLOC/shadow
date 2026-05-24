import 'dart:convert';
import 'package:flutter/services.dart';

/// 模型信息数据类
class ModelInfo {
  final String id;
  final String name;
  final String description;
  final String path;
  final int contextLength;
  final String quantization;
  final List<String> supports;

  const ModelInfo({
    required this.id,
    required this.name,
    required this.description,
    required this.path,
    required this.contextLength,
    required this.quantization,
    required this.supports,
  });

  factory ModelInfo.fromJson(Map<String, dynamic> json) {
    return ModelInfo(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      path: json['path'] as String,
      contextLength: json['context_length'] as int? ?? 4096,
      quantization: json['quantization'] as String? ?? 'q4km',
      supports:
          (json['supports'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'path': path,
      'context_length': contextLength,
      'quantization': quantization,
      'supports': supports,
    };
  }

  /// 检查模型是否支持指定能力
  bool supportsCapability(String capability) {
    return supports.contains(capability);
  }
}

/// 引擎配置数据类
class EngineConfig {
  final String engine;
  final List<ModelInfo> models;
  final String defaultModel;

  const EngineConfig({
    required this.engine,
    required this.models,
    required this.defaultModel,
  });

  factory EngineConfig.fromJson(Map<String, dynamic> json) {
    return EngineConfig(
      engine: json['engine'] as String,
      models: (json['models'] as List<dynamic>)
          .map((e) => ModelInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
      defaultModel: json['default_model'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'engine': engine,
      'models': models.map((m) => m.toJson()).toList(),
      'default_model': defaultModel,
    };
  }

  /// 获取默认模型信息
  ModelInfo? get defaultModelInfo {
    try {
      return models.firstWhere((m) => m.id == defaultModel);
    } catch (_) {
      return models.isNotEmpty ? models.first : null;
    }
  }

  /// 根据ID获取模型信息
  ModelInfo? getModelById(String id) {
    try {
      return models.firstWhere((m) => m.id == id);
    } catch (_) {
      return null;
    }
  }

  /// 从assets加载引擎配置
  static Future<EngineConfig> loadFromAssets(String engine) async {
    final jsonPath = engine == 'litert'
        ? 'assets/config/litert_models.json'
        : 'assets/config/mnn_models.json';

    final jsonString = await rootBundle.loadString(jsonPath);
    final json = jsonDecode(jsonString) as Map<String, dynamic>;
    return EngineConfig.fromJson(json);
  }
}

/// 引擎类型枚举
enum EngineType {
  litert('litert', 'liteRT'),
  mnn('mnn', 'MNN');

  final String id;
  final String displayName;

  const EngineType(this.id, this.displayName);

  static EngineType fromId(String id) {
    return EngineType.values.firstWhere(
      (e) => e.id == id,
      orElse: () => EngineType.litert,
    );
  }
}
