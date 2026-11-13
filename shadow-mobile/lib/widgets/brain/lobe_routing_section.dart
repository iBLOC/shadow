import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import 'lobe_capability_row.dart';
import 'lobe_model_override_row.dart';

/// 「默认模型」卡里的**叶区段** —— 每个原生叶区一行：跟随全局默认，
/// 还是单独用自己的对话模型；语音识别 / 语音合成还能各自再单独指定。
///
/// 模型使用的最小单位是叶区：全局默认说的是「没单独指定的叶区用哪个」，
/// 这一段说的是「哪些叶区单独指定了」⇒ ⇒ 两件事挨着放，混合态一眼看全
/// （前额叶走云端、颞叶留在本地、颞叶的语音识别又用另一个引擎 …）。
///
/// ⚠️ 叶区清单**直读端脑**（不硬编码）：读不到就说读不到，不画成
/// 「这台大脑没有叶区」。
class LobeRoutingSection extends ConsumerWidget {
  const LobeRoutingSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final lobesAsync = ref.watch(nativeLobesProvider);
    final textTheme = Theme.of(context).textTheme;
    // ⚠️ 哪些档有 per-lobe 消费点 —— **由端脑说**（`engine_resolved`），
    // 客户端不自己列举：端脑加了档，这里自动多一行。
    // ⚠️ **不再排除 `llm`**：端脑的 `engine_resolved` 本来就不含 llm
    // （对话走 `lobe_models` 路由面，在这张卡的上半段）；写死排除反而会
    // 把「哪天端脑把某档挪进路由面」这件事判错。
    final perLobeTiers = ref.watch(
      capabilityDefaultsProvider.select(
        (v) => v.valueOrNull?.engineResolved ?? const <String>[],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 24),
        Text(l10n.encephalonLobeRoutingTitle, style: textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(l10n.brainLobeSectionHint, style: textTheme.bodySmall),
        const SizedBox(height: 8),
        lobesAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(12),
            child: Center(child: CircularProgressIndicator()),
          ),
          // ⚠️ **直接显示端脑的原话** —— 与同卡的分档那几行同一口径
          // （排查时要看得到它到底说了什么）。
          error: (e, _) => Text(e.toString(), style: textTheme.bodySmall),
          data: (lobes) {
            if (lobes.isEmpty) {
              return Text(l10n.brainLobeListEmpty, style: textTheme.bodySmall);
            }
            return Column(
              children: [
                for (final lobe in lobes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        LobeModelOverrideRow(
                          lobe: lobe.name,
                          title: lobe.name,
                          subtitle: lobe.description,
                        ),
                        for (final cap in perLobeTiers)
                          LobeCapabilityRow(lobe: lobe.name, capability: cap),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
