import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_en.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/widgets/chat/local_chat_view.dart';

import 'test_helper.dart';

/// 长按 →「复制为 JSON / 复制聊天记录为 JSON」的**接线**判据。
///
/// 纯序列化已经有单测（`test/unit/chat_debug_json_test.dart`）；这里钉的是
/// 另一半 —— 菜单里真的有这两项、点了真的把 JSON 写进剪贴板、载荷里真的
/// 带会话上下文。**两半各错一半**时，任何一半的单测都发现不了（菜单没接线
/// ⇒ 单测照样绿；序列化错了 ⇒ 菜单照样弹）。
void main() {
  testSetup();

  late List<MethodCall> clipboardCalls;

  setUp(() {
    clipboardCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboardCalls.add(call);
          }
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  Widget wrap(ChatState state) {
    return ProviderScope(
      overrides: getTestOverrides(),
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
            onStopAudioRecording: () {},
            onStopAndSend: () {},
          ),
        ),
      ),
    );
  }

  ChatState stateWith(List<ChatMessageModel> messages) => ChatState(
    messages: messages,
    sessionId: 'conv-1',
    activeConversationAgent: 'prefrontal',
  );

  String lastCopiedText() =>
      ((clipboardCalls.single.arguments as Map)['text'] as String);

  testWidgets('长按消息 ⇒ 菜单有「复制为 JSON」，点它复制**这一条**的信封', (tester) async {
    await tester.pumpWidget(
      wrap(
        stateWith([
          ChatMessageModel('第一条', ChatRole.user),
          ChatMessageModel('第二条', ChatRole.assistant),
        ]),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('第二条'));
    await tester.pumpAndSettle();
    expect(find.text('Copy as JSON'), findsOneWidget);

    await tester.tap(find.text('Copy as JSON'));
    await tester.pumpAndSettle();

    expect(clipboardCalls, hasLength(1));
    final json = jsonDecode(lastCopiedText()) as Map<String, dynamic>;
    expect(json['schema'], 'shadow.chat.message');
    expect(json['message_index'], 1);
    expect((json['message'] as Map)['content'], '第二条');
    // 上下文（会话 id / 叶区 / 一共几条）必须一起带上，否则调试没法定向。
    expect((json['conversation'] as Map)['session_id'], 'conv-1');
    expect((json['conversation'] as Map)['agent'], 'prefrontal');
    expect((json['conversation'] as Map)['message_count'], 2);
  });

  testWidgets('长按消息 ⇒ 菜单有「复制聊天记录为 JSON」，点它复制**整段**', (tester) async {
    await tester.pumpWidget(
      wrap(
        stateWith([
          ChatMessageModel('第一条', ChatRole.user),
          ChatMessageModel('第二条', ChatRole.assistant),
        ]),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('第一条'));
    await tester.pumpAndSettle();
    expect(find.text('Copy chat history as JSON'), findsOneWidget);

    await tester.tap(find.text('Copy chat history as JSON'));
    await tester.pumpAndSettle();

    expect(clipboardCalls, hasLength(1));
    final json = jsonDecode(lastCopiedText()) as Map<String, dynamic>;
    expect(json['schema'], 'shadow.chat.conversation');
    expect((json['messages'] as List), hasLength(2));
    expect(
      (json['messages'] as List)
          .map((m) => (m as Map<String, dynamic>)['role'])
          .toList(),
      ['user', 'assistant'],
    );
  });
}
