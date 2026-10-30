import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/model_item.dart';
// ⚠️ 这里**故意**形成了一个**循环 import**：
// `model_management_screen.dart` → `encephalon_mobile_provider.dart`
// → （为了拿 `modelsProvider`）→ `model_management_screen.dart`。
//
// 循环的根源是 `modelsProvider` / `ModelsNotifier` / `modelRepositoryProvider`
// 定义在**这个页面文件**里，而端脑启动时要读它（把云端供应商交给大脑）。
// Dart 允许循环 import（顶层变量都是惰性初始化），实测编译与运行都正常。
//
// 真正的解法是把 `modelsProvider` 挪到独立的 provider 文件，但那会动到
// 同仓另一条线（任务看板 / 大脑模型来源）正在改的 import ⇒ 这轮先不动，
// 只把这里记清楚，别让下一个人以为是手滑。
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';

final modelRepositoryProvider = Provider<IModelRepository>((ref) {
  return RepositoryFactory.createModelRepository();
});

final modelsProvider = StateNotifierProvider<ModelsNotifier, ModelsState>((
  ref,
) {
  return ModelsNotifier(ref.watch(modelRepositoryProvider));
});

class ModelsState {
  final List<ModelItem> models;
  final bool isLoading;
  final String? error;
  final ModelType? typeFilter;

  const ModelsState({
    this.models = const [],
    this.isLoading = false,
    this.error,
    this.typeFilter,
  });

  ModelsState copyWith({
    List<ModelItem>? models,
    bool? isLoading,
    String? error,
    ModelType? typeFilter,
  }) {
    return ModelsState(
      models: models ?? this.models,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      typeFilter: typeFilter ?? this.typeFilter,
    );
  }

  List<ModelItem> get filteredModels {
    if (typeFilter == null) return models;
    return models.where((m) => m.modelType == typeFilter).toList();
  }

  /// 云端供应商模型。
  ///
  /// ⚠️ 以前还有 `localModels`（本地引擎模型）和 `internalServiceModels`
  /// 两个 getter —— 前者对应 LiteRT 本地引擎（已下线，没有本地引擎了），
  /// 后者**全仓没有任何一处**创建过 `ModelSource.internalService` 的条目
  /// ⇒ 那个分段永远是空的。两个都删掉。
  List<ModelItem> get cloudModels => filteredModels
      .where((m) => m.source == ModelSource.cloudProvider)
      .toList();
}

class ModelsNotifier extends StateNotifier<ModelsState> {
  final IModelRepository _repository;

  /// 首次加载完成。
  ///
  /// 宿主（嵌入式大脑启动）**必须等它** —— 第一次读 provider 时模型列表
  /// 还是空的（加载是异步的：开库 → 扫本地模型 → 查表）。不等的话会
  /// 读到空列表，误判成「用户没配云端供应商」。
  late final Future<void> ready;

  ModelsNotifier(this._repository) : super(const ModelsState()) {
    ready = _init();
  }

  Future<void> _init() async {
    await DatabaseHelper.instance.database;
    await _repository.initializeDefaultModels();
    await loadModels();
  }

