import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/accessibility_controller.dart';
import '../services/app_config_service.dart';
import '../providers/theme_provider.dart';
import '../providers/telencephalon_provider.dart';
import '../providers/service_provider.dart';
import '../widgets/glass_card.dart';
import '../widgets/log_panel_section.dart';
import '../theme/app_colors.dart';
import '../tts_engine.dart';
import 'flows_screen.dart';

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
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.settings),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Container(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GlassCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(
                        Icons.info_outline,
                        color: AppColors.primary,
                      ),
                      title: Text(l10n.modelInfo),
                      subtitle: Text(modelInfo),
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: Icon(
                        themeMode == ThemeMode.dark
                            ? Icons.dark_mode
                            : Icons.light_mode,
                        color: AppColors.primary,
                      ),
                      title: Text(l10n.theme),
                      trailing: SegmentedButton<ThemeMode>(
                        segments: const [
                          ButtonSegment(
                            value: ThemeMode.light,
                            icon: Icon(Icons.light_mode),
                          ),
                          ButtonSegment(
                            value: ThemeMode.dark,
                            icon: Icon(Icons.dark_mode),
                          ),
                          ButtonSegment(
                            value: ThemeMode.system,
                            icon: Icon(Icons.settings_suggest),
                          ),
                        ],
                        selected: {themeMode},
                        onSelectionChanged: (Set<ThemeMode> selection) {
                          ref
                              .read(themeModeProvider.notifier)
                              .setThemeMode(selection.first);
                        },
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GlassCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(Icons.memory, color: AppColors.primary),
                      title: Text(AppLocalizations.of(context)!.settingsMemoryUsage),
                      trailing: IconButton(
                        icon: const Icon(Icons.refresh),
                        onPressed: () => ref.refresh(systemMemoryProvider),
                      ),
                    ),
                    const Divider(height: 1),
                    Consumer(
                      builder: (context, ref, child) {
                        final memoryAsync = ref.watch(systemMemoryProvider);
                        return memoryAsync.when(
                          data: (memory) => _MemoryUsageBar(memory: memory),
                          loading: () => const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (e, s) => Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(AppLocalizations.of(context)!.commonLoadFailed(e.toString())),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GlassCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(Icons.cloud, color: AppColors.primary),
                      title: Text(l10n.serviceStatus),
                      trailing: IconButton(
                        icon: const Icon(Icons.refresh),
                        onPressed: () =>
                            ref.read(serviceProvider.notifier).checkAll(),
                      ),
                    ),
                    const Divider(height: 1),
                    const _ServiceStatusSection(),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GlassCard(padding: EdgeInsets.zero, child: _ModelStoreConfig()),
              const SizedBox(height: 16),
              GlassCard(padding: EdgeInsets.zero, child: _TtsSettingsSection()),
              if (AccessibilityController.isSupported) ...[
                const SizedBox(height: 16),
                GlassCard(
                  padding: EdgeInsets.zero,
                  child: _AccessibilityTile(),
                ),
              ],
              const SizedBox(height: 16),
GlassCard(
                  padding: EdgeInsets.zero,
                  child: ListTile(
                    leading: Icon(Icons.account_tree, color: AppColors.primary),
                    title: Text(l10n.telencephalonFlows),
                    subtitle: const Text('Browse and run telencephalon flows'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const FlowsScreen()),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Backend (telencephalon) 配置
                const _BackendSettingsCard(),
                const SizedBox(height: 16),
              // 设备发现
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(Icons.wifi_find, color: AppColors.primary),
                  title: Text(AppLocalizations.of(context)!.settingsDeviceDiscovery),
                  subtitle: Text(AppLocalizations.of(context)!.settingsDeviceDiscoveryDesc),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/discovery'),
                ),
              ),
              const SizedBox(height: 16),
              // 嵌入式 Prefrontal（NDK .so）
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(Icons.psychology, color: AppColors.primary),
                  title: Text(AppLocalizations.of(context)!.settingsPrefrontalEmbedded),
                  subtitle: Text(AppLocalizations.of(context)!.settingsPrefrontalEmbeddedDesc),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/settings/prefrontal'),
                ),
              ),
              const SizedBox(height: 16),
              // 系统日志
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(Icons.article_outlined, color: AppColors.primary),
                  title: Text(AppLocalizations.of(context)!.logsTitle),
                  subtitle: Text(AppLocalizations.of(context)!.settingsLogsDesc),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/logs'),
                ),
              ),
              const SizedBox(height: 16),
              // Resonance管理
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(Icons.cloud_sync, color: AppColors.primary),
                  title: Text(AppLocalizations.of(context)!.resonanceTitle),
                  subtitle: Text(AppLocalizations.of(context)!.settingsResonanceDesc),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/resonance'),
                ),
              ),
              const SizedBox(height: 16),
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(Icons.refresh, color: AppColors.error),
                  title: Text(l10n.resetEngine),
                  subtitle: const Text('Reinitialize engine'),
                  onTap: onReset,
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(height: 400, child: const LogPanelSection()),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceStatusSection extends ConsumerStatefulWidget {
  const _ServiceStatusSection();

  @override
  ConsumerState<_ServiceStatusSection> createState() =>
      _ServiceStatusSectionState();
}

