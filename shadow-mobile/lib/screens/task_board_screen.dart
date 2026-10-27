import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';

final tasksNotifierProvider = StateNotifierProvider<TasksNotifier, TasksState>((
  ref,
) {
  return TasksNotifier(ref.watch(prefrontalClientProvider));
});

class TasksState {
  final List<TaskInfo> tasks;
  final bool isLoading;
  final String? error;

  const TasksState({this.tasks = const [], this.isLoading = false, this.error});

  TasksState copyWith({List<TaskInfo>? tasks, bool? isLoading, String? error}) {
    return TasksState(
      tasks: tasks ?? this.tasks,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }

  List<TaskInfo> byStatus(String status) =>
      tasks.where((t) => t.status == status).toList();
}

enum TaskStatus { pending, todo, inProgress, done }

/// 子任务（步骤）。对应 hippocampus `TaskRecord.steps` 里的一个
/// `TaskStep` —— 后端以 camelCase 序列化（stepId / startedAt / ...）。
class SubTaskStep {
  final String stepId;
  final int order;
  final String status;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? error;

  SubTaskStep({
    required this.stepId,
    this.order = 0,
    this.status = 'pending',
    this.startedAt,
    this.completedAt,
    this.error,
  });

  factory SubTaskStep.fromJson(Map<String, dynamic> json) {
    DateTime? parse(String camel, String snake) {
      final raw = json[camel] ?? json[snake];
      if (raw == null) return null;
      return DateTime.tryParse(raw.toString());
    }

    return SubTaskStep(
      stepId: (json['stepId'] ?? json['step_id'] ?? '').toString(),
      order: (json['order'] as num?)?.toInt() ?? 0,
      status: (json['status'] ?? 'pending').toString(),
      startedAt: parse('startedAt', 'started_at'),
      completedAt: parse('completedAt', 'completed_at'),
      error: json['error'] as String?,
    );
  }
}

class TaskInfo {
  final String id;
  final String title;
  final String status;
  final String priority;
  final String? description;
  final List<String> tags;
  final List<SubTaskStep> steps;
  final DateTime createdAt;
  final DateTime? completedAt;

  TaskInfo({
    required this.id,
    required this.title,
    required this.status,
    this.priority = 'medium',
    this.description,
    this.tags = const [],
    this.steps = const [],
    required this.createdAt,
    this.completedAt,
  });

