import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/telencephalon_provider.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../widgets/task_detail_dialog.dart';
import '../widgets/responsive.dart';
import '../generated/l10n/app_localizations.dart';

/// 任务看板的数据源是**端脑**（temporal lobe 的 `TaskStore`）。
///
/// ⚠️ 这里以前走的是 `PrefrontalClient.getTasks()` —— 前额叶方言的
/// `/hippocampus/api/tasks`。那条路在手机上**必然失败**，两个原因叠在
/// 一起：
/// 1. `PrefrontalClient` 的 baseUrl 恒为 `http://localhost:60080` ——
///    那是**桌面 sidecar** 的端口，手机上没人监听；
/// 2. 移动端**不编本地海马体**（记忆走零信任网络上的 hippocampus），
///    而嵌入式大脑挂的那条面是纯端脑方言（`cortex_router`），
///    `/hippocampus/api/*` 一条路由都没有。
///
/// 现在改走端脑方言（`/api/telencephalon/tasks`）—— 与嵌入式大脑是
/// 同一套端脑、同一份任务存储。
final tasksNotifierProvider = StateNotifierProvider<TasksNotifier, TasksState>((
  ref,
) {
  return TasksNotifier(ref.watch(telencephalonClientProvider));
});

/// 看板列 id（UI 侧）。
///
/// 端脑的任务状态只有 5 个（`Pending` / `InProgress` / `Completed` /
/// `Cancelled` / `Overdue`），看板是 6 列 —— 多出来的两列由 Pending 与
/// Overdue 承载。
class TaskBoardColumn {
  const TaskBoardColumn._();

  static const backlog = 'backlog';
  static const todo = 'todo';
  static const inProgress = 'in-progress';
  static const done = 'done';
  static const failed = 'failed';
  static const cancelled = 'cancelled';
}

/// 端脑 `TaskStatus` → 看板列 id。
String boardColumnOf(String telencephalonStatus) {
  switch (telencephalonStatus) {
    case 'InProgress':
      return TaskBoardColumn.inProgress;
    case 'Completed':
      return TaskBoardColumn.done;
    case 'Cancelled':
      return TaskBoardColumn.cancelled;
    case 'Overdue':
      // 端脑没有 Failed 状态 —— 「逾期」是它唯一的「有问题」状态。
      return TaskBoardColumn.failed;
    default:
      // Pending（含未知值）→ 待规划。
      return TaskBoardColumn.backlog;
  }
}

/// 看板列 id → 端脑 `TaskStatus`（写回服务端时用）。
///
/// ⚠️ 发给服务端的是 serde 的**变体名**（PascalCase）—— 发小写会被
/// serde 直接拒掉（400）。
String serverStatusOf(String uiStatus) {
  switch (uiStatus.toLowerCase()) {
    case 'in-progress':
    case 'in_progress':
    case 'running':
      return TelencephalonTaskStatus.inProgress;
    case 'done':
    case 'completed':
      return TelencephalonTaskStatus.completed;
    case 'failed':
      return TelencephalonTaskStatus.overdue;
    case 'cancelled':
    case 'canceled':
      return TelencephalonTaskStatus.cancelled;
    default:
      return TelencephalonTaskStatus.pending;
  }
}

class TasksState {
  final List<TaskInfo> tasks;
  final bool isLoading;
  final String? error;

  const TasksState({this.tasks = const [], this.isLoading = false, this.error});

  TasksState copyWith({
    List<TaskInfo>? tasks,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return TasksState(
      tasks: tasks ?? this.tasks,
      isLoading: isLoading ?? this.isLoading,
      // 错误默认保留：只有显式 clearError 或给出新错误时才变。
      // 之前的写法 `error: error` 会让任何一次 copyWith 把错误抹掉，
      // 界面上根本来不及显示。
      error: clearError ? null : (error ?? this.error),
    );
  }

  List<TaskInfo> byStatus(String status) =>
      tasks.where((t) => t.status == status).toList();
}

enum TaskStatus { pending, todo, inProgress, done }

/// 看板上一条任务。
///
/// 数据来自端脑的 `TaskStore`，**不是**海马体的 `TaskRecord` —— 所以：
/// - 没有「子步骤」：那是海马体 `TaskRecord.steps` 的概念。端脑这边对应
///   的是**确认点**（`confirmation_points`）与**截止时间**（`due_time`）；
/// - 描述与标题端脑**真的存得住**（海马体那边存不住，upsert 会丢弃）。
class TaskInfo {
  final String id;
  final String title;

  /// 看板列 id（`backlog` / `in-progress` / `done` / ...）。
  final String status;

  /// 小写：`low` / `medium` / `high` / `urgent`。
  final String priority;
  final String? description;
  final List<String> tags;
  final DateTime createdAt;
  final DateTime? completedAt;

