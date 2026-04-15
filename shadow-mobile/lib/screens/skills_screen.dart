import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../widgets/empty_state.dart';

final skillsNotifierProvider =
    StateNotifierProvider<SkillsNotifier, SkillsState>((ref) {
      return SkillsNotifier(ref.watch(prefrontalClientProvider));
    });

class SkillsState {
  final List<SkillInfo> skills;
  final bool isLoading;
  final String? error;

  const SkillsState({
    this.skills = const [],
    this.isLoading = false,
    this.error,
  });

  SkillsState copyWith({
    List<SkillInfo>? skills,
    bool? isLoading,
    String? error,
  }) {
    return SkillsState(
      skills: skills ?? this.skills,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }

  List<SkillInfo> get builtInSkills =>
      skills.where((s) => s.isBuiltIn).toList();
  List<SkillInfo> get customSkills =>
      skills.where((s) => !s.isBuiltIn).toList();
}

class SkillInfo {
  final String name;
  final String description;
  final Map<String, dynamic> inputSchema;
  final bool enabled;
  final bool isBuiltIn;

  SkillInfo({
    required this.name,
    required this.description,
    required this.inputSchema,
    required this.enabled,
    this.isBuiltIn = false,
  });

  factory SkillInfo.fromJson(Map<String, dynamic> json) {
    return SkillInfo(
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      inputSchema: json['input_schema'] ?? {},
      enabled: json['enabled'] ?? true,
      isBuiltIn: json['is_built_in'] ?? false,
    );
  }
}

class SkillsNotifier extends StateNotifier<SkillsState> {
  final PrefrontalClient _client;

  SkillsNotifier(this._client) : super(const SkillsState()) {
    loadSkills();
  }

  Future<void> loadSkills() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final skills = await _client.getSkills();
      state = state.copyWith(
        skills: skills
            .map(
              (s) => SkillInfo.fromJson({
                'name': s.name,
                'description': s.description,
                'input_schema': s.inputSchema,
                'enabled': s.enabled,
                'is_built_in': _isBuiltIn(s.name),
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  bool _isBuiltIn(String name) {
    const builtIn = [
      'echo',
      'search',
      'memory',
      'shell',
      'filesystem',
      'http',
      'json',
      'time',
    ];
    return builtIn.contains(name.toLowerCase());
  }

  Future<void> toggleSkill(String name) async {
    final skill = state.skills.firstWhere((s) => s.name == name);
    final newEnabled = !skill.enabled;
    try {
      final skills = await _client.toggleSkill(name, newEnabled);
      state = state.copyWith(
        skills: skills
            .map(
              (s) => SkillInfo.fromJson({
                'name': s.name,
                'description': s.description,
                'input_schema': s.inputSchema,
                'enabled': s.enabled,
                'is_built_in': _isBuiltIn(s.name),
              }),
            )
            .toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> addCustomSkill(String name, String description) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final skills = await _client.addCustomSkill(name, description);
      state = state.copyWith(
        skills: skills
            .map(
              (s) => SkillInfo.fromJson({
                'name': s.name,
                'description': s.description,
                'input_schema': s.inputSchema,
                'enabled': s.enabled,
                'is_built_in': _isBuiltIn(s.name),
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> deleteSkill(String name) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final skills = await _client.deleteCustomSkill(name);
      state = state.copyWith(
        skills: skills
            .map(
              (s) => SkillInfo.fromJson({
                'name': s.name,
                'description': s.description,
                'input_schema': s.inputSchema,
                'enabled': s.enabled,
                'is_built_in': _isBuiltIn(s.name),
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

class SkillsScreen extends ConsumerWidget {
  const SkillsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final skillsState = ref.watch(skillsNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('技能管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(skillsNotifierProvider.notifier).loadSkills(),
          ),
        ],
      ),
      body: skillsState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildSkillsList(context, ref, skillsState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddDialog(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('添加'),
      ),
    );
  }

  Widget _buildSkillsList(
    BuildContext context,
    WidgetRef ref,
    SkillsState state,
  ) {
    if (state.skills.isEmpty && !state.isLoading) {
      return EmptyState(
        icon: Icons.psychology_outlined,
        title: '暂无技能',
        description: '点击右下角添加自定义技能',
      );
    }

    final builtIn = state.builtInSkills;
    final custom = state.customSkills;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (builtIn.isNotEmpty) ...[
          const Text(
            '内置技能',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          ...builtIn.map((s) => _SkillCard(skill: s)),
          const SizedBox(height: 24),
        ],
        if (custom.isNotEmpty) ...[
          const Text(
            '自定义技能',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          ...custom.map((s) => _SkillCard(skill: s, showDelete: true)),
        ],
        if (state.error != null) ...[
          const SizedBox(height: 16),
          Card(
            color: Colors.red[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Colors.red),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '连接失败，使用离线数据: ${state.error}',
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  void _showAddDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => _AddSkillDialog(
        onAdd: (name, desc) {
          ref.read(skillsNotifierProvider.notifier).addCustomSkill(name, desc);
        },
      ),
    );
  }
}

class _SkillCard extends ConsumerWidget {
  final SkillInfo skill;
  final bool showDelete;

  const _SkillCard({required this.skill, this.showDelete = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: skill.isBuiltIn
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.secondaryContainer,
          child: Icon(
            skill.isBuiltIn ? Icons.psychology : Icons.extension,
            color: skill.isBuiltIn
                ? Theme.of(context).colorScheme.onPrimaryContainer
                : Theme.of(context).colorScheme.onSecondaryContainer,
          ),
        ),
        title: Text(skill.name),
        subtitle: Text(skill.description),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Switch(
              value: skill.enabled,
              onChanged: (value) {
                ref
                    .read(skillsNotifierProvider.notifier)
                    .toggleSkill(skill.name);
              },
            ),
            if (showDelete)
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red),
                onPressed: () => _confirmDelete(context, ref),
              ),
          ],
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除 ${skill.name} 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              ref.read(skillsNotifierProvider.notifier).deleteSkill(skill.name);
              Navigator.pop(context);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _AddSkillDialog extends StatefulWidget {
  final Function(String name, String description) onAdd;

  const _AddSkillDialog({required this.onAdd});

  @override
  State<_AddSkillDialog> createState() => _AddSkillDialogState();
}

class _AddSkillDialogState extends State<_AddSkillDialog> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加自定义技能'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: '技能名称',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descController,
            decoration: const InputDecoration(
              labelText: '描述',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
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
            if (_nameController.text.isNotEmpty) {
              widget.onAdd(_nameController.text, _descController.text);
              Navigator.pop(context);
            }
          },
          child: const Text('添加'),
        ),
      ],
    );
  }
}
