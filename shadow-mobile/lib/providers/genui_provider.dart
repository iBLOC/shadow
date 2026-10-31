import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:genui/genui.dart';
import '../providers/telencephalon_provider.dart';
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../services/genui/gen_ui_agent_service.dart';
import '../services/genui/shadow_catalog.dart';

/// Export GenUIAgentService for use in other files
export '../services/genui/gen_ui_agent_service.dart';

/// A2A 端点路径 —— 挂在端脑面的 `/a2a` 下。
///
/// ⚠️ **不是** baseUrl 根：`A2uiAgentConnector` 会把 JSON-RPC `message/stream`
/// **POST 到它给的这个 URL 本身**（`genui_a2ui/lib/src/a2a/client/sse_transport.dart:52`
/// —— `http.Request('POST', uri)`，uri 就是构造时传进来的那个）。
/// ⇒ 端脑必须在 `/a2a` 上提供这个端点（JSON-RPC + SSE）。
const a2uiPath = '/a2a';

/// A2UI 服务端地址 —— **跟随端脑面的真实地址**。
///
/// ## 为什么不能写死
///
/// 以前这里是 `const prefrontalUrl = 'http://localhost:60080'` —— 那是
/// **桌面 sidecar** 的端口。手机上嵌入式端脑面的端口**每次启动随机分配**
/// （日志：`✅ Encephalon started on port <neuron> (agent surface: <端脑面>)`）
/// ⇒ 写死的地址在真机上**必然 connection refused**。
/// （评估文档 `2026-10-31-multi-end-a2ui-usability.md` §3.5 / U4）
///
/// ## 取址规则
///
/// 1. **嵌入式大脑在跑** ⇒ 用它那个端脑面的端口
///    （`encephalon_mobile_provider.dart:16` 的注释已经写明：
///    「端脑 HTTP 面（shadow API / **A2A** / agent 管理）的端口」）。
/// 2. **没跑** ⇒ 退回外部端脑（桌面 sidecar）的地址。
///
/// ## 为什么用 `watch` 而不是 `read`
///
/// `A2uiContentGenerator` 在**构造时**把 URL 焊死（`genui_a2ui` 的
/// `A2uiAgentConnector.url` 是 final，没有 setter）⇒ 地址变了就必须**重建**。
/// 而 `GenUiConversation.contentGenerator` 也是 final（`genui-0.7.0/lib/src/facade/
/// gen_ui_conversation.dart:54`）⇒ 只能**整个换掉 `GenUIAgentService` 实例**。
///
/// 这里 `watch` 了地址 ⇒ 地址一变 provider 就重建 ⇒ 旧 service 被 dispose、
/// 新 service 按新地址构造 ⇒ 视图（`ref.watch(genUIAgentServiceProvider)`）
/// 跟着重建、拿到新的 `messageProcessor` ⇒ **下一次发送自动打到新地址**。
final a2uiServerUrlProvider = Provider<String>((ref) {
  // 嵌入式大脑的端脑面端口 —— 端口每次启动随机分配 ⇒ 必须跟着状态走。
  final agentPort = ref.watch(
    encephalonMobileProvider.select((s) => s.agentPort),
  );
  if (agentPort != null && agentPort > 0) {
    return 'http://127.0.0.1:$agentPort$a2uiPath';
  }
  // 没跑嵌入式大脑 ⇒ 外部端脑（桌面 sidecar）。
  final base = ref.watch(
    telencephalonProvider.select((s) => s.connection.baseUrl),
  );
  return '$base$a2uiPath';
});

/// Provider for GenUIAgentService
final genUIAgentServiceProvider = Provider<GenUIAgentService>((ref) {
  final catalog = ShadowCatalog.create();
  // 端脑面的钥匙 —— **唯一真相来源**是端脑 client 自己
  // （`TelencephalonClient.apiKey`，`telencephalon_client.dart:674`）。
  // 它发 `/shadow/v1/*` 时用的就是同一个值（`_headers()` 里的
  // `X-Shadow-Key`）⇒ 两边天然一致，不会各持一份而漂移。
  //
  // ⚠️ 传的是**回调**不是值：钥匙的设置时机与本 provider 的构造时机
  // 错开（嵌入式大脑先给地址、宿主才给钥匙）⇒ 构造时取值会造出
  // 「指着新地址、却还没带钥匙」的窗口 ⇒ 请求 401。
  // 详见 `services/genui/shadow_key_sse_transport.dart`。
  final telencephalonClient = ref.watch(telencephalonClientProvider);
  final service = GenUIAgentService(
    serverUrl: ref.watch(a2uiServerUrlProvider),
    catalog: catalog,
    shadowKeyProvider: () => telencephalonClient.apiKey,
  );

  ref.onDispose(() {
    service.dispose();
  });

  return service;
});

/// Provider for A2UI connection status (listens to service's connection status)
final a2uiConnectionStatusProvider = StreamProvider<ConnectionStatus>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.connectionStatusStream;
});

/// Provider that indicates whether to use Agent2UI mode
final useAgent2UIModeProvider = StateProvider<bool>((ref) => false);

/// Provider for surface IDs from GenUIAgentService
final surfaceIdsProvider = StreamProvider<List<String>>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.surfaceIdsStream;
});

/// Provider for GenUiConversation
final genUiConversationProvider = Provider<GenUiConversation>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.conversation;
});
