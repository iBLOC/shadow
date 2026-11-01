import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/widgets/chat/local_chat_view.dart';

import 'test_helper.dart';

/// 对话页顶部那行「**当前会话**」。
///
/// ⚠️ 为什么它必须存在：端脑的会话**没有标题字段** ⇒ 标题是客户端
/// **派生**的 ⇒ ⇒ 多会话里唯一的身份线索就是它 ⇒ ⇒ 不显示它 ⇒
/// 用户根本不知道自己在哪条会话里 ⇒ ⇒ 「消息落到哪条会话」成了一件
/// **用户猜**的事。
///
/// ✅ 关键：标题从 `state.messages`（**屏幕上真正显示的那些消息**）派生
/// ⇒ ⇒ 而不是另存一份 ⇒ ⇒ 界面显示的这条，与「下一条消息会落进去的
/// 那条」，**必然是同一条** ⇒ ⇒ 不变量是**结构上**成立的。
///
/// ⚠️ 断言钉在 **key** 上（`active-conversation`）—— 不靠猜文本：
/// 那句标题在消息气泡里**也会出现一次**（第一条用户发言就是它）
/// ⇒ ⇒ 用 `find.text` 会数到两个 ⇒ ⇒ 钉在 key 上才分得清。
Future<void> pumpChatView(
  WidgetTester tester, {
  required ChatState state,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: getTestOverrides(),
      child: MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          // ⚠️ ~zh~ 少了 Cupertino 代理会抛「locale not supported」⇒ ⇒
          // 加上它（对话框那些 Cupertino 控件要它）。
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh')],
        locale: const Locale('zh'),
        home: Builder(
          builder: (context) => Scaffold(
            body: LocalChatView(
              chatState: state,
              l10n: AppLocalizations.of(context)!,
              isDark: false,
              scrollController: ScrollController(),
              promptController: TextEditingController(),
              onSendMessage: () {},
              onSpeak: () {},
              onPickImage: () {},
              onCaptureImage: () {},
              onPickFile: () {},
              onStartAudioRecording: () {},
              onStopAudioRecording: () {},
              onStopAndSend: () {},
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Finder header() => find.byKey(const ValueKey('active-conversation'));

void main() {
  testSetup();

  group('对话页的「当前会话」', () {
    testWidgets('显示当前会话的标题（= 第一条用户发言）与叶区名', (tester) async {
      await pumpChatView(
        tester,
        state: ChatState(
          sessionId: 'conv-a',
          activeConversationAgent: 'temporal',
          messages: [
            ChatMessageModel('帮我把主题换成靛蓝', ChatRole.user),
            ChatMessageModel('好，换好了', ChatRole.assistant),
          ],
        ),
      );

      expect(header(), findsOneWidget);
      expect(
        find.descendant(
          of: header(),
          matching: find.textContaining('帮我把主题换成靛蓝'),
        ),
        findsOneWidget,
      );
      // 叶区名没丢 —— 它是副标签。
      expect(
        find.descendant(
          of: header(),
          matching: find.textContaining('temporal'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('空会话（还没说话）⇒ 显示「新会话」+ 叶区名', (tester) async {
      await pumpChatView(
        tester,
        state: ChatState(
          sessionId: 'conv-new',
          activeConversationAgent: 'temporal',
        ),
      );

      expect(header(), findsOneWidget);
      expect(
        find.descendant(
          of: header(),
          matching: find.textContaining('temporal'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: header(),
          matching: find.textContaining('新会话'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('切会话失败 ⇒ 顶部**仍是当前那条**的标题 ＋ 输入框被禁用', (
      tester,
    ) async {
      await pumpChatView(
        tester,
        state: ChatState(
          sessionId: 'conv-a',
          activeConversationAgent: 'temporal',
          // 打不开的那条被记下来了 ⇒ ⇒ 闸门关上。
          failedSwitchSessionId: 'conv-missing',
          messages: [
            ChatMessageModel('这条是上一条会话的', ChatRole.user),
          ],
        ),
      );

      // ⚠️ 显示的必须是**当前这条**（不是空的、也不是打不开的那条）。
      expect(
        find.descendant(
          of: header(),
          matching: find.textContaining('这条是上一条会话的'),
        ),
        findsOneWidget,
      );
      // ⚠️ 闸门到了界面：输入框**禁用** ⇒ ⇒ 不可能有消息落进别的会话。
      final input = tester.widget<TextField>(find.byType(TextField));
      expect(input.enabled, isFalse);
    });
  });
}
