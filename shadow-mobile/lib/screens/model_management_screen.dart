import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
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

  const ModelsState({
    this.models = const [],
    this.isLoading = false,
    this.error,
  });

  ModelsState copyWith({
    List<ModelItem>? models,
    bool? isLoading,
    String? error,
  }) {
    return ModelsState(
      models: models ?? this.models,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }

  List<ModelItem> get localModels => models.where((m) => m.isLocal).toList();
  List<ModelItem> get cloudModels => models.where((m) => !m.isLocal).toList();
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

  Future<void> addLocalModel(
    String name,
    String path,
    String type,
    int size,
  ) async {
    try {
      final model = ModelItem(
        id: 'local_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        path: path,
        type: type,
        size: size,
        isLoaded: true,
        isLocal: true,
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
      body: modelsState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildLocalModelsTab(context, modelsState),
                _buildCloudModelsTab(context, modelsState),
              ],
            ),
    );
  }

  Widget _buildLocalModelsTab(BuildContext context, ModelsState state) {
    final localModels = state.localModels;

    if (localModels.isEmpty) {
      return EmptyState(
        icon: Icons.model_training,
        title: '暂无本地模型',
        description: '点击右下角添加本地模型',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: localModels.length,
      itemBuilder: (context, index) {
        final model = localModels[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _LocalModelCard(model: model),
        );
      },
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
