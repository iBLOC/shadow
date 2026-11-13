import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../models/capability_labels.dart';

/// 「默认模型」卡里**对话以外**的那几行 —— 语音识别 / 语音合成 / 图片生成 …
/// 每一类各自一个默认模型。
///
/// ## 为什么要有这一段
///
/// ⚠️ 以前「默认模型」只有**一个**槽（文本）⇒ ⇒ 「语音识别用哪个模型」
/// 「语音合成用哪个模型」这件事**界面上没人管** ⇒ ⇒ 端脑只能拿「第一个
/// 注册的引擎」⇒ ⇒ 用户选的语音模型**根本没人用**（失败长得像成功）。
///
/// 现在每一类能力各有一个默认模型（端脑的 `Capability` 词表是单一真源）
/// ⇒ ⇒ 界面照端脑给的词表渲染，不自己造词。
///
/// ## 只给「选了真有用」的档
///
/// ⚠️ 端脑词表里**不是每一档都有读者**（见 [consumedCapabilityTiers]）：
/// - 对话档（llm）走路由面 ⇒ ⇒ 在卡片顶上那一行，**不在这里**（以前这里
///   也画了一行「文本」⇒ ⇒ 同一页两个文本模型入口、只有一个生效）；
/// - 端脑不读的档（向量 / 重排 / …）⇒ ⇒ 不给下拉，只说一句「暂时没得选」。
///
/// ## 写路径
///
/// ⚠️ **先下发端脑、成功了才落本地** —— 反过来做的话，端脑拒了（比如那个
/// 模型 id 没注册）而本地已经记下 ⇒ ⇒ 界面显示「已设置」⇒ ⇒ 实际没生效
/// ⇒ ⇒ 失败长得像成功。
///
/// ⚠️ 下发的是**整份**（端脑那一面是整份替换）⇒ ⇒ 所以要把本地副本与
/// 端脑当前值**合并**后再发，否则会把端脑那边已有的档位抹掉。
class CapabilityDefaultSection extends ConsumerWidget {
  const CapabilityDefaultSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final viewAsync = ref.watch(capabilityDefaultsProvider);
    final candidatesAsync = ref.watch(capabilityOptionsProvider);

