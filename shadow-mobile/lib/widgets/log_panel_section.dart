import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/log_provider.dart';
import '../services/log_service.dart';
import '../services/prefrontal/prefrontal_mobile_provider.dart';
import '../theme/app_tokens.g.dart';
import 'glass_card.dart';

/// 日志面板 —— shadcn 版。
///
/// 2026-10-29 从 Material 迁过来：原来用的是 `SegmentedButton` /
/// `PopupMenuButton` / `Switch` / `IconButton` / `SnackBar`。设置页把它
/// 嵌进「高级」折叠区之后，Material 的水波纹会画在玻璃层上被盖住
/// （跟 `ListTile` 是同一个坑），所以筛选、开关、按钮一并换成 shadcn 控件。
///
/// 面板自带一个 [ShadSonner]（局部 toast），因此不依赖页面级 toast 宿主。
class LogPanelSection extends ConsumerStatefulWidget {
  const LogPanelSection({super.key});

  @override
  ConsumerState<LogPanelSection> createState() => _LogPanelSectionState();
}

class _LogPanelSectionState extends ConsumerState<LogPanelSection> {
  /// 「全部」在两个下拉里共用同一个占位值（enum 本身表达不了 null）。
  static const String _all = 'all';

  final ScrollController _scrollController = ScrollController();
  final GlobalKey<ShadSonnerState> _sonnerKey = GlobalKey<ShadSonnerState>();
  ProviderSubscription<int?>? _prefrontalPortSub;
  bool _disposed = false;

