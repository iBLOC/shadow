import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../l10n/current_l10n.dart';

/// 日志级别
enum LogLevel {
  debug,
  info,
  warning,
  error,
  fatal,
}

/// 日志条目
class LogEntry {
  final String id;
  final DateTime timestamp;
  final LogLevel level;
  final String source;
  final String message;
  final String? stack;
  final Map<String, dynamic>? metadata;

  const LogEntry({
    required this.id,
    required this.timestamp,
    required this.level,
    required this.source,
    required this.message,
    this.stack,
    this.metadata,
  });

  String get levelLabel {
    switch (level) {
      case LogLevel.debug:
        return 'DEBUG';
      case LogLevel.info:
        return 'INFO';
      case LogLevel.warning:
        return 'WARN';
      case LogLevel.error:
        return 'ERROR';
      case LogLevel.fatal:
        return 'FATAL';
    }
  }

  Color get levelColor {
    switch (level) {
      case LogLevel.debug:
        return Colors.grey;
      case LogLevel.info:
        return Colors.blue;
      case LogLevel.warning:
        return Colors.orange;
      case LogLevel.error:
        return Colors.red;
      case LogLevel.fatal:
        return Colors.purple;
    }
  }
}

/// 日志状态
class LogsState {
  final List<LogEntry> entries;
  final LogLevel? filterLevel;
  final String? filterSource;

  const LogsState({
    this.entries = const [],
    this.filterLevel,
    this.filterSource,
  });

  LogsState copyWith({
    List<LogEntry>? entries,
    LogLevel? filterLevel,
    String? filterSource,
    bool clearFilter = false,
  }) {
    return LogsState(
      entries: entries ?? this.entries,
      filterLevel: clearFilter ? null : (filterLevel ?? this.filterLevel),
      filterSource: clearFilter ? null : (filterSource ?? this.filterSource),
    );
  }

  List<LogEntry> get filteredEntries {
    return entries.where((entry) {
      if (filterLevel != null && entry.level != filterLevel) return false;
      if (filterSource != null && entry.source != filterSource) return false;
      return true;
    }).toList();
  }

  List<String> get sources {
    return entries.map((e) => e.source).toSet().toList()..sort();
  }
}

/// 日志状态管理
class LogsNotifier extends StateNotifier<LogsState> {
  LogsNotifier() : super(const LogsState()) {
    _init();
  }

  void _init() {
    // 添加示例日志
    final l10n = currentL10n();
    addLog(LogEntry(
      id: '1',
      timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
      level: LogLevel.info,
      source: 'telencephalon',
      message: l10n.logsTelencephalonStarted,
    ));
    addLog(LogEntry(
      id: '2',
      timestamp: DateTime.now().subtract(const Duration(minutes: 3)),
      level: LogLevel.warning,
      source: 'prefrontal',
      message: l10n.logsDbTimeoutRetry,
    ));
    addLog(LogEntry(
      id: '3',
      timestamp: DateTime.now().subtract(const Duration(minutes: 1)),
      level: LogLevel.error,
      source: 'telencephalon',
      message: l10n.logsHippocampusUnreachable,
      stack: 'ConnectionError: http://localhost:8081\n  at HttpClient._send\n  at TelencephalonClient.health',
    ));
  }

  void addLog(LogEntry entry) {
    state = state.copyWith(
      entries: [entry, ...state.entries],
    );
  }

  void clear() {
    state = state.copyWith(entries: []);
  }

  void setFilterLevel(LogLevel? level) {
    state = state.copyWith(filterLevel: level, clearFilter: level == null);
  }

  void setFilterSource(String? source) {
    state = state.copyWith(filterSource: source, clearFilter: source == null);
  }

  void clearFilters() {
    state = state.copyWith(clearFilter: true);
  }
}

/// 日志状态Provider
final logsProvider = StateNotifierProvider<LogsNotifier, LogsState>((ref) {
  return LogsNotifier();
});

/// 日志页面
class LogsPage extends ConsumerStatefulWidget {
  const LogsPage({super.key});

  @override
  ConsumerState<LogsPage> createState() => _LogsPageState();
}

class _LogsPageState extends ConsumerState<LogsPage> {
  String? _expandedId;

