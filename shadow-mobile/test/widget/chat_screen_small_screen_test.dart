import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';

import 'test_helper.dart';

/// 小屏横屏 + 键盘弹起 ⇒ 聊天页**不许溢出**。
///
/// **为什么要有这条**：2026-10-31 在真机（RK3566 / Android 11 /
/// **1280x720 横屏**）上实测到 Flutter 报
/// 「**BOTTOM OVERFLOWED BY 102 PIXELS**」—— 空会话 + 键盘弹起时，
/// 空状态那个图标被画到了输入栏上面。
///
/// **根因**（按数字对上了才敢写）：
/// 键盘弹起后消息区（`Expanded`）被压到 **0 高**，而空状态那个
/// `Column` 是 `mainAxisSize: max` —— 在 `Center` 给的**松约束**下
/// 它取的是 `maxHeight`（= 0）⇒ 它的
/// 64(图标) + 16(间距) + 22(文字) = **102px** 的内容正好溢出 102px。
///
/// ⚠️ **这条测试要能失败才有意义** —— 修之前它必须是红的
/// （Flutter 的测试框架把布局溢出当**测试失败**报出来）。
void main() {
  testSetup();

  group('ChatScreen on a small landscape screen', () {
    // ⚠️ **几何为什么是 1280x648 而不是 1280x720**：
    // 真机是 RK3566 / Android 11 / **1280x720 横屏**，但那 720 里
    // **72px 是系统导航栏** ⇒ Flutter 实际拿到的是 **1280x648**。
    //
    // ⚠️ **扫描范围为什么到 460 为止**：
    // 真机上「键盘 + App 底部导航栏」合计吃掉 298 + 80 = **378px**
    // （= 视口的 58%）⇒ 换算到这条测试（没泵底部导航栏）就是
    // **380px 键盘**。扫到 460 是给真机留了两成的余量。
    //
    // ⚠️ **已知边界（没修，如实记着）**：键盘再高（≥540px ≈ 视口的 83%）
    // 时，**输入栏本身**（自然高度 ~85px）就放不下了 —— 那时端脑的
    // 消息区被压到 0 而输入栏溢出。**这不是空状态那个洞**（那个已修），
    // 是「屏幕 90% 被键盘占掉」的退化场景：那时候连输入框都快看不见了。
    // 要彻底解决得让整页可滚动 —— 但那会和消息列表自己的 ListView
    // 抢滚动（Flutter 经典的嵌套滚动坑），**代价大于收益**，本轮不做。
    for (final keyboardHeight in [
      200.0,
      260.0,
      300.0,
      340.0,
      380.0,
      420.0,
      460.0,
    ]) {
      testWidgets('does not overflow with a ${keyboardHeight.toInt()}px keyboard', (
        WidgetTester tester,
      ) async {
        tester.view.physicalSize = const Size(1280, 648);
        tester.view.devicePixelRatio = 1.0;
        tester.view.viewInsets = FakeViewPadding(bottom: keyboardHeight);
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          ProviderScope(
            overrides: getTestOverrides(),
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

        // 布局溢出在 widget test 里是**测试失败** ⇒ 能绿就说明没溢出。
        // 这里再显式取一次异常，让失败原因在报告里更直白。
        expect(tester.takeException(), isNull);
      });
    }
  });
}