  @override
  void initState() {
    super.initState();
    // The agent log stream (`/api/logs/stream`) is served by the legacy
    // embedded Prefrontal only — Telencephalon has no such route. That
    // runtime is off by default, so the port is null at first frame and
    // only becomes known if the user starts it later; reading the port
    // once (as this used to do) meant the panel would never attach.
    // listenManual keeps following the provider instead.
    _prefrontalPortSub = ref.listenManual<int?>(
      prefrontalMobilePortProvider,
      (previous, next) => _attachPrefrontal(next),
      fireImmediately: true,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_disposed) return;
      ref.read(logServiceProvider.notifier).connectMnn();
    });
  }

  void _attachPrefrontal(int? port) {
    if (_disposed) return;
    final notifier = ref.read(logServiceProvider.notifier);
    if (port != null && port > 0) {
      notifier.connectPrefrontal('http://127.0.0.1:$port');
    } else {
      notifier.disconnectPrefrontal();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _prefrontalPortSub?.close();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _exportLogs() async {
    final logs = ref.read(logServiceProvider.notifier).exportLogs();
    final directory = await getApplicationDocumentsDirectory();
    final file = File(
      '${directory.path}/shadow_logs_${DateTime.now().millisecondsSinceEpoch}.csv',
    );
    await file.writeAsString(logs);

    if (!mounted) return;
    final l10n = AppLocalizations.of(context)!;
    _sonnerKey.currentState?.show(
      ShadToast(title: Text(l10n.logsExported(file.path))),
    );
  }

  String _sourceLabel(AppLocalizations l10n, String value) {
    return switch (value) {
      'app' => l10n.logsApp,
      'mnn' => l10n.logsDevice,
      'prefrontal' => l10n.logsBackend,
      _ => l10n.commonAll,
    };
  }

  String _levelLabel(String value) {
    if (value.isEmpty) return value;
    return value[0].toUpperCase() + value.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = ShadTheme.of(context);
    final logState = ref.watch(logServiceProvider);
    final filteredLogs = logState.filteredLogs;

    if (logState.autoScroll && _scrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            0,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }

    return ShadSonner(
      key: _sonnerKey,
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: AppTokens.spaceSm,
              runSpacing: AppTokens.spaceSm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                // 来源筛选
                ShadSelect<String>(
                  initialValue: logState.sourceFilter?.name ?? _all,
                  minWidth: 96,
                  selectedOptionBuilder: (context, value) =>
                      Text(_sourceLabel(l10n, value)),
                  options: [
                    ShadOption(value: _all, child: Text(l10n.commonAll)),
                    ShadOption(value: 'app', child: Text(l10n.logsApp)),
                    ShadOption(value: 'mnn', child: Text(l10n.logsDevice)),
                    ShadOption(
                      value: 'prefrontal',
                      child: Text(l10n.logsBackend),
                    ),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    ref
                        .read(logServiceProvider.notifier)
                        .setSourceFilter(
                          value == _all ? null : LogSource.values.byName(value),
                        );
                  },
                ),
                // 级别筛选
                ShadSelect<String>(
                  initialValue: logState.levelFilter?.name ?? _all,
                  minWidth: 112,
                  selectedOptionBuilder: (context, value) => Text(
                    value == _all ? l10n.logsAllLevels : _levelLabel(value),
                  ),
                  options: [
                    ShadOption(value: _all, child: Text(l10n.logsAllLevels)),
                    ShadOption(value: 'debug', child: const Text('Debug')),
                    ShadOption(value: 'info', child: const Text('Info')),
                    ShadOption(value: 'warning', child: const Text('Warning')),
                    ShadOption(value: 'error', child: const Text('Error')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    ref
                        .read(logServiceProvider.notifier)
                        .setLevelFilter(
                          value == _all ? null : LogLevel.values.byName(value),
                        );
                  },
                ),
                // 自动滚动
                ShadSwitch(
                  value: logState.autoScroll,
                  onChanged: (value) {
                    ref.read(logServiceProvider.notifier).setAutoScroll(value);
                  },
                ),
                ShadIconButton.ghost(
                  icon: const Icon(Icons.download, size: 18),
                  onPressed: _exportLogs,
                ),
                ShadIconButton.ghost(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  onPressed: () {
                    ref.read(logServiceProvider.notifier).clearLogs();
                  },
                ),
              ],
            ),
            const SizedBox(height: AppTokens.spaceSm),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: theme.colorScheme.muted.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(AppTokens.radiusSm),
                ),
                child: filteredLogs.isEmpty
                    ? Center(
                        child: Text(
                          l10n.logsEmpty,
                          style: theme.textTheme.small.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        reverse: true,
                        itemCount: filteredLogs.length,
                        itemBuilder: (context, index) {
                          final log = filteredLogs[index];
                          return _LogEntryTile(log: log);
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 单条日志。
class _LogEntryTile extends StatelessWidget {
  final LogEntry log;

  const _LogEntryTile({required this.log});

  Color _getLevelColor(ShadColorScheme colors) {
    switch (log.level) {
      case LogLevel.debug:
        return colors.mutedForeground;
      case LogLevel.info:
        return AppTokens.statusInfo;
      case LogLevel.warning:
        return AppTokens.statusWarning;
      case LogLevel.error:
        return colors.destructive;
    }
  }

  IconData _getLevelIcon() {
    switch (log.level) {
      case LogLevel.debug:
        return Icons.bug_report;
      case LogLevel.info:
        return Icons.info;
      case LogLevel.warning:
        return Icons.warning;
      case LogLevel.error:
        return Icons.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    final color = _getLevelColor(theme.colorScheme);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_getLevelIcon(), size: 14, color: color),
          const SizedBox(width: 4),
          // 真实 tag（logcat 的 tag / 后端流的 target），不是写死的源类型 ——
          // logcat 名单现在覆盖 EncephalonRuntime / flutter / MainActivity，
          // 一律标成「MNN」会把端脑的启动日志冒名成推理引擎的。
          Text(
            '[${log.tag.isNotEmpty ? log.tag : log.source.name}]',
            style: theme.textTheme.small.copyWith(
              fontSize: AppTokens.fontSizeXs,
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              log.message,
              style: theme.textTheme.small.copyWith(
                fontSize: AppTokens.fontSizeXs,
                color: color,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
