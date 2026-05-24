import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'skill.dart';

/// Skill加载器
/// 负责从assets加载Skill定义和SKILL.md解析
class SkillLoader {
  /// 加载所有内置Skill
  Future<List<Skill>> loadBuiltInSkills() async {
    final skills = <Skill>[];

    try {
      // 加载AssetManifest获取所有assets
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      final manifest = jsonDecode(manifestContent) as Map<String, dynamic>;

      // 查找所有SKILL.md文件
      for (final path in manifest.keys) {
        if (path.startsWith('assets/skills/') && path.endsWith('SKILL.md')) {
          try {
            final content = await rootBundle.loadString(path);
            final result = _parseSkillFile(path, content);
            if (result != null) {
              final skill = result.toSkill(SkillType.js);
              skills.add(skill);
              debugPrint('Loaded skill: ${skill.name}');
            }
          } catch (e) {
            debugPrint('Failed to load skill from $path: $e');
          }
        }
      }
    } catch (e) {
      debugPrint('Failed to load built-in skills: $e');
    }

    return skills;
  }

  /// 解析SKILL.md文件
  /// SKILL.md格式:
  /// ---
  /// name: skill-name
  /// description: Skill描述
  /// metadata:
  ///   homepage: https://... (可选)
  /// ---
  ///
  /// # Skill标题
  ///
  /// 指令内容...
  SkillParseResult? _parseSkillFile(String path, String content) {
    try {
      // 解析frontmatter
      final frontmatterMatch = RegExp(
        r'^---\s*\n([\s\S]*?)\n---',
        multiLine: true,
      ).firstMatch(content);

      if (frontmatterMatch == null) {
        debugPrint('Invalid SKILL.md format: $path');
        return null;
      }

      final frontmatterContent = frontmatterMatch.group(1) ?? '';
      final bodyContent = content.substring(frontmatterMatch.end).trim();

      // 解析frontmatter
      final frontmatter = _parseFrontmatter(frontmatterContent);

      final name = frontmatter['name'] as String?;
      final description = frontmatter['description'] as String? ?? '';
      final homepage = frontmatter['homepage'] as String?;
      final requireSecret =
          frontmatter['requireSecret'] == 'true' ||
          frontmatter['requireSecret'] == 'yes';
      final requireSecretDescription =
          frontmatter['requireSecretDescription'] as String?;

      if (name == null || name.isEmpty) {
        debugPrint('Skill name is required: $path');
        return null;
      }

      // 确定Skill类型
      final type = frontmatter['type'] as String?;
      final skillType = type == 'native' ? SkillType.native : SkillType.js;

      // 提取指令（body中 # 标题之后的内容）
      String instructions = bodyContent;
      final firstHeading = bodyContent.indexOf('# ');
      if (firstHeading >= 0) {
        instructions = bodyContent.substring(firstHeading).trim();
      }

      return SkillParseResult(
        name: name,
        description: description,
        homepage: homepage,
        instructions: instructions,
        requireSecret: requireSecret,
        requireSecretDescription: requireSecretDescription,
        metadata: frontmatter,
      );
    } catch (e) {
      debugPrint('Failed to parse SKILL.md: $path, error: $e');
      return null;
    }
  }

  /// 解析frontmatter
  Map<String, String> _parseFrontmatter(String content) {
    final result = <String, String>{};
    final lines = content.split('\n');

    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;

      final colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        final key = trimmed.substring(0, colonIndex).trim();
        var value = trimmed.substring(colonIndex + 1).trim();

        // 处理YAML嵌套结构
        if (value.contains(':')) {
          // 跳过嵌套结构，只取顶层
          continue;
        }

        result[key] = value;
      }
    }

    return result;
  }

  /// 从字符串解析Skill（用于用户添加的Skill）
  Skill? parseSkillFromString(String name, String content) {
    final result = _parseSkillFile('memory://$name', content);
    return result?.toSkill(SkillType.js);
  }

  /// 获取Skill的资源路径
  Future<String?> getSkillResourceUrl(String skillName, String resource) async {
    // 构建可能的资源路径
    final paths = [
      'assets/skills/$skillName/$resource',
      'assets/skills/$skillName/scripts/$resource',
    ];

    for (final path in paths) {
      try {
        await rootBundle.load(path);
        return path;
      } catch (_) {
        continue;
      }
    }

    return null;
  }

  /// 获取Skill的Webview URL
  Future<String?> getJsSkillUrl(String skillName, String? scriptName) async {
    final script = scriptName ?? 'index.html';
    return getSkillResourceUrl(skillName, script);
  }
}
