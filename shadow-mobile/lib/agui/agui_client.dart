import 'dart:convert';

import 'package:http/http.dart' as http;

import 'agui_events.dart';

/// AG-UI 的适配端点（端脑 `ag-ui:stream`）。
String aguiStreamPath(String conversationId) {
  return '/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/ag-ui:stream';
}

/// 一份要内联进请求的附件（**base64**，不是路径、不是远程 URL）。
class AguiInlineFile {
  /// MIME（`image/png` ／ `application/pdf` …）。
  final String mediaType;

  /// base64 字节。
  final String base64;

  /// 文件名（可选 —— AG-UI 的 part 里没有这一位 ⇒ ⇒ 我们放进 metadata）。
  final String? filename;

  const AguiInlineFile({
    required this.mediaType,
    required this.base64,
    this.filename,
  });
}

/// 用户这一轮的内容（文本 ＋ 内联附件）—— **AG-UI 规范形状**。
///
/// ⚠️ **为什么只给内联、不给远程 URL**：端脑**不去拉远程 URL**（不开 SSRF 那个面）
/// ⇒ ⇒ 远程 URL 会被**响亮地拒**（400）⇒ ⇒ 客户端**必须内联字节** ⇒ ⇒ 这一层
/// 只提供「内联」这一种入口 ⇒ ⇒ 调用方**没有**偷偷发远程 URL 的机会。
List<Map<String, dynamic>> buildAguiUserContent(
  String text, [
  List<AguiInlineFile> files = const <AguiInlineFile>[],
]) {
  final List<Map<String, dynamic>> parts = <Map<String, dynamic>>[];
  if (text.isNotEmpty) {
    parts.add(<String, dynamic>{'type': 'text', 'text': text});
  }
  for (final AguiInlineFile f in files) {
    final String kind;
    if (f.mediaType.startsWith('image/')) {
      kind = 'image';
    } else if (f.mediaType.startsWith('audio/')) {
      kind = 'audio';
    } else {
      kind = 'document';
    }
    parts.add(<String, dynamic>{
      'type': kind,
      'source': <String, dynamic>{
        'type': 'data',
        'value': f.base64,
        'mimeType': f.mediaType,
      },
    });
  }
  return parts;
}

/// 读门那一面要带的**全部**钥匙（**一条规则、一处实现**）。
///
/// ⚠️ **拿不到就不带那个头** —— 绝不塞空串：空串与空串相等 ⇒ ⇒ 等于把门骗开
/// （端脑 `security/api_key.rs::verify_read_credential`）。
Map<String, String> shadowReadHeaders({
  String? apiKey,
  String? adminToken,
  bool jsonBody = false,
}) {
  final Map<String, String> h = <String, String>{};
  if (jsonBody) h['Content-Type'] = 'application/json';
  if (apiKey != null && apiKey.isNotEmpty) h['X-Shadow-Key'] = apiKey;
  if (adminToken != null && adminToken.isNotEmpty) {
    h['X-Admin-Token'] = adminToken;
  }
  return h;
}

/// SSE 的解析结果（完整的 data 载荷 ＋ 留在 buffer 里的半行）。
class SseParseResult {
  final List<String> payloads;
  final String rest;

  const SseParseResult({required this.payloads, required this.rest});
}

/// SSE 的 `data:` 载荷 —— 端脑只发 `data:`（**不带 event 名**）⇒ ⇒ 读 data
/// JSON 里的 `type` 判事件。
///
/// ⚠️ **为什么按行取而不是按空行取**：端脑发的**每一帧就是一行 data**
/// ⇒ ⇒ 按行取既够用又与桌面端那份**同一口径** ⇒ ⇒ 两端的 SSE 解析不会各写各的。
///
/// @param buffer 已经收到的文本（可能以半行结尾）
SseParseResult parseSseDataLines(String buffer) {
  final List<String> lines = buffer.split('\n');
  // 最后一段可能还没收全 ⇒ ⇒ 留到下一块（**不是**丢掉）。
  final String rest = lines.isEmpty ? '' : lines.removeLast();
  final List<String> payloads = <String>[];
  for (final String raw in lines) {
    final String line =
        raw.endsWith('\r') ? raw.substring(0, raw.length - 1) : raw;
    final String trimmed = line.trim();
    if (trimmed.isEmpty || trimmed.startsWith(':')) continue;
    if (!trimmed.startsWith('data:')) continue;
    final String payload = trimmed.substring(5).trim();
    if (payload.isNotEmpty) payloads.add(payload);
  }
  return SseParseResult(payloads: payloads, rest: rest);
}

/// AG-UI 那一路的客户端 —— **薄绑定**（协议形状用官方的，依赖不引入官方的）。
///
/// ⚠️ **失败不许长得像成功**：
/// · 非 2xx ⇒ ⇒ 抛，且**带上端脑的原话**（例如「请把字节内联成 data source」）
///   ⇒ ⇒ 用户能看懂自己错在哪，而不是「ag-ui 400」；
/// · 流里的坏 JSON ⇒ ⇒ 抛（不静默跳过事件）⇒ ⇒ 「回复少了一段」不会无迹可寻。
class AguiClient {
  /// 端脑的基址（与既有 transport 同一个）。
  final String baseUrl;

  /// 读门头（影子锁 ∪ admin token）—— 与既有 transport 同一条纪律。
  final Future<Map<String, String>> Function() readHeaders;

  final http.Client _http;

  AguiClient({
    required String baseUrl,
    required this.readHeaders,
    http.Client? httpClient,
  })  : baseUrl =
            baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
        _http = httpClient ?? http.Client();

  /// 跑一轮（POST ＋ SSE）⇒ ⇒ 逐个事件吐出来。
  Stream<AguiEvent> streamTurn(
    String conversationId,
    Map<String, dynamic> request,
  ) async* {
    final Map<String, String> headers = <String, String>{
      'Content-Type': 'application/json',
      ...await readHeaders(),
    };
    final http.Request req = http.Request(
      'POST',
      Uri.parse('$baseUrl${aguiStreamPath(conversationId)}'),
    );
    req.headers.addAll(headers);
    req.body = jsonEncode(request);

    final http.StreamedResponse response = await _http.send(req);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final String body = await response.stream.bytesToString();
      throw AguiProtocolException(
        'ag-ui ${response.statusCode}: ${body.isEmpty ? (response.reasonPhrase ?? '') : body}',
      );
    }

    String buffer = '';
    await for (final String piece
        in const Utf8Decoder(allowMalformed: true).bind(response.stream)) {
      buffer += piece;
      final SseParseResult parsed = parseSseDataLines(buffer);
      buffer = parsed.rest;
      for (final String payload in parsed.payloads) {
        yield AguiEvent.parse(payload);
      }
    }
    // 流结束时的尾巴（没有换行符收尾的那一行）也要读出来 ⇒ ⇒ 不丢最后一帧。
    final SseParseResult tail = parseSseDataLines('$buffer\n');
    for (final String payload in tail.payloads) {
      yield AguiEvent.parse(payload);
    }
  }
}
