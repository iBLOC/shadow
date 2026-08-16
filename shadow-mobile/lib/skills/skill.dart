/// Skill类型
enum SkillType {
  /// JS Skill - 通过Webview执行
  js,

  /// Native Skill - 通过Intent执行
  native,
}

/// Skill数据类
class Skill {
  final String name;
  final String description;
  final String? homepage;
  final SkillType type;
  final String instructions;
  final bool requireSecret;
  final String? requireSecretDescription;
  final List<SkillParam>? parameters;

  const Skill({
    required this.name,
    required this.description,
    this.homepage,
    required this.type,
    required this.instructions,
    this.requireSecret = false,
    this.requireSecretDescription,
    this.parameters,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'description': description,
      'homepage': homepage,
      'type': type.name,
      'instructions': instructions,
      'requireSecret': requireSecret,
      'requireSecretDescription': requireSecretDescription,
      'parameters': parameters?.map((p) => p.toJson()).toList(),
    };
  }

  factory Skill.fromJson(Map<String, dynamic> json) {
    return Skill(
      name: json['name'] as String,
      description: json['description'] as String,
      homepage: json['homepage'] as String?,
      type: SkillType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => SkillType.js,
      ),
      instructions: json['instructions'] as String,
      requireSecret: json['requireSecret'] as bool? ?? false,
      requireSecretDescription: json['requireSecretDescription'] as String?,
      parameters: (json['parameters'] as List<dynamic>?)
          ?.map((e) => SkillParam.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Skill参数定义
class SkillParam {
  final String name;
  final String type;
  final String description;
  final bool required;
  final String? defaultValue;

  const SkillParam({
    required this.name,
    required this.type,
    required this.description,
    this.required = true,
    this.defaultValue,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'type': type,
      'description': description,
      'required': required,
      'defaultValue': defaultValue,
    };
  }

  factory SkillParam.fromJson(Map<String, dynamic> json) {
    return SkillParam(
      name: json['name'] as String,
      type: json['type'] as String,
      description: json['description'] as String,
      required: json['required'] as bool? ?? true,
      defaultValue: json['defaultValue'] as String?,
    );
  }
}

/// SKILL.md 解析结果
class SkillParseResult {
  final String name;
  final String description;
  final String? homepage;
  final String instructions;
  final Map<String, dynamic>? metadata;
  final bool requireSecret;
  final String? requireSecretDescription;

  const SkillParseResult({
    required this.name,
    required this.description,
    this.homepage,
    required this.instructions,
    this.metadata,
    this.requireSecret = false,
    this.requireSecretDescription,
  });

  Skill toSkill(SkillType type) {
    return Skill(
      name: name,
      description: description,
      homepage: homepage,
      type: type,
      instructions: instructions,
      requireSecret: requireSecret,
      requireSecretDescription: requireSecretDescription,
    );
  }
}