  /// 截止时间。端脑据此排程。
  final DateTime? dueTime;

  /// 用户是否确认过这条任务（只有确认过的任务才会被调度）。
  final bool confirmed;

  /// 端脑生成的确认点。
  final List<String> confirmationPoints;

  TaskInfo({
    required this.id,
    required this.title,
    required this.status,
    this.priority = 'medium',
    this.description,
    this.tags = const [],
    required this.createdAt,
    this.completedAt,
    this.dueTime,
    this.confirmed = false,
    this.confirmationPoints = const [],
  });

  factory TaskInfo.fromJson(Map<String, dynamic> json) {
    DateTime? ts(Object? raw) =>
        raw == null ? null : DateTime.tryParse(raw.toString());

    List<String> strings(Object? raw) =>
        raw is List ? raw.map((e) => e.toString()).toList() : const <String>[];

    final rawStatus = (json['status'] ?? 'Pending').toString();
    return TaskInfo(
      id: (json['taskId'] ?? json['task_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      status: boardColumnOf(rawStatus),
      priority: (json['priority'] ?? 'medium').toString().toLowerCase(),
      description: json['description'] as String?,
      tags: strings(json['tags']),
      createdAt:
          ts(json['created_at']) ?? ts(json['received_at']) ?? DateTime.now(),
      completedAt: ts(json['completed_at']),
      dueTime: ts(json['due_time']),
      confirmed: json['confirmed'] == true,
      confirmationPoints: strings(json['confirmation_points']),
    );
  }
}

class TasksNotifier extends StateNotifier<TasksState> {
  final TelencephalonClient _client;

  TasksNotifier(this._client) : super(const TasksState()) {
    loadTasks();
  }

  Future<void> loadTasks() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final tasks = await _client.listTasks();
      state = state.copyWith(
        tasks: tasks.map(_toTaskInfo).toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 端脑任务 → 看板任务。
  TaskInfo _toTaskInfo(TelencephalonTask t) => TaskInfo(
    id: t.id,
    // 端脑的 title 是必填的，但老数据可能是空串 —— 退回 id，
    // 免得列表里出现空标题。
    title: t.title.trim().isEmpty ? t.id : t.title,
    status: boardColumnOf(t.status),
    priority: t.priority.toLowerCase(),
    description: t.description,
    tags: t.tags,
    createdAt: t.createdAt ?? DateTime.now(),
    // 端脑没有 completed_at 列 —— 完成时间用最后更新时间近似。
    completedAt: t.status == TelencephalonTaskStatus.completed
        ? t.updatedAt
        : null,
    dueTime: t.dueTime,
    confirmed: t.confirmed,
    confirmationPoints: t.confirmationPoints,
  );

  /// 重新拉一次任务并就地更新列表。
  ///
  /// 端脑**没有**「按 id 取单条」的 HTTP 端点（`/api/telencephalon/tasks/{id}`
  /// 只挂了 DELETE）⇒ 只能重拉全量，再从里面挑出这条。
  Future<void> reloadTask(String taskId) async {
    try {
      final all = (await _client.listTasks()).map(_toTaskInfo).toList();
      TaskInfo? found;
      for (final t in all) {
        if (t.id == taskId) {
          found = t;
          break;
        }
      }
      if (found == null) return;
      final updated = found;
      state = state.copyWith(
        tasks: state.tasks.map((t) => (t.id == taskId ? updated : t)).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// 改任务状态。
  ///
  /// 端脑的**状态是随时可改的**（`POST /api/telencephalon/tasks/{id}/status`）——
  /// 这是它唯一支持「事后修改」的字段。标题 / 描述 / 优先级 / 标签都改不了：
  /// 描述与标签只在创建时写入，标题与优先级只有**待确认**的任务能通过
  /// 「确认」端点顺带改（见 [confirmTask]）。
  Future<void> updateTask(String taskId, {String? status}) async {
    try {
      final updated = await _client.updateTaskStatus(
        taskId,
        serverStatusOf(status ?? TaskBoardColumn.backlog),
      );
      final info = _toTaskInfo(updated);
      state = state.copyWith(
        tasks: state.tasks.map((t) => (t.id == taskId ? info : t)).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// 确认一条任务（端脑的核心动作）。
  ///
  /// **只有 `Pending` 的任务能确认** —— 服务端在别的状态上会回 400
  /// （`only Pending tasks are confirmable`）。确认之后端脑才会调度它。
  Future<void> confirmTask(String taskId) async {
    try {
      final updated = await _client.confirmTask(taskId, confirmed: true);
      final info = _toTaskInfo(updated);
      state = state.copyWith(
        tasks: state.tasks.map((t) => (t.id == taskId ? info : t)).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// 删除任务，并从本地列表移除。
  Future<void> deleteTask(String taskId) async {
    try {
      await _client.deleteTask(taskId);
      state = state.copyWith(
        tasks: state.tasks.where((t) => t.id != taskId).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// 新建端脑任务。
  ///
  /// 任务 id 由端脑自己分配（`task-1` / `task-2` ...），标题与优先级
  /// 走端脑的正式字段 —— 不再需要像海马体那样把标题塞进 `payload`。
  /// [dueTime] 是自由文本（ISO8601 或「明天下午3点」这类中文相对时间），
  /// 端脑解析不了会回 400。
  ///
  /// [column] 是**从哪一列加的**。端脑新建出来的任务一律是 `Pending`，
  /// 所以在别的列上加任务时，建完再把状态挪过去 —— 否则点了「已完成」
  /// 那列的「+」，任务却落到「待规划」里。
  Future<void> createTask(
    String title,
    String priority, {
    String? dueTime,
    String? description,
    String? column,
  }) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final created = await _client.createTask(
        title: title,
        priority: priority,
        dueTime: dueTime,
        description: description,
      );
      final target = column == null ? null : serverStatusOf(column);
      if (target != null && target != TelencephalonTaskStatus.pending) {
        await _client.updateTaskStatus(created.id, target);
      }
      await loadTasks();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

class TaskBoardScreen extends ConsumerWidget {
  const TaskBoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasksState = ref.watch(tasksNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(AppLocalizations.of(context)!.taskBoardTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(tasksNotifierProvider.notifier).loadTasks(),
          ),
        ],
      ),
      body: Column(
        children: [
          if (tasksState.error != null)
            _TaskErrorBanner(
              message: tasksState.error!,
              onRetry: () =>
                  ref.read(tasksNotifierProvider.notifier).loadTasks(),
            ),
          Expanded(
            child: tasksState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildKanbanBoard(context, ref, tasksState),
          ),
        ],
      ),
    );
  }

  Widget _buildKanbanBoard(
    BuildContext context,
    WidgetRef ref,
    TasksState state,
  ) {
    final columns = [
      _ColumnConfig(
        id: TaskBoardColumn.backlog,
        title: AppLocalizations.of(context)!.taskStatusBacklog,
        color: AppColors.darkTextSecondary,
      ),
      _ColumnConfig(
        id: TaskBoardColumn.todo,
        title: AppLocalizations.of(context)!.taskStatusTodo,
        color: AppColors.primary,
      ),
      _ColumnConfig(
        id: TaskBoardColumn.inProgress,
        title: AppLocalizations.of(context)!.taskStatusInProgress,
        color: AppColors.warning,
      ),
      _ColumnConfig(
        id: TaskBoardColumn.done,
        title: AppLocalizations.of(context)!.taskStatusDone,
        color: AppColors.success,
      ),
      // 端脑的 TaskStatus 里的「逾期」与「已取消」也要有列 ——
      // 少了这两列，这些任务在看板上就完全看不见了。
      _ColumnConfig(
        id: TaskBoardColumn.failed,
        title: AppLocalizations.of(context)!.taskStatusFailed,
        color: AppColors.error,
      ),
      _ColumnConfig(
        id: TaskBoardColumn.cancelled,
        title: AppLocalizations.of(context)!.taskStatusCancelled,
        color: AppColors.darkTextSecondary,
      ),
    ];

    // 折叠屏展开后整板限宽居中（与聊天同一形状）—— 列仍 280 宽、
    // 内部横滚：700dp 展开屏可见约 2.3 列，比拉满整屏好看。
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kContentMaxWidth),
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(16),
          itemCount: columns.length,
          itemBuilder: (context, index) {
            final column = columns[index];
            final columnTasks = state.byStatus(column.id);
            return _KanbanColumn(
              column: column,
              tasks: columnTasks,
              onAddTask: () => _showAddTaskDialog(context, ref, column.id),
              onTaskTap: (task) => _openTaskDetail(context, task),
            );
          },
        ),
      ),
    );
  }

  /// 打开任务详情弹窗。弹窗内可以刷新、看确认点、确认、编辑和删除。
  void _openTaskDetail(BuildContext context, TaskInfo task) {
    showDialog(
      context: context,
      builder: (_) => TaskDetailDialog(task: task),
    );
  }

  void _showAddTaskDialog(
    BuildContext context,
    WidgetRef ref,
    String columnId,
  ) {
    showDialog(
      context: context,
      builder: (context) => _AddTaskDialog(
        onAdd: (title, priority, dueTime) {
          ref
              .read(tasksNotifierProvider.notifier)
              .createTask(title, priority, dueTime: dueTime, column: columnId);
        },
      ),
    );
  }
}

class _ColumnConfig {
  final String id;
  final String title;
  final Color color;

  _ColumnConfig({required this.id, required this.title, required this.color});
}

/// 任务读取失败提示。之前的错误只进了 state，从不显示 —— 用户只看到
/// 一块空看板，不知道是后端没连上还是真的没有任务。
class _TaskErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _TaskErrorBanner({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: AppColors.error, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AppColors.error, fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: Text(AppLocalizations.of(context)!.taskRetry),
          ),
        ],
      ),
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  final _ColumnConfig column;
  final List<TaskInfo> tasks;
  final VoidCallback onAddTask;
  final ValueChanged<TaskInfo> onTaskTap;

  const _KanbanColumn({
    required this.column,
    required this.tasks,
    required this.onAddTask,
    required this.onTaskTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: 280,
      margin: const EdgeInsets.only(right: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            decoration: BoxDecoration(
              color: isDark
                  ? AppColors.darkSurfaceGlass
                  : AppColors.lightSurfaceGlass,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: column.color, width: 3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(
                        column.title,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: column.color,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${tasks.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: tasks.isEmpty
                      ? Center(
                          child: Text(
                            AppLocalizations.of(context)!.taskEmpty,
                            style: TextStyle(
                              color: isDark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.lightTextSecondary,
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(8),
                          itemCount: tasks.length,
                          itemBuilder: (context, index) {
                            final task = tasks[index];
                            return _TaskCard(
                              task: task,
                              onTap: () => onTaskTap(task),
                            );
                          },
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: TextButton.icon(
                    onPressed: onAddTask,
                    icon: const Icon(Icons.add),
                    label: Text(AppLocalizations.of(context)!.taskAdd),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  final TaskInfo task;
  final VoidCallback onTap;

  const _TaskCard({required this.task, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.all(12),
        margin: EdgeInsets.zero,
        child: ListTile(
          contentPadding: EdgeInsets.zero,
          onTap: onTap,
          title: Text(task.title),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _getPriorityColor(task.priority),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(task.priority, style: const TextStyle(fontSize: 12)),
                  if (task.dueTime != null) ...[
                    const SizedBox(width: 8),
                    Icon(
                      Icons.schedule,
                      size: 12,
                      color: Theme.of(context).hintColor,
                    ),
                    const SizedBox(width: 2),
                    // 截止时间可能很长（ISO 时间戳）⇒ 让它可压缩，
                    // 不然 280 宽的列会被撑爆（RenderFlex overflow）。
                    Flexible(
                      child: Text(
                        _fmtShortDate(task.dueTime!),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).hintColor,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              if (!task.confirmed) ...[
                const SizedBox(height: 6),
                Text(
                  l10n.taskAwaitingConfirm,
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).hintColor,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return AppColors.error;
      case 'high':
        return AppColors.warning;
      case 'medium':
        return AppColors.primary;
      case 'low':
        return AppColors.success;
      default:
        return AppColors.darkTextSecondary;
    }
  }
}

/// 短日期：`2026-10-30 15:04`。
String _fmtShortDate(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
}

class _AddTaskDialog extends StatefulWidget {
  final Function(String title, String priority, String? dueTime) onAdd;

  const _AddTaskDialog({required this.onAdd});

  @override
  State<_AddTaskDialog> createState() => _AddTaskDialogState();
}

class _AddTaskDialogState extends State<_AddTaskDialog> {
  final _titleController = TextEditingController();
  final _dueTimeController = TextEditingController();
  String _priority = 'medium';

  @override
  void dispose() {
    _titleController.dispose();
    _dueTimeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Text(l10n.taskAdd),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: InputDecoration(
              labelText: l10n.taskTitleField,
              border: OutlineInputBorder(),
            ),
            autofocus: true,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: InputDecoration(
              labelText: l10n.taskPriority,
              border: OutlineInputBorder(),
            ),
            items: [
              DropdownMenuItem(value: 'low', child: Text(l10n.priorityLow)),
              DropdownMenuItem(
                value: 'medium',
                child: Text(l10n.priorityMedium),
              ),
              DropdownMenuItem(value: 'high', child: Text(l10n.priorityHigh)),
              DropdownMenuItem(
                value: 'urgent',
                child: Text(l10n.priorityUrgent),
              ),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _priority = value);
            },
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _dueTimeController,
            decoration: InputDecoration(
              labelText: l10n.taskDueTimeField,
              border: OutlineInputBorder(),
              helperText: l10n.taskDueTimeHint,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        FilledButton(
          onPressed: () {
            if (_titleController.text.isNotEmpty) {
              final due = _dueTimeController.text.trim();
              widget.onAdd(
                _titleController.text,
                _priority,
                due.isEmpty ? null : due,
              );
              Navigator.pop(context);
            }
          },
          child: Text(l10n.commonAdd),
        ),
      ],
    );
  }
}
