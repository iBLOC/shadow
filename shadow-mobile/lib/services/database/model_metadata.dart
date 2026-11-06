import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'database_helper.dart';

/// 模型元数据 —— 「智能配置」收集的每模型参数。
///
/// ⚠️ **它长在模型身上，不长在接入点上**：大脑目录（providers → models）
/// 只存身份与能力，这张表补齐 ZCode 风格的参数（上下文窗口 / 最大输出 /
/// 输入类型 / 推理档位与参数映射 / 高级配置）。键是**模型 ID 字符串**。
class ModelMetadata {
  final String modelId;
  final String? displayName;
  final int? contextWindow;
  final int? maxOutputTokens;

  /// 输入类型（'text'/'image'/'audio'/'video' 的子集）。
  final List<String> inputTypes;

  /// 模型能力（大脑 capability 取值域的子集）。
  final List<String> capabilities;

  /// 推理档位数（0 = 不支持档位开关）。
  final int reasoningLevels;

  /// 推理参数映射（JSON 对象：按 apiStandard × level 生成请求体片段的
  /// **模板**存这里 —— 存的是整张映射表的 JSON 快照）。
  final Map<String, dynamic>? reasoningParamMapping;

  /// 高级配置（自由 JSON，模型 ID 之外的一切扩展参数）。
  final Map<String, dynamic>? advancedConfig;

  /// 来源：'smart_config'（注册表自动填）/ 'manual'（用户手填）/ 'probe'
  /// （接入点探测）。
  final String source;

  final DateTime? updatedAt;

  const ModelMetadata({
    required this.modelId,
    this.displayName,
    this.contextWindow,
    this.maxOutputTokens,
    this.inputTypes = const [],
    this.capabilities = const [],
    this.reasoningLevels = 0,
    this.reasoningParamMapping,
    this.advancedConfig,
    this.source = 'smart_config',
    this.updatedAt,
  });

  ModelMetadata copyWith({
    String? displayName,
    int? contextWindow,
    int? maxOutputTokens,
    List<String>? inputTypes,
    List<String>? capabilities,
    int? reasoningLevels,
    Map<String, dynamic>? reasoningParamMapping,
    Map<String, dynamic>? advancedConfig,
    String? source,
  }) {
    return ModelMetadata(
      modelId: modelId,
      displayName: displayName ?? this.displayName,
      contextWindow: contextWindow ?? this.contextWindow,
      maxOutputTokens: maxOutputTokens ?? this.maxOutputTokens,
      inputTypes: inputTypes ?? this.inputTypes,
      capabilities: capabilities ?? this.capabilities,
      reasoningLevels: reasoningLevels ?? this.reasoningLevels,
      reasoningParamMapping: reasoningParamMapping ?? this.reasoningParamMapping,
      advancedConfig: advancedConfig ?? this.advancedConfig,
      source: source ?? this.source,
      updatedAt: updatedAt,
    );
  }

  Map<String, dynamic> toRow() {
    return {
      'model_id': modelId,
      'display_name': displayName,
      'context_window': contextWindow,
      'max_output_tokens': maxOutputTokens,
      'input_types': jsonEncode(inputTypes),
      'capabilities': jsonEncode(capabilities),
      'reasoning_levels': reasoningLevels,
      'reasoning_param_mapping': reasoningParamMapping == null
          ? null
          : jsonEncode(reasoningParamMapping),
      'advanced_config': advancedConfig == null
          ? null
          : jsonEncode(advancedConfig),
      'source': source,
      'updated_at': (updatedAt ?? DateTime.now()).toIso8601String(),
    };
  }

  /// ⚠️ **解析失败 ⇒ 返回 null，不抛** —— 列表渲染不因为一行坏 JSON 炸。
  static ModelMetadata? fromRow(Map<String, dynamic> row) {
    try {
      return ModelMetadata(
        modelId: row['model_id'] as String,
        displayName: row['display_name'] as String?,
        contextWindow: row['context_window'] as int?,
        maxOutputTokens: row['max_output_tokens'] as int?,
        inputTypes: _decodeList(row['input_types'] as String?),
        capabilities: _decodeList(row['capabilities'] as String?),
        reasoningLevels: (row['reasoning_levels'] as int?) ?? 0,
        reasoningParamMapping: _decodeMap(
          row['reasoning_param_mapping'] as String?,
        ),
        advancedConfig: _decodeMap(row['advanced_config'] as String?),
        source: (row['source'] as String?) ?? 'smart_config',
        updatedAt: row['updated_at'] == null
            ? null
            : DateTime.tryParse(row['updated_at'] as String),
      );
    } catch (_) {
      return null;
    }
  }

  static List<String> _decodeList(String? json) {
    if (json == null || json.isEmpty) return const [];
    final decoded = jsonDecode(json);
    if (decoded is! List) return const [];
    return decoded.whereType<String>().toList();
  }

  static Map<String, dynamic>? _decodeMap(String? json) {
    if (json == null || json.isEmpty) return null;
    final decoded = jsonDecode(json);
    if (decoded is! Map) return null;
    return Map<String, dynamic>.from(decoded);
  }
}

/// 模型元数据仓储。
class ModelMetadataRepository {
  static const String _table = 'model_metadata';

  /// 测试覆盖点（仿 `AppConfigService.configFileOverride` 的先例）——
  /// 单测把它指到内存库，不碰真机文件。
  static Future<Database> Function()? databaseOverride;

  Future<Database> get _db =>
      databaseOverride != null ? databaseOverride!() : DatabaseHelper.instance.database;

  /// 单条读取（不存在 ⇒ null）。
  Future<ModelMetadata?> get(String modelId) async {
    final db = await _db;
    final rows = await db.query(
      _table,
      where: 'model_id = ?',
      whereArgs: [modelId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return ModelMetadata.fromRow(rows.first);
  }

  /// 全量读取（键 = model_id）。解析失败的行**跳过**，不进结果。
  Future<Map<String, ModelMetadata>> getAll() async {
    final db = await _db;
    final rows = await db.query(_table);
    final out = <String, ModelMetadata>{};
    for (final row in rows) {
      final m = ModelMetadata.fromRow(row);
      if (m != null) out[m.modelId] = m;
    }
    return out;
  }

  /// 写入（upsert）—— 同一模型 ID 重复保存＝覆盖。
  Future<void> put(ModelMetadata metadata) async {
    final db = await _db;
    await db.insert(
      _table,
      metadata.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> delete(String modelId) async {
    final db = await _db;
    await db.delete(_table, where: 'model_id = ?', whereArgs: [modelId]);
  }
}
