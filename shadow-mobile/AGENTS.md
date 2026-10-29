# PROJECT KNOWLEDGE BASE — shadow-mobile

**Updated:** 2026-10-28 (移动端「改嵌大脑」落地：嵌入式运行时换成与桌面端**同一个**大脑 `encephalon`（`libencephalon.so` 经 MethodChannel `com.ibloc.shadow/encephalon_runtime` 加载），不再是前额叶 lobe —— **两端嵌入的运行时现在一致了**。嵌入运行时内**再挂一层端脑面**（telencephalon `cortex_router`，`127.0.0.1` 随机端口），Dart 侧把端脑 client 指过去，**对话**与**会话列表**从前额叶方言迁到端脑方言；soul / tasks / memory / providers / skills / mcp / agents 列表页与语音会话模式**仍在前额叶方言**（端脑面上一条前额叶路径都没有，见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」）。移动端**不编本地海马体**（记忆走零信任网络内其它设备）⇒ Lance 退出移动端依赖图。旧的嵌入式前额叶支线（`/settings/prefrontal` + `libprefrontal_core_lib.so`）仍在，但已是**遗留**路径)
**Updated:** 2026-10-28 (收口残留的 `:8082`：移动端主链是端脑 `:60080`，但 6 处代码仍按前额叶 `:8082` 走。其中 4 处是纯端口残留（服务健康检查清单 / continue-on-desktop 手工填端点 / localPeer / 注释），改成 `:60080`；1 处（log 面板的 `/api/logs/stream`）只有前额叶有该路由，改连**本机嵌入式前额叶的真实端口**；3 处属于 **WebRTC companion 死代码**（自引用闭环、零外部引用，且 WS 路径 `/api/sessions/{id}/ws` 是前额叶专属、端脑的是 `/api/webrtc/{modality}/...`），按孤儿代码惯例整段删除并摘掉 `flutter_webrtc` 依赖)
**Updated:** 2026-10-28 (补上 **嵌入式 Prefrontal 运行时**（NDK `.so`）这条支线：MethodChannel/JNI 链路、`.so` 来源与缺失降级、以及它在整体架构里的位置 —— 移动端主链是端脑 telencephalon，嵌入支线跑的是前额叶；桌面端已升级为嵌大脑 `encephalon`，**两端嵌入的运行时目前不一致**。另：补上 `com.ibloc.shadow/prefrontal_runtime` channel（此前漏登记）)
**Updated:** 2026-09-25 (post-audit-cycle: telencephalon-centric view confirmed; port `:60080` unified; references [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md))
**Project:** shadow-mobile (Layer 4 Interaction + thin on-device Engine via Kotlin Native)

> **Note (2026-07-19)**: This doc was previously framed as a "Layer 4 + Layer 2 hybrid" with 3 user-configurable modes. That framing predates **Telencephalon** (Layer 3.5). Current architecture: mobile is **primarily Layer 4** (Flutter UI); the on-device inference capability lives in the **Kotlin Native** layer (OpenAIServer.kt + LiteRT/MNN), exposed as a sidecar HTTP server on `:8085` when the user opts in. The default mobile flow routes everything through **telencephalon** (`:60080`).

## ARCHITECTURAL ROLE

Shadow-Mobile is the **Interaction Layer (Layer 4)** mobile client of the Shadow Platform. It is a **thin UI client** that talks to:

- **Agent Orchestrator (Telencephalon, Layer 3.5)** via `/api/telencephalon/*` — **primary** path; the mobile app routes most agent / flow / MCP / conversation / discovery operations through telencephalon
- **Agent Layer (Prefrontal)** via OpenAI `/v1/*` and A2A — **fallback** when telencephalon unreachable (note: `dacbe83` removed automatic fallback for `continue-on-desktop`)
- **Embedded Encephalon runtime** as an in-process NDK `.so` (`libencephalon.so`) — the **same brain** shadow-desktop embeds (`encephalon::Embedded::boot()`): thalamus + ACP 总线 + 端脑 + 单一 neuron (see §EMBEDDED ENCEPHALON RUNTIME). Its embedded **agent surface** is the telencephalon `cortex_router` on `127.0.0.1:<random>` — the **telencephalon dialect** only
- **Embedded Prefrontal runtime** as an in-process NDK `.so` — a **legacy** path (see §EMBEDDED PREFRONTAL RUNTIME). It embeds a *lobe* (prefrontal), not the brain; superseded by the embedding above
- **Local inference** via Kotlin `OpenAIServer.kt` (MNN / LiteRT bindings) on `:8085` when in **Phone-as-Engine** opt-in mode

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The mobile app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via `/v1/audio/speech` response)
4. Captures mic audio (VAD-driven `audio_ws_service`)
5. Renders UI (Flutter 3.11+ with Riverpod 2.5 + GoRouter 14.8)
6. Surfaces native-platform capabilities (Android Accessibility for automation, MNN/LiteRT for on-device inference)

## OPERATING MODES (v2.8+ — post 2026-08-18)

| Mode | Path | Route | What happens |
|---|---|---|---|
| **Voice Assistant** (default) | `/voice` | mic → ASR → LLM (telencephalon or LiteRT) → TTS → shadow-esp32 USB / phone / BT | Interactive speech dialog. phone runs everything; shadow-esp32 is USB Audio sink + mic source. |
| **Live Stream** | `/livestream` | phone TTS text input → TTS → shadow-esp32 USB / phone / BT | TTS playback / read-aloud mode. shadow-esp32 is USB Audio sink only. |
| **Customer Service** | `/customer-service` | phone cellular call → shadow-esp32 USB / wired earphone | AI auto-answer phone calls. shadow-esp32 plays caller voice + AI TTS. Earphone takeover when plugged in. |

