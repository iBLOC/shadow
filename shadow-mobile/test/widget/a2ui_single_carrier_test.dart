import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';

import 'test_helper.dart';

/// **移动端的 A2UI 面只有一条承载：AG-UI ＋ 内联在对话里。**
///
/// ## 这条不变量钉的是什么
///
/// 2026-11-18 之前，移动端**同一个页面里住着两条协议**：
///
/// | 形态 | 传输 | 长在哪 | 记会话吗 |
/// |---|---|---|---|
/// | **独立面板** | **A2A**（`/a2a`） | 顶部**另一块**（自带输入条、连接状态栏） | **不记** |
/// | **内联** | **AG-UI** | **对话消息里** | 记 |
///
/// ⇒ ⇒ 用户看到的是「对话」与「另一个界面」两块 ⇒ ⇒ 用户诉求逐字：
/// 「现在移动端 对话也没按和agent2ui页面还是两个页面 有没有一种可能合并为一个
/// 页面使用a2ui 传输协议使用ag-ui」⇒ ⇒ **独立面板那条被摘掉了**。
///
/// ## 为什么摘掉它**不丢能力**
///
/// ① 面板能给的只有 `tasks`／`agents` 两个视图；
/// ② 端脑在 **AG-UI** 路里对**同样两个视图**用**同一套** `a2ui::render_view`
///    产出面（`telencephalon/src/api/shadow/agui.rs`）
///    ⇒ ⇒ 两边**逐字同形**（父仓 `check-agui-a2ui-wire.mjs` 的 W6 判据钉着）；
/// ③ 端脑的**关键词兜底**同样生效（`resolve_view`：「任务」⇒ tasks）
///    ⇒ ⇒ 用户在**对话框**里说一句「我的任务」就出面
///    ⇒ ⇒ 而且**这一条记会话**（面板那条不记）。
///
/// ⇒ ⇒ 摘掉的是**重复的第二条路**，不是能力。
///
/// ## 这条判据怎么被验的
///
/// · 这里（widget 层）钉**页面上没有第二个界面**；
/// · 「面**真的内联在消息里**」由 `a2ui_inline_block_test.dart` 钉；
/// · 「**代码形状**不许回退」（对话页不许再挂面板）由父仓
///   `scripts/check-mobile-single-a2ui-carrier.mjs` 钉。
void main() {
  testSetup();

  Future<void> pumpChat(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: getTestOverrides(),
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
    await tester.pumpAndSettle();
  }

  group('移动端只有一条 A2UI 承载（AG-UI ＋ 内联）', () {
    testWidgets('AppBar 上**没有**「另一个界面」的开关了', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      // ⚠️ 以前这里有一个常驻的 `widgets` 按钮（开/关那块 A2A 面板）
      // ⇒ ⇒ 它就是「两个界面」在 UI 上的**唯一入口** ⇒ ⇒ 摘掉它。
      expect(find.byIcon(Icons.widgets_outlined), findsNothing);
      expect(find.byIcon(Icons.widgets), findsNothing);
    });

    testWidgets('页面上**只有对话那一个输入框**（不是两个）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      final l10n = l10nOf(tester);
      // 对话那个：「轻触输入 · 长按说话」
      expect(find.text(l10n.tapToTypeHoldToTalk), findsOneWidget);
      // ⚠️ **面板那个输入框没了** —— 它的占位文案是「让端脑画界面…」
      // ⇒ ⇒ 同屏两个输入框 = 用户分不清在跟谁说话 ⇒ ⇒ 那正是摘它的另一半理由。
      expect(find.text(l10n.askA2ui), findsNothing);
    });

    testWidgets('对话的入口一个不少（摘面板没有误伤）', (
      WidgetTester tester,
    ) async {
      await pumpChat(tester);

      expect(find.byIcon(Icons.settings), findsOneWidget);
      expect(find.byIcon(Icons.history), findsOneWidget);
    });
  });
}
