import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../theme/app_tokens.g.dart';
import '../../tts_engine.dart';
import 'settings_row.dart';

/// 语音合成设置 —— 原来 4 个平铺 tile，现在合并成**一组 2 项**：
/// ① 引擎选择（含外部地址） ② 状态与试听。
///
/// 审计 F6 指出：4 个 tile 给 1 个子系统，是「设置是平的」的主要来源。
class TtsSettingsGroup extends StatefulWidget {
  const TtsSettingsGroup({super.key});

  @override
  State<TtsSettingsGroup> createState() => _TtsSettingsGroupState();
}

class _TtsSettingsGroupState extends State<TtsSettingsGroup> {
  final TtsEngine _ttsEngine = TtsEngine();
  bool _isInitialized = false;
  TtsEngineType _engineType = TtsEngineType.androidBuiltIn;
  bool _isEditingUrl = false;
  final _urlController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initTts();
  }

  Future<void> _initTts() async {
    final initialized = await _ttsEngine.initialize();
    if (!mounted) return;
    setState(() {
      _isInitialized = initialized;
      _engineType = _ttsEngine.engineType;
      _urlController.text = _ttsEngine.externalUrl;
    });
  }

  Future<void> _onEngineTypeChanged(TtsEngineType? type) async {
    if (type == null) return;
    await _ttsEngine.setEngineType(type);
    if (mounted) {
      setState(() => _engineType = type);
    }
  }

  Future<void> _saveUrl() async {
    await _ttsEngine.setExternalUrl(_urlController.text.trim());
    _isEditingUrl = false;
    if (mounted) setState(() {});
  }

  Future<void> _testSpeech() async {
    final l10n = AppLocalizations.of(context)!;
    await _ttsEngine.speak(l10n.ttsTestText);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = ShadTheme.of(context);

    return SettingsBlock(
      children: [
        // ① 引擎选择 —— 三态下拉 + 外部服务地址（仅 external 时出现）
        SettingsRow(
          title: l10n.ttsEngine,
          icon: Icons.record_voice_over,
          subtitle: _isInitialized ? l10n.ttsReady : l10n.ttsNotReady,
          trailing: SizedBox(
            width: 128,
            child: ShadSelect<TtsEngineType>(
              initialValue: _engineType,
              selectedOptionBuilder: (context, value) =>
                  Text(_engineLabel(l10n, value)),
              options: [
                ShadOption(
                  value: TtsEngineType.androidBuiltIn,
                  child: Text(_engineLabel(l10n, TtsEngineType.androidBuiltIn)),
                ),
                ShadOption(
                  value: TtsEngineType.rust,
                  child: Text(_engineLabel(l10n, TtsEngineType.rust)),
                ),
                ShadOption(
                  value: TtsEngineType.external,
                  child: Text(_engineLabel(l10n, TtsEngineType.external)),
                ),
              ],
              onChanged: _onEngineTypeChanged,
            ),
          ),
        ),
        if (_engineType == TtsEngineType.external) ...[
          const ShadSeparator.horizontal(
            margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTokens.spaceLg,
              AppTokens.spaceMd,
              AppTokens.spaceLg,
              AppTokens.spaceMd,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.ttsExternalUrl,
                  style: theme.textTheme.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const SizedBox(height: AppTokens.spaceSm),
                if (_isEditingUrl)
                  Row(
                    children: [
                      Expanded(
                        child: ShadInput(
                          controller: _urlController,
                          placeholder: Text(l10n.ttsExternalUrlHint),
                          keyboardType: TextInputType.url,
                        ),
                      ),
                      const SizedBox(width: AppTokens.spaceSm),
                      ShadIconButton.outline(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => setState(() => _isEditingUrl = false),
                      ),
                      const SizedBox(width: AppTokens.spaceSm),
                      ShadIconButton(
                        icon: const Icon(Icons.check, size: 18),
                        onPressed: _saveUrl,
                      ),
                    ],
                  )
                else
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _urlController.text.isEmpty
                              ? l10n.ttsExternalUrlHint
                              : _urlController.text,
                          style: theme.textTheme.p.copyWith(
                            color: _urlController.text.isEmpty
                                ? theme.colorScheme.mutedForeground
                                : theme.colorScheme.foreground,
                          ),
                        ),
                      ),
                      ShadIconButton.ghost(
                        icon: const Icon(Icons.edit, size: 18),
                        onPressed: () => setState(() => _isEditingUrl = true),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
        ),
        // ② 状态与试听
        SettingsRow(
          title: l10n.ttsTest,
          icon: Icons.play_circle_outline,
          subtitle: _isInitialized ? l10n.ttsReady : l10n.ttsNotReady,
          trailing: ShadIconButton.ghost(
            icon: Icon(
              Icons.play_arrow,
              size: 20,
              color: _isInitialized
                  ? theme.colorScheme.primary
                  : theme.colorScheme.mutedForeground,
            ),
            onPressed: _isInitialized ? _testSpeech : null,
          ),
        ),
      ],
    );
  }

  static String _engineLabel(AppLocalizations l10n, TtsEngineType type) {
    switch (type) {
      case TtsEngineType.androidBuiltIn:
        return l10n.ttsEngineAndroid;
      case TtsEngineType.rust:
        return l10n.ttsEngineRust;
      case TtsEngineType.external:
        return l10n.ttsEngineExternal;
    }
  }
}
