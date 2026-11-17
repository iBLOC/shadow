import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

import 'agui_fakes.dart';

/// **「档位」那一格的端到端判据**。
///
/// ⚠️ **AG-UI 那一路换了契约**：端脑的 AG-UI 入参**没有** `capability_modes`
/// ⇒ ⇒ 档位**不再随消息发出去** ⇒ ⇒ 档位改成**客户端这一侧**执行：
/// · 「彻底关闭」⇒ ⇒ 那个工具**不进**发给模型的 `tools` 清单（模型看不见它）；
/// · 「每次询问」⇒ ⇒ 客户端**等用户点头**才执行；
/// · 「完全访问」⇒ ⇒ 直接执行。
///
/// ⚠️ 纯函数判据只证明「`capabilityModesPayload` 能算出来」⇒ ⇒ **不证明**
/// 执行点把它接上了 ⇒ ⇒ 这一层才是「接上了」的证据。
void main() {
  ClientToolRegistry calendarTools(List<Map<String, dynamic>> executed) {
    return ClientToolRegistry([
      ClientTool(
        name: 'calendar_read_events',
        description: 'Read calendar.',
        capability: Capability.calendarRead,
        execute: (args) async {
          executed.add(args);
          return <String, dynamic>{'events': <String>[]};
        },
      ),
    ]);
  }

  List<String> toolNamesOf(FakeAguiBrain brain) {
    final List<dynamic> tools = brain.requests.last['tools'] as List<dynamic>;
    return tools
        .map((dynamic t) => (t as Map)['name'] as String)
        .toList();
  }

  /// 等那张工具卡片进入指定状态。
  Future<void> waitForStatus(
    ChatNotifier notifier,
    ToolCallStatus status,
  ) async {
    for (var i = 0; i < 200; i++) {
      final calls = notifier.state.messages
          .where((m) => m.toolCall != null)
          .map((m) => m.toolCall!)
          .toList();
      if (calls.isNotEmpty && calls.last.status == status) return;
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    fail('1 秒内没等到状态 $status');
  }

  group('档位在**客户端这一侧**生效（AG-UI 那一路）', () {
    test('「彻底关闭」⇒ 那个工具**不进**清单（模型看不见它）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('好'), aguiFinished()],
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: calendarTools(<Map<String, dynamic>>[]),
        capabilityModeFor: (Capability c) => c == Capability.calendarRead
            ? AuthorizationMode.disabled
            : AuthorizationMode.askEveryTime,
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('看看日历');

      expect(toolNamesOf(brain), isNot(contains('calendar_read_events')));
    });

    test('「完全访问」⇒ 工具在清单里，且**直接执行**（不点头）', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[
          ...aguiToolCall(
            toolCallId: 'c1',
            toolCallName: 'calendar_read_events',
          ),
          aguiFinished(),
        ],
        <String>[aguiFinished(runId: 'r2')],
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: calendarTools(executed),
        capabilityModeFor: (Capability c) => AuthorizationMode.fullAccess,
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('看看日历');

      expect(toolNamesOf(brain), contains('calendar_read_events'));
      expect(executed, hasLength(1));
    });

    test('「每次询问」⇒ 工具在清单里，且**要点头**才执行', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[
          ...aguiToolCall(
            toolCallId: 'c1',
            toolCallName: 'calendar_read_events',
          ),
          aguiFinished(),
        ],
        <String>[aguiFinished(runId: 'r2')],
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: calendarTools(executed),
        capabilityModeFor: (Capability c) => AuthorizationMode.askEveryTime,
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('看看日历');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      expect(executed, isEmpty);
      await notifier.approveToolCall('c1');
      await done;
      expect(executed, hasLength(1));
    });

    test('⚠️ 档位是在**运行时**读的（用户改完 ⇒ 下一条消息就变了）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('好'), aguiFinished()],
        <String>[aguiText('好', messageId: 'm2'), aguiFinished(runId: 'r2')],
      ]);
      AuthorizationMode mode = AuthorizationMode.askEveryTime;
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: calendarTools(<Map<String, dynamic>>[]),
        capabilityModeFor: (Capability c) => mode,
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('第一条');
      // 「每次询问」⇒ ⇒ 工具**在**清单里（模型看得见，只是要点头）。
      expect(toolNamesOf(brain), contains('calendar_read_events'));

      // ⇒ ⇒ 用户在设置里把它改成「彻底关闭」。
      mode = AuthorizationMode.disabled;
      await notifier.generateResponse('第二条');
      expect(toolNamesOf(brain), isNot(contains('calendar_read_events')));
    });
  });
}
