import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';
import 'package:shadow_mobile/widgets/chat/agent2ui_panel.dart';

import 'test_helper.dart';

/// **Agent2UI 与对话同页共存** —— 这条不变量钉在这里。
///
/// ## 为什么钉它
///
/// 以前移动端是**二选一**：开 Agent2UI ⇒ 整个对话区被 `Agent2UIView` 顶掉
/// ⇒ ⇒ **对话消失** ⇒ ⇒ 「问一句」和「看一眼界面」必须来回切 ⇒ 交互割裂。
///
/// ⇒ 用户拍板：**同页共存** —— 面板在**上面**、对话在**下面**
/// （桌面端早就是这个形状：`ConversationPage.tsx:742` 的 `A2uiPanel`
/// 就长在消息列表上方，不是另一个页面）。
///
/// ## ⚠️ 「共存」不等于「混成一条会话」
///
/// 端脑 `/a2a` 每次请求现造 `context_id` ⇒ A2UI 那条通道**不记会话**
/// ⇒ ⇒ 面板里**不许**出现会话身份（台账㋥ 条的决定）⇒ ⇒ 这里不查会话行。
void main() {
  testSetup();

  /// 首页用的 override 集合（与 `chat_screen_home_test.dart` 同构）。
  List<Override> homeOverrides() => [
    serviceProvider.overrideWith((ref) => MockServiceNotifier()),
    themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
    chatProvider.overrideWith((ref) => MockChatNotifier()),
    conversationModeProvider.overrideWith(
      (ref) => MockConversationModeNotifier(),
    ),
    // A2UI 那条通道的外部依赖全掐掉：地址固定、状态固定、没有 surface。
    // ⇒ 免得测试去拉真端脑（拉不到也只是「连不上」，但会挂定时器）。
    a2uiServerUrlProvider.overrideWith((ref) => 'http://127.0.0.1:1/a2a'),
    a2uiConnectionStatusProvider.overrideWith(
      (ref) => Stream.value(ConnectionStatus.disconnected),
    ),
    surfaceIdsProvider.overrideWith((ref) => Stream.value(const <String>[])),
  ];

  Future<void> pumpChat(WidgetTester tester, {bool? agent2UI}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...homeOverrides(),
          if (agent2UI != null)
            useAgent2UIModeProvider.overrideWith((ref) => agent2UI),
        ],
        child: const MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: [Locale('en')],
          locale: Locale('en'),
          home: ChatScreen(),
        ),
      ),
    );
    // ⚠️ Agent2UI 视图里有 CircularProgressIndicator（无限动画）
    // ⇒ pumpAndSettle 等不到底 ⇒ 用有界泵。
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  group('Agent2UI 与对话同页共存', () {
    testWidgets('开着 A2UI ⇒ 面板在，**对话也在**', (WidgetTester tester) async {
      await pumpChat(tester, agent2UI: true);

      // 面板在。
      expect(find.byType(Agent2UIPanel), findsOneWidget);

      // ⚠️ **对话也在** —— 这是「共存」与「换页」的分水岭。
      final l10n = l10nOf(tester);
      expect(find.text(l10n.askSomething), findsOneWidget);
    });

    testWidgets('两个输入框的占位文案**不重样**（分得清在跟谁说话）', (WidgetTester tester) async {
      await pumpChat(tester, agent2UI: true);

      final l10n = l10nOf(tester);
      // 对话那个：「问点什么…」
      expect(find.text(l10n.askSomething), findsOneWidget);
      // A2UI 那个：「让端脑画界面…」
      expect(find.text(l10n.askAgent2UI), findsOneWidget);
    });

    testWidgets('AppBar 的其它入口**不让位**了（对话一直在）', (WidgetTester tester) async {
      await pumpChat(tester, agent2UI: true);

      // 以前 A2UI 形态下这些入口整块消失（因为对话被顶掉了）。
      expect(find.byIcon(Icons.settings), findsOneWidget);
      expect(find.byIcon(Icons.history), findsOneWidget);
    });

    testWidgets('AppBar 的 Agent2UI 按钮是**开关**：开 ⇒ 面板在，再点 ⇒ 收起来', (
      WidgetTester tester,
    ) async {
      // ⚠️ 这次**不覆盖** mode provider ⇒ 用真的 StateProvider ⇒ 点了会变。
      await pumpChat(tester);

      expect(find.byType(Agent2UIPanel), findsNothing);

      await tester.tap(find.byIcon(Icons.widgets_outlined));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(find.byType(Agent2UIPanel), findsOneWidget);
      // ⚠️ 面板在 ⇒ 对话**仍然**在。
      final l10n = l10nOf(tester);
      expect(find.text(l10n.askSomething), findsOneWidget);

      // 再点一次 ⇒ 面板收起来（实心图标 ⇒ 亮着＝开着）。
      await tester.tap(find.byIcon(Icons.widgets));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(find.byType(Agent2UIPanel), findsNothing);
      // 收起来之后对话占满。
      expect(find.text(l10n.askSomething), findsOneWidget);
    });
  });
}
