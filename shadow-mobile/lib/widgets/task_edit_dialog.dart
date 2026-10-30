import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../screens/task_board_screen.dart';
import '../generated/l10n/app_localizations.dart';

/// 任务编辑弹窗。
///
/// 端脑的任务**不是所有字段都能改**，这个弹窗只开放它真能持久化的：
/// - **状态** → `POST /api/telencephalon/tasks/{id}/status`，随时可改；
/// - 标题 / 描述 / 优先级 / 标签 → **没有更新端点**。标题与优先级只有
///   「待确认」的任务能靠确认端点顺带改（而且那会把任务标记成已确认），
///   描述与标签只在**创建**时写入。
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
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      await ref.read(tasksNotifierProvider.notifier).updateTask(
            widget.task.id,
            status: _status,
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
              widget.task.title,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 2),
            Text(
              widget.task.id,
              style: const TextStyle(fontSize: 11, color: Colors.grey),
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
