import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/sensitive_packages.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

class MockTts extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

/// 会发一串事件、并记录「结果回传」的端脑 mock。
class ToolMockClient extends TelencephalonClient {
  final List<StreamEvent> events;

  /// 每次结果回传的请求体。
  final List<Map<String, dynamic>> reports = [];

  /// 每次发消息的请求体（用来断言「发出去什么」）。
  final List<SendMessageRequest> requests = [];

  /// 模拟端脑还没上这个端点（404）。
  bool reportThrows = false;

  /// 实时流 override —— 「同一轮多条 tool_call」的时序测试用
  /// （静态 events 是一次性 yield，做不出「收到结果才发下一条」）。
  Stream<StreamEvent>? streamOverride;

  ToolMockClient(this.events) : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    final now = DateTime.now();
    return Conversation(
      id: 'conv-1',
      agent: agent ?? 'test-agent',
      createdAt: now,
      updatedAt: now,
      history: const [],
    );
  }

  @override
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    requests.add(req);
    final override = streamOverride;
    if (override != null) {
      yield* override;
      return;
    }
    for (final event in events) {
      yield event;
    }
  }

  @override
  Future<void> reportToolResult(
    String conversationId, {
    required String name,
    String? toolCallId,
    required Object? result,
    bool ok = true,
  }) async {
    if (reportThrows) {
      throw TelencephalonException('POST → 404: Not Found');
    }
    reports.add({
      'conversation_id': conversationId,
      'name': name,
      'tool_call_id': toolCallId,
      'result': result,
      'ok': ok,
    });
  }
}