Both modes route audio via `UsbAudioRouter` (v2.5) to whichever output the user selects in the screen header:

| Output | Code | Description |
|---|---|---|
| **phone speaker** | `ShadowOutputRoute.phoneSpeaker` | Built-in speaker / wired headset |
| **BT headset** | `ShadowOutputRoute.bluetoothHeadset` | Standard Android Bluetooth; phone handles pairing |
| **shadow-esp32** | `ShadowOutputRoute.shadowEsp32` | `UsbAudioRouter.routeTo()` → `AudioManager.preferredDevice` |

The `ShadowOperationModeProvider` / `ShadowOutputRouteProvider` Riverpod state holds the current selection. A "Live" bottom-nav tab (added to `MainShell`) drives to `/livestream`; tapping the mic icon from there jumps back to `/voice`.

## PLATFORM CHANNELS (registered in `MainActivity.configureFlutterEngine`)

| Channel | Direction | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | ⇅ | Load / infer / diagnose LiteRT model |
| `com.ibloc.shadow/engine` | ⇅ | Start/stop OpenAIServer, mDNS, auth, port config |
| `com.ibloc.shadow/tts` | ⇅ | Android TTS engine |
| `com.ibloc.shadow/accessibility` | ⇅ | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | ⇅ | Discover + resolve `_shadow._tcp` services |
| `com.ibloc.shadow/mnn_logs` | ← | EventChannel: logcat streaming |
| `com.ibloc.shadow/pcm_audio` | ⇅ | Start/stop 16kHz PCM recording |
| `com.ibloc.shadow/pcm_audio_stream` | ← | EventChannel: PCM chunks to Dart |
| `com.ibloc.shadow/http_server` | ⇅ | MobileActionServer start/stop |
| `com.ibloc.shadow/engine` | ⇅ | Phone-as-Engine OpenAI server |
| `com.ibloc.shadow/ble_provision` | **v2.5** ⇅ | `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** ⇅ | `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |
| `com.ibloc.shadow/call_state` | **v2.8** ⇅ | InCallService call events: `onCallState(idle/ringing/active/ended)`, `onEarphoneTakeover(taken)`, `setAiAutoAnswer(enabled)`, `setPreferredDevice(device)` |

> **Design note (v2.6+):** `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` were added in v2.5 to support the BLE provisioning flow. The `voice_conversation_screen.dart` and `livestream_screen.dart` screens automatically call `UsbAudioRouter.routeTo()` on initialization when they detect a connected shadow-esp32 — no explicit user-tap needed after initial provisioning.