class _ServiceStatusSectionState extends ConsumerState<_ServiceStatusSection> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(serviceProvider.notifier).checkAll();
    });
  }

  @override
  Widget build(BuildContext context) {
    final services = ref.watch(serviceProvider);

    return Column(
      children: services.map((service) {
        return _ServiceStatusTile(service: service);
      }).toList(),
    );
  }
}

class _ServiceStatusTile extends StatelessWidget {
  final ServiceInfo service;

  const _ServiceStatusTile({required this.service});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    final statusConfig = {
      ServiceStatus.healthy: (
        Icons.check_circle,
        AppColors.success,
        l10n.healthy,
      ),
      ServiceStatus.offline: (Icons.cancel, AppColors.error, l10n.offline),
      ServiceStatus.checking: (Icons.sync, AppColors.warning, l10n.checking),
      ServiceStatus.unhealthy: (Icons.error, AppColors.error, l10n.unhealthy),
      ServiceStatus.unknown: (
        Icons.help,
        AppColors.darkTextSecondary,
        l10n.unknown,
      ),
    };

    final (icon, color, label) = statusConfig[service.status]!;

    return ListTile(
      dense: true,
      leading: Icon(icon, color: color, size: 20),
      title: Text(service.displayName),
      subtitle: Text(
        service.error ?? '${service.host}:${service.port}',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (service.latencyMs != null &&
              service.status == ServiceStatus.healthy)
            Text(
              '${service.latencyMs}ms',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(fontSize: 12, color: color)),
        ],
      ),
    );
  }
}

class _AccessibilityTile extends StatefulWidget {
  @override
  State<_AccessibilityTile> createState() => _AccessibilityTileState();
}

