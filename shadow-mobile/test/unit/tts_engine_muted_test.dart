import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// **设备「该安静」⇒ 不烧 TTS 算力**（2026-11-16）的判据。
///
/// ⚠️ 这一族钉的是**三档，每档各自三态**（不是布尔）：
/// ❶ **确定该安静**（媒体音量 0 ／ 静音档 ／ 振动档 ／ 勿扰开着）⇒ ⇒
///    **一次合成请求都不发**（连原生那条腿都不走）⇒ ⇒ 这是这一刀的全部
///    目的（省 TTS 算力）；
/// ❷ **「查不到」** ⇒ 照常发 ⇒ ⇒ 宁可多烧一次，也绝不静默吞掉声音
///    （把「查不到」当成「该安静」⇒ ⇒ 那台机器上的声音会**静默消失**）；
/// ❸ **确定不安静** ⇒ 照常发（跳过不许变成常态）。
///
/// ⚠️ **方向是不对称的**：误判「该安静」＝吞掉声音（不可接受）；误判
/// 「不安静」＝白烧一次算力（可接受）⇒ ⇒ 「查不到」永远站在「不安静」
/// 那一边 ⇒ ⇒ **任何一档 unknown 都不许导致跳过**。
///
/// ⚠️ **「仍要朗读」**（用户点那个开关）⇒ ⇒ **force** ⇒ ⇒ 绕过整个判定
/// ⇒ ⇒ 他既然要听，就别替他省这一次。
///
/// 另钉**可见性**：手动那条路（用户明确要求出声）要**报出去**；自动朗
/// 读那条路（每轮都会来一次）**静默** ⇒ ⇒ 不许每轮弹一次横幅。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/tts');

  late List<MethodCall> nativeCalls;
  late Directory tempDir;
  late File tempFile;

  /// 原生通道报回来的**三档**读数。
  ///
  /// ⚠️ **每一档的取值空间不一样**（volume: muted/unmuted；ringer:
  /// silent/vibrate/normal；dnd: on/off）⇒ ⇒ 「查不到」在每一档都各有
  /// 自己的位置（不是某档专有的）⇒ ⇒ 形状不认识 ⇒ ⇒ 落回「查不到」。
  late Map<String, String> silentState;

  /// 原生回**不是 Map** 时的形状（用来钉「形状不认识 ⇒ 查不到」）。
  Object? rawOverride;

  Iterable<MethodCall> spoken() =>
      nativeCalls.where((c) => c.method == 'speak');

  setUp(() async {
    nativeCalls = [];
    rawOverride = null;
    silentState = {
      'volume': 'muted',
      'ringer': 'normal',
      'dnd': 'off',
    };
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      nativeCalls.add(call);
      if (call.method == 'isInitialized') return true;
      if (call.method == 'playAudio') return true;
      if (call.method == 'deviceSilentState') {
        return rawOverride ?? silentState;
      }
      return null;
    });

    tempDir = await Directory.systemTemp.createTemp('tts_muted_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;

    await AppConfigService().setTtsEngineType(null);
    await AppConfigService().setTtsExternalUrl(null);
    TtsEngine.clearSkip();
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    AppConfigService.configFileOverride = null;
    TtsEngine.clearSkip();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  /// 记请求的假上游（回一段带音频的 JSON）。
  MockClient scripted(List<http.Request> seen) {
    return MockClient((req) async {
      seen.add(req);
      return http.Response(
        '{"audio":"AAAA"}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });
  }

  Future<TtsEngine> rustEngine(http.Client client) async {
    final engine = TtsEngine(httpClient: client);
    await engine.setEngineType(TtsEngineType.rust);
    return engine;
  }

  /// 三档都「不安静」⇒ ⇒ 照常合成。
  Map<String, String> allLoud() => {
        'volume': 'unmuted',
        'ringer': 'normal',
        'dnd': 'off',
      };

  test('媒体音量 0 ⇒ **一次合成请求都不发**（省 TTS 算力）且结果说清是「跳过」',
      () async {
    silentState = {
      'volume': 'muted',
      'ringer': 'normal',
      'dnd': 'off',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    // ⚠️ **零请求**才是这一刀的目的（不是「少发一次」）。
    expect(seen, isEmpty);
    // 连原生那条腿也不许走（没人听得见 ⇒ 一律不发声）。
    expect(spoken(), isEmpty);
    expect(result.spoke, isFalse);
    expect(result.skipped, isTrue);
    expect(result.reason, contains('音量'));
  });

  test('响铃档＝静音 ⇒ 跳过（用户 2026-11-16：「静音模式也不需要 tts」）',
      () async {
    silentState = {
      'volume': 'unmuted',
      'ringer': 'silent',
      'dnd': 'off',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, isEmpty);
    expect(result.skipped, isTrue);
    expect(result.reason, contains('静音'));
  });

  test('响铃档＝振动 ⇒ 跳过（与静音同档）', () async {
    silentState = {
      'volume': 'unmuted',
      'ringer': 'vibrate',
      'dnd': 'off',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, isEmpty);
    expect(result.skipped, isTrue);
  });

  test('勿扰开着 ⇒ 跳过（第三档）', () async {
    silentState = {
      'volume': 'unmuted',
      'ringer': 'normal',
      'dnd': 'on',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, isEmpty);
    expect(result.skipped, isTrue);
    expect(result.reason, contains('勿扰'));
  });

  test('三档都「不安静」⇒ 照常发（跳过不许变成常态）', () async {
    silentState = allLoud();
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, hasLength(1));
    expect(result.skipped, isFalse);
  });

  test('**三档全「查不到」⇒ 照常发**（查不到 ≠ 该安静 —— 绝不静默吞声音）',
      () async {
    silentState = {
      'volume': 'unknown',
      'ringer': 'unknown',
      'dnd': 'unknown',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, hasLength(1));
    expect(result.skipped, isFalse);
  });

  test('**一档确定该安静 ⇒ 就跳**（其余档查不到也不许「稀释」这一档）',
      () async {
    silentState = {
      'volume': 'muted',
      'ringer': 'unknown',
      'dnd': 'unknown',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, isEmpty);
    expect(result.skipped, isTrue);
  });

  test('形状不认识（原生回的不是 Map）⇒ 落回「查不到」⇒ 照常发', () async {
    rawOverride = '这不是 Map';
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好');

    expect(seen, hasLength(1));
    expect(result.skipped, isFalse);
  });

  test('「仍要朗读」（force）⇒ **照常发**（用户执意要听 ⇒ 别替他省这一次）',
      () async {
    silentState = {
      'volume': 'muted',
      'ringer': 'silent',
      'dnd': 'on',
    };
    final seen = <http.Request>[];
    final engine = await rustEngine(scripted(seen));

    final result = await engine.speak('你好', force: true);

    expect(seen, hasLength(1));
    expect(result.skipped, isFalse);
    expect(result.spoke, isTrue);
  });

  test('静音 + reportSkip ⇒ 跳过**报出去**（横幅看得见）', () async {
    silentState = {
      'volume': 'muted',
      'ringer': 'normal',
      'dnd': 'off',
    };
    final reasons = <String>[];
    final sub = TtsEngine.skips.listen(reasons.add);
    final engine = await rustEngine(scripted(<http.Request>[]));

    await engine.speak('你好');
    await Future<void>.delayed(Duration.zero);

    expect(reasons, hasLength(1));
    expect(reasons.single, contains('音量'));
    expect(TtsEngine.lastSkip, contains('音量'));
    await sub.cancel();
  });

  test('静音 + reportSkip:false（自动朗读）⇒ **静默**（不打扰用户）', () async {
    silentState = {
      'volume': 'muted',
      'ringer': 'normal',
      'dnd': 'off',
    };
    final reasons = <String>[];
    final sub = TtsEngine.skips.listen(reasons.add);
    final engine = await rustEngine(scripted(<http.Request>[]));

    await engine.speak('你好', reportSkip: false);
    await Future<void>.delayed(Duration.zero);

    expect(reasons, isEmpty);
    expect(TtsEngine.lastSkip, isNull);
    await sub.cancel();
  });

  test('探针三态：每一档各自映射（认不出来的值 ⇒ 「查不到」）', () async {
    final engine = TtsEngine();

    silentState = {
      'volume': 'muted',
      'ringer': 'silent',
      'dnd': 'on',
    };
    var state = await engine.deviceAudioState();
    expect(state.volume, DeviceSoundProbe.muted);
    expect(state.ringer, DeviceSoundProbe.muted);
    expect(state.dnd, DeviceSoundProbe.muted);
    expect(state.skipReason, isNotNull);

    silentState = {
      'volume': 'unmuted',
      'ringer': 'normal',
      'dnd': 'off',
    };
    state = await engine.deviceAudioState();
    expect(state.volume, DeviceSoundProbe.unmuted);
    expect(state.ringer, DeviceSoundProbe.unmuted);
    expect(state.dnd, DeviceSoundProbe.unmuted);
    expect(state.skipReason, isNull);

    // ⚠️ **认不出来的值 ⇒ 「查不到」**（不是「不安静」，也不是「该安静」）。
    silentState = {
      'volume': 'gibberish',
      'ringer': 'gibberish',
      'dnd': 'gibberish',
    };
    state = await engine.deviceAudioState();
    expect(state.volume, DeviceSoundProbe.unknown);
    expect(state.ringer, DeviceSoundProbe.unknown);
    expect(state.dnd, DeviceSoundProbe.unknown);
    // ⚠️ **全查不到 ⇒ 不跳**（这是这一族最要紧的不变式）。
    expect(state.skipReason, isNull);
  });
}
