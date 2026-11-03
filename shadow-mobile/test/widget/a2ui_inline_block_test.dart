import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genui/genui.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/widgets/chat/a2ui_inline_block.dart';
import 'package:shadow_mobile/widgets/chat/tool_call_card.dart';

import '../support/a2ui_fixture.dart';
import 'test_helper.dart';

/// **A2UI 内联在消息里** —— 这条不变量钉在这里。
///
/// 客户端工具 `show_a2ui_surface` 让**模型在对话里**点名要界面 ⇒
/// 设备取回 surface ⇒ **画在那条消息里**（不是顶部面板、不是另一个页面）。
///
/// ⚠️ **契约是共享 fixture**：事件字节与端脑 `POST /a2a` 发的**逐字同形**
/// （`fixtures/a2ui/tasks_sse.txt`）⇒ ⇒ 桌面端那份用例消费的是同一批字节。
class _ToolCallChatNotifier extends MockChatNotifier {
  _ToolCallChatNotifier(List<ChatMessageModel> messages) {
    state = state.copyWith(messages: messages);
  }
}

void main() {
  testSetup();

  Future<void> pumpChat(
    WidgetTester tester, {
    required List<Override> overrides,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...getTestOverrides(), ...overrides],
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

  /// 那条「承载工具调用」的消息。
  ChatMessageModel toolCallMessage(Object? result, List<String> surfaceIds) {
    return ChatMessageModel(
      '',
      ChatRole.assistant,
      toolCall: ToolCallModel(
        id: 'call-1',
        name: 'show_a2ui_surface',
        args: const {'view': 'tasks'},
        status: ToolCallStatus.succeeded,
        result: result,
        reported: true,
        a2uiSurfaceIds: surfaceIds,
      ),
    );
  }

  testWidgets('工具调用那条消息里 ⇒ 真的画出了 surface（组件树）', (
    WidgetTester tester,
  ) async {
    final service = a2uiFixtureService();
    addTearDown(service.dispose);

    // ⚠️ **走真的那条路** —— 工具执行时做的就是这件事：
    //    取回原始事件 ⇒ 喂进 processor ⇒ surface 才存在。
    final events = await service.fetchSurfaceEvents('tasks');
    final result = <String, dynamic>{
      'report': '已展开「任务看板」。',
      'a2ui_events': events,
    };

    await pumpChat(
      tester,
      overrides: [
        genUIAgentServiceProvider.overrideWithValue(service),
        chatProvider.overrideWith(
          (ref) => _ToolCallChatNotifier([
            toolCallMessage(
              result,
              a2uiSurfaceIdsFromToolResult(result),
            ),
          ]),
        ),
      ],
    );

    // 那张工具卡片在。
    expect(find.byType(ToolCallCard), findsOneWidget);
    // ⚠️ **内联插槽在** —— 界面画在这条消息里，不是顶部面板。
    expect(find.byKey(A2uiInlineBlock.inlineKey), findsOneWidget);
    // ⚠️ 而且 surface **就在那个插槽里**。
    expect(
      find.descendant(
        of: find.byKey(A2uiInlineBlock.inlineKey),
        matching: find.byType(GenUiSurface),
      ),
      findsOneWidget,
    );
    // ⚠️ **真的画出了组件树** —— 不是一句文字，是一个 surface。
    //    （fixture 里的任务标题 ＋ 看板标题）
    expect(find.text('写周报'), findsOneWidget);
    expect(find.text('Tasks (1)'), findsOneWidget);
    // ⚠️ **只有这一处** —— 不是另开一块面板又画一遍。
    expect(find.byType(GenUiSurface), findsOneWidget);
    // ⚠️ **那句摘要用户也看得见**（它就是给模型看的那一句）。
    expect(find.text('已展开「任务看板」。'), findsOneWidget);
  });

  testWidgets('事件没喂进 processor ⇒ 消息里**没有**组件树（不画半成品）', (
    WidgetTester tester,
  ) async {
    final service = a2uiFixtureService();
    addTearDown(service.dispose);

    // ⚠️ **只给 surface id，不喂事件** —— 组件还在缓存里，画不出东西。
    await pumpChat(
      tester,
      overrides: [
        genUIAgentServiceProvider.overrideWithValue(service),
        chatProvider.overrideWith(
          (ref) => _ToolCallChatNotifier([
            toolCallMessage(const {'report': '端脑这次没有画界面。'}, [
              'shadow.tasks',
            ]),
          ]),
        ),
      ],
    );

    expect(find.byKey(A2uiInlineBlock.inlineKey), findsOneWidget);
    // ⚠️ **画不出东西** —— 用户看到的是空白，而不是半成品。
    expect(find.text('写周报'), findsNothing);
    // ⚠️ 但**如实说了没画出来** —— 不是一句空白。
    expect(find.text('端脑这次没有画界面。'), findsOneWidget);
  });
}
