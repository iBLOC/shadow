import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/model_metadata_provider.dart';
import '../services/database/model_metadata.dart';
import '../providers/telencephalon_provider.dart';
import '../router/app_router.dart';
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../services/telencephalon/telencephalon_client.dart'
    show RegisteredModel, RegisteredProvider;
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../widgets/models/capability_labels.dart';
import '../widgets/models/self_hosted_model_sheet.dart';

/// 模型管理页。
///
/// ## 这一页现在是什么（v2.10「新增流重做」刀）
///
/// **列表 = 大脑供应商目录**（`GET /models/providers`，云端＋自持同源）
/// —— 大脑是唯一数据源；本页只是它的读视图 ＋ 元数据徽章。
///
/// ## 旧病根（为什么那套「添加云端模型」没了）
///
/// 以前这里的 FAB 开一个 4 字段的「添加云端模型」对话框，写进本地
/// sqflite `models` 表 —— 而运行时链路（大脑路由）**根本不读那张表**
/// ⇒ 用户加的「云端模型」在对话里永远用不上 ⇒ **失败长得像成功**。
/// 现在的分工：
///   · **云端模型** → 供应商页（`/manage/providers`）加供应商，模型
///     **自动获取**（preview ＋ fetch-models，两端同源）；
///   · **自持模型** → FAB 开 [SelfHostedModelSheet] 手动添加
///     （ZCode 风格字段＋智能配置），落大脑 custom provider ＋ 本地
///     元数据表。
class ModelManagementScreen extends ConsumerStatefulWidget {
  const ModelManagementScreen({super.key});

  @override
  ConsumerState<ModelManagementScreen> createState() =>
      _ModelManagementScreenState();
}

class _ModelManagementScreenState extends ConsumerState<ModelManagementScreen> {
  /// 目录卡的自刷新信号（表单成功关闭后 +1，卡片据此重读大脑目录）。
  int _catalogVersion = 0;

  @override
  void initState() {
    super.initState();
    // ⚠️ 不许在 initState 的同步栈里碰 provider/网络 —— 排微任务
    // （与 _ProvidersCatalogCard 同一条规矩）。
    Future.microtask(() {
      if (!mounted) return;
      ref.read(modelMetadataProvider.notifier).load();
    });
  }

