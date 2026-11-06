import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../services/database/model_metadata.dart';

/// 模型元数据的内存视图（键 = model_id）＋ 落盘入口。
///
/// ⚠️ provider 定义在**独立文件**，不进任何 screen ——
/// `model_management_screen.dart` 那条「provider 定义在页面文件里形成
/// 循环 import」的旧债不再重犯。
class ModelMetadataState {
  final Map<String, ModelMetadata> byModelId;
  final bool isLoading;

  const ModelMetadataState({
    this.byModelId = const {},
    this.isLoading = false,
  });

  ModelMetadataState copyWith({
    Map<String, ModelMetadata>? byModelId,
    bool? isLoading,
  }) {
    return ModelMetadataState(
      byModelId: byModelId ?? this.byModelId,
      isLoading: isLoading ?? this.isLoading,
    );
  }

  ModelMetadata? forModel(String modelId) => byModelId[modelId];
}

class ModelMetadataNotifier extends StateNotifier<ModelMetadataState> {
  static final _log = Logger('ModelMetadataNotifier');

  final ModelMetadataRepository _repository;

  ModelMetadataNotifier(this._repository) : super(const ModelMetadataState());

  Future<void> load() async {
    state = state.copyWith(isLoading: true);
    try {
      final all = await _repository.getAll();
      if (!mounted) return;
      state = state.copyWith(byModelId: all, isLoading: false);
    } catch (e) {
      _log.warning('读取模型元数据失败: $e');
      if (!mounted) return;
      state = state.copyWith(isLoading: false);
    }
  }

  /// 保存（upsert）＋ 同步内存视图。失败**抛给调用方** —— 表单要把错误
  /// 说出来，不静默吞（吞了就是「点了保存没反应」）。
  Future<void> save(ModelMetadata metadata) async {
    await _repository.put(metadata);
    final next = Map<String, ModelMetadata>.from(state.byModelId);
    next[metadata.modelId] = metadata;
    state = state.copyWith(byModelId: next);
  }

  Future<void> remove(String modelId) async {
    await _repository.delete(modelId);
    final next = Map<String, ModelMetadata>.from(state.byModelId);
    next.remove(modelId);
    state = state.copyWith(byModelId: next);
  }
}

final modelMetadataRepositoryProvider = Provider<ModelMetadataRepository>((
  ref,
) {
  return ModelMetadataRepository();
});

final modelMetadataProvider =
    StateNotifierProvider<ModelMetadataNotifier, ModelMetadataState>((ref) {
      return ModelMetadataNotifier(ref.watch(modelMetadataRepositoryProvider));
    });
