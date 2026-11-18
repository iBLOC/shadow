import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';
import 'package:shadow_mobile/widgets/chat_bubble.dart';

import 'test_helper.dart';

/// 移动端首页（`/` 路由 = 对话页）的回归测试。
///
/// 这一轮把本地 LiteRT 从对话链路上摘掉了，首页跟着重做。这里锁的是
/// **首页必须干净、入口必须可达**这两件事：
///
/// ① AppBar 右侧**曾经**恒为空 —— 三个 action 都挂在
///    `chatState.isInitialized || chatState.isLitertReady` 上，
///    而这两个字段说的都是**本地**引擎，在移动端**永远为真不了**
///    ⇒ 「设置」页从此进不去。
/// ② 首页**曾经**必然挂着一根红色横幅（本地引擎初始化失败），
///    还必然有三条红色 system 气泡（启动旁白）。
/// ③ 本地模型**下载框**曾经会在进首页时弹出来。
class _ErrorChatNotifier extends MockChatNotifier {
  _ErrorChatNotifier() {
    state = state.copyWith(errorMessage: '端脑没起来');
  }
}

void main() {
  testSetup();

  /// 首页用的 override 集合。
  ///
  /// ⚠️ 2026-11-18：那块 **A2UI 独立面板**已下线 ⇒ ⇒ **不再有**「面板开/关」
  /// 那个开关 ⇒ ⇒ 这里**不用**再覆盖它 ⇒ ⇒ 覆盖集合回到「最朴素的四个」。
  List<Override> homeOverrides() => [
    serviceProvider.overrideWith((ref) => MockServiceNotifier()),
    themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
    chatProvider.overrideWith((ref) => MockChatNotifier()),
    conversationModeProvider.overrideWith(
      (ref) => MockConversationModeNotifier(),
    ),
  ];

  Future<void> pumpChat(
    WidgetTester tester, {
    List<Override> overrides = const [],
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...homeOverrides(), ...overrides],
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          locale: const Locale('en'),
          home: const ChatScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('ChatScreen 首页', () {
    testWidgets('AppBar 右侧的入口都在（设置 / 语音）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // ⚠️ 以前这三个 action 的条件是
      // `chatState.isInitialized || chatState.isLitertReady` —— 恒假
      // ⇒ AppBar 右侧**空无一物**，设置页进不去。
      expect(find.byIcon(Icons.settings), findsOneWidget);
      expect(find.byIcon(Icons.phone), findsOneWidget);
      // ⚠️ 2026-11-18：这里**曾经**还有第三个 —— 一个常驻的 `widgets` 按钮
      // （开/关那块 A2UI **独立面板**）⇒ ⇒ 面板下线 ⇒ ⇒ 它也摘了
      // ⇒ ⇒ **AppBar 上不再有「另一个界面」的入口**。
      expect(find.byIcon(Icons.widgets_outlined), findsNothing);
      expect(find.byIcon(Icons.widgets), findsNothing);
    });

    testWidgets('对话页上**没有**第二个界面（A2UI 的面只内联在消息里）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // ⚠️ 2026-11-18 用户诉求逐字：「现在移动端 对话也没按和agent2ui页面
      // 还是两个页面 有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」
      // ⇒ ⇒ 那块**独立面板**（走 A2A、自带输入条与连接状态栏）下线了
      // ⇒ ⇒ 现在**只有对话那一个输入框** ⇒ ⇒ 用户看到的**只有一个页面**。
      final l10n = l10nOf(tester);
      expect(find.text(l10n.tapToTypeHoldToTalk), findsOneWidget);
      // 面板那个输入框的占位（「让端脑画界面…」）不许再出现。
      expect(find.text(l10n.askA2ui), findsNothing);
      // 其它入口一个不少（摘面板没有误伤对话）。
      expect(find.byIcon(Icons.settings), findsOneWidget);
      expect(find.byIcon(Icons.history), findsOneWidget);
    });

    testWidgets('进首页不会弹本地模型下载框', (WidgetTester tester) async {
      await pumpChat(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.downloadNow), findsNothing);
      expect(find.text(l10n.waitForWifi), findsNothing);
      expect(find.text(l10n.mobileNetworkDetected), findsNothing);
    });

    testWidgets('干净的首页：没有红色横幅，也没有红色 system 气泡', (WidgetTester tester) async {
      await pumpChat(tester);

      // 红色横幅（本地引擎初始化失败时的那根）。
      expect(find.byIcon(Icons.error_outline), findsNothing);
      // 红色 system 气泡（启动旁白曾经走的就是 system 角色）。
      expect(find.byType(MessageBubble), findsNothing);
    });

    testWidgets('输入框可用：提示是「轻触输入 · 长按说话」而不是「初始化中…」', (WidgetTester tester) async {
      await pumpChat(tester);

      final l10n = l10nOf(tester);
      // ⚠️ 2026-11-15 起未聚焦的提示是**手势提示**（长按＝说话）⇒ ⇒
      // 聚焦后才是「输入内容…」（askSomething）。
      expect(find.text(l10n.tapToTypeHoldToTalk), findsOneWidget);
      expect(find.text(l10n.initializing), findsNothing);
    });

    testWidgets('错误横幅能被 × 关掉', (WidgetTester tester) async {
      await pumpChat(
        tester,
        overrides: [chatProvider.overrideWith((ref) => _ErrorChatNotifier())],
      );

      // 横幅在。
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('端脑没起来'), findsOneWidget);

      // ⚠️ 以前这个 × 的 onPressed 是**空闭包**（注释写着
      // "This will be handled by the parent"，但父级从来没处理）
      // ⇒ 横幅**关不掉**，会一直挂在对话页顶上。
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsNothing);
      expect(find.text('端脑没起来'), findsNothing);
    });
  });
}
