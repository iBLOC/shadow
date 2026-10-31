// 端脑面的钥匙 —— 在**发请求的那一刻**才读出来带上。
//
// ## 为什么不能在构造时读一次
//
// 端脑面的钥匙是**宿主与自己的客户端之间的门闩**。手机上它由宿主
// （Kotlin）生成、交给嵌入式端脑、同时交给 App 自己的客户端。
//
// 而 App 里这把钥匙的**设置时机**与「A2UI 服务构造时机」是**错开的**：
//
// 1. 嵌入式大脑起来 ⇒ 状态里 `agentPort` 有了 ⇒ A2UI 的地址确定了
//    （`providers/genui_provider.dart` 的 `a2uiServerUrlProvider`）；
// 2. 宿主才把钥匙交给端脑 client（`EncephalonMobileNotifier`
//    的 `_pointClientsAtAgentSurface`）。
//
// ⇒ 若在构造时把钥匙**焊死**进 transport，就有一个窗口：
// 「地址已经是新的、钥匙还是空的」⇒ 请求 401。
// 而 **401 比 connection refused 难查得多**（前者说明「到了但被拒」，
// 后者说明「根本没人听」）。
//
// ⇒ 所以这里**每次请求都现读**：`shadowKeyProvider` 是一个回调，
// 发请求的那一刻才问「现在的钥匙是几号」。
//
// ## 为什么钥匙是「读出来」而不是「传进来」
//
// 钥匙的**唯一真相来源**是 `TelencephalonClient.apiKey`
// （`services/telencephalon/telencephalon_client.dart:674`）——
// 端脑 client 自己也在用同一个值（`_headers()` 里发 `X-Shadow-Key`）。
// ⇒ 读它 ⇒ 两边**天然一致**，不会各持一份而漂移。
//
// ## ⚠️ 这把钥匙绝不能进日志
//
// 它**不是**用户凭证、**不出设备**、**绝不进日志**。
// 与账号密钥（`identity/account.key` = 身份本身）是两回事。

import 'dart:async';

// `A2AClient` / `SseTransport` **不在** `genui_a2ui` 的公开 API 里
// （`lib/genui_a2ui.dart` 只导出 connector 与 content generator），
// 而 `A2uiAgentConnector` 与 `A2uiContentGenerator` 都接受注入
// （`A2uiAgentConnector({required this.url, A2AClient? client})`、
// `A2uiContentGenerator({required Uri serverUrl, A2uiAgentConnector? connector})`）
// ⇒ 只能实现级导入。
//
// ignore_for_file: implementation_imports
import 'package:genui_a2ui/genui_a2ui.dart';
import 'package:genui_a2ui/src/a2a/client/a2a_client.dart';
import 'package:genui_a2ui/src/a2a/client/sse_transport.dart';

/// 造一个「会在请求时带上钥匙」的 A2UI connector。
///
/// ⚠️ `A2uiAgentConnector.dispose()` **不会**关掉 transport
/// （`a2ui_agent_connector.dart:302-309` 只关两个 StreamController）
/// ⇒ 要释放连接资源，得自己留着 [ShadowKeySseTransport] 调 `close()`。
A2uiAgentConnector buildShadowKeyConnector({
  required String serverUrl,
  required ShadowKeySseTransport transport,
}) {
  return A2uiAgentConnector(
    url: Uri.parse(serverUrl),
    client: A2AClient(url: serverUrl, transport: transport),
  );
}

/// 在 SSE 请求上带上端脑面的钥匙 —— **钥匙在请求时现读**。
class ShadowKeySseTransport extends SseTransport {
  ShadowKeySseTransport({
    required super.url,
    required this.shadowKeyProvider,
    super.client,
  }) : super(
          // ⚠️ `X-A2A-Extensions` 是 **A2UI 协议常量**，客户端默认会带
          // （`a2ui_agent_connector.dart:39`）。自己造 transport 时**必须
          // 补上**，否则服务端认不出这是 A2UI 请求。
          //
          // ⚠️ 它是 per-call 头时**不会**被带上：`A2AClient.messageStream`
          // 只在 `message.extensions != null` 时才加这个头
          // （`a2a_client.dart:191-193`），而 A2UI 的发送路径不带
          // extensions ⇒ 只能靠 `authHeaders`。
          authHeaders: {'X-A2A-Extensions': a2uiExtensionUri.toString()},
        );

  /// 「现在的钥匙是几号」—— 发请求的那一刻才调用。
  ///
  /// 返回 null / 空串 ⇒ **不带**这个头（端脑在开发模式下也放行）。
  final String? Function()? shadowKeyProvider;

  @override
  Stream<Map<String, Object?>> sendStream(
    Map<String, Object?> request, {
    Map<String, String> headers = const {},
  }) {
    final key = shadowKeyProvider?.call();
    return super.sendStream(
      request,
      headers: {
        if (key != null && key.isNotEmpty) 'X-Shadow-Key': key,
        // ⚠️ 调用方传的头**优先**（`SseTransport.sendStream` 里
        // `...authHeaders, ...headers` 的展开顺序就是这个意思）。
        ...headers,
      },
    );
  }
}
