import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shadow_mobile/agui/agui_client.dart';
import 'package:shadow_mobile/agui/agui_driver.dart';
import 'package:shadow_mobile/agui/agui_events.dart';
import 'package:shadow_mobile/agui/agui_tool_outcome_gate.dart';
import 'package:shadow_mobile/agui/agui_types.dart';

/// 一次工具调用的一轮（端脑点了名 ⇒ 设备执行 ⇒ 结果随下一次请求带回去）。
const String _toolRound =
    'data:{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme"}\n\n'
    'data:{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"color\\":\\"indigo\\"}"}\n\n'
    'data:{"type":"TOOL_CALL_END","toolCallId":"tc1"}\n\n'
    'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n';

/// 假 HTTP（**按队列**给不同的响应 ⇒ ⇒ 续轮能拿到不同的一轮）。
class _QueueHttpClient extends http.BaseClient {
  _QueueHttpClient(this.bodies);

  final List<String> bodies;
  final List<http.Request> requests = <http.Request>[];
  int _index = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final http.Request req = request as http.Request;
    requests.add(req);
    final int at = _index < bodies.length ? _index : bodies.length - 1;
    final String body = bodies[at];
    _index++;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(body)),
      200,
    );
  }
}

/// 一份测试用的装置（假 HTTP ＋ driver）。
class _Harness {
  _Harness(this.fake, this.driver);

  // ⚠️ 字段**不能**叫 `http` ⇒ ⇒ 那会遮蔽 `package:http` 的前缀 ⇒ ⇒ 类型标注
  // `http.Request` 就写不出来了（analyze 直接红）。
  final _QueueHttpClient fake;
  final AguiDriver driver;

  /// 发出去的**请求体**（逐个）。
  List<Map<String, dynamic>> sentBodies() {
    return fake.requests
        .map((http.Request r) => jsonDecode(r.body) as Map<String, dynamic>)
        .toList();
  }
}

_Harness _harness(List<String> bodies, {AguiToolExecutor? executeTool}) {
  final _QueueHttpClient fake = _QueueHttpClient(bodies);
  final AguiClient client = AguiClient(
    baseUrl: 'http://127.0.0.1:60080',
    readHeaders: () async => <String, String>{},
    httpClient: fake,
  );
  return _Harness(fake, AguiDriver(client: client, executeTool: executeTool));
}

const AguiRunRequest _userTurn = AguiRunRequest(
  messages: <AguiMessage>[AguiMessage(role: 'user', content: 'hi')],
);

