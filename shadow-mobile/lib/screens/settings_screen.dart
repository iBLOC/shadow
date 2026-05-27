import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/accessibility_controller.dart';
import '../services/app_config_service.dart';
import '../providers/theme_provider.dart';
import '../providers/service_provider.dart';
import '../widgets/glass_card.dart';
import '../widgets/log_panel_section.dart';
import '../theme/app_colors.dart';

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
                  leading: Icon(Icons.refresh, color: AppColors.error),
                  title: Text(l10n.resetEngine),
                  subtitle: Text(l10n.reinitializeMnn),
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
