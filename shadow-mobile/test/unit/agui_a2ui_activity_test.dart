import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shadow_mobile/agui/a2ui_activity.dart';
import 'package:shadow_mobile/agui/agui_client.dart';
import 'package:shadow_mobile/agui/agui_driver.dart';
import 'package:shadow_mobile/agui/agui_events.dart';
import 'package:shadow_mobile/agui/agui_types.dart';
import 'package:shadow_mobile/services/a2ui/a2ui_agent_service.dart';

/// **发布的契约**（官方 `ACTIVITY_SNAPSHOT` 的形状）。
///
/// ⚠️ 这里读的是**仓里那一份文件** ⇒ ⇒ 端脑 / 桌面端 / 移动端三份副本
/// 与它逐字一致这件事，由 `scripts/check-agui-a2ui-wire.mjs` 钉着。
final Map<String, dynamic> _contract = jsonDecode(
  File('test/support/fixtures/agui_activity_v1.json').readAsStringSync(),
) as Map<String, dynamic>;

/// 假 HTTP（一帧流）。
class _FakeHttpClient extends http.BaseClient {
  _FakeHttpClient(this.body);

  final String body;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(body)),
      200,
      headers: const <String, String>{'content-type': 'text/event-stream'},
    );
  }
}

void main() {
  group('AG-UI 承载 A2UI 的官方形状', () {
    test('契约逐字是官方那五个字段', () {
      expect(_contract.keys.toSet(), <String>{
        'type',
        'messageId',
        'activityType',
        'content',
        'replace',
      });
      expect(_contract['type'], 'ACTIVITY_SNAPSHOT');
      expect(_contract['activityType'], a2uiActivityType);
      expect(_contract['replace'], true);
    });

    test('从 activity 里取出 ops（逐字，不翻译）', () {
      final AguiEvent event = AguiEvent.parse(jsonEncode(_contract));
      final List<Map<String, Object?>>? ops = a2uiOpsFromEvent(event);
      expect(ops, isNotNull);
      expect(ops!.length, 1);
      expect(ops.first['version'], '1.0');
      expect(a2uiSurfaceIdOf(ops), 'shadow.tasks');
    });

    test('这条事件**认得**（认不得 ⇒ ⇒ 面静默消失 ⇒ 失败长得像成功）', () {
      final AguiEvent event = AguiEvent.parse(jsonEncode(_contract));
      expect(event.isKnown, isTrue);
    });

    test('不是 activity ⇒ null；别的 activity ⇒ null（不归我们管）', () {
      expect(
        a2uiOpsFromEvent(AguiEvent.parse(jsonEncode(<String, dynamic>{
          'type': 'CUSTOM',
          'name': 'x',
          'value': 1,
        }))),
        isNull,
      );
      expect(
        a2uiOpsFromEvent(AguiEvent.parse(jsonEncode(<String, dynamic>{
          'type': 'ACTIVITY_SNAPSHOT',
          'messageId': 'm',
          'activityType': 'other-thing',
          'content': <dynamic>[],
        }))),
        isNull,
      );
    });

    test('形状不对 ⇒ **响亮地拒**（不许静默吞掉）', () {
      expect(
        () => a2uiOpsFromEvent(AguiEvent.parse(jsonEncode(<String, dynamic>{
          'type': 'ACTIVITY_SNAPSHOT',
          'messageId': 'm',
          'activityType': a2uiActivityType,
          'content': <String, dynamic>{'not': 'an array'},
        }))),
        throwsA(isA<AguiProtocolException>()),
      );
      // ⚠️ v0.8 的旧信封 ⇒ 版本没对上 ⇒ 也要拒（只看键不看版本会被骗）
      expect(
        () => a2uiOpsFromEvent(AguiEvent.parse(jsonEncode(<String, dynamic>{
          'type': 'ACTIVITY_SNAPSHOT',
          'messageId': 'm',
          'activityType': a2uiActivityType,
          'content': <dynamic>[
            <String, dynamic>{'version': '0.8', 'surfaceUpdate': <String, dynamic>{'surfaceId': 's'}},
          ],
        }))),
        throwsA(isA<AguiProtocolException>()),
      );
    });
  });

  group('driver 把那块面交出去', () {
    test('AG-UI 流里的 activity ⇒ 交成 a2ui_surface', () async {
      final String body = 'data:${jsonEncode(_contract)}\n\n'
          'data:${jsonEncode(<String, dynamic>{
                'type': 'RUN_FINISHED',
                'threadId': 't',
                'runId': 'r1',
              })}\n\n';
      final AguiClient client = AguiClient(
        baseUrl: 'http://127.0.0.1:60080',
        readHeaders: () async => <String, String>{},
        httpClient: _FakeHttpClient(body),
      );
      final AguiDriver driver = AguiDriver(client: client);
      final List<String> kinds = <String>[];
      List<Map<String, Object?>>? ops;
      await for (final AguiDriverEvent ev in driver.streamTurn(
        'conv-1',
        const AguiRunRequest(
          messages: <AguiMessage>[AguiMessage(role: 'user', content: 'a2ui:tasks')],
        ),
      )) {
        kinds.add(ev.kind);
        if (ev.kind == 'a2ui_surface') ops = ev.a2uiOps;
      }
      expect(kinds, contains('a2ui_surface'));
      expect(ops, isNotNull);
      expect(ops!.length, 1);
    });

    test('别的 activity ⇒ 不画', () async {
      final String body = 'data:${jsonEncode(<String, dynamic>{
                'type': 'ACTIVITY_SNAPSHOT',
                'messageId': 'm',
                'activityType': 'other',
                'content': <dynamic>[],
              })}\n\n'
          'data:${jsonEncode(<String, dynamic>{
                'type': 'RUN_FINISHED',
                'threadId': 't',
                'runId': 'r1',
              })}\n\n';
      final AguiClient client = AguiClient(
        baseUrl: 'http://127.0.0.1:60080',
        readHeaders: () async => <String, String>{},
        httpClient: _FakeHttpClient(body),
      );
      final AguiDriver driver = AguiDriver(client: client);
      final List<String> kinds = <String>[];
      await for (final AguiDriverEvent ev in driver.streamTurn(
        'conv-1',
        const AguiRunRequest(
          messages: <AguiMessage>[AguiMessage(role: 'user', content: 'hi')],
        ),
      )) {
        kinds.add(ev.kind);
      }
      expect(kinds, isNot(contains('a2ui_surface')));
    });
  });

  group('官方 SDK 收下那份契约', () {
    test('ops 喂进 processor ⇒ ⇒ 面真的存在（零翻译）', () async {
      final A2uiAgentService service = A2uiAgentService(
        serverUrl: 'http://127.0.0.1:60080/a2a',
        shadowKeyProvider: () => null,
      );
      final AguiEvent event = AguiEvent.parse(jsonEncode(_contract));
      final List<Map<String, Object?>> ops = a2uiOpsFromEvent(event)!;
      service.ingestA2uiOps(ops);
      expect(service.surfaceIds, contains('shadow.tasks'));
      expect(service.surfaceById('shadow.tasks'), isNotNull);
      await service.dispose();
    });

    test('同一个面**不许重复建** ⇒ ⇒ 上一轮的面要先删（否则这一轮没有界面）', () async {
      final A2uiAgentService service = A2uiAgentService(
        serverUrl: 'http://127.0.0.1:60080/a2a',
        shadowKeyProvider: () => null,
      );
      final AguiEvent event = AguiEvent.parse(jsonEncode(_contract));
      final List<Map<String, Object?>> ops = a2uiOpsFromEvent(event)!;
      service.ingestA2uiOps(ops);
      expect(service.surfaceIds, contains('shadow.tasks'));
      // ⚠️ 再喂一次 ⇒ ⇒ 官方 SDK 会拒「重复 create」⇒ ⇒ 必须先删上一轮的面
      service.ingestA2uiOps(ops);
      expect(service.surfaceIds, contains('shadow.tasks'));
      expect(service.surfaceById('shadow.tasks'), isNotNull);
      await service.dispose();
    });
  });
}
