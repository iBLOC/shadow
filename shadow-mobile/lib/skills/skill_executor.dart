import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'skill.dart';
import 'skill_loader.dart';

/// Skill执行结果
class SkillResult {
  final bool success;
  final String? result;
  final String? error;
  final SkillWebviewResult? webview;
  final SkillImageResult? image;

  const SkillResult({
    required this.success,
    this.result,
    this.error,
    this.webview,
    this.image,
  });

  factory SkillResult.success(String result) {
    return SkillResult(success: true, result: result);
  }

  factory SkillResult.failure(String error) {
    return SkillResult(success: false, error: error);
  }
}

/// Skill Webview结果
class SkillWebviewResult {
  final String url;
  final String? title;

  const SkillWebviewResult({required this.url, this.title});
}

/// Skill图片结果
class SkillImageResult {
  final String base64Data;
  final String? mimeType;

  const SkillImageResult({required this.base64Data, this.mimeType});
}

/// Skill执行器
/// 负责执行JS Skill和Native Skill
class SkillExecutor {
  final SkillLoader _loader;
  final Map<String, String> _skillSecrets = {};

  SkillExecutor({SkillLoader? loader}) : _loader = loader ?? SkillLoader();

  /// 保存Skill的Secret
  void setSecret(String skillName, String secret) {
    _skillSecrets[skillName] = secret;
  }

  /// 获取Skill的Secret
  String? getSecret(String skillName) {
    return _skillSecrets[skillName];
  }

  /// 清除Skill的Secret
  void clearSecret(String skillName) {
    _skillSecrets.remove(skillName);
  }

  /// 执行Skill
  Future<SkillResult> execute(
    Skill skill, {
    Map<String, dynamic>? parameters,
  }) async {
    switch (skill.type) {
      case SkillType.js:
        return _executeJsSkill(skill, parameters ?? {});
      case SkillType.native:
        return _executeNativeSkill(skill, parameters ?? {});
    }
  }

  /// 执行JS Skill
  Future<SkillResult> _executeJsSkill(
    Skill skill,
    Map<String, dynamic> parameters,
  ) async {
    try {
      final secret = _skillSecrets[skill.name];
      final data = parameters.isNotEmpty ? _encodeParameters(parameters) : '{}';

      // 获取JS Skill的URL
      final url = await _loader.getJsSkillUrl(skill.name, 'index.html');
      if (url == null) {
        return SkillResult.failure('Skill script not found: ${skill.name}');
      }

      // 通过Webview执行JS
      final result = await _executeJsInWebview(
        url: url,
        data: data,
        secret: secret,
      );

      return result;
    } catch (e) {
      return SkillResult.failure('Failed to execute JS Skill: $e');
    }
  }

  String _encodeParameters(Map<String, dynamic> params) {
    // 简单编码，实际使用时可以用JSON
    return params.entries
        .map(
          (e) =>
              '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value.toString())}',
        )
        .join('&');
  }

  /// 在Webview中执行JS
  /// NOTE: Webview Skill执行需要与Flutter Webview插件配合
  /// 实现状态: 等待Webview插件集成
  /// 需要的步骤:
  /// 1. 添加webview_flutter依赖
  /// 2. 创建Webview窗口
  /// 3. 注入数据和secret
  /// 4. 等待结果回调
  /// 5. 关闭Webview窗口
  Future<SkillResult> _executeJsInWebview({
    required String url,
    required String data,
    String? secret,
  }) async {
    // 当前返回占位结果 - Skill仍可被选择但不会真正执行
    return SkillResult.success('JS Skill executed: $url with data: $data');
  }

  /// 执行Native Skill
  Future<SkillResult> _executeNativeSkill(
    Skill skill,
    Map<String, dynamic> parameters,
  ) async {
    try {
      // Native Skill通过Platform Channel调用Android Intent
      const platform = MethodChannel('com.ibloc.shadow/skills');

      final result = await platform.invokeMethod('executeNativeSkill', {
        'skillName': skill.name,
        'instructions': skill.instructions,
        'parameters': parameters,
      });

      return SkillResult.success(result as String? ?? 'Native Skill executed');
    } catch (e) {
      return SkillResult.failure('Failed to execute Native Skill: $e');
    }
  }

  /// 执行Intent（用于Native Skill）
  Future<SkillResult> executeIntent({
    required String intent,
    required Map<String, dynamic> parameters,
  }) async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/skills');

      final result = await platform.invokeMethod('executeIntent', {
        'intent': intent,
        'parameters': parameters,
      });

      return SkillResult.success(result as String? ?? 'Intent executed');
    } catch (e) {
      return SkillResult.failure('Failed to execute Intent: $e');
    }
  }
}

/// Skill执行器Provider
final skillExecutorProvider = Provider<SkillExecutor>((ref) {
  return SkillExecutor();
});
