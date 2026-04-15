import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassBottomNavItem {
  final IconData icon;
  final String label;

  const GlassBottomNavItem({required this.icon, required this.label});
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
              icon: _buildIcon(
                item.icon,
                isSelected: isSelected,
                isDark: isDark,
              ),
              selectedIcon: _buildSelectedIcon(item.icon),
              label: item.label,
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildIcon(
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
    return _buildSelectedIcon(icon);
  }

  Widget _buildSelectedIcon(IconData icon) {
    // Neon Glow 效果 - 选中项有发光背景
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
}
