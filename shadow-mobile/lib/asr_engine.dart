import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import 'services/app_config_service.dart';

/// **转写结果** —— 失败要带出去（不许只留一行 debugPrint）。
class AsrResult {
  /// 转写出来的文本（失败时 null）。
  final String? text;

  /// 没转写出来的**原因**（原话，不重包）⇒ ⇒ 界面能说清「为什么没听见」。
  final String? reason;

  const AsrResult.ok(this.text) : reason = null;
  const AsrResult.failed(this.reason) : text = null;

  bool get ok => text != null;
}

/// **语音输入** —— 录一段 → 端脑转写 → 文本。
///
/// ## 为什么是「一次性」而不是「实时流」
///
/// ⚠️ 客户端原来那条实时腿（AudioWsService ⇒ WS
/// `/api/sessions/{id}/audio`，发 `audio_start`/`audio_chunk`，收
/// `vad_state`/`transcription`）—— **端脑侧压根没有这条路由**（端脑的
/// 语音面只有**请求-应答**的 `voice/transcribe` 与 `voice/synthesize`）
/// ⇒ ⇒ 真机上 WS 必然连不上 ⇒ ⇒ 以前「点语音对话」直接报
/// `Failed to connect to audio service` ⇒ ⇒ **对话态根本进不去**。
///
/// ⇒ ⇒ 现在走**端脑既有**的那一面（`POST /api/telencephalon/voice/transcribe`）
/// —— 与 TTS 那条腿**完全同形**。
///
/// ## 用哪个模型
///
/// ⚠️ **请求体不带 model** ⇒ ⇒ 端脑自己按「显式 → 叶区覆盖 → 全局默认」
/// 解析 ⇒ ⇒ **能力页那张「语音识别」档说了算** ⇒ ⇒ 客户端不猜模型。
class AsrEngine {
  /// **端脑面**的端口（钩子现读）—— 大脑每次冷启端口都变。
  static int? Function()? runtimeAgentPort;

  /// **端脑面**的 admin token（钩子现读）—— 这一面是**写门**。
  static String? Function()? runtimeAdminToken;

  static final StreamController<String> _failures =
      StreamController<String>.broadcast();

  /// 失败流（全局横幅听这个）⇒ ⇒ 失败在**任何页面**都看得见。
  static Stream<String> get failures => _failures.stream;

  static String? _lastFailure;
  static String? get lastFailure => _lastFailure;
  static void clearFailure() => _lastFailure = null;

  /// **报一个语音输入的失败**（公开出口）⇒ ⇒ 界面听得见。
  ///
  /// ⚠️ 录音那一段（原生录音器没交出音频）也走这条 ⇒ ⇒ 不许静默返回。
  static void reportFailure(String reason) => _reportFailure(reason);

  static void _reportFailure(String reason) {
    // ⚠️ **日志也要留一句** ⇒ ⇒ 真机读数能逐字搜到「为什么没听见」。
    //
    // ⚠️ 标记串 `AsrEngine.` 是**独有**的 ⇒ ⇒ 将来在 kernel_blob 里也能搜到
    // （证明「装上去的 ＝ 这棵树的构建」）。
    debugPrint('AsrEngine.fail: $reason');
    _lastFailure = reason;
    if (!_failures.isClosed) _failures.add(reason);
  }

