import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../widgets/glass_card.dart';
import '../theme/app_colors.dart';

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

class TaskInfo {
  final String id;
  final String title;
  final String status;
  final String priority;
  final DateTime createdAt;
  final DateTime? completedAt;

  TaskInfo({
    required this.id,
    required this.title,
    required this.status,
    this.priority = 'medium',
    required this.createdAt,
    this.completedAt,
  });

  factory TaskInfo.fromJson(Map<String, dynamic> json) {
    return TaskInfo(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      status: json['status'] ?? 'pending',
      priority: json['priority'] ?? 'medium',
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'])
          : null,
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
        tasks: tasks
            .map(
              (t) => TaskInfo.fromJson({
                'id': t.id,
                'title': t.title,
                'status': _mapStatus(t.status),
                'priority': t.priority ?? 'medium',
                'created_at': t.createdAt.toIso8601String(),
                'completed_at': t.completedAt?.toIso8601String(),
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
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
        return 'in-progress';
      case 'done':
      case 'completed':
        return 'done';
      default:
        return 'backlog';
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
      _ColumnConfig(id: 'backlog', title: '待办', color: AppColors.darkTextSecondary),
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
                          style: const TextStyle(color: Colors.white, fontSize: 12),
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
            value: _priority,
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
