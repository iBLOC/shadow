import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../services/ziti_config_service.dart';
import '../../theme/app_tokens.g.dart';
import 'settings_row.dart';

/// **零信任配置** —— 「这台手机在零信任网里扮演什么角色」的可视化设置面。
///
/// ## 它回答用户什么问题
///
/// 「我��不想让这台手机连到零信任网？连的是哪台？用哪份身份？」
///
/// ## ⚠️ 保存 ≠ 生效（必须在界面上说清）
///
/// 零信任角色是**启动时**定死的（宿主在 nativeStart 之前决定这次是
/// 客户端／发布者／普通本地）⇒ ⇒ 保存只落盘，**重启 App 后生效**。
/// 不写这条 ⇒ 「开了开关却没反应」会被当成坏了。
///
/// ## ⚠️ 凭据不在这里填
///
/// shadow key / admin token 走宿主自己那两把钥匙（App 私有目录），
/// **不在这份配置里**（配置落盘被拷走也换不来门）。
class ZitiSettingsGroup extends StatefulWidget {
  const ZitiSettingsGroup({super.key});

  @override
  State<ZitiSettingsGroup> createState() => _ZitiSettingsGroupState();
}

class _ZitiSettingsGroupState extends State<ZitiSettingsGroup> {
  final ZitiConfigService _service = ZitiConfigService();
  final TextEditingController _serviceCtl = TextEditingController();
  final TextEditingController _pasteCtl = TextEditingController();