  final http.Client _http;
  AsrEngine({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  /// **端脑面**的基址（端口现读 ⇒ 大脑重启自动跟）。
  String get _brainBaseUrl =>
      'http://127.0.0.1:${runtimeAgentPort?.call() ?? 0}';

  /// 这一张面要带的**全部**钥匙。
  ///
  /// ⚠️ **优先用嵌入式大脑自己那把 admin token**（钩子现读）⇒ ⇒ 没挂钩子
  /// 才回落配置里那把（外部端脑的）。两把都不是就**不带这个头** —— 绝不塞
  /// 空串（空串会把门骗开）。
  static Map<String, String> _doorHeaders() {
    final cfg = AppConfigService();
    final h = <String, String>{};
    final shadow = cfg.telencephalonShadowKey?.trim();
    if (shadow != null && shadow.isNotEmpty) h['X-Shadow-Key'] = shadow;
    final admin =
        (runtimeAdminToken?.call() ?? cfg.telencephalonAdminToken)?.trim();
    if (admin != null && admin.isNotEmpty) h['X-Admin-Token'] = admin;
    return h;
  }

  /// **PCM（16k / 单声道 / 16bit）→ WAV**（补 44 字节 RIFF 头）。
  ///
  /// ⚠️ **为什么要补**：端脑的 ASR 腿把音频当**文件**转上去（MiMo 那条云腿
  /// 要的是 `data:audio/wav;base64,` ⇒ ⇒ 裸 PCM 上游不认 ⇒ ⇒ 必须自己
  /// 装上 WAV 头。
  static Uint8List pcmToWav(
    Uint8List pcm, {
    int sampleRate = 16000,
    int channels = 1,
    int bitsPerSample = 16,
  }) {
    final byteRate = sampleRate * channels * bitsPerSample ~/ 8;
    final blockAlign = channels * bitsPerSample ~/ 8;
    final dataLen = pcm.length;
    final out = BytesBuilder();
    void u32(int v) {
      final bd = ByteData(4)..setUint32(0, v, Endian.little);
      out.add(bd.buffer.asUint8List());
    }

    void u16(int v) {
      final bd = ByteData(2)..setUint16(0, v, Endian.little);
      out.add(bd.buffer.asUint8List());
    }

    out.add('RIFF'.codeUnits);
    u32(36 + dataLen);
    out.add('WAVE'.codeUnits);
    out.add('fmt '.codeUnits);
    u32(16); // fmt chunk size
    u16(1); // PCM
    u16(channels);
    u32(sampleRate);
    u32(byteRate);
    u16(blockAlign);
    u16(bitsPerSample);
    out.add('data'.codeUnits);
    u32(dataLen);
    out.add(pcm);
    return out.toBytes();
  }

  /// **转写** —— 一段 PCM ⇒ 一段文字。
  ///
  /// [lobe] 带了 ⇒ 端脑先查**那个叶区**的分档覆盖，再回落全局默认。
  Future<AsrResult> transcribe(Uint8List pcm, {String? lobe}) async {
    if (pcm.isEmpty) {
      const reason = '没录到声音';
      _reportFailure(reason);
      return const AsrResult.failed(reason);
    }

    final port = runtimeAgentPort?.call() ?? 0;
    if (port <= 0) {
      const reason = '端脑没起来（端口未知）';
      _reportFailure(reason);
      return const AsrResult.failed(reason);
    }

    final wav = pcmToWav(pcm);
    final body = <String, dynamic>{
      // ⚠️ **不带 model** ⇒ ⇒ 端脑按能力页那张「语音识别」档解析。
      'audio': base64Encode(wav),
    };
    if (lobe != null && lobe.isNotEmpty) body['lobe'] = lobe;

    // ⚠️ **请求已发的证据**（真机读数用这一行）。
    debugPrint('AsrEngine.transcribe: 请求已发 port=$port '
        'lobe=${lobe ?? '-'} bytes=${pcm.length}');

    final http.Response response;
    try {
      response = await _postBytes('/api/telencephalon/voice/transcribe', body);
    } catch (e) {
      final reason = '端脑不可达：$e';
      _reportFailure(reason);
      return AsrResult.failed(reason);
    }

    if (response.statusCode != 200) {
      final reason =
          '端脑转写失败（HTTP ${response.statusCode}）：${_excerpt(response.body)}';
      _reportFailure(reason);
      return AsrResult.failed(reason);
    }

    try {
      final data = json.decode(response.body) as Map<String, dynamic>;
      final text = (data['text'] as String?)?.trim();
      if (text == null || text.isEmpty) {
        const reason = '端脑回了空转写（没听出内容）';
        _reportFailure(reason);
        return const AsrResult.failed(reason);
      }
      debugPrint('AsrEngine.transcribe: 成功 text=$text');
      return AsrResult.ok(text);
    } catch (e) {
      final reason = '端脑的转写回应解不开：$e';
      _reportFailure(reason);
      return AsrResult.failed(reason);
    }
  }

  /// **POST 一个路径，返回原始响应**。
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

  /// 日志用的响应体摘录（真因要看得见，但不许把整段音频糊进日志）。
  static String _excerpt(String s) =>
      s.length <= 160 ? s : '${s.substring(0, 160)}…';

  /// 关掉 HTTP 客户端（provider dispose 时用）。
  void dispose() => _http.close();
}

/// **语音输入引擎**（provider）—— 页面用它。
final asrEngineProvider = Provider<AsrEngine>((ref) {
  final engine = AsrEngine();
  ref.onDispose(engine.dispose);
  return engine;
});
