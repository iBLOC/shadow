import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class GlassBottomNavItem {
  final IconData icon;
  final String label;

  const GlassBottomNavItem({required this.icon, required this.label});
}

/// 未选中态的玻璃主题图标。
///
/// 提为公开是给 [GlassNavRail] 复用的 —— 侧边栏与底部栏是同一个
/// 选中态形状（Neon Glow），抄第二份迟早漂。
Widget glassNavIcon(
  IconData icon, {
  required bool isSelected,
  required bool isDark,
}) {
  if (!isSelected) {
    return Icon(
      icon,
      color: isDark
          ? AppColors.darkTextSecondary
          : AppColors.lightTextSecondary,
    );
  }
  return glassNavSelectedIcon(icon);
}

/// 选中态的玻璃主题图标 —— Neon Glow 效果，选中项有发光背景。
Widget glassNavSelectedIcon(IconData icon) {
  return Container(
    padding: const EdgeInsets.all(8),
    decoration: BoxDecoration(
      color: AppColors.primary.withValues(alpha: 0.15),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(
        color: AppColors.primary.withValues(alpha: 0.3),
        width: 1,
      ),
      boxShadow: [
        BoxShadow(
          color: AppColors.primary.withValues(alpha: 0.2),
          blurRadius: 12,
          spreadRadius: 0,
        ),
      ],
    ),
    child: Icon(icon, color: AppColors.primary),
  );
}

class GlassBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<GlassBottomNavItem> items;

  const GlassBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.darkSurface.withValues(alpha: 0.95)
            : AppColors.lightSurface.withValues(alpha: 0.95),
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            width: 0.5,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: NavigationBar(
          selectedIndex: currentIndex,
          onDestinationSelected: onTap,
          backgroundColor: Colors.transparent,
          elevation: 0,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: items.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            final isSelected = index == currentIndex;

            return NavigationDestination(
              icon: glassNavIcon(
                item.icon,
                isSelected: isSelected,
                isDark: isDark,
              ),
              selectedIcon: glassNavSelectedIcon(item.icon),
              label: item.label,
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// 宽屏（折叠屏展开 / 平板，≥ 600dp）用的侧边栏 ——
/// [GlassBottomNav] 的姊妹组件，同一批 tab 数据、同一个选中态形状。
class GlassNavRail extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<GlassBottomNavItem> items;

  const GlassNavRail({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.darkSurface.withValues(alpha: 0.95)
            : AppColors.lightSurface.withValues(alpha: 0.95),
        border: Border(
          right: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            width: 0.5,
          ),
        ),
      ),
      child: SafeArea(
        right: false,
        bottom: false,
        child: NavigationRail(
          selectedIndex: currentIndex,
          onDestinationSelected: onTap,
          backgroundColor: Colors.transparent,
          labelType: NavigationRailLabelType.all,
          leading: const SizedBox(height: 8),
          destinations: items.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            final isSelected = index == currentIndex;

            return NavigationRailDestination(
              icon: glassNavIcon(
                item.icon,
                isSelected: isSelected,
                isDark: isDark,
              ),
              selectedIcon: glassNavSelectedIcon(item.icon),
              label: Text(item.label),
            );
          }).toList(),
        ),
      ),
    );
  }
}
