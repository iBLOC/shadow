import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/telencephalon_provider.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import '../generated/l10n/app_localizations.dart';

/// 供应商页的状态 —— ⚠️ **「读不到」与「真的没有」必须分开**。
///
/// ⚠️ 旧实现只有两态（loading / 「有就画列表、没就画空态」）⇒ ⇒ 端脑回
/// 404 / 401 时 `error` 被记下、列表为空 ⇒ 界面画成「还没有供应商」⇒ ⇒
/// **失败长得像成功**（用户去查自己的 key，而真因是「没连上大脑」）。
///
/// ⇒ 现在是三态：**读得到有** / **读得到空** / **读不到**。
class ProvidersState {
  final List<RegisteredProvider> providers;
  final List<ProviderPreset> presets;
  final bool isLoading;
  final bool isLoadingPresets;
  /// **读不到**的原因（连不上 / 被门挡住 / 形状不对）。
  final String? error;
  /// **预设目录读不到**的原因（⇒ 只能自定义添加）。
  final String? presetError;

  const ProvidersState({
    this.providers = const [],
    this.presets = const [],
    this.isLoading = false,
    this.isLoadingPresets = false,
    this.error,
    this.presetError,
  });

  ProvidersState copyWith({
    List<RegisteredProvider>? providers,
    List<ProviderPreset>? presets,
    bool? isLoading,
    bool? isLoadingPresets,
    String? error,
    String? presetError,
    bool clearError = false,
    bool clearPresetError = false,
  }) {
    return ProvidersState(
      providers: providers ?? this.providers,
      presets: presets ?? this.presets,
      isLoading: isLoading ?? this.isLoading,
      isLoadingPresets: isLoadingPresets ?? this.isLoadingPresets,
      // ⚠️ 旧实现写的是 `error: error` ⇒ **每次 copyWith 都把错误清空** ⇒
      // ⇒ 就算界面想渲染错误也拿不到 ⇒ 这里改成「不传就保留」。
      error: clearError ? null : (error ?? this.error),
      presetError: clearPresetError ? null : (presetError ?? this.presetError),
    );
  }
}

/// 供应商数据源 —— ⚠️ **大脑是唯一提供方**（2026-11-02 的架构决定）。
///
/// ⚠️ 旧实现打的是**前额叶方言** `/api/providers` ⇒ ⇒ 端脑**不提供**那条
/// 路由（实测：`GET /api/providers` ⇒ 404，而 `GET /models/providers`
/// ⇒ 200）⇒ ⇒ 界面永远画成「还没有供应商」。
///
/// ⇒ 现在打**端脑方言**：清单、预设目录、增删改，全是**大脑那一份** ⇒ ⇒
/// 与桌面端**同一套接口、同一份数据**。
class ProvidersNotifier extends StateNotifier<ProvidersState> {
  final TelencephalonClient _client;

  ProvidersNotifier(this._client) : super(const ProvidersState()) {
    loadProviders();
    loadPresets();
  }

