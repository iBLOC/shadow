import 'dart:convert';

import '../prefrontal_client.dart';

class AgentSettings {
  final String id;
  final String name;
  final String? description;
  final String model;
  final List<String> skills;
  final List<String> mcpServers;
  final bool isEnabled;
  final bool isOnline;
  final bool isDefault;
  final Map<String, dynamic>? settings;
  final String? soul;

  const AgentSettings({
    required this.id,
    required this.name,
    this.description,
    this.model = '',
    this.skills = const [],
    this.mcpServers = const [],
    this.isEnabled = true,
    this.isOnline = true,
    this.isDefault = false,
    this.settings,
    this.soul,
  });

  factory AgentSettings.fromAgentResponse(AgentResponse response) {
    return AgentSettings(
      id: response.id,
      name: response.name,
      description: response.description,
      model: response.model,
      skills: response.skills,
      mcpServers: response.mcpServers,
      isEnabled: response.isOnline,
      isOnline: response.isOnline,
      isDefault: response.isDefault,
    );
  }

  factory AgentSettings.fromMap(Map<String, dynamic> map) {
    return AgentSettings(
      id: map['id'] as String,
      name: map['name'] as String,
      description: map['description'] as String?,
      model: map['model'] as String? ?? '',
      skills: (map['skills'] as List<dynamic>?)?.cast<String>() ?? [],
      mcpServers: (map['mcp_servers'] as List<dynamic>?)?.cast<String>() ?? [],
      isEnabled: (map['is_enabled'] as int?) == 1,
      isOnline: (map['is_online'] as bool?) ?? true,
      isDefault: (map['is_default'] as bool?) ?? false,
      settings: map['settings'] != null
          ? jsonDecode(map['settings'] as String) as Map<String, dynamic>
          : null,
      soul: map['soul'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'model': model,
      'skills': skills,
      'mcp_servers': mcpServers,
      'is_enabled': isEnabled ? 1 : 0,
      'is_online': isOnline,
      'is_default': isDefault,
      'settings': settings != null ? jsonEncode(settings) : null,
      'soul': soul,
    };
  }

  AgentSettings copyWith({
    String? id,
    String? name,
    String? description,
    String? model,
    List<String>? skills,
    List<String>? mcpServers,
    bool? isEnabled,
    bool? isOnline,
    bool? isDefault,
    Map<String, dynamic>? settings,
    String? soul,
  }) {
    return AgentSettings(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      model: model ?? this.model,
      skills: skills ?? this.skills,
      mcpServers: mcpServers ?? this.mcpServers,
      isEnabled: isEnabled ?? this.isEnabled,
      isOnline: isOnline ?? this.isOnline,
      isDefault: isDefault ?? this.isDefault,
      settings: settings ?? this.settings,
      soul: soul ?? this.soul,
    );
  }
}
