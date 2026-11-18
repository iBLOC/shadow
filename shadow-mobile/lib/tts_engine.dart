import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'services/app_config_service.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// **出声引擎** —— 四条腿。
///
/// ⚠️ **默认档是「大脑」**（2026-11-15）—— 理由是**能力页那张表才是
/// 「用哪个模型」的真相源**：用户在能力页选了 `mimo-v2.5-tts`，那这条
/// 腿就让**端脑**去合成（端脑自己按分档默认解析模型：显式 → 叶区覆盖 →
/// 全局默认，见 `telencephalon/src/api/voice.rs` 的 `effective_voice_model`）。
/// ⇒ ⇒ 之前默认是 `androidBuiltIn` ⇒ ⇒ **能力页设的默认模型对「Agent 回复
/// 出声」完全无效**（界面显示得很像生效了，实际一点关系都没有 ⇒ ⇒
/// 「失败长得像成功」）。
enum TtsEngineType {
  /// **端脑 voice 面** —— 跟随能力页的「语音合成」默认模型。
  brain('brain'),
  androidBuiltIn('android'),
  rust('rust'),
  external('external');

  final String value;
  const TtsEngineType(this.value);
}

/// **出声结果** —— **失败要带出去**（不许只留一行 debugPrint）。
class TtsSpeakResult {
  /// 真的出声了吗。
  final bool spoke;

  /// **因为设备静音而跳过**（一次合成都没发 ⇒ 省了 TTS 算力）。
  ///
  /// ⚠️ **跳过 ≠ 失败** —— 失败是「该出声没出声」（用户要处理）⇒ ⇒
  /// 跳过是「用户自己把声音关了」（尊重他的意图）⇒ ⇒ 但**也不许静默**
  /// ⇒ ⇒ 手动触发的那几条路要报出去，自动朗读那条路静默（见
  /// `speak(reportSkip: …)`）。
  final bool skipped;

  /// 没出声的**原因**（原话，不重包）⇒ ⇒ 界面能说清「为什么没声」。
  final String? reason;

  const TtsSpeakResult.spoke()
      : spoke = true,
        skipped = false,
        reason = null;
  const TtsSpeakResult.failed(this.reason)
      : spoke = false,
        skipped = false;
  const TtsSpeakResult.skippedMuted(this.reason)
      : spoke = false,
        skipped = true;
}

/// **一档探针读数** —— **三态**（不是布尔）。
///
/// ⚠️ **「查不到」必须与「有声音」分开** —— 查不到时上层按「不安静」
/// 处理（宁可多合成一次，也绝不静默吞掉声音）⇒ ⇒ 把两者混成一个布尔
/// ⇒ ⇒ 查不到那台机器上的声音会被**静默吞掉**（用户毫无察觉）。
enum DeviceSoundProbe {
  /// **确定该安静**（音量 0 ／ 静音档 ／ 振动档 ／ 勿扰开着）。
  muted,

  /// **确定不安静**（音量有 ／ 正常档 ／ 勿扰关着）。
  unmuted,

  /// **查不到** —— 不是「不安静」，是「不知道」。
  unknown,
}

/// **设备声音状态** —— **三档，每档各自三态**。
///
/// ⚠️ **为什么分三档**（2026-11-16 用户追加：「静音模式也不需要 tts」）：
/// ⇒ ⇒ 响铃档（静音／振动）与勿扰都要算 ⇒ ⇒ 但它们**物理上并不让媒体
/// 流闭嘴**（静音模式管的是通知/铃声，媒体流照常有声）⇒ ⇒ 这两档是
/// **产品裁定**（尊重用户意图、少烧算力）⇒ ⇒ **不是**「没人听得见」
/// ⇒ ⇒ 措辞必须如实。
class DeviceAudioState {
  /// **媒体音量**那一档（音量 0 **或**媒体流被静音）。
  final DeviceSoundProbe volume;

  /// **响铃档**那一档（静音档 ／ 振动档 ⇒ muted；正常档 ⇒ unmuted）。
  final DeviceSoundProbe ringer;

