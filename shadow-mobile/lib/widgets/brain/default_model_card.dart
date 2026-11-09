import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../services/encephalon/encephalon_mobile_provider.dart';
import '../glass_card.dart';
import 'capability_default_section.dart';

/// 「默认模型」卡 —— **全局默认**的大脑模型来源选择。
///
/// 这是「大脑用哪个模型回答」的唯一全局入口，住在能力 tab 落地首屏
/// （从嵌入式大脑页搬上来 —— 那页是运行时/排障面，模型选择埋在那里
/// 用户找不到 ⇒ 「无处设置默认模型」）。叶区级的单独覆盖在叶区
/// Agents 页（每个 agent 行内的下拉），两处共用同一份状态与下发链。
///
/// ⚠️ 选项**直读大脑**的供应商目录（App 本地不镜像供应商表）：
/// loading / error 都要说真话，不许静默空列表装作「没有云供应商」。
/// ⚠️ 写入走 `EncephalonMobileNotifier.applyModelSource` —— 与嵌入式大脑页
/// 同一条链（落盘 + 下发大脑，不重启生效），这里不另造一条写路径。
class DefaultModelCard extends ConsumerWidget {
  const DefaultModelCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final sourceState = ref.watch(brainModelSourceProvider);
    final optionsAsync = ref.watch(brainProviderOptionsProvider);

    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.star_outline,
                size: 20,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.encephalonModelSourceTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            l10n.encephalonModelSourceHint,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          optionsAsync.when(
            data: (options) => _DefaultModelChoices(
              sourceState: sourceState,
              options: options,
            ),
            loading: () => const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: CircularProgressIndicator()),
            ),
            // 读不到目录 ⇒ 说真话（大脑没起 / 钥匙不对 / 地址不对），
            // 不画成「没有可选模型」。
            error: (_, _) => Text(
              l10n.encephalonModelOptionsUnavailable,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          // ⚠️ **「来源」之上还有一层「分档默认」** —— 「走本地还是走云端」
          // 说的是**哪一边**，而「文本 / 语音识别 / 语音合成 各用哪个模型」
          // 说的是**哪一个** ⇒ ⇒ 两件事，两个界面。
          const CapabilityDefaultSection(),
        ],
      ),
    );
  }
}

/// 默认模型的选择列表（按模态分组：文本模型 / 视觉模型）。
class _DefaultModelChoices extends ConsumerWidget {
  final BrainModelSourceState sourceState;
  final List<BrainModelOption> options;

  const _DefaultModelChoices({
    required this.sourceState,
    required this.options,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final notifier = ref.read(encephalonMobileProvider.notifier);

    final textOptions = [
      for (final o in options)
        if (o.chatCategory == ModelChatCategory.text) o,
    ];
    final visionOptions = [
      for (final o in options)
        if (o.chatCategory == ModelChatCategory.vision) o,
    ];

    // 实际在用的是哪个 —— 用户没显式选过时是「自动」（第一条可对话
    // 选项，没有就是本地权重）。resolve 与下发链用**同一份**选项列表。
    final effective = BrainModelSource.resolve(sourceState.source, options);
    final selected = effective?.id ?? BrainModelSource.local;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RadioGroup<String>(
          groupValue: selected,
          onChanged: (value) async {
            if (value == null) return;
            final source = value == BrainModelSource.local
                ? BrainModelSource.localSource
                : BrainModelSource.cloud(value);
            final ok = await notifier.applyModelSource(source);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.encephalonModelSourceApplied
                      : l10n.encephalonModelSourceFailed,
                ),
              ),
            );
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RadioListTile<String>(
                value: BrainModelSource.local,
                title: Text(l10n.encephalonModelLocalNeuron),
              ),
              // ── 文本模型（对话）──────────────────────────
              if (textOptions.isNotEmpty) ...[
                _GroupLabel(label: l10n.modelCategoryText),
                for (final o in textOptions)
                  RadioListTile<String>(
                    value: o.id,
                    title: Text(o.name),
                    subtitle: Text(
                      '${o.baseUrl} · ${o.model}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
              // ── 视觉模型（文本 + 图像输入）───────────────
              if (visionOptions.isNotEmpty) ...[
                _GroupLabel(label: l10n.modelCategoryVision),
                for (final o in visionOptions)
                  RadioListTile<String>(
                    value: o.id,
                    title: Text(o.name),
                    subtitle: Text(
                      '${o.baseUrl} · ${o.model}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ],
          ),
        ),
        if (options.isEmpty) ...[
          const SizedBox(height: 8),
          Text(
            l10n.encephalonModelNoCloudProvider,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _GroupLabel extends StatelessWidget {
  final String label;

  const _GroupLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, top: 8, bottom: 4),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: Theme.of(context).colorScheme.primary,
            ),
      ),
    );
  }
}
