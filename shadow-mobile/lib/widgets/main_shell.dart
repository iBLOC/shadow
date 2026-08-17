import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
  static const _navItems = [
    GlassBottomNavItem(icon: Icons.chat_bubble_outline, label: 'Chat'),
    GlassBottomNavItem(icon: Icons.live_tv, label: 'Live'),
    GlassBottomNavItem(icon: Icons.headset_mic, label: 'Service'),
    GlassBottomNavItem(icon: Icons.task_alt, label: 'Tasks'),
    GlassBottomNavItem(icon: Icons.dashboard_customize, label: 'Manage'),
    GlassBottomNavItem(icon: Icons.settings_outlined, label: 'Settings'),
  ];

  int _getSelectedIndex() {
    final path = widget.currentPath;
    if (path == '/' || path == '/chat') return 0;
    if (path == '/livestream') return 1;
    if (path == '/customer-service') return 2;
    if (path.startsWith('/tasks') || path == '/conversations') return 3;
    if (path.startsWith('/manage') ||
        path == '/agents' ||
        path == '/models' ||
        path == '/providers' ||
        path == '/mcp' ||
        path == '/skills' ||
        path == '/memory') {
      return 4;
    }
    if (path == '/settings' ||
        path == '/discovery' ||
        path == '/logs' ||
        path == '/resonance' ||
        path == '/provision') {
      return 5;
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
        items: _navItems,
      ),
    );
  }
}
