import 'dart:convert';

class AgentSettings {
  final String id;
  final String name;
  final String? description;
  final bool isEnabled;
  final Map<String, dynamic>? settings;
  final String? soul; // Soul content for main agent (Chat Agent)

  const AgentSettings({
    required this.id,
    required this.name,
    this.description,
    this.isEnabled = true,
    this.settings,
    this.soul,
  });

  factory AgentSettings.fromMap(Map<String, dynamic> map) {
    return AgentSettings(
      id: map['id'] as String,
      name: map['name'] as String,
      description: map['description'] as String?,
      isEnabled: (map['is_enabled'] as int) == 1,
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
      'is_enabled': isEnabled ? 1 : 0,
      'settings': settings != null ? jsonEncode(settings) : null,
      'soul': soul,
    };
  }

  AgentSettings copyWith({
    String? id,
    String? name,
    String? description,
    bool? isEnabled,
    Map<String, dynamic>? settings,
    String? soul,
  }) {
    return AgentSettings(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      isEnabled: isEnabled ?? this.isEnabled,
      settings: settings ?? this.settings,
      soul: soul ?? this.soul,
    );
  }
}
