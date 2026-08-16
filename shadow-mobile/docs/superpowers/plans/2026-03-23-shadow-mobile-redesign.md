# Shadow Mobile UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 10 screens in Shadow Mobile with glassmorphism visual design, 4-tab navigation structure, and improved UX.

**Architecture:** 
- Custom glass effect using `BackdropFilter` + `BoxDecoration` (no external glass_kit needed)
- GoRouter with `ShellRoute` for persistent bottom navigation
- Riverpod for state management (continue existing pattern)
- Each widget is a focused, single-responsibility component

**Tech Stack:** Flutter 3.11+, Riverpod, GoRouter, Material Icons

---

## File Structure Overview

```
lib/
├── theme/
│   ├── app_colors.dart           (NEW - color definitions)
│   └── glass_theme.dart          (NEW - theme data)
├── widgets/
│   ├── glass_card.dart           (NEW)
│   ├── glass_button.dart        (NEW)
│   ├── glass_text_field.dart     (NEW)
│   ├── glass_app_bar.dart        (NEW)
│   ├── glass_bottom_nav.dart     (NEW)
│   ├── status_indicator.dart     (NEW)
│   ├── empty_state.dart          (NEW)
│   └── loading_shimmer.dart      (NEW)
├── router/
│   └── app_router.dart          (MODIFY - add ShellRoute)
├── screens/
│   ├── manage/
│   │   └── management_hub_screen.dart  (NEW)
│   └── [existing screens - modify styling only]
└── main.dart                    (MODIFY - apply new theme)
```

---

## Chunk 1: Foundation - Theme & Colors

### Task 1.1: Create App Colors

**Files:**
- Create: `lib/theme/app_colors.dart`

- [ ] **Step 1: Create app_colors.dart with all color definitions**

```dart
import 'package:flutter/material.dart';

class AppColors {
  // Primary colors
  static const Color primary = Color(0xFF3B82F6);
  static const Color primaryVariant = Color(0xFF2563EB);
  static const Color secondary = Color(0xFF8B5CF6);
  
  // Dark mode colors
  static const Color darkBackground = Color(0xFF0F172A);
  static const Color darkBackgroundEnd = Color(0xFF1E293B);
  static const Color darkSurface = Color(0xFF1E293B);
  static const Color darkSurfaceGlass = Color(0x4D1E293B); // 75% opacity
  static const Color darkBorder = Color(0x26FFFFFF); // 15% white
  
  // Light mode colors
  static const Color lightBackground = Color(0xFFF1F5F9);
  static const Color lightBackgroundEnd = Color(0xFFE2E8F0);
  static const Color lightSurface = Color(0xFFF8FAFC);
  static const Color lightSurfaceGlass = Color(0xB3FFFFFF); // 75% white
  static const Color lightBorder = Color(0x4D3B82F6); // 30% blue
  
  // Text colors
  static const Color darkTextPrimary = Color(0xFFF8FAFC);
  static const Color darkTextSecondary = Color(0xFF94A3B8);
  static const Color lightTextPrimary = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF64748B);
  
  // Status colors
  static const Color success = Color(0xFF22C55E);
  static const Color successLight = Color(0xFF4ADE80);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningLight = Color(0xFFFBBF24);
  static const Color error = Color(0xFFEF4444);
  static const Color errorLight = Color(0xFFF87171);
  
  // Gradient for background
  static LinearGradient get darkGradient => const LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [darkBackground, darkBackgroundEnd],
  );
  
  static LinearGradient get lightGradient => const LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [lightBackground, lightBackgroundEnd],
  );
}
```

- [ ] **Step 2: Verify file created**

Run: `ls -la lib/theme/`
Expected: `app_colors.dart` exists

---

### Task 1.2: Create Glass Theme

**Files:**
- Create: `lib/theme/glass_theme.dart`

- [ ] **Step 1: Create glass_theme.dart with complete theme data**

