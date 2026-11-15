import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/asr_engine.dart';
import 'package:shadow_mobile/services/app_config_service.dart';

/// **语音输入**（端脑 `voice/transcribe` ＝ 能力页那张「语音识别」档说了算）
/// 的判据。
///
/// ⚠️ 这一族钉的是 2026-11-15 真机那条链：
///   ❶ 端脑面**没有** `/api/sessions/{id}/audio` 那条 WS 路由 ⇒ ⇒ 客户端
///      原来那条「实时流」腿在真机上**必然连不上** ⇒ ⇒ 「点语音对话」直接
///      `Failed to connect to audio service` ⇒ ⇒ **对话态根本进不去**；
///   ❷ 端脑**有** `POST /api/telencephalon/voice/transcribe`（请求-应答）
///      ⇒ ⇒ 语音输入改走这一面 ⇒ ⇒ 与 TTS 那条腿**完全同形**；
///   ❸ **请求体不带 model** ⇒ ⇒ 端脑按能力页那张表解析（客户端不猜模型）；
///   ❹ 这一面是**写门** ⇒ ⇒ 必须带 admin token（优先用嵌入式大脑那把）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late File tempFile;
  late List<http.Request> seen;

  MockClient scripted({int status = 200, String body = '', Object? throwOn}) {
    return MockClient((req) async {
      seen.add(req);
      if (throwOn != null) throw throwOn;
      return http.Response(
        body,
        status,
        headers: {'content-type': 'application/json'},
      );
    });
  }

  Uint8List pcm(int n) => Uint8List.fromList(List<int>.filled(n, 7));

  setUp(() async {
    seen = [];
    tempDir = await Directory.systemTemp.createTemp('asr_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;
    await AppConfigService().setTtsEngineType(null);
    await AppConfigService().setTelencephalonAdminToken('admin-from-config');
    AsrEngine.runtimeAgentPort = () => 40079;
    AsrEngine.runtimeAdminToken = () => 'brain-own-token';
    AsrEngine.clearFailure();
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    AsrEngine.runtimeAgentPort = null;
    AsrEngine.runtimeAdminToken = null;
    AsrEngine.clearFailure();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('❶ 端口 0（端脑没起来）⇒ 压根不发请求，且说清原因', () async {
    AsrEngine.runtimeAgentPort = () => 0;
    final engine = AsrEngine(httpClient: scripted());

    final result = await engine.transcribe(pcm(160));

    expect(seen, isEmpty);
    expect(result.ok, isFalse);
    expect(result.reason, contains('端脑没起来'));
    expect(AsrEngine.lastFailure, isNotNull);
  });

  test('❷ 200 回文本 ⇒ ok，且恰好转写一次', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '你好'})),
    );

    final result = await engine.transcribe(pcm(320));

    expect(result.ok, isTrue);
    expect(result.text, '你好');
    expect(seen, hasLength(1));
  });

  test('❸ 请求体**不带 model**（客户端不猜模型 ⇒ 能力页那张表说了算）', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '嗨'})),
    );

    await engine.transcribe(pcm(160));

    final payload = jsonDecode(seen.single.body) as Map<String, dynamic>;
    expect(payload.containsKey('model'), isFalse);
    expect(payload['audio'], isA<String>());
  });

  test('❹ 带叶区 ⇒ body 有 lobe（叶区级那一档覆盖才生效）', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '嗨'})),
    );

    await engine.transcribe(pcm(160), lobe: 'temporal');

    final payload = jsonDecode(seen.single.body) as Map<String, dynamic>;
    expect(payload['lobe'], 'temporal');
  });

  test('❺ 钩子那把 admin token（嵌入式大脑自己的）**优先于**配置里那把', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '嗨'})),
    );

    await engine.transcribe(pcm(160));

    expect(seen.single.headers['X-Admin-Token'], 'brain-own-token');
  });

  test('❻ 401 ⇒ 失败且**留痕**（不许静默）', () async {
    final engine = AsrEngine(
      httpClient: scripted(status: 401, body: '{"error":"door_closed"}'),
    );

    final result = await engine.transcribe(pcm(160));

    expect(result.ok, isFalse);
    expect(result.reason, contains('401'));
    expect(AsrEngine.lastFailure, isNotNull);
    expect(AsrEngine.lastFailure, contains('401'));
  });

  test('❼ 200 但**空文本** ⇒ 不许当成「听清了」', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '   '})),
    );

    final result = await engine.transcribe(pcm(160));

    expect(result.ok, isFalse);
    expect(result.reason, isNotNull);
  });

  test('❽ 连不上 ⇒ 失败且留痕', () async {
    final engine = AsrEngine(
      httpClient: scripted(throwOn: Exception('boom')),
    );

    final result = await engine.transcribe(pcm(160));

    expect(result.ok, isFalse);
    expect(AsrEngine.lastFailure, isNotNull);
  });

  test('❾ 空 PCM ⇒ 失败（没录到声音）', () async {
    final engine = AsrEngine(
      httpClient: scripted(body: jsonEncode({'text': '嗨'})),
    );

    final result = await engine.transcribe(Uint8List(0));

    expect(result.ok, isFalse);
    expect(seen, isEmpty);
  });

  test('❿ PCM → WAV：头逐字对（RIFF/WAVE/fmt /data）＋ 长度对', () {
    final data = Uint8List.fromList(
      List<int>.generate(320, (i) => i % 256),
    );

    final wav = AsrEngine.pcmToWav(data);

    expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
    expect(String.fromCharCodes(wav.sublist(12, 16)), 'fmt ');
    expect(String.fromCharCodes(wav.sublist(36, 40)), 'data');
    expect(wav.length, 44 + 320);

    final bd = ByteData.sublistView(wav);
    expect(bd.getUint32(4, Endian.little), 36 + 320); // riff chunk size
    expect(bd.getUint16(20, Endian.little), 1); // PCM
    expect(bd.getUint16(22, Endian.little), 1); // 单声道
    expect(bd.getUint32(24, Endian.little), 16000); // 采样率
    expect(bd.getUint32(28, Endian.little), 32000); // byte rate
    expect(bd.getUint16(32, Endian.little), 2); // block align
    expect(bd.getUint16(34, Endian.little), 16); // 位深
    expect(bd.getUint32(40, Endian.little), 320); // data 长度
  });

  test('⓫ reportFailure ⇒ 失败进**全局失败流**（界面听得见，不许静默）', () async {
    AsrEngine.clearFailure();

    // ⚠️ 订阅**先**挂上（广播流：没人听的时候 add ⇒ ⇒ 事件直接被丢掉）。
    final emitted =
        expectLater(AsrEngine.failures, emits(contains('没录到声音')));

    // ⚠️ 这一条是「**录音那一段**没交出音频」时走的出口 ⇒ ⇒ 必须和转写
    // 失败**同一个出口** ⇒ ⇒ 界面只有一块横幅、也只听一个流。
    AsrEngine.reportFailure('没录到声音（录音机没交出音频）');

    await emitted;
    expect(AsrEngine.lastFailure, contains('没录到声音'));
  });
}
