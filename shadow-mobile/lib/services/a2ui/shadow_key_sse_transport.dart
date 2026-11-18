import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// A2UI 的扩展 URI —— **v1.0**（当前规范）。
///
/// ⚠️ **扩展 URI 自带版本** ⇒ ⇒ 端脑按这个头决定吐 v1.0 还是 v0.8
/// （`telencephalon/src/a2a/a2ui_v1.rs` 的 `resolve_version`）
/// ⇒ ⇒ 这里写错一个字 ⇒ 端脑就会回**旧形状** ⇒ 界面画不出来。
const String a2uiExtensionUri = 'https://a2ui.org/a2a-extension/a2ui/v1.0';

/// 端脑面拒绝了这次请求（HTTP 层）。
class A2uiHttpError implements Exception {
  A2uiHttpError(this.status, this.body);

  final int status;
  final String body;

  @override
  String toString() => status == 401
      ? '端脑拒绝了这次请求（401）—— 缺少或错误的 shadow key'
      : '端脑返回了 $status';
}

/// 端脑面的 A2UI 通道 —— **自己写的一份**。
///
/// ## 为什么自己写
///
/// 官方 SDK（`a2ui_core` / `a2ui_flutter`）给的是**协议栈**（消息解析 ＋
/// surface 状态 ＋ 渲染器），**没有** HTTP 传输 ⇒ ⇒ 这一层归我们。
///
/// ## 钥匙在**请求时现读**
///
/// 端脑面的钥匙是**宿主与自己的客户端之间的门闩**，而它的**设置时机**
/// 与「A2UI 服务构造时机」是错开的（地址先到、钥匙后到）⇒ ⇒ 构造时取值
/// 会造出「地址是新的、钥匙还是空的」那个窗口 ⇒ 请求 401。
/// ⇒ ⇒ 这里传的是**回调**，发请求那一刻才问「现在的钥匙是几号」。
class ShadowKeySseTransport {
  ShadowKeySseTransport({
    required this.url,
    required this.shadowKeyProvider,
    this.adminTokenProvider,
    this.localeProvider,
    http.Client? client,
  }) : _client = client ?? http.Client();

  /// 端脑面的 A2UI 入口（`POST {baseUrl}/a2a`）。
  final String url;

  /// 「现在的钥匙是几号」—— 发请求的那一刻才调用。
  final String? Function()? shadowKeyProvider;

  /// 「现在的 admin token 是几号」—— 发请求的那一刻才调用。
  ///
  /// ⚠️ `POST /a2a` 的门是**读门**（影子锁 ∪ admin token）
  /// ⇒ ⇒ 只递影子锁 ⇒ 在「外部端脑只认 admin token」时 ⇒ 401。
  ///
  /// ⚠️ 返回 null / 空串 ⇒ **不带**这个头（空串与空串 `ct_eq` 相等
  /// ⇒ 等于把门骗开）。
  final String? Function()? adminTokenProvider;

  /// 「用户现在用什么语言」—— 发请求的那一刻才调用。
  ///
  /// ⚠️ **界面文案随用户的语言走**：端脑在 `Accept-Language` 里挑语言
  /// ⇒ 少了这个头 ⇒ 端脑产出的界面就是**英文** ⇒ 中英混排。
  final String? Function()? localeProvider;

  final http.Client _client;
  bool _closed = false;

  /// 发一次请求，逐条吐出**原始 A2A 事件**（端脑发出来的那条本身）。
  ///
  /// ⚠️ 吐的是**整条**（`{"result": {...}}`）—— 与端脑发出来的**逐字同形**
  /// ⇒ ⇒ 两端吃的是同一份字节（fixture `fixtures/a2ui/tasks_sse.txt`）。
  Stream<Map<String, Object?>> sendStream(Map<String, Object?> request) async* {
    if (_closed) {
      throw A2uiHttpError(0, 'transport closed');
    }
    final httpRequest = http.Request('POST', Uri.parse(url))
      ..headers['Content-Type'] = 'application/json'
      // ⚠️ **必须带这个头** —— 它是 A2UI 协议常量，也是**版本声明**。
      ..body = jsonEncode(request);

    final key = shadowKeyProvider?.call();
    if (key != null && key.isNotEmpty) {
      httpRequest.headers['X-Shadow-Key'] = key;
    }
    final admin = adminTokenProvider?.call();
    if (admin != null && admin.isNotEmpty) {
      httpRequest.headers['X-Admin-Token'] = admin;
    }
    final locale = localeProvider?.call();
    if (locale != null && locale.isNotEmpty) {
      httpRequest.headers['Accept-Language'] = locale;
    }
    httpRequest.headers['X-A2A-Extensions'] = a2uiExtensionUri;

    final response = await _client.send(httpRequest);
    if (response.statusCode != 200) {
      final body = await response.stream.bytesToString();
      throw A2uiHttpError(response.statusCode, body);
    }

    var buffer = '';
    await for (final chunk in response.stream.transform(utf8.decoder)) {
      buffer += chunk;
      var index = buffer.indexOf('\n');
      while (index >= 0) {
        final line = buffer.substring(0, index).replaceFirst('\r', '');
        buffer = buffer.substring(index + 1);
        final event = _parseLine(line);
        if (event != null) yield event;
        index = buffer.indexOf('\n');
      }
    }
    // ⚠️ **流结束时的残留也要读** —— 端脑最后一个事件后面若不发空行就断开
    // ⇒ 数据还卡在 buffer 里 ⇒ 不 flush ⇒ **静默丢掉最后一个事件**。
    final tail = _parseLine(buffer.replaceFirst('\r', ''));
    if (tail != null) yield tail;
  }

  /// 一行 SSE ⇒ 一条事件。
  ///
  /// ⚠️ 语义**当初**照抄官方客户端的 SSE 解析（`genui-0.7.0` 的 `sse_parser.dart`）：
  /// `data:` 开头的行才是载荷；`:` 开头是注释/keepalive；空行是事件边界。
  /// ⚠️ **那个包已被官方点名弃用并移除** ⇒ ⇒ 它那份文件**已经不存在**
  /// ⇒ ⇒ 所以这条语义现在是**我们自己定的契约**（官方 A2UI Flutter SDK 只给协议栈，
  /// **不给传输**）⇒ ⇒ 端脑那侧必须发同样的形状。
  Map<String, Object?>? _parseLine(String line) {
    if (line.isEmpty) return null;
    if (line.startsWith(':')) return null;
    if (!line.startsWith('data:')) return null;
    final payload = line.substring(5).trim();
    if (payload.isEmpty) return null;
    final decoded = jsonDecode(payload);
    if (decoded is! Map) return null;
    return Map<String, Object?>.from(decoded);
  }

  /// 关掉底层连接（不关 ⇒ socket 泄漏）。
  void close() {
    if (_closed) return;
    _closed = true;
    _client.close();
  }
}