```
shadow-mobile/
├── pubspec.yaml                         # Flutter package (Dart SDK ^3.11.1)
├── lib/
│   ├── main.dart                        # Entry — initializes AppConfig + ModelManager + Riverpod
│   ├── litert_engine.dart               # LiteRT LM engine wrapper
│   ├── litert_model.dart                # LiteRT model metadata + load
│   ├── mnn_engine.dart                  # MNN inference engine wrapper (uses Android Kotlin/C++ bridge)
│   ├── tts_engine.dart                  # TTS pipeline
│   ├── model_manager.dart               # Model registry + lifecycle
│   ├── model_config.dart                # Model configuration types
│   ├── router/
│   │   └── app_router.dart              # GoRouter declarative routes
│   ├── agents/                          # In-process agent runtimes
│   │   ├── a2a/                         # A2A client + message + server stubs (3 files)
│   │   ├── main_agent/                  # Main chat orchestrator (prompt + tools, 3 files)
│   │   ├── mobile_action_agent/         # Android-action sub-agent (Accessibility-based, 4 files)
│   │   └── providers/                   # agent_provider (Riverpod)
│   ├── screens/                         # 19 UI pages
│   │   ├── agents_screen.dart / chat_screen.dart / conversation_screen.dart
│   │   ├── flows_screen.dart            # Browse / run telencephalon flows (Sprint 1, commit 55ffc95)
│   │   ├── group_screen.dart / mcp_screen.dart / memory_screen.dart
│   │   ├── model_management_screen.dart / model_settings_screen.dart
│   │   ├── prompt_settings_screen.dart / providers_screen.dart / settings_screen.dart
│   │   ├── setup_wizard_screen.dart     # First-run wizard (telencephalon discovery + model check)
│   │   ├── skills_screen.dart / soul_screen.dart / task_board_screen.dart
│   │   ├── voice_conversation_screen.dart  # Hands-free voice mode
│   │   └── manage/                      # Sub-management screens
│   ├── services/                        # Wire-level + service layer (23 files)
│   │   ├── cortex/                      # cortex_client.dart — HTTP to telencephalon :60080 (dir name kept for git history)
│   │   ├── prefrontal/                  # Embedded prefrontal (.so) JNI bridge + settings page (4 files)
│   │   ├── database/                    # SQLite repositories (11 files)
│   │   ├── genui/                       # GenUI server helpers (Agent2UI)
│   │   ├── audio_ws_service.dart        # WebSocket audio streaming (VAD-driven)
│   │   ├── wake_word_service.dart       # Wake-word detection
│   │   ├── accessibility_controller.dart  # Android Accessibility API bridge
│   │   ├── session_transfer_service.dart  # Cross-device session transfer
│   │   ├── soul_service.dart            # "Soul" agent persistence
│   │   ├── model_download_service.dart  # Model puller (delegates to neuron `/v1/models/pull`)
│   │   ├── mdns_discovery.dart          # `_shadow._tcp` browsing
│   │   ├── network_service.dart         # connectivity_plus wrapper
│   │   ├── group_service.dart           # mTLS group manager
│   │   ├── engine_service.dart          # Inference engine coordination
│   │   ├── log_service.dart             # Rolling file logger (mobile-side)
│   │   ├── pcm_audio_recorder.dart      # PCM mic capture
│   │   ├── video_frame_collector.dart   # Camera frame capture for multimodal
│   │   ├── agent_review_service.dart    # Agent-review flow (approve / reject draft flows)
│   │   ├── app_config_service.dart      # App-level config init
│   │   └── prefrontal_client.dart       # HTTP client to telencephalon :60080 (/v1/* shim; chat/TTS/ASR)
│   ├── providers/                       # Riverpod state (14 providers)
│   │   ├── ai/                          # AI-specific providers (model registry, embeddings)
│   │   ├── cortex_provider.dart
│   │   ├── chat_provider.dart / conversation_mode_provider.dart
│   │   ├── flow_provider.dart / genui_provider.dart
│   │   ├── mnn_agent_integration.dart
│   │   ├── model_download_provider.dart / engine_models_provider.dart
│   │   ├── wake_word_provider.dart / theme_provider.dart / log_provider.dart
│   │   ├── service_provider.dart / error_dialog_provider.dart
│   ├── multimodal/                      # Audio / image / file input handlers (5 files)
│   ├── models/                          # Data classes (conversations, agents, flows, etc.)
│   ├── skills/                          # Skill definitions
│   ├── flutter_genui/                   # GenUI runtime (Agent2UI)
│   ├── theme/                           # Material 3 + glassmorphism themes
│   ├── widgets/                         # Reusable widgets
│   ├── utils/                           # Helpers (logging, formatting, etc.)
│   ├── config/                          # Build-time config
│   ├── l10n/                            # i18n strings (zh / en arb files — see i18n section)
│   └── generated/l10n/                  # Generated AppLocalizations (from arb files)
├── android/                             # Android platform code (Kotlin + C++)
│   └── app/src/main/
│       ├── kotlin/com/ibloc/shadow/
│       │   ├── MainActivity.kt          # Platform Channels registration
│       │   ├── PrefrontalAccessibilityService.kt
│       │   ├── litert/LitertEngine.kt   # Google AI Edge LiteRT
│       │   ├── mnn/                     # MNN wrapper
│       │   ├── pcm/PcmAudioRecorder.kt  # 16kHz PCM recording
│       │   ├── tts/TtsManager.kt
│       │   ├── http/MobileActionServer.kt  # HTTP server for mobile-action sub-agent
│       │   ├── OpenAIServer.kt          # Phone-as-Engine OpenAI-compat server (port 8085)
│       │   └── ...
│       └── cpp/                         # C++ JNI bridge
│           └── mnn_bridge.cpp
├── ios/                                 # iOS platform code (Swift / Objective-C)
│   └── Runner.xcodeproj/
└── assets/
    ├── models/                          # Default model catalog (small JSONs)
    └── config/                          # Default config files
```

## INBOUND PROTOCOLS (calls Telencephalon, then Prefrontal as fallback)

All HTTP calls go to standard endpoints. **No direct engine calls** — the mobile app never speaks `/v1/chat/completions` directly when telencephalon is reachable.

```dart
// LLM Chat (streaming)
POST {host}/v1/chat/completions       // via telencephalon or prefrontal
  body: { model, messages, stream: true }
  returns: SSE

// TTS
POST {host}/v1/audio/speech
  body: { model: "tts-1", input: "Hello", voice: "alloy", response_format: "mp3" }
  returns: audio/mpeg

// ASR (when needed)
POST {host}/v1/audio/transcriptions
  body: multipart { file, model: "whisper-1" }
  returns: { text }

// Conversations (telencephalon preferred — `/shadow/v1/conversations`)
POST {host}/shadow/v1/conversations                // create
GET  {host}/shadow/v1/conversations                // list
POST {host}/shadow/v1/conversations/{id}/messages  // send (may return SSE)

// WebSocket streaming (chat)
WS {host}/api/sessions/{id}/ws

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard
```

## TELENCEPHALON-SPECIFIC ENDPOINTS (Sprint 1+2)

