import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// **脑腿**（端脑 voice/synthesize ＝ 能力页那张默认模型说了算）的判据。
///
/// ⚠️ 这一族钉的是 2026-11-15 真机那条链：用户在**能力页**把「语音合成」
/// 档选成 `mimo-v2.5-tts` ⇒ ⇒ 期望「Agent 回复后出声」用那个模型。
///
/// ⚠️ **修之前**：移动端 `TtsEngine` 只有 android / rust / external 三条腿
/// ⇒ ⇒ **从不读能力分档默认、也不调端脑 voice 面** ⇒ ⇒ 能力页设的模型
/// 对出声**完全无效**；而设备上 Android 内置 TTS 又起不来
/// （真机 MIX 4：`status=-1`）⇒ ⇒ **回复无声**，且失败只有一行
/// debugPrint ⇒ ⇒ 「失败长得像成功」。
///
/// 各格互相咬合：
///   ❶ 默认档是 **brain**（跟随能力页）⇒ ⇒ 不是 android；
///   ❷ 脑腿 200 带音频 ⇒ **真交给原生播**（playAudio）⇒ ⇒ 不许只
///      debugPrint（那一格是「取到了 ≠ 播出来了」的病）；
///   ❸ 请求**不带 model** ⇒ ⇒ 端脑自己按分档默认解析（客户端不猜）；
///   ❹ 请求带 **admin token**（这一面是写门 ⇒ 读门不够）；
///   ❺ 401 / 连不上 ⇒ 回退 Android 内置（老规矩：模型没设置也要有声音）；
///   ❻ 401 且不许回退 ⇒ **不许回退**，但**必须留痕**（失败要说真话）；
///   ❼ 200 但**空体** ⇒ 不许当成「合成成功」（空音频＝失败长得像成功）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/tts');

  late List<MethodCall> nativeCalls;
  late Directory tempDir;
  late File tempFile;

  Iterable<MethodCall> spoken() =>
      nativeCalls.where((c) => c.method == 'speak');
  Iterable<MethodCall> played() =>
      nativeCalls.where((c) => c.method == 'playAudio');

  setUp(() async {
    nativeCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      nativeCalls.add(call);
      if (call.method == 'isInitialized') return true;
      if (call.method == 'playAudio') return true;
      return null;
    });

    tempDir = await Directory.systemTemp.createTemp('tts_brain_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;

    // AppConfigService 是单例 —— 用例间显式清回「什么都没配」。
    await AppConfigService().setTtsEngineType(null);
    await AppConfigService().setTtsExternalUrl(null);
    await AppConfigService().setTelencephalonAdminToken('admin-test-token');

    // 端脑面端口（真机上每次冷启都变 ⇒ 这里钉一个假的）。
    TtsEngine.runtimeAgentPort = () => 39203;
    TtsEngine.runtimeAdminToken = null;
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    AppConfigService.configFileOverride = null;
    TtsEngine.runtimeAgentPort = null;
    TtsEngine.runtimeAdminToken = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  /// 记请求、按脚本回包的 client。[throwOn] 非空 ⇒ 请求直接抛（连不上）。
  MockClient scripted(
    List<http.Request> seen, {
    int status = 200,
    List<int>? bytes,
    String body = '',
    Object? throwOn,
  }) {
    return MockClient((req) async {
      seen.add(req);
      if (throwOn != null) throw throwOn;
      if (bytes != null) {
        return http.Response.bytes(
          bytes,
          status,
          headers: {'content-type': 'audio/mpeg'},
        );
      }
      return http.Response(
        body,
        status,
        headers: {'content-type': 'application/json'},
      );
    });
  }

  test('❶ 默认档是 brain（跟随能力页的默认模型）', () async {
    final engine = TtsEngine(httpClient: scripted([]));
    await engine.initialize();
    expect(engine.engineType, TtsEngineType.brain);
  });

  test('❷ 脑腿 200 带音频 ⇒ 交给原生真播（playAudio），不双份出声', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, bytes: List<int>.filled(32, 9)),
    );

    final result = await engine.speak('你好');

    expect(result.spoke, isTrue);
    expect(result.reason, isNull);
    // ⚠️ **真播放**：字节要交给原生（MediaPlayer）⇒ ⇒ 只 debugPrint 的那格
    // 是「取到了 ≠ 播出来了」。
    expect(played(), hasLength(1));
    expect(
      base64Decode(played().single.arguments['bytes'] as String),
      List<int>.filled(32, 9),
    );
    // 不许同时走原生 TTS（那会双份出声）。
    expect(spoken(), isEmpty);
  });

  test('❸ 请求不带 model（端脑自己按分档默认解析）＋ ❹ 带 admin token', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, bytes: List<int>.filled(8, 1)),
    );

    await engine.speak('你好');

    expect(seen, hasLength(1));
    expect(seen.single.url.path, '/api/telencephalon/voice/synthesize');
    final payload = jsonDecode(seen.single.body) as Map<String, dynamic>;
    expect(payload['text'], '你好');
    // ⚠️ **不许客户端自己指定模型** ⇒ ⇒ 能力页那张表才是真相源。
    expect(payload.containsKey('model'), isFalse);
    // 这一面是**写门** ⇒ 只认 admin token（读门 shadow key 不够）。
    expect(seen.single.headers['X-Admin-Token'], 'admin-test-token');
  });

  test('❺ 脑腿 401 ⇒ 回退 Android 内置（有声音才是诚实的结果）', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, status: 401, body: '{"error":"door_closed"}'),
    );

    final result = await engine.speak('你好');

    expect(spoken(), hasLength(1));
    expect(spoken().single.arguments['text'], '你好');
    expect(result.spoke, isTrue);
  });

  test('❻ 脑腿 401 且不许回退 ⇒ 不回退，但**必须留痕**', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, status: 401, body: '{"error":"door_closed"}'),
    );

    final result = await engine.speak('你好', allowFallback: false);

    expect(spoken(), isEmpty); // 试听要试的就是当前引擎，不许拿内置冒充
    expect(result.spoke, isFalse);
    // ⚠️ **失败要看得见**（原来只有一行 debugPrint ⇒ 用户只看到「没声音」）。
    expect(TtsEngine.lastFailure, isNotNull);
    expect(TtsEngine.lastFailure, contains('401'));
    TtsEngine.clearFailure();
  });

  test('❺ 脑腿连不上 ⇒ 回退 Android 内置', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, throwOn: http.ClientException('refused')),
    );

    final result = await engine.speak('你好');

    expect(spoken(), hasLength(1));
    expect(result.spoke, isTrue);
  });

  test('❼ 脑腿 200 但**空体** ⇒ 不许当成合成成功', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(httpClient: scripted(seen, bytes: []));

    final result = await engine.speak('你好', allowFallback: false);

    expect(result.spoke, isFalse);
    expect(played(), isEmpty);
    expect(TtsEngine.lastFailure, isNotNull);
    TtsEngine.clearFailure();
  });

  test('❽ 带叶区 ⇒ body 里有 lobe（叶区级那一档覆盖才生效）', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, bytes: List<int>.filled(8, 1)),
    );

    await engine.speak('你好', lobe: 'temporal');

    final payload = jsonDecode(seen.single.body) as Map<String, dynamic>;
    expect(payload['lobe'], 'temporal');
  });

  test('❾ 不带叶区 ⇒ body 里**没有** lobe（走全局默认那一档）', () async {
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, bytes: List<int>.filled(8, 1)),
    );

    await engine.speak('你好');

    final payload = jsonDecode(seen.single.body) as Map<String, dynamic>;
    expect(payload.containsKey('lobe'), isFalse);
  });

  test('❿ 大脑自己那把 admin token（钩子）**优先于**配置里那把', () async {
    // ⚠️ 真机上配置里那把是**空的**（那是外部端脑的 token）⇒ ⇒ 不挂钩子
    // 就是 401（真机实测 2026-11-15 22:23：door_closed / door=admin）。
    TtsEngine.runtimeAdminToken = () => 'brain-own-token';
    final seen = <http.Request>[];
    final engine = TtsEngine(
      httpClient: scripted(seen, bytes: List<int>.filled(8, 1)),
    );

    await engine.speak('你好');

    expect(seen.single.headers['X-Admin-Token'], 'brain-own-token');
    TtsEngine.runtimeAdminToken = null;
  });

  test('端脑没起来（端口 0）⇒ 回退 Android 内置', () async {
    TtsEngine.runtimeAgentPort = () => 0;
    final seen = <http.Request>[];
    final engine = TtsEngine(httpClient: scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, isEmpty); // 端口 0 ⇒ 压根不该发请求
    expect(spoken(), hasLength(1));
    expect(result.spoke, isTrue);
  });

  test('loadEngineSelection：快路径读回用户选的那条腿（不碰 Android 探针）', () async {
    final engine = TtsEngine(httpClient: scripted([]));

    // 没配 ⇒ 默认 brain（**不是** android）。
    expect(await engine.loadEngineSelection(), TtsEngineType.brain);

    // ⚠️ 显式选了 android ⇒ **要落盘、也要读得回来**（落盘规则：只写非
    // brain）⇒ ⇒ 否则「显式选择」又一次「配了等于没配」。
    await engine.setEngineType(TtsEngineType.androidBuiltIn);
    expect(await engine.loadEngineSelection(), TtsEngineType.androidBuiltIn);

    await engine.setEngineType(TtsEngineType.external);
    expect(await engine.loadEngineSelection(), TtsEngineType.external);
  });
}
