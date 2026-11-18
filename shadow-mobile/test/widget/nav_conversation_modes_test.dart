import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/navigation/nav.g.dart';
import 'package:shadow_mobile/router/app_router.dart';
import 'package:shadow_mobile/widgets/chat/conversation_mode_switcher.dart';

import 'test_helper.dart';

/// **入口隐藏**这一族（2026-11-16）—— 用户诉求逐字：
/// 「直播和智能客服页面先隐藏」。
///
/// ⚠️ 这一族最容易变成「**删了一半**」：
/// ❶ 清单里去了 id，但**页面代码**也删了 ⇒ ⇒ 说好「先隐藏」其实变成「下线」
///    ⇒ ⇒ 想恢复时得重写一整页。
/// ❷ 页面还在，但清单没去 ⇒ ⇒ 界面上**还看得见** ⇒ ⇒ 「隐藏」是假的。
/// ❸ 顺手把**别的**入口也砍了（语音 / 底 tab）⇒ ⇒ 「隐藏两格」变成「砍掉一半」。
///
/// ⇒ ⇒ 这三条各钉一条判据：**入口没了** ＋ **代码留档** ＋ **别的没被误伤**。
void main() {
  testSetup();

  group('对话形态清单：隐藏掉的两格', () {
    test('形态清单只剩「对话 / 语音」⇒ 直播 / 客服的入口没了', () {
      // ⚠️ 逐字钉住**顺序与集合** —— 只钉「不含 livestream」的话，
      // 哪天清单被清空了也会绿 ⇒ ⇒ 那就变成「一个入口都没有」。
      expect(conversationModes.map((m) => m.id).toList(), ['chat', 'voice']);
      expect(conversationModes.any((m) => m.id == 'livestream'), isFalse);
      expect(conversationModes.any((m) => m.id == 'customer-service'), isFalse);
    });

    test('隐藏的是**入口**，不是能力 ⇒ ⇒ 路由与页面代码都留档（可恢复）', () {
      expect(AppRoutes.liveStream, '/livestream');
      expect(AppRoutes.customerService, '/customer-service');
      expect(File('lib/screens/livestream_screen.dart').existsSync(), isTrue);
      expect(
        File('lib/screens/customer_service_screen.dart').existsSync(),
        isTrue,
      );
    });

    test('底 tab 仍是四个 ⇒ ⇒ 隐藏没顺手砍掉别的入口', () {
      expect(
        mobileNavTabs.map((t) => t.id).toList(),
        ['chat', 'tasks', 'capability', 'me'],
      );
    });

    test('语音这一格**没被误伤** —— 用户只让删那个独立页面', () {
      // ⚠️ 「删语音页」≠「删语音」—— 语音是**对话页的输入模式**，
      // 那一格必须还在 ⇒ 否则用户点不到「按住说话」。
      expect(conversationModes.any((m) => m.id == 'voice'), isTrue);
      expect(AppRoutes.voice, '/voice');
    });
  });

  group('独立语音页已删（死文件不许复活）', () {
    test('voice_conversation_screen.dart 不在树里', () {
      // 它是一份**不记记忆**的死文件（推理不进端脑会话）⇒ ⇒ 留在树里
      // 就是给下一个人留一条「看起来能用」的入口。
      expect(
        File('lib/screens/voice_conversation_screen.dart').existsSync(),
        isFalse,
      );
    });

    test('那份假测试也不在（它从来没 import 那个页面）', () {
      // ⚠️ 旧测试只渲染了一个占位 Text ⇒ ⇒ 页面**删了它还绿**
      // ⇒ ⇒ 它钉的不是任何东西 ⇒ ⇒ 跟着一起走。
      expect(
        File('test/widget/voice_conversation_screen_test.dart').existsSync(),
        isFalse,
      );
    });
  });

  group('承载级：切换器上真机上只画两格', () {
    testWidgets('形态切换条只画「对话 / 语音」⇒ 直播 / 客服**看不见**', (
      tester,
    ) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const Scaffold(body: ConversationModeSwitcher()),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh')],
        ),
      );
      await tester.pumpAndSettle();

      // ⚠️ 断言用**本地化实例**，不写死中英文 —— 翻译一改不该跟着改。
      final l10n = l10nOf(tester);
      expect(find.text(l10n.surfaceChat), findsOneWidget);
      expect(find.text(l10n.surfaceVoice), findsOneWidget);
      // 这两格是**隐藏**掉的 ⇒ ⇒ 界面上不许出现（哪怕文案换成别的说法）。
      expect(find.text(l10n.surfaceLivestream), findsNothing);
      expect(find.text(l10n.surfaceCustomerService), findsNothing);
    });
  });
}