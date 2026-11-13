import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../services/encephalon/encephalon_mobile_provider.dart';

/// 「跟随全局默认」在下拉框里的哨兵值。
///
/// 不能用空串 —— `DropdownButton` 的 value 语义是「精确匹配某一项」，
/// 空串容易和别的空值撞在一起。
const String _kFollowGlobal = '__follow_global__';

/// 一个叶区的「对话模型」覆盖行：跟随全局 / 本地权重 / 某个云端。
///
/// 能力 tab 首卡的叶区段与叶区 Agents 页**共用这一行** —— 同一份状态
/// （`brainModelSourceProvider`）、同一条下发链（`applyLobeOverride`），
/// 两处改的是同一件事，就不许有两份实现各算各的。
///
/// ⚠️ 只管**对话模型**这一类：端脑的 per-lobe 覆盖（路由负载的
/// `lobe_models`）只有这一维；语音等分档默认端脑只给了全局。
class LobeModelOverrideRow extends ConsumerWidget {
  /// 叶区名（端脑登记表里的名字 —— 路由负载 `lobe_models` 的键）。
  final String lobe;

  /// 行首标题（null = 不画 —— 宿主自己已经画了叶区是谁）。
  final String? title;

  /// 标题下的一行说明（叶区是干什么的；空 = 不画）。
  final String? subtitle;

  const LobeModelOverrideRow({
    super.key,
    required this.lobe,
    this.title,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final sourceState = ref.watch(brainModelSourceProvider);
    final options =
        ref.watch(brainProviderOptionsProvider).value ??
        const <BrainModelOption>[];

    final override = sourceState.lobeOverrides[lobe];
    final rawValue = override?.raw ?? _kFollowGlobal;

    // 覆盖指向的供应商**被删了** ⇒ 下拉框里没有这一项 ⇒ 退回「跟随
    // 全局」。（不退回的话 `DropdownButton` 会因为找不到匹配项而断言失败 ——
    // 整个页面直接崩。）
    final selectable = <String>{
      _kFollowGlobal,
      BrainModelSource.local,
      for (final o in options) BrainModelSource.cloud(o.id).raw ?? '',
    };
    final currentValue =
        selectable.contains(rawValue) ? rawValue : _kFollowGlobal;

    // 「当前实际生效」—— 跟路由负载用**同一套**算法
    // （`effectiveLobeSource`），否则界面显示的跟实际跑的不是一回事。
    final effective = effectiveLobeSource(
      routing: sourceState.routing,
      lobe: lobe,
      options: options,
    );

    final textTheme = Theme.of(context).textTheme;
    final description = subtitle?.trim() ?? '';

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title != null) Text(title!, style: textTheme.titleSmall),
              if (description.isNotEmpty)
                Text(
                  description,
                  style: textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              Text(
                _effectiveText(l10n, effective, options),
                style: textTheme.bodySmall,
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
              value: _kFollowGlobal,
              child: Text(l10n.encephalonLobeFollowGlobal),
            ),
            DropdownMenuItem(
              value: BrainModelSource.local,
              child: Text(l10n.encephalonModelLocalNeuron),
            ),
            for (final o in options)
              DropdownMenuItem(
                value: BrainModelSource.cloud(o.id).raw,
                child: Text(o.name),
              ),
          ],
          onChanged: (value) async {
            if (value == null) return;
            final source = value == _kFollowGlobal
                ? const BrainModelSource.auto()
                : BrainModelSource.parse(value);
            final ok = await ref
                .read(encephalonMobileProvider.notifier)
                .applyLobeOverride(lobe, source);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.encephalonLobeRoutingApplied
                      : l10n.encephalonLobeRoutingFailed,
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  /// 「当前用的是哪个」的说明文字。
  String _effectiveText(
    AppLocalizations l10n,
    BrainModelSource effective,
    List<BrainModelOption> options,
  ) {
    if (effective.isLocal) return l10n.encephalonLobeEffectiveLocal;
    final id = effective.cloudModelId;
    if (id == null) {
      // 「自动」= 第一条可对话选项（options 已过滤 ⇒ 直接取第一条）。
      return options.isEmpty
          ? l10n.encephalonLobeEffectiveLocal
          : l10n.encephalonLobeEffectiveCloud(options.first.name);
    }
    for (final o in options) {
      if (o.id == id) return l10n.encephalonLobeEffectiveCloud(o.name);
    }
    return l10n.encephalonLobeEffectiveLocal;
  }
}
