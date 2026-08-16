import 'package:flutter/material.dart';
import '../../../generated/l10n/app_localizations.dart';

/// Model information display widget
class ModelInfoCard extends StatelessWidget {
  final String modelName;
  final String modelPath;
  final String? modelType;
  final bool? isLocal;
  final String status;
  final VoidCallback? onTap;

  const ModelInfoCard({
    super.key,
    required this.modelName,
    required this.modelPath,
    this.modelType,
    this.isLocal,
    required this.status,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    // Determine icon based on model type
    IconData typeIcon;
    switch (modelType) {
      case 'vision':
        typeIcon = Icons.image;
        break;
      case 'audio':
        typeIcon = Icons.mic;
        break;
      default:
        typeIcon = Icons.model_training;
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Model type icon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isLocal == false
                      ? Theme.of(context).colorScheme.tertiaryContainer
                      : Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isLocal == false ? Icons.cloud : typeIcon,
                  color: isLocal == false
                      ? Theme.of(context).colorScheme.onTertiaryContainer
                      : Theme.of(context).colorScheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            modelName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        // Local/Cloud badge
                        if (isLocal != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: isLocal!
                                  ? Colors.green.withValues(alpha: 0.1)
                                  : Colors.blue.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isLocal! ? Icons.phone_android : Icons.cloud,
                                  size: 12,
                                  color: isLocal! ? Colors.green : Colors.blue,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  isLocal! ? l10n.local : l10n.cloud,
                                  style: Theme.of(context).textTheme.labelSmall
                                      ?.copyWith(
                                        color: isLocal!
                                            ? Colors.green
                                            : Colors.blue,
                                      ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      modelPath,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        // Type badge
                        if (modelType != null)
                          Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Theme.of(
                                context,
                              ).colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              modelType!.toUpperCase(),
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.outline,
                                  ),
                            ),
                          ),
                        // Status indicator
                        Icon(
                          status == 'loaded'
                              ? Icons.check_circle
                              : Icons.circle_outlined,
                          size: 14,
                          color: status == 'loaded'
                              ? Colors.green
                              : Colors.grey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          status == 'loaded' ? l10n.loaded : l10n.notLoaded,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: status == 'loaded'
                                    ? Colors.green
                                    : Colors.grey,
                              ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

/// Model settings bottom sheet
class ModelSettingsSheet extends StatefulWidget {
  final String modelName;
  final String modelPath;
  final int threadNum;
  final int backendType;

  const ModelSettingsSheet({
    super.key,
    required this.modelName,
    required this.modelPath,
    required this.threadNum,
    required this.backendType,
  });

  @override
  State<ModelSettingsSheet> createState() => _ModelSettingsSheetState();
}

class _ModelSettingsSheetState extends State<ModelSettingsSheet> {
  late int _threadNum;
  late int _backendType;

  @override
  void initState() {
    super.initState();
    _threadNum = widget.threadNum;
    _backendType = widget.backendType;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.settings),
              const SizedBox(width: 8),
              Text(
                l10n.modelSettings,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Thread count slider
          Text(
            l10n.threadCount(_threadNum),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          Slider(
            value: _threadNum.toDouble(),
            min: 1,
            max: 8,
            divisions: 7,
            label: '$_threadNum',
            onChanged: (value) {
              setState(() {
                _threadNum = value.round();
              });
            },
          ),
          const SizedBox(height: 16),

          // Backend type dropdown
          Text(l10n.backendType, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: [
              ButtonSegment(
                value: 0,
                label: Text(l10n.cpu),
                icon: const Icon(Icons.memory),
              ),
              ButtonSegment(
                value: 1,
                label: Text(l10n.opencl),
                icon: const Icon(Icons.speed),
              ),
              ButtonSegment(
                value: 2,
                label: Text(l10n.metal),
                icon: const Icon(Icons.flash_on),
              ),
            ],
            selected: {_backendType},
            onSelectionChanged: (Set<int> newSelection) {
              setState(() {
                _backendType = newSelection.first;
              });
            },
          ),
          const SizedBox(height: 24),

          // Model info
          ListTile(
            leading: const Icon(Icons.folder),
            title: Text(l10n.modelPath),
            subtitle: Text(widget.modelPath),
          ),
          const SizedBox(height: 16),

          // Action buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
                label: Text(l10n.cancel),
              ),
              FilledButton.icon(
                onPressed: () {
                  // Apply settings
                  Navigator.pop(context, {
                    'threadNum': _threadNum,
                    'backendType': _backendType,
                  });
                },
                icon: const Icon(Icons.check),
                label: Text(l10n.apply),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

/// Model download progress indicator
class ModelDownloadProgress extends StatelessWidget {
  final String modelName;
  final double progress;
  final VoidCallback? onCancel;

  const ModelDownloadProgress({
    super.key,
    required this.modelName,
    required this.progress,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.download),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    modelName,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (onCancel != null)
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: onCancel,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 4),
            Text(
              '${(progress * 100).toStringAsFixed(1)}%',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

/// Empty model list placeholder
class EmptyModelList extends StatelessWidget {
  final VoidCallback? onAddModel;

  const EmptyModelList({super.key, this.onAddModel});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.model_training,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            l10n.noModels,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.addModelToGetStarted,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onAddModel,
            icon: const Icon(Icons.add),
            label: Text(l10n.addModel),
          ),
        ],
      ),
    );
  }
}