  @override
  Widget build(BuildContext context) {
    final logsState = ref.watch(logsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.logsTitle),
        actions: [
          // 过滤按钮
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (value) {
              if (value == 'clear') {
                ref.read(logsProvider.notifier).clearFilters();
              } else if (value.startsWith('level_')) {
                final level = LogLevel.values[int.parse(value.split('_')[1])];
                ref.read(logsProvider.notifier).setFilterLevel(level);
              } else if (value.startsWith('source_')) {
                final source = value.substring(7);
                ref.read(logsProvider.notifier).setFilterSource(source);
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'clear',
                child: Text(AppLocalizations.of(context)!.logsClearFilter),
              ),
              const PopupMenuDivider(),
              ...LogLevel.values.map((level) => PopupMenuItem(
                value: 'level_${level.index}',
                child: Row(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: _getLevelColor(level),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(level.name.toUpperCase()),
                  ],
                ),
              )),
              if (logsState.sources.isNotEmpty) ...[
                const PopupMenuDivider(),
                ...logsState.sources.map((source) => PopupMenuItem(
                  value: 'source_$source',
                  child: Text(source),
                )),
              ],
            ],
          ),
          // 清除按钮
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: Text(AppLocalizations.of(context)!.logsClearAll),
                  content: Text(AppLocalizations.of(context)!.logsClearConfirm),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(AppLocalizations.of(context)!.cancel),
                    ),
                    ElevatedButton(
                      onPressed: () {
                        ref.read(logsProvider.notifier).clear();
                        Navigator.of(context).pop();
                      },
                      child: Text(AppLocalizations.of(context)!.logsClear),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // 过滤状态显示
          if (logsState.filterLevel != null || logsState.filterSource != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.grey.shade100,
              child: Row(
                children: [
                  const Icon(Icons.filter_list, size: 16),
                  const SizedBox(width: 8),
                  Text(
                    AppLocalizations.of(context)!.logsFilterLabel(logsState.filterLevel?.name ?? '', logsState.filterSource ?? ''),
                    style: const TextStyle(fontSize: 12),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, size: 16),
                    tooltip:
                        AppLocalizations.of(context)!.commonClearFilters,
                    visualDensity: VisualDensity.compact,
                    onPressed: () =>
                        ref.read(logsProvider.notifier).clearFilters(),
                  ),
                ],
              ),
            ),

          // 日志列表
          Expanded(
            child: logsState.filteredEntries.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.article_outlined,
                          size: 64,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          logsState.entries.isEmpty ? AppLocalizations.of(context)!.logsEmpty : AppLocalizations.of(context)!.logsNoMatch,
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    itemCount: logsState.filteredEntries.length,
                    itemBuilder: (context, index) {
                      final entry = logsState.filteredEntries[index];
                      final isExpanded = _expandedId == entry.id;
                      return _LogEntryCard(
                        entry: entry,
                        isExpanded: isExpanded,
                        onTap: () {
                          setState(() {
                            _expandedId = isExpanded ? null : entry.id;
                          });
                        },
                        onCopy: () => _copyToClipboard(entry),
                      );
                    },
                  ),
          ),

          // 底部统计
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  AppLocalizations.of(context)!.logsTotalCount(logsState.entries.length),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
                Text(
                  AppLocalizations.of(context)!.logsShownCount(logsState.filteredEntries.length),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _getLevelColor(LogLevel level) {
    switch (level) {
      case LogLevel.debug:
        return Colors.grey;
      case LogLevel.info:
        return Colors.blue;
      case LogLevel.warning:
        return Colors.orange;
      case LogLevel.error:
        return Colors.red;
      case LogLevel.fatal:
        return Colors.purple;
    }
  }

  void _copyToClipboard(LogEntry entry) {
    final buffer = StringBuffer()
      ..writeln('[${entry.timestamp.toIso8601String()}] ${entry.levelLabel} ${entry.source}')
      ..writeln(entry.message);
    if (entry.stack != null) {
      buffer.writeln('\nStack Trace:');
      buffer.writeln(entry.stack);
    }
    Clipboard.setData(ClipboardData(text: buffer.toString()));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context)!.logsCopied)),
    );
  }
}

/// 日志条目卡片
class _LogEntryCard extends StatelessWidget {
  final LogEntry entry;
  final bool isExpanded;
  final VoidCallback onTap;
  final VoidCallback onCopy;

  const _LogEntryCard({
    required this.entry,
    required this.isExpanded,
    required this.onTap,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 头部：级别、来源、时间
              Row(
                children: [
                  // 级别标签
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: entry.levelColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: entry.levelColor.withOpacity(0.3)),
                    ),
                    child: Text(
                      entry.levelLabel,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: entry.levelColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // 来源
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      entry.source,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // 时间
                  Text(
                    '${entry.timestamp.hour}:${entry.timestamp.minute.toString().padLeft(2, '0')}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                    ),
                  ),
                  // 复制按钮
                  IconButton(
                    icon: const Icon(Icons.copy, size: 16),
                    onPressed: onCopy,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // 消息内容
              Text(
                entry.message,
                style: const TextStyle(fontSize: 14),
                maxLines: isExpanded ? null : 2,
                overflow: isExpanded ? null : TextOverflow.ellipsis,
              ),
              // 展开的堆栈信息
              if (isExpanded && entry.stack != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    entry.stack!,
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: Colors.grey.shade700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
