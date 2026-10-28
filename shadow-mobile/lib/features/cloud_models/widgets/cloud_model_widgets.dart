import 'package:flutter/material.dart';
import '../../../generated/l10n/app_localizations.dart';

/// Cloud model API configuration widget
class CloudModelConfigCard extends StatelessWidget {
  final String apiEndpoint;
  final String apiKey;
  final String selectedModel;
  final VoidCallback? onEdit;

  const CloudModelConfigCard({
    super.key,
    required this.apiEndpoint,
    required this.apiKey,
    required this.selectedModel,
    this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.cloud, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  l10n.cloudModel,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const Spacer(),
                if (onEdit != null)
                  IconButton(icon: const Icon(Icons.edit), onPressed: onEdit),
              ],
            ),
            const SizedBox(height: 12),
            _InfoRow(label: l10n.endpoint, value: apiEndpoint),
            _InfoRow(label: l10n.model, value: selectedModel),
            _InfoRow(
              label: l10n.apiKey,
              value: apiKey.isEmpty
                  ? l10n.notSet
                  : '${apiKey.substring(0, 8)}...',
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Cloud model API configuration dialog
class CloudModelConfigDialog extends StatefulWidget {
  final String initialEndpoint;
  final String initialApiKey;
  final String initialModel;

  const CloudModelConfigDialog({
    super.key,
    this.initialEndpoint = '',
    this.initialApiKey = '',
    this.initialModel = '',
  });

  @override
  State<CloudModelConfigDialog> createState() => _CloudModelConfigDialogState();
}

class _CloudModelConfigDialogState extends State<CloudModelConfigDialog> {
  late TextEditingController _endpointController;
  late TextEditingController _apiKeyController;
  late TextEditingController _modelController;

  @override
  void initState() {
    super.initState();
    _endpointController = TextEditingController(text: widget.initialEndpoint);
    _apiKeyController = TextEditingController(text: widget.initialApiKey);
    _modelController = TextEditingController(text: widget.initialModel);
  }

  @override
  void dispose() {
    _endpointController.dispose();
    _apiKeyController.dispose();
    _modelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Text(l10n.configureCloudModel),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _endpointController,
              decoration: InputDecoration(
                labelText: l10n.apiEndpoint,
                hintText: 'https://api.openai.com/v1',
                prefixIcon: const Icon(Icons.link),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _apiKeyController,
              obscureText: true,
              decoration: InputDecoration(
                labelText: l10n.apiKey,
                hintText: 'sk-...',
                prefixIcon: const Icon(Icons.key),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _modelController,
              decoration: InputDecoration(
                labelText: l10n.model,
                hintText: 'gpt-4o',
                prefixIcon: const Icon(Icons.model_training),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        FilledButton(
          onPressed: () {
            Navigator.pop(context, {
              'endpoint': _endpointController.text,
              'apiKey': _apiKeyController.text,
              'model': _modelController.text,
            });
          },
          child: Text(l10n.save),
        ),
      ],
    );
  }
}

/// Cloud model provider selector
class CloudModelProviderSelector extends StatelessWidget {
  final String selectedProvider;
  final Function(String) onProviderSelected;

  const CloudModelProviderSelector({
    super.key,
    required this.selectedProvider,
    required this.onProviderSelected,
  });

  static const providers = [
    {'id': 'openai', 'name': 'OpenAI', 'icon': Icons.smart_toy},
    {'id': 'anthropic', 'name': 'Anthropic', 'icon': Icons.psychology},
    {'id': 'gemini', 'name': 'Google Gemini', 'icon': Icons.cloud},
    {'id': 'custom', 'name': 'Custom API', 'icon': Icons.link},
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: providers.map((provider) {
        final isSelected = provider['id'] == selectedProvider;
        return FilterChip(
          avatar: Icon(provider['icon'] as IconData),
          label: Text(provider['name'] as String),
          selected: isSelected,
          onSelected: (selected) {
            if (selected) {
              onProviderSelected(provider['id'] as String);
            }
          },
        );
      }).toList(),
    );
  }
}

/// Cloud model settings sheet
class CloudModelSettingsSheet extends StatefulWidget {
  final CloudModelConfig config;
  final Function(CloudModelConfig) onSave;

  const CloudModelSettingsSheet({
    super.key,
    required this.config,
    required this.onSave,
  });

  @override
  State<CloudModelSettingsSheet> createState() =>
      _CloudModelSettingsSheetState();
}

class _CloudModelSettingsSheetState extends State<CloudModelSettingsSheet> {
  late CloudModelConfig _editedConfig;

  @override
  void initState() {
    super.initState();
    _editedConfig = widget.config;
  }

  void _updateConfig(CloudModelConfig newConfig) {
    setState(() {
      _editedConfig = newConfig;
    });
  }

  Future<void> _showEndpointDialog() async {
    final controller = TextEditingController(text: _editedConfig.endpoint);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.apiEndpoint),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'https://api.openai.com/v1',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: Text(AppLocalizations.of(context)!.save),
          ),
        ],
      ),
    );
    if (result != null) {
      _updateConfig(_editedConfig.copyWith(endpoint: result));
    }
  }

  Future<void> _showModelDialog() async {
    final controller = TextEditingController(text: _editedConfig.model);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.model),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'gpt-4o',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: Text(AppLocalizations.of(context)!.save),
          ),
        ],
      ),
    );
    if (result != null) {
      _updateConfig(_editedConfig.copyWith(model: result));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cloud),
              const SizedBox(width: 8),
              Text(
                AppLocalizations.of(context)!.cloudModelSettings,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            AppLocalizations.of(context)!.provider,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          CloudModelProviderSelector(
            selectedProvider: _editedConfig.provider,
            onProviderSelected: (provider) {
              _updateConfig(_editedConfig.copyWith(provider: provider));
            },
          ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.link),
            title: Text(AppLocalizations.of(context)!.apiEndpoint),
            subtitle: Text(_editedConfig.endpoint),
            trailing: const Icon(Icons.chevron_right),
            onTap: _showEndpointDialog,
          ),
          ListTile(
            leading: const Icon(Icons.model_training),
            title: Text(AppLocalizations.of(context)!.model),
            subtitle: Text(_editedConfig.model),
            trailing: const Icon(Icons.chevron_right),
            onTap: _showModelDialog,
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(AppLocalizations.of(context)!.cancel),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: () {
                  widget.onSave(_editedConfig);
                  Navigator.pop(context);
                },
                child: Text(AppLocalizations.of(context)!.save),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Cloud model configuration data
class CloudModelConfig {
  final String provider;
  final String endpoint;
  final String apiKey;
  final String model;

  const CloudModelConfig({
    this.provider = 'openai',
    this.endpoint = '',
    this.apiKey = '',
    this.model = '',
  });

  CloudModelConfig copyWith({
    String? provider,
    String? endpoint,
    String? apiKey,
    String? model,
  }) {
    return CloudModelConfig(
      provider: provider ?? this.provider,
      endpoint: endpoint ?? this.endpoint,
      apiKey: apiKey ?? this.apiKey,
      model: model ?? this.model,
    );
  }
}

/// Local model configuration dialog
class LocalModelConfigDialog extends StatefulWidget {
  const LocalModelConfigDialog({super.key});

  @override
  State<LocalModelConfigDialog> createState() => _LocalModelConfigDialogState();
}

class _LocalModelConfigDialogState extends State<LocalModelConfigDialog> {
  final _nameController = TextEditingController();
  final _pathController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _pathController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(AppLocalizations.of(context)!.addLocalModel),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context)!.modelNameField,
              hintText: AppLocalizations.of(context)!.modelNameExample,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _pathController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context)!.modelPathField,
              hintText: '/data/local/models/qwen2.5-7b',
              border: OutlineInputBorder(),
            ),
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
            if (_nameController.text.isNotEmpty &&
                _pathController.text.isNotEmpty) {
              Navigator.pop(context, {
                'name': _nameController.text,
                'path': _pathController.text,
              });
            }
          },
          child: Text(AppLocalizations.of(context)!.commonAdd),
        ),
      ],
    );
  }
}
