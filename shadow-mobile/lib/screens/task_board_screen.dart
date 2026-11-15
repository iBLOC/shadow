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
///
/// ⚠️ Pending 拆两列：**未确认** → 「待规划」(backlog)、**已确认** →
/// 「待办」(todo)。端脑只有 5 个状态、看板有 6 列 —— 「待办」没有对应的
/// 服务端状态，以前恒回 backlog ⇒ 这一列**永远是空的**。在只能「看」的
/// 看板上那只是浪费一列；有了**长按拖拽**之后就不行了：拖进「待办」⇒
/// 服务端存的是 Pending ⇒ boardColumnOf 恒回 backlog ⇒ 卡片当场弹回
/// 「待规划」⇒ 「放下了但没到那里」—— 失败长得像成功。
/// 拆分依据用 `confirmed`（卡片上本来就有「待确认」提示，确认过的任务
/// 端脑才会调度 ⇒ 它就是「待办」）。
String boardColumnOf(String telencephalonStatus, {bool confirmed = false}) {
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
      // Pending（含未知值）：确认过的进「待办」，没确认的留在「待规划」。
      return confirmed ? TaskBoardColumn.todo : TaskBoardColumn.backlog;
  }
}

/// 看板列 id → 本地化列名。
///
/// 看板列头、详情弹窗的状态 chip／概览行共用这一把尺 —— 别再把
/// `backlog` / `in-progress` 这类**机器 id** 直接上屏（那就是
/// 「界面漏英文」的产地）。
String localizedColumnTitle(AppLocalizations l10n, String columnId) {
  switch (columnId) {
    case TaskBoardColumn.todo:
      return l10n.taskStatusTodo;
    case TaskBoardColumn.inProgress:
      return l10n.taskStatusInProgress;
    case TaskBoardColumn.done:
      return l10n.taskStatusDone;
    case TaskBoardColumn.failed:
      return l10n.taskStatusFailed;
    case TaskBoardColumn.cancelled:
      return l10n.taskStatusCancelled;
    default:
      return l10n.taskStatusBacklog;
  }
}

/// 端脑状态 serde 变体名 → 本地化文案。编辑弹窗的状态下拉框用
///（下拉框的 value 仍是变体名 —— 发给端脑的还是它认得的形状）。
String localizedServerStatus(AppLocalizations l10n, String serverStatus) {
  switch (serverStatus) {
    case TelencephalonTaskStatus.inProgress:
      return l10n.taskStatusInProgress;
    case TelencephalonTaskStatus.completed:
      return l10n.taskStatusDone;
    case TelencephalonTaskStatus.overdue:
      return l10n.taskStatusFailed;
    case TelencephalonTaskStatus.cancelled:
      return l10n.taskStatusCancelled;
    default:
      return l10n.taskStatusBacklog;
  }
}

