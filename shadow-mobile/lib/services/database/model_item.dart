import 'dart:convert';

class ModelItem {
  final String id;
  final String name;
  final String path;
  final String type;
  final int size;
  final bool isLoaded;
  final bool isLocal;
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
      endpoint: endpoint ?? this.endpoint,
      apiKey: apiKey ?? this.apiKey,
      model: model ?? this.model,
      settings: settings ?? this.settings,
    );
  }
}
