import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../services/log_service.dart';
import '../providers/log_provider.dart';
import '../widgets/glass_card.dart';

class LogPanelSection extends ConsumerStatefulWidget {
  const LogPanelSection({super.key});

  @override
  ConsumerState<LogPanelSection> createState() => _LogPanelSectionState();
}

class _LogPanelSectionState extends ConsumerState<LogPanelSection> {
  final ScrollController _scrollController = ScrollController();
  bool _disposed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_disposed) {
        ref.read(logServiceProvider.notifier)
          ..connectPrefrontal('http://10.0.2.2:8082')
          ..connectMnn();
      }
    });
  }

  @override
  void dispose() {
    _disposed = true;
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

    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Logs exported to ${file.path}')));
    }
  }

  @override
  Widget build(BuildContext context) {
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

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Icon(Icons.article_outlined, size: 20),
              const Text(
                '日志',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              SegmentedButton<LogSource?>(
                segments: const [
                  ButtonSegment(value: null, label: Text('全部')),
                  ButtonSegment(value: LogSource.mnn, label: Text('MNN')),
                  ButtonSegment(value: LogSource.prefrontal, label: Text('后端')),
                ],
                selected: {logState.sourceFilter},
                onSelectionChanged: (selected) {
                  ref
                      .read(logServiceProvider.notifier)
                      .setSourceFilter(selected.first);
                },
              ),
              PopupMenuButton<LogLevel?>(
                icon: const Icon(Icons.filter_list),
                onSelected: (level) {
                  ref.read(logServiceProvider.notifier).setLevelFilter(level);
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(value: null, child: Text('所有级别')),
                  const PopupMenuItem(
                    value: LogLevel.debug,
                    child: Text('Debug'),
                  ),
                  const PopupMenuItem(
                    value: LogLevel.info,
                    child: Text('Info'),
                  ),
                  const PopupMenuItem(
                    value: LogLevel.warning,
                    child: Text('Warning'),
                  ),
                  const PopupMenuItem(
                    value: LogLevel.error,
                    child: Text('Error'),
                  ),
                ],
              ),
              Switch(
                value: logState.autoScroll,
                onChanged: (value) {
                  ref.read(logServiceProvider.notifier).setAutoScroll(value);
                },
              ),
              IconButton(
                icon: const Icon(Icons.download),
                onPressed: _exportLogs,
                tooltip: '导出日志',
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () {
                  ref.read(logServiceProvider.notifier).clearLogs();
                },
                tooltip: '清空日志',
              ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(8),
              ),
              child: filteredLogs.isEmpty
                  ? const Center(
                      child: Text('暂无日志', style: TextStyle(color: Colors.grey)),
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
    );
  }
}

class _LogEntryTile extends StatelessWidget {
  final LogEntry log;

  const _LogEntryTile({required this.log});

  Color _getLevelColor() {
    switch (log.level) {
      case LogLevel.debug:
        return Colors.grey;
      case LogLevel.info:
        return Colors.blue;
      case LogLevel.warning:
        return Colors.orange;
      case LogLevel.error:
        return Colors.red;
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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_getLevelIcon(), size: 14, color: _getLevelColor()),
          const SizedBox(width: 4),
          Text(
            log.source == LogSource.mnn ? '[MNN]' : '[Pre]',
            style: TextStyle(fontSize: 10, color: Colors.grey[400]),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              log.message,
              style: TextStyle(fontSize: 12, color: _getLevelColor()),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
