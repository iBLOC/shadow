import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/sensitive_packages.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

import 'agui_fakes.dart';
import '../support/a2ui_fixture.dart';

void main() {
  /// 对话流里最后那张工具卡片。
  ToolCallModel? lastToolCall(ChatNotifier notifier) {
    final calls = notifier.state.messages
        .where((m) => m.toolCall != null)
        .map((m) => m.toolCall!)
        .toList();
    return calls.isEmpty ? null : calls.last;
  }

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

  /// 等某张**指定的**卡片进入指定状态。
  ///
  /// ⚠️ 为什么不能只等「最后一张卡片」：那一格在「等点头」时会**立刻**命中
  /// ⇒ ⇒ 断言会落在**上一张**卡上 ⇒ ⇒ 读数是假的。
  Future<void> waitForCall(
    ChatNotifier notifier,
    String id,
    ToolCallStatus status,
  ) async {
    for (var i = 0; i < 200; i++) {
      final call = lastToolCall(notifier);
      if (call != null && call.id == id && call.status == status) return;
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    fail('1 秒内没等到 $id 进入 $status');
  }

  /// 「工具结果随**下一次请求**带回去」—— 那条 tool 消息。
  ///
  /// ⚠️ AG-UI 的闭环**不是** `/tool-results` 旁路 ⇒ ⇒ 结果在**下一次请求的**
  /// `messages[]` 末尾 ⇒ ⇒ 判据只能在这儿找它。
  Map<String, dynamic>? toolMessageOf(Map<String, dynamic> request) {
    final messages = request['messages'] as List<dynamic>;
    for (final dynamic m in messages.reversed) {
      final Map<String, dynamic> msg = (m as Map).cast<String, dynamic>();
      if (msg['role'] == 'tool') return msg;
    }
    return null;
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

  group('端脑 tool_call → 客户端执行 → 结果随**下一次请求**带回去', () {
    test('执行成功：卡片是 succeeded，结果随下一次请求带回去', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(
              toolCallId: 'tc1',
              toolCallName: 'set_theme',
              argsJson: '{"color":"#4F46E5"}',
            ),
            aguiFinished(),
          ],
          <String>[aguiText('主题换好了'), aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: themeTool(executed),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('把主题换成靛蓝');

      final call = lastToolCall(notifier);
      expect(call, isNotNull);
      expect(call!.name, 'set_theme');
      expect(call.status, ToolCallStatus.succeeded);
      expect(call.args['color'], '#4F46E5');

      // 本地真的执行了，参数是对的。
      expect(executed.single['color'], '#4F46E5');

      // ⚠️ **结果随下一次请求带回去**（端脑那头据此续轮）。
      expect(brain.roundCount, 2);
      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage, isNotNull);
      expect(toolMessage!['role'], 'tool');
      expect(toolMessage['toolCallId'], 'tc1');
      // 成功 ⇒ **不许**带 error。
      expect(toolMessage['error'], isNull);
    });

    test('发消息时工具清单**整份带上去** —— 端脑才知道这台设备会什么', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[aguiText('你好'), aguiFinished()],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: themeTool(<Map<String, dynamic>>[]),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('换个色');

      final Map<String, dynamic> request = brain.requests.single;
      final List<dynamic> tools = request['tools'] as List<dynamic>;
      expect(tools, hasLength(1));
      // ⚠️ AG-UI 的工具是**扁平**形状（**不套 function**）—— 端脑自己再包一次。
      expect((tools.single as Map)['name'], 'set_theme');
      expect((tools.single as Map).containsKey('function'), isFalse);
      // 用户那句话在 messages 里。
      final List<dynamic> messages = request['messages'] as List<dynamic>;
      expect((messages.single as Map)['role'], 'user');
    });

    test('未知工具：明确失败**并且**把失败带回去', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'tc1', toolCallName: 'launch_missiles'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('发射');

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, contains('unsupported tool'));
      // 闷着不吭声的话，模型会一直等一个永远不来的结果。
      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage, isNotNull);
      expect(toolMessage!['error'], contains('unsupported tool'));
      expect(toolMessage['content'], '');
    });

    test('工具抛异常：卡片是 failed，失败**带 error** 回去', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'tc1', toolCallName: 'boom'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'boom',
            description: 'always fails',
            execute: (args) async => throw StateError('炸了'),
          ),
        ]),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('炸');

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, contains('炸了'));
      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage!['error'], contains('炸了'));
    });

    test('这一轮只有工具调用、没有正文：不是错误（工具卡片就是回复）', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(
              toolCallId: 'tc1',
              toolCallName: 'set_theme',
              argsJson: '{"color":"#4F46E5"}',
            ),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: themeTool(<Map<String, dynamic>>[]),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('把主题换成靛蓝');

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

  /// 等这一轮结束（**带超时**）⇒ ⇒ 「卡住了」是**当场红**，不是挂到测试超时。
  Future<void> waitDone(Future<void> done) async {
    await done.timeout(
      const Duration(seconds: 10),
      onTimeout: () => fail('这一轮在 10 秒内没结束 ⇒ ⇒ 端脑在等一个不会来的结果'),
    );
  }

  group('需要用户点头的工具', () {
    test('先等用户点头，不执行', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'c1', toolCallName: 'delete_everything'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
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
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('全删了');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      expect(executed, isEmpty);
      // 还没点头 ⇒ **还不该有第二次请求**（端脑在等结果）。
      expect(brain.roundCount, 1);

      await notifier.approveToolCall('c1');
      await waitDone(done);

      expect(executed, hasLength(1));
      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage!['toolCallId'], 'c1');
      expect(toolMessage['error'], isNull);
    });

    test('用户拒绝 → 失败**并且**把拒绝带回去（不许让端脑干等）', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'c1', toolCallName: 'delete_everything'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: ClientToolRegistry([
          ClientTool(
            name: 'delete_everything',
            description: '不可逆',
            requiresApproval: true,
            execute: (args) async => 'deleted',
          ),
        ]),
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('全删了');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      await notifier.denyToolCall('c1');
      await waitDone(done);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, 'denied by user');
      // 模型要知道这条路走不通，而不是干等着。
      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage!['error'], 'denied by user');
    });

    test('用户在工具跑完之前离开页面 ⇒ 不崩（notifier 已被 dispose）', () async {
      // ⚠️ **AG-UI 那一路，工具在**回合内**跑** ⇒ ⇒ 这一格比 legacy 路更容易踩到：
      //   用户在等「允许」那张卡片的期间就离开了页面 ⇒ ⇒ notifier 已被 dispose
      //   ⇒ ⇒ 这一轮**后面**还要写 state ⇒ ⇒ 不许把 App 带崩。
      final gate = Completer<void>();
      var toolRan = false;
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 's1', toolCallName: 'slow'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
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
        aguiHttpClient: brain,
      );

      // ⚠️ **异步错误要收得上来** —— 「dispose 之后回写 state」这个错
      //   是在**工具自己的续体**里抛的 ⇒ ⇒ 不是同步抛出
      //   ⇒ ⇒ `expect(() {...}, returnsNormally)` **抓不到**。
      final asyncErrors = <Object>[];
      await runZonedGuarded(() async {
        final Future<void> done = notifier.generateResponse('慢慢来');
        await waitForStatus(notifier, ToolCallStatus.running);
        notifier.dispose();

        // 工具这时才跑完 —— 回写状态时 notifier 已经不在了。
        gate.complete();
        await done;
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
  });

  group('手机操作：一轮一次授权（敏感目标除外）', () {
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
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'c1', toolCallName: 'mobile_tap'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: mobileTools(executed),
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('帮我点一下');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      expect(executed, isEmpty);
      await notifier.approveToolCall('c1');
      await waitDone(done);
      expect(executed, hasLength(1));
    });

    test('点头后同一轮的第二次手机操作不再弹（一轮一次）', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'c1', toolCallName: 'mobile_tap'),
            aguiFinished(),
          ],
          <String>[
            ...aguiToolCall(toolCallId: 'c2', toolCallName: 'mobile_tap'),
            aguiFinished(runId: 'r2'),
          ],
          <String>[aguiFinished(runId: 'r3')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: mobileTools(executed),
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('连点两下');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      await notifier.approveToolCall('c1');
      // ⚠️ **这一轮能自己结束** ⇒ ⇒ 证明 c2 **没有**再弹一次
      // ⇒ ⇒ （c2 若弹了 ⇒ ⇒ 这一轮会一直等 ⇒ ⇒ waitDone 会**当场红**）。
      await waitDone(done);
      expect(executed, hasLength(2));
    });

    test('下一轮重新弹（缓存跟着「一轮」走，不跟着会话走）', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'r1c1', toolCallName: 'mobile_tap'),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
          <String>[
            ...aguiToolCall(toolCallId: 'r2c1', toolCallName: 'mobile_tap'),
            aguiFinished(runId: 'r3'),
          ],
          <String>[aguiFinished(runId: 'r4')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: mobileTools(executed),
        aguiHttpClient: brain,
      );

      final Future<void> done1 = notifier.generateResponse('点一下');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      await notifier.approveToolCall('r1c1');
      await waitDone(done1);
      expect(executed, hasLength(1));

      // 新一轮（第二次发送）：缓存已清 ⇒ ⇒ 又要重新点头。
      final Future<void> done2 = notifier.generateResponse('再点一下');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      expect(executed, hasLength(1)); // 第二次没执行（还在等点头）
      await notifier.approveToolCall('r2c1');
      await waitDone(done2);
      expect(executed, hasLength(2));
    });

    test('敏感目标（支付类前台包）出现 ⇒ 缓存作废，后续每步重新弹', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 'p1', toolCallName: 'mobile_tap'),
            aguiFinished(),
          ],
          <String>[
            ...aguiToolCall(toolCallId: 'p2', toolCallName: 'mobile_read_screen'),
            aguiFinished(runId: 'r2'),
          ],
          <String>[
            ...aguiToolCall(toolCallId: 'p3', toolCallName: 'mobile_tap'),
            aguiFinished(runId: 'r3'),
          ],
          <String>[aguiFinished(runId: 'r4')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: mobileTools(
          executed,
          readForegroundPackage: 'com.eg.android.AlipayGphone',
        ),
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('帮我付款');
      await waitForCall(notifier, 'p1', ToolCallStatus.awaitingApproval);
      await notifier.approveToolCall('p1');

      // 读屏（已授权 ⇒ 自动执行）读到支付宝前台 ⇒ 缓存作废 ⇒ p3 重新弹。
      //
      // ⚠️ **p3 重新弹**本身就是「读屏真的跑过并且读到了支付类前台包」的证据
      // ⇒ ⇒ 缓存作废那条链**承重**（没跑读屏 ⇒ 缓存不会作废 ⇒ p3 会直接跑）。
      await waitForCall(notifier, 'p3', ToolCallStatus.awaitingApproval);
      // p3 还在等点头 ⇒ ⇒ 它**没执行**（executed 只记 tap）。
      expect(executed, hasLength(1));

      await notifier.approveToolCall('p3');
      await waitDone(done);
      expect(executed, hasLength(2));
    });

    test('其他能力不受缓存影响：同一轮的每条日历调用仍逐条弹', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(
              toolCallId: 'd1',
              toolCallName: 'calendar_read_events',
            ),
            aguiFinished(),
          ],
          <String>[
            ...aguiToolCall(
              toolCallId: 'd2',
              toolCallName: 'calendar_read_events',
            ),
            aguiFinished(runId: 'r2'),
          ],
          <String>[aguiFinished(runId: 'r3')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
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
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('看看日历');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      await notifier.approveToolCall('d1');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval); // d2 仍弹
      expect(executed, hasLength(1));

      await notifier.approveToolCall('d2');
      await waitDone(done);
      expect(executed, hasLength(2));
    });

    test('敏感包名清单纯函数', () {
      expect(isSensitiveForegroundPackage('com.eg.android.AlipayGphone'), isTrue);
      expect(isSensitiveForegroundPackage('com.tencent.mm'), isTrue);
      expect(isSensitiveForegroundPackage('com.unionpay'), isTrue);
      expect(isSensitiveForegroundPackage('com.example.notes'), isFalse);
      expect(isSensitiveForegroundPackage(null), isFalse);
    });
  });

  group('历史工具记录：轮末喂「思维定式」（traces/ingest）', () {
    ClientToolRegistry trajectoryTools(List<Map<String, dynamic>> executed) {
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
          name: 'mobile_boom',
          description: 'Always fails.',
          capability: Capability.mobileUse,
          execute: (args) async => throw Exception('boom'),
        ),
      ]);
    }

    test('一轮带工具调用（一成一败）⇒ 轮末 ingest 一次，轨迹形状正确', () async {
      final executed = <Map<String, dynamic>>[];
      final client = ToolMockClient();
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(toolCallId: 't1', toolCallName: 'mobile_tap'),
            aguiFinished(),
          ],
          <String>[
            ...aguiToolCall(toolCallId: 't2', toolCallName: 'mobile_boom'),
            aguiFinished(runId: 'r2'),
          ],
          <String>[aguiFinished(runId: 'r3')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        client,
        clientTools: trajectoryTools(executed),
        aguiHttpClient: brain,
      );

      final Future<void> done = notifier.generateResponse('帮我点一下屏幕');
      await waitForStatus(notifier, ToolCallStatus.awaitingApproval);
      await notifier.approveToolCall('t1');
      await waitDone(done);

      expect(client.ingestCalls, hasLength(1));
      final call = client.ingestCalls.single;
      expect(call['source'], 'agent:shadow-mobile');
      expect(call['user_input'], '帮我点一下屏幕');
      expect(call['intent_signature'], isNotEmpty);
      final steps = call['trajectory'] as List;
      expect(steps, hasLength(2));
      expect(steps[0]['tool'], 'mobile_tap');
      expect(steps[0]['ok'], isTrue);
      expect(steps[1]['tool'], 'mobile_boom');
      expect(steps[1]['ok'], isFalse);
      expect((steps[0] as Map).containsKey('at'), isTrue);
    });

    test('无工具的轮不上报（轨迹为空 ⇒ 静默跳过）', () async {
      final client = ToolMockClient();
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[aguiText('晴'), aguiFinished()],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        client,
        aguiHttpClient: brain,
      );
      await notifier.generateResponse('今天天气怎么样');

      expect(client.ingestCalls, isEmpty);
    });

    test('意图签名：同句同键；标点空白不参与；长句截到 40', () {
      expect(intentSignatureOf('帮我 点一下！'), intentSignatureOf('帮我点一下'));
      expect(intentSignatureOf(null), '');
      expect(intentSignatureOf('a' * 100).length, 40);
      expect(intentSignatureOf('点一下，谢谢'), intentSignatureOf('点一下谢谢'));
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
              // ⚠️ **v1.0 的形状** —— 载荷在 `parts[].data` 里**是对象**，
              //    消息键是 `createSurface`（v0.8 那个 `beginRendering`
              //    「渲染门」在 v1.0 里**已经没了**）
              //    ⇒ ⇒ 「画得出」只认「有 createSurface」这件事。
              'a2ui_events': <Map<String, Object?>>[
                a2aEventOf(conformantTasksMessage()),
              ],
            };
          },
        ),
      ]);
    }

    test('执行完 ⇒ 卡片上带着 surface id（界面那一半）', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(
              toolCallId: 'a1',
              toolCallName: 'show_a2ui_surface',
              argsJson: '{"view":"tasks"}',
            ),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: a2uiTool(executed),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('给我看看任务');

      final call = lastToolCall(notifier)!;
      expect(call.status, ToolCallStatus.succeeded);
      expect(executed.single['view'], 'tasks');
      // ⚠️ **界面那一半** —— 消息里要靠它画出那块界面。
      expect(call.a2uiSurfaceIds, <String>['shadow.tasks']);
    });

    test('回传给模型的**只有 report**（组件树不进模型上下文）', () async {
      final executed = <Map<String, dynamic>>[];
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[
            ...aguiToolCall(
              toolCallId: 'a1',
              toolCallName: 'show_a2ui_surface',
              argsJson: '{"view":"tasks"}',
            ),
            aguiFinished(),
          ],
          <String>[aguiFinished(runId: 'r2')],
        ],
      );
      final notifier = ChatNotifier(
        MockTts(),
        ToolMockClient(),
        clientTools: a2uiTool(executed),
        aguiHttpClient: brain,
      );

      await notifier.generateResponse('给我看看任务');

      final Map<String, dynamic>? toolMessage = toolMessageOf(brain.requests.last);
      expect(toolMessage, isNotNull);
      final String content = toolMessage!['content'] as String;
      final Map<String, dynamic> decoded =
          jsonDecode(content) as Map<String, dynamic>;
      // ⚠️ **只带 report** —— 模型上下文里不该有一棵组件树。
      expect(decoded, <String, Object?>{'report': '已展开「任务看板」。'});
      expect(decoded.containsKey('a2ui_events'), isFalse);
    });
  });
}
