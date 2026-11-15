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

  /// **当前这条腿**就绪吗（不是别的腿的状态）。
  bool _engineReady = false;
  /// ⚠️ **首帧就是真相** —— 默认腿是「大脑」⇒ ⇒ 字段初值也必须是 brain
  /// （写 androidBuiltIn ⇒ ⇒ 默认档改成大脑之后，首帧先显示「Android
  /// 内置／未就绪」⇒ ⇒ 界面在骗人，2.5 秒后才翻过来）。
  TtsEngineType _engineType = TtsEngineType.brain;
  bool _isEditingUrl = false;
  final _urlController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initTts();
  }

  Future<void> _initTts() async {
    // ❶ **先**把「用户选的是哪条腿」摆出来（这一步是快的）—— 别让
    //    Android TTS 的探针（设备上没有内置 TTS 时 ≈ 2.5 秒）挡在第一帧
    //    前面 ⇒ ⇒ 否则首帧显示的是**默认值**，不是用户的选择。
    final selected = await _ttsEngine.loadEngineSelection();
    if (!mounted) return;
    setState(() => _engineType = selected);

    // ❷ 再探「当前那条腿」的就绪状态。
    final initialized = await _ttsEngine.initialize();
    // ⚠️ **状态按「当前那条腿」判** —— 默认腿是「大脑」⇒ ⇒ 拿 Android 内置
    // TTS 的探针结果冒充 ⇒ ⇒ 界面会说「未就绪」而大脑那条腿明明是通的
    // ⇒ ⇒ 「界面在骗人」。
    final engineReady = await _ttsEngine.isEngineReady();
    if (!mounted) return;
    setState(() {
      _isInitialized = initialized;
      _engineReady = engineReady;
      _engineType = _ttsEngine.engineType;
      _urlController.text = _ttsEngine.externalUrl;
    });
  }

  Future<void> _onEngineTypeChanged(TtsEngineType? type) async {
    if (type == null) return;
    await _ttsEngine.setEngineType(type);
    final ready = await _ttsEngine.isEngineReady();
    if (mounted) {
      setState(() {
        _engineType = type;
        _engineReady = ready;
      });
    }
  }

  Future<void> _saveUrl() async {
    await _ttsEngine.setExternalUrl(_urlController.text.trim());
    _isEditingUrl = false;
    if (mounted) setState(() {});
  }

  Future<void> _testSpeech() async {
    final l10n = AppLocalizations.of(context)!;
    // 试听**不许回退**（allowFallback:false）：这一发要试的就是当前配置的
    // 引擎 —— 若大脑没配 TTS 模型时回退到 Android 内置出声，用户会把
    // 「Rust 没配置」听成「配置生效了」。
    await _ttsEngine.speak(l10n.ttsTestText, allowFallback: false);
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
          subtitle: _engineReady ? l10n.ttsReady : l10n.ttsNotReady,
          trailing: SizedBox(
            width: 128,
            child: ShadSelect<TtsEngineType>(
              initialValue: _engineType,
              selectedOptionBuilder: (context, value) =>
                  Text(_engineLabel(l10n, value)),
              options: [
                // ⚠️ **「大脑」排第一** —— 它是**默认腿**：用哪个模型由
                // **能力页那张表**决定（端脑自己按分档默认解析）。
                ShadOption(
                  value: TtsEngineType.brain,
                  child: Text(_engineLabel(l10n, TtsEngineType.brain)),
                ),
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
          subtitle: _engineReady ? l10n.ttsReady : l10n.ttsNotReady,
          trailing: ShadIconButton.ghost(
            icon: Icon(
              Icons.play_arrow,
              size: 20,
              color: _isInitialized
                  ? theme.colorScheme.primary
                  : theme.colorScheme.mutedForeground,
            ),
            onPressed: _engineReady ? _testSpeech : null,
          ),
        ),
      ],
    );
  }

  static String _engineLabel(AppLocalizations l10n, TtsEngineType type) {
    switch (type) {
      case TtsEngineType.brain:
        return l10n.ttsEngineBrain;
      case TtsEngineType.androidBuiltIn:
        return l10n.ttsEngineAndroid;
      case TtsEngineType.rust:
        return l10n.ttsEngineRust;
      case TtsEngineType.external:
        return l10n.ttsEngineExternal;
    }
  }
}
