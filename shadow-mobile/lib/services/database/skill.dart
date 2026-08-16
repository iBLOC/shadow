import 'dart:convert';

class Skill {
  final String id;
  final String name;
  final String? description;
  final bool isEnabled;
  final bool isBuiltIn;
  final Map<String, dynamic>? settings;

  const Skill({
    required this.id,
    required this.name,
    this.description,
    this.isEnabled = true,
    this.isBuiltIn = false,
    this.settings,
  });

  factory Skill.fromMap(Map<String, dynamic> map) {
    return Skill(
      id: map['id'] as String,
      name: map['name'] as String,
      description: map['description'] as String?,
      isEnabled: (map['is_enabled'] as int) == 1,
      isBuiltIn: (map['is_built_in'] as int) == 1,
      settings: map['settings'] != null
          ? jsonDecode(map['settings'] as String) as Map<String, dynamic>
          : null,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'is_enabled': isEnabled ? 1 : 0,
      'is_built_in': isBuiltIn ? 1 : 0,
      'settings': settings != null ? jsonEncode(settings) : null,
    };
  }

  Skill copyWith({
    String? id,
    String? name,
    String? description,
    bool? isEnabled,
    bool? isBuiltIn,
    Map<String, dynamic>? settings,
  }) {
    return Skill(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      isEnabled: isEnabled ?? this.isEnabled,
      isBuiltIn: isBuiltIn ?? this.isBuiltIn,
      settings: settings ?? this.settings,
    );
  }
}
