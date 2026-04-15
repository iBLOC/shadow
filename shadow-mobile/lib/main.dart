import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'generated/l10n/app_localizations.dart';
import 'model_manager.dart';
import 'router/app_router.dart';
import 'providers/theme_provider.dart';
import 'theme/glass_theme.dart';
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
    return MaterialApp.router(
      title: 'Shadow',
      debugShowCheckedModeBanner: false,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      localeListResolutionCallback: (list, supported) =>
          basicLocaleListResolution(list, supported),
      theme: GlassTheme.lightTheme,
      darkTheme: GlassTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: appRouter,
    );
  }
}
