import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'skill.dart';
import 'skill_loader.dart';

/// Skill管理器状态
class SkillManagerState {
  final List<Skill> availableSkills;
  final List<String> selectedSkillNames;
  final bool isLoading;
  final String? error;

  const SkillManagerState({
    this.availableSkills = const [],
    this.selectedSkillNames = const [],
    this.isLoading = false,
    this.error,
  });

  List<Skill> get selectedSkills {
    return availableSkills
        .where((s) => selectedSkillNames.contains(s.name))
        .toList();
  }

  SkillManagerState copyWith({
    List<Skill>? availableSkills,
    List<String>? selectedSkillNames,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return SkillManagerState(
      availableSkills: availableSkills ?? this.availableSkills,
      selectedSkillNames: selectedSkillNames ?? this.selectedSkillNames,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Skill管理器
class SkillManager extends StateNotifier<SkillManagerState> {
  final SkillLoader _loader;

  SkillManager({SkillLoader? loader})
    : _loader = loader ?? SkillLoader(),
      super(const SkillManagerState()) {
    _loadSkills();
  }

  /// 加载所有Skill
  Future<void> _loadSkills() async {
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final skills = await _loader.loadBuiltInSkills();
      state = state.copyWith(availableSkills: skills, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 刷新Skill列表
  Future<void> refresh() async {
    await _loadSkills();
  }

  /// 选择Skill
  void selectSkill(String name) {
    if (!state.selectedSkillNames.contains(name)) {
      state = state.copyWith(
        selectedSkillNames: [...state.selectedSkillNames, name],
      );
    }
  }

  /// 取消选择Skill
  void deselectSkill(String name) {
    state = state.copyWith(
      selectedSkillNames: state.selectedSkillNames
          .where((n) => n != name)
          .toList(),
    );
  }

  /// 切换Skill选择状态
  void toggleSkill(String name) {
    if (state.selectedSkillNames.contains(name)) {
      deselectSkill(name);
    } else {
      selectSkill(name);
    }
  }

  /// 获取Skill
  Skill? getSkill(String name) {
    try {
      return state.availableSkills.firstWhere((s) => s.name == name);
    } catch (_) {
      return null;
    }
  }

  /// 获取选中的Skill描述列表（用于prompt注入）
  List<String> getSelectedSkillDescriptions() {
    return state.selectedSkills.map((s) {
      return '- Skill: "${s.name}" - ${s.description}';
    }).toList();
  }
}

/// Skill管理器Provider
final skillManagerProvider =
    StateNotifierProvider<SkillManager, SkillManagerState>((ref) {
      return SkillManager();
    });

/// 选中的Skill列表Provider
final selectedSkillsProvider = Provider<List<Skill>>((ref) {
  return ref.watch(skillManagerProvider).selectedSkills;
});

/// 选中的Skill描述列表Provider（用于prompt注入）
final selectedSkillDescriptionsProvider = Provider<List<String>>((ref) {
  return ref
      .watch(skillManagerProvider.notifier)
      .getSelectedSkillDescriptions();
});

/// Skill加载器Provider
final skillLoaderProvider = Provider<SkillLoader>((ref) {
  return SkillLoader();
});
