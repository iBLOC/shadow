import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
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
  /// 刻意**不**覆盖 `useAgent2UIModeProvider` —— Agent2UI 那个入口
  /// 就是靠它切换的，覆盖掉就测不到了。
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
    testWidgets('AppBar 右侧的入口都在（设置 / 语音 / Agent2UI）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // ⚠️ 以前这三个 action 的条件是
      // `chatState.isInitialized || chatState.isLitertReady` —— 恒假
      // ⇒ AppBar 右侧**空无一物**，设置页进不去。
      expect(find.byIcon(Icons.settings), findsOneWidget);
      expect(find.byIcon(Icons.phone), findsOneWidget);
      expect(find.byIcon(Icons.widgets_outlined), findsOneWidget);
    });

    testWidgets('Agent2UI 是能进能出的（不再是只能进不能出）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // 以前唯一的入口是「本地模型没装好 → 下载框 → Use Agent2UI」，
      // 下载框下线之后那个入口就没了 ⇒ 现在补一个常驻按钮。
      final container = ProviderScope.containerOf(
        tester.element(find.byType(ChatScreen)),
      );

      await tester.tap(find.byIcon(Icons.widgets_outlined));
      // Agent2UI 视图里有 CircularProgressIndicator（无限动画），
      // pumpAndSettle 等不到底 —— 用有界泵。
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(container.read(useAgent2UIModeProvider), isTrue);
      // 进了 Agent2UI 之后，AppBar 上的其它入口让位。
      expect(find.byIcon(Icons.settings), findsNothing);
    });

    testWidgets('进首页不会弹本地模型下载框', (WidgetTester tester) async {
      await pumpChat(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.downloadNow), findsNothing);
      expect(find.text(l10n.waitForWifi), findsNothing);
      expect(find.text(l10n.mobileNetworkDetected), findsNothing);
    });

    testWidgets('干净的首页：没有红色横幅，也没有红色 system 气泡', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // 红色横幅（本地引擎初始化失败时的那根）。
      expect(find.byIcon(Icons.error_outline), findsNothing);
      // 红色 system 气泡（启动旁白曾经走的就是 system 角色）。
      expect(find.byType(MessageBubble), findsNothing);
    });

    testWidgets('输入框可用：提示是「问点什么」而不是「初始化中…」', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      final l10n = l10nOf(tester);
      expect(find.text(l10n.askSomething), findsOneWidget);
      expect(find.text(l10n.initializing), findsNothing);
    });

    testWidgets('错误横幅能被 × 关掉', (WidgetTester tester) async {
      await pumpChat(
        tester,
        overrides: [
          chatProvider.overrideWith((ref) => _ErrorChatNotifier()),
        ],
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
