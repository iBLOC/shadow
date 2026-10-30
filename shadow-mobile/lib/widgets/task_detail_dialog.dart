import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../screens/task_board_screen.dart';
import 'task_edit_dialog.dart';
import '../generated/l10n/app_localizations.dart';

/// 任务详情弹窗 - 显示完整任务信息 + 子任务列表 + 子任务进度。
/// 点击任务卡片时打开。
class TaskDetailDialog extends ConsumerStatefulWidget {
  final TaskInfo task;
  const TaskDetailDialog({super.key, required this.task});

  @override
  ConsumerState<TaskDetailDialog> createState() => _TaskDetailDialogState();
}

class _TaskDetailDialogState extends ConsumerState<TaskDetailDialog>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _isRefreshing = true);
    try {
      await ref
          .read(tasksNotifierProvider.notifier)
          .reloadTask(widget.task.id);
    } finally {
      if (mounted) setState(() => _isRefreshing = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.commonConfirmDelete),
        content: Text(AppLocalizations.of(context)!.commonDeleteConfirmNamed(widget.task.title)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(AppLocalizations.of(context)!.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(tasksNotifierProvider.notifier).deleteTask(widget.task.id);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.commonDeleteFailed(e.toString()))),
        );
      }
    }
  }

  /// 确认任务（端脑的核心动作）。
  Future<void> _confirm() async {
    try {
      await ref.read(tasksNotifierProvider.notifier).confirmTask(widget.task.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  void _openEdit() {
    // 不先 pop 详情弹窗：pop 之后它的 context 就失效了，再拿它去 push
    // 下一个对话框会抛 "Looking up a deactivated widget's ancestor"。
    // 直接把编辑弹窗叠在上面，保存后编辑弹窗自己 pop 回详情，
    // 详情会通过 provider 重新渲染出最新的状态。
    showDialog(
      context: context,
      builder: (_) => TaskEditDialog(task: widget.task),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Listen for updates so dialog re-renders after edits.
    final task = ref
            .watch(tasksNotifierProvider)
            .tasks
            .firstWhere(
              (t) => t.id == widget.task.id,
              orElse: () => widget.task,
            );

    final points = task.confirmationPoints;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(16),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(task),
            TabBar(
              controller: _tabController,
              tabs: [
                Tab(text: AppLocalizations.of(context)!.taskOverview),
                Tab(text: AppLocalizations.of(context)!.taskConfirmationPoints),
                Tab(text: AppLocalizations.of(context)!.taskLogs),
              ],
            ),
            Flexible(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildOverview(task),
                  _buildConfirmationPoints(points),
                  _buildLogs(task),
                ],
              ),
            ),
            _buildFooter(task),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(TaskInfo task) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.checklist, color: Colors.indigo),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  task.title,
                  style: Theme.of(context).textTheme.titleLarge,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                icon: Icon(
                  _isRefreshing
                      ? Icons.refresh
                      : Icons.refresh,
                ),
                onPressed: _isRefreshing ? null : _refresh,
                tooltip: AppLocalizations.of(context)!.commonRefresh,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              _StatusChip(status: task.status),
              if (task.priority.isNotEmpty)
                Chip(
                  label: Text(task.priority),
                  visualDensity: VisualDensity.compact,
                ),
              Chip(
                label: Text(task.id.length > 12
                    ? '${task.id.substring(0, 12)}…'
                    : task.id),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOverview(TaskInfo task) {
    final l10n = AppLocalizations.of(context)!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (task.description != null && task.description!.isNotEmpty) ...[
            Text(AppLocalizations.of(context)!.commonDescription,
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(task.description!),
            ),
            const SizedBox(height: 16),
          ],
          _InfoRow(label: l10n.taskStatus, value: task.status),
          _InfoRow(label: l10n.taskPriority, value: task.priority),
          _InfoRow(
            label: l10n.taskCreatedAt,
            value: _fmtDate(task.createdAt),
          ),
          if (task.dueTime != null)
            _InfoRow(
              label: l10n.taskDueTime,
              value: _fmtDate(task.dueTime!),
            ),
          if (task.completedAt != null)
            _InfoRow(
              label: l10n.taskCompletedAt,
              value: _fmtDate(task.completedAt!),
            ),
          _InfoRow(
            label: l10n.taskConfirmState,
            value:
                task.confirmed ? l10n.taskConfirmed : l10n.taskAwaitingConfirm,
          ),
          if (task.tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(AppLocalizations.of(context)!.taskTags,
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: task.tags
                  .map((t) => Chip(
                        label: Text(t),
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  /// 确认点 —— 端脑在创建任务时生成的一组「需要确认的事」。
  ///
  /// 端脑任务**没有子步骤**（那是海马体 `TaskRecord.steps` 的概念），
  /// 对应的就是这一组确认点。
  Widget _buildConfirmationPoints(List<String> points) {
    final l10n = AppLocalizations.of(context)!;
    if (points.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            l10n.taskNoConfirmationPoints,
            style: TextStyle(color: Theme.of(context).hintColor),
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: points.length,
      itemBuilder: (context, index) => _ConfirmationPointRow(
        index: index,
        text: points[index],
      ),
    );
  }

  Widget _buildLogs(TaskInfo task) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: SelectableText(
        _buildPrettyJson(task),
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _buildFooter(TaskInfo task) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.withOpacity(0.2))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          TextButton.icon(
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            label: Text(AppLocalizations.of(context)!.commonDelete, style: TextStyle(color: Colors.red)),
            onPressed: _delete,
          ),
          const SizedBox(width: 8),
          // 「确认」是端脑任务的核心动作 —— 只有确认过的任务才会被调度。
          // 服务端只允许确认 `Pending` 的任务，别的状态会回 400 ⇒ 按钮
          // 只在「待确认」时露出来。
          if (task.status == TaskBoardColumn.backlog && !task.confirmed) ...[
            OutlinedButton.icon(
              icon: const Icon(Icons.task_alt),
              label: Text(AppLocalizations.of(context)!.taskConfirmAction),
              onPressed: _confirm,
            ),
            const SizedBox(width: 8),
          ],
          FilledButton.icon(
            icon: const Icon(Icons.edit_outlined),
            label: Text(AppLocalizations.of(context)!.commonEdit),
            onPressed: _openEdit,
          ),
        ],
      ),
    );
  }

  String _buildPrettyJson(TaskInfo task) {
    return const JsonEncoderPretty().encode(task);
  }
}

String _fmtDate(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} '
      '${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
}

class JsonEncoderPretty {
  const JsonEncoderPretty();
  String encode(TaskInfo t) {
    final map = {
      'id': t.id,
      'title': t.title,
      'status': t.status,
      'priority': t.priority,
      'description': t.description,
      'tags': t.tags,
      'confirmed': t.confirmed,
      'confirmation_points': t.confirmationPoints,
      'due_time': t.dueTime?.toIso8601String(),
      'created_at': t.createdAt.toIso8601String(),
      'completed_at': t.completedAt?.toIso8601String(),
    };
    return _prettyJson(map);
  }
}

String _prettyJson(Map<String, dynamic> map, [int indent = 0]) {
  final pad = '  ' * indent;
  final innerPad = '  ' * (indent + 1);
  final buf = StringBuffer();
  buf.writeln('{');
  final entries = map.entries.toList();
  for (var i = 0; i < entries.length; i++) {
    final e = entries[i];
    final comma = i < entries.length - 1 ? ',' : '';
    if (e.value is Map) {
      buf.writeln(
          '$innerPad"${e.key}": ${_prettyJson(Map<String, dynamic>.from(e.value as Map), indent + 1)}$comma');
    } else if (e.value is List) {
      buf.write('$innerPad"${e.key}": ');
      final list = e.value as List;
      if (list.isEmpty) {
        buf.writeln('[]$comma');
      } else {
        buf.writeln('[');
        for (var j = 0; j < list.length; j++) {
          final lc = j < list.length - 1 ? ',' : '';
          if (list[j] is Map) {
            buf.writeln(
                '${'  ' * (indent + 2)}${_prettyJson(Map<String, dynamic>.from(list[j] as Map), indent + 2)}$lc');
          } else {
            buf.writeln(
                '${'  ' * (indent + 2)}${list[j]}$lc');
          }
        }
        buf.writeln('$innerPad]$comma');
      }
    } else {
      buf.writeln('$innerPad"${e.key}": ${e.value}$comma');
    }
  }
  buf.write('$pad}');
  return buf.toString();
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final colors = {
      TaskBoardColumn.backlog: Colors.orange,
      TaskBoardColumn.todo: Colors.blue,
      TaskBoardColumn.inProgress: Colors.blue,
      TaskBoardColumn.done: Colors.green,
      TaskBoardColumn.failed: Colors.red,
      TaskBoardColumn.cancelled: Colors.grey,
    };
    final color = colors[status] ?? Colors.grey;
    return Chip(
      label: Text(status),
      backgroundColor: color.withOpacity(0.15),
      labelStyle: TextStyle(color: color, fontWeight: FontWeight.bold),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(color: Theme.of(context).hintColor),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

/// 确认点 —— 端脑在创建任务时生成的一组「需要确认的事」。
class _ConfirmationPointRow extends StatelessWidget {
  final int index;
  final String text;
  const _ConfirmationPointRow({required this.index, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.03),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_circle_outline,
              size: 18, color: Theme.of(context).primaryColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${index + 1}. $text',
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}