/// AG-UI 的 driver（移动端）—— 判据钉的是**机制**，不是「跑过就算」。
///
/// ⚠️ **与桌面端 `src/lib/agui/__tests__/aguiDriver.test.ts` 逐字对等**
/// （8 条对 8 条）＋ **两条这一端特有的**：
/// · 「**工具清单随请求出去**」（桌面端那条在页面级判据里，移动端页面还没
///   接线 ⇒ ⇒ **这一格得在这儿钉住**，否则「只发 messages」会**静默**退化）；
/// · 「续轮不丢工具清单」。
void main() {
  group('AguiDriver', () {
    test('没有工具 ⇒ ⇒ 一轮就完(只发一次请求)', () async {
      final _Harness h = _harness(<String>[
        'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}\n\n'
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
      ]);
      final List<AguiDriverEvent> events =
          await h.driver.streamTurn('c', _userTurn).toList();
      expect(h.fake.requests, hasLength(1));
      expect(
        events.map((AguiDriverEvent e) => e.kind).toList(),
        <String>['text', 'finished'],
      );
      expect(events.first.delta, '你好');
    });

    test('端脑点了名 ⇒ ⇒ 设备跑完 ⇒ ⇒ 结果随**下一次请求**带回去(续轮)', () async {
      final List<String> executed = <String>[];
      final _Harness h = _harness(
        <String>[
          _toolRound,
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m2","delta":"换好了"}\n\n'
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
        ],
        executeTool: (AguiToolCall call) async {
          executed.add(call.toolCallName);
          return const AguiToolOutcome(ok: true, content: 'indigo');
        },
      );
      final List<AguiDriverEvent> events =
          await h.driver.streamTurn('c', _userTurn).toList();
      expect(executed, <String>['set_theme']);
      expect(h.fake.requests, hasLength(2));
      expect(
        events.map((AguiDriverEvent e) => e.kind).toList(),
        <String>['tool_call', 'text', 'finished'],
      );
      final List<dynamic> messages =
          h.sentBodies()[1]['messages'] as List<dynamic>;
      expect(messages.last, <String, dynamic>{
        'role': 'tool',
        'toolCallId': 'tc1',
        'content': 'indigo',
      });
    });

    test('工具失败 ⇒ ⇒ 回传的那条**必须带 error**(不许长得像成功)', () async {
      final _Harness h = _harness(
        <String>[
          _toolRound,
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
        ],
        executeTool: (AguiToolCall call) async {
          return const AguiToolOutcome(
            ok: false,
            content: '',
            error: '主题服务拒绝',
          );
        },
      );
      final List<AguiDriverEvent> events =
          await h.driver.streamTurn('c', _userTurn).toList();
      final Iterable<AguiDriverEvent> failures =
          events.where((AguiDriverEvent e) => e.kind == 'tool_failed');
      expect(failures, isNotEmpty);
      expect(failures.first.error, '主题服务拒绝');
      final List<dynamic> messages =
          h.sentBodies()[1]['messages'] as List<dynamic>;
      expect(messages.last, <String, dynamic>{
        'role': 'tool',
        'toolCallId': 'tc1',
        'content': '',
        'error': '主题服务拒绝',
      });
    });

    test('这台设备干不了 ⇒ ⇒ **合成一条失败结果**回传(模型不干等)', () async {
      final _Harness h = _harness(<String>[
        _toolRound,
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
      ]);
      final List<AguiDriverEvent> events =
          await h.driver.streamTurn('c', _userTurn).toList();
      expect(
        events.map((AguiDriverEvent e) => e.kind),
        contains('tool_failed'),
      );
      expect(h.fake.requests, hasLength(2));
      final Map<String, dynamic> last =
          (h.sentBodies()[1]['messages'] as List<dynamic>).last
              as Map<String, dynamic>;
      expect(last['role'], 'tool');
      expect(last['toolCallId'], 'tc1');
      expect(last['error'], isA<String>());
      expect((last['error'] as String).isNotEmpty, isTrue);
    });

    test('RUN_ERROR ⇒ ⇒ 抛且**带上端脑的原话**', () async {
      final _Harness h = _harness(<String>[
        'data:{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r9"}}\n\n',
      ]);
      await expectLater(
        h.driver.streamTurn('c', _userTurn).toList(),
        throwsA(predicate((Object e) =>
            e is AguiProtocolException && e.message.contains('设备拒绝了'))),
      );
    });

    test('流没跑完就断(没有 RUN_FINISHED) ⇒ ⇒ 抛(不许当成跑完了)', () async {
      final _Harness h = _harness(<String>[
        'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"半句"}\n\n',
      ]);
      await expectLater(
        h.driver.streamTurn('c', _userTurn).toList(),
        throwsA(predicate((Object e) =>
            e is AguiProtocolException &&
            e.message.contains('without RUN_FINISHED'))),
      );
    });

    test('续轮里又点了名 ⇒ ⇒ 再续一轮(三次请求)', () async {
      final _Harness h = _harness(
        <String>[
          _toolRound,
          'data:{"type":"TOOL_CALL_START","toolCallId":"tc2","toolCallName":"set_theme"}\n\n'
          'data:{"type":"TOOL_CALL_END","toolCallId":"tc2"}\n\n'
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r3"}\n\n',
        ],
        executeTool: (AguiToolCall call) async {
          return const AguiToolOutcome(ok: true, content: 'ok');
        },
      );
      await h.driver.streamTurn('c', _userTurn).toList();
      expect(h.fake.requests, hasLength(3));
    });

    test('lobe 那边的工具结果(CUSTOM) ⇒ ⇒ 吐成 tool_result(不许丢)', () async {
      final _Harness h = _harness(<String>[
        'data:{"type":"CUSTOM","name":"telencephalon_tool_result","value":{"agent":"a1","name":"get_weather","result":"晴","toolCallId":"tc7"}}\n\n'
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
      ]);
      final List<AguiDriverEvent> events =
          await h.driver.streamTurn('c', _userTurn).toList();
      expect(
        events.map((AguiDriverEvent e) => e.kind).toList(),
        <String>['tool_result', 'finished'],
      );
      final AguiDriverEvent result =
          events.firstWhere((AguiDriverEvent e) => e.kind == 'tool_result');
      expect(result.name, 'get_weather');
      expect(result.result, '晴');
      expect(result.toolCallId, 'tc7');
    });

    test('**工具清单随请求出去** —— 模型不知道这台设备会什么 ⇒ ⇒ 设备工具静默失灵',
        () async {
      final _Harness h = _harness(<String>[
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
      ]);
      await h.driver
          .streamTurn(
        'c',
        const AguiRunRequest(
          threadId: 'thread-1',
          runId: 'run-1',
          messages: <AguiMessage>[AguiMessage(role: 'user', content: 'hi')],
          tools: <AguiTool>[AguiTool(name: 'set_theme', description: '换主题色')],
        ),
      )
          .toList();
      final Map<String, dynamic> body = h.sentBodies().first;
      expect(body['threadId'], 'thread-1');
      expect(body['runId'], 'run-1');
      expect(body['tools'], isNotNull);
      final List<dynamic> tools = body['tools'] as List<dynamic>;
      expect(tools, hasLength(1));
      final Map<String, dynamic> tool = tools.first as Map<String, dynamic>;
      expect(tool['name'], 'set_theme');
      expect(tool.containsKey('function'), isFalse);
    });

    test('续轮 ⇒ ⇒ 工具清单**仍然**在请求里(少一次就静默失灵)', () async {
      final _Harness h = _harness(
        <String>[
          _toolRound,
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
        ],
        executeTool: (AguiToolCall call) async {
          return const AguiToolOutcome(ok: true, content: 'ok');
        },
      );
      await h.driver
          .streamTurn(
        'c',
        const AguiRunRequest(
          tools: <AguiTool>[AguiTool(name: 'set_theme')],
          messages: <AguiMessage>[AguiMessage(role: 'user', content: '换个主题')],
        ),
      )
          .toList();
      expect(h.fake.requests, hasLength(2));
      for (final Map<String, dynamic> body in h.sentBodies()) {
        expect(body['tools'], isNotNull);
        expect((body['tools'] as List<dynamic>), hasLength(1));
      }
    });
  });
}
