import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';

/// Provider类型定义
enum ProviderType {
  xiaomiMimo('Xiaomi MiMo', 'https://api.xiaomimimo.com/v1', 'mimo-v2.5-pro'),
  openai('OpenAI', 'https://api.openai.com/v1', 'gpt-4o'),
  anthropic(
    'Anthropic',
    'https://api.anthropic.com',
    'claude-sonnet-4-20250514',
  ),
  ollama('Ollama', 'http://localhost:11434', 'llama3'),
  groq('Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  deepseek('DeepSeek', 'https://api.deepseek.com', 'deepseek-chat'),
  minimax('MiniMax', 'https://api.minimax.chat/v1', 'MiniMax-Text-01'),
  qwen('通义千问', 'https://dashscope.aliyuncs.com/api/v1', 'qwen-plus'),
  moonshot('Moonshot', 'https://api.moonshot.cn/v1', 'moonshot-v1-8k'),
  zhipuai('智谱AI', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4'),
  local('本地模型', 'http://localhost:8080', 'local-model');

  final String displayName;
  final String defaultBaseUrl;
  final String defaultModel;

  const ProviderType(this.displayName, this.defaultBaseUrl, this.defaultModel);
}

/// Provider信息模型 - 使用后端返回的格式
class ProviderInfo {
  final String name;
  final ProviderType type;
  final String? apiKey;
  final String? baseUrl;
  final String? model;
  final bool enabled;

  ProviderInfo({
    required this.name,
    required this.type,
    this.apiKey,
    this.baseUrl,
    this.model,
    this.enabled = true,
  });

  String get displayName => type.displayName;
  String get effectiveBaseUrl => baseUrl ?? type.defaultBaseUrl;
  String get effectiveModel => model ?? type.defaultModel;

  factory ProviderInfo.fromResponse(ProviderResponse resp) {
    return ProviderInfo(
      name: resp.name,
      type: ProviderType.values.firstWhere(
        (t) => t.name == resp.type,
        orElse: () => ProviderType.openai,
      ),
      apiKey: null,
      baseUrl: resp.baseUrl,
      model: resp.model,
      enabled: resp.enabled,
    );
  }
}

/// Provider状态
class ProvidersState {
  final List<ProviderInfo> providers;
  final bool isLoading;
  final String? error;

  const ProvidersState({
    this.providers = const [],
    this.isLoading = false,
    this.error,
  });

  ProvidersState copyWith({
    List<ProviderInfo>? providers,
    bool? isLoading,
    String? error,
  }) {
    return ProvidersState(
      providers: providers ?? this.providers,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// Providers Notifier
class ProvidersNotifier extends StateNotifier<ProvidersState> {
  final PrefrontalClient _client;

  ProvidersNotifier(this._client) : super(const ProvidersState()) {
    _loadProviders();
  }

  Future<void> _loadProviders() async {
    state = state.copyWith(isLoading: true);
    try {
      final resp = await _client.getProviders();
      final providers = resp.map((r) => ProviderInfo.fromResponse(r)).toList();
      state = state.copyWith(providers: providers, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> addProvider(
    ProviderType type,
    String apiKey, {
    String? baseUrl,
    String? model,
  }) async {
    try {
      final req = AddProviderRequest(
        type: type.name,
        apiKey: apiKey,
        baseUrl: baseUrl,
        model: model,
      );
      await _client.addProvider(req);
      await _loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> removeProvider(String name) async {
    try {
      await _client.deleteProvider(name);
      await _loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> toggleProvider(String name, bool enabled) async {
    try {
      final req = UpdateProviderRequest(enabled: enabled);
      await _client.updateProvider(name, req);
      await _loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

/// Provider
final providersNotifierProvider =
    StateNotifierProvider<ProvidersNotifier, ProvidersState>((ref) {
      final client = ref.watch(prefrontalClientProvider);
      return ProvidersNotifier(client);
    });

class ProvidersScreen extends ConsumerWidget {
  const ProvidersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final providersState = ref.watch(providersNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('大模型服务提供商'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.read(providersNotifierProvider.notifier)._loadProviders();
            },
          ),
        ],
      ),
      body: providersState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : providersState.providers.isEmpty
          ? EmptyState(
              icon: Icons.cloud_off,
              title: '暂未配置提供商',
              description: '点击右下角添加第一个提供商',
              buttonLabel: '添加提供商',
              onButtonPressed: () => _showAddProviderDialog(context, ref),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: providersState.providers.length,
              itemBuilder: (context, index) {
                final provider = providersState.providers[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _ProviderCard(provider: provider),
                );
              },
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddProviderDialog(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('添加'),
      ),
    );
  }

  void _showAddProviderDialog(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _AddProviderSheet(),
    );
  }
}

class _ProviderCard extends ConsumerWidget {
  final ProviderInfo provider;

  const _ProviderCard({required this.provider});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _ProviderIcon(type: provider.type),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      provider.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      provider.effectiveModel,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Switch(
                value: provider.enabled,
                onChanged: (value) {
                  ref
                      .read(providersNotifierProvider.notifier)
                      .toggleProvider(provider.name, value);
                },
              ),
            ],
          ),
          if (provider.apiKey != null && provider.apiKey!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'API Key: ${provider.apiKey!.substring(0, 8)}...',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: () => _showEditDialog(context, ref, provider),
                icon: const Icon(Icons.edit, size: 18),
                label: const Text('编辑'),
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                onPressed: () => _confirmDelete(context, ref, provider),
                icon: Icon(Icons.delete, size: 18, color: AppColors.error),
                label: Text('删除', style: TextStyle(color: AppColors.error)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showEditDialog(
    BuildContext context,
    WidgetRef ref,
    ProviderInfo provider,
  ) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => _AddProviderSheet(editProvider: provider),
    );
  }

  void _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    ProviderInfo provider,
  ) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除 ${provider.name} 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              ref
                  .read(providersNotifierProvider.notifier)
                  .removeProvider(provider.name);
              Navigator.pop(context);
            },
            child: Text('删除', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

class _ProviderIcon extends StatelessWidget {
  final ProviderType type;

  const _ProviderIcon({required this.type});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;

    switch (type) {
      case ProviderType.xiaomiMimo:
        icon = Icons.phone_android;
        color = Colors.orange;
        break;
      case ProviderType.openai:
        icon = Icons.psychology;
        color = Colors.green;
        break;
      case ProviderType.anthropic:
        icon = Icons.psychology_alt;
        color = Colors.orange;
        break;
      case ProviderType.ollama:
        icon = Icons.computer;
        color = Colors.purple;
        break;
      case ProviderType.groq:
        icon = Icons.bolt;
        color = Colors.blue;
        break;
      case ProviderType.deepseek:
        icon = Icons.water_drop;
        color = Colors.cyan;
        break;
      case ProviderType.minimax:
        icon = Icons.voice_chat;
        color = Colors.red;
        break;
      case ProviderType.qwen:
        icon = Icons.smart_toy;
        color = Colors.blueGrey;
        break;
      case ProviderType.moonshot:
        icon = Icons.rocket_launch;
        color = Colors.indigo;
        break;
      case ProviderType.zhipuai:
        icon = Icons.star;
        color = Colors.amber;
        break;
      case ProviderType.local:
        icon = Icons.storage;
        color = Colors.grey;
        break;
    }

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: color),
    );
  }
}

class _AddProviderSheet extends ConsumerStatefulWidget {
  final ProviderInfo? editProvider;

  const _AddProviderSheet({this.editProvider});

  @override
  ConsumerState<_AddProviderSheet> createState() => _AddProviderSheetState();
}

class _AddProviderSheetState extends ConsumerState<_AddProviderSheet> {
  late ProviderType _selectedType;
  final _apiKeyController = TextEditingController();
  final _baseUrlController = TextEditingController();
  final _modelController = TextEditingController();

  bool get isEditing => widget.editProvider != null;

  @override
  void initState() {
    super.initState();
    if (isEditing) {
      _selectedType = widget.editProvider!.type;
      _apiKeyController.text = widget.editProvider!.apiKey ?? '';
      _baseUrlController.text = widget.editProvider!.effectiveBaseUrl;
      _modelController.text = widget.editProvider!.effectiveModel;
    } else {
      _selectedType = ProviderType.openai;
      _baseUrlController.text = ProviderType.openai.defaultBaseUrl;
      _modelController.text = ProviderType.openai.defaultModel;
    }
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    _baseUrlController.dispose();
    _modelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              isEditing ? '编辑提供商' : '添加提供商',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),

            // Provider类型选择
            DropdownButtonFormField<ProviderType>(
              initialValue: _selectedType,
              decoration: const InputDecoration(
                labelText: '提供商',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.cloud),
              ),
              items: ProviderType.values.map((type) {
                return DropdownMenuItem(
                  value: type,
                  child: Text(type.displayName),
                );
              }).toList(),
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _selectedType = value;
                    _baseUrlController.text = value.defaultBaseUrl;
                    _modelController.text = value.defaultModel;
                  });
                }
              },
            ),
            const SizedBox(height: 16),

            // API Key
            TextField(
              controller: _apiKeyController,
              decoration: const InputDecoration(
                labelText: 'API Key',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.key),
                hintText: 'sk-...',
              ),
              obscureText: true,
            ),
            const SizedBox(height: 16),

            // Base URL (可选)
            TextField(
              controller: _baseUrlController,
              decoration: InputDecoration(
                labelText: 'API 地址',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.link),
                hintText: _selectedType.defaultBaseUrl,
              ),
            ),
            const SizedBox(height: 16),

            // Model (可选)
            TextField(
              controller: _modelController,
              decoration: InputDecoration(
                labelText: '模型',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.model_training),
                hintText: _selectedType.defaultModel,
              ),
            ),
            const SizedBox(height: 24),

            FilledButton(
              onPressed: _submit,
              child: Text(isEditing ? '保存' : '添加'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    if (_apiKeyController.text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('请输入 API Key')));
      return;
    }

    ref
        .read(providersNotifierProvider.notifier)
        .addProvider(
          _selectedType,
          _apiKeyController.text,
          baseUrl: _baseUrlController.text.isEmpty
              ? null
              : _baseUrlController.text,
          model: _modelController.text.isEmpty ? null : _modelController.text,
        );

    Navigator.pop(context);
  }
}
