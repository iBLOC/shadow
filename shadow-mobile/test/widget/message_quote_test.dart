import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_en.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/widgets/chat/local_chat_view.dart';
import 'package:shadow_mobile/widgets/chat/tool_call_card.dart';

import '../unit/agui_fakes.dart';
import 'test_helper.dart';

/// 一个**能塞初始消息**的 notifier（判据专用）。
///
/// ⚠️ **为什么需要它**：生产里 `chat_screen` 把 **provider 的状态**当
/// `chatState` 传给 `LocalChatView` ⇒ ⇒ 两边是**同一份** ⇒ ⇒ 长按那一格
/// 里的 `quoteMessage(index)` 找得到那条消息。
/// 判据里若只把消息塞给 widget 的 prop（而不塞给 provider）⇒ ⇒ 两边
/// **分叉** ⇒ ⇒ 引用那一格必然红 ⇒ ⇒ 那是**夹具**的问题，不是实现的问题。
class SeedableChatNotifier extends ChatNotifier {
  SeedableChatNotifier() : super(MockTts(), ToolMockClient());

  void seedMessages(List<ChatMessageModel> messages) {
    state = ChatState(
      messages: messages,
      sessionId: 'conv-1',
      activeConversationAgent: 'prefrontal',
    );
  }
}

