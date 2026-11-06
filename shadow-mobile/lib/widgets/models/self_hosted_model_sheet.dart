import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/model_metadata_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../../services/database/model_metadata.dart';
import '../../services/models/known_models.dart';
import '../../theme/app_colors.dart';
import 'capability_labels.dart';

/// 「添加自持模型」表单 —— 手动添加的**只有**自持模型；云端模型在
/// 供应商页添加供应商后**自动获取**（那张引导卡在模型管理页顶部）。
///
/// ## 字段（ZCode 配置模式）
///
/// 模型 ID / 显示名 / 接入点 / API Key / 上下文窗口 / 最大输出 Token /
/// 输入类型 / 模型能力 / 推理等级（从低到高）/ 推理参数映射 / 高级配置。
///
/// ## 智能配置
///
/// 模型 ID 停顿后查 [lookupKnownModel]（内置注册表）—— 命中就自动填充
/// 可编辑字段并挂「已智能配置」徽标；未命中走「从接入点探测」
/// （大脑的无状态 preview 端点，不落盘）。
///
/// ## 落盘
///
/// 提交 = 大脑 `addProvider`（custom，openai 标准）→ `selected_model`
/// 直选手填 ID（桌面端手动 fallback 同一条路）→ 元数据落本地
/// `model_metadata` 表（客户端私有，大脑不管参数）。
class SelfHostedModelSheet extends ConsumerStatefulWidget {
  const SelfHostedModelSheet({super.key});

  /// 弹出表单；返回 true = 添加成功（调用方据此刷新列表）。
  static Future<bool> show(BuildContext context) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: SelfHostedModelSheet(),
      ),
    );
    return ok == true;
  }

  @override
  ConsumerState<SelfHostedModelSheet> createState() =>
      _SelfHostedModelSheetState();
}

class _SelfHostedModelSheetState extends ConsumerState<SelfHostedModelSheet> {
  final _modelId = TextEditingController();
  final _displayName = TextEditingController();
  final _baseUrl = TextEditingController(text: 'http://127.0.0.1:11434/v1');
  final _apiKey = TextEditingController();
  final _contextWindow = TextEditingController();
  final _maxOutput = TextEditingController();
  final _reasoningMapping = TextEditingController();
  final _advancedConfig = TextEditingController();

  /// 智能配置的去抖 —— 模型 ID 停顿后才查注册表，别每敲一个字符查一次。
  Timer? _smartDebounce;

  /// 命中注册表的匹配来源（null = 未命中/未输入）。
  String? _smartMatchedBy;
  String? _smartFamily;

  /// 用户手动编辑过推理映射后，改档位不再覆盖（尊重用户的手）。
  bool _mappingEditedByUser = false;

  final Set<String> _inputTypes = {'text'};
  final Set<String> _capabilities = {'llm'};
  int _reasoningLevels = 0;
  bool _advancedOpen = false;
  bool _saving = false;
  String? _error;

  /// 自持接入点的常见默认值（快捷 chips）。
  static const Map<String, String> _endpointPresets = {
    'ollama': 'http://127.0.0.1:11434/v1',
    'vLLM': 'http://127.0.0.1:8000/v1',
    'llama.cpp': 'http://127.0.0.1:8080/v1',
    'LM Studio': 'http://127.0.0.1:1234/v1',
  };

  @override
  void dispose() {
    _smartDebounce?.cancel();
    _modelId.dispose();
    _displayName.dispose();
    _baseUrl.dispose();
    _apiKey.dispose();
    _contextWindow.dispose();
    _maxOutput.dispose();
    _reasoningMapping.dispose();
    _advancedConfig.dispose();
    super.dispose();
  }

  // ── 智能配置 ────────────────────────────────────────────────

  void _onModelIdChanged(String value) {
    _smartDebounce?.cancel();
    if (value.trim().isEmpty) {
      setState(() {
        _smartMatchedBy = null;
        _smartFamily = null;
      });
      return;
    }
    _smartDebounce = Timer(
      const Duration(milliseconds: 400),
      _applySmartConfig,
    );
  }

  /// 查注册表并填充**空着**的字段 —— 已被用户改过的数字段不覆盖
  /// （「智能」是起点，不是独裁）。
  void _applySmartConfig() {
    final match = lookupKnownModel(_modelId.text);
    if (!mounted) return;
    if (match == null) {
      setState(() {
        _smartMatchedBy = null;
        _smartFamily = null;
      });
      return;
    }
    final p = match.params;
    if (_contextWindow.text.isEmpty && p.contextWindow != null) {
      _contextWindow.text = '${p.contextWindow}';
    }
    if (_maxOutput.text.isEmpty && p.maxOutputTokens != null) {
      _maxOutput.text = '${p.maxOutputTokens}';
    }
    _regenerateReasoningMapping();
    setState(() {
      _inputTypes
        ..clear()
        ..addAll(p.inputTypes);
      _capabilities
        ..clear()
        ..addAll(p.capabilities);
      _reasoningLevels = p.reasoningLevels;
      _smartMatchedBy = match.matchedBy;
      _smartFamily = match.family;
    });
  }