  /// **勿扰**那一档（开着 ⇒ muted；关着 ⇒ unmuted）。
  final DeviceSoundProbe dnd;

  const DeviceAudioState({
    required this.volume,
    required this.ringer,
    required this.dnd,
  });

  /// **查不到** —— 不是「有声音」，是「不知道」。
  const DeviceAudioState.unknown()
      : volume = DeviceSoundProbe.unknown,
        ringer = DeviceSoundProbe.unknown,
        dnd = DeviceSoundProbe.unknown;

  /// **该不该跳过朗读** —— **纯函数，规则只有这一份**。
  ///
  /// ⚠️ **任何一档 `unknown` 都不会导致跳过** ⇒ ⇒ 「查不到」按「不安静」
  /// 处理 ⇒ ⇒ 方向是**不对称**的：误判「该安静」＝吞掉声音（不可接受）；
  /// 误判「不安静」＝白烧一次算力（可接受）。
  String? get skipReason {
    if (volume == DeviceSoundProbe.muted) return '媒体音量为 0';
    if (ringer == DeviceSoundProbe.muted) return '设备处于静音或振动档';
    if (dnd == DeviceSoundProbe.muted) return '勿扰模式开着';
    return null;
  }
}

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');

  /// **端脑面**（`/api/telencephalon/voice/synthesize`）的端口 —— 与
  /// **neuron 面**（`/v1/audio/speech`）**不是同一个**。
  ///
  /// ⚠️ 端脑绑**随机端口**（每次冷启都变）⇒ ⇒ 钩子每次调用**现读**。
  static int? Function()? runtimeAgentPort;

  /// **neuron 面**的端口 —— Rust TTS（本地 neuron 的 `/v1/audio/speech`）。
  ///
  /// ⚠️ **病史（2026-11-01 真机修复）**：Rust TTS 的地址曾写死
  /// `localhost:60080` —— 那是**桌面 sidecar** 的端口；手机的嵌入式大脑绑
  /// **随机端口**，60080 上永远没人监听 ⇒ 设置页选 Rust 引擎点「试听」
  /// 永远 connection refused。实测（MIX4，2026-11-01）：`/v1/audio/speech`
  /// 挂在 **neuron 面**（`EncephalonMobileService.port`，GET 405 = 路由在，
  /// 要 POST），不是端脑面（agentPort）。
  static int? Function()? runtimeNeuronPort;

  /// **嵌入式大脑自己的 admin token**（写门的凭据）。
  ///
  /// ⚠️ **它与 `AppConfigService` 里那一把不是同一把** —— 配置里那把是
  /// 用户在设置页填的**外部**端脑的 token；而嵌入式大脑在 native 侧**自己
  /// 生成**了一对钥匙（门闩 shadow key ＋ 凭据 admin token）⇒ ⇒ 读配置
  /// 读到的多半是**空** ⇒ ⇒ 打写门就是 **401**（真机实测 2026-11-15：
  /// `端脑合成失败（HTTP 401）… door_closed … door: admin`）⇒ ⇒ 所以要
  /// 现读**大脑自己那把**（钩子每次调用现读 ⇒ 大脑重启换钥匙自动跟）。
  static String? Function()? runtimeAdminToken;

  /// Rust TTS（neuron 面 `/v1/audio/speech`）的地址 —— 从**真实的**
  /// neuron 端口拼出来。钩子没挂 / 大脑没跑 ⇒ 端口 0（必然失败，
  /// 而不是悄悄打到别人家）。
  static String get _rustTtsUrl =>
      'http://127.0.0.1:${runtimeNeuronPort?.call() ?? 0}/v1/audio/speech';

  /// **端脑面**的基址 —— 能力页的「语音合成」默认模型由**端脑**解析。
  ///
  /// ⚠️ 端脑绑**随机端口**（每次冷启都变）⇒ ⇒ 现读钩子。
  static String get _brainBaseUrl =>
      'http://127.0.0.1:${runtimeAgentPort?.call() ?? 0}';

  /// **POST 一个路径，返回原始响应** —— 这一族是「**回的不是 JSON**」的端点
  /// （voice/synthesize 回的是 `audio/mpeg` 字节 ⇒ ⇒ 不能走会 `jsonDecode`
  /// 的那一条）。
  ///
  /// ⚠️ **名字带 `_postBytes`** ⇒ ⇒ 端点图闸的扫描器认得它 ⇒ ⇒ 这条
  /// 调用点**在闸的监视下**（不是「闸压根没看见过它」那种漏报）。
  Future<http.Response> _postBytes(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _http.post(
      Uri.parse('$_brainBaseUrl$path'),
      headers: {
        'Content-Type': 'application/json',
        ..._doorHeaders(),
      },
      body: json.encode(body),
    );
  }

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
    // ⚠️ **优先用嵌入式大脑自己那把 admin token**（钩子现读）⇒ ⇒ 没挂钩子
    // 才回落配置里那把（外部端脑的）。两把都不是就**不带这个头** ——
    // 绝不塞空串（空串会把门骗开）。
    final admin = (runtimeAdminToken?.call() ?? cfg.telencephalonAdminToken)?.trim();
    if (admin != null && admin.isNotEmpty) h['X-Admin-Token'] = admin;
    return h;
  }

  TtsEngineType _engineType = TtsEngineType.brain;
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

  // ── 失败留痕（「失败要说真话」）────────────────────────────────────────
  //
  // ⚠️ 以前这一族失败只有一行 `debugPrint` ⇒ ⇒ 用户看到的现象是
  // **「Agent 回复了，但是没声音」** ⇒ ⇒ 而界面上没有任何地方说
  // 「为什么没声」⇒ ⇒ **失败长得像成功**。
  //
  // ⇒ 现在：失败**既进日志**（原文），**也进失败流**（界面横幅看它）。
  static final StreamController<String> _failures = StreamController.broadcast();

  /// 出声失败的**原因流**（全局横幅订阅它）。
  static Stream<String> get failures => _failures.stream;

  /// 最近一次失败的原因（横幅是后挂的 ⇒ 要能补上**已经发生**的那一次）。
  static String? _lastFailure;
  static String? get lastFailure => _lastFailure;

  /// 清掉**最近一次失败**（横幅被关掉后调用；也是单测的复位点）。
  static void clearFailure() => _lastFailure = null;

  static void _reportFailure(String reason) {
    _lastFailure = reason;
    if (!_failures.isClosed) _failures.add(reason);
  }

  // ── 「因为静音而跳过」单独一条流（**不是**失败流）────────────────
  //
  // ⚠️ **为什么分开**：跳过**不是失败** ⇒ ⇒ 混进失败流 ⇒ ⇒ 横幅会
  // 用「语音没播出来」那套红字 ⇒ ⇒ 用户以为 TTS 坏了 ⇒ ⇒ 那是另一种
  // 骗法（「失败长得像失败」）。
  static final StreamController<String> _skips = StreamController.broadcast();

  /// 「因为静音而跳过」的原因流（横幅订阅它）。
  static Stream<String> get skips => _skips.stream;

  /// 最近一次「因为静音跳过」的原因（横幅是后挂的 ⇒ 要能补上**已经
  /// 发生**的那一次）。
  static String? _lastSkip;
  static String? get lastSkip => _lastSkip;

  /// 清掉最近一次跳过（横幅被关掉后调用；也是单测的复位点）。
  static void clearSkip() => _lastSkip = null;

  static void _reportSkip(String reason) {
    _lastSkip = reason;
    if (!_skips.isClosed) _skips.add(reason);
  }

  /// **设备是不是「该安静了」** —— 三档，每档各自三态。
  ///
  /// ⚠️ **「查不到」按「不安静」处理** ⇒ ⇒ 宁可多合成一次，也绝不静默
  /// 吞掉声音（探针失败若被当成安静 ⇒ ⇒ 用户什么都听不到还不知道
  /// 为什么）。
  Future<DeviceAudioState> deviceAudioState() async {
    try {
      final raw = await _channel.invokeMethod<Object?>('deviceSilentState');
      // ⚠️ **形状不认识 ⇒ 当「查不到」**（不许拿半个读数当「该安静」）。
      if (raw is! Map) return const DeviceAudioState.unknown();
      return DeviceAudioState(
        volume: _volumeFrom(raw['volume']),
        ringer: _ringerFrom(raw['ringer']),
        dnd: _dndFrom(raw['dnd']),
      );
    } catch (e) {
      debugPrint('TtsEngine.deviceAudioState: $e');
      return const DeviceAudioState.unknown();
    }
  }

  /// **媒体音量那一档**的原生读数 ⇒ ⇒ 三态（认不出来的值 ⇒ 「查不到」）。
  static DeviceSoundProbe _volumeFrom(Object? raw) {
    switch (raw) {
      case 'muted':
        return DeviceSoundProbe.muted;
      case 'unmuted':
        return DeviceSoundProbe.unmuted;
      default:
        return DeviceSoundProbe.unknown;
    }
  }

  /// **响铃档**的原生读数 ⇒ ⇒ 三态。
  ///
  /// ⚠️ **静音与振动都算「该安静」** ⇒ ⇒ 两档都映射成 muted ⇒ ⇒ 上层
  /// 只需要一档判定，不必再细分 ⇒ ⇒ 但**档名保留在原生那一侧**（真机
  /// logcat 能逐档认出「查到的是哪一档」）。
  static DeviceSoundProbe _ringerFrom(Object? raw) {
    switch (raw) {
      case 'silent':
      case 'vibrate':
        return DeviceSoundProbe.muted;
      case 'normal':
        return DeviceSoundProbe.unmuted;
      default:
        return DeviceSoundProbe.unknown;
    }
  }

  /// **勿扰档**的原生读数 ⇒ ⇒ 三态。
  static DeviceSoundProbe _dndFrom(Object? raw) {
    switch (raw) {
      case 'on':
        return DeviceSoundProbe.muted;
      case 'off':
        return DeviceSoundProbe.unmuted;
      default:
        return DeviceSoundProbe.unknown;
    }
  }

  /// **设置引擎类型** —— **落盘**（不是只改内存）。
  ///
  /// ⚠️ 以前这里只改字段 ⇒ ⇒ 设置页每个 widget 一个实例 ⇒ ⇒ 选完就丢
  /// ⇒ ⇒ 而且**说话那条路**用的是**另一个**实例 ⇒ ⇒ 用户的选择从来没生效过。
  Future<void> setEngineType(TtsEngineType type) async {
    _engineType = type;
    await AppConfigService().setTtsEngineType(type.value);
  }

  /// **设置外部服务地址** —— **落盘**（同上）。
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
        orElse: () => TtsEngineType.brain,
      );
    } else {
      // ⚠️ **没配 ⇒ 默认「大脑」** —— 能力页的默认模型说了算。
      _engineType = TtsEngineType.brain;
    }
    _externalUrl = cfg.ttsExternalUrl ?? '';
  }

  /// **只读回持久化的引擎选择**（快）—— 不带 Android TTS 探针。
  ///
  /// ⚠️ 设置页要**先**把「用户选的是哪条腿」摆出来 ⇒ ⇒ `initialize()` 里
  /// 那 5 次 Android TTS 探针（设备上没有内置 TTS 时 ≈ 2.5 秒）**不能**
  /// 挡在第一帧前面 ⇒ ⇒ 否则页面先显示「Android 内置／未就绪」，2.5 秒后
  /// 才翻成真值 ⇒ ⇒ **「界面在骗人」**（2026-11-15 真机实测：MIX 4 没有
  /// 内置 TTS ⇒ 设置页首帧恒是那句假话）。
  Future<TtsEngineType> loadEngineSelection() async {
    await _loadPersistedConfig();
    return _engineType;
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

  /// **当前这条腿**就绪吗 —— 设置页显示的那一格。
  ///
  /// ⚠️ **不许拿别的腿的状态冒充当前腿** —— 以前这里恒是「Android 内置
  /// TTS 的探针结果」⇒ ⇒ 默认腿改成「大脑」之后，设置页会显示「未就绪」
  /// 而**大脑那条腿明明是通的** ⇒ ⇒ 「界面在骗人」那一族。
  /// （真机实测 2026-11-15：设备上 Android TTS `status=-1` ⇒ 设置页显示
  /// 「未就绪」，而同一时刻脑面合成 200 ⇒⇒ 真在出声。）
  Future<bool> isEngineReady() async {
    switch (_engineType) {
      case TtsEngineType.brain:
        // 端脑面在不在（端口现读 ⇒ 大脑重启自动跟）。
        return (runtimeAgentPort?.call() ?? 0) > 0;
      case TtsEngineType.rust:
        return (runtimeNeuronPort?.call() ?? 0) > 0;
      case TtsEngineType.external:
        return _externalUrl.isNotEmpty;
      case TtsEngineType.androidBuiltIn:
        return initialize();
    }
  }

  /// 说话。
  ///
  /// ⚠️ **返回结果**（以前返回 `void` ⇒ ⇒ 调用方拿不到「没出声」这个事实
  /// ⇒ ⇒ 只能靠猜）⇒ ⇒ 现在**成功/失败都带出来**，失败还有**原因**。
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
  ///
  /// [force] **用户执意要听**（点了「仍要朗读」）⇒ ⇒ **绕过整个安静判定**
  /// ⇒ ⇒ 替他省算力就是替他做主 ⇒ ⇒ 他点了就该出声。
  Future<TtsSpeakResult> speak(
    String text, {
    String lang = 'zh-CN',
    bool allowFallback = true,
    String? lobe,
    bool reportSkip = true,
    bool force = false,
  }) async {
    if (text.isEmpty) return const TtsSpeakResult.spoke();

    // ⚠️ **设备「该安静」⇒ 一次合成都不发**（省 TTS 算力）——
    // · 音量 0 那一档：合成出来的音频**没人听得见** ⇒ ⇒ 那一发纯属浪费；
    // · 静音／振动／勿扰那两档：媒体流其实**还有声**，但用户说了「静音模
    //   式也不需要 tts」⇒ ⇒ 那是**产品裁定**（尊重意图、少烧算力）。
    //
    // ⚠️ **「查不到」不跳**（那一档是 unknown）⇒ ⇒ 宁可多合成一次，也
    // 绝不静默吞掉声音。
    //
    // ⚠️ **force** ⇒ ⇒ **绕过这一整个判定** ⇒ ⇒ 用户执意要听。
    if (!force) {
      final deviceAudio = await deviceAudioState();
      final skipReason = deviceAudio.skipReason;
      if (skipReason != null) {
        debugPrint(
          'TtsEngine.speak: $skipReason —— 已跳过朗读（省一次 TTS 算力）',
        );
        // ⚠️ **报不报由调用方决定** —— 自动朗读（每轮都会来一次）是
        // **后台行为** ⇒ ⇒ 跳过是尊重用户意图 ⇒ ⇒ 静默；手动朗读／
        // 试听是**用户明确要求出声** ⇒ ⇒ 必须说清「为什么没声」。
        if (reportSkip) _reportSkip(skipReason);
        return TtsSpeakResult.skippedMuted(skipReason);
      }
    }

    // ⚠️ **先读回持久化的引擎选择**（每一条腿都要）——
    //   ❶ 用户在设置页**选过**的那条腿必须真的被用（不读配置 ⇒ ⇒
    //      「选过 Rust 却被 brain 腿接管」⇒ ⇒ 「配了等于没配」）；
    //   ❷ 端脑腿**不探原生 TTS** ⇒ ⇒ 它不经过 `initialize()` ⇒ ⇒
    //      不在这里读配置，**钥匙（admin token）也拿不到** ⇒ ⇒ 401。
    await _loadPersistedConfig();

    switch (_engineType) {
      case TtsEngineType.brain:
        return _speakBrain(text, lang, lobe: lobe, allowFallback: allowFallback);
      case TtsEngineType.rust:
        return _speakRust(text, lang, allowFallback: allowFallback);
      case TtsEngineType.external:
        if (_externalUrl.isNotEmpty) {
          return _speakExternal(text, lang);
        }
        // ⚠️ **外部地址没配 ⇒ 这一格「说不出来」** ⇒ ⇒ 留痕，不静默。
        final reason = '外部 TTS 地址没配';
        debugPrint('TtsEngine.speak: $reason');
        if (allowFallback) return _speakAndroid(text, lang);
        _reportFailure(reason);
        return TtsSpeakResult.failed(reason);
      case TtsEngineType.androidBuiltIn:
        return _speakAndroid(text, lang);
    }
  }

  /// **端脑腿** —— 让**端脑**按能力页的「语音合成」默认模型合成。
  ///
  /// ⚠️ **为什么必须走端脑**：能力页那张表（`defaults.tts`）的真相源在
  /// **端脑**（`capability-defaults`）⇒ ⇒ 端脑的 `voice/synthesize` 会
  /// 按「显式 → 叶区覆盖 → 全局默认」解析模型 id（`effective_voice_model`）
  /// ⇒ ⇒ **客户端不必（也不该）自己猜该用哪个模型**。
  ///
  /// ⚠️ **门**：这一面是**写门** ⇒ ⇒ **只认 admin token**（读门 shadow key
  /// 不够）—— 真机实测：只带 `X-Shadow-Key` ⇒ **401**（`door_closed`）；
  /// 带 `X-Admin-Token` ⇒ **200 + audio/mpeg**。
  ///
  /// ⚠️ **返回的是二进制**（`audio/mpeg`）⇒ ⇒ 必须读 `bodyBytes`
  /// （读 `body` 会按 UTF-8 解码成乱码）。
  Future<TtsSpeakResult> _speakBrain(
    String text,
    String lang, {
    String? lobe,
    required bool allowFallback,
  }) async {
    final port = runtimeAgentPort?.call() ?? 0;
    if (port <= 0) {
      final reason = '端脑没起来（端口未知）';
      debugPrint('TtsEngine._speakBrain: $reason');
      if (allowFallback) return _speakAndroid(text, lang);
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }

    final http.Response response;
    try {
      // ⚠️ **不带 model** ⇒ ⇒ 端脑自己按分档默认解析（= 能力页那一档）。
      // ⚠️ **路径写成字面量** ⇒ ⇒ 端点图闸的扫描器认得这条调用点
      // （`DART_CALLS` 里登记了 `_postBytes` 这一族）⇒ ⇒ 新调用点**在闸的
      // 监视下** ⇒ ⇒ 表里那一行会被核「客户端打的是不是端脑真有的那条路由」。
      response = await _postBytes(
        '/api/telencephalon/voice/synthesize',
        {
          'text': text,
          // ⚠️ **叶区**（可选）—— 端脑的解析顺序是「显式 → **叶区覆盖** →
          // 全局默认」⇒ ⇒ 带了它，叶区级的那档 TTS 覆盖才生效
          // （不带 ⇒ ⇒ 只走全局默认那一档）。
          if (lobe != null && lobe.isNotEmpty) 'lobe': lobe,
        },
      );
    } catch (e) {
      debugPrint('TtsEngine._speakBrain: 端脑不可达 ($e)');
      if (allowFallback) return _speakAndroid(text, lang);
      final reason = '端脑不可达：$e';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }

    if (response.statusCode != 200 || response.bodyBytes.isEmpty) {
      final reason =
          '端脑合成失败（HTTP ${response.statusCode}）：${_excerpt(response.body)}';
      debugPrint('TtsEngine._speakBrain: $reason');
      if (allowFallback) return _speakAndroid(text, lang);
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }

    final played = await _playAudioBytes(response.bodyBytes);
    if (!played) {
      final reason = '端脑合成成功，但音频没播出来';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }
    return const TtsSpeakResult.spoke();
  }

  /// Android 内置 TTS（原生通道）—— **唯一实现**：正常腿与其它腿的
  /// 回退都走这一条。同一条规则写两份 ⇒ 变异只打掉一份时另一份会把
  /// 断言喂饱（假绿教训，别再犯）。
  Future<TtsSpeakResult> _speakAndroid(String text, String lang) async {
    final initialized = await initialize();
    if (!initialized) {
      // ⚠️ **这台设备上 Android 内置 TTS 可能压根起不来**（真机实测
      // MIX 4：`TtsManager: onInit: isInitialized=false, status=-1`
      // ⇒ 设备上只有 `com.xiaomi.mibrain.speech`）⇒ ⇒ 这一格「说不出来」
      // ⇒ ⇒ **必须留痕**（以前只 debugPrint ⇒ 用户只看到「没声音」）。
      final reason = 'Android 内置 TTS 没初始化（这台设备上它不可用）';
      debugPrint('TtsEngine._speakAndroid: TTS not initialized');
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }
    try {
      await _channel.invokeMethod<bool>('speak', {
        'text': text,
        'lang': lang,
      });
      return const TtsSpeakResult.spoke();
    } catch (e) {
      debugPrint('TtsEngine._speakAndroid error: $e');
      final reason = 'Android 内置 TTS 出声失败：$e';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }
  }

  Future<TtsSpeakResult> _speakRust(
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
      if (allowFallback) return _speakAndroid(text, lang);
      final reason = '本地大脑不可达：$e';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }

    if (response.statusCode != 200) {
      // 「没设置」的真机判据在体内：400 + NoRegisteredModel（neuron tts
      // registry 空）。其余非 200（401 门禁 / 上游炸）同样是「这条腿说不了」。
      debugPrint(
        'TtsEngine._speakRust: HTTP ${response.statusCode} '
        '${_excerpt(response.body)}',
      );
      if (allowFallback) return _speakAndroid(text, lang);
      final reason = '本地大脑回 ${response.statusCode}：${_excerpt(response.body)}';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }

    try {
      final data = json.decode(response.body) as Map<String, dynamic>;
      final audioBase64 = data['audio'] as String?;
      if (audioBase64 == null || audioBase64.isEmpty) {
        debugPrint('TtsEngine._speakRust: No audio in response');
        // ⚠️ `await` —— 不加的话这条 `return` 把一个 Future 从 try 里抛出去
        // ⇒ ⇒ 异常会**绕过**这个 try 的 catch ⇒ ⇒ 错误没人接。
        if (allowFallback) return await _speakAndroid(text, lang);
        final reason = '本地大脑回 200 但没有音频';
        _reportFailure(reason);
        return TtsSpeakResult.failed(reason);
      }

      final audioBytes = base64Decode(audioBase64);
      final played = await _playAudioBytes(audioBytes);
      if (!played) {
        final reason = '本地大脑合成成功，但音频没播出来';
        _reportFailure(reason);
        return TtsSpeakResult.failed(reason);
      }
      return const TtsSpeakResult.spoke();
    } catch (e) {
      debugPrint('TtsEngine._speakRust error: $e');
      if (allowFallback) return _speakAndroid(text, lang);
      final reason = '本地大脑的音频解不开：$e';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    }
  }

  /// 日志用的响应体摘录（真因要看得见，但不许把整段音频糊进日志）。
  static String _excerpt(String s) =>
      s.length <= 160 ? s : '${s.substring(0, 160)}…';

  /// **这段字节是不是「JSON 里带 base64 音频」的形状** —— 解不开就返回
  /// **null**（不是抛，也不是静默）。
  ///
  /// ⚠️ **不许写成空的 `catch (_) { }`** —— 那一格是「静默吞异常」那一族
  /// （`failure-masking` 闸的 D1 会红）⇒ ⇒ 形状识别失败**也要留痕**
  /// （真因进日志）⇒ ⇒ 回落路径照样 `failed(reason)` 报出去 ⇒ ⇒
  /// 「失败要说真话」这一格两样都占。
  static Map<String, dynamic>? _tryJsonMap(List<int> bytes) {
    try {
      final decoded = json.decode(utf8.decode(bytes));
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (e) {
      debugPrint('TtsEngine: 这段回应不是 JSON 形状 ($e)');
      return null;
    }
  }

  /// **真播放** —— 把音频字节交给**原生**（`MediaPlayer`）。
  ///
  /// ⚠️ 以前这一格**只 debugPrint**（「Playing N bytes」）⇒ ⇒ 音频取到了
  /// 却**从来没响过** ⇒ ⇒ 「取到了」被当成了「播出来了」。
  ///
  /// ⚠️ **零新增依赖**：pubspec 里没有任何音频播放包 ⇒ ⇒ 走**既有的**
  /// `com.ibloc.shadow/tts` 通道（原生那边本来就管出声）。
  Future<bool> _playAudioBytes(List<int> audioBytes) async {
    if (audioBytes.isEmpty) return false;
    try {
      final ok = await _channel.invokeMethod<bool>('playAudio', {
        'bytes': base64Encode(audioBytes),
      });
      if (ok != true) {
        debugPrint('TtsEngine._playAudioBytes: 原生播放没成功');
        return false;
      }
      debugPrint('TtsEngine._playAudioBytes: ${audioBytes.length} bytes → 原生播放');
      return true;
    } catch (e) {
      debugPrint('TtsEngine._playAudioBytes error: $e');
      return false;
    }
  }

  Future<TtsSpeakResult> _speakExternal(String text, String lang) async {
    try {
      final client = HttpClient();
      final request = await client.postUrl(Uri.parse(_externalUrl));
      request.headers.set('Content-Type', 'application/json');
      request.write(json.encode({'text': text, 'lang': lang}));
      final response = await request.close();
      final bytes = await response
          .fold<List<int>>(<int>[], (acc, chunk) => acc..addAll(chunk));
      client.close();

      if (response.statusCode != 200) {
        final reason = '外部 TTS 回 ${response.statusCode}';
        debugPrint('TtsEngine._speakExternal: $reason');
        _reportFailure(reason);
        return TtsSpeakResult.failed(reason);
      }

      // ⚠️ 外部服务的形状**没有统一约定** ⇒ ⇒ 两种常见的都认：直接是音频
      // 字节 ／ JSON 里 base64 的音频。**都不是** ⇒ ⇒ 老实说「不像音频」。
      final contentType = response.headers.value('content-type') ?? '';
      if (contentType.contains('audio/')) {
        final played = await _playAudioBytes(bytes);
        if (!played) {
          const reason = '外部 TTS 回了音频，但没播出来';
          _reportFailure(reason);
          return TtsSpeakResult.failed(reason);
        }
        return const TtsSpeakResult.spoke();
      }
      final data = _tryJsonMap(bytes);
      final audioBase64 = data?['audio'] as String?;
      if (audioBase64 != null && audioBase64.isNotEmpty) {
        final played = await _playAudioBytes(base64Decode(audioBase64));
        if (!played) {
          const reason = '外部 TTS 回了音频，但没播出来';
          _reportFailure(reason);
          return TtsSpeakResult.failed(reason);
        }
        return const TtsSpeakResult.spoke();
      }
      const reason = '外部 TTS 回的不是音频（content-type 不是 audio/*，也没有 audio 字段）';
      debugPrint('TtsEngine._speakExternal: $reason');
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
    } catch (e) {
      debugPrint('TtsEngine._speakExternal error: $e');
      final reason = '外部 TTS 服务不可达：$e';
      _reportFailure(reason);
      return TtsSpeakResult.failed(reason);
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