  Future<void> loadModels() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final models = await _repository.getAll();
      state = state.copyWith(models: models, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setTypeFilter(ModelType? type) {
    state = state.copyWith(typeFilter: type);
  }

  Future<void> addCloudModel(
    String name,
    String endpoint, {
    String? apiKey,
    String? model,
  }) async {
    try {
      final m = ModelItem(
        id: 'cloud_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        path: endpoint,
        type: 'text',
        size: 0,
        isLoaded: false,
        isLocal: false,
        source: ModelSource.cloudProvider,
        endpoint: endpoint,
        apiKey: apiKey,
        model: model,
      );
      await _repository.insert(m);
      await loadModels();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteModel(String id) async {
    try {
      await _repository.delete(id);
      await loadModels();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> setModelLoaded(String id, bool isLoaded) async {
    try {
      await _repository.setModelLoaded(id, isLoaded);
      await loadModels();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

/// 嵌入式大脑的状态条。
///
/// ⚠️ 这里**曾经**是 `_EngineStatusBar`，显示的是**本地 LiteRT 引擎**：
/// `isLitertReady` / `currentAgent.model.displayName` /
/// `mode == ChatMode.litert ? 'LiteRT' : 'MNN'`。
///
/// 本地 LiteRT 下线之后：
///   - `isLitertReady` **恒为假** ⇒ 那根条**永远**显示「引擎未运行」；
///   - `currentAgent` / `ChatMode` 这两个字段本身都不存在了。
///
/// 现在显示的是**真正在跑的那个东西** —— 嵌入式大脑（端脑面 + 推理）。
/// 它是移动端唯一的推理来源，状态条得说实话。
class _BrainStatusBar extends ConsumerWidget {
  const _BrainStatusBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brain = ref.watch(encephalonMobileProvider);
    final l10n = AppLocalizations.of(context)!;

    final running = brain.status == EncephalonMobileStatus.running;
    final statusText = switch (brain.status) {
      EncephalonMobileStatus.running => l10n.encephalonStatusRunning,
      EncephalonMobileStatus.starting => l10n.encephalonStatusStarting,
      EncephalonMobileStatus.stopping => l10n.encephalonStatusStopping,
      EncephalonMobileStatus.error => l10n.encephalonStatusError,
      EncephalonMobileStatus.stopped => l10n.encephalonStatusStopped,
    };
    final color = brain.status == EncephalonMobileStatus.error
        ? AppColors.error
        : running
        ? AppColors.success
        : AppColors.darkTextSecondary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border(
          bottom: BorderSide(
            color: running ? AppColors.success.withValues(alpha: 0.3) : AppColors.darkBorder,
          ),
        ),
      ),
      child: Row(
        children: [
          Icon(
            running ? Icons.play_circle_filled : Icons.circle_outlined,
            color: color,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.settingsEncephalonEmbedded,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: color,
                  ),
                ),
                Text(
                  running && brain.agentPort != null
                      ? '$statusText • ${l10n.encephalonPort(brain.agentPort!)}'
                      : statusText,
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.darkTextSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (running)
            Chip(
              label: Text(
                statusText,
                style: const TextStyle(fontSize: 10, color: Colors.white),
              ),
              backgroundColor: AppColors.success,
              padding: EdgeInsets.zero,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
        ],
      ),
    );
  }
}

class ModelManagementScreen extends ConsumerStatefulWidget {
  const ModelManagementScreen({super.key});

  @override
  ConsumerState<ModelManagementScreen> createState() =>
      _ModelManagementScreenState();
}

class _ModelManagementScreenState extends ConsumerState<ModelManagementScreen> {
  void _addCloudModel(BuildContext context) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const CloudModelConfigDialog(),
    );
    if (result != null) {
      ref
          .read(modelsProvider.notifier)
          .addCloudModel(
            result['name'] ?? 'New Cloud Model',
            result['endpoint'] ?? '',
            apiKey: result['apiKey'],
            model: result['model'],
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final modelsState = ref.watch(modelsProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.models),
        // ⚠️ 以前这里是两个 tab：「本地模型」/「模型商店」。
        //
        // 「本地模型」那一摊（LiteRT 引擎模型 + 内部服务模型）在本地
        // LiteRT 下线之后**没有任何东西可显示**：
        //   - 本地引擎模型：没有本地引擎了，没有引擎会注册模型；
        //   - 内部服务模型：全仓**没有任何一处**创建 `internalService` 条目。
        // 而它里面剩下的「云端供应商」分段又和「模型商店」**完全重复**。
        //
        // 所以现在只有一个列表：云端供应商模型 —— 移动端唯一还能用的模型
        // 来源（嵌入式大脑的 `_applyCloudProvider()` 就读它）。
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _addCloudModel(context),
        tooltip: l10n.addCloudModel,
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          const _BrainStatusBar(),
          Expanded(
            child: modelsState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildCloudModelsTab(context, modelsState),
          ),
        ],
      ),
    );
  }

  Widget _buildCloudModelsTab(BuildContext context, ModelsState state) {
    final cloudModels = state.cloudModels;

    return Column(
      children: [
        Expanded(
          child: cloudModels.isEmpty
              ? EmptyState(
                  icon: Icons.cloud,
                  title: AppLocalizations.of(context)!.modelNoCloudModels,
                  description: AppLocalizations.of(context)!.modelNoCloudModelsHint,
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: cloudModels.length,
                  itemBuilder: (context, index) {
                    final model = cloudModels[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CloudModelCard(model: model),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _CloudModelCard extends ConsumerWidget {
  final ModelItem model;

  const _CloudModelCard({required this.model});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.primary.withValues(alpha: 0.2),
            child: Icon(Icons.cloud, color: AppColors.primary),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  model.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  model.endpoint ?? '',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.delete, color: Colors.red),
            onPressed: () => _confirmDelete(context, ref),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.commonConfirmDelete),
        content: Text(AppLocalizations.of(context)!.commonDeleteConfirmNamed(model.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          TextButton(
            onPressed: () {
              ref.read(modelsProvider.notifier).deleteModel(model.id);
              Navigator.pop(context);
            },
            child: Text(AppLocalizations.of(context)!.commonDelete, style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class CloudModelConfigDialog extends StatefulWidget {
  const CloudModelConfigDialog({super.key});

  @override
  State<CloudModelConfigDialog> createState() => _CloudModelConfigDialogState();
}

class _CloudModelConfigDialogState extends State<CloudModelConfigDialog> {
  final _nameController = TextEditingController();
  final _endpointController = TextEditingController();
  final _apiKeyController = TextEditingController();
  final _modelController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _endpointController.dispose();
    _apiKeyController.dispose();
    _modelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(AppLocalizations.of(context)!.modelAddCloudTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonName,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _endpointController,
              decoration: const InputDecoration(
                labelText: 'API Endpoint',
                border: OutlineInputBorder(),
                hintText: 'https://api.openai.com/v1',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _apiKeyController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonApiKeyOptional,
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _modelController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.modelNameOptional,
                border: OutlineInputBorder(),
                hintText: 'gpt-4',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(AppLocalizations.of(context)!.cancel),
        ),
        FilledButton(
          onPressed: () {
            if (_nameController.text.isNotEmpty &&
                _endpointController.text.isNotEmpty) {
              Navigator.pop(context, {
                'name': _nameController.text,
                'endpoint': _endpointController.text,
                'apiKey': _apiKeyController.text,
                'model': _modelController.text,
              });
            }
          },
          child: Text(AppLocalizations.of(context)!.commonAdd),
        ),
      ],
    );
  }
}
