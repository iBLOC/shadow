import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'generated/l10n/app_localizations.dart';
import 'model_manager.dart';
import 'router/app_router.dart';
import 'providers/theme_provider.dart';
import 'theme/glass_theme.dart';
import 'theme/shad_scheme.g.dart';
import 'services/app_config_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // 初始化应用配置
    await AppConfigService().init();
  } catch (e) {
    debugPrint('[ShadowApp] AppConfigService.init() failed: $e');
  }

  try {
    ModelManager().initializeDefaultModels();
  } catch (e) {
    debugPrint('[ShadowApp] ModelManager.initializeDefaultModels() failed: $e');
  }

  runApp(const ProviderScope(child: ShadowApp()));
}

class ShadowApp extends ConsumerWidget {
  const ShadowApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final appearance = ref.watch(themeAppearanceProvider);
    return MaterialApp.router(
      title: 'Shadow',
      debugShowCheckedModeBanner: false,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      localeListResolutionCallback: (list, supported) =>
          basicLocaleListResolution(list, supported),
      theme: GlassTheme.build(appearance, Brightness.light),
      darkTheme: GlassTheme.build(appearance, Brightness.dark),
      themeMode: themeMode,
      routerConfig: appRouter,
      builder: (context, child) {
        // shadcn 主题 —— 桌面端是真 shadcn/ui，移动端用 Flutter ShadcnUI，
        // 两端共用仓根 design-tokens.json 的同一份设计数值。
        //
        // 用 `builder` 而不是换掉 MaterialApp：shadcn 的组件可以从第一天起
        // 就用上，而 Material 的存量页面继续能跑（两者的交互组件要共存一段时间）。
        // 等 Material 用量归零，再把根节点换成 ShadApp.router。
        //
        // 主题色是**运行时可变**的槽位，所以每次重建都重新投影一遍。
        final brightness = Theme.of(context).brightness;
        return ShadTheme(
          data: ShadThemeData(
            colorScheme: ShadScheme.of(
              brightness: brightness,
              accentSeed: appearance.accentSeed,
            ),
            brightness: brightness,
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
