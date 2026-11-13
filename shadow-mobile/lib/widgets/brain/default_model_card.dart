import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../services/encephalon/encephalon_mobile_provider.dart';
import '../glass_card.dart';
import 'capability_default_section.dart';
import 'lobe_routing_section.dart';

/// 「默认模型」卡 —— 大脑**每一类**模型各用哪个，以及哪些叶区单独指定了。
///
/// 住在能力 tab 落地首屏，是「大脑用哪个模型」的唯一全局入口。
///
/// ## 不是二选一
///
/// ⚠️ 以前这张卡是一组单选（本地权重 / 某个云端）⇒ ⇒ 读起来像「整个大脑
/// 要么本地、要么云端」。实际上大脑是**混合态**：每一类模型各有各的默认
/// （对话可以走云端、语音识别留在本地），每个叶区还能单独换一边。
/// ⇒ ⇒ 所以卡片是一张**按类的表**，一类一行，各选各的：
///
/// - **对话模型**（[_ChatModelRow]）—— 本地权重或某个云端；写路由面
///   （`applyModelSource` ⇒ 落盘 + 下发大脑，不重启生效）；
/// - **语音识别 / 语音合成 / 图片生成 …**（[CapabilityDefaultSection]）——
///   端脑真的会读的那几档，写分档默认面；
/// - **叶区**（[LobeRoutingSection]）—— 跟随上面的对话模型，或单独指定；
///   与叶区 Agents 页是同一行组件、同一份状态。
///
/// ⚠️ 选项**直读大脑**的供应商目录（App 本地不镜像供应商表）：
/// loading / error 都要说真话，不许静默空列表装作「没有云供应商」。
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
          const SizedBox(height: 12),
          optionsAsync.when(
            data: (options) => _ChatModelRow(
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
          const SizedBox(height: 12),
          const CapabilityDefaultSection(),
          const LobeRoutingSection(),
        ],
      ),
    );
  }
}

/// 「对话模型」这一行 —— 全局默认的对话模型：本地权重，或某个云端。
///
/// 文本模型与视觉模型都是对话上游（视觉 = 还能看图的对话模型）⇒ ⇒
/// 同一个下拉里，每条带上自己是哪一种。
class _ChatModelRow extends ConsumerWidget {
  final BrainModelSourceState sourceState;
  final List<BrainModelOption> options;

  const _ChatModelRow({
    required this.sourceState,
    required this.options,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final notifier = ref.read(encephalonMobileProvider.notifier);

    // 实际在用的是哪个 —— 用户没显式选过时是「自动」（第一条可对话
    // 选项，没有就是本地权重）。resolve 与下发链用**同一份**选项列表。
    final effective = BrainModelSource.resolve(sourceState.source, options);
    final selected = effective?.id ?? BrainModelSource.local;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          // ⚠️ key 里带当前值 ⇒ ⇒ 换完之后这一行会**重建** ⇒ ⇒ 下拉框里
          // 显示的是新值（`initialValue` 只在首次 build 时读）。
          key: ValueKey<String>('chat-default-$selected'),
          initialValue: selected,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: l10n.brainChatModelLabel,
            border: const OutlineInputBorder(),
            isDense: true,
          ),
          items: [
            DropdownMenuItem(
              value: BrainModelSource.local,
              child: Text(l10n.encephalonModelLocalNeuron),
            ),
            for (final o in options)
              DropdownMenuItem(
                value: o.id,
                child: Row(
                  children: [
                    Flexible(
                      child: Text(o.name, overflow: TextOverflow.ellipsis),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      o.chatCategory == ModelChatCategory.vision
                          ? l10n.modelCategoryVision
                          : l10n.modelCategoryText,
                      style: textTheme.labelSmall?.copyWith(
                        color: scheme.primary,
                      ),
                    ),
                  ],
                ),
              ),
          ],
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
        ),
        const SizedBox(height: 6),
        // 这一类此刻落在哪一边 —— 混合态要一眼看得出来。
        Row(
          children: [
            _SourceBadge(
              label: effective == null
                  ? l10n.brainModelBadgeLocal
                  : l10n.brainModelBadgeCloud,
            ),
            if (effective != null) ...[
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${effective.baseUrl} · ${effective.model}',
                  style: textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ],
        ),
        if (options.isEmpty) ...[
          const SizedBox(height: 8),
          Text(l10n.encephalonModelNoCloudProvider, style: textTheme.bodySmall),
        ],
      ],
    );
  }
}

/// 「本地 / 云端」小徽章。
class _SourceBadge extends StatelessWidget {
  final String label;

  const _SourceBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: scheme.primary,
            ),
      ),
    );
  }
}