  Future<void> _addSelfHosted() async {
    final ok = await SelfHostedModelSheet.show(context);
    if (ok == true && mounted) {
      setState(() => _catalogVersion += 1);
      await ref.read(modelMetadataProvider.notifier).load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.models),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addSelfHosted,
        tooltip: l10n.selfHostedAdd,
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          const _BrainStatusBar(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // 云端路径的引导卡 —— 「云端模型在添加云供应商的时候
                // 自动获取」这句话就是这张卡（用户在模型管理页里再也
                // 不该看到一个手填 endpoint 的云端表单）。
                const _CloudGuideCard(),
                const SizedBox(height: 12),
                _ProvidersCatalogCard(version: _catalogVersion),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 云端引导卡 —— 跳供应商页（模型在那里自动获取）。
class _CloudGuideCard extends StatelessWidget {
  const _CloudGuideCard();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return GlassCard(
      child: InkWell(
        onTap: () => context.push(AppRoutes.manageProviders),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: AppColors.primary.withValues(alpha: 0.2),
              child: Icon(Icons.cloud_outlined, color: AppColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.cloudGuideTitle,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.cloudGuideDesc,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}

/// 大脑供应商目录卡 —— **全部**供应商（内置 neuron ＋ 云端 ＋ 自持）
/// 的模型列表，一页看完。
///
/// ⚠️ **不 watch providersNotifierProvider** —— 那份 provider 构造即
/// 自动联网加载，而它的加载链会动 encephalonMobileProvider 的状态 ⇒
/// 在一个没先挂起大脑面的全新 ProviderScope 里首次进本页，就是
/// 「provider 初始化期间修改了别的 provider」的 Riverpod 违规
/// （models_screen_test 四连红就是这么来的）。这张卡**自己读、自己
/// 刷新、失败自己说原因**，不把供应商管理页的初始化时序带进这一页。
///
/// ⚠️ **不在这里逐供应商 fetch-models** —— 刷新按钮只重读目录；「拉取
/// 模型列表并落盘」是供应商页的职责（那里有 key 的语境）。两页一个
/// 端点（fetch-models），不重复造轮子。
class _ProvidersCatalogCard extends ConsumerStatefulWidget {
  /// 外部刷新信号：值变化 ⇒ 重读大脑目录。
  final int version;

  const _ProvidersCatalogCard({required this.version});

  @override
  ConsumerState<_ProvidersCatalogCard> createState() =>
      _ProvidersCatalogCardState();
}

class _ProvidersCatalogCardState extends ConsumerState<_ProvidersCatalogCard> {
  List<RegisteredProvider>? _providers;
  String? _error;

  @override
  void initState() {
    super.initState();
    // ⚠️ 不许在 initState 的**同步栈**里碰 client —— 就绪门的第一跳是
    // 同步链：waitUntilReady → ensureStarted → _startWithRetry 的
    // 「state = starting」在任何 await 之前就执行 ⇒ 在 widget 树构建中
    // 改 provider 的 Riverpod 违规。排进微任务，构建完成后这条链才走。
    Future.microtask(_reload);
  }

  @override
  void didUpdateWidget(covariant _ProvidersCatalogCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.version != widget.version) {
      Future.microtask(_reload);
    }
  }

  Future<void> _reload() async {
    try {
      final providers =
          await ref.read(telencephalonClientProvider).listProviders();
      if (!mounted) return;
      setState(() {
        _error = null;
        _providers = providers;
      });
    } catch (e) {
      // ⚠️ **读不到 ≠ 没有** —— 原因必须留给界面说真话。
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final metadata = ref.watch(modelMetadataProvider).byModelId;
    final providers = _providers ?? const <RegisteredProvider>[];

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.inventory_2_outlined,
                  size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.modelCatalogTitle,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                tooltip: l10n.providersRefreshModels,
                onPressed: _reload,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            l10n.modelCatalogHint,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(color: Theme.of(context).colorScheme.error),
            )
          else if (providers.isEmpty)
            Text(
              l10n.modelCatalogEmpty,
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            ...[
              for (final p in providers) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 2),
                  child: Row(
                    children: [
                      Icon(
                        p.builtin
                            ? Icons.memory
                            : p.presetId == null
                            ? Icons.dns
                            : Icons.cloud,
                        size: 14,
                        color: AppColors.darkTextSecondary,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          p.name,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (p.selectedModel != null)
                        Text(
                          p.selectedModel!,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontFamily: 'monospace',
                                color: AppColors.primary,
                              ),
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                for (final m in p.models)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: _ModelRow(model: m, metadata: metadata[m.id]),
                  ),
                if (p.models.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Text(
                      l10n.modelCatalogEmpty,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ],
        ],
      ),
    );
  }
}

/// 目录里的一条模型 ＋ 元数据徽章（上下文窗口 / 输入类型）。
///
/// ⚠️ 元数据**查不到就什么都不加** —— 它是「智能配置」落在本地的补充
/// 信息，不是目录的必需字段；缺了不渲染假值。
class _ModelRow extends StatelessWidget {
  final RegisteredModel model;
  final ModelMetadata? metadata;

  const _ModelRow({required this.model, this.metadata});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Text(
            [
              model.name,
              if (model.capability != null)
                catalogCapabilityLabel(l10n, model.capability),
            ].join(' · '),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (metadata?.contextWindow != null)
          _badge(
            context,
            '${(metadata!.contextWindow! / 1000).toStringAsFixed(0)}K',
          ),
        if (metadata != null && metadata!.inputTypes.length > 1)
          _badge(context, metadata!.inputTypes.join('/')),
        if (model.available == false)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              l10n.providerModelNotDownloaded,
              style: theme.textTheme.labelSmall?.copyWith(color: Colors.orange),
            ),
          ),
      ],
    );
  }

  Widget _badge(BuildContext context, String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest
              .withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          text,
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(fontFamily: 'monospace'),
        ),
      ),
    );
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