  /// 读供应商清单（**大脑的那份**）。
  Future<void> loadProviders() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final providers = await _client.listProviders();
      state = state.copyWith(providers: providers, isLoading: false);
    } catch (e) {
      // ⚠️ **读不到 ≠ 没有** —— 原因必须留着给界面说真话。
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 读**预设目录**（大脑给的权威清单）⇒ ⇒ 手机不再硬编码一份。
  Future<void> loadPresets() async {
    state = state.copyWith(isLoadingPresets: true, clearPresetError: true);
    try {
      final presets = await _client.listProviderPresets();
      state = state.copyWith(presets: presets, isLoadingPresets: false);
    } catch (e) {
      state = state.copyWith(isLoadingPresets: false, presetError: e.toString());
    }
  }

  /// 加一个供应商：给了 [presetId] 就**只需要 API key**（base URL 与 API
  /// 标准由大脑的目录给）。
  Future<void> addProvider({
    String? presetId,
    String? name,
    String? baseUrl,
    String? apiKey,
  }) async {
    try {
      await _client.addProvider(
        presetId: presetId,
        name: name,
        baseUrl: baseUrl,
        apiKey: apiKey,
      );
      await loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  /// 删一个供应商。
  Future<void> removeProvider(String id) async {
    try {
      await _client.deleteProvider(id);
      await loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  /// 启用 / 停用。
  Future<void> toggleProvider(String id, bool enabled) async {
    try {
      await _client.updateProvider(id, enabled: enabled);
      await loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  /// 改一条供应商（编辑时**只换 key**）。
  Future<void> updateProvider(
    String id, {
    String? apiKey,
    String? name,
    String? baseUrl,
  }) async {
    try {
      await _client.updateProvider(
        id,
        apiKey: apiKey,
        name: name,
        baseUrl: baseUrl,
      );
      await loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  /// 选模型（模型列表由大脑拉）。
  Future<void> selectModel(String id, String modelId) async {
    try {
      await _client.updateProvider(id, selectedModel: modelId);
      await loadProviders();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final providersNotifierProvider =
    StateNotifierProvider<ProvidersNotifier, ProvidersState>((ref) {
      final client = ref.watch(telencephalonClientProvider);
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
        title: Text(AppLocalizations.of(context)!.providersTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.read(providersNotifierProvider.notifier).loadProviders();
            },
          ),
        ],
      ),
      body: _buildBody(context, ref, providersState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddProviderSheet(context, ref),
        icon: const Icon(Icons.add),
        label: Text(AppLocalizations.of(context)!.commonAdd),
      ),
    );
  }

  /// ⚠️ **三态互斥**：读不到 ⇒ 只画「读不到」；读得到但空 ⇒ 画空态。
  ///
  /// ⚠️ 这条互斥是承重的：一旦「读不到」时还画空态文案 ⇒ 用户看到的仍是
  /// 「还没有供应商」⇒ ⇒ 失败长得像成功（这项目的老病）。
  Widget _buildBody(BuildContext context, WidgetRef ref, ProvidersState s) {
    if (s.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (s.error != null) {
      return _UnreadableState(
        error: s.error!,
        onRetry: () =>
            ref.read(providersNotifierProvider.notifier).loadProviders(),
      );
    }
    if (s.providers.isEmpty) {
      return EmptyState(
        icon: Icons.cloud_off,
        title: AppLocalizations.of(context)!.providersEmpty,
        description: AppLocalizations.of(context)!.providersEmptyHint,
        buttonLabel: AppLocalizations.of(context)!.providersAdd,
        onButtonPressed: () => _showAddProviderSheet(context, ref),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: s.providers.length,
      itemBuilder: (context, index) {
        final provider = s.providers[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ProviderCard(provider: provider),
        );
      },
    );
  }

  void _showAddProviderSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _AddProviderSheet(),
    );
  }
}

/// 「**读不到**」这一态 —— ⚠️ 绝不画成「还没有供应商」。
class _UnreadableState extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _UnreadableState({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48, color: AppColors.error),
            const SizedBox(height: 16),
            Text(
              l10n.commonErrorDetail(error),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(l10n.commonRefresh),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProviderCard extends ConsumerWidget {
  final RegisteredProvider provider;

  const _ProviderCard({required this.provider});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final model = provider.selectedModel ??
        (provider.models.isNotEmpty ? provider.models.first.id : null);
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _ProviderIcon(presetId: provider.presetId),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            provider.name,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        // ⚠️ 「内置」徽章 —— 大脑自带的条目**自报家门**用的
                        // ⇒ ⇒ 用户一眼能看出「这条不是你能改的东西」。
                        if (provider.builtin) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.blue.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              l10n.providerBuiltin,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(color: Colors.blue),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (provider.baseUrl.isNotEmpty)
                      Text(
                        provider.baseUrl,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    Text(
                      '${provider.apiStandard} · ${model ?? '—'}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              // ⚠️ 内置条目恒为启用（它是**大脑的一部分**）⇒ ⇒ 不给开关
              // （按下去 = 写一条只读条目 ⇒ ⇒ 大脑那边会拒）。
              if (!provider.builtin)
                Switch(
                  value: provider.enabled,
                  onChanged: (value) {
                    ref
                        .read(providersNotifierProvider.notifier)
                        .toggleProvider(provider.id, value);
                  },
                ),
            ],
          ),
          // ⚠️ 大脑那边拉模型列表失败 ⇒ **说出来**（别让用户以为配好了）。
          if (provider.lastError != null) ...[
            const SizedBox(height: 8),
            Text(
              l10n.commonErrorDetail(provider.lastError!),
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.error),
            ),
          ],
          if (provider.models.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: provider.models
                  .map(
                    (m) => ChoiceChip(
                      // ⚠️ 能力 ＋ 「还没下载」的标记 ⇒ ⇒ 用户一眼能分出
                      // ⇒ ⇒ 「这条是聊天模型」与「这条还没下载、选了跑不起来」。
                      label: Text(
                        [
                          if (m.capability != null) m.capability!,
                          m.id,
                          if (m.available == false) l10n.providerModelNotDownloaded,
                        ].join(' · '),
                      ),
                      selected: provider.selectedModel == m.id,
                      // ⚠️ 内置条目（neuron）的模型**可以选** —— 「选中哪个本地
                      // ⇒ ⇒ 模型」这件事由大脑那边**记住** ⇒ ⇒ 但**没下载的
                      // ⇒ ⇒ 不能选**（选了也跑不起来 ⇒ ⇒ 大脑那边会拒 400）。
                      onSelected: m.available == false
                          ? null
                          : (_) {
                              ref
                                  .read(providersNotifierProvider.notifier)
                                  .selectModel(provider.id, m.id);
                            },
                    ),
                  )
                  .toList(),
            ),
          ],
          // ⚠️ 内置条目（neuron）**不可编辑/删除**（注册表里只读 ⇒ ⇒ 按了
          // 只会拿到 400）⇒ ⇒ 界面不给这两个按钮。
          if (!provider.builtin) ...[
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () => _showEditDialog(context, ref, provider),
                  icon: const Icon(Icons.edit, size: 18),
                  label: Text(l10n.commonEdit),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: () => _confirmDelete(context, ref, provider),
                  icon: Icon(Icons.delete, size: 18, color: AppColors.error),
                  label: Text(
                    l10n.commonDelete,
                    style: TextStyle(color: AppColors.error),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _showEditDialog(
    BuildContext context,
    WidgetRef ref,
    RegisteredProvider provider,
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
    RegisteredProvider provider,
  ) {
    final l10n = AppLocalizations.of(context)!;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.commonConfirmDelete),
        content: Text(l10n.commonDeleteConfirmNamed(provider.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () {
              ref
                  .read(providersNotifierProvider.notifier)
                  .removeProvider(provider.id);
              Navigator.pop(context);
            },
            child: Text(
              l10n.commonDelete,
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
  }
}

/// 供应商图标 —— ⚠️ **只按预设 id 画**，不再认一份硬编码的类型枚举。
///
/// （旧实现有一份 11 条的 `ProviderType` 枚举 ⇒ 那份**已经漂了**：`qwen`
/// 的地址与大脑的目录不同、少了 8 个供应商 ⇒ ⇒ 枚举降级成纯图标映射。）
class _ProviderIcon extends StatelessWidget {
  final String? presetId;

  const _ProviderIcon({this.presetId});

  @override
  Widget build(BuildContext context) {
    final id = presetId ?? '';
    final icon = switch (id) {
      'openai' => Icons.psychology,
      'anthropic' => Icons.psychology_alt,
      'ollama' || 'local' => Icons.computer,
      'groq' => Icons.bolt,
      'deepseek' => Icons.water_drop,
      'minimax' || 'minimax-abab' => Icons.voice_chat,
      'qwen' => Icons.smart_toy,
      'moonshot' => Icons.rocket_launch,
      'zhipuai' => Icons.star,
      'xiaomi-mimo' => Icons.phone_android,
      _ => Icons.cloud,
    };
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.blue.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: Colors.blue),
    );
  }
}

/// 「自定义」在下拉里的哨兵值（`null` 不能当下拉项的值）。
const String _kCustom = '__custom__';

class _AddProviderSheet extends ConsumerStatefulWidget {
  final RegisteredProvider? editProvider;

  const _AddProviderSheet({this.editProvider});

  @override
  ConsumerState<_AddProviderSheet> createState() => _AddProviderSheetState();
}

class _AddProviderSheetState extends ConsumerState<_AddProviderSheet> {
  String _selectedPresetId = _kCustom;
  final _apiKeyController = TextEditingController();
  final _nameController = TextEditingController();
  final _baseUrlController = TextEditingController();

  bool get isEditing => widget.editProvider != null;
  bool get isCustom => _selectedPresetId == _kCustom;

  @override
  void initState() {
    super.initState();
    if (isEditing) {
      _nameController.text = widget.editProvider!.name;
      _baseUrlController.text = widget.editProvider!.baseUrl;
    }
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    _nameController.dispose();
    _baseUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(providersNotifierProvider);
    final presets = state.presets;

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
              isEditing ? l10n.providersEditTitle : l10n.providersAdd,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),

            // ⚠️ 编辑时**只改 key** —— 预设的 base URL 与标准是**大脑的目录**
            // 给的（改了就不一致了）。
            if (!isEditing) ...[
              DropdownButtonFormField<String>(
                initialValue: _selectedPresetId,
                decoration: InputDecoration(
                  labelText: l10n.commonProvider,
                  border: OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.cloud),
                ),
                items: [
                  ...presets.map(
                    (p) => DropdownMenuItem(
                      value: p.id,
                      child: Text(p.name),
                    ),
                  ),
                  DropdownMenuItem(value: _kCustom, child: Text(l10n.commonProvider)),
                ],
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _selectedPresetId = value);
                  }
                },
              ),
              const SizedBox(height: 16),
            ],

            // ⚠️ 目录读不到 ⇒ **说出来**（否则用户以为「没有供应商可选」）。
            if (state.presetError != null) ...[
              Text(
                l10n.commonErrorDetail(state.presetError!),
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppColors.error),
              ),
              const SizedBox(height: 16),
            ],

            if (isCustom && !isEditing) ...[
              TextField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: l10n.commonProvider,
                  border: OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.label),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _baseUrlController,
                decoration: InputDecoration(
                  labelText: l10n.commonApiAddress,
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.link),
                  hintText: 'https://api.example.com/v1',
                ),
              ),
              const SizedBox(height: 16),
            ],

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
            const SizedBox(height: 24),

            FilledButton(
              onPressed: _submit,
              child: Text(isEditing ? l10n.commonSave : l10n.commonAdd),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(l10n.cancel),
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    final l10n = AppLocalizations.of(context)!;
    final notifier = ref.read(providersNotifierProvider.notifier);
    final key = _apiKeyController.text.trim();

    if (isEditing) {
      // 编辑 = **只换 key**（掩码写回时大脑会保留原 key）。
      notifier.updateProvider(
        widget.editProvider!.id,
        apiKey: key.isEmpty ? null : key,
      );
      Navigator.pop(context);
      return;
    }

    if (isCustom) {
      final name = _nameController.text.trim();
      if (name.isEmpty) {
        _toast(l10n.providersApiKeyRequired);
        return;
      }
      notifier.addProvider(
        name: name,
        baseUrl: _baseUrlController.text.trim(),
        apiKey: key.isEmpty ? null : key,
      );
      Navigator.pop(context);
      return;
    }

    // 预设：要 key 的预设**必须**给 key（大脑那边也会再拒一次）。
    ProviderPreset? preset;
    for (final p in ref.read(providersNotifierProvider).presets) {
      if (p.id == _selectedPresetId) {
        preset = p;
        break;
      }
    }
    if (preset != null && preset.requiresKey && key.isEmpty) {
      _toast(l10n.providersApiKeyRequired);
      return;
    }
    notifier.addProvider(
      presetId: _selectedPresetId,
      apiKey: key.isEmpty ? null : key,
    );
    Navigator.pop(context);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}
