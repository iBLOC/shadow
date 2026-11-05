import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../services/background/background_run_provider.dart';
import '../../theme/app_tokens.g.dart';
import 'settings_row.dart';

/// 后台常驻设置 —— 客户端要求「支持后台运行」：前台服务保活的开关、
/// 运行状态、电池优化白名单入口（MIUI 等厂商系统不进白名单，
/// 前台服务也保不住）。
class BackgroundRunSettingsGroup extends ConsumerStatefulWidget {
  const BackgroundRunSettingsGroup({super.key});

  @override
  ConsumerState<BackgroundRunSettingsGroup> createState() =>
      _BackgroundRunSettingsGroupState();
}

class _BackgroundRunSettingsGroupState
    extends ConsumerState<BackgroundRunSettingsGroup> {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = ShadTheme.of(context);
    final state = ref.watch(backgroundRunProvider);
    final notifier = ref.read(backgroundRunProvider.notifier);

    return SettingsBlock(
      children: [
        // ① 开关 —— 落盘走 AppConfigService，服务起停跟着开关走。
        SettingsRow(
          title: l10n.backgroundKeepAlive,
          icon: Icons.all_inclusive,
          subtitle: l10n.backgroundKeepAliveHint,
          trailing: ShadSwitch(
            value: state.enabled,
            onChanged: (value) => notifier.setEnabled(value),
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
        ),
        // ② 运行状态 —— 前台服务此刻在不在跑（系统侧事实，不是开关）。
        SettingsRow(
          title: l10n.backgroundServiceStatus,
          icon: Icons.radar,
          subtitle: state.running
              ? l10n.backgroundServiceOn
              : l10n.backgroundServiceOff,
          trailing: Icon(
            state.running ? Icons.check_circle : Icons.remove_circle_outline,
            size: 20,
            color: state.running
                ? theme.colorScheme.primary
                : theme.colorScheme.mutedForeground,
          ),
        ),
        // ③ 电池优化白名单 —— 只在 Android 上出现（别的平台没有这个概念）。
        if (Platform.isAndroid) ...[
          const ShadSeparator.horizontal(
            margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
          ),
          SettingsRow(
            title: l10n.batteryOptimization,
            icon: Icons.battery_saver,
            subtitle: state.batteryExempt
                ? l10n.batteryOptimizationExempt
                : l10n.batteryOptimizationAsk,
            trailing: state.batteryExempt
                ? Icon(
                    Icons.check_circle,
                    size: 20,
                    color: theme.colorScheme.primary,
                  )
                : ShadButton.outline(
                    onPressed: notifier.requestBatteryExemption,
                    child: Text(l10n.batteryOptimizationRequest),
                  ),
          ),
        ],
      ],
    );
  }
}