`lib/services/telencephalon/telencephalon_client.dart` (~814 lines after 2026-09-27 telencephalon migration) is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontal_client.dart` against the telencephalon `/v1/*` shim).

```dart
// === Health / discovery ===
Future<Map<String, dynamic>> health()                  // GET /.well-known/agent.json
Future<AgentsResponse>    listAgents()                 // GET /shadow/v1/agents
Future<Map<String, dynamic>> getAgent(String name)     // GET /shadow/v1/agents/{name}

// === Conversations (Sprint 1 — telencephalon persistence) ===
Future<Conversation> createConversation({agent, systemPrompt})  // POST /shadow/v1/conversations
Future<Conversation> getConversation(String id)                 // GET  /shadow/v1/conversations/{id}
Future<List<Conversation>> listConversations()                  // GET  /shadow/v1/conversations
Future<Conversation> importSessionAsConversation(...)           // POST session-export → conversation
Future<SendMessageResponse> sendMessage(id, req)                // POST /shadow/v1/conversations/{id}/messages

// === Flows (Sprint 1 — flows via telencephalon) ===
Future<List<FlowMeta>>      listFlows({name, tag, isDraft})      // GET    /api/flows
Future<FlowDefinition>      createFlow(FlowDefinition flow)      // POST   /api/flows
Future<FlowDefinition>      getFlow(String id)                   // GET    /api/flows/{id}
Future<FlowRunResult>       runFlow(flowIdOrName, inputs, ...)   // POST   /api/flows/{id}/run
Future<List<FlowDefinition>> listDrafts()                       // GET    /api/flows/draft
Future<FlowDefinition>      promoteDraft(draftId)                // POST   /api/flows/draft/{id}/promote
void                       rejectDraft(draftId)                 // POST   /api/flows/draft/{id}/reject

// === Admin (via shared surface with desktop) ===
// MCP / WASM / agent install / LLM description — same routes as desktop's telencephalon client
```

Mobile-specific helpers (NOT in desktop's telencephalon client):
- `importSessionAsConversation(...)` — converts a `SessionExport` JSON into a telencephalon conversation so the phone can pick up where another device left off
- **continue-on-desktop flow** (per `dacbe83`) — uses telencephalon only (no prefrontal fallback); the mobile app discovers the desktop's telencephalon endpoint and routes the chat session there

### 端脑会话的 wire 形状（别照着前额叶方言抄）

端脑的 `ConversationTurn` 在 Rust 侧是 `{ role, text, at }`，`at: DateTime<Utc>`
序列化成 **RFC3339 字符串**：

```json
{ "role": "user", "text": "hi", "at": "2026-10-29T01:23:46.123456789Z" }
```

**字段名是 `at`，不是 `timestamp`。** 前额叶方言用的才是 `timestamp`（毫秒整数）。
只认 `timestamp` 的客户端读到一条历史就会 `(json['timestamp'] as num).toInt()`
撞上 `null` → `_TypeError`，于是**会话列表页和 session transfer 的导入响应
一起崩**。`ConversationTurn.fromJson` 现在两种形状都认（见
`lib/services/telencephalon/telencephalon_client.dart`），回归测试在
`test/telencephalon_client_test.dart` 的 *conversation wire shape* 组里。

其它容易抄错的地方：

| 字段 | 端脑实际发的 | 说明 |
|---|---|---|
| `created_at` / `updated_at` | RFC3339 字符串 | `DateTime.parse` 直接能解 |
| `history[].role` | `"user"` / `"agent"` | 不是 `"assistant"` |
| `history[].at` | RFC3339 字符串 | **不是 `timestamp`** |
| `SendMessageResponse.timestamp` | 毫秒整数 | 这个**是**整数 |
| `agents[].agent_card.metadata.*` | `input_modalities` / `output_modalities` / `capabilities` | 空数组会被 `skip_serializing_if` 省略 |

端脑注册了三个 native lobe：**`temporal` / `prefrontal` / `parietal`**
（`NativeLobeRegistry::with_temporal()`）。`createConversation()` 不带 agent 时
服务端用 `CORTEX_DEFAULT_AGENT` 或 `"temporal"`。

## OUTBOUND PROTOCOLS (when Mobile is in Phone-as-Engine mode)

When the user enables **Phone-as-Engine** in Settings, the Kotlin `OpenAIServer.kt` exposes an OpenAI-compatible HTTP server on `:8085`:

```
POST /v1/chat/completions    # Delegates to LiteRT.generateContent()
GET  /v1/models              # Lists installed .litertlm files
```

This allows a desktop/Prefrontal agent to call `http://mobile.local:8085/v1/chat/completions` and use the phone's local LLM. mDNS `_shadow._tcp` advertises the service with capabilities TXT records.

## mDNS SERVICE DISCOVERY

On startup, the app browses `_shadow._tcp` services via `mdns_discovery.dart`:

```dart
// mDNS query for _shadow._tcp services
// then for each found service:
//   - GET http://host:port/.well-known/agent.json  → A2A AgentCard
//   - POST http://host:60080/api/telencephalon/agents  → register self (if user opts in)
//   - open WS ws://host:60080/api/webrtc/... for companion mode（端脑确实有这条路由，
//     但移动端 2026-10-28 把旧的 WebRTC companion 链当死代码删了，尚未接回来）
```

Persist discovered hosts in `preferences` (or SQLite via `group_service.dart`); the user can pin favourites on the Group page (`group_screen.dart`).

## COMPANION MODE (WebRTC) —— 2026-10-28 整段删除

原实现三个文件（`lib/services/webrtc_companion.dart`、`lib/services/webrtc_signaling.dart`、
`lib/providers/companion_mode_provider.dart`）**自引用闭环、零外部引用**：`companionModeProvider`
从未被任何 screen/widget 读取，`CompanionModeNotifier.start()` 从未被调用，
`telencephalon_client.webrtcSignalingUrl()` 也从未被引用 —— 整条链不可达。

而且它指向的服务已经变了：`WebRtcSignaling` 拼的是 **`/api/sessions/{id}/ws`**，那是
**Prefrontal 专属**路由（`prefrontal/src/server/routes.rs:76`）；Telencephalon 的 WS 路由是
`/api/webrtc/{modality}/sessions/{id}/ws`（`telencephalon/src/api/webrtc_route.rs:36`）。
原代码的 primary 是端脑 `:60080`、fallback 是前额叶 `:8082` —— 两边的路径都对不上。

故按「孤儿代码」惯例删除（git 历史保留），并从 `pubspec.yaml` 摘掉 `flutter_webrtc`
（它唯一的使用者就是 `webrtc_companion.dart`；摘掉后 APK 不再带 `libjingle_peerconnection_so.so`）。

要重做 Companion Mode 时：`TelencephalonClient.webrtcSignalingUrl(sessionId, modality)`
已经是正确的 URL 构造器，直接接上 `flutter_webrtc` 即可。

> 消息式 **Conversation Mode**（WebSocket 一次性语音消息，非实时）不受影响 ——
> 那条路走 `conversation_mode_provider` + `audio_ws_service.dart`，仍在。

## AGENTS (in-process)

`lib/agents/` hosts three runtimes + their providers:

| Subdir | Files | Role |
|---|---|---|
| `a2a/` | `a2a_client.dart` / `a2a_message.dart` / `a2a_server.dart` | A2A message types + client (outbound HTTP to other telencephalon / prefrontal / external) + server stub |
| `main_agent/` | `main_agent.dart` / `main_agent_prompt.dart` / `main_agent_tools.dart` | Primary chat orchestrator; system prompt + tool registry; runs on-device in Standalone mode |
| `mobile_action_agent/` | `actions.dart` / `mobile_action_agent.dart` / `mobile_actions_tools.dart` / `mobile_actions_viewmodel.dart` | Sub-agent that calls `AccessibilityController` to tap / swipe / type on Android UI elements |
| `providers/` | `agent_provider.dart` | Riverpod glue |

The `main_agent` is intentionally thin — for any non-trivial task (file ops, code edits, browser automation), it delegates to a **telencephalon flow** via `TelencephalonClient.runFlow(...)`. The `mobile_action_agent` is one of the few exceptions (it must run on-device because it touches the Android Accessibility API).

## PLATFORM CHANNELS (Flutter ↔ Kotlin)

| Channel | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | LiteRT model load + inference |
| `com.ibloc.shadow/mnn` | MNN model load + inference |
| `com.ibloc.shadow/tts` | Android TTS engine |
| `com.ibloc.shadow/accessibility` | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | Network discovery |
| `com.ibloc.shadow/mnn_logs` | Logcat streaming |
| `com.ibloc.shadow/pcm_audio` | Audio recording control |
| `com.ibloc.shadow/pcm_audio_stream` | Audio data stream (EventChannel) |
| `com.ibloc.shadow/http_server` | Mobile action server |
| `com.ibloc.shadow/prefrontal_runtime` | 嵌入式 Prefrontal 运行时（NDK `.so`）：`start` / `stop` / `isHealthy` / `getStatus` / `registerAgent` / `invokeAgent` / `startAndroidService` / `stopAndroidService` |
| `com.ibloc.shadow/encephalon_runtime` | 嵌入式 **大脑** 运行时（NDK `libencephalon.so`）：`start`（入参 `port` + `dataDir`，返回 `success` / `port` / `agentPort`）/ `stop` / `getPort` / `isHealthy` / `getStatus`（返回 `running` / `port` / `agentPort` / `healthy`）/ `infer`。**端脑面端口**看 `agentPort`：正数 = 端脑面在监听；**0 = 大脑在跑但端脑面没起来**（此时客户端不指过去）；**-2 = 大脑整个没在跑** |
| `com.ibloc.shadow/engine` | Phone-as-Engine OpenAI server: `startServer` / `stopServer` / `isServerRunning` / `getServerUrl` / `getApiKey` / `setApiKey` / `setAuthEnabled` / `getServiceName` |
| `com.ibloc.shadow/ble_provision` | **v2.5** — `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** — `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |

## EMBEDDED PREFRONTAL RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌一份 Prefrontal（前额叶）运行时，让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/prefrontal_runtime)
        → PrefrontalRuntimeService (Kotlin)
        → JNI (Java_com_ibloc_shadow_PrefrontalRuntime_*)
        → libprefrontal_core_lib.so (Rust, 40MB/ABI)
        → axum mini HTTP server (127.0.0.1:<port>)
```

- **Dart 侧**：`lib/services/prefrontal/prefrontal_mobile_service.dart`（MethodChannel + HTTP 客户端）、`prefrontal_mobile_provider.dart`（Riverpod 状态）、`prefrontal_mobile_cluster_page.dart`（管理页）
- **入口**：路由 `/settings/prefrontal`，从「设置 → 嵌入式 Prefrontal」进
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/PrefrontalRuntime.kt`（6 个 `external fun`）+ `PrefrontalRuntimeService.kt`
- **`.so` 不入库**：兄弟仓 [prefrontal](https://github.com/iBLOC/prefrontal) 的构建产物，按需用它的 `scripts/build-android.sh` 编，拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `prefrontal_core_lib`（Kotlin 侧 `System.loadLibrary("prefrontal_core_lib")`）
- **`.so` 缺失不崩**：`PrefrontalRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支

**这条支线在整体架构里的位置（重要）**：移动端**主链**是端脑 telencephalon（`:60080`，见 `engine_models_provider.dart`「Telencephalon is the single platform entry point」），prefrontal 在 HTTP 侧只是 fallback（`:8082`）。嵌入支线跑的却是**前额叶**——即 telencephalon 管的 lobe 之一，不是「大脑」本身。桌面端已经升级为嵌**大脑**（`encephalon::Embedded::boot()`）。**2026-10-28 起，移动端也改成嵌大脑了**（见下一节），这条前额叶支线降级为**遗留**路径。

## EMBEDDED ENCEPHALON RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌的**大脑**（与桌面端同一个 `encephalon`），让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/encephalon_runtime)
        → MainActivity (Kotlin)
        → JNI (Java_com_ibloc_shadow_EncephalonRuntime_*)
        → libencephalon.so (Rust cdylib)
        ├─ neuron 面 (127.0.0.1:<port>)     推理 / OpenAI 兼容
        └─ 端脑面 (127.0.0.1:<agentPort>)  telencephalon cortex_router
```

- **Rust 侧**：`encephalon` 仓的 `mobile` feature（`src/mobile/{mod.rs,jni.rs}`）。`MobileStack` 里同时跑 **neuron**（推理）与**端脑面**（`telencephalon::boot::build_app_state_with(..)` + `cortex_router`，`axum::serve` 绑 `127.0.0.1:0` 取随机端口）。端脑面起不来**不影响**大脑本体，只是 agent 面暂时要退回外部端脑
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt`（6 个 `external fun`）+ `MainActivity.setupEncephalonRuntimeChannel()`
- **Dart 侧**：`lib/services/encephalon/encephalon_mobile_service.dart`（MethodChannel 封装）+ `encephalon_mobile_provider.dart`（Riverpod 状态）+ `encephalon_mobile_page.dart`（管理页）
- **入口**：路由 `/settings/encephalon`，从「设置 → 嵌入式大脑」进
- **`.so` 不入库**：兄弟仓 [encephalon](https://github.com/iBLOC/encephalon) 的构建产物，用它的 `scripts/build-android.ps1` 编（`-Target` 切 ABI），拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `encephalon`
- **`.so` 缺失不崩**：`EncephalonRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支
- **`dataDir` 必须显式给**：Android 没有 `$HOME`、进程 CWD 是 `/`（不可写），端脑的 flow（工作流）存储要写在 App 私有目录里。`start` 的 `dataDir` 参数优先，缺省回落 `filesDir?.absolutePath`

**移动端不编本地海马体**：记忆走零信任网络内其它设备上的 hippocampus 服务 ⇒ `telencephalon` 把 `hippocampus-server` 改 optional，**Lance 退出移动端依赖图**（实测 mobile profile 构建日志里没有 `lance` crate）。代价：移动端**没有本地长期记忆**，会话只留在内存里。

**端脑面只说端脑方言**：嵌入式端脑面 = telencephalon 的 `cortex_router`，它**一条前额叶路径都没有**。所以 `PrefrontalClient`（`/api/sessions`、`/api/agents`、`/api/soul/*` …）**不能**指过去 —— 指了只会把「连接被拒」换成「404」。只有 `TelencephalonClient` 指过去，且目前只用得上 `/shadow/v1/*` 与 `/.well-known/agent.json` 两条线（对话 + 会话列表）。完整的方言对照见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」。

**验证手段**（本机无模拟器：BIOS 没开 AMD SVM，`adb devices` 空）：宿主 JVM 直测 `encephalon` 仓 `scripts/jni-host-test/`（**21/21 全绿**，含端脑面端口、`/.well-known/agent.json` 200、`/shadow/v1/conversations` 有响应、flow 目录落在给定 `dataDir` 下）+ Flutter 单测 **220/220 全绿** + 交叉编译 `.so` + APK 打包验收。**设备侧行为未验证**。

**Android 交叉编译探针**：`scripts/android-cross-probe/`（2026-10-28 加）。验任意 Rust crate 能否编到 `aarch64-linux-android` —— 判断「改嵌大脑」可行性的唯一硬判据。实测结论：**wasmtime 不是 blocker，synapse 能编过；第一个真 blocker 是 `rquickjs-sys` 没有 Android 绑定**（`zen-engine` → `rquickjs` → `rquickjs-sys`，只支持 14 个桌面/musl/wasm32 平台）。用法与三条修法见该目录的 `README.md`。

## MULTIMODAL INPUT

`lib/multimodal/` wraps three input channels:
- `audio_input_handler.dart` — mic capture via `record` package; PCM chunks → `pcm_audio_recorder.dart`
- `image_input_handler.dart` — `image_picker` + `camera`; feeds `video_frame_collector.dart` for streaming
- `file_input_handler.dart` — `file_picker`; uploads to telencephalon via `TelencephalonClient`

`multimodal_input_manager.dart` multiplexes these into a single inbound stream consumed by `main_agent`.

## ANDROID NATIVE (MNN + LiteRT)

`android/app/src/main/cpp/mnn_bridge.cpp` is the JNI bridge between Dart (`lib/mnn_engine.dart`) and the MNN C++ runtime. MNN is the on-device inference engine for older / lower-end devices. LiteRT (via `lib/litert_engine.dart` + `lib/litert_model.dart`) is the newer path for devices that ship Google's LiteRT-LM. The Kotlin side wraps both into a single `OpenAIServer.kt` that exposes an OpenAI-compatible `/v1/*` surface on `:8085`.

**LiteRT init timeout + model-dir diagnosis** (recent fix): previously hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing.

## i18n

Two ARB files (auto-generated Dart bindings live in `lib/generated/l10n/`):
- `lib/l10n/app_en.arb`
- `lib/l10n/app_zh.arb`

CI runs `flutter_localization_linter` — adding a UI string to only one locale fails the build.

## CONVENTIONS

- Flutter 3.11+ with Dart SDK `^3.11.1`
- Riverpod 2.5 for state management (`flutter_riverpod`)
- GoRouter 14.8 for declarative routing (`lib/router/app_router.dart`)
- speech_to_text 7.0 for ASR fallback
- sqflite 2.3 (mobile) + sqflite_common_ffi 2.3 (desktop tests) for local persistence
- genui 0.7 + genui_a2ui 0.7 for Agent2UI
- flutter_ai_toolkit 1.0 for chat UI primitives
- freezed_annotation + json_annotation for DTOs
- **Never** call `/v1/chat/completions` directly from a screen — always go through a provider or service
- i18n strings MUST appear in both `app_en.arb` and `app_zh.arb`
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17
- mTLS for secure communication (via `group_service.dart`)
- Network security config permits cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)

## BUILD COMMANDS

```bash
flutter pub get
flutter run                                # debug on attached device
flutter test                               # unit tests
flutter test integration_test              # integration tests
dart analyze                               # linter; 100 info-level issues as of 2026-07-19 (0 errors)
flutter build apk --release                # Android APK
flutter build appbundle --release          # Android App Bundle
flutter build ios --release --no-codesign  # iOS (unsigned; signing handled by Xcode)
flutter build web --release                # Web SPA (experimental — not the primary target)

# Trigger phone-as-Engine mode (after UI button or automatic on Engine-Only config)
adb shell am start -n com.ibloc.shadow/.MainActivity

# Discover the phone from a Linux machine
avahi-browse -rt _shadow._tcp

# Tail mobile logs
adb logcat | grep shadow
```

## BUILD TARGETS

| Target | Output | Notes |
|---|---|---|
| Android (APK / App Bundle) | `build/app/outputs/{apk,flutter-apk,bundle}/*` | Primary target; on-device MNN / LiteRT for offline inference |
| iOS | `build/ios/iphoneos/Runner.app` | Secondary target; requires Apple Developer account |
| Web (experimental) | `build/web/` | No native inference; routes everything through telencephalon or prefrontal HTTP |

## CODE HEALTH

```
$ dart analyze
100 issues found.   # 0 errors, 100 info-level (deprecation warnings + avoid_print + use_null_aware_elements)
```

No errors, no warnings — only style-level info issues (deprecated `value` / `activeColor` form-field props, stray `print()` calls in services, null-check patterns that could use `?.` shorthand).

## STATE STATUS (2026-07-19)

**Completed** ✅ (recent additions marked 🆕):
- 🆕 **Telencephalon client** (`lib/services/cortex/cortex_client.dart`, ~814 lines after 2026-09-27 migration) — wired for agents / conversations / flows / drafts / agent mirror / import-session-as-conversation; all of Sprint 1+2 surface
- 🆕 **FlowsScreen** (`lib/screens/flows_screen.dart` + commit `55ffc95`) — browse / run telencephalon flows from the phone
- 🆕 **continue-on-desktop via telencephalon only** (`dacbe83`) — chat sessions hand off to a desktop telencephalon without falling back to prefrontal
- 🆕 **telencephalon-embedded neuron+hippocampus paths** (`05aa697`) — all hardcoded URLs updated to the telencephalon-embedded model (`:60080/hippocampus/api/...`)
- **VAD-driven barge-in** via `audio_ws_service.dart` + `wake_word_service.dart`（Companion Mode 的 WebRTC 那部分已于 2026-10-28 作为死代码删除，见 §COMPANION MODE）
- **Mobile sub-agent** (`lib/agents/mobile_action_agent/`) — AccessibilityController-driven UI automation as a telencephalon-flow tool
- **A2A message types + client** (`lib/agents/a2a/`) — outbound A2A delegation to other telencephalon / prefrontal instances
- **Main agent** (`lib/agents/main_agent/`) — system prompt + tool registry; runs locally in Standalone mode
- **Multimodal input** — audio / image / file via `lib/multimodal/`, including `video_frame_collector.dart` for camera-streaming
- **Wake-word detection** — `wake_word_service.dart` for "Hey Shadow"-style invocation
- **Session transfer** — `session_transfer_service.dart` + `SessionExport` for cross-device handoff
- **Soul agent persistence** — `soul_service.dart` for user-persona state
- **Model downloader** — delegates to neuron's `/v1/models/pull` via `model_download_service.dart` + `model_download_provider.dart`
- **mDNS discovery** — `mdns_discovery.dart` for `_shadow._tcp` browsing + `group_service.dart` for mTLS trust
- **i18n** — `app_en.arb` + `app_zh.arb` with `flutter_localization_linter` enforcement
- **Database layer** — `lib/services/database/` with repositories for agents / MCP servers / skills / models
- **Agent review** — `agent_review_service.dart` for approve / reject draft flows
- **Voice conversation screen** — `lib/screens/voice_conversation_screen.dart` for hands-free mode
- **Phone-as-Engine mode** (`OpenAIServer.kt` on port 8085, SSE streaming, bridged to `LitertEngine` via `EngineProvider`, mDNS `_shadow._tcp` advertisement with capabilities TXT records)
- **Engine Platform Channel** `com.ibloc.shadow/engine` (startServer/stopServer/isServerRunning/getServerUrl/getApiKey/setApiKey/setAuthEnabled/getServiceName)
- **Network security config** permitting cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)
- **LiteRT init timeout + model-dir diagnosis** — was hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing

**In Progress** 🔄:
- Offline-first chat — main_agent can run locally for trivial replies but anything non-trivial still requires telencephalon or neuron HTTP
- **v2.5 — shadow-esp32 BLE provisioning flow** is wired (Kotlin + Dart) but the live-streaming screen doesn't yet auto-discover a shadow-esp32 over BLE; v2.6 adds an `onAttach` hook that opens the provisioning screen when the user plugs the device in
- **v2.5 — USB Audio routing** is wired at the platform-channel level (UsbAudioRouter.kt + usb_audio_routing_service.dart); the actual `setMode(MODE_NORMAL) / isSpeakerphoneOn = false / preferredDevice` calls land in v2.6 once the live-streaming screen flips them on user-tap
- **Provisioning — security** — SSID/PSK travel over BLE cleartext in v2.5; v2.6 enables BLE bonding + MITM protection to encrypt the GATT writes

**Planned** 📋:
- Companion Mode (WebRTC) 重做 —— 原实现已作为死代码删除（见 §COMPANION MODE）；重做时直接用 `TelencephalonClient.webrtcSignalingUrl()`
- Hot reload of telencephalon flows into the FlowsScreen without app restart (currently requires re-fetch via `flow_provider`)
- Voice wake word integration hardening
- ESP32 / hardware device pairing (per `2026-06-04-shadow-architecture-redesign.md` Phase 6)
- Voice cloning on mobile (per platform-wide v0.9+ backlog)
- A2UI streaming on mobile (genui_a2ui 0.7 already declared; widgets not yet wired)
- Battery-aware inference scheduling (throttle MNN / LiteRT when device is unplugged or below 20% battery)
- ~~Prefrontal mobile (as library, not server) via Tauri embedding or FFI~~ — **DONE as A2A** (`c5812a3`); FFI scaffolding removed

## RELATED PROJECTS

| Project | Path | Role |
|---|---|---|
| Shadow umbrella | `https://github.com/iBLOC/shadow` | Container for mobile + desktop |
| Shadow-Desktop | `https://github.com/iBLOC/shadow/shadow-desktop` | Sibling Layer 4 client (Tauri + React) |
| Prefrontal | `https://github.com/iBLOC/prefrontal` | Layer 3 (Agent) — used as fallback when telencephalon unavailable |
| **Telencephalon** | `https://github.com/iBLOC/telencephalon` | **Layer 3.5 (Orchestrator) — primary HTTP target** |
| Hippocampus | `https://github.com/iBLOC/hippocampus` | Layer 0 (Memory) — reached via telencephalon on `:60080/hippocampus` |
| neuron | [github.com/ibloc/neuron](https://github.com/ibloc/neuron) | Layer 2 (Engine) — on-device MNN / LiteRT, plus remote `:8085` HTTP |
| Resonance | `https://github.com/iBLOC/resonance` | Layer 5 (Cross-user orchestration) — discovered via mDNS but mobile does not currently push tasks |

## ENVIRONMENT VARIABLES (mobile build-time)

```bash
# Optional — only needed when targeting a specific telencephalon / prefrontal in dev
export TELE_ULR="http://localhost:60080"        # default in production: discovered via mDNS (port unified 2026-09, was :8443)
export PREFRONTAL_HOST="http://localhost:8082"     # fallback only — `dacbe83` removed automatic fallback

# Model download defaults
export NEURON_DEFAULT_SOURCE="modelscope"           # mobile's `model_download_provider.dart` defaults to ModelScope
export HF_TOKEN="..."                                # for gated HuggingFace repos
export MODELSCOPE_TOKEN="..."                       # for gated ModelScope repos
```

## E2E COVERAGE (audit 2026-09-25)

Per [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md), mobile's e2e coverage is held back by:

- **Silent skip pattern** in `integration_test/*.dart`: `api_flow_test.dart`, `memory_flow_test.dart`, `group_flow_test.dart`, `model_share_test.dart` all start with `isPrefrontalRunning()` and `return;` on false. **No CI matrix boots prefrontal** before these.
- **Stub app context** in `app_test.dart`, `conversation_flow_test.dart`, `task_flow_test.dart`: `app.main()` runs against a stub context with **no live Telencephalon client**.
- **No real-telencephalon e2e**: `cortex_client_test.dart` uses `http_testing.MockClient` only — no real `:60080` exercise.
- **Zero BLE / USB / InCallService e2e**: `com.ibloc.shadow/{ble_provision,usb_audio,call_state}` channels all uncovered.
- **Zero Live Stream / Customer Service e2e**: `/livestream` and `/customer-service` modes uncovered.

Sibling desktop has the same shape — see E2E assessment §3.6-3.9 for the desktop-side gaps.

## Commits (mobile-only, last 10)

| Hash | Description |
|------|-------------|
| (v2.5) | feat(mobile): BLE provisioning of shadow-esp32 + USB Audio routing for digital-human livestream PoC; complements shadow-esp32 v2.4/v2.5; `BleProvisioningService.kt` + `UsbAudioRouter.kt`; Dart `ble_provisioning_service.dart` + `usb_audio_routing_service.dart` + `provisioning_screen.dart`; new channels `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` |
| 05aa697 | feat(shadow-mobile): update all paths to cortex-embedded neuron+hippocampus |
| dacbe83 | feat(mobile): continue-on-desktop uses cortex only (no prefrontal fallback) |
| 55ffc95 | feat(mobile): add FlowsScreen for browsing/running cortex flows |
| (older — see git log) | Cortex client wiring (Sprint 1+2); main_agent + mobile_action_agent split; WebRTC companion mode; wake-word service; multimodal input; session transfer |

> The mobile project shares its git repository with shadow-desktop (`https://github.com/iBLOC/shadow/.git`), so commits are interleaved. Filter with `git log --author ...` or by `feat(mobile)` / `feat(shadow-mobile)` prefix.