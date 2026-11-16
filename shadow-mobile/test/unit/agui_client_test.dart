import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shadow_mobile/agui/agui_client.dart';
import 'package:shadow_mobile/agui/agui_events.dart';

/// AG-UI 客户端（移动端）—— 判据钉的是**机制**，不是「跑过就算」。
///
/// ⚠️ **与桌面端那份逐字对等**（19 条对 19 条）⇒ ⇒ 两端的协议口径不会各写各的
/// ⇒ ⇒ 端脑改一处，两端都要改，且**改漏了会当场红**。
///
/// ⚠️ 客户端这一层最危险的失败**长得像成功** ——
/// · 事件被静默跳过 ⇒ ⇒ 用户看着「回复少了一段」却不知道为什么；
/// · 附件 part 形状错 ⇒ ⇒ 端脑那边**静默丢掉** ⇒ ⇒ 图片发出去像没发；
/// · 端脑的原话被改写/吞掉 ⇒ ⇒ 用户不知道自己该内联字节。
class _FakeHttpClient extends http.BaseClient {
  _FakeHttpClient(this.body, {this.statusCode = 200});

  final String body;
  final int statusCode;
  http.BaseRequest? captured;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    captured = request;
    final List<int> bytes = utf8.encode(body);
    return http.StreamedResponse(Stream<List<int>>.value(bytes), statusCode);
  }
}

/// **真端脑抓到的 AG-UI 帧**（**真形状，脱敏后**）—— 判据钉的是「端脑真发的那几帧，
/// 客户端这一层吃得下吗」。
///
/// ⚠️ 这份 fixture 是 `scripts/prove-agui-on-device.ps1` 在**真机**上抓到的
/// （手机里那台端脑 ＋ **真模型**）⇒ ⇒ 脱敏后逐字照抄 ⇒ ⇒ **不是手写的形状**。
const String _realDeviceFrames =
    r'data:{"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1","timestamp":1794851814992}'
    '\n\n'
    r'data:{"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}'
    '\n\n'
    r'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"收到"}'
    '\n\n'
    r'data:{"type":"TEXT_MESSAGE_END","messageId":"m1"}'
    '\n\n'
    r'data:{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","timestamp":1794851976510}'
    '\n\n';