/// 「长按气泡 ⇒ ⇒ **引用**到输入框」的**接线**判据（2026-11-17）。
///
/// ## 这一层钉的是哪几格
///
/// ❶ **菜单里真的有「引用」**（长按气泡 ⇒ ⇒ 那一项在）。
/// ❷ **点它 ⇒ ⇒ 待发状态里真的挂上了那一条**（不是画了个按钮）。
/// ❸ **引用条画在输入框上方**（生产里父组件会拿新状态重建 ⇒ ⇒ 这里也
///    照着重建一次）⇒ ⇒ 并且**写明是谁说的**（引的是自己那句还是助手
///    那句 ⇒ ⇒ 意思完全不同）。
/// ❹ **点 × ⇒ ⇒ 引用条消失**（取消得掉）。
/// ❺ **工具卡片的长按菜单里没有「引用」**（工具卡片的内容是空的 ⇒ ⇒
///    引用它没有意义 ⇒ ⇒ 那一格被裁掉）。
///
/// ⚠️ **纯函数层与「真的到了端脑」那一格在别处**
/// （`test/unit/chat_quote_test.dart`）—— 这一层只管**接线**。
void main() {
  testSetup();

  Widget wrap(ChatState state, ChatNotifier notifier) {
    return ProviderScope(
      overrides: [
        serviceProvider.overrideWith((ref) => MockServiceNotifier()),
        themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
        chatProvider.overrideWith((ref) => notifier),
        conversationModeProvider.overrideWith(
          (ref) => MockConversationModeNotifier(),
        ),
      ],
      child: MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: const [Locale('en')],
        locale: const Locale('en'),
        home: Scaffold(
          body: LocalChatView(
            chatState: state,
            l10n: AppLocalizationsEn(),
            isDark: false,
            scrollController: ScrollController(),
            promptController: TextEditingController(),
            onSendMessage: () {},
            onSpeak: () {},
            onPickImage: () {},
            onCaptureImage: () {},
            onPickFile: () {},
            onStartAudioRecording: () {},
            onFinishRecording: (cancel) async {},
            onCaptureVideo: () {},
          ),
        ),
      ),
    );
  }

  /// 造一台带初始消息的 notifier（消息**同时**在 provider 的状态里）。
  SeedableChatNotifier notifierWith(List<ChatMessageModel> messages) {
    final notifier = SeedableChatNotifier();
    notifier.seedMessages(messages);
    return notifier;
  }

  /// 生产里输入框那一块的状态是**父组件拿 provider 的状态重建**的
  /// ⇒ ⇒ 这里照着做一次（不重建 ⇒ 引用条永远不会画出来）。
  Future<void> rebuildWith(
    WidgetTester tester,
    ProviderContainer container,
  ) async {
    await tester.pumpWidget(
      wrap(container.read(chatProvider), container.read(chatProvider.notifier)),
    );
    await tester.pumpAndSettle();
  }

  ProviderContainer containerOf(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byType(LocalChatView)));

  testWidgets('长按气泡 ⇒ ⇒ 菜单里有「引用」', (tester) async {
    final notifier = notifierWith([
      ChatMessageModel('第一条', ChatRole.user),
      ChatMessageModel('第二条', ChatRole.assistant),
    ]);
    await tester.pumpWidget(wrap(notifier.state, notifier));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('第二条'));
    await tester.pumpAndSettle();

    expect(find.text(l10nOf(tester).messageActionQuote), findsOneWidget);
  });

  testWidgets('点「引用」⇒ ⇒ 挂上了那一条，引用条画在输入框上方', (tester) async {
    final notifier = notifierWith([
      ChatMessageModel('他说的那句', ChatRole.assistant),
    ]);
    await tester.pumpWidget(wrap(notifier.state, notifier));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('他说的那句'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10nOf(tester).messageActionQuote));
    await tester.pumpAndSettle();

    // ⇒ ⇒ 菜单关掉了，且待发状态里**真的挂上了**那一条。
    final container = containerOf(tester);
    final pending = container.read(chatProvider).quotedMessage;
    expect(pending, isNotNull);
    expect(pending!.text, '他说的那句');
    expect(pending.role, ChatRole.assistant);

    // ⇒ ⇒ 父组件重建（生产里就是这样）⇒ ⇒ 引用条画出来了。
    await rebuildWith(tester, container);
    expect(find.text(l10nOf(tester).chatQuoteFromAssistant), findsOneWidget);
    // ⇒ ⇒ 片段**也在**（气泡里那句 + 引用条里那句 ⇒ ⇒ 两处）。
    expect(find.text('他说的那句'), findsAtLeastNWidgets(2));
  });

  testWidgets('引用自己的消息 ⇒ ⇒ 引用条写明是「你的消息」', (tester) async {
    final notifier = notifierWith([
      ChatMessageModel('我说过的那句', ChatRole.user),
    ]);
    await tester.pumpWidget(wrap(notifier.state, notifier));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('我说过的那句'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10nOf(tester).messageActionQuote));
    await tester.pumpAndSettle();

    final container = containerOf(tester);
    await rebuildWith(tester, container);
    expect(find.text(l10nOf(tester).chatQuoteFromUser), findsOneWidget);
  });

  testWidgets('点 × ⇒ ⇒ 引用条消失（取消得掉）', (tester) async {
    final notifier = notifierWith([
      ChatMessageModel('他说的那句', ChatRole.assistant),
    ]);
    await tester.pumpWidget(wrap(notifier.state, notifier));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('他说的那句'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10nOf(tester).messageActionQuote));
    await tester.pumpAndSettle();

    final container = containerOf(tester);
    await rebuildWith(tester, container);
    expect(find.text(l10nOf(tester).chatQuoteFromAssistant), findsOneWidget);

    await tester.tap(find.byTooltip(l10nOf(tester).chatQuoteDismiss));
    await tester.pumpAndSettle();

    expect(container.read(chatProvider).quotedMessage, isNull);
    await rebuildWith(tester, container);
    expect(find.text(l10nOf(tester).chatQuoteFromAssistant), findsNothing);
  });

  testWidgets('工具卡片的长按菜单 ⇒ ⇒ **没有**「引用」', (tester) async {
    final call = ToolCallModel(
      id: 'call-1',
      name: 'generate_image',
      description: '生成一张图',
      args: const <String, dynamic>{'prompt': '一只猫'},
      status: ToolCallStatus.succeeded,
      result: const <String, dynamic>{},
    );
    final notifier = notifierWith([
      ChatMessageModel('', ChatRole.assistant, toolCall: call),
    ]);
    await tester.pumpWidget(wrap(notifier.state, notifier));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.byType(ToolCallCard));
    await tester.pumpAndSettle();

    // ⇒ ⇒ 工具卡片的内容是空的 ⇒ ⇒ 引用它没有意义 ⇒ ⇒ 菜单里不给。
    expect(find.text(l10nOf(tester).messageActionQuote), findsNothing);
  });
}
