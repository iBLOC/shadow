import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../services/encephalon/encephalon_mobile_provider.dart';
import '../models/capability_labels.dart';

/// 一个叶区**某一档引擎类模型**（语音识别 / 语音合成）的覆盖行：
/// 跟随全局，或单独用某个已注册的引擎。
///
/// ## 「跟随全局」的哨兵
///
/// 就用**空串**。⚠️ 与对话覆盖行那个 `__follow_global__` 不同 —— 对话行的
/// 值域是「供应商 id」且本地/云端各有一个前缀槽；而这一行的值域是
/// **引擎 id**（非空）⇒ 空串是唯一的「没有覆盖」表达，且候选里不可能出现
/// 空 id（`capabilityOptionsByCapability` 已滤空）。
///
/// ## 为什么是这几档
///
/// 端脑按**引擎 id** 解析的档（`engine_resolved`：asr / tts / image_gen）
/// 都有 per-lobe 消费点：voice 面（asr / tts）与 images 面（image_gen）都
/// 认请求体的 `lobe`，并在全局分档默认**之前**查这一格。`llm` 不在这一层
/// （它走 `lobe_models` 路由）。列表**由端脑下发**，客户端不自己列举。
///
/// ⚠️ **谁递 `lobe`**：调用方自己说 —— 语音＝颞叶（`temporal`，它的声明
/// 技能就是 asr/tts）、出图＝枕叶（`occipital`，视觉处理）。端脑**没有**
/// 「会话 → 叶区」那张映射 ⇒ ⇒ 递会话 id 会被静默丢掉（失败长得像成功）。
///
/// ## 候选取哪一面
///
/// ⚠️ **取「已注册面」**（`capabilityOptionsProvider`，端脑用
/// `registered` 说的）—— 引擎档的默认值必须是端脑**按 id 解析得到**的
/// 那个 id，不是目录面（能下载的权重清单）那套命名空间。两套只有少数
/// 恰好同名 ⇒ 拿目录面去填 ⇒ **存得进去、用不了**。
class LobeCapabilityRow extends ConsumerWidget {
  /// 叶区名（端脑登记表里的名字 —— 路由负载的键）。
  final String lobe;

  /// 能力词（端脑词表里的 `asr` / `tts`）。
  final String capability;

  const LobeCapabilityRow({
    super.key,
    required this.lobe,
    required this.capability,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final localOverride = ref.watch(
      brainModelSourceProvider.select(
        (s) => s.lobeCapabilityOverrides[lobe]?[capability],
      ),
    );
    // ⚠️ **端脑那份优先**（别处 —— 桌面矩阵卡 —— 改过的配置要看得见）；
    // 端脑读不到（没起 / 401）⇒ 回落本地 durable 副本。
    final serverOverride = ref.watch(
      capabilityDefaultsProvider.select(
        (v) => v.valueOrNull?.lobeDefaults[lobe]?[capability],
      ),
    );
    final override = serverOverride ?? localOverride;
    // 全局分档默认（这一档此刻跟着走的那一格）—— 只用来显示「当前」。
    final globalDefault = ref.watch(
      capabilityDefaultsProvider.select(
        (v) => v.valueOrNull?.defaults[capability],
      ),
    );
    final localDefault = ref.watch(
      brainModelSourceProvider.select((s) => s.capabilityDefaults[capability]),
    );
    final options = ref.watch(
      capabilityOptionsProvider.select(
        (v) => v.valueOrNull?[capability] ?? const <CapabilityCandidateOption>[],
      ),
    );

    final value = override ?? '';
    final items = <DropdownMenuItem<String>>[
      DropdownMenuItem(
        value: '',
        child: Text(l10n.encephalonLobeFollowGlobal),
      ),
      for (final c in options)
        DropdownMenuItem(value: c.id, child: Text(c.label)),
      // ⚠️ **当前值不在候选里也要显示** —— 那个引擎可能已经被注销
      // （重启进程后注册表清空）⇒ 抹掉它 = 静默改掉用户设置。
      if (value.isNotEmpty && !options.any((c) => c.id == value))
        DropdownMenuItem(value: value, child: Text(value)),
    ];

    final effectiveGlobal = (globalDefault ?? localDefault ?? '').trim();

    return Padding(
      padding: const EdgeInsets.only(left: 24, bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  catalogCapabilityLabel(l10n, capability),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                Text(
                  // 「当前生效」说得出来：覆盖在就用覆盖，否则说全局那份
                  // （全局也没配 ⇒ 「不指定」⇒ 端脑按第一个注册的引擎）。
                  value.isNotEmpty
                      ? l10n.brainLobeCapabilityCurrent(value)
                      : (effectiveGlobal.isNotEmpty
                          ? l10n.brainLobeCapabilityFollowsGlobal(effectiveGlobal)
                          : l10n.capabilityDefaultUnset),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          DropdownButton<String>(
            value: value,
            underline: const SizedBox.shrink(),
            items: items,
            onChanged: (v) async {
              if (v == null) return;
              final ok = await ref
                  .read(encephalonMobileProvider.notifier)
                  .applyLobeCapability(
                    lobe,
                    capability,
                    v.isEmpty ? null : v,
                  );
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
      ),
    );
  }
}
