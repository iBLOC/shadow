import 'dart:convert';

enum ModelSource {
  localEngine('LiteRT', '本应用 LiteRT 推理引擎'),
  internalService('内部服务', 'Prefrontal/Rust 服务'),
  cloudProvider('云端', 'OpenAI/Anthropic 等云供应商');

  final String label;
  final String description;
  const ModelSource(this.label, this.description);
}

enum ModelType {
  llm('LLM', '大型语言模型'),
  tts('TTS', '语音合成');

  final String label;
  final String description;
  const ModelType(this.label, this.description);
}

class ModelItem {
  final String id;
  final String name;
  final String path;
  final String type;
  final int size;
  final bool isLoaded;
  final bool isLocal;
  final ModelSource source;
  final ModelType modelType;
  final String? endpoint;
  final String? apiKey;
  final String? model;
  final Map<String, dynamic>? settings;

  const ModelItem({
    required this.id,
    required this.name,
    required this.path,
    this.type = 'text',
    this.size = 0,
    this.isLoaded = false,
    this.isLocal = true,
    this.source = ModelSource.localEngine,
    this.modelType = ModelType.llm,
    this.endpoint,
    this.apiKey,
    this.model,
    this.settings,
  });

  factory ModelItem.fromMap(Map<String, dynamic> map) {
    return ModelItem(
      id: map['id'] as String,
      name: map['name'] as String,
      path: map['path'] as String,
      type: map['type'] as String? ?? 'text',
      size: map['size'] as int? ?? 0,
      isLoaded: (map['is_loaded'] as int?) == 1,
      isLocal: (map['is_local'] as int?) != 0,
      source: ModelSource.values.firstWhere(
        (e) => e.name == (map['source'] as String?),
        orElse: () => ModelSource.localEngine,
      ),
      modelType: ModelType.values.firstWhere(
        (e) => e.name == (map['model_type'] as String?),
        orElse: () => ModelType.llm,
      ),
      endpoint: map['endpoint'] as String?,
      apiKey: map['api_key'] as String?,
      model: map['model'] as String?,
      settings: map['settings'] != null
          ? jsonDecode(map['settings'] as String) as Map<String, dynamic>
          : null,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'path': path,
      'type': type,
      'size': size,
      'is_loaded': isLoaded ? 1 : 0,
      'is_local': isLocal ? 1 : 0,
      'source': source.name,
      'model_type': modelType.name,
      'endpoint': endpoint,
      'api_key': apiKey,
      'model': model,
      'settings': settings != null ? jsonEncode(settings) : null,
    };
  }

  ModelItem copyWith({
    String? id,
    String? name,
    String? path,
    String? type,
    int? size,
    bool? isLoaded,
    bool? isLocal,
    ModelSource? source,
    ModelType? modelType,
    String? endpoint,
    String? apiKey,
    String? model,
    Map<String, dynamic>? settings,
  }) {
    return ModelItem(
      id: id ?? this.id,
      name: name ?? this.name,
      path: path ?? this.path,
      type: type ?? this.type,
      size: size ?? this.size,
      isLoaded: isLoaded ?? this.isLoaded,
      isLocal: isLocal ?? this.isLocal,
      source: source ?? this.source,
      modelType: modelType ?? this.modelType,
      endpoint: endpoint ?? this.endpoint,
      apiKey: apiKey ?? this.apiKey,
      model: model ?? this.model,
      settings: settings ?? this.settings,
    );
  }
}
