import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'services/app_config_service.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

// label 是死字段：设置页用的是 l10n.ttsEngineAndroid /
// l10n.ttsEngineExternal，没人读这个 label。
enum TtsEngineType {
  androidBuiltIn('android'),
  rust('rust'),
  external('external');

  final String value;
  const TtsEngineType(this.value);
}

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');

  /// 嵌入式大脑 neuron 面端口的**读取钩子** —— 由 EncephalonMobileNotifier
  /// 在构造时挂上（闭包每次调用现读，启动/重启端口变了自动跟）。
  ///
  /// ⚠️ **病史（2026-11-01 真机修复）**：Rust TTS 的地址曾写死
  /// `localhost:60080` —— 那是**桌面 sidecar** 的端口；手机的嵌入式大脑绑
  /// **随机端口**，60080 上永远没人监听 ⇒ 设置页选 Rust 引擎点「试听」
  /// 永远 connection refused。实测（MIX4，2026-11-01）：`/v1/audio/speech`
  /// 挂在 **neuron 面**（`EncephalonMobileService.port`，GET 405 = 路由在，
  /// 要 POST），不是端脑面（agentPort）。
  static int? Function()? runtimeNeuronPort;

  /// Rust TTS（neuron 面 `/v1/audio/speech`）的地址 —— 从**真实的**
  /// neuron 端口拼出来。钩子没挂 / 大脑没跑 ⇒ 端口 0（必然失败，
  /// 而不是悄悄打到别人家）。
  static String get _rustTtsUrl =>
      'http://127.0.0.1:${runtimeNeuronPort?.call() ?? 0}/v1/audio/speech';

  /// 这一张面要带的**全部**钥匙（读门 ∪ admin token）。
  ///
  /// ⚠️ **2026-11-03**：门罩住了**整张面**（含 neuron's `/v1/*`）⇒ ⇒ Rust TTS
  /// 那一发（POST `/v1/audio/speech`）落**写门** ⇒ ⇒ 必须带 admin token。
  ///
  /// ⚠️ **拿不到就不带那个头** —— 绝不塞空串（空串会把门骗开）。
  static Map<String, String> _doorHeaders() {
    final cfg = AppConfigService();
    final h = <String, String>{};
    final shadow = cfg.telencephalonShadowKey?.trim();
    if (shadow != null && shadow.isNotEmpty) h['X-Shadow-Key'] = shadow;
    final admin = cfg.telencephalonAdminToken?.trim();
    if (admin != null && admin.isNotEmpty) h['X-Admin-Token'] = admin;
    return h;
  }

  TtsEngineType _engineType = TtsEngineType.androidBuiltIn;
  String _externalUrl = '';
  bool _isInitialized = false;

  TtsEngineType get engineType => _engineType;
  String get externalUrl => _externalUrl;
  bool get isInitialized => _isInitialized;

  Future<void> setEngineType(TtsEngineType type) async {
    _engineType = type;
  }

  Future<void> setExternalUrl(String url) async {
    _externalUrl = url;
  }

  Future<bool> initialize() async {
    const maxRetries = 5;
    const retryDelay = Duration(milliseconds: 500);

    for (int i = 0; i < maxRetries; i++) {
      try {
        final result = await _channel.invokeMethod<bool>('isInitialized');
        _isInitialized = result ?? false;
        if (_isInitialized) return true;
        if (i < maxRetries - 1) {
          await Future.delayed(retryDelay);
        }
      } catch (e) {
        debugPrint('TtsEngine.initialize error: $e');
        _isInitialized = false;
        return false;
      }
    }
    return _isInitialized;
  }

  Future<bool> isAvailable() async {
    if (_engineType == TtsEngineType.external && _externalUrl.isEmpty) {
      return false;
    }
    return initialize();
  }

  Future<void> speak(String text, {String lang = 'zh-CN'}) async {
    if (text.isEmpty) return;

    switch (_engineType) {
      case TtsEngineType.rust:
        await _speakRust(text, lang);
        break;
      case TtsEngineType.external:
        if (_externalUrl.isNotEmpty) {
          await _speakExternal(text, lang);
        }
        break;
      case TtsEngineType.androidBuiltIn:
        final initialized = await initialize();
        if (!initialized) {
          debugPrint('TtsEngine.speak: TTS not initialized');
          return;
        }
        try {
          await _channel.invokeMethod<bool>('speak', {
            'text': text,
            'lang': lang,
          });
        } catch (e) {
          debugPrint('TtsEngine.speak error: $e');
        }
        break;
    }
  }

  Future<void> _speakRust(String text, String lang) async {
    try {
      final response = await http.post(
        Uri.parse(_rustTtsUrl),
        // ⚠️ **门罩住整张面**（2026-11-03）⇒ ⇒ neuron's `/v1/audio/speech`
        // 现在也在门型表管辖内 ⇒ ⇒ POST ⇒ 落**写门**（只认 admin token）
        // ⇒ ⇒ 不递钥匙就是 401 ⇒ ⇒ 递全部的钥匙（读门 ∪ admin）。
        headers: {
          'Content-Type': 'application/json',
          ..._doorHeaders(),
        },
        body: json.encode({'text': text, 'voice_path': null, 'speed': null}),
      );

      if (response.statusCode != 200) {
        debugPrint('TtsEngine._speakRust: HTTP ${response.statusCode}');
        return;
      }

      final data = json.decode(response.body) as Map<String, dynamic>;
      final audioBase64 = data['audio'] as String?;
      if (audioBase64 == null || audioBase64.isEmpty) {
        debugPrint('TtsEngine._speakRust: No audio in response');
        return;
      }

      final audioBytes = base64Decode(audioBase64);
      await _playAudio(audioBytes);
    } catch (e) {
      debugPrint('TtsEngine._speakRust error: $e');
    }
  }

  Future<void> _playAudio(Uint8List audioBytes) async {
    debugPrint('TtsEngine._playAudio: Playing ${audioBytes.length} bytes');
  }

  Future<void> _speakExternal(String text, String lang) async {
    try {
      final client = HttpClient();
      final request = await client.postUrl(Uri.parse(_externalUrl));
      request.headers.set('Content-Type', 'application/json');
      request.write('{"text":"$text","lang":"$lang"}');
      await request.close();
      client.close();
    } catch (e) {
      debugPrint('TtsEngine._speakExternal error: $e');
    }
  }

  Future<void> stop() async {
    try {
      await _channel.invokeMethod<bool>('stop');
    } catch (e) {
      debugPrint('TtsEngine.stop error: $e');
    }
  }

  Future<bool> isSpeaking() async {
    try {
      final result = await _channel.invokeMethod<bool>('isSpeaking');
      return result ?? false;
    } catch (e) {
      debugPrint('TtsEngine.isSpeaking error: $e');
      return false;
    }
  }
}
