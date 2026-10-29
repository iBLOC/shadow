import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/litert_engine.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/theme/app_tokens.g.dart';
import 'package:shadow_mobile/theme/shad_scheme.g.dart';
import 'package:shadow_mobile/tts_engine.dart';

void testSetup() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });
}

final mockServiceInfos = [
  ServiceInfo(
    name: 'resonance',
    displayName: 'Resonance',
    host: 'localhost',
    port: 8080,
    status: ServiceStatus.healthy,
  ),
  ServiceInfo(
    name: 'prefrontal',
    displayName: 'Prefrontal',
    host: 'localhost',
    port: 8082,
    status: ServiceStatus.healthy,
  ),
  ServiceInfo(
    name: 'hippocampus',
    displayName: 'Hippocampus',
    host: 'localhost',
    port: 8081,
    status: ServiceStatus.healthy,
  ),
];

List<Override> getTestOverrides() {
  return [
    serviceProvider.overrideWith((ref) => MockServiceNotifier()),
    themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
    chatProvider.overrideWith((ref) => MockChatNotifier()),
    conversationModeProvider.overrideWith(
      (ref) => MockConversationModeNotifier(),
    ),
    useAgent2UIModeProvider.overrideWith((ref) => false),
  ];
}

class MockServiceNotifier extends ServiceNotifier {
  MockServiceNotifier() : super() {
    state = mockServiceInfos;
  }

  @override
  Future<void> checkAll() async {
    // Do nothing - synchronous mock
  }
}

class MockThemeNotifier extends ThemeModeNotifier {
  MockThemeNotifier() : super();

  @override
  void setThemeMode(ThemeMode mode) {
    state = mode;
  }

  @override
  void toggleTheme() {
    state = state == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
  }
}

class MockChatNotifier extends ChatNotifier {
  MockChatNotifier()
    : super(LitertEngine(), TtsEngine(), TelencephalonClient(), skipInit: true);
}

class MockConversationModeNotifier extends ConversationModeNotifier {
  MockConversationModeNotifier() : super(videoCollector: null);
}

Future<void> pumpWidgetForTest(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(child);
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> completePendingMicrotasks(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 100));
}

/// 装配 shadcn 主题。
///
/// 生产环境 `main.dart` 用 `MaterialApp.router` 的 `builder:` 挂 `ShadTheme`，
/// 页面里所有 shadcn 组件都靠它取配色。测试里也要装一份 —— 否则
/// `ShadTheme.of(context)` 直接抛 FlutterError（静默用默认色更糟）。
///
/// 用的是生产同一套 `ShadScheme.of(...)` 投影 —— 测试与真机看到的是
/// 同一份色板。
Widget withShadTheme(Widget child, {Brightness brightness = Brightness.light}) {
  return ShadTheme(
    data: ShadThemeData(
      colorScheme: ShadScheme.of(
        brightness: brightness,
        accentSeed: AppTokens.accentSeed,
      ),
      brightness: brightness,
    ),
    child: child,
  );
}

/// 取当前 widget 树里的本地化实例。
///
/// 断言文案时用它，而不是把中英文写死 —— 翻译一改，测试不该跟着改。
/// 用 Scaffold 的 element：它在 MaterialApp 之下，能看到 Localizations 作用域。
AppLocalizations l10nOf(WidgetTester tester) {
  final ctx = tester.element(find.byType(Scaffold).first);
  return AppLocalizations.of(ctx)!;
}
