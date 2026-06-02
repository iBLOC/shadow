import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/model_item.dart';
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

  List<ModelItem> get localModels =>
      filteredModels.where((m) => m.source == ModelSource.localEngine).toList();
  List<ModelItem> get internalServiceModels => filteredModels
      .where((m) => m.source == ModelSource.internalService)
      .toList();
  List<ModelItem> get cloudModels => filteredModels
      .where((m) => m.source == ModelSource.cloudProvider)
      .toList();
}

class ModelsNotifier extends StateNotifier<ModelsState> {
  final IModelRepository _repository;

  ModelsNotifier(this._repository) : super(const ModelsState()) {
    _init();
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

  Future<void> addLocalModel(
    String name,
    String path,
    String type,
    int size, {
    ModelSource source = ModelSource.localEngine,
  }) async {
    try {
      final model = ModelItem(
        id: '${source.name}_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        path: path,
        type: type,
        size: size,
        isLoaded: true,
        isLocal: source == ModelSource.localEngine,
        source: source,
      );
      await _repository.insert(model);
      await loadModels();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
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

class _EngineStatusBar extends StatelessWidget {
  final bool isLitertReady;
  final String modelName;
  final String engineName;

  const _EngineStatusBar({
    required this.isLitertReady,
    required this.modelName,
    required this.engineName,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isLitertReady
            ? AppColors.success.withValues(alpha: 0.1)
            : AppColors.darkTextSecondary.withValues(alpha: 0.1),
        border: Border(
          bottom: BorderSide(
            color: isLitertReady
                ? AppColors.success.withValues(alpha: 0.3)
                : AppColors.darkBorder,
          ),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isLitertReady ? Icons.play_circle_filled : Icons.circle_outlined,
            color: isLitertReady
                ? AppColors.success
                : AppColors.darkTextSecondary,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isLitertReady ? '引擎运行中' : '引擎未运行',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: isLitertReady
                        ? AppColors.success
                        : AppColors.darkTextSecondary,
                  ),
                ),
                if (isLitertReady)
                  Text(
                    '$engineName • $modelName',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.darkTextSecondary,
                    ),
                  ),
              ],
            ),
          ),
          if (isLitertReady)
            Chip(
              label: Text(
                engineName,
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

class _ModelManagementScreenState extends ConsumerState<ModelManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _addLocalModel(BuildContext context) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const LocalModelConfigDialog(),
    );
    if (result != null) {
      ref
          .read(modelsProvider.notifier)
          .addLocalModel(
            result['name'] ?? 'New Local Model',
            result['path'] ?? '',
            'text',
            int.tryParse(result['size'] ?? '0') ?? 0,
          );
    }
  }

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
    final chatState = ref.watch(chatProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.models),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: l10n.localModels),
            Tab(text: l10n.modelStore),
          ],
        ),
      ),
      body: Column(
        children: [
          _EngineStatusBar(
            isLitertReady: chatState.isLitertReady,
            modelName: chatState.currentAgent.model.displayName,
            engineName: chatState.mode == ChatMode.litert ? 'LiteRT' : 'MNN',
          ),
          Expanded(
            child: modelsState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _buildLocalModelsTab(context, modelsState),
                      _buildCloudModelsTab(context, modelsState),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocalModelsTab(BuildContext context, ModelsState state) {
    final localModels = state.localModels;
    final internalModels = state.internalServiceModels;
    final cloudModels = state.cloudModels;

    if (localModels.isEmpty && internalModels.isEmpty && cloudModels.isEmpty) {
      return EmptyState(
        icon: Icons.model_training,
        title: '暂无模型',
        description: '点击右下角添加模型',
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              const Text('类型:', style: TextStyle(fontSize: 13)),
              const SizedBox(width: 8),
              SegmentedButton<ModelType?>(
                segments: const [
                  ButtonSegment(
                    value: null,
                    label: Text('全部', style: TextStyle(fontSize: 11)),
                  ),
                  ButtonSegment(
                    value: ModelType.llm,
                    label: Text('LLM', style: TextStyle(fontSize: 11)),
                  ),
                  ButtonSegment(
                    value: ModelType.tts,
                    label: Text('TTS', style: TextStyle(fontSize: 11)),
                  ),
                ],
                selected: {state.typeFilter},
                onSelectionChanged: (selected) {
                  ref
                      .read(modelsProvider.notifier)
                      .setTypeFilter(selected.first);
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              if (localModels.isNotEmpty) ...[
                _buildSectionHeader(context, 'LiteRT 引擎', Icons.memory),
                ...localModels.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LocalModelCard(model: m),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              if (internalModels.isNotEmpty) ...[
                _buildSectionHeader(context, '内部服务 (Rust)', Icons.cloud_done),
                ...internalModels.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LocalModelCard(model: m),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              if (cloudModels.isNotEmpty) ...[
                _buildSectionHeader(context, '云端供应商', Icons.cloud),
                ...cloudModels.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LocalModelCard(model: m),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    String title,
    IconData icon,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: AppColors.primary,
            ),
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
                  title: '暂无云端模型',
                  description: '点击右下角添加云端模型',
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

class _LocalModelCard extends ConsumerWidget {
  final ModelItem model;

  const _LocalModelCard({required this.model});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: model.isLoaded
                ? AppColors.success.withValues(alpha: 0.2)
                : AppColors.darkTextSecondary.withValues(alpha: 0.2),
            child: Icon(
              Icons.model_training,
              color: model.isLoaded
                  ? AppColors.success
                  : AppColors.darkTextSecondary,
            ),
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
                  '${model.type} • ${(model.size / 1024).toStringAsFixed(1)} MB',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (model.isLoaded)
            const Chip(
              label: Text('已加载'),
              backgroundColor: Colors.green,
              labelStyle: TextStyle(color: Colors.white, fontSize: 10),
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
        title: const Text('确认删除'),
        content: Text('确定要删除 ${model.name} 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              ref.read(modelsProvider.notifier).deleteModel(model.id);
              Navigator.pop(context);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
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
        title: const Text('确认删除'),
        content: Text('确定要删除 ${model.name} 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              ref.read(modelsProvider.notifier).deleteModel(model.id);
              Navigator.pop(context);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class LocalModelConfigDialog extends StatefulWidget {
  const LocalModelConfigDialog({super.key});

  @override
  State<LocalModelConfigDialog> createState() => _LocalModelConfigDialogState();
}

class _LocalModelConfigDialogState extends State<LocalModelConfigDialog> {
  final _nameController = TextEditingController();
  final _pathController = TextEditingController();
  final _sizeController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _pathController.dispose();
    _sizeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加本地模型'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: '模型名称',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _pathController,
              decoration: const InputDecoration(
                labelText: '模型路径',
                border: OutlineInputBorder(),
                hintText: 'assets/models/xxx',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _sizeController,
              decoration: const InputDecoration(
                labelText: '大小 (MB)',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () {
            if (_nameController.text.isNotEmpty &&
                _pathController.text.isNotEmpty) {
              Navigator.pop(context, {
                'name': _nameController.text,
                'path': _pathController.text,
                'size': _sizeController.text,
              });
            }
          },
          child: const Text('添加'),
        ),
      ],
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
      title: const Text('添加云端模型'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: '名称',
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
              decoration: const InputDecoration(
                labelText: 'API Key (可选)',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _modelController,
              decoration: const InputDecoration(
                labelText: '模型名称 (可选)',
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
          child: const Text('取消'),
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
          child: const Text('添加'),
        ),
      ],
    );
  }
}
