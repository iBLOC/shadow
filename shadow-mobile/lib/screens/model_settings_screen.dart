import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/model_config.dart';
import '../../models/model_providers.dart';

/// 模型设置页面
class ModelSettingsScreen extends ConsumerWidget {
  const ModelSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedEngine = ref.watch(selectedEngineProvider);
    final currentConfig = ref.watch(currentEngineConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('模型设置'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildEngineSection(context, ref, selectedEngine),
          const SizedBox(height: 24),
          _buildModelSection(context, ref, selectedEngine, currentConfig),
        ],
      ),
    );
  }

  Widget _buildEngineSection(
    BuildContext context,
    WidgetRef ref,
    EngineType selectedEngine,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('推理引擎', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        SegmentedButton<EngineType>(
          segments: const [
            ButtonSegment(
              value: EngineType.litert,
              label: Text('LiteRT'),
              icon: Icon(Icons.memory),
            ),
            ButtonSegment(
              value: EngineType.mnn,
              label: Text('MNN'),
              icon: Icon(Icons.developer_board),
            ),
          ],
          selected: {selectedEngine},
          onSelectionChanged: (selected) {
            ref.read(selectedEngineProvider.notifier).state = selected.first;
          },
        ),
      ],
    );
  }

  Widget _buildModelSection(
    BuildContext context,
    WidgetRef ref,
    EngineType engine,
    AsyncValue<EngineConfig> configAsync,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('选择模型', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        configAsync.when(
          data: (config) => Column(
            children: config.models.map((model) {
              return _ModelCard(
                model: model,
                isSelected: model.id == config.defaultModel,
                onTap: () {
                  ref.read(selectedModelIdProvider.notifier).state = model.id;
                },
              );
            }).toList(),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, stack) => Text('Error loading models: $err'),
        ),
      ],
    );
  }
}

class _ModelCard extends StatelessWidget {
  final ModelInfo model;
  final bool isSelected;
  final VoidCallback onTap;

  const _ModelCard({
    required this.model,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          isSelected ? Icons.check_circle : Icons.circle_outlined,
          color: isSelected ? Colors.green : null,
        ),
        title: Text(model.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(model.description),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              children: model.supports
                  .map(
                    (s) => Chip(
                      label: Text(s, style: const TextStyle(fontSize: 10)),
                      padding: EdgeInsets.zero,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}
