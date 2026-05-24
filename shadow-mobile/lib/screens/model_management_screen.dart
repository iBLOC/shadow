import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/chat_provider.dart';
import '../providers/model_download_provider.dart';
import '../features/models/screens/model_list_screen.dart';
import '../features/cloud_models/widgets/cloud_model_widgets.dart';
import '../services/model_download_service.dart';

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
    // Fetch available models from server when screen loads
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(modelStoreProvider.notifier).fetchAvailableModels();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _addLocalModel(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const LocalModelConfigDialog(),
    );
    if (result != null) {
      final modelManager = ref.read(modelManagerProvider);
      modelManager.addLocalRunningModel(
        id: 'local_${DateTime.now().millisecondsSinceEpoch}',
        name: result['name'] ?? 'New Local Model',
        path: result['path'] ?? '',
        type: 'text',
      );
    }
  }

  void _addCloudModel(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const CloudModelConfigDialog(),
    );
    if (result != null) {
      final modelManager = ref.read(modelManagerProvider);
      modelManager.addCloudModel(
        id: 'cloud_${DateTime.now().millisecondsSinceEpoch}',
        name: result['model'] ?? 'New Cloud Model',
        endpoint: result['endpoint'] ?? '',
      );
    }
  }

  void _onModelSelected(String modelId) {
    debugPrint('Selected model: $modelId');
  }

  Future<void> _downloadModel(ModelInfo model) async {
    final modelStoreNotifier = ref.read(modelStoreProvider.notifier);

    // Check if already downloading before starting
    final existingProgress = ref.read(
      modelDownloadProgressProvider(model.modelId),
    );
    if (existingProgress?.isDownloading == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('下载已在进行中，请勿重复点击'),
            duration: Duration(seconds: 2),
          ),
        );
      }
      return;
    }

    final path = await modelStoreNotifier.downloadModel(model);

    if (path != null && mounted) {
      // Add to local models after successful download
      final modelManager = ref.read(modelManagerProvider);
      modelManager.addLocalRunningModel(
        id: 'local_${DateTime.now().millisecondsSinceEpoch}',
        name: model.name,
        path: path,
        type: model.supportsThinking ? 'text' : 'text',
      );

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${model.name} 下载成功')));
    } else if (mounted) {
      // Show error message when download fails
      final error =
          modelStoreNotifier.getProgress(model.modelId)?.error ?? '未知错误';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('下载失败: $error'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final modelManager = ref.watch(modelManagerProvider);
    final models = modelManager.models;
    final storeState = ref.watch(modelStoreProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Models'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Local Models'),
            Tab(text: 'Model Store'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Local Models Tab
          ModelListScreen(
            models: models,
            onAddModel: () => _addLocalModel(context, ref),
            onAddCloudModel: () => _addCloudModel(context, ref),
            onModelSelected: _onModelSelected,
          ),
          // Model Store Tab (Cloud/Downloadable models)
          _buildModelStoreTab(storeState),
        ],
      ),
    );
  }

  Widget _buildModelStoreTab(ModelStoreState storeState) {
    if (storeState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (storeState.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Text('Error: ${storeState.error}'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                ref.read(modelStoreProvider.notifier).fetchAvailableModels();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (storeState.availableModels.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off, size: 48, color: Colors.grey),
            SizedBox(height: 16),
            Text('No models available'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: storeState.availableModels.length,
      itemBuilder: (context, index) {
        final model = storeState.availableModels[index];
        final progress = ref.watch(
          modelDownloadProgressProvider(model.modelId),
        );

        return _buildStoreModelCard(model, progress);
      },
    );
  }

  Widget _buildStoreModelCard(ModelInfo model, DownloadProgress? progress) {
    final isDownloading = progress?.isDownloading ?? false;
    final isComplete = progress?.isComplete ?? false;
    final downloadProgress = progress?.progress ?? 0.0;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.model_training,
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        model.name,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${model.vendor} • ${model.sizeGb.toStringAsFixed(1)} GB',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isComplete)
                  const Icon(Icons.check_circle, color: Colors.green)
                else if (isDownloading)
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  IconButton(
                    icon: const Icon(Icons.download),
                    onPressed: () => _downloadModel(model),
                  ),
              ],
            ),
            if (model.tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: model.tags.map((tag) {
                  return Chip(
                    label: Text(tag, style: const TextStyle(fontSize: 10)),
                    padding: EdgeInsets.zero,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  );
                }).toList(),
              ),
            ],
            if (isDownloading) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: downloadProgress),
              const SizedBox(height: 4),
              Text(
                '${(downloadProgress * 100).toStringAsFixed(1)}%',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
