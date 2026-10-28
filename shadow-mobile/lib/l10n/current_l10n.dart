import 'dart:ui' show PlatformDispatcher;

import '../generated/l10n/app_localizations.dart';
import '../generated/l10n/app_localizations_en.dart';
import '../generated/l10n/app_localizations_zh.dart';

/// 不依赖 `BuildContext` 取当前语言的文案。
///
/// 用在拿不到 context 的地方 —— provider / notifier / model 的方法。
/// 这些地方没法调 `AppLocalizations.of(context)`。
///
/// 语言取自系统语言。App 支持 en / zh 两种，其余语言按 en 处理。
///
/// 为什么用 `PlatformDispatcher.instance` 而不是
/// `WidgetsBinding.instance.platformDispatcher`：后者要求 binding 已经初始化。
/// 纯 Dart 单测（`test()` 而不是 `testWidgets()`）里没有 binding，
/// 后台 isolate 里也没有 —— 那两种场合都会直接抛
/// "Binding has not yet been initialized"。`PlatformDispatcher` 是引擎侧的
/// 单例，不需要 binding。
AppLocalizations currentL10n() {
  final lang = PlatformDispatcher.instance.locale.languageCode;
  return lang == 'zh' ? AppLocalizationsZh() : AppLocalizationsEn();
}
