import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'dart:async';
import 'generated/l10n/app_localizations.dart';
import 'model_manager.dart';
import 'router/app_router.dart';
import 'providers/capability_policy_provider.dart';
import 'providers/identity_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/log_provider.dart';
import 'theme/glass_theme.dart';
import 'theme/shad_scheme.g.dart';
import 'services/app_config_service.dart';
import 'services/encephalon/encephalon_mobile_provider.dart';

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

  // 用 **app 生命周期的 ProviderContainer**（而不是 ProviderScope）——
  // 这样可以在 provider 树之外、在 runApp 之后触发嵌入式大脑的启动。
  //
  // 为什么要 app 生命周期：嵌入式大脑是**默认启动**的（见下面），
  // 启动这件事必须在 App 一起来就发生，不能等用户去某个页面。
  final container = ProviderContainer();

  // Dart 侧运行时日志（package:logging）默认没有监听者 —— 各 Notifier
  // 打的「大脑启动 / 模型路由 / 错误降级」此前哪儿也不去。接到日志面板
  // （设置 → 高级 → 日志），与宿主侧 AppLog 的桥（EventChannel）互补。
  wireDartLoggingIntoLogPanel(container);

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const ShadowApp(),
    ),
  );

  // 嵌入式大脑**默认启动** —— 用户不需要去「我 → 设置 → 嵌入式大脑」
  // 点「启动大脑」。以前那一步是必须的：不点，整条「大脑 → 端脑 → 叶区」
  // 链路在移动端就是断的（对话页永远「初始化中…」，端脑 client 也还指着
  // 没人监听的 `:60080`）。
  //
  // 放在 runApp 之后：启动要读本地模型配置（SQLite），别挡住首屏。
  container.read(encephalonMobileProvider.notifier).ensureStarted();

  // 「手机操作」那道闸的**原生侧**状态 ⇒ ⇒ 启动时必须推一次。
  //
  // ⚠️ 为什么不能只在设置页推：原生侧那两个平行面（HTTP / A2A）默认是
  // **拒绝**的 ⇒ ⇒ 用户上次配的是「完全访问」时，不推的话原生那条腿
  // 会一直被拒 ⇒ ⇒ 「用户明明放开了却用不了」。
  //
  // ⚠️ 读一下 notifier 就等于让它**恢复一次**（构造即 `_restore()`）
  // ⇒ ⇒ 恢复完顺带就把闸推过去了。
  container.read(capabilityPolicyProvider.notifier);

  // 「当前是谁」—— 端脑答的身份决定**读写哪一份记忆**（有账号就是那个
  // 人格，没账号才是 `"default"`）。端脑 client 自带**就绪门** ⇒ 大脑还没
  // 起来时这次调用会**等它起来**，不会直接失败。
  //
  // ⚠️ 但冷启动时大脑要**十几秒**才起得来（抽资源 + 加载 150MB 的 `.so`），
  // 而单次解析有 15 秒的上界 ⇒ **第一次大概率超时** ⇒ 所以这里
  // **失败就再来一次**（有上界）：不然身份永远停在「背后没有人」、租户永远
  // 停在 `default` ⇒ 手机端往 `default` 桶写 ⇒ **两端没有读写同一份记忆**。
  //
  // 解析完顺手做一次「`default` 桶 → 账号人格桶」的迁移（复制，不删旧行）——
  // 不阻塞启动，失败也不影响 App（下次还会再试）。
  unawaited(() async {
    final identity = container.read(identityProvider.notifier);
    final tenant = await identity.resolveWithRetry();
    final migrated = await identity.migrate();
    // 只在**真的搬了东西**或**搬的过程中出错**时才说一句 ——
    // 「跑了但一条都没搬」（比如海马体够不着）不值得刷屏。
    if (migrated.ran &&
        (migrated.memoriesCopied > 0 ||
            migrated.tasksCopied > 0 ||
            migrated.errors.isNotEmpty)) {
      debugPrint(
        '[ShadowApp] 租户迁移 → $tenant：记忆 ${migrated.memoriesCopied} 条、'
        '任务 ${migrated.tasksCopied} 条'
        '${migrated.errors.isEmpty ? '' : '（${migrated.errors.length} 条出错，下次还会再试）'}',
      );
    }
  }());
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
