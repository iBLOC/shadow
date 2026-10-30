import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/telencephalon_provider.dart';
import '../services/accessibility_controller.dart';
import '../services/app_config_service.dart';
import '../theme/app_tokens.g.dart';
import '../widgets/glass_app_bar.dart';
import '../widgets/glass_card.dart';
import '../widgets/log_panel_section.dart';
import '../widgets/settings/appearance_section.dart';
import '../widgets/settings/service_status_block.dart';
import '../widgets/settings/settings_row.dart';
import '../widgets/settings/tts_settings_group.dart';

/// 系统内存信息。
final systemMemoryProvider = FutureProvider<SystemMemoryInfo>((ref) async {
  return SystemMemoryInfo.getMemoryInfo();
});

class SystemMemoryInfo {
  final int totalMb;
  final int usedMb;
  final int freeMb;
  final double usagePercent;

  SystemMemoryInfo({
    required this.totalMb,
    required this.usedMb,
    required this.freeMb,
    required this.usagePercent,
  });

  static Future<SystemMemoryInfo> getMemoryInfo() async {
    try {
      final file = File('/proc/meminfo');
      final content = await file.readAsString();
      final lines = content.split('\n');

      int? memTotal;
      int? memFree;
      int? memAvailable;

      for (final line in lines) {
        if (line.startsWith('MemTotal:')) {
          memTotal = _parseMemValue(line);
        } else if (line.startsWith('MemAvailable:')) {
          memAvailable = _parseMemValue(line);
        } else if (line.startsWith('MemFree:')) {
          memFree = _parseMemValue(line);
        }
        if (memTotal != null && memAvailable != null) break;
      }

      if (memTotal == null) return _empty();

      final totalMb = (memTotal ~/ 1024);
      final freeMb = memAvailable != null
          ? (memAvailable ~/ 1024)
          : (memFree != null ? (memFree ~/ 1024) : 0);
      final usedMb = totalMb - freeMb;
      final usagePercent = totalMb > 0 ? (usedMb / totalMb * 100) : 0.0;

      return SystemMemoryInfo(
        totalMb: totalMb,
        usedMb: usedMb,
        freeMb: freeMb,
        usagePercent: usagePercent,
      );
    } catch (e) {
      return _empty();
    }
  }

  static int _parseMemValue(String line) {
    final parts = line.split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return int.tryParse(parts[1]) ?? 0;
    }
    return 0;
  }

  static SystemMemoryInfo _empty() {
    return SystemMemoryInfo(totalMb: 0, usedMb: 0, freeMb: 0, usagePercent: 0);
  }
}

/// 设置页 —— **4 组 + 高级折叠**，而不是 18 个平铺 tile。
///
/// ## 为什么分组（审计 F6）
///
/// 原来 18 个平铺 `ListTile` 混了四类不该在一起的东西：
/// 外观 / 子系统内部（TTS 独占 4 个 tile）/ 运维（logs / resonance / flows）
/// / 破坏性（重置引擎）。
///
/// 现在的结构：
///
/// ```
/// ① 外观        模型信息 · 主题 · 主题色 · 玻璃强度 · 对话框背景
/// ② 语音与辅助  TTS（1 组 2 项）· 无障碍
/// ③ 运行时      内存 · 服务状态 · 模型仓库
/// ④ 连接        设备发现 · 端脑流程 · 嵌入式大脑 · Resonance
/// ⚙ 高级（折叠） 嵌入式 Prefrontal（遗留）· 日志 · 后端地址
/// ⚠ 危险操作     重置引擎（独立成块，二次确认）
/// ```
///
/// 破坏性操作**单独隔离**在最底部并要求确认 —— 它跟外观同列时，
/// 点错了不可逆。
class SettingsScreen extends ConsumerWidget {
  final String modelInfo;
  final VoidCallback onReset;