  /// 按当前档位数重生成推理参数映射快照（openai 标准 —— 自持接入点
  /// 走的是 OpenAI 兼容面；claude 原生协议不在本表单的射程内）。
  ///
  /// ⚠️ 用户手改过就不覆盖（[_mappingEditedByUser]）。
  void _regenerateReasoningMapping() {
    if (_mappingEditedByUser) return;
    if (_reasoningLevels <= 0) {
      _reasoningMapping.text = '';
      return;
    }
    final snapshot = <String, dynamic>{
      'standard': 'openai',
      'levels': reasoningLevelNames(_reasoningLevels),
      'params': {
        for (var i = 0; i < _reasoningLevels; i++)
          '$i': defaultReasoningParams(_reasoningLevels, i),
      },
    };
    _reasoningMapping.text = const JsonEncoder.withIndent(
      '  ',
    ).convert(snapshot);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.dns, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.selfHostedTitle,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (_smartMatchedBy != null)
                  _SmartConfigBadge(
                    matchedBy: _smartMatchedBy!,
                    family: _smartFamily,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _modelId,
              onChanged: _onModelIdChanged,
              decoration: InputDecoration(
                labelText: l10n.selfHostedModelId,
                hintText: 'qwen3:32b',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _displayName,
              decoration: InputDecoration(
                labelText: l10n.selfHostedDisplayName,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _baseUrl,
              decoration: InputDecoration(
                labelText: l10n.selfHostedEndpoint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in _endpointPresets.entries)
                  ActionChip(
                    label: Text(entry.key),
                    onPressed: () =>
                        setState(() => _baseUrl.text = entry.value),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _apiKey,
              obscureText: true,
              decoration: InputDecoration(
                labelText: l10n.selfHostedApiKeyOptional,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _contextWindow,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: l10n.selfHostedContextWindow,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _maxOutput,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: l10n.selfHostedMaxOutput,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _sectionLabel(l10n.selfHostedInputTypes),
            Wrap(
              spacing: 8,
              children: [
                for (final t in kModelInputTypes)
                  FilterChip(
                    label: Text(_inputTypeLabel(l10n, t)),
                    selected: _inputTypes.contains(t),
                    onSelected: (on) => setState(() {
                      on ? _inputTypes.add(t) : _inputTypes.remove(t);
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            _sectionLabel(l10n.selfHostedCapabilities),
            Wrap(
              spacing: 8,
              children: [
                for (final c in const ['llm', 'vision', 'embedding', 'rerank'])
                  FilterChip(
                    label: Text(catalogCapabilityLabel(l10n, c)),
                    selected: _capabilities.contains(c),
                    onSelected: (on) => setState(() {
                      on ? _capabilities.add(c) : _capabilities.remove(c);
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _reasoningLevels,
              decoration: InputDecoration(
                labelText: l10n.selfHostedReasoningLevels,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(
                  value: 0,
                  child: Text(l10n.selfHostedReasoningOff),
                ),
                for (final levels in const [2, 3, 4])
                  DropdownMenuItem(
                    value: levels,
                    child: Text(
                      '$levels · ${reasoningLevelNames(levels).join(' → ')}',
                    ),
                  ),
              ],
              onChanged: (v) => setState(() {
                _reasoningLevels = v ?? 0;
                _regenerateReasoningMapping();
              }),
            ),
            const SizedBox(height: 12),
            // ── 高级（折叠）─────────────────────────────────────
            InkWell(
              onTap: () => setState(() => _advancedOpen = !_advancedOpen),
              child: Row(
                children: [
                  Icon(
                    _advancedOpen ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                  ),
                  const SizedBox(width: 4),
                  Text(l10n.selfHostedAdvanced),
                ],
              ),
            ),
            if (_advancedOpen) ...[
              const SizedBox(height: 8),
              _sectionLabel(l10n.selfHostedReasoningMapping),
              TextField(
                controller: _reasoningMapping,
                maxLines: 4,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                onChanged: (_) => _mappingEditedByUser = true,
                decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  helperText: l10n.selfHostedReasoningMappingHint,
                ),
              ),
              const SizedBox(height: 12),
              _sectionLabel(l10n.selfHostedAdvancedConfig),
              TextField(
                controller: _advancedConfig,
                maxLines: 3,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: '{}',
                ),
              ),
            ],
            const SizedBox(height: 12),
            // ── 探测兜底 ────────────────────────────────────────
            OutlinedButton.icon(
              onPressed: _saving ? null : _probe,
              icon: const Icon(Icons.search, size: 18),
              label: Text(l10n.selfHostedProbe),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _submit,
                child: Text(
                  _saving ? l10n.selfHostedSaving : l10n.selfHostedSubmit,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary),
        ),
      );

  String _inputTypeLabel(AppLocalizations l10n, String type) {
    switch (type) {
      case 'text':
        return l10n.inputTypeText;
      case 'image':
        return l10n.inputTypeImage;
      case 'audio':
        return l10n.inputTypeAudio;
      case 'video':
        return l10n.inputTypeVideo;
      default:
        return type;
    }
  }

  /// 从接入点探测模型（大脑的无状态 preview，不落盘）—— 命中的列表
  /// 让用户点选回填模型 ID。
  Future<void> _probe() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() => _error = null);
    try {
      final models = await ref
          .read(telencephalonClientProvider)
          .previewProviderModels(
            baseUrl: _baseUrl.text.trim(),
            apiStandard: 'openai',
            apiKey: _apiKey.text.trim().isEmpty ? null : _apiKey.text.trim(),
          );
      if (!mounted) return;
      if (models.isEmpty) {
        setState(() => _error = l10n.selfHostedProbeEmpty);
        return;
      }
      final picked = await showDialog<String>(
        context: context,
        builder: (dialogContext) => SimpleDialog(
          title: Text(l10n.selfHostedProbePick),
          children: [
            for (final m in models)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(dialogContext, m.id),
                child: Text(
                  m.id,
                  style: const TextStyle(fontFamily: 'monospace'),
                ),
              ),
          ],
        ),
      );
      if (picked != null && mounted) {
        setState(() => _modelId.text = picked);
        _applySmartConfig();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  /// 提交：大脑 custom provider → selected_model 直选 → 元数据落本地。
  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    final modelId = _modelId.text.trim();
    final baseUrl = _baseUrl.text.trim();
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      if (modelId.isEmpty) {
        setState(() {
          _error = l10n.selfHostedModelIdRequired;
          _saving = false;
        });
        return;
      }
      if (baseUrl.isEmpty) {
        setState(() {
          _error = l10n.selfHostedEndpointRequired;
          _saving = false;
        });
        return;
      }
      if (_advancedConfig.text.trim().isNotEmpty) {
        // ⚠️ 高级配置必须是合法 JSON —— 不合法就地拒绝（写进去读不出来
        // 的配置比没有配置更糟）。
        jsonDecode(_advancedConfig.text.trim());
      }
      final client = ref.read(telencephalonClientProvider);
      final created = await client.addProvider(
        name:
            _displayName.text.trim().isEmpty
            ? modelId
            : _displayName.text.trim(),
        baseUrl: baseUrl,
        providerType: 'openai',
        apiKey: _apiKey.text.trim().isEmpty ? null : _apiKey.text.trim(),
      );
      await client.updateProvider(created.id, selectedModel: modelId);
      await ref.read(modelMetadataProvider.notifier).save(
            ModelMetadata(
              modelId: modelId,
              displayName: _displayName.text.trim().isEmpty
                  ? null
                  : _displayName.text.trim(),
              contextWindow: int.tryParse(_contextWindow.text.trim()),
              maxOutputTokens: int.tryParse(_maxOutput.text.trim()),
              inputTypes: _inputTypes.toList(),
              capabilities: _capabilities.toList(),
              reasoningLevels: _reasoningLevels,
              reasoningParamMapping: _reasoningMapping.text.trim().isEmpty
                  ? null
                  : jsonDecode(_reasoningMapping.text.trim())
                        as Map<String, dynamic>,
              advancedConfig: _advancedConfig.text.trim().isEmpty
                  ? null
                  : jsonDecode(_advancedConfig.text.trim())
                        as Map<String, dynamic>,
              source: _smartMatchedBy == null ? 'manual' : 'smart_config',
            ),
          );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _saving = false;
      });
    }
  }
}

/// 「已智能配置」徽标 —— 顺手把来源说清（exact / family）。
class _SmartConfigBadge extends StatelessWidget {
  final String matchedBy;
  final String? family;

  const _SmartConfigBadge({required this.matchedBy, this.family});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        family == null
            ? l10n.smartConfigBadge
            : '${l10n.smartConfigBadge} · $family',
        style: TextStyle(fontSize: 10, color: AppColors.success),
      ),
    );
  }
}