/// 优先级（小写词）→ 本地化文案。卡片、详情弹窗的 chip／概览行共用。
String localizedPriority(AppLocalizations l10n, String priority) {
  switch (priority.toLowerCase()) {
    case 'low':
      return l10n.priorityLow;
    case 'medium':
      return l10n.priorityMedium;
    case 'high':
      return l10n.priorityHigh;
    case 'urgent':
      return l10n.priorityUrgent;
    default:
      return priority;
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
    case 'inprogress':
    // ⚠️ 端脑 serde 变体名（'InProgress'）也要认得 —— 编辑弹窗的下拉框
    // 存的就是变体名，直接传进来。只认带连字符的写法时，把任务改成
    // 「进行中」会被这里的 default 吞成 Pending ⇒ 请求 200、下拉框显示
    // 你选的那项、库里存的却是另一个状态 —— 失败长得像成功。
    case 'running':
      return TelencephalonTaskStatus.inProgress;
    case 'done':
    case 'completed':
      return TelencephalonTaskStatus.completed;
    case 'failed':
    case 'overdue':
      // 同上 —— 'Overdue' 不认得就会被 default 吞成 Pending。
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
      status: boardColumnOf(rawStatus, confirmed: json['confirmed'] == true),
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
    status: boardColumnOf(t.status, confirmed: t.confirmed),
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
  /// 改任务 —— 标题 / 状态 / 优先级 / 截止时间。
  ///
  /// ⚠️ 端脑面 `POST /api/telencephalon/tasks/{id}/update`（2026-11-09 新增）
  /// ⇒ ⇒ 以前这里**只能改状态** ⇒ ⇒ 「对话里能改标题、界面上改不了」
  /// ⇒ ⇒ 两张面不齐 ⇒ ⇒ 今天补上。
  ///
  /// ⚠️ **一次请求改多个字段** ⇒ ⇒ 服务端「先全部解析、后动库」
  /// ⇒ ⇒ 有一个字段认不得 ⇒ ⇒ **一个字节都不改**（不是半改）。
  ///
  /// ⚠️ **描述与标签仍然改不了**（只在创建时写入）⇒ ⇒ 不开这两个输入框。
  Future<void> updateTask(
    String taskId, {
    String? status,
    String? title,
    String? priority,
  }) async {
    try {
      final updated = await _client.updateTask(
        taskId,
        status: serverStatusOf(status ?? TaskBoardColumn.backlog),
        title: title,
        priority: priority,
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
              onMoveTask: (task, targetColumnId) =>
                  _moveTask(context, ref, task, targetColumnId),
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

  /// 长按拖拽落列 —— 把任务挪到另一列（= 改端脑任务状态）。
  ///
  /// 原列放下 ＝ no-op（任务状态没变，不发请求）。
  /// 成功后 notifier 会拿服务端返回的任务就地替换 —— 卡片落在哪由
  /// **服务端真值**决定（比如未确认的任务拖进「待办」会落回「待规划」，
  /// 因为它还是 Pending ＋ confirmed:false）。
  /// 失败走 SnackBar（与详情弹窗同一惯例：`'$e'`）—— 卡片留在原列，
  /// notifier 自己会把 error 置上（顶部错误横幅也会亮）。
  Future<void> _moveTask(
    BuildContext context,
    WidgetRef ref,
    TaskInfo task,
    String targetColumnId,
  ) async {
    if (task.status == targetColumnId) return;
    // 在 await 之前把 messenger 拿到手 —— 异步间隙里不再摸 context
    //（use_build_context_synchronously）。
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await ref
          .read(tasksNotifierProvider.notifier)
          .updateTask(task.id, status: targetColumnId);
    } catch (e) {
      messenger?.showSnackBar(SnackBar(content: Text('$e')));
    }
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

  /// 长按拖拽落列 —— 把卡片挪进本列（＝ 改端脑任务状态）。
  /// 「原列放下算不算 no-op」由页面侧的 _moveTask 判，这里不重复判。
  final void Function(TaskInfo task, String targetColumnId) onMoveTask;

  const _KanbanColumn({
    required this.column,
    required this.tasks,
    required this.onAddTask,
    required this.onTaskTap,
    required this.onMoveTask,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // 整列（表头＋卡片列表＋加号）都是一个 DragTarget —— 落点面积越大，
    // 手机上越容易松手松准。有卡片悬在列上时用列色描边，告诉用户
    // 「松手就落到这一列」。
    return DragTarget<TaskInfo>(
      onWillAcceptWithDetails: (details) => true,
      onAcceptWithDetails: (details) => onMoveTask(details.data, column.id),
      builder: (context, candidate, _) {
        final hovering = candidate.isNotEmpty;
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
                color: hovering
                    ? column.color
                    : (isDark
                        ? AppColors.darkBorder
                        : AppColors.lightBorder),
                width: hovering ? 2 : 1,
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
      },
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
      // 长按（默认 kLongPressTimeout ≈ 500ms，平台标准 long-press 时长）
      // 起拖 —— 拖到别的列松手 ＝ 改端脑任务状态。轻点仍是打开详情：
      // tap 识别器与拖拽识别器在同一个手势竞技场里，快速点按 tap 赢、
      // 按住不动 long-press 赢，两种意图互不干扰。
      child: LongPressDraggable<TaskInfo>(
        data: task,
        // 拖动时跟着手指走的浮卡。feedback 在 Overlay 里渲染 ——
        // 自己包透明 Material，文字着色与墨水才有依归。
        feedback: _TaskDragCard(task: task),
        // 原位留一张半透明的 —— 看得出「这张卡被拿起来了」。
        childWhenDragging: Opacity(
          opacity: 0.4,
          child: _buildCardBody(context, l10n),
        ),
        child: _buildCardBody(context, l10n),
      ),
    );
  }

  Widget _buildCardBody(BuildContext context, AppLocalizations l10n) {
    return GlassCard(
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
                  Text(
                    localizedPriority(l10n, task.priority),
                    style: const TextStyle(fontSize: 12),
                  ),
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

/// 拖拽时跟着手指走的浮卡。
///
/// 不复用 [GlassCard]：它带 BackdropFilter，在 Overlay 里对着一小块
/// 实时再模糊没必要；这里用一张带投影的实色小卡，宽 240（280 宽的列里
/// 卡片几乎占满，收窄一点才分得清「拖着的」与「原位的」），微倾 3 度。
class _TaskDragCard extends StatelessWidget {
  final TaskInfo task;

  const _TaskDragCard({required this.task});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Transform.rotate(
      angle: -0.05,
      child: Material(
        elevation: 8,
        borderRadius: BorderRadius.circular(12),
        shadowColor: Colors.black.withValues(alpha: 0.4),
        color: isDark ? AppColors.darkSurfaceGlass : AppColors.lightSurfaceGlass,
        child: SizedBox(
          width: 240,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  Icons.drag_indicator,
                  size: 16,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    task.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
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