class _AccessibilityTileState extends State<_AccessibilityTile>
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
    return ListTile(
      leading: Icon(Icons.accessibility, color: AppColors.primary),
      title: Text(l10n.accessibilityControl),
      subtitle: Text(_isEnabled ? l10n.accessibilityOn : l10n.accessibilityOff),
      trailing: Switch(
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

class _ModelStoreConfig extends StatefulWidget {
  @override
  State<_ModelStoreConfig> createState() => _ModelStoreConfigState();
}

class _ModelStoreConfigState extends State<_ModelStoreConfig> {
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
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context)!.modelStoreUrlUpdated),
        ),
      );
    }
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
    return Column(
      children: [
        ListTile(
          leading: Icon(Icons.download, color: AppColors.primary),
          title: Text(l10n.modelStoreServer),
          trailing: _isEditing
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: _cancelEdit,
                    ),
                    IconButton(
                      icon: const Icon(Icons.check, size: 20),
                      onPressed: _saveUrl,
                    ),
                  ],
                )
              : IconButton(
                  icon: const Icon(Icons.edit, size: 20),
                  onPressed: () => setState(() => _isEditing = true),
                ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (!_isDefault)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.secondary.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        l10n.custom,
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.secondary,
                        ),
                      ),
                    ),
                  if (_isDefault)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        l10n.defaultOption,
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.success,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              if (_isEditing)
                TextField(
                  controller: _urlController,
                  decoration: const InputDecoration(
                    hintText: 'https://modelscope.cn/api/v1',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  style: const TextStyle(fontSize: 14),
                )
              else
                Text(
                  _currentUrl,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.darkTextSecondary,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TtsSettingsSection extends StatefulWidget {
  @override
  State<_TtsSettingsSection> createState() => _TtsSettingsSectionState();
}

class _TtsSettingsSectionState extends State<_TtsSettingsSection> {
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
    if (mounted) {
      setState(() {
        _isInitialized = initialized;
        _engineType = _ttsEngine.engineType;
        _urlController.text = _ttsEngine.externalUrl;
      });
    }
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
    return Column(
      children: [
        ListTile(
          leading: Icon(Icons.record_voice_over, color: AppColors.primary),
          title: Text(l10n.ttsSettings),
        ),
        const Divider(height: 1),
        ListTile(
          dense: true,
          title: Text(l10n.ttsStatus),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(Icons.refresh, size: 18),
                onPressed: _initTts,
                tooltip: AppLocalizations.of(context)!.settingsRefreshStatus,
              ),
              Icon(
                _isInitialized ? Icons.check_circle : Icons.error,
                color: _isInitialized ? AppColors.success : AppColors.error,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                _isInitialized ? l10n.ttsReady : l10n.ttsNotReady,
                style: TextStyle(
                  fontSize: 12,
                  color: _isInitialized ? AppColors.success : AppColors.error,
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        ListTile(
          dense: true,
          title: Text(l10n.ttsEngine),
          trailing: SegmentedButton<TtsEngineType>(
            segments: [
              ButtonSegment(
                value: TtsEngineType.androidBuiltIn,
                label: Text(
                  l10n.ttsEngineAndroid,
                  style: const TextStyle(fontSize: 10),
                ),
              ),
              ButtonSegment(
                value: TtsEngineType.rust,
                label: Text('Rust', style: const TextStyle(fontSize: 10)),
              ),
              ButtonSegment(
                value: TtsEngineType.external,
                label: Text(
                  l10n.ttsEngineExternal,
                  style: const TextStyle(fontSize: 10),
                ),
              ),
            ],
            selected: {_engineType},
            onSelectionChanged: (selection) =>
                _onEngineTypeChanged(selection.first),
          ),
        ),
        if (_engineType == TtsEngineType.external) ...[
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.ttsExternalUrl, style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 8),
                if (_isEditingUrl)
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _urlController,
                          decoration: InputDecoration(
                            hintText: l10n.ttsExternalUrlHint,
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        onPressed: () => setState(() => _isEditingUrl = false),
                      ),
                      IconButton(
                        icon: const Icon(Icons.check, size: 20),
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
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: _urlController.text.isEmpty
                                    ? AppColors.darkTextSecondary
                                    : null,
                              ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit, size: 20),
                        onPressed: () => setState(() => _isEditingUrl = true),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
        const Divider(height: 1),
        ListTile(
          dense: true,
          title: Text(l10n.ttsTest),
          trailing: IconButton(
            icon: Icon(Icons.play_circle, color: AppColors.primary),
            onPressed: _isInitialized ? _testSpeech : null,
          ),
        ),
      ],
    );
  }
}

class _MemoryUsageBar extends StatelessWidget {
  final SystemMemoryInfo memory;

  const _MemoryUsageBar({required this.memory});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                AppLocalizations.of(context)!.settingsMemUsed(memory.usedMb),
                style: const TextStyle(fontSize: 12),
              ),
              Text(
                AppLocalizations.of(context)!.settingsMemTotal(memory.totalMb),
                style: const TextStyle(fontSize: 12),
              ),
              Text(
                AppLocalizations.of(context)!.settingsMemFree(memory.freeMb),
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: memory.usagePercent / 100,
              backgroundColor: Colors.grey.withValues(alpha: 0.3),
              valueColor: AlwaysStoppedAnimation<Color>(
                memory.usagePercent > 80
                    ? AppColors.error
                    : memory.usagePercent > 60
                    ? Colors.orange
                    : AppColors.success,
              ),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            AppLocalizations.of(context)!.settingsMemUsage(memory.usagePercent.toStringAsFixed(1)),
            style: TextStyle(
              fontSize: 11,
              color: memory.usagePercent > 80
                  ? AppColors.error
                  : memory.usagePercent > 60
                  ? Colors.orange
                  : AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}

class _BackendSettingsCard extends ConsumerStatefulWidget {
  const _BackendSettingsCard();

  @override
  ConsumerState<_BackendSettingsCard> createState() =>
      _BackendSettingsCardState();
}

class _BackendSettingsCardState extends ConsumerState<_BackendSettingsCard> {
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
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Backend settings saved')),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _hydrate());
    }
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.dns, color: AppColors.primary),
              const SizedBox(width: 8),
              const Text(
                'Backend (Telencephalon)',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Override the telencephalon base URL and admin token used by the mobile client.',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _urlCtrl,
            decoration: const InputDecoration(
              labelText: 'Base URL',
              hintText: 'http://127.0.0.1:60080',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.url,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _tokenCtrl,
            decoration: const InputDecoration(
              labelText: 'Admin Token (optional)',
              hintText: 'leave blank for dev mode',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.save_outlined),
              label: const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
