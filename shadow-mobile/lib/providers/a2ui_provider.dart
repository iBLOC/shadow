import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/telencephalon_provider.dart';
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../services/a2ui/a2ui_agent_service.dart';

/// Export A2uiAgentService for use in other files
export '../services/a2ui/a2ui_agent_service.dart';

/// A2A 端点路径 —— 挂在端脑面的 `/a2a` 下。
///
/// ⚠️ **不是** baseUrl 根：我们的**传输层**会把 JSON-RPC `message/stream`
/// **POST 到它给的这个 URL 本身**（`services/a2ui/shadow_key_sse_transport.dart`
/// —— `http.Request('POST', uri)`，uri 就是构造时传进来的那个）。
/// ⇒ 端脑必须在 `/a2a` 上提供这个端点（JSON-RPC + SSE）。
///
/// ⚠️ **这段以前指向的是 `genui_a2ui` 的内部实现** —— 那个包已被官方点名弃用
/// （a2ui.org/llms.txt：「Do not use the discontinued flutter_genui or genui_a2ui
/// packages」）⇒ ⇒ 那个文件**已经不存在**了 ⇒ ⇒ 拿它当依据就是**在说假话**。
/// ⇒ ⇒ 结论（URL 不带 baseUrl 根）保留，依据换成**我们自己那份传输层**。
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
/// ⚠️ **原来的依据已经失效** —— 原来这里写的是「`A2uiContentGenerator` 在**构造时**
/// 把 URL 焊死（`genui_a2ui` 的 `A2uiAgentConnector.url` 是 final，没有 setter）
/// ＋ 而 `GenUiConversation.contentGenerator` 也是 final
/// （`genui-0.7.0/lib/src/facade/gen_ui_conversation.dart:54`）」
/// ⇒ ⇒ 那两个包**已被官方点名弃用并从依赖里移除** ⇒ ⇒ 那些文件**已经不存在**
/// ⇒ ⇒ **不能再说现在的行为由它们决定**。
///
/// ⇒ ⇒ 现在真正的理由是：**我们自己的传输层把 URL 焊死**
/// （`shadow_key_sse_transport.dart` 构造时收一个 `serverUrl`，没有 setter）
/// ⇒ ⇒ 地址变了就必须**整个重建**那个 service。
///
/// 这里 `watch` 了地址 ⇒ 地址一变 provider 就重建 ⇒ 旧 service 被 dispose、
/// 新 service 按新地址构造 ⇒ 视图（`ref.watch(a2uiAgentServiceProvider)`）
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

/// Provider for A2uiAgentService
final a2uiAgentServiceProvider = Provider<A2uiAgentService>((ref) {
  // 端脑面的钥匙 —— **唯一真相来源**是端脑 client 自己
  // （`TelencephalonClient.apiKey`，`telencephalon_client.dart:674`）。
  // 它发 `/shadow/v1/*` 时用的就是同一个值（`_headers()` 里的
  // `X-Shadow-Key`）⇒ 两边天然一致，不会各持一份而漂移。
  //
  // ⚠️ 传的是**回调**不是值：钥匙的设置时机与本 provider 的构造时机
  // 错开（嵌入式大脑先给地址、宿主才给钥匙）⇒ 构造时取值会造出
  // 「指着新地址、却还没带钥匙」的窗口 ⇒ 请求 401。
  // 详见 `services/a2ui/shadow_key_sse_transport.dart`。
  final telencephalonClient = ref.watch(telencephalonClientProvider);
  final service = A2uiAgentService(
    serverUrl: ref.watch(a2uiServerUrlProvider),
    shadowKeyProvider: () => telencephalonClient.apiKey,
    // ⚠️ **admin token 也要递** —— `POST /a2a` 的门是**读门**
    // （影子锁 ∪ admin token）⇒ ⇒ 只递影子锁 ⇒ 外部端脑只认 admin token
    // 时 ⇒ 401 ⇒ A2UI 那侧把它画成「连不上」。
    adminTokenProvider: () => telencephalonClient.adminToken,
    // ⚠️ **界面文案随用户的语言走** —— 端脑在 `Accept-Language` 里挑
    // 语言（`telencephalon/src/a2a/a2ui_i18n.rs`）。
    //
    // ⚠️ App 的语言就是**系统语言**：
    // `main.dart` 用 `AppLocalizations.supportedLocales`（en / zh）
    // + `basicLocaleListResolution` ⇒ 没有 App 内语言开关，
    // ⇒ 设备语言就是界面语言。
    localeProvider: () => PlatformDispatcher.instance.locale.languageCode,
  );

  ref.onDispose(() {
    service.dispose();
  });

  return service;
});

// ⚠️ **这一段**曾经**有**五个 provider，2026-11-18 **整块摘掉**了 ——
// 它们**只服务那块「独立面板」**（面板的连接状态栏、面板的空 surface 列表、
// 面板要显示的端脑原话、面板要显示的失败原因，以及「面板开/关」那个开关）
// ⇒ ⇒ 面板下线 ⇒ ⇒ 它们**全部**失去读者 ⇒ ⇒ 留着就是「存在 ≠ 在用」。
//
// ⚠️ **摘掉它们顺带甩掉一个坑** —— 那五个 provider 都挂在**广播流**上
// （`connectionStatusStream`／`surfaceIdsStream`／`textReplyStream`／
// `errorReasonStream`）⇒ ⇒ **广播流不重放** ⇒ ⇒ 「回复先到、provider 后订阅」
// ⇒ ⇒ 那一句端脑原话**会漏掉**（真机踩过）⇒ ⇒ 当年是用
// 「先给一次现在的列表」那一手补的。
// ⇒ ⇒ **AG-UI 路没有这个坑**：它是**请求-应答**的 SSE ⇒ ⇒ 一轮读完
// ⇒ ⇒ 端脑的原话走 `text` 事件 ⇒ ⇒ 直接进对话气泡 ⇒ ⇒ 不需要观察面。
//
// ⇒ ⇒ 现在这一侧**只剩服务本体**（`a2uiAgentServiceProvider` ＋ 地址）
// ⇒ ⇒ A2UI 的面**只有一条承载**：**AG-UI**（官方 `ACTIVITY_SNAPSHOT`）
// ⇒ ⇒ 面**内联在对话消息里**（`local_chat_view.dart` 的 `A2uiSurfacesBlock`）
// ⇒ ⇒ **一个页面**。
//
// ⚠️ **恢复＝三件一起做**（缺一件就退回「两条承载并存」）：
// ① `chat_screen.dart` 的 AppBar 加回一个开关按钮 ＋ body 顶部加回面板
// ② 把这个文件里的四个观察面 provider 加回来（**连同「先给一次现在的列表」
//    那一手** —— 广播流不重放那个坑还在）
// ③ `lib/widgets/chat/a2ui_{panel,view,answer_state}.dart` 三个文件
//    （它们走回收站，可恢复）
