import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
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
  /// 底部导航的 6 个入口。label 走 l10n —— 之前这里是硬编码英文
  /// （'Chat' / 'Live' / 'Service' / 'Tasks' / 'Manage' / 'Settings'），
  /// 中文用户看到的是六个英文 tab。
  List<GlassBottomNavItem> _navItems(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return [
      GlassBottomNavItem(
        icon: Icons.chat_bubble_outline,
        label: l10n.navChat,
      ),
      GlassBottomNavItem(icon: Icons.live_tv, label: l10n.navLive),
      GlassBottomNavItem(icon: Icons.headset_mic, label: l10n.navService),
      GlassBottomNavItem(icon: Icons.task_alt, label: l10n.navTasks),
      GlassBottomNavItem(
        icon: Icons.dashboard_customize,
        label: l10n.navManage,
      ),
      GlassBottomNavItem(
        icon: Icons.settings_outlined,
        label: l10n.navSettings,
      ),
    ];
  }

  /// 当前路径该高亮哪个 tab。
  ///
  /// 必须用**前缀**匹配：之前是精确相等，于是 `/settings/model`、
  /// `/settings/prompt`、`/settings/prefrontal`、`/settings/encephalon`、
  /// `/voice`、`/group`、`/flows` 这 7 条路由全部落到 `return 0` ——
  /// 用户点进「嵌入式大脑」设置页，底部高亮却跳回「Chat」。
  int _getSelectedIndex() {
    final path = widget.currentPath;

    // 长前缀优先：`/settings/model` 要先于 `/settings` 命中。
    if (path.startsWith('/settings')) return 5;
    if (path.startsWith('/manage')) return 4;
    // 旧的深层链接（`/agents`、`/models` …）重定向到 `/manage/*`。
    if (path.startsWith('/agents') ||
        path.startsWith('/models') ||
        path.startsWith('/providers') ||
        path.startsWith('/mcp') ||
        path.startsWith('/skills') ||
        path.startsWith('/memory')) {
      return 4;
    }
    if (path.startsWith('/tasks') || path.startsWith('/conversations')) {
      return 3;
    }
    if (path.startsWith('/livestream')) return 1;
    if (path.startsWith('/customer-service')) return 2;
    if (path.startsWith('/group')) return 4;
    if (path.startsWith('/flows')) return 5;
    if (path.startsWith('/discovery') ||
        path.startsWith('/logs') ||
        path.startsWith('/resonance')) {
      return 5;
    }
    // `provisioning_screen.dart` 还没接路由（页面存在但无入口）；
    // 一旦接上，这里就会自动高亮 Settings，不用再改。
    if (path == '/provision') return 5;
    if (path == '/' || path.startsWith('/chat') || path.startsWith('/voice')) {
      return 0;
    }
    return 0;
  }

  void _onDestinationSelected(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/livestream');
        break;
      case 2:
        context.go('/customer-service');
        break;
      case 3:
        context.go('/tasks');
        break;
      case 4:
        context.go('/manage');
        break;
      case 5:
        context.go('/settings');
        break;
    }
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