    return viewAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: CircularProgressIndicator()),
      ),
      // 读不到端脑 ⇒ 说真话（端脑没起 / 钥匙不对 / 地址不对），
      // 不画成「没有这一档」。
      //
      // ⚠️ **直接显示端脑的原话**（不套一层「错误详情」模板）⇒ ⇒
      // 排查时能看到**它到底说了什么**（404 / 403 / 连接失败）。
      error: (_, e) => Text(
        e.toString(),
        style: Theme.of(context).textTheme.bodySmall,
      ),
      data: (view) {
        final candidates =
            candidatesAsync.valueOrNull ??
            const <String, List<CapabilityCandidateOption>>{};
        final local = ref.watch(brainModelSourceProvider).capabilityDefaults;
        if (view.capabilities.isEmpty) {
          return Text(
            l10n.capabilityDefaultsEmpty,
            style: Theme.of(context).textTheme.bodySmall,
          );
        }
        final tiers = consumedCapabilityTiers(
          view.capabilities,
          view.engineResolved,
        );
        final notRead = unconsumedCapabilityTiers(
          view.capabilities,
          view.engineResolved,
        );
        // ⚠️ **当前默认值此刻用不了** ⇒ ⇒ 必须说出来 —— 「存得进去、
        // 用不了」若界面不吭声 ⇒ ⇒ 用户以为配好了 ⇒ ⇒ 真到用语音时
        // 才发现 503 ⇒ ⇒ 失败长得像成功。
        //
        // ⚠️ 放行表用**这一页真正提供的候选**（`candidates`）＝「已注册 ∪
        // 目录面（仅 image_gen）」⇒ ⇒ 与下拉里能选的那些是**同一份** ⇒ ⇒
        // 不会出现「下拉里有、下面却标它用不了」这种自相矛盾。
        final unusable = unusableCapabilityDefaults(
          view.defaults,
          view.engineResolved,
          view.registered,
          catalog: {
            for (final entry in candidates.entries)
              entry.key: [for (final o in entry.value) o.id],
          },
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (unusable.isNotEmpty) ...[
              Text(
                l10n.capabilityDefaultsUnusableNow,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
              for (final u in unusable)
                Text(
                  '${catalogCapabilityLabel(l10n, u.capability)} · ${u.modelId}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              const SizedBox(height: 8),
            ],
            for (final cap in tiers)
              _CapabilityRow(
                capability: cap,
                // ⚠️ 端脑是**当前值的真源**；端脑刚重启（运行态槽清空）
                // 而本地还留着 durable 副本时 ⇒ ⇒ 显示本地的值，
                // 但**不假装它已经在端脑生效**（下发在保存时做）。
                current: view.defaults[cap] ?? local[cap],
                candidates: candidates[cap] ?? const [],
              ),
            // ⚠️ 端脑不读的档 ⇒ ⇒ **说出来**，不是悄悄藏掉（用户会找
            // 「向量模型去哪了」）⇒ ⇒ 也不给下拉（选了没人用）。
            if (notRead.isNotEmpty)
              Text(
                l10n.brainTiersNotReadNote(
                  notRead
                      .map((cap) => catalogCapabilityLabel(l10n, cap))
                      .join(' / '),
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        );
      },
    );
  }
}

/// 一行 = 一个能力档位。
class _CapabilityRow extends ConsumerWidget {
  final String capability;
  final String? current;
  final List<CapabilityCandidateOption> candidates;

  const _CapabilityRow({
    required this.capability,
    required this.current,
    required this.candidates,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final value = current ?? '';

    // ⚠️ **当前值不在候选里也要显示出来** —— 那个模型可能已经被删了，
    // 也可能本来就不在目录里（本地权重）⇒ ⇒ 抹掉它 = 静默改掉用户设置。
    final items = <DropdownMenuItem<String>>[
      DropdownMenuItem(
        value: '',
        child: Text(l10n.capabilityDefaultUnset),
      ),
      for (final c in candidates)
        DropdownMenuItem(
          value: c.id,
          child: Text(c.label),
        ),
      if (value.isNotEmpty && !candidates.any((c) => c.id == value))
        DropdownMenuItem(
          value: value,
          child: Text(value),
        ),
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<String>(
        // ⚠️ key 里带当前值 ⇒ ⇒ 保存后这一行会**重建** ⇒ ⇒ 下拉框里
        // 显示的是新值（`initialValue` 只在首次 build 时读）。
        key: ValueKey<String>('cap-default-$capability-$value'),
        initialValue: value,
        decoration: InputDecoration(
          labelText: catalogCapabilityLabel(l10n, capability),
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        items: items,
        onChanged: (v) => _apply(context, ref, v),
      ),
    );
  }

  /// 下发这一档 —— **先端脑、后本地**。
  Future<void> _apply(BuildContext context, WidgetRef ref, String? id) async {
    final l10n = AppLocalizations.of(context)!;
    final client = ref.read(telencephalonClientProvider);
    final messenger = ScaffoldMessenger.of(context);

    // ⚠️ 整份替换 ⇒ ⇒ 基线 = 本地副本 ∪ 端脑当前值（别把另一边的抹掉）。
    final local = ref.read(brainModelSourceProvider).capabilityDefaults;
    final view = ref.read(capabilityDefaultsProvider).valueOrNull;
    final trimmed = (id ?? '').trim();
    final next = mergeCapabilityDefaultsForPush(
      local: local,
      remote: view?.defaults ?? const {},
      capability: capability,
      model: trimmed,
    );

    try {
      await client.setCapabilityDefaults(next);
      // ⚠️ 端脑收下了才落本地（顺序反了就会出现「界面说已设置、实际没有」）。
      final persisted = await ref
          .read(brainModelSourceProvider.notifier)
          .setCapabilityDefault(capability, trimmed.isEmpty ? null : trimmed);
      ref.invalidate(capabilityDefaultsProvider);
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            persisted
                ? l10n.encephalonModelSourceApplied
                // ⚠️ **本地副本没存住 ⇒ 要说清** —— 端脑那份已经是权威了，
                // 但「重启后这一档会回到默认」必须让用户知道。
                : l10n.capabilityDefaultsAppliedButNotCached,
          ),
        ),
      );
    } catch (e) {
      // ⚠️ **说真话**：把端脑的原话带出来（它会说清是「键不认识」还是
      // 「模型没注册」）⇒ ⇒ 不许只弹一句「失败」。
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text('${l10n.encephalonModelSourceFailed}: $e'),
        ),
      );
    }
  }
}
