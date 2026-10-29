import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
import '../navigation/nav.g.dart';
import '../theme/app_colors.dart';
import 'glass_bottom_nav.dart';

class MainShell extends StatefulWidget {
  final Widget child;
  final String currentPath;

  const MainShell({super.key, required this.child, required this.currentPath});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  /// 底部导航的 4 个入口：**对话 / 任务 / 能力 / 我**。
  ///
  /// 导航结构来自仓根 `agent-surface.json`（由 scripts/gen_nav.mjs 生成）。
  /// 之前这里是 6 个硬编码 tab，其中「直播 / 客服」其实是同一个 agent 的
  /// **对话形态**，不是并列目的地 —— 现在降级为对话页顶部的形态切换器。
  List<GlassBottomNavItem> _navItems(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return [
      for (final tab in mobileNavTabs)
        GlassBottomNavItem(icon: tab.icon, label: navLabel(l10n, tab.labelKey)),
    ];
  }

  /// 当前路径该高亮哪个 tab。
  ///
  /// 规则来自生成的清单，不在这里硬编码：
  ///  - 对话 tab 额外覆盖所有对话形态的路由（语音 / 直播 / 客服）
  ///  - 其余按 tab 的 alsoRoutes + 路由前缀匹配（长的优先）
  int _getSelectedIndex() {
    final path = widget.currentPath;

    // 对话：对话本身 + 所有对话形态
    final chatIndex = mobileNavTabs.indexWhere((t) => t.id == 'chat');
    if (chatIndex >= 0) {
      if (path == '/' || conversationModes.any((m) => m.route == path)) {
        return chatIndex;
      }
    }

    // 其余：精确命中 → alsoRoutes → 前缀匹配
    for (var i = 0; i < mobileNavTabs.length; i++) {
      final tab = mobileNavTabs[i];
      if (tab.route == path) return i;
      if (tab.alsoRoutes.contains(path)) return i;
    }
    for (var i = 0; i < mobileNavTabs.length; i++) {
      final route = mobileNavTabs[i].route;
      if (route == '/') continue;
      if (path.startsWith('$route/')) return i;
    }
    return 0;
  }

  void _onDestinationSelected(BuildContext context, int index) {
    if (index < 0 || index >= mobileNavTabs.length) return;
    context.go(mobileNavTabs[index].route);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.darkGradient : AppColors.lightGradient,
        ),
        child: widget.child,
      ),
      bottomNavigationBar: GlassBottomNav(
        currentIndex: _getSelectedIndex(),
        onTap: (index) => _onDestinationSelected(context, index),
        items: _navItems(context),
      ),
    );
  }
}
