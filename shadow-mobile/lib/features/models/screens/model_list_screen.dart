import 'package:flutter/material.dart';
import '../../../generated/l10n/app_localizations.dart';
import '../widgets/model_widgets.dart';

/// Model list screen - displays all available models (local + cloud)
class ModelListScreen extends StatefulWidget {
  final List<ModelItem> models;
  final String? currentModelId;
  final Function(String)? onModelSelected;
  final Function(String)? onModelDeleted;
  final VoidCallback? onAddModel;
  final VoidCallback? onAddCloudModel;

  const ModelListScreen({
    super.key,
    required this.models,
    this.currentModelId,
    this.onModelSelected,
    this.onModelDeleted,
    this.onAddModel,
    this.onAddCloudModel,
  });

  @override
  State<ModelListScreen> createState() => _ModelListScreenState();
}

class _ModelListScreenState extends State<ModelListScreen> {
  String _searchQuery = '';
  String _filterType = 'all'; // all, text, vision, audio
  String _filterSource = 'all'; // all, local, cloud

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final filteredModels = widget.models.where((model) {
      final matchesSearch =
          _searchQuery.isEmpty ||
          model.name.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesType = _filterType == 'all' || model.type == _filterType;
      final matchesSource =
          _filterSource == 'all' ||
          (_filterSource == 'local' && model.isLocal) ||
          (_filterSource == 'cloud' && !model.isLocal);
      return matchesSearch && matchesType && matchesSource;
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.models),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.add),
            tooltip: l10n.addModel,
            onSelected: (value) {
              if (value == 'local') {
                widget.onAddModel?.call();
              } else if (value == 'cloud') {
                widget.onAddCloudModel?.call();
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'local',
                child: ListTile(
                  leading: const Icon(Icons.phone_android),
                  title: Text(l10n.addLocalModel),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'cloud',
                child: ListTile(
                  leading: const Icon(Icons.cloud),
                  title: Text(l10n.addCloudModel),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: InputDecoration(
                hintText: l10n.searchModels,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
            ),
          ),

          // Filter chips - Type
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                FilterChip(
                  label: Text(l10n.filterAll),
                  selected: _filterType == 'all',
                  onSelected: (selected) {
                    setState(() {
                      _filterType = 'all';
                    });
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.filterText),
                  selected: _filterType == 'text',
                  onSelected: (selected) {
                    setState(() {
                      _filterType = 'text';
                    });
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.filterVision),
                  selected: _filterType == 'vision',
                  onSelected: (selected) {
                    setState(() {
                      _filterType = 'vision';
                    });
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.filterAudio),
                  selected: _filterType == 'audio',
                  onSelected: (selected) {
                    setState(() {
                      _filterType = 'audio';
                    });
                  },
                ),
                const SizedBox(width: 16),
                Container(
                  height: 32,
                  width: 1,
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
                const SizedBox(width: 16),
                FilterChip(
                  label: Text(l10n.filterLocal),
                  selected: _filterSource == 'local',
                  avatar: const Icon(Icons.phone_android, size: 18),
                  onSelected: (selected) {
                    setState(() {
                      _filterSource = selected ? 'local' : 'all';
                    });
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.filterCloud),
                  selected: _filterSource == 'cloud',
                  avatar: const Icon(Icons.cloud, size: 18),
                  onSelected: (selected) {
                    setState(() {
                      _filterSource = selected ? 'cloud' : 'all';
                    });
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Model list
          Expanded(
            child: filteredModels.isEmpty
                ? EmptyModelList(onAddModel: widget.onAddModel)
                : ListView.builder(
                    itemCount: filteredModels.length,
                    itemBuilder: (context, index) {
                      final model = filteredModels[index];

                      return ModelInfoCard(
                        modelName: model.name,
                        modelPath: model.path,
                        modelType: model.type,
                        isLocal: model.isLocal,
                        status: model.isLoaded ? 'loaded' : 'not_loaded',
                        onTap: () {
                          widget.onModelSelected?.call(model.id);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// Model item data class
class ModelItem {
  final String id;
  final String name;
  final String path;
  final String type; // text, vision, diffusion
  final int size; // in MB
  final bool isLoaded;
  final bool isDownloading;
  final double downloadProgress;
  final bool isLocal; // true = local model, false = cloud model
  // Cloud model specific fields
  final String? endpoint; // For cloud models
  final String? apiKey; // For cloud models
  final String? model; // Model name for cloud API

  const ModelItem({
    required this.id,
    required this.name,
    required this.path,
    required this.type,
    required this.size,
    this.isLoaded = false,
    this.isDownloading = false,
    this.downloadProgress = 0.0,
    this.isLocal = true,
    this.endpoint,
    this.apiKey,
    this.model,
  });

  ModelItem copyWith({
    String? id,
    String? name,
    String? path,
    String? type,
    int? size,
    bool? isLoaded,
    bool? isDownloading,
    double? downloadProgress,
    bool? isLocal,
    String? endpoint,
    String? apiKey,
    String? model,
  }) {
    return ModelItem(
      id: id ?? this.id,
      name: name ?? this.name,
      path: path ?? this.path,
      type: type ?? this.type,
      size: size ?? this.size,
      isLoaded: isLoaded ?? this.isLoaded,
      isDownloading: isDownloading ?? this.isDownloading,
      downloadProgress: downloadProgress ?? this.downloadProgress,
      isLocal: isLocal ?? this.isLocal,
      endpoint: endpoint ?? this.endpoint,
      apiKey: apiKey ?? this.apiKey,
      model: model ?? this.model,
    );
  }
}
