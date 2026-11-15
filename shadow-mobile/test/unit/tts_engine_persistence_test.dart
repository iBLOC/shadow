import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// **TTS 引擎的选择必须落盘** —— 「配了等于没配」那一族。
///
/// ⚠️ 2026-11-09 实测的病根：TtsEngine.setEngineType / setExternalUrl
/// **只改内存字段** ⇒ ⇒ 设置页每个 widget 都 new 一个实例 ⇒ ⇒ 选完就丢；
/// 而且**说话那条路**（chat provider）用的是**另一个实例** ⇒ ⇒
/// 用户选了「Rust」、实际说话还是 Android 内置 ⇒ ⇒ **界面看着配好了，
/// 实际从来没生效**（失败长得像成功）。
void main() {
  late Directory tempDir;
  late File tempFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('tts_persist_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('TtsEngine —— 引擎选择必须落盘', () {
    test('选 Rust ⇒ 落盘 ⇒ **另一个实例**读回来还是 Rust', () async {
      final engine = TtsEngine();
      await engine.setEngineType(TtsEngineType.rust);

      // ⚠️ 落盘这件事本身要看得见（不是只在内存里）。
      final raw = jsonDecode(await tempFile.readAsString()) as Map<String, dynamic>;
      expect(raw['ttsEngineType'], 'rust');

      // ⚠️ 关键断言：**新实例**（＝重启后／另一条说话路径）必须读回同一个选择。
      final fresh = TtsEngine();
      await fresh.initialize();
      expect(fresh.engineType, TtsEngineType.rust);
    });

    test('外部服务地址 ⇒ 落盘 ⇒ 新实例读得回', () async {
      final engine = TtsEngine();
      await engine.setExternalUrl('http://tts.example.com/speak');

      final raw = jsonDecode(await tempFile.readAsString()) as Map<String, dynamic>;
      expect(raw['ttsExternalUrl'], 'http://tts.example.com/speak');

      final fresh = TtsEngine();
      await fresh.initialize();
      expect(fresh.externalUrl, 'http://tts.example.com/speak');
    });

    test('孪生：没配过 ⇒ 默认**大脑**（跟随能力页的默认模型），且配置文件里**不留默认壳**', () async {
      final fresh = TtsEngine();
      await fresh.initialize();
      // ⚠️ **默认档是 brain** —— 能力页那张表（defaults.tts）才是
      // 「用哪个模型」的真相源 ⇒ ⇒ 客户端不该自己猜。
      expect(fresh.engineType, TtsEngineType.brain);
      expect(fresh.externalUrl, '');

      // 默认值不该被写进配置文件（只写非默认）。
      final cfg = AppConfigService();
      await cfg.setTtsEngineType('brain');
      final raw = jsonDecode(await tempFile.readAsString()) as Map<String, dynamic>;
      expect(raw.containsKey('ttsEngineType'), isFalse);
    });

    test('显式选「Android 内置」⇒ **要写进配置**（它是选择，不是默认壳）', () async {
      final engine = TtsEngine();
      await engine.setEngineType(TtsEngineType.androidBuiltIn);

      final raw = jsonDecode(await tempFile.readAsString()) as Map<String, dynamic>;
      expect(raw['ttsEngineType'], 'android');

      // 新实例读得回这个**显式**选择（重启后不许退回默认）。
      final fresh = TtsEngine();
      await fresh.initialize();
      expect(fresh.engineType, TtsEngineType.androidBuiltIn);
    });
  });
}
