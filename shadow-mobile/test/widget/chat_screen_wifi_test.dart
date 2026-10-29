import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/litert_engine.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/providers/network_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';
import 'package:shadow_mobile/services/network_service.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

import 'test_helper.dart';

/// 假网络 —— 可以把「连上 WiFi」这个事件推进去。
class _FakeNetworkService extends NetworkService {
  _FakeNetworkService(this.currentType);

  NetworkType currentType;

  final StreamController<NetworkType> _controller =
      StreamController<NetworkType>.broadcast();

  @override
  Future<NetworkType> getNetworkType() async => currentType;

  @override
  Stream<NetworkType> get onNetworkTypeChanged => _controller.stream;

  /// 推进一次网络变化。
  void emit(NetworkType type) {
    currentType = type;
    _controller.add(type);
  }

  Future<void> close() => _controller.close();
}

/// 模型没下载好的 chat notifier。
class _ModelMissingChatNotifier extends ChatNotifier {
  _ModelMissingChatNotifier()
    : super(
        LitertEngine(),
        TtsEngine(),
        TelencephalonClient(),
        skipInit: true,
      ) {
    state = state.copyWith(modelNotFound: true, mode: ChatMode.litert);
  }

  int downloadCalls = 0;

  @override
  Future<void> downloadModel() async {
    downloadCalls++;
  }
}

/// 「等 WiFi」这条分支的契约。
///
/// 真机反馈：App 启动（模型还没下载好）时弹出「检测到移动网络」对话框，
/// 点「等待 WiFi」之后**整个 App 黑屏**。
///
/// 根因：那一支的实现是 `Navigator.of(context).pop()` —— 弹掉的是**当前
/// 路由**。而 /chat 是路由表的 initialLocation（根导航器上的第一个路由），
/// 弹掉之后根导航器里就没有任何路由了 → 屏幕上什么都没有。
///
/// 这里锁两件事：
/// ① 点「等 WiFi」之后页面**还在**（不许黑屏），也不许触发下载；
/// ② 等 WiFi 连上之后**自动**开始下载 —— 「等 WiFi」是推迟，不是离开。
void main() {
  testSetup();

  late _FakeNetworkService network;
  late _ModelMissingChatNotifier chatNotifier;

  setUp(() {
    network = _FakeNetworkService(NetworkType.mobile);
    chatNotifier = _ModelMissingChatNotifier();
  });

  tearDown(() async {
    await network.close();
  });

  Future<GoRouter> pumpChat(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (context, state) => const ChatScreen()),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          serviceProvider.overrideWith((ref) => MockServiceNotifier()),
          themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
          chatProvider.overrideWith((ref) => chatNotifier),
          conversationModeProvider.overrideWith(
            (ref) => MockConversationModeNotifier(),
          ),
          useAgent2UIModeProvider.overrideWith((ref) => false),
          networkServiceProvider.overrideWithValue(network),
        ],
        child: withShadTheme(
          MaterialApp.router(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            routerConfig: router,
          ),
        ),
      ),
    );

    // 对话框是 postFrameCallback 里弹的，而网络类型是异步查的 ——
    // 这里不能用 pumpAndSettle：PrefrontalChatView 的加载态是
    // CircularProgressIndicator（无限动画），pumpAndSettle 必然超时。
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return router;
  }

  testWidgets('模型没就绪 + 移动网络 → 弹出「等待 WiFi」对话框', (WidgetTester tester) async {
    await pumpChat(tester);

    final l10n = l10nOf(tester);
    expect(find.text(l10n.waitForWifi), findsOneWidget);
    expect(find.text(l10n.downloadNow), findsOneWidget);
  });

  testWidgets('点「等待 WiFi」不会把页面弹掉（黑屏回归）', (WidgetTester tester) async {
    await pumpChat(tester);

    final l10n = l10nOf(tester);
    await tester.tap(find.text(l10n.waitForWifi));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    // 关键断言：页面还在。
    // 之前这里弹掉了 /chat 路由（根导航器上的第一个路由）→ 根导航器空了
    // → 整个 App 黑屏。
    expect(find.byType(ChatScreen), findsOneWidget);
    expect(find.byType(Scaffold), findsWidgets);
    expect(tester.takeException(), isNull);

    // 「等 WiFi」是推迟下载，不是开始下载。
    expect(chatNotifier.downloadCalls, 0);
  });

  testWidgets('连上 WiFi 之后自动开始下载模型', (WidgetTester tester) async {
    await pumpChat(tester);

    final l10n = l10nOf(tester);
    await tester.tap(find.text(l10n.waitForWifi));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(chatNotifier.downloadCalls, 0);

    network.emit(NetworkType.wifi);
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(chatNotifier.downloadCalls, 1);
    expect(find.byType(ChatScreen), findsOneWidget);
  });
}
