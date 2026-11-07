import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import 'encephalon_mobile_provider.dart';

/// Encephalon（大脑）运行时页面 —— **只管运行时**：状态、启停、进程内
/// 推理探针。
///
/// 模型选择不在这里：
/// - **全局默认模型** —— 能力 tab（`/manage`）落地首屏的「默认模型」卡；
/// - **叶区模型覆盖** —— 叶区 Agents 页（`/manage/agents`）行内下拉。
/// 两处与页面的下发链同源（`applyModelSource` / `applyLobeOverride`），
/// 这里不再重复一张选择卡（2026-11-07 页面结构收口刀：原来两张卡埋在
/// 这个排障页里，用户找不到 ⇒「无处设默认模型」＋与能力页流程重复）。
///
/// 运行时语义：
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
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 运行时状态卡片
            _buildStatusCard(context, l10n, state, notifier),

            const SizedBox(height: 16),

            // 进程内推理
            _buildInferCard(context, l10n, state),
          ],
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