  factory TaskInfo.fromJson(Map<String, dynamic> json) {
    final rawSteps = json['steps'];
    return TaskInfo(
      id: (json['taskId'] ?? json['task_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      status: (json['status'] ?? 'pending').toString(),
      priority: (json['priority'] ?? 'medium').toString(),
      description: json['description'] as String?,
      tags: json['tags'] is List
          ? (json['tags'] as List).map((e) => e.toString()).toList()
          : const <String>[],
      steps: rawSteps is List
          ? rawSteps
              .whereType<Map<String, dynamic>>()
              .map(SubTaskStep.fromJson)
              .toList()
          : const <SubTaskStep>[],
      createdAt: DateTime.tryParse(
                (json['receivedAt'] ??
                        json['received_at'] ??
                        json['created_at'] ??
                        '')
                    .toString(),
              ) ??
          DateTime.now(),
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'].toString())
          : (json['completed_at'] != null
              ? DateTime.tryParse(json['completed_at'].toString())
              : null),
    );
  }
}

class TasksNotifier extends StateNotifier<TasksState> {
  final PrefrontalClient _client;

  TasksNotifier(this._client) : super(const TasksState()) {
    loadTasks();
  }

  Future<void> loadTasks() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final tasks = await _client.getTasks();
      state = state.copyWith(
        tasks: tasks.map(_toTaskInfo).toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// TaskResponse -> TaskInfo。保留 hippocampus 的 taskId / receivedAt
  /// 命名，并把子步骤 DAG 一并带过来。
  TaskInfo _toTaskInfo(TaskResponse t) => TaskInfo(
        id: t.id,
        title: t.title,
        status: _mapStatus(t.status),
        priority: t.priority ?? 'medium',
        description: t.description,
        tags: t.tags,
        steps: t.steps
            .map(
              (s) => SubTaskStep(
                stepId: s.stepId,
                order: s.order,
                status: s.status,
                startedAt: s.startedAt,
                completedAt: s.completedAt,
                error: s.error,
              ),
            )
            .toList(),
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      );

  /// 重新拉取单个任务并就地更新列表。
  Future<void> reloadTask(String taskId) async {
    try {
      final updated = await _client.getTask(taskId);
      final info = _toTaskInfo(updated);
      state = state.copyWith(
        tasks: state.tasks.map((t) => (t.id == taskId ? info : t)).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// 更新任务字段。
  ///
  /// title / description / priority 是仅前端字段 —— hippocampus 的
  /// TaskRecord 没有这些列，upsert 会丢弃它们（与桌面端
  /// `prefrontalClient.updateTask` 行为一致）。
  Future<void> updateTask(
    String taskId, {
    String? title,
    String? description,
    String? priority,
    String? status,
    List<String>? tags,
  }) async {
    try {
      final updated = await _client.updateTask(
        taskId,
        title: title,
        description: description,
        priority: priority,
        status: status == null ? null : _serverStatus(status),
        tags: tags,
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

  Future<void> createTask(String title, String priority) async {
    try {
      await _client.createTask(
        CreateTaskRequest(title: title, priority: priority),
      );
      await loadTasks();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  String _mapStatus(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'backlog':
        return 'backlog';
      case 'todo':
        return 'todo';
      case 'in_progress':
      case 'in-progress':
      case 'running':
        return 'in-progress';
      case 'done':
      case 'completed':
        return 'done';
      case 'failed':
        return 'failed';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      default:
        return 'backlog';
    }
  }

  /// UI 状态 -> hippocampus `TaskStatus` 的线上取值。
  /// 服务端只认 pending / running / completed / failed / cancelled，
  /// 直接把 UI 的 'in-progress' 发过去会被 serde 拒绝。
  String _serverStatus(String uiStatus) {
    switch (uiStatus.toLowerCase()) {
      case 'todo':
      case 'backlog':
      case 'pending':
        return 'pending';
      case 'in-progress':
      case 'in_progress':
      case 'running':
        return 'running';
      case 'done':
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      default:
        return 'pending';
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
        title: const Text('任务看板'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(tasksNotifierProvider.notifier).loadTasks(),
          ),
        ],
      ),
      body: tasksState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildKanbanBoard(context, ref, tasksState),
    );
  }

  Widget _buildKanbanBoard(
    BuildContext context,
    WidgetRef ref,
    TasksState state,
  ) {
    final columns = [
      _ColumnConfig(
        id: 'backlog',
        title: '待办',
        color: AppColors.darkTextSecondary,
      ),
      _ColumnConfig(id: 'todo', title: 'To Do', color: AppColors.primary),
      _ColumnConfig(id: 'in-progress', title: '进行中', color: AppColors.warning),
      _ColumnConfig(id: 'done', title: '已完成', color: AppColors.success),
    ];

    return ListView.builder(
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
        );
      },
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
        onAdd: (title, priority) {
          ref.read(tasksNotifierProvider.notifier).createTask(title, priority);
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

class _KanbanColumn extends StatelessWidget {
  final _ColumnConfig column;
  final List<TaskInfo> tasks;
  final VoidCallback onAddTask;

  const _KanbanColumn({
    required this.column,
    required this.tasks,
    required this.onAddTask,
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
                            '暂无任务',
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
                            return _TaskCard(task: task);
                          },
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: TextButton.icon(
                    onPressed: onAddTask,
                    icon: const Icon(Icons.add),
                    label: const Text('添加任务'),
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

  const _TaskCard({required this.task});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.all(12),
        margin: EdgeInsets.zero,
        child: ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(task.title),
          subtitle: Row(
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

class _AddTaskDialog extends StatefulWidget {
  final Function(String title, String priority) onAdd;

  const _AddTaskDialog({required this.onAdd});

  @override
  State<_AddTaskDialog> createState() => _AddTaskDialogState();
}

class _AddTaskDialogState extends State<_AddTaskDialog> {
  final _titleController = TextEditingController();
  String _priority = 'medium';

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加任务'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(
              labelText: '任务标题',
              border: OutlineInputBorder(),
            ),
            autofocus: true,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(
              labelText: '优先级',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'low', child: Text('低')),
              DropdownMenuItem(value: 'medium', child: Text('中')),
              DropdownMenuItem(value: 'high', child: Text('高')),
              DropdownMenuItem(value: 'urgent', child: Text('紧急')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _priority = value);
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () {
            if (_titleController.text.isNotEmpty) {
              widget.onAdd(_titleController.text, _priority);
              Navigator.pop(context);
            }
          },
          child: const Text('添加'),
        ),
      ],
    );
  }
}
