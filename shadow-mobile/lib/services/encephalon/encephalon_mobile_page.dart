import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../../screens/model_management_screen.dart';
import '../../services/database/model_item.dart';
import '../../services/telencephalon/telencephalon_client.dart';
import 'encephalon_mobile_provider.dart';

/// Encephalon（大脑）嵌入式运行时管理页面
///
/// 与 [PrefrontalMobilePage] 同构，但反映「大脑」的语义：
/// - 大脑跑在 App 进程内（`libencephalon.so`），不是外部进程；
/// - 推理走**进程内**通道（`nativeInfer` 直接进 neuron's adapter
///   管线），没有 socket、没有 CORS；
/// - 大脑 = thalamus + ACP 总线 + telencephalon + 单一 neuron。
class EncephalonMobilePage extends ConsumerStatefulWidget {
  const EncephalonMobilePage({super.key});

  @override
  ConsumerState<EncephalonMobilePage> createState() => _EncephalonMobilePageState();
}

class _EncephalonMobilePageState extends ConsumerState<EncephalonMobilePage> {
  final _inputController = TextEditingController();
  String _output = '';
  bool _isInferring = false;

  /// 端脑的原生叶区列表 —— **从端脑读，不硬编码**。
  ///
  /// 读不到（大脑没在跑）时卡片会显示「读不到」+ 一个刷新按钮。
  Future<List<NativeLobeInfo>>? _lobesFuture;

  /// 「跟随全局默认」在下拉框里的哨兵值。
  ///
  /// 不能用空串 —— `DropdownButton` 的 value 语义是「精确匹配某一项」，
  /// 空串容易和别的空值撞在一起。
  static const String _followGlobalValue = '__follow_global__';

  @override
  void initState() {
    super.initState();
    _reloadLobes();
  }

  void _reloadLobes() {
    // **带超时** —— 端脑没起来时那个端口没人监听，请求要么连不上、要么
    // 一直挂着；没有上限的话卡片会永远转圈，用户看不出是「读不到」还是
    // 「还在读」。
    _lobesFuture = ref
        .read(telencephalonClientProvider)
        .listNativeLobes()
        .timeout(const Duration(seconds: 10));
  }

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(encephalonMobileProvider);
    final notifier = ref.read(encephalonMobileProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.encephalonEmbeddedTitle),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // 重新读一次运行态：App 被系统重建后进程可能还活着。
          await notifier.refreshStatus();
          setState(_reloadLobes);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 运行时状态卡片
            _buildStatusCard(context, l10n, state, notifier),

            const SizedBox(height: 16),

            // 大脑模型来源（全局默认）
            _buildModelSourceCard(context, l10n, notifier),

            const SizedBox(height: 16),

            // 叶区模型路由（per-lobe 覆盖）
            _buildLobeRoutingCard(context, l10n, notifier),

            const SizedBox(height: 16),