void main() {
  group('parseSseDataLines', () {
    test('逐帧取 data —— 端脑只发 data(不带 event 名)', () {
      final SseParseResult r = parseSseDataLines('data:{"type":"A"}\n\ndata:{"type":"B"}\n');
      expect(r.payloads, <String>['{"type":"A"}', '{"type":"B"}']);
    });

    test('CRLF / 空行 / 注释行 / 非 data 行 —— 都不算事件', () {
      final SseParseResult r =
          parseSseDataLines(': keep-alive\r\n\r\nevent: ping\r\ndata:{"type":"A"}\r\n');
      expect(r.payloads, <String>['{"type":"A"}']);
    });

    test('半行留在 rest(不许丢) ⇒ ⇒ 下一块接上', () {
      final SseParseResult first =
          parseSseDataLines('data:{"type":"A"}\ndata:{"typ');
      expect(first.payloads, <String>['{"type":"A"}']);
      expect(first.rest, 'data:{"typ');
      final SseParseResult second = parseSseDataLines('${first.rest}e":"B"}\n');
      expect(second.payloads, <String>['{"type":"B"}']);
    });
  });

  group('AguiEvent.parse', () {
    test('坏 JSON ⇒ 抛(响亮) —— 不静默跳过事件', () {
      expect(
        () => AguiEvent.parse('{not json'),
        throwsA(isA<AguiProtocolException>().having(
            (AguiProtocolException e) => e.message, 'message', contains('not valid JSON'))),
      );
    });

    test('没有 type ⇒ 抛', () {
      expect(
        () => AguiEvent.parse('{"a":1}'),
        throwsA(isA<AguiProtocolException>().having(
            (AguiProtocolException e) => e.message, 'message', contains('carries no type'))),
      );
    });

    test('不认识的 type ⇒ 不抛(规范:消费者忽略未知类型)', () {
      final AguiEvent ev = AguiEvent.parse('{"type":"SOMETHING_NEW"}');
      expect(ev.type, 'SOMETHING_NEW');
      expect(ev.isKnown, isFalse);
    });
  });

  group('reduceAguiEvent', () {
    test('三段文本事件 ⇒ ⇒ 一条消息、字逐字拼起来', () {
      AguiTurnState s = initialAguiTurnState();
      s = reduceAguiEvent(
          s, AguiEvent.parse('{"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}'));
      s = reduceAguiEvent(
          s, AguiEvent.parse('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}'));
      s = reduceAguiEvent(
          s, AguiEvent.parse('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":",世界"}'));
      s = reduceAguiEvent(s, AguiEvent.parse('{"type":"TEXT_MESSAGE_END","messageId":"m1"}'));
      expect(s.messages, hasLength(1));
      expect(s.messages.first.text, '你好,世界');
      expect(s.messages.first.ended, isTrue);
    });

    test('三段工具事件 ⇒ ⇒ 一次调用、参数逐字拼起来', () {
      AguiTurnState s = initialAguiTurnState();
      s = reduceAguiEvent(s, AguiEvent.parse(
          '{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme","parentMessageId":"m1"}'));
      s = reduceAguiEvent(s, AguiEvent.parse(
          r'{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\"color\":\"indigo\"}"}'));
      s = reduceAguiEvent(
          s, AguiEvent.parse('{"type":"TOOL_CALL_END","toolCallId":"tc1"}'));
      expect(s.toolCalls, hasLength(1));
      expect(s.toolCalls.first.toolCallName, 'set_theme');
      expect(s.toolCalls.first.args, '{"color":"indigo"}');
      expect(s.toolCalls.first.parentMessageId, 'm1');
      expect(s.toolCalls.first.ended, isTrue);
    });

    test('RUN_FINISHED ⇒ ⇒ 完成(带 outcome) / RUN_ERROR ⇒ ⇒ 失败且**原话**留着', () {
      AguiTurnState s = initialAguiTurnState();
      s = reduceAguiEvent(s, AguiEvent.parse(
          '{"type":"RUN_STARTED","threadId":"t","runId":"r","protocolVersion":"1.0"}'));
      expect(s.runId, 'r');
      expect(s.protocolVersion, '1.0');
      s = reduceAguiEvent(s, AguiEvent.parse(
          '{"type":"RUN_FINISHED","threadId":"t","runId":"r","outcome":{"type":"cancelled"}}'));
      expect(s.status, 'finished');
      expect(s.outcome, 'cancelled');

      final AguiTurnState f = reduceAguiEvent(
          initialAguiTurnState(), AguiEvent.parse('{"type":"RUN_ERROR","message":"设备拒绝了"}'));
      expect(f.status, 'failed');
      expect(f.error, '设备拒绝了');
    });

    test('不认识的类型 ⇒ 记下来但**不炸**(规范:忽略未知类型)', () {
      final AguiTurnState s =
          reduceAguiEvent(initialAguiTurnState(), AguiEvent.parse('{"type":"BRAND_NEW"}'));
      expect(s.unknownEventTypes, <String>['BRAND_NEW']);
      expect(s.status, 'running');
    });

    test('CUSTOM(端脑的工具结果) ⇒ ⇒ 收进 customs(不许丢) —— lobe 本地工具只走这一条路',
        () {
      AguiTurnState s = initialAguiTurnState();
      s = reduceAguiEvent(s, AguiEvent.parse(
          '{"type":"CUSTOM","name":"telencephalon_tool_result","value":{"agent":"a1","name":"get_weather","result":"晴","toolCallId":"tc9"}}'));
      expect(s.customs, hasLength(1));
      expect(s.customs.first.name, 'telencephalon_tool_result');
      final List<AguiToolResultRecord> results = aguiToolResults(s);
      expect(results, hasLength(1));
      expect(results.first.name, 'get_weather');
      expect(results.first.result, '晴');
      expect(results.first.toolCallId, 'tc9');
    });

    test('RUN_ERROR 的 runId 在 metadata 里 ⇒ ⇒ 失败也要能对上这一轮', () {
      final AguiTurnState f = reduceAguiEvent(
          initialAguiTurnState(),
          AguiEvent.parse(
              '{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r-7"}}'));
      expect(f.status, 'failed');
      expect(f.error, '设备拒绝了');
      expect(f.runId, 'r-7');
    });

    test('RUN_FINISHED 的 metadata.telencephalonState ⇒ ⇒ 端脑自己的状态原样带出', () {
      final AguiTurnState s = reduceAguiEvent(
          initialAguiTurnState(),
          AguiEvent.parse(
              '{"type":"RUN_FINISHED","threadId":"t","runId":"r","outcome":{"type":"cancelled"},"metadata":{"telencephalonState":"INTERRUPTED"}}'));
      expect(s.endState, 'INTERRUPTED');
      expect(s.outcome, 'cancelled');
    });
  });

  group('buildAguiUserContent', () {
    test('文本 ＋ 图片 ⇒ ⇒ 规范形状(data source ＋ mimeType)', () {
      final List<Map<String, dynamic>> parts = buildAguiUserContent(
        '这是什么',
        <AguiInlineFile>[const AguiInlineFile(mediaType: 'image/png', base64: 'aGVsbG8=')],
      );
      expect(parts, <Map<String, dynamic>>[
        <String, dynamic>{'type': 'text', 'text': '这是什么'},
        <String, dynamic>{
          'type': 'image',
          'source': <String, dynamic>{
            'type': 'data',
            'value': 'aGVsbG8=',
            'mimeType': 'image/png',
          },
        },
      ]);
    });

    test('**没有**远程 URL 这条入口(端脑不去拉 ⇒ ⇒ 客户端必须内联)', () {
      final List<Map<String, dynamic>> parts = buildAguiUserContent(
        'x',
        <AguiInlineFile>[const AguiInlineFile(mediaType: 'application/pdf', base64: 'QUJD')],
      );
      for (final Map<String, dynamic> p in parts) {
        if (p['type'] == 'text') continue;
        final Map<String, dynamic> source = p['source'] as Map<String, dynamic>;
        expect(source['type'], 'data');
      }
    });

    test('音频 ＋ 文档 ⇒ ⇒ part 类型按 MIME 分档(端脑按 type 收)', () {
      final List<Map<String, dynamic>> parts = buildAguiUserContent(
        '',
        <AguiInlineFile>[
          const AguiInlineFile(mediaType: 'audio/mpeg', base64: 'QQ=='),
          const AguiInlineFile(mediaType: 'application/pdf', base64: 'QQ=='),
        ],
      );
      expect(
        parts.map((Map<String, dynamic> p) => p['type']).toList(),
        <String>['audio', 'document'],
      );
    });
  });

  group('AguiClient.streamTurn', () {
    test('逐事件吐出来 ⇒ ⇒ 请求体逐字是端脑认得的那份形状', () async {
      final _FakeHttpClient fake = _FakeHttpClient(
        'data:{"type":"RUN_STARTED","threadId":"t","runId":"r","protocolVersion":"1.0"}\n\n'
        'data:{"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}\n\n'
        'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"hi"}\n\n'
        'data:{"type":"TEXT_MESSAGE_END","messageId":"m1"}\n\n'
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r"}\n\n',
      );
      final AguiClient client = AguiClient(
        baseUrl: 'http://127.0.0.1:60080',
        readHeaders: () async => <String, String>{'X-Shadow-Key': 'k'},
        httpClient: fake,
      );
      final List<String> seen = <String>[];
      await for (final AguiEvent ev in client.streamTurn('conv-1', <String, dynamic>{
        'messages': <Map<String, dynamic>>[
          <String, dynamic>{
            'role': 'user',
            'content': buildAguiUserContent(
              '这是什么',
              <AguiInlineFile>[
                const AguiInlineFile(mediaType: 'image/png', base64: 'aGVsbG8='),
              ],
            ),
          },
        ],
      })) {
        seen.add(ev.type);
      }
      expect(seen, <String>[
        'RUN_STARTED',
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'RUN_FINISHED',
      ]);

      expect(fake.captured, isNotNull);
      expect(fake.captured!.url.toString(),
          'http://127.0.0.1:60080${aguiStreamPath('conv-1')}');
      final Map<String, dynamic> sent =
          jsonDecode((fake.captured! as http.Request).body) as Map<String, dynamic>;
      final List<dynamic> messages = sent['messages'] as List<dynamic>;
      final Map<String, dynamic> first = messages.first as Map<String, dynamic>;
      expect(first['content'], <Map<String, dynamic>>[
        <String, dynamic>{'type': 'text', 'text': '这是什么'},
        <String, dynamic>{
          'type': 'image',
          'source': <String, dynamic>{
            'type': 'data',
            'value': 'aGVsbG8=',
            'mimeType': 'image/png',
          },
        },
      ]);
    });

    test('非 2xx ⇒ 抛且**带上端脑的原话**(用户能看懂自己错在哪)', () async {
      final _FakeHttpClient fake = _FakeHttpClient(
        'the image part points at a remote URL — inline the bytes',
        statusCode: 400,
      );
      final AguiClient client = AguiClient(
        baseUrl: 'http://127.0.0.1:60080',
        readHeaders: () async => <String, String>{},
        httpClient: fake,
      );
      await expectLater(
        client
            .streamTurn('c', <String, dynamic>{'messages': <Map<String, dynamic>>[]})
            .toList(),
        throwsA(predicate((Object e) =>
            e is AguiProtocolException && e.message.contains('inline the bytes'))),
      );
    });

    test('最后一帧没有换行符收尾 ⇒ ⇒ 也要读到(不许丢最后一帧)', () async {
      final _FakeHttpClient fake =
          _FakeHttpClient('data:{"type":"RUN_FINISHED","threadId":"t","runId":"r"}');
      final AguiClient client = AguiClient(
        baseUrl: 'http://127.0.0.1:60080',
        readHeaders: () async => <String, String>{},
        httpClient: fake,
      );
      final List<String> seen = <String>[];
      await for (final AguiEvent ev in client.streamTurn(
          'c', <String, dynamic>{'messages': <Map<String, dynamic>>[]})) {
        seen.add(ev.type);
      }
      expect(seen, <String>['RUN_FINISHED']);
    });
  });
  group('真端脑抓到的 AG-UI 帧（真机 fixture）', () {
    test('逐字归约 ⇒ ⇒ 一条消息、文本逐字、状态 finished', () {
      final SseParseResult parsed = parseSseDataLines(_realDeviceFrames);
      expect(parsed.payloads, hasLength(5));
      AguiTurnState s = initialAguiTurnState();
      for (final String payload in parsed.payloads) {
        s = reduceAguiEvent(s, AguiEvent.parse(payload));
      }
      expect(s.status, 'finished');
      expect(s.runId, 'run-1');
      expect(s.messages, hasLength(1));
      expect(s.messages.first.text, '收到');
      expect(s.messages.first.ended, isTrue);
    });

    test('真帧**没有** protocolVersion ⇒ ⇒ 客户端**仍**认得(可选字段 ⇒ 不许炸)', () {
      // ⚠️ 真机上那台端脑**没发** protocolVersion（端脑仓 §6f 说 producer 必须
      // 声明 ⇒ ⇒ 真机那台 sidecar 比仓 HEAD 旧）⇒ ⇒ 客户端这一格**不许**因此炸掉。
      final SseParseResult parsed = parseSseDataLines(_realDeviceFrames);
      expect(parsed.payloads.first.contains('protocolVersion'), isFalse);
      final AguiTurnState s = reduceAguiEvent(
          initialAguiTurnState(), AguiEvent.parse(parsed.payloads.first));
      expect(s.status, 'running');
      expect(s.runId, 'run-1');
    });
  });

}
