import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// 「TTS 模型不设置 ⇒ 默认用 Android 内置出声」（2026-11-13）的判据。
///
/// 钉的是**回退这一条规则**，各格互相咬合：
/// ❶ 大脑回 400 `NoRegisteredModel`（模型没设置的逐字形状）⇒ 必须落原生通道；
/// ❷ 大脑回 200 带音频 ⇒ **不许**落原生（否则任何一条语音都双份出声，
///    也证明 ❶ 的红不是「永远回退」喂出来的假绿）；
/// ❸ 连接失败（大脑没起来）⇒ 落原生；
/// ❹ 试听形状（allowFallback:false）⇒ 不回退（试听要诚实试当前引擎）；
/// ❺ Android 引擎 ⇒ 一个 HTTP 请求都不该发（回退代码不反向污染正常腿）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // 与 TtsEngine 里那个同名即可对上：mock handler 按 channel 名字注册。
  const channel = MethodChannel('com.ibloc.shadow/tts');

  late List<MethodCall> nativeCalls;
  late Directory tempDir;
  late File tempFile;

  Iterable<MethodCall> spoken() =>
      nativeCalls.where((c) => c.method == 'speak');

  setUp(() async {
    nativeCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      nativeCalls.add(call);
      if (call.method == 'isInitialized') return true;
      return null;
    });
    // ⚠️ **配置面换成临时文件** —— 否则「显式选过的引擎」写不进盘
    // （真实路径在测试环境里写不进去）⇒ ⇒ 读回来会掉回默认档 ⇒ ⇒
    // 「用户选过 ⇒ 说话那条路用的就是它」那一格就验不了。
    tempDir = await Directory.systemTemp.createTemp('tts_fallback_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;

    // AppConfigService 是单例 —— 用例间显式清回「什么都没配」。
    await AppConfigService().setTtsEngineType(null);
    await AppConfigService().setTtsExternalUrl(null);
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    AppConfigService.configFileOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  /// 记请求、按脚本回包的 client。[throwOn] 非空 ⇒ 请求直接抛（模拟连不上）。
  MockClient scripted(
    List<http.Request> seen, {
    int status = 200,
    String body = '',
    Object? throwOn,
  }) {
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

  Future<TtsEngine> rustEngine(http.Client client) async {
    final engine = TtsEngine(httpClient: client);
    await engine.setEngineType(TtsEngineType.rust);
    return engine;
  }

  test('大脑 400 NoRegisteredModel（TTS 模型没设置）⇒ Android 内置出声', () async {
    final seen = <http.Request>[];
    final engine = await rustEngine(
      scripted(
        seen,
        status: 400,
        body: '{"error":{"type":"NoRegisteredModel",'
            '"message":"NoRegisteredModel: register at least one TTS model"}}',
      ),
    );

    await engine.speak('你好', lang: 'zh-CN');

    expect(seen, hasLength(1));
    expect(seen.single.url.path, '/v1/audio/speech');
    // 回退必须把**同一段话**递进原生通道（不是只调了个方法名）。
    final calls = spoken().toList();
    expect(calls, hasLength(1));
    expect(calls.single.arguments['text'], '你好');
    expect(calls.single.arguments['lang'], 'zh-CN');
  });

  test('大脑 200 带音频 ⇒ 不回退（不双份出声）', () async {
    final seen = <http.Request>[];
    final engine = await rustEngine(
      scripted(
        seen,
        status: 200,
        body: jsonEncode({'audio': base64Encode(List.filled(8, 7))}),
      ),
    );

    await engine.speak('你好');

    expect(seen, hasLength(1));
    expect(spoken(), isEmpty);
  });

  test('大脑连不上（端口 0 / 连接拒绝）⇒ 回退 Android 内置', () async {
    final seen = <http.Request>[];
    final engine = await rustEngine(
      scripted(seen, throwOn: http.ClientException('connection refused')),
    );

    await engine.speak('你好');

    expect(spoken(), hasLength(1));
    expect(spoken().single.arguments['text'], '你好');
  });

  test('试听形状 allowFallback:false ⇒ 不回退（试听要试真引擎）', () async {
    final seen = <http.Request>[];
    final engine = await rustEngine(
      scripted(seen, status: 400, body: 'NoRegisteredModel'),
    );

    await engine.speak('试听', allowFallback: false);

    expect(seen, hasLength(1)); // 确实试了 Rust 腿
    expect(spoken(), isEmpty); // 但不许拿内置出声冒充它成功了
  });

  test('Android 内置引擎 ⇒ 一个 HTTP 请求都不发', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(httpClient: scripted(seen, status: 400));
    // ⚠️ **显式选** —— 默认档现在是 brain（跟随能力页的默认模型）。
    await engine.setEngineType(TtsEngineType.androidBuiltIn);

    await engine.speak('你好');

    expect(engine.engineType, TtsEngineType.androidBuiltIn);
    expect(seen, isEmpty);
    expect(spoken(), hasLength(1));
    expect(spoken().single.arguments['text'], '你好');
  });
}