void main() {
  /// 对话流里最后那张工具卡片。
  ToolCallModel? lastToolCall(ChatNotifier notifier) {
    final calls = notifier.state.messages
        .where((m) => m.toolCall != null)
        .map((m) => m.toolCall!)
        .toList();
    return calls.isEmpty ? null : calls.last;
  }

  /// 工具的执行 + 回传是**后台**跑的（不阻塞 SSE 读循环）⇒ 测试要等它落定。
  ///
  /// 「落定」= 状态到了终态 **并且**「结果回传」那条也走完了
  /// （成功 ⇒ reported；失败 ⇒ reportErrorText）。
  Future<void> waitForSettled(ChatNotifier notifier) async {
    for (var i = 0; i < 200; i++) {
      final call = lastToolCall(notifier);
      if (call != null) {
        final terminal = call.status == ToolCallStatus.succeeded ||
            call.status == ToolCallStatus.failed;
        if (terminal && (call.reported || call.reportErrorText != null)) {
          return;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    fail('工具调用在 1 秒内没落定');
  }

  ClientToolRegistry themeTool(List<Map<String, dynamic>> executed) {
    return ClientToolRegistry([
      ClientTool(
        name: 'set_theme',
        description: 'Change the app theme colour',
        execute: (args) async {
          executed.add(args);
          return <String, dynamic>{'applied': 'accent'};
        },
      ),
    ]);
  }

  group('端脑 tool_call → 客户端执行 → 回传端脑', () {
    test('执行成功：卡片是 succeeded，结果回传了端脑', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          args: parseToolArgs('{"color":"#4F46E5"}'),
        ),
        StreamEvent(type: 'delta', delta: '主题换好了'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: themeTool(executed),
      );

      await notifier.generateResponse('把主题换成靛蓝');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call, isNotNull);
      expect(call!.name, 'set_theme');
      expect(call.status, ToolCallStatus.succeeded);
      expect(call.args['color'], '#4F46E5');
      expect(call.reported, isTrue);

      // 本地真的执行了，参数是对的。
      expect(executed.single['color'], '#4F46E5');

      // 结果回传端脑了。
      expect(client.reports, hasLength(1));
      expect(client.reports.single['name'], 'set_theme');
      expect(client.reports.single['ok'], isTrue);
      expect(
        (client.reports.single['result'] as Map)['applied'],
        'accent',
      );
    });

    test('发消息时声明「等结果」—— 端脑才能在同一回合里接着说', () async {
      final client = ToolMockClient([
        StreamEvent(type: 'delta', delta: '你好'),
      ]);
      final notifier = ChatNotifier(MockTts(), client);

      await notifier.generateResponse('换个色');

      // 不声明的话，端脑不敢等 —— 那一回合就只剩一张沉默的卡片，
      // 模型的话要等到**下一回合**才说得出。
      expect(client.requests, isNotEmpty);
      expect(client.requests.single.awaitToolResult, isTrue);
    });

    test('args 线上是对象形态时同样认', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          args: <String, dynamic>{'color': '#71717A'},
        ),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: themeTool(executed),
      );

      await notifier.generateResponse('换个色');
      await waitForSettled(notifier);

      expect(executed.single['color'], '#71717A');
      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
    });

    test('未知工具：明确失败**并且**把失败回传给端脑', () async {
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'launch_missiles'),
      ]);
      final notifier = ChatNotifier(MockTts(), client);

      await notifier.generateResponse('发射');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, contains('unsupported tool'));
      // 闷着不吭声的话，模型会一直等一个永远不来的结果。
      expect(client.reports, hasLength(1));
      expect(client.reports.single['ok'], isFalse);
    });

    test('回传失败（端脑还没上这个端点）：对话不崩，卡片说清楚', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          args: parseToolArgs('{"color":"#4F46E5"}'),
        ),
      ])..reportThrows = true;
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: themeTool(executed),
      );

      await notifier.generateResponse('把主题换成靛蓝');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      // 工具在本地跑成了 —— 用户看到的主题色是真的。
      expect(call!.status, ToolCallStatus.succeeded);
      expect(executed, hasLength(1));
      // 但端脑那头没收到 —— 这是两件事，必须分开显示。
      expect(call.reported, isFalse);
      expect(call.reportErrorText, isNotNull);
      // 而且整条对话没有因此挂掉。
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.errorMessage, isNull);
    });

    test('工具抛异常：卡片是 failed，失败回传给端脑', () async {
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'boom'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'boom',
            description: 'always fails',
            execute: (args) async => throw StateError('炸了'),
          ),
        ]),
      );

      await notifier.generateResponse('炸');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, contains('炸了'));
      expect(client.reports.single['ok'], isFalse);
    });

    test('这一轮只有工具调用、没有正文：不是错误（工具卡片就是回复）', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          args: parseToolArgs('{"color":"#4F46E5"}'),
        ),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: themeTool(executed),
      );

      await notifier.generateResponse('把主题换成靛蓝');
      await waitForSettled(notifier);

      expect(notifier.state.errorMessage, isNull);
      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
      // 没有空气泡。
      final assistantTexts = notifier.state.messages
          .where((m) => m.role == ChatRole.assistant && m.toolCall == null)
          .map((m) => m.content)
          .toList();
      expect(assistantTexts, isEmpty);
      // 也没有「系统错误」气泡。
      expect(
        notifier.state.messages.where((m) => m.role == ChatRole.system),
        isEmpty,
      );
    });
  });

  group('需要用户点头的工具', () {
    test('用户在工具跑完之前离开页面 ⇒ 不崩（notifier 已被 dispose）', () async {
      // 工具是**后台**跑的（执行 + 回传不阻塞 SSE 读循环）。
      // 用户在它跑完之前离开页面 ⇒ notifier 已经被 dispose ⇒
      // 这时候再往 `state` 写会抛「Bad state: Tried to modify a
      // disposed provider」⇒ 整个 App 崩。
      final gate = Completer<void>();
      // ⚠️ **工具有没有真的跑完** —— 这一条是**承重**的。
      //   以前这里写的是 `expect(true, isTrue)` ⇒ ⇒ 恒真的空断言
      //   ⇒ ⇒ 而「工具压根没跑完」也会让那条空断言照样绿
      //   ⇒ ⇒ 也就是「风险窗口没被踩到」被当成了「验过了」。
      var toolRan = false;
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'slow'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'slow',
            description: 'takes a while',
            execute: (args) async {
              await gate.future;
              toolRan = true;
              return 'done';
            },
          ),
        ]),
      );

      // ⚠️ **异步错误要收得上来** —— 「dispose 之后回写 state」这个错
      //   是在**工具自己的续体里**抛的 ⇒ ⇒ 不是同步抛出
      //   ⇒ ⇒ `expect(() {...}, returnsNormally)` **抓不到**
      //   ⇒ ⇒ 必须用 zone 把「没人接手的异步错误」收上来。
      final asyncErrors = <Object>[];
      await runZonedGuarded(() async {
        await notifier.generateResponse('慢慢来');
        notifier.dispose();

        // 工具这时才跑完 —— 回写状态时 notifier 已经不在了。
        gate.complete();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }, (error, stack) => asyncErrors.add(error));

      // ⚠️ **这条才是「真的踩到过」的证据** —— 工具跑完了
      // ⇒ ⇒ 那次回写**真的撞上**了 dispose ⇒ ⇒ 「没崩」才是被验过的。
      expect(
        toolRan,
        isTrue,
        reason: '工具没跑完 ⇒ ⇒ 这一轮压根没验到「回写撞上 dispose」这件事',
      );
      expect(
        asyncErrors,
        isEmpty,
        reason: 'dispose 之后的回写必须无声无息 ⇒ ⇒ 实际抛了：$asyncErrors',
      );
    });

    test('先等用户点头，不执行、不回传', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'delete_everything'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'delete_everything',
            description: '不可逆',
            requiresApproval: true,
            execute: (args) async {
              executed.add(args);
              return 'deleted';
            },
          ),
        ]),
      );

      await notifier.generateResponse('全删了');

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.awaitingApproval);
      expect(executed, isEmpty);
      expect(client.reports, isEmpty);
    });

    test('用户点头 → 执行 + 回传', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'delete_everything'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'delete_everything',
            description: '不可逆',
            requiresApproval: true,
            execute: (args) async {
              executed.add(args);
              return 'deleted';
            },
          ),
        ]),
      );

      await notifier.generateResponse('全删了');
      await notifier.approveToolCall(lastToolCall(notifier)!.id);

      expect(executed, hasLength(1));
      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.succeeded);
      expect(call.reported, isTrue);
      expect(client.reports.single['ok'], isTrue);
    });

    test('用户拒绝 → 失败**并且**把拒绝回传给端脑', () async {
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'delete_everything'),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'delete_everything',
            description: '不可逆',
            requiresApproval: true,
            execute: (args) async => 'deleted',
          ),
        ]),
      );

      await notifier.generateResponse('全删了');
      await notifier.denyToolCall(lastToolCall(notifier)!.id);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, 'denied by user');
      // 模型要知道这条路走不通，而不是干等着。
      expect(client.reports.single['ok'], isFalse);
    });
  });

  group('手机操作：一轮一次授权（敏感目标除外）', () {
      /// 等最后一张工具卡片进入指定状态。
      Future<void> waitForStatus(
        ChatNotifier notifier,
        ToolCallStatus status,
      ) async {
        for (var i = 0; i < 200; i++) {
          final call = lastToolCall(notifier);
          if (call != null && call.status == status) return;
          await Future<void>.delayed(const Duration(milliseconds: 5));
        }
        fail('1 秒内没等到状态 $status');
      }

      ClientToolRegistry mobileTools(
        List<Map<String, dynamic>> executed, {
        String? readForegroundPackage,
      }) {
        return ClientToolRegistry([
          ClientTool(
            name: 'mobile_tap',
            description: 'Tap a point.',
            capability: Capability.mobileUse,
            execute: (args) async {
              executed.add(args);
              return <String, dynamic>{'tapped': true};
            },
          ),
          ClientTool(
            name: 'mobile_read_screen',
            description: 'Read the screen.',
            capability: Capability.mobileUse,
            execute: (args) async => <String, dynamic>{
              'foregroundPackage': readForegroundPackage ?? 'com.example.notes',
            },
          ),
        ]);
      }

      test('默认档：第一次手机操作弹卡片', () async {
        final executed = <Map<String, dynamic>>[];
        final controller = StreamController<StreamEvent>();
        final client = ToolMockClient(const [])..streamOverride = controller.stream;
        final notifier = ChatNotifier(
          MockTts(),
          client,
          clientTools: mobileTools(executed),
        );
        final done = notifier.generateResponse('帮我点一下');
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'c1',
        ));

        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        expect(executed, isEmpty);
        await notifier.approveToolCall('c1');
        await waitForSettled(notifier);
        expect(executed, hasLength(1));

        await controller.close();
        await done;
      });

      test('点头后同一轮的第二次手机操作不再弹（一轮一次）', () async {
        final executed = <Map<String, dynamic>>[];
        final controller = StreamController<StreamEvent>();
        final client = ToolMockClient(const [])..streamOverride = controller.stream;
        final notifier = ChatNotifier(
          MockTts(),
          client,
          clientTools: mobileTools(executed),
        );
        final done = notifier.generateResponse('连点两下');
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'c1',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        await notifier.approveToolCall('c1');
        await waitForSettled(notifier);

        // 同一轮第二条：端脑收到 c1 的结果后才发 c2 —— 此时不再弹。
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'c2',
        ));
        await waitForSettled(notifier);
        expect(executed, hasLength(2));

        await controller.close();
        await done;
      });

      test('下一轮重新弹（缓存跟着「一轮」走，不跟着会话走）', () async {
        final executed = <Map<String, dynamic>>[];
        final controller = StreamController<StreamEvent>();
        final client = ToolMockClient(const [])..streamOverride = controller.stream;
        final notifier = ChatNotifier(
          MockTts(),
          client,
          clientTools: mobileTools(executed),
        );
        final done = notifier.generateResponse('点一下');
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'r1c1',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        await notifier.approveToolCall('r1c1');
        await waitForSettled(notifier);
        await controller.close();
        await done;

        // 新一轮（第二次发送）：缓存已清 ⇒ 又要重新点头。
        final controller2 = StreamController<StreamEvent>();
        client.streamOverride = controller2.stream;
        final done2 = notifier.generateResponse('再点一下');
        controller2.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'r2c1',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        expect(executed, hasLength(1)); // 第二次没执行（还在等点头）
        await notifier.approveToolCall('r2c1');
        await waitForSettled(notifier);
        expect(executed, hasLength(2));

        await controller2.close();
        await done2;
      });

      test('敏感目标（支付类前台包）出现 ⇒ 缓存作废，后续每步重新弹', () async {
        final executed = <Map<String, dynamic>>[];
        final controller = StreamController<StreamEvent>();
        final client = ToolMockClient(const [])..streamOverride = controller.stream;
        final notifier = ChatNotifier(
          MockTts(),
          client,
          clientTools: mobileTools(
            executed,
            readForegroundPackage: 'com.eg.android.AlipayGphone',
          ),
        );
        final done = notifier.generateResponse('帮我付款');
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'p1',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        await notifier.approveToolCall('p1');
        await waitForSettled(notifier);

        // 读屏（已授权 ⇒ 自动执行）读到支付宝前台 ⇒ 缓存作废。
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_read_screen',
          toolCallId: 'p2',
        ));
        await waitForSettled(notifier);

        // 下一步 tap：不再自动放行，重新弹卡片。
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          toolCallId: 'p3',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        expect(executed, hasLength(1)); // p3 没执行（还在等点头）

        await controller.close();
        await done;
      });

      test('其他能力不受缓存影响：同一轮的每条日历调用仍逐条弹', () async {
        final executed = <Map<String, dynamic>>[];
        final controller = StreamController<StreamEvent>();
        final client = ToolMockClient(const [])..streamOverride = controller.stream;
        final notifier = ChatNotifier(
          MockTts(),
          client,
          clientTools: ClientToolRegistry([
            ClientTool(
              name: 'calendar_read_events',
              description: 'Read calendar.',
              capability: Capability.calendarRead,
              execute: (args) async {
                executed.add(args);
                return <String, dynamic>{'events': <String>[]};
              },
            ),
          ]),
        );
        final done = notifier.generateResponse('看看日历');
        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          toolCallId: 'd1',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
        await notifier.approveToolCall('d1');
        await waitForSettled(notifier);

        controller.add(StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          toolCallId: 'd2',
        ));
        await waitForStatus(notifier, ToolCallStatus.awaitingApproval); // 仍弹 ⇒ 不缓存
        expect(executed, hasLength(1));

        await controller.close();
        await done;
      });

      test('敏感包名清单纯函数', () {
        expect(isSensitiveForegroundPackage('com.eg.android.AlipayGphone'), isTrue);
        expect(isSensitiveForegroundPackage('com.tencent.mm'), isTrue);
        expect(isSensitiveForegroundPackage('com.unionpay'), isTrue);
        expect(isSensitiveForegroundPackage('com.example.notes'), isFalse);
        expect(isSensitiveForegroundPackage(null), isFalse);
      });
    });

  group('StreamEvent 解析', () {
    test('tool_call 的字段都认下来', () {
      final event = StreamEvent.fromJson({
        'type': 'tool_call',
        'agent': 'peer',
        'name': 'set_theme',
        'args': '{"color":"#4F46E5"}',
        'tool_call_id': 'call-7',
      });

      expect(event.type, 'tool_call');
      expect(event.name, 'set_theme');
      expect(event.args!['color'], '#4F46E5');
      expect(event.toolCallId, 'call-7');
    });

    test('tool_result 的字段都认下来', () {
      final event = StreamEvent.fromJson({
        'type': 'tool_result',
        'name': 'set_theme',
        'result': {'applied': 'accent'},
        'latency_ms': 42,
      });

      expect(event.name, 'set_theme');
      expect((event.result as Map)['applied'], 'accent');
      expect(event.latencyMs, 42);
    });

    test('端脑今天不携带 tool_call_id ⇒ 客户端自己合成', () async {
      final client = ToolMockClient([
        StreamEvent(type: 'tool_call', name: 'set_theme'),
      ]);
      final notifier = ChatNotifier(MockTts(), client);

      await notifier.generateResponse('换色');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.id, isNotEmpty);
      // 回传时带上这个 id —— 端脑以后按 id 匹配就用它。
      expect(client.reports.single['tool_call_id'], call.id);
    });

    test('端脑给了 tool_call_id 就用端脑的', () async {
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          toolCallId: 'brain-call-1',
        ),
      ]);
      final notifier = ChatNotifier(MockTts(), client);

      await notifier.generateResponse('换色');
      await waitForSettled(notifier);

      expect(lastToolCall(notifier)!.id, 'brain-call-1');
      expect(client.reports.single['tool_call_id'], 'brain-call-1');
    });
  });

  group('A2UI 内联那条路（show_a2ui_surface）', () {
    /// 一个「画出界面」的客户端工具 —— 返回的就是**契约里那个形状**。
    ClientToolRegistry a2uiTool(List<Map<String, dynamic>> executed) {
      return ClientToolRegistry([
        ClientTool(
          name: 'show_a2ui_surface',
          description: 'Show the user a generated interface in the conversation',
          execute: (args) async {
            executed.add(args);
            return <String, dynamic>{
              'report': '已展开「任务看板」。',
              'a2ui_events': [
                <String, Object?>{
                  'result': <String, Object?>{
                    'kind': 'task-status-update',
                    'status': <String, Object?>{
                      'message': <String, Object?>{
                        'parts': <Object?>[
                          <String, Object?>{
                            'kind': 'data',
                            'data': <String, Object?>{
                              'beginRendering': <String, Object?>{
                                'surfaceId': 'shadow.tasks',
                                'root': 'root',
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            };
          },
        ),
      ]);
    }

    test('执行完 ⇒ 卡片上带着 surface id（界面那一半）', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'show_a2ui_surface',
          args: parseToolArgs('{"view":"tasks"}'),
        ),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: a2uiTool(executed),
      );

      await notifier.generateResponse('给我看看任务');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier)!;
      expect(call.status, ToolCallStatus.succeeded);
      expect(executed.single['view'], 'tasks');
      // ⚠️ **界面那一半** —— 消息里要靠它画出那块界面。
      expect(call.a2uiSurfaceIds, <String>['shadow.tasks']);
    });

    test('回传端脑的**只有 report**（组件树不进模型上下文）', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'show_a2ui_surface',
          args: parseToolArgs('{"view":"tasks"}'),
        ),
      ]);
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: a2uiTool(executed),
      );

      await notifier.generateResponse('给我看看任务');
      await waitForSettled(notifier);

      expect(client.reports, hasLength(1));
      final reported = client.reports.single['result'] as Map;
      // ⚠️ **只带 report** —— 模型上下文里不该有一棵组件树。
      expect(reported, <String, Object?>{'report': '已展开「任务看板」。'});
      expect(reported.containsKey('a2ui_events'), isFalse);
    });
  });
}