  ZitiConfig _config = const ZitiConfig();
  ZitiIdentitySummary? _summary;
  bool _loaded = false;
  bool _busy = false;
  bool _saved = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _serviceCtl.dispose();
    _pasteCtl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final config = await _service.load();
    final summary = await _service.currentIdentitySummary();
    if (!mounted) return;
    setState(() {
      _config = config;
      _summary = summary;
      _serviceCtl.text = config.service;
      _loaded = true;
    });
  }

  /// 选角色（**还没保存** —— 保存才落盘）。
  void _pickMode(ZitiMode mode) {
    setState(() {
      _config = ZitiConfig(
        mode: mode,
        service: _serviceCtl.text.trim(),
        identityPath: _config.identityPath,
      );
      _saved = false;
      _error = null;
    });
  }

  /// 导入身份（粘贴的那段 JSON）。
  Future<void> _importIdentity() async {
    setState(() {
      _busy = true;
      _error = null;
      _saved = false;
    });
    try {
      final result = await _service.importIdentity(_pasteCtl.text);
      // ⚠️ 导入完**立刻**把身份路径记进配置 ⇒ ⇒ 否则宿主读到的还是
      // 「没有身份」⇒ ⇒ 「导入成功但没生效」。
      await _service.save(
        ZitiConfig(
          mode: _config.mode,
          service: _serviceCtl.text.trim(),
          identityPath: result.identityPath,
        ),
      );
      if (!mounted) return;
      setState(() {
        _config = ZitiConfig(
          mode: _config.mode,
          service: _serviceCtl.text.trim(),
          identityPath: result.identityPath,
        );
        _summary = result.summary;
        _pasteCtl.clear();
      });
    } on ZitiConfigException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = l10nOf(context).zitiImportFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// 删掉身份文件。
  Future<void> _clearIdentity() async {
    setState(() {
      _busy = true;
      _error = null;
      _saved = false;
    });
    try {
      await _service.clearIdentity();
      if (!mounted) return;
      setState(() {
        _config = ZitiConfig(
          mode: _config.mode,
          service: _serviceCtl.text.trim(),
        );
        _summary = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = l10nOf(context).zitiImportFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// 保存（**只落盘**；生效要重启 App）。
  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
      _saved = false;
    });
    try {
      final next = ZitiConfig(
        mode: _config.mode,
        service: _serviceCtl.text.trim(),
        identityPath: _config.identityPath,
      );
      await _service.save(next);
      if (!mounted) return;
      setState(() {
        _config = next;
        _saved = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = l10nOf(context).zitiSaveFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  AppLocalizations l10nOf(BuildContext context) =>
      AppLocalizations.of(context)!;

  @override
  Widget build(BuildContext context) {
    final l10n = l10nOf(context);
    final theme = ShadTheme.of(context);

    if (!_loaded) {
      return const SizedBox.shrink();
    }

    final summaryText = _summary == null
        ? l10n.zitiIdentityNone
        : (_summary!.id == null || _summary!.id!.isEmpty
            ? l10n.zitiIdentityLoadedNoId(_summary!.ztApi)
            : l10n.zitiIdentityLoaded(_summary!.ztApi, _summary!.id!));

    return SettingsBlock(
      children: [
        // ① 角色
        _label(context, l10n.zitiMode),
        const SizedBox(height: AppTokens.spaceSm),
        Wrap(
          spacing: AppTokens.spaceSm,
          runSpacing: AppTokens.spaceSm,
          children: [
            _modeButton(l10n.zitiModeOff, ZitiMode.off),
            _modeButton(l10n.zitiModeClient, ZitiMode.client),
            _modeButton(l10n.zitiModeServer, ZitiMode.server),
          ],
        ),
        const SizedBox(height: AppTokens.spaceXs),
        Text(
          l10n.zitiModeHint,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(vertical: AppTokens.spaceMd),
        ),
        // ② 服务名
        _label(context, l10n.zitiService),
        const SizedBox(height: AppTokens.spaceSm),
        ShadInput(
          controller: _serviceCtl,
          placeholder: Text(l10n.zitiServicePlaceholder),
          onChanged: (value) {
            setState(() {
              _config = ZitiConfig(
                mode: _config.mode,
                service: value.trim(),
                identityPath: _config.identityPath,
              );
              _saved = false;
            });
          },
        ),
        const SizedBox(height: AppTokens.spaceXs),
        Text(
          l10n.zitiServiceHint,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(vertical: AppTokens.spaceMd),
        ),
        // ③ 身份
        _label(context, l10n.zitiIdentity),
        const SizedBox(height: AppTokens.spaceSm),
        Text(
          summaryText,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppTokens.spaceSm),
        SizedBox(
          height: 120,
          child: ShadTextarea(
            controller: _pasteCtl,
            placeholder: Text(l10n.zitiIdentityPlaceholder),
          ),
        ),
        const SizedBox(height: AppTokens.spaceSm),
        Row(
          children: [
            ShadButton(
              onPressed: _busy ? null : _importIdentity,
              child: Text(l10n.zitiImport),
            ),
            const SizedBox(width: AppTokens.spaceSm),
            ShadButton.outline(
              onPressed: _busy || _summary == null ? null : _clearIdentity,
              child: Text(l10n.zitiClearIdentity),
            ),
          ],
        ),
        const SizedBox(height: AppTokens.spaceXs),
        Text(
          l10n.zitiIdentityHint,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(vertical: AppTokens.spaceMd),
        ),
        // ④ 保存
        Row(
          children: [
            ShadButton(
              onPressed: _busy ? null : _save,
              child: Text(l10n.save),
            ),
            if (_saved) ...[
              const SizedBox(width: AppTokens.spaceSm),
              Text(
                l10n.zitiSavedHint,
                style: theme.textTheme.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: AppTokens.spaceSm),
          Text(
            _error!,
            style: theme.textTheme.small.copyWith(
              color: theme.colorScheme.destructive,
            ),
          ),
        ],
        const SizedBox(height: AppTokens.spaceSm),
        Text(
          l10n.zitiRestartHint,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        Text(
          l10n.zitiSecretHint,
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }

  Widget _label(BuildContext context, String text) {
    final theme = ShadTheme.of(context);
    return Text(
      text,
      style: theme.textTheme.small.copyWith(
        color: theme.colorScheme.foreground,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _modeButton(String label, ZitiMode mode) {
    final selected = _config.mode == mode;
    if (selected) {
      return ShadButton(
        onPressed: _busy ? null : () => _pickMode(mode),
        child: Text(label),
      );
    }
    return ShadButton.outline(
      onPressed: _busy ? null : () => _pickMode(mode),
      child: Text(label),
    );
  }
}
