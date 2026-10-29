import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../navigation/nav.g.dart';
import '../../theme/app_colors.dart';

/// 对话形态切换条。
///
/// 同一个 agent 的不同**表达形态**（对话 / 语音 / 直播 / 客服）是对话的方式，
/// 不是并列的导航入口 —— 所以它们不进底 tab，由对话页自己切换。
///
/// 形态清单来自仓根 `agent-surface.json`（scripts/gen_nav.mjs 生成）。
class ConversationModeSwitcher extends StatelessWidget {
  const ConversationModeSwitcher({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // 没有 GoRouter 的场景（纯 widget 测试）下优雅降级 —— 不该因为一个
    // 装饰性的切换条把整棵树搞崩。
    final router = GoRouter.maybeOf(context);
    final path = router?.routerDelegate.currentConfiguration.uri.path;

    if (conversationModes.length <= 1 || router == null) {
      return const SizedBox.shrink();
    }

    return Container(
      height: 44,
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: (isDark ? AppColors.darkBorder : AppColors.lightBorder)
                .withValues(alpha: 0.6),
          ),
        ),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: conversationModes.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final mode = conversationModes[index];
          final active = path == mode.route;
          return _ModeChip(
            icon: mode.icon,
            label: navLabel(l10n, mode.labelKey),
            active: active,
            isDark: isDark,
            onTap: () => context.go(mode.route),
          );
        },
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final bool isDark;
  final VoidCallback onTap;

  const _ModeChip({
    required this.icon,
    required this.label,
    required this.active,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final idleText = isDark
        ? AppColors.darkTextSecondary
        : AppColors.lightTextSecondary;
    final idleBorder = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return Semantics(
      button: true,
      selected: active,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: active
                ? AppColors.primary.withValues(alpha: 0.14)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active
                  ? AppColors.primary.withValues(alpha: 0.5)
                  : idleBorder,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 15,
                color: active ? AppColors.primary : idleText,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: active ? AppColors.primary : idleText,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
