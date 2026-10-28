import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../screens/task_board_screen.dart';

/// 任务编辑弹窗。
///
/// 只开放 hippocampus 真正持久化的字段（状态 / 标签）：`TaskRecord`
/// 没有 title / description / priority 列，upsert 会直接丢弃它们。
/// 客户端建任务时把标题写进了 `payload`，那才是能存下来的位置。
class TaskEditDialog extends ConsumerStatefulWidget {
  final TaskInfo task;
  const TaskEditDialog({super.key, required this.task});

  @override
  ConsumerState<TaskEditDialog> createState() => _TaskEditDialogState();
}

class _TaskEditDialogState extends ConsumerState<TaskEditDialog> {
  late TextEditingController _tagsController;
  late String _status;
  bool _isSubmitting = false;
  String? _errorMessage;

  /// 后端 `TaskStatus` 的取值集合。
  static const _statuses = [
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
  ];

  @override
  void initState() {
    super.initState();
    _tagsController = TextEditingController(text: widget.task.tags.join(', '));
    // 看板用的是 UI 状态（backlog / in-progress / done ...），
    // 下拉框列的是后端状态，先换算再作为初值，否则 Dropdown 会因为
    // 找不到匹配的 item 直接断言失败。
    _status = serverStatusOf(widget.task.status);
  }

  @override
  void dispose() {
    _tagsController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      final tags = _tagsController.text
          .split(',')
          .map((t) => t.trim())
          .where((t) => t.isNotEmpty)
          .toList();
      await ref.read(tasksNotifierProvider.notifier).updateTask(
            widget.task.id,
            status: _status,
            tags: tags,
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
    return AlertDialog(
      title: const Text('编辑任务'),
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
              decoration: const InputDecoration(
                labelText: '状态',
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
            TextField(
              controller: _tagsController,
              decoration: const InputDecoration(
                labelText: '标签 (逗号分隔)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'hippocampus 只持久化状态与标签，标题与描述没有对应列，不会保存。',
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
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _isSubmitting ? null : _submit,
          child: _isSubmitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('保存'),
        ),
      ],
    );
  }
}