```dart
import 'package:flutter/material.dart';
import 'app_colors.dart';

class GlassTheme {
  static ThemeData get darkTheme => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.dark(
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.darkSurface,
      error: AppColors.error,
    ),
    scaffoldBackgroundColor: Colors.transparent,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: AppColors.darkTextPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w500,
      ),
      iconTheme: IconThemeData(color: AppColors.darkTextPrimary),
    ),
    cardTheme: CardTheme(
      color: AppColors.darkSurfaceGlass,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.darkBorder),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.darkSurfaceGlass,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.darkBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
      hintStyle: const TextStyle(color: AppColors.darkTextSecondary),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(color: AppColors.darkTextPrimary, fontSize: 32, fontWeight: FontWeight.bold),
      headlineMedium: TextStyle(color: AppColors.darkTextPrimary, fontSize: 24, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(color: AppColors.darkTextPrimary, fontSize: 20, fontWeight: FontWeight.w500),
      bodyLarge: TextStyle(color: AppColors.darkTextPrimary, fontSize: 16),
      bodyMedium: TextStyle(color: AppColors.darkTextPrimary, fontSize: 14),
      bodySmall: TextStyle(color: AppColors.darkTextSecondary, fontSize: 12),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.darkSurfaceGlass,
      indicatorColor: AppColors.primary.withOpacity(0.2),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600);
        }
        return const TextStyle(color: AppColors.darkTextSecondary, fontSize: 12);
      }),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
    ),
  );

  static ThemeData get lightTheme => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.light(
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.lightSurface,
      error: AppColors.error,
    ),
    scaffoldBackgroundColor: Colors.transparent,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: AppColors.lightTextPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w500,
      ),
      iconTheme: IconThemeData(color: AppColors.lightTextPrimary),
    ),
    cardTheme: CardTheme(
      color: AppColors.lightSurfaceGlass,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.lightBorder),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.lightSurfaceGlass,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.lightBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.lightBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
      hintStyle: const TextStyle(color: AppColors.lightTextSecondary),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(color: AppColors.lightTextPrimary, fontSize: 32, fontWeight: FontWeight.bold),
      headlineMedium: TextStyle(color: AppColors.lightTextPrimary, fontSize: 24, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(color: AppColors.lightTextPrimary, fontSize: 20, fontWeight: FontWeight.w500),
      bodyLarge: TextStyle(color: AppColors.lightTextPrimary, fontSize: 16),
      bodyMedium: TextStyle(color: AppColors.lightTextPrimary, fontSize: 14),
      bodySmall: TextStyle(color: AppColors.lightTextSecondary, fontSize: 12),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.lightSurfaceGlass,
      indicatorColor: AppColors.primary.withOpacity(0.2),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600);
        }
        return const TextStyle(color: AppColors.lightTextSecondary, fontSize: 12);
      }),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
    ),
  );
}
```

- [ ] **Step 2: Verify file created**

Run: `ls -la lib/theme/`
Expected: `glass_theme.dart` exists

---

## Chunk 2: Glass Widgets

### Task 2.1: Create GlassCard Widget

**Files:**
- Create: `lib/widgets/glass_card.dart`

- [ ] **Step 1: Create glass_card.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool useBackdropFilter;

  const GlassCard({
    super.key,
    required this.child,
    this.borderRadius = 16,
    this.padding,
    this.margin,
    this.onTap,
    this.useBackdropFilter = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(borderRadius),
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurfaceGlass : AppColors.lightSurfaceGlass,
                  borderRadius: BorderRadius.circular(borderRadius),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    width: 1,
                  ),
                ),
                padding: padding ?? const EdgeInsets.all(16),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

---

### Task 2.2: Create GlassButton Widget

**Files:**
- Create: `lib/widgets/glass_button.dart`

- [ ] **Step 1: Create glass_button.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassButton extends StatefulWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool isPrimary;
  final bool isLoading;

  const GlassButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.isPrimary = true,
    this.isLoading = false,
  });

  @override
  State<GlassButton> createState() => _GlassButtonState();
}

class _GlassButtonState extends State<GlassButton> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.isLoading ? null : widget.onPressed,
      child: AnimatedScale(
        scale: _isPressed ? 0.95 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              decoration: BoxDecoration(
                color: widget.isPrimary
                    ? AppColors.primary
                    : (isDark ? AppColors.darkSurfaceGlass : AppColors.lightSurfaceGlass),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: widget.isPrimary ? Colors.transparent : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (widget.isLoading) ...[
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    ),
                    const SizedBox(width: 8),
                  ] else if (widget.icon != null) ...[
                    Icon(widget.icon, size: 18, color: widget.isPrimary ? Colors.white : AppColors.primary),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    widget.label,
                    style: TextStyle(
                      color: widget.isPrimary ? Colors.white : AppColors.primary,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

---

### Task 2.3: Create StatusIndicator Widget

**Files:**
- Create: `lib/widgets/status_indicator.dart`

- [ ] **Step 1: Create status_indicator.dart**

```dart
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum StatusType { connected, warning, disconnected }

class StatusIndicator extends StatelessWidget {
  final StatusType status;
  final String? label;
  final double size;

  const StatusIndicator({
    super.key,
    required this.status,
    this.label,
    this.size = 8,
  });

  Color get _color {
    switch (status) {
      case StatusType.connected:
        return AppColors.success;
      case StatusType.warning:
        return AppColors.warning;
      case StatusType.disconnected:
        return AppColors.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: _color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: _color.withOpacity(0.5),
                blurRadius: 4,
                spreadRadius: 1,
              ),
            ],
          ),
        ),
        if (label != null) ...[
          const SizedBox(width: 8),
          Text(
            label!,
            style: TextStyle(
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }
}
```

---

### Task 2.4: Create EmptyState and LoadingShimmer Widgets

**Files:**
- Create: `lib/widgets/empty_state.dart`
- Create: `lib/widgets/loading_shimmer.dart`

- [ ] **Step 1: Create empty_state.dart**

```dart
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'glass_button.dart';

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final String? buttonLabel;
  final VoidCallback? onButtonPressed;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.description,
    this.buttonLabel,
    this.onButtonPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 64,
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            if (description != null) ...[
              const SizedBox(height: 8),
              Text(
                description!,
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
            if (buttonLabel != null && onButtonPressed != null) ...[
              const SizedBox(height: 24),
              GlassButton(
                label: buttonLabel!,
                icon: Icons.add,
                onPressed: onButtonPressed,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Create loading_shimmer.dart**

```dart
import 'package:flutter/material.dart';
import 'dart:async';

class LoadingShimmer extends StatefulWidget {
  final double width;
  final double height;
  final double borderRadius;

  const LoadingShimmer({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 8,
  });

  @override
  State<LoadingShimmer> createState() => _LoadingShimmerState();
}

class _LoadingShimmerState extends State<LoadingShimmer> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
    _animation = Tween<double>(begin: 0.3, end: 0.7).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius),
            color: Colors.white.withOpacity(_animation.value),
          ),
        );
      },
    );
  }
}