            // 进程内推理
            _buildInferCard(context, l10n, state),
          ],
        ),
      ),
    );
  }

  /// 「大脑模型来源」卡片 —— **全局默认**。
  ///
  /// 端脑的叶区是按模型 id 去请求 neuron 的 OpenAI 面的 ⇒ 大脑用哪个
  /// 上游，决定了「叶区 → LLM」那一跳通不通：
  /// - **本地 neuron 权重** —— 不指定模型 id，叶区从 neuron 的本地模型
  ///   目录里挑；
  /// - **云端供应商**（如 MiniMax token plan）—— 注册一条远端引擎。
  ///
  /// 这是**全局默认** —— 各个叶区默认都用它；单个叶区要换一边，去下面
  /// 的「叶区模型路由」。
  Widget _buildModelSourceCard(
    BuildContext context,
    AppLocalizations l10n,
    EncephalonMobileNotifier notifier,
  ) {
    final sourceState = ref.watch(brainModelSourceProvider);
    final models = ref.watch(modelsProvider).models;
    final cloudModels = models
        .where((m) => m.source == ModelSource.cloudProvider)
        .toList();

    // 实际在用的是哪个 —— 用户没显式选过时是「自动」（第一个可用的云端
    // 供应商，没有就是本地权重）。
    final effective = BrainModelSource.resolve(sourceState.source, models);
    final selected = effective?.id ?? BrainModelSource.local;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.encephalonModelSourceTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.encephalonModelSourceHint,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: selected,
              onChanged: (value) {
                if (value == null) return;
                if (value == BrainModelSource.local) {
                  _applySource(notifier, l10n, BrainModelSource.localSource);
                } else {
                  _applySource(
                    notifier,
                    l10n,
                    BrainModelSource.cloud(value),
                  );
                }
              },
              child: Column(
                children: [
                  RadioListTile<String>(
                    value: BrainModelSource.local,
                    title: Text(l10n.encephalonModelLocalNeuron),
                  ),
                  for (final m in cloudModels)
                    RadioListTile<String>(
                      value: m.id,
                      title: Text(m.name),
                      subtitle: Text(
                        '${m.endpoint ?? ''} · ${m.model ?? ''}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                ],
              ),
            ),
            if (cloudModels.isEmpty) ...[
              const SizedBox(height: 8),
              Text(
                l10n.encephalonModelNoCloudProvider,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 「叶区模型路由」卡片 —— **每个叶区单独选模型**。
  ///
  /// 模型使用的**最小单位是叶区**：全局默认决定「默认各叶区都走本地 /
  /// 都走云端」，这里决定「某一个叶区单独换一边」（比如前额叶本地、实际
  /// 执行任务的区域云端、颞叶本地）。
  ///
  /// **叶区列表从端脑读**（`/api/telencephalon/lobes/list`）—— 不硬编码
  /// 叶区名，端脑注册了哪些原生叶区就管哪些。
  Widget _buildLobeRoutingCard(
    BuildContext context,
    AppLocalizations l10n,
    EncephalonMobileNotifier notifier,
  ) {
    final sourceState = ref.watch(brainModelSourceProvider);
    final models = ref.watch(modelsProvider).models;
    final cloudModels = models
        .where((m) => m.source == ModelSource.cloudProvider)
        .toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.encephalonLobeRoutingTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  onPressed: () => setState(_reloadLobes),
                  icon: const Icon(Icons.refresh),
                  tooltip: l10n.encephalonLobeRoutingRefresh,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.encephalonLobeRoutingHint,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            FutureBuilder<List<NativeLobeInfo>>(
              future: _lobesFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(
                    padding: EdgeInsets.all(12),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final lobes = snapshot.data ?? const <NativeLobeInfo>[];
                if (snapshot.hasError || lobes.isEmpty) {
                  return Text(
                    l10n.encephalonLobeRoutingUnavailable,
                    style: Theme.of(context).textTheme.bodySmall,
                  );
                }
                return Column(
                  children: [
                    for (final lobe in lobes)
                      _buildLobeRow(
                        context,
                        l10n,
                        lobe,
                        sourceState,
                        cloudModels,
                        notifier,
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  /// 一个叶区的模型选择行。
  Widget _buildLobeRow(
    BuildContext context,
    AppLocalizations l10n,
    NativeLobeInfo lobe,
    BrainModelSourceState sourceState,
    List<ModelItem> cloudModels,
    EncephalonMobileNotifier notifier,
  ) {
    // 有覆盖 = 覆盖的值；没有覆盖 = 跟随全局默认。
    final override = sourceState.lobeOverrides[lobe.name];
    final rawValue = override?.raw ?? _followGlobalValue;

    // 覆盖指向的供应商**被删了** ⇒ 下拉框里没有这一项 ⇒ 退回「跟随
    // 全局」。（不退回的话 `DropdownButton` 会因为找不到匹配项而断言失败 ——
    // 整个设置页直接崩。）
    final selectable = <String>{
      _followGlobalValue,
      BrainModelSource.local,
      for (final m in cloudModels) BrainModelSource.cloud(m.id).raw ?? '',
    };
    final currentValue =
        selectable.contains(rawValue) ? rawValue : _followGlobalValue;

    // 「当前实际生效」—— 跟路由负载用**同一套**算法
    // （`effectiveLobeSource`），否则界面显示的跟实际跑的不是一回事。
    final effective = effectiveLobeSource(
      routing: sourceState.routing,
      lobe: lobe.name,
      models: cloudModels,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lobe.name,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                if (lobe.description.isNotEmpty)
                  Text(
                    lobe.description,
                    style: Theme.of(context).textTheme.bodySmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                Text(
                  _effectiveText(l10n, effective, cloudModels),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          DropdownButton<String>(
            value: currentValue,
            underline: const SizedBox.shrink(),
            items: [
              DropdownMenuItem(
                value: _followGlobalValue,
                child: Text(l10n.encephalonLobeFollowGlobal),
              ),
              DropdownMenuItem(
                value: BrainModelSource.local,
                child: Text(l10n.encephalonModelLocalNeuron),
              ),
              for (final m in cloudModels)
                DropdownMenuItem(
                  value: BrainModelSource.cloud(m.id).raw,
                  child: Text(m.name),
                ),
            ],
            onChanged: (value) {
              if (value == null) return;
              final source = value == _followGlobalValue
                  ? const BrainModelSource.auto()
                  : BrainModelSource.parse(value);
              _applyLobeOverride(notifier, l10n, lobe.name, source);
            },
          ),
        ],
      ),
    );
  }

  /// 「当前用的是哪个」的说明文字。
  String _effectiveText(
    AppLocalizations l10n,
    BrainModelSource effective,
    List<ModelItem> cloudModels,
  ) {
    if (effective.isLocal) return l10n.encephalonLobeEffectiveLocal;
    final id = effective.cloudModelId;
    if (id == null) {
      // 「自动」= 第一个可用的云端供应商。
      for (final m in cloudModels) {
        if (BrainModelSource.isUsable(m)) {
          return l10n.encephalonLobeEffectiveCloud(m.name);
        }
      }
      return l10n.encephalonLobeEffectiveLocal;
    }
    for (final m in cloudModels) {
      if (m.id == id) return l10n.encephalonLobeEffectiveCloud(m.name);
    }
    return l10n.encephalonLobeEffectiveLocal;
  }

  /// 切换某个叶区的模型来源（**不用重启大脑**）。
  Future<void> _applyLobeOverride(
    EncephalonMobileNotifier notifier,
    AppLocalizations l10n,
    String lobe,
    BrainModelSource source,
  ) async {
    final ok = await notifier.applyLobeOverride(lobe, source);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? l10n.encephalonLobeRoutingApplied
              : l10n.encephalonLobeRoutingFailed,
        ),
      ),
    );
  }

  /// 切换模型来源。
  Future<void> _applySource(
    EncephalonMobileNotifier notifier,
    AppLocalizations l10n,
    BrainModelSource source,
  ) async {
    final ok = await notifier.applyModelSource(source);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok ? l10n.encephalonModelSourceApplied : l10n.encephalonModelSourceFailed,
        ),
      ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context,
    AppLocalizations l10n,
    EncephalonMobileState state,
    EncephalonMobileNotifier notifier,
  ) {
    final isRunning = state.status == EncephalonMobileStatus.running;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isRunning ? Icons.check_circle : Icons.error,
                  color: isRunning ? Colors.green : Colors.red,
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.encephalonEmbeddedRuntime,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _statusText(l10n, state.status),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (state.port != null) ...[
              const SizedBox(height: 8),
              Text(l10n.encephalonPort(state.port!)),
              Text('neuron: http://127.0.0.1:${state.port}'),
            ],
            if (state.errorMessage != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  state.errorMessage!,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ],
            const SizedBox(height: 12),
            // 启动/停止。
            //
            // 嵌入式大脑是**默认启动**的（App 一起来就拉起），所以
            // 「启动大脑」**只在没在跑的时候露出来** —— 它是失败/手动
            // 停掉之后的**恢复入口**，不是「用这个功能之前要先打开的
            // 开关」。跑着的时候只给一个「停止大脑」（省资源 / 排障）。
            Row(
              children: [
                if (!isRunning)
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => notifier.start(),
                      icon: const Icon(Icons.play_arrow),
                      label: Text(l10n.encephalonStart),
                    ),
                  ),
                if (isRunning)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => notifier.stop(),
                      icon: const Icon(Icons.stop),
                      label: Text(l10n.encephalonStop),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInferCard(
    BuildContext context,
    AppLocalizations l10n,
    EncephalonMobileState state,
  ) {
    final canInfer = state.status == EncephalonMobileStatus.running;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.encephalonInferTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.encephalonInferHint,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _inputController,
              enabled: canInfer,
              maxLines: 3,
              minLines: 1,
              decoration: InputDecoration(
                labelText: l10n.encephalonInferPrompt,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: canInfer && !_isInferring ? () => _runInfer(l10n) : null,
              icon: _isInferring
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: Text(l10n.encephalonInferRun),
            ),
            if (_output.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: SelectableText(_output),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 跑一次进程内推理：请求体直接进 neuron's adapter 管线。
  Future<void> _runInfer(AppLocalizations l10n) async {
    final prompt = _inputController.text.trim();
    if (prompt.isEmpty) return;

    setState(() {
      _isInferring = true;
      _output = '';
    });

    try {
      final service = ref.read(encephalonMobileServiceProvider);
      final body = utf8.encode(
        '{"model":"probe","max_tokens":32,"messages":['
        '{"role":"user","content":${_jsonEscape(prompt)}}]}',
      );
      final result = await service.infer(
        path: '/v1/chat/completions',
        body: Uint8List.fromList(body),
      );
      if (!mounted) return;
      setState(() {
        _isInferring = false;
        _output = result == null
            ? l10n.encephalonInferFailed
            : 'HTTP ${result.status}\n\n${result.bodyText}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isInferring = false;
        _output = '$e';
      });
    }
  }

  /// 把用户输入转成 JSON 字符串字面量（含转义）。
  static String _jsonEscape(String value) {
    final escaped = value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r')
        .replaceAll('\t', '\\t');
    return '"$escaped"';
  }

  String _statusText(AppLocalizations l10n, EncephalonMobileStatus status) {
    switch (status) {
      case EncephalonMobileStatus.stopped:
        return l10n.encephalonStatusStopped;
      case EncephalonMobileStatus.starting:
        return l10n.encephalonStatusStarting;
      case EncephalonMobileStatus.running:
        return l10n.encephalonStatusRunning;
      case EncephalonMobileStatus.stopping:
        return l10n.encephalonStatusStopping;
      case EncephalonMobileStatus.error:
        return l10n.encephalonStatusError;
    }
  }
}
