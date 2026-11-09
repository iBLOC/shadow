import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../screens/task_board_screen.dart';
import '../generated/l10n/app_localizations.dart';

/// 任务编辑弹窗。
///
/// 端脑的任务**不是所有字段都能改**，这个弹窗只开放它真能持久化的：
/// - **标题 / 状态 / 优先级 / 截止时间** → `POST /api/telencephalon/tasks/{id}/update`
///   （2026-11-09 新增 ⇒ ⇒ 以前只能改状态 ⇒ ⇒ 「对话里能改标题、界面上
///   改不了」那张面今天补上 ⇒ ⇒ 且**服务端与对话面同一个落库函数**）；
/// - **描述 / 标签** → **仍然没有更新端点**，只在**创建**时写入。
///
/// （以前这个弹窗开放的是「状态 + 标签」，那是海马体方言的形状 ——
/// 海马体的 `TaskRecord` 没有 title / description / priority 列，upsert
/// 会直接丢弃它们。端脑这边换成了「真的存得住」的那一组字段。）
class TaskEditDialog extends ConsumerStatefulWidget {
  final TaskInfo task;
  const TaskEditDialog({super.key, required this.task});

  @override
  ConsumerState<TaskEditDialog> createState() => _TaskEditDialogState();
}

class _TaskEditDialogState extends ConsumerState<TaskEditDialog> {
  late String _status;
  late String _title;
  late String _priority;
  final _titleController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  /// 端脑 `TaskStatus` 的线上取值（serde 变体名，PascalCase）。
  ///
  /// 发小写会被 serde 直接拒掉（400）。
  static const _statuses = [
    'Pending',
    'InProgress',
    'Completed',
    'Cancelled',
    'Overdue',
  ];

  @override
  void initState() {
    super.initState();
    // 看板用的是 UI 列 id（backlog / in-progress / done ...），
    // 下拉框列的是端脑的状态，先换算再作为初值，否则 Dropdown 会因为
    // 找不到匹配的 item 直接断言失败。
    _status = serverStatusOf(widget.task.status);
    _title = widget.task.title;
    _titleController.text = _title;
    // 端脑回的是 serde 变体名（`High`），下拉框列的是小写（`high`）
    // ⇒ ⇒ 先换算，否则 Dropdown 会因为找不到匹配的 item 断言失败。
    _priority = widget.task.priority.toLowerCase();
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      // ⚠️ **一次请求改多个字段** ⇒ ⇒ 端脑那边「先全部解析、后动库」
      // ⇒ ⇒ 有一个字段认不得 ⇒ ⇒ **一个字节都不改**（不是半改）。
      await ref.read(tasksNotifierProvider.notifier).updateTask(
            widget.task.id,
            title: _title,
            status: _status,
            priority: _priority,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
        });
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Text(l10n.taskEditTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.task.id,
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                labelText: l10n.taskTitleField,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _priority,
              decoration: InputDecoration(
                labelText: l10n.taskPriority,
                border: OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: 'low', child: Text(l10n.priorityLow)),
                DropdownMenuItem(value: 'medium', child: Text(l10n.priorityMedium)),
                DropdownMenuItem(value: 'high', child: Text(l10n.priorityHigh)),
                DropdownMenuItem(value: 'urgent', child: Text(l10n.priorityUrgent)),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _priority = v);
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _status,
              decoration: InputDecoration(
                labelText: l10n.taskStatus,
                border: OutlineInputBorder(),
              ),
              items: _statuses
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _status = v);
              },
            ),
            const SizedBox(height: 12),
            Text(
              l10n.taskEditPersistenceNote,
              style: TextStyle(fontSize: 11, color: Theme.of(context).hintColor),
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting ? null : () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        FilledButton(
          onPressed: _isSubmitting ? null : _submit,
          child: _isSubmitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.commonSave),
        ),
      ],
    );
  }
}
