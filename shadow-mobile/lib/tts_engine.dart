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

  /// HTTP client —— **测试可注入**（Rust 腿的「大脑这条腿说不了 ⇒ 回退」判据
  /// 要能真实打到 400/连接失败，而不是靠真机）。形状照
  /// `TelencephalonClient({http.Client? client})`。
  final http.Client _http;

  TtsEngine({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  TtsEngineType get engineType => _engineType;
  String get externalUrl => _externalUrl;
  bool get isInitialized => _isInitialized;

  /// 设置引擎类型 —— **落盘**（不是只改内存）。
  ///
  /// ⚠️ 以前这里只改字段 ⇒ ⇒ 设置页每个 widget 一个实例 ⇒ ⇒ 选完就丢
  /// ⇒ ⇒ 而且**说话那条路**用的是**另一个**实例 ⇒ ⇒ 用户的选择从来没生效过。
  Future<void> setEngineType(TtsEngineType type) async {
    _engineType = type;
    await AppConfigService().setTtsEngineType(type.value);
  }

  /// 设置外部服务地址 —— **落盘**（同上）。
  Future<void> setExternalUrl(String url) async {
    _externalUrl = url;
    await AppConfigService().setTtsExternalUrl(url);
  }

  /// 从配置里读回**持久化的**引擎选择与外部地址。
  ///
  /// ⚠️ 这一步是「配了等于没配」的反面：读回来的才是**用户真的选的那个**。
  Future<void> _loadPersistedConfig() async {
    final cfg = AppConfigService();
    await cfg.init();
    final type = cfg.ttsEngineType;
    if (type != null && type.isNotEmpty) {
      _engineType = TtsEngineType.values.firstWhere(
        (t) => t.value == type,
        orElse: () => TtsEngineType.androidBuiltIn,
      );
    }
    _externalUrl = cfg.ttsExternalUrl ?? '';
  }

  Future<bool> initialize() async {
    // ⚠️ **先读回持久化的选择** —— 否则界面显示的永远是默认值，
    // 而用户明明选过别的引擎 ⇒ ⇒ 「界面在骗人」＋「说话用默认引擎」。
    await _loadPersistedConfig();
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

  /// 说话。
  ///
  /// ⚠️ **TTS 模型没设置 ⇒ 用 Android 内置出声**（2026-11-13 产品裁定）：
  /// 引擎选了 Rust 而大脑里没有注册 TTS 引擎时，`/v1/audio/speech` 回
  /// **400 + `NoRegisteredModel: register at least one TTS model`**
  /// （neuron 的 tts registry 为空）；大脑没起来则是连接失败（端口 0）——
  /// 这些对说话的人来说是同一件事：**这条腿说不了**。以前失败只剩一行
  /// debugPrint ⇒ ⇒ **回复文本无声消失**。现在这条腿任何失败都落到
  /// Android 内置通道出声 ⇒ 有声音才是诚实的结果。
  ///
  /// [allowFallback] 关掉回退是给设置页「试听」用的：试听要试的就是
  /// **当前配置的那个引擎**，回退会把「没配置」听成「配置生效了」。
  Future<void> speak(
    String text, {
    String lang = 'zh-CN',
    bool allowFallback = true,
  }) async {
    if (text.isEmpty) return;

    switch (_engineType) {
      case TtsEngineType.rust:
        await _speakRust(text, lang, allowFallback: allowFallback);
        break;
      case TtsEngineType.external:
        if (_externalUrl.isNotEmpty) {
          await _speakExternal(text, lang);
        }
        break;
      case TtsEngineType.androidBuiltIn:
        await _speakAndroid(text, lang);
        break;
    }
  }

  /// Android 内置 TTS（原生通道）—— **唯一实现**：正常腿与 Rust 腿的
  /// 回退都走这一条。同一条规则写两份 ⇒ 变异只打掉一份时另一份会把
  /// 断言喂饱（假绿教训，别再犯）。
  Future<void> _speakAndroid(String text, String lang) async {
    final initialized = await initialize();
    if (!initialized) {
      debugPrint('TtsEngine._speakAndroid: TTS not initialized');
      return;
    }
    try {
      await _channel.invokeMethod<bool>('speak', {
        'text': text,
        'lang': lang,
      });
    } catch (e) {
      debugPrint('TtsEngine._speakAndroid error: $e');
    }
  }

  Future<void> _speakRust(
    String text,
    String lang, {
    required bool allowFallback,
  }) async {
    final http.Response response;
    try {
      response = await _http.post(
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
    } catch (e) {
      // 大脑没起来（端口 0 / 连接拒绝）：对「模型没设置」来说是同一个事实。
      debugPrint('TtsEngine._speakRust: brain unreachable ($e)');
      if (allowFallback) await _speakAndroid(text, lang);
      return;
    }

    if (response.statusCode != 200) {
      // 「没设置」的真机判据在体内：400 + NoRegisteredModel（neuron tts
      // registry 空）。其余非 200（401 门禁 / 上游炸）同样是「这条腿说不了」。
      debugPrint(
        'TtsEngine._speakRust: HTTP ${response.statusCode} '
        '${_excerpt(response.body)}',
      );
      if (allowFallback) await _speakAndroid(text, lang);
      return;
    }

    try {
      final data = json.decode(response.body) as Map<String, dynamic>;
      final audioBase64 = data['audio'] as String?;
      if (audioBase64 == null || audioBase64.isEmpty) {
        debugPrint('TtsEngine._speakRust: No audio in response');
        if (allowFallback) await _speakAndroid(text, lang);
        return;
      }

      final audioBytes = base64Decode(audioBase64);
      await _playAudio(audioBytes);
    } catch (e) {
      debugPrint('TtsEngine._speakRust error: $e');
      if (allowFallback) await _speakAndroid(text, lang);
    }
  }

  /// 日志用的响应体摘录（真因要看得见，但不许把整段音频糊进日志）。
  static String _excerpt(String s) =>
      s.length <= 160 ? s : '${s.substring(0, 160)}…';

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
