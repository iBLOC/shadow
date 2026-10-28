import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/skill.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import '../generated/l10n/app_localizations.dart';

final skillRepositoryProvider = Provider<ISkillRepository>((ref) {
  return RepositoryFactory.createSkillRepository();
});

final skillsNotifierProvider =
    StateNotifierProvider<SkillsNotifier, SkillsState>((ref) {
      return SkillsNotifier(ref.watch(skillRepositoryProvider));
    });

class SkillsState {
  final List<Skill> skills;
  final bool isLoading;
  final String? error;

  const SkillsState({
    this.skills = const [],
    this.isLoading = false,
    this.error,
  });

  SkillsState copyWith({List<Skill>? skills, bool? isLoading, String? error}) {
    return SkillsState(
      skills: skills ?? this.skills,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }

  List<Skill> get builtInSkills => skills.where((s) => s.isBuiltIn).toList();
  List<Skill> get customSkills => skills.where((s) => !s.isBuiltIn).toList();
}

class SkillsNotifier extends StateNotifier<SkillsState> {
  final ISkillRepository _repository;

  SkillsNotifier(this._repository) : super(const SkillsState()) {
    _init();
  }

  Future<void> _init() async {
    await DatabaseHelper.instance.database;
    await _repository.initializeDefaultSkills();
    await loadSkills();
  }

  Future<void> loadSkills() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final skills = await _repository.getAll();
      state = state.copyWith(skills: skills, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> toggleSkill(String id) async {
    try {
      await _repository.toggleSkill(id);
      await loadSkills();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> addSkill(String name, String? description) async {
    try {
      final skill = Skill(
        id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        description: description,
        isEnabled: true,
        isBuiltIn: false,
      );
      await _repository.insert(skill);
      await loadSkills();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteSkill(String id) async {
    try {
      await _repository.delete(id);
      await loadSkills();
    } catch (e) {
      state = state.copyWith(error: e.toString());
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
        title: Text(AppLocalizations.of(context)!.skillsTitle),
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
        label: Text(AppLocalizations.of(context)!.commonAdd),
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
        title: AppLocalizations.of(context)!.skillsEmpty,
        description: AppLocalizations.of(context)!.skillsEmptyHint,
      );
    }

    final builtIn = state.builtInSkills;
    final custom = state.customSkills;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (builtIn.isNotEmpty) ...[
          Text(
            AppLocalizations.of(context)!.skillsBuiltIn,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          ...builtIn.map((s) => _SkillCard(skill: s)),
          const SizedBox(height: 24),
        ],
        if (custom.isNotEmpty) ...[
          Text(
            AppLocalizations.of(context)!.skillsCustom,
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
                      AppLocalizations.of(context)!.commonErrorDetail(state.error!),
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
          ref.read(skillsNotifierProvider.notifier).addSkill(name, desc);
        },
      ),
    );
  }
}

class _SkillCard extends ConsumerWidget {
  final Skill skill;
  final bool showDelete;

  const _SkillCard({required this.skill, this.showDelete = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: skill.isBuiltIn
                  ? AppColors.primary.withValues(alpha: 0.2)
                  : AppColors.secondary.withValues(alpha: 0.2),
              child: Icon(
                skill.isBuiltIn ? Icons.psychology : Icons.extension,
                color: skill.isBuiltIn
                    ? AppColors.primary
                    : AppColors.secondary,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    skill.name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (skill.description != null)
                    Text(
                      skill.description!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
            Switch(
              value: skill.isEnabled,
              onChanged: (value) {
                ref.read(skillsNotifierProvider.notifier).toggleSkill(skill.id);
              },
              activeThumbColor: AppColors.primary,
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
        title: Text(AppLocalizations.of(context)!.commonConfirmDelete),
        content: Text(AppLocalizations.of(context)!.commonDeleteConfirmNamed(skill.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          TextButton(
            onPressed: () {
              ref.read(skillsNotifierProvider.notifier).deleteSkill(skill.id);
              Navigator.pop(context);
            },
            child: Text(AppLocalizations.of(context)!.commonDelete, style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _AddSkillDialog extends StatefulWidget {
  final Function(String name, String? description) onAdd;

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
      title: Text(AppLocalizations.of(context)!.skillsAddCustom),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context)!.skillsNameField,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context)!.commonDescription,
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(AppLocalizations.of(context)!.cancel),
        ),
        FilledButton(
          onPressed: () {
            if (_nameController.text.isNotEmpty) {
              widget.onAdd(
                _nameController.text,
                _descController.text.isEmpty ? null : _descController.text,
              );
              Navigator.pop(context);
            }
          },
          child: Text(AppLocalizations.of(context)!.commonAdd),
        ),
      ],
    );
  }
}