class ShimmerList extends StatelessWidget {
  final int itemCount;
  final double itemHeight;
  final double spacing;

  const ShimmerList({
    super.key,
    this.itemCount = 5,
    this.itemHeight = 72,
    this.spacing = 8,
  });

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      separatorBuilder: (_, __) => SizedBox(height: spacing),
      itemBuilder: (context, index) {
        return LoadingShimmer(
          width: double.infinity,
          height: itemHeight,
          borderRadius: 12,
        );
      },
    );
  }
}
```

---

### Task 2.5: Create GlassAppBar and GlassBottomNav

**Files:**
- Create: `lib/widgets/glass_app_bar.dart`
- Create: `lib/widgets/glass_bottom_nav.dart`

- [ ] **Step 1: Create glass_app_bar.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  final bool showBackButton;
  final VoidCallback? onBackPressed;

  const GlassAppBar({
    super.key,
    required this.title,
    this.actions,
    this.leading,
    this.showBackButton = false,
    this.onBackPressed,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurfaceGlass : AppColors.lightSurfaceGlass,
            border: Border(
              bottom: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: kToolbarHeight,
              child: NavigationToolbar(
                leading: showBackButton
                    ? IconButton(
                        icon: const Icon(Icons.arrow_back),
                        onPressed: onBackPressed ?? () => Navigator.of(context).pop(),
                      )
                    : leading,
                middle: Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                trailing: actions != null
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: actions!,
                      )
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Create glass_bottom_nav.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassBottomNavItem {
  final IconData icon;
  final String label;

  const GlassBottomNavItem({
    required this.icon,
    required this.label,
  });
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
    
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurfaceGlass : AppColors.lightSurfaceGlass,
            border: Border(
              top: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
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
              destinations: items.map((item) {
                return NavigationDestination(
                  icon: Icon(item.icon),
                  selectedIcon: Icon(item.icon, color: AppColors.primary),
                  label: item.label,
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}
```

---

## Chunk 3: Navigation Structure

### Task 3.1: Modify App Router for ShellRoute

**Files:**
- Modify: `lib/router/app_router.dart`

- [ ] **Step 1: Read current router implementation**

Run: `cat lib/router/app_router.dart`

- [ ] **Step 2: Modify router to use ShellRoute with bottom navigation**

Replace the router configuration with:

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../screens/chat_screen.dart';
import '../screens/task_board_screen.dart';
import '../screens/conversation_screen.dart';
import '../screens/manage/management_hub_screen.dart';
import '../screens/manage/providers_screen.dart';
import '../screens/manage/model_management_screen.dart';
import '../screens/manage/mcp_screen.dart';
import '../screens/manage/skills_screen.dart';
import '../screens/manage/agents_screen.dart';
import '../screens/manage/memory_screen.dart';
import '../screens/settings_screen.dart';
import '../widgets/glass_bottom_nav.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  routes: [
    ShellRoute(
      navigatorKey: _shellNavigatorKey,
      builder: (context, state, child) {
        return MainShell(child: child);
      },
      routes: [
        GoRoute(
          path: '/',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ChatScreen(),
          ),
        ),
        GoRoute(
          path: '/tasks',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: TaskBoardScreen(),
          ),
        ),
        GoRoute(
          path: '/conversations',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ConversationScreen(),
          ),
        ),
        GoRoute(
          path: '/manage',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ManagementHubScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/providers',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ProvidersScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/models',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ModelManagementScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/mcp',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: MCPScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/skills',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: SkillsScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/agents',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: AgentsScreen(),
          ),
        ),
        GoRoute(
          path: '/manage/memory',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: MemoryScreen(),
          ),
        ),
        GoRoute(
          path: '/settings',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: SettingsScreen(),
          ),
        ),
      ],
    ),
  ],
);