  const SettingsScreen({
    super.key,
    required this.modelInfo,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: GlassAppBar(title: l10n.settings, showBackButton: true),
      body: Container(
        padding: const EdgeInsets.all(AppTokens.spaceLg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── ① 外观 ───────────────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsGroupAppearance,
                    icon: Icons.palette_outlined,
                    children: [
                      SettingsBlock(
                        children: [
                          SettingsRow(
                            title: l10n.modelInfo,
                            icon: Icons.info_outline,
                            subtitle: modelInfo,
                          ),
                          const ShadSeparator.horizontal(
                            margin: EdgeInsets.symmetric(
                              horizontal: AppTokens.spaceLg,
                            ),
                          ),
                          const AppearanceSectionBody(),
                        ],
                      ),
                    ],
                  ),
                ],
              ),

              // ── ② 语音与辅助 ─────────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsGroupVoice,
                    icon: Icons.mic_none,
                    children: [
                      SettingsBlock(children: const [TtsSettingsGroup()]),
                      const ShadSeparator.horizontal(
                        margin: EdgeInsets.symmetric(
                          horizontal: AppTokens.spaceLg,
                        ),
                      ),
                      const AccessibilityRow(),
                    ],
                  ),
                ],
              ),

              // ── ③ 运行时 ─────────────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsGroupRuntime,
                    icon: Icons.memory,
                    children: [
                      const MemoryUsageBlock(),
                      const ShadSeparator.horizontal(
                        margin: EdgeInsets.symmetric(
                          horizontal: AppTokens.spaceLg,
                        ),
                      ),
                      const ServiceStatusBlock(),
                      const ShadSeparator.horizontal(
                        margin: EdgeInsets.symmetric(
                          horizontal: AppTokens.spaceLg,
                        ),
                      ),
                      const ModelStoreBlock(),
                    ],
                  ),
                ],
              ),

              // ── ④ 连接 ───────────────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsGroupConnections,
                    icon: Icons.hub_outlined,
                    children: [
                      SettingsBlock(
                        children: [
                          _NavRow(
                            icon: Icons.wifi_find,
                            title: l10n.settingsDeviceDiscovery,
                            subtitle: l10n.settingsDeviceDiscoveryDesc,
                            onTap: () => context.push('/discovery'),
                          ),
                          const ShadSeparator.horizontal(
                            margin: EdgeInsets.symmetric(
                              horizontal: AppTokens.spaceLg,
                            ),
                          ),
                          _NavRow(
                            icon: Icons.account_tree,
                            title: l10n.telencephalonFlows,
                            subtitle: l10n.telencephalonFlowsDesc,
                            onTap: () => context.push('/flows'),
                          ),
                          const ShadSeparator.horizontal(
                            margin: EdgeInsets.symmetric(
                              horizontal: AppTokens.spaceLg,
                            ),
                          ),
                          _NavRow(
                            icon: Icons.psychology_alt,
                            title: l10n.settingsEncephalonEmbedded,
                            subtitle: l10n.settingsEncephalonEmbeddedDesc,
                            onTap: () => context.push('/settings/encephalon'),
                          ),
                          const ShadSeparator.horizontal(
                            margin: EdgeInsets.symmetric(
                              horizontal: AppTokens.spaceLg,
                            ),
                          ),
                          _NavRow(
                            icon: Icons.cloud_sync,
                            title: l10n.resonanceTitle,
                            subtitle: l10n.settingsResonanceDesc,
                            onTap: () => context.push('/resonance'),
                          ),
                          const ShadSeparator.horizontal(
                            margin: EdgeInsets.symmetric(
                              horizontal: AppTokens.spaceLg,
                            ),
                          ),
                          _NavRow(
                            icon: Icons.badge_outlined,
                            title: l10n.identityTitle,
                            subtitle: l10n.identityTitleDesc,
                            onTap: () => context.push('/settings/identity'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),

              // ── 高级（折叠）──────────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsGroupAdvanced,
                    icon: Icons.tune,
                    description: l10n.settingsGroupAdvancedDesc,
                    children: [
                      SettingsDisclosure(
                        title: l10n.settingsAdvancedLogs,
                        subtitle: l10n.settingsLogsDesc,
                        icon: Icons.article_outlined,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const ShadSeparator.horizontal(
                              margin: EdgeInsets.symmetric(
                                horizontal: AppTokens.spaceLg,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(AppTokens.spaceLg),
                              child: SizedBox(
                                height: 320,
                                child: const LogPanelSection(),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const ShadSeparator.horizontal(
                        margin: EdgeInsets.symmetric(
                          horizontal: AppTokens.spaceLg,
                        ),
                      ),
                      SettingsDisclosure(
                        title: l10n.settingsAdvancedBackend,
                        subtitle: l10n.settingsAdvancedBackendDesc,
                        icon: Icons.dns,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const ShadSeparator.horizontal(
                              margin: EdgeInsets.symmetric(
                                horizontal: AppTokens.spaceLg,
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.all(AppTokens.spaceLg),
                              child: BackendSettingsCard(),
                            ),
                          ],
                        ),
                      ),
                      const ShadSeparator.horizontal(
                        margin: EdgeInsets.symmetric(
                          horizontal: AppTokens.spaceLg,
                        ),
                      ),
                      // 折叠标题是「遗留运行时」，真正的入口行在展开后 ——
                      // 两者文案不能重复，否则同一个字符串在树上出现两次。
                      SettingsDisclosure(
                        title: l10n.settingsAdvancedLegacy,
                        icon: Icons.history,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const ShadSeparator.horizontal(
                              margin: EdgeInsets.symmetric(
                                horizontal: AppTokens.spaceLg,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(
                                left: AppTokens.spaceLg,
                                right: AppTokens.spaceLg,
                                bottom: AppTokens.spaceLg,
                              ),
                              child: _NavRow(
                                icon: Icons.psychology,
                                title: l10n.settingsPrefrontalEmbedded,
                                subtitle: l10n.settingsPrefrontalEmbeddedDesc,
                                onTap: () =>
                                    context.push('/settings/prefrontal'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),

              // ── 危险操作（隔离）─────────────────────────────────
              _Section(
                children: [
                  SettingsGroup(
                    title: l10n.settingsDangerZone,
                    icon: Icons.warning_amber,
                    description: l10n.settingsDangerZoneDesc,
                    destructive: true,
                    children: [
                      SettingsRow(
                        title: l10n.resetEngine,
                        subtitle: l10n.resetEngineDesc,
                        icon: Icons.restart_alt,
                        destructive: true,
                        onTap: () => _confirmReset(context),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 破坏性操作必须二次确认 —— 原来的「重置引擎」一点就执行。
  Future<void> _confirmReset(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;

    final confirmed = await showShadDialog<bool>(
      context: context,
      builder: (dialogContext) => ShadDialog.alert(
        title: Text(l10n.resetEngine),
        description: Text(l10n.resetEngineConfirmDesc),
        actions: [
          ShadButton.outline(
            child: Text(l10n.cancel),
            onPressed: () => Navigator.of(dialogContext).pop(false),
          ),
          ShadButton.destructive(
            child: Text(l10n.resetEngineConfirm),
            onPressed: () => Navigator.of(dialogContext).pop(true),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      onReset();
    }
  }
}

/// 一段设置的容器 —— 玻璃卡 + 上下留白。
class _Section extends StatelessWidget {
  final List<Widget> children;

  const _Section({required this.children});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTokens.spaceXl),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTokens.spaceSm,
          vertical: AppTokens.spaceMd,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: children,
        ),
      ),
    );
  }
}

/// 导航行 —— 可点进二级页。
class _NavRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _NavRow({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return SettingsRow(
      title: title,
      subtitle: subtitle,
      icon: icon,
      onTap: onTap,
      trailing: Icon(
        Icons.chevron_right,
        size: 18,
        color: theme.colorScheme.mutedForeground,
      ),
    );
  }
}

/// 内存占用。
class MemoryUsageBlock extends ConsumerWidget {
  const MemoryUsageBlock({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final theme = ShadTheme.of(context);
    final memoryAsync = ref.watch(systemMemoryProvider);

    return memoryAsync.when(
      data: (memory) {
        final color = memory.usagePercent > 80
            ? AppTokens.statusError
            : memory.usagePercent > 60
            ? AppTokens.statusWarning
            : AppTokens.statusSuccess;
        return SettingsBlock(
          children: [
            SettingsRow(
              title: l10n.settingsMemoryUsage,
              icon: Icons.memory,
              trailing: ShadIconButton.ghost(
                icon: const Icon(Icons.refresh, size: 18),
                onPressed: () => ref.refresh(systemMemoryProvider),
              ),
            ),
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.settingsMemUsed(memory.usedMb),
                        style: theme.textTheme.small,
                      ),
                      Text(
                        l10n.settingsMemTotal(memory.totalMb),
                        style: theme.textTheme.small,
                      ),
                      Text(
                        l10n.settingsMemFree(memory.freeMb),
                        style: theme.textTheme.small,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppTokens.spaceSm),
                  ShadProgress(
                    value: memory.usagePercent / 100,
                    color: color,
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(AppTokens.radiusXs),
                  ),
                  const SizedBox(height: AppTokens.spaceXs),
                  Text(
                    l10n.settingsMemUsage(
                      memory.usagePercent.toStringAsFixed(1),
                    ),
                    style: theme.textTheme.small.copyWith(color: color),
                  ),
                ],
              ),
            ),
          ],
        );
      },
      loading: () => Padding(
        padding: const EdgeInsets.all(AppTokens.spaceLg),
        child: Center(
          child: ShadProgress(
            value: null,
            minHeight: 4,
            borderRadius: BorderRadius.circular(AppTokens.radiusXs),
          ),
        ),
      ),
      error: (e, s) => Padding(
        padding: const EdgeInsets.all(AppTokens.spaceLg),
        child: Text(
          l10n.commonLoadFailed(e.toString()),
          style: theme.textTheme.small.copyWith(
            color: theme.colorScheme.destructive,
          ),
        ),
      ),
    );
  }
}

/// 无障碍（Android 无障碍服务）。
class AccessibilityRow extends StatefulWidget {
  const AccessibilityRow({super.key});

  @override
  State<AccessibilityRow> createState() => _AccessibilityRowState();
}

class _AccessibilityRowState extends State<AccessibilityRow>
    with WidgetsBindingObserver {
  bool _isEnabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkAccessibilityStatus();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkAccessibilityStatus();
    }
  }

  Future<void> _checkAccessibilityStatus() async {
    final enabled = await AccessibilityController.isEnabled;
    if (mounted) {
      setState(() {
        _isEnabled = enabled;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return SettingsRow(
      title: l10n.accessibilityControl,
      subtitle: _isEnabled ? l10n.accessibilityOn : l10n.accessibilityOff,
      icon: Icons.accessibility,
      trailing: ShadSwitch(
        value: _isEnabled,
        onChanged: (value) async {
          if (value) {
            await AccessibilityController.openSettings();
          }
        },
      ),
    );
  }
}

/// 模型仓库地址 —— 之前是一整张卡（含徽标 + 可编辑文本框）。
class ModelStoreBlock extends StatefulWidget {
  const ModelStoreBlock({super.key});

  @override
  State<ModelStoreBlock> createState() => _ModelStoreBlockState();
}

class _ModelStoreBlockState extends State<ModelStoreBlock> {
  final _urlController = TextEditingController();
  bool _isEditing = false;
  bool _isDefault = true;
  String _currentUrl = '';

  @override
  void initState() {
    super.initState();
    _loadCurrentUrl();
  }

  Future<void> _loadCurrentUrl() async {
    final config = AppConfigService();
    _currentUrl = config.modelStoreUrl;
    _isDefault = config.isUsingDefaultModelStore;
    _urlController.text = _currentUrl;
    if (mounted) setState(() {});
  }

  Future<void> _saveUrl() async {
    final config = AppConfigService();
    final newUrl = _urlController.text.trim();
    if (newUrl.isEmpty || newUrl == 'https://modelscope.cn/api/v1') {
      await config.resetModelStoreUrl();
    } else {
      await config.setModelStoreUrl(newUrl);
    }
    _isEditing = false;
    await _loadCurrentUrl();
    if (mounted) setState(() {});
  }

  void _cancelEdit() {
    _urlController.text = _currentUrl;
    _isEditing = false;
    setState(() {});
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return SettingsBlock(
      children: [
        SettingsRow(
          title: l10n.modelStoreServer,
          icon: Icons.download,
          subtitle: _currentUrl,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ShadBadge.outline(
                child: Text(_isDefault ? l10n.defaultOption : l10n.custom),
              ),
              const SizedBox(width: AppTokens.spaceSm),
              if (_isEditing)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ShadIconButton.ghost(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: _cancelEdit,
                    ),
                    ShadIconButton(
                      icon: const Icon(Icons.check, size: 18),
                      onPressed: _saveUrl,
                    ),
                  ],
                )
              else
                ShadIconButton.ghost(
                  icon: const Icon(Icons.edit, size: 18),
                  onPressed: () => setState(() => _isEditing = true),
                ),
            ],
          ),
        ),
        if (_isEditing) ...[
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
            child: ShadInput(
              controller: _urlController,
              placeholder: const Text('https://modelscope.cn/api/v1'),
              keyboardType: TextInputType.url,
            ),
          ),
        ],
      ],
    );
  }
}

/// 端脑（Telencephalon）后端地址与管理员令牌。
///
/// 原来是一个独立的大卡片（标题 + 描述 + 两个 TextField + Save），
/// 现在收进「高级」折叠区里 —— 这是开发者才需要改的东西。
class BackendSettingsCard extends ConsumerStatefulWidget {
  const BackendSettingsCard({super.key});

  @override
  ConsumerState<BackendSettingsCard> createState() =>
      _BackendSettingsCardState();
}

class _BackendSettingsCardState extends ConsumerState<BackendSettingsCard> {
  late TextEditingController _urlCtrl;
  late TextEditingController _tokenCtrl;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _urlCtrl = TextEditingController();
    _tokenCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _tokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _hydrate() async {
    final cfg = AppConfigService();
    await cfg.init();
    final live = ref.read(telencephalonProvider.notifier).client;
    if (!mounted) return;
    setState(() {
      _urlCtrl.text = live.baseUrl;
      _tokenCtrl.text = live.adminToken ?? '';
      _loaded = true;
    });
  }

  Future<void> _save() async {
    final cfg = AppConfigService();
    final url = _urlCtrl.text.trim();
    final token = _tokenCtrl.text.trim();
    await cfg.setTelencephalonBaseUrl(url.isEmpty ? null : url);
    await cfg.setTelencephalonAdminToken(token.isEmpty ? null : token);
    final notifier = ref.read(telencephalonProvider.notifier);
    notifier.setBaseUrl(url.isEmpty ? 'http://127.0.0.1:60080' : url);
    notifier.setAdminToken(token.isEmpty ? null : token);
    if (!mounted) return;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (!_loaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _hydrate());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // 标题与描述由外层的 SettingsDisclosure 提供，这里不再重复一遍 ——
        // 同一个字符串在树上出现两次会让「折叠后不可见」这类断言失效。
        ShadInput(
          controller: _urlCtrl,
          placeholder: const Text('http://127.0.0.1:60080'),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: AppTokens.spaceMd),
        ShadInput(
          controller: _tokenCtrl,
          placeholder: Text(l10n.settingsBackendAdminTokenHint),
          obscureText: true,
        ),
        const SizedBox(height: AppTokens.spaceMd),
        Align(
          alignment: Alignment.centerRight,
          child: ShadButton(
            onPressed: _save,
            leading: const Icon(Icons.save_outlined, size: 16),
            child: Text(l10n.commonSave),
          ),
        ),
      ],
    );
  }
}