class MainShell extends StatefulWidget {
  final Widget child;

  const MainShell({super.key, required this.child});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  static const _navItems = [
    GlassBottomNavItem(icon: Icons.chat_bubble_outline, label: 'Chat'),
    GlassBottomNavItem(icon: Icons.task_alt, label: 'Tasks'),
    GlassBottomNavItem(icon: Icons.dashboard_customize, label: 'Manage'),
    GlassBottomNavItem(icon: Icons.settings_outlined, label: 'Settings'),
  ];

  static const _routes = ['/', '/tasks', '/manage', '/settings'];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _updateIndex();
  }

  void _updateIndex() {
    final location = GoRouterState.of(context).matchedLocation;
    int index = 0;
    if (location.startsWith('/tasks') || location == '/conversations') {
      index = 1;
    } else if (location.startsWith('/manage') || location.startsWith('/conversations')) {
      index = 2;
    } else if (location == '/settings') {
      index = 3;
    }
    if (index != _currentIndex) {
      setState(() => _currentIndex = index);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: GlassBottomNav(
        currentIndex: _currentIndex,
        onTap: (index) {
          if (index != _currentIndex) {
            context.go(_routes[index]);
          }
        },
        items: _navItems,
      ),
    );
  }
}
```

---

## Chunk 4: Management Hub Screen

### Task 4.1: Create ManagementHubScreen

**Files:**
- Create: `lib/screens/manage/management_hub_screen.dart`

- [ ] **Step 1: Create management_hub_screen.dart**

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../theme/app_colors.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/glass_app_bar.dart';

class ManagementHubScreen extends StatelessWidget {
  const ManagementHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Scaffold(
      appBar: const GlassAppBar(title: 'Manage'),
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.darkGradient : AppColors.lightGradient,
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: GridView.count(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 1.2,
              children: [
                _ManagementCard(
                  icon: Icons.business,
                  title: 'Providers',
                  subtitle: '3 active',
                  onTap: () => context.push('/manage/providers'),
                ),
                _ManagementCard(
                  icon: Icons.inventory_2,
                  title: 'Models',
                  subtitle: '3 local',
                  onTap: () => context.push('/manage/models'),
                ),
                _ManagementCard(
                  icon: Icons.integration_instructions,
                  title: 'MCP',
                  subtitle: '2 servers',
                  onTap: () => context.push('/manage/mcp'),
                ),
                _ManagementCard(
                  icon: Icons.psychology,
                  title: 'Skills',
                  subtitle: '5 active',
                  onTap: () => context.push('/manage/skills'),
                ),
                _ManagementCard(
                  icon: Icons.smart_toy,
                  title: 'Agents',
                  subtitle: '4 online',
                  onTap: () => context.push('/manage/agents'),
                ),
                _ManagementCard(
                  icon: Icons.memory,
                  title: 'Memory',
                  subtitle: '128 docs',
                  onTap: () => context.push('/manage/memory'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ManagementCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ManagementCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return GlassCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            icon,
            size: 32,
            color: AppColors.primary,
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
```

---

## Chunk 5: Screen Redesigns

### Task 5.1: Update ChatScreen

**Files:**
- Modify: `lib/screens/chat_screen.dart`

- [ ] **Step 1: Read current chat_screen.dart**

Run: `head -100 lib/screens/chat_screen.dart`

- [ ] **Step 2: Apply glass styling to chat screen**

Key changes:
1. Wrap body in gradient container
2. Replace Scaffold background with transparent
3. Use GlassCard for message bubbles
4. Apply glass styling to input bar

---

### Task 5.2: Update SettingsScreen

**Files:**
- Modify: `lib/screens/settings_screen.dart`

- [ ] **Step 1: Read current settings_screen.dart**

Run: `head -100 lib/screens/settings_screen.dart`

- [ ] **Step 2: Apply glass styling**

Key changes:
1. Wrap in gradient container
2. Use GlassCard for settings groups
3. Use GlassAppBar or transparent AppBar

---

## Verification Commands

After each chunk, run:

```bash
# Check for syntax errors
flutter analyze lib/theme/
flutter analyze lib/widgets/
flutter analyze lib/router/
flutter analyze lib/screens/manage/

# Run the app
flutter run
```

---

## Success Criteria

- [ ] Theme applies correctly in both light and dark modes
- [ ] All glass widgets render with proper blur and transparency
- [ ] Bottom navigation works with state preservation
- [ ] All 10 screens accessible and properly styled
- [ ] No horizontal overflow on 375px screens
- [ ] Animations respect `prefers-reduced-motion`
