# PROJECT KNOWLEDGE BASE — shadow-mobile

**Updated:** 2026-09-25 (post-audit-cycle: telencephalon-centric view confirmed; port `:60080` unified; references [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md))
**Project:** shadow-mobile (Layer 4 Interaction + thin on-device Engine via Kotlin Native)

> **Note (2026-07-19)**: This doc was previously framed as a "Layer 4 + Layer 2 hybrid" with 3 user-configurable modes. That framing predates **Telencephalon** (Layer 3.5). Current architecture: mobile is **primarily Layer 4** (Flutter UI); the on-device inference capability lives in the **Kotlin Native** layer (OpenAIServer.kt + LiteRT/MNN), exposed as a sidecar HTTP server on `:8085` when the user opts in. The default mobile flow routes everything through **telencephalon** (`:60080`).

## ARCHITECTURAL ROLE

Shadow-Mobile is the **Interaction Layer (Layer 4)** mobile client of the Shadow Platform. It is a **thin UI client** that talks to:

- **Agent Orchestrator (Telencephalon, Layer 3.5)** via `/api/telencephalon/*` — **primary** path; the mobile app routes most agent / flow / MCP / conversation / discovery operations through telencephalon
- **Agent Layer (Prefrontal)** via OpenAI `/v1/*` and A2A — **fallback** when telencephalon unreachable (note: `dacbe83` removed automatic fallback for `continue-on-desktop`)
- **Local inference** via Kotlin `OpenAIServer.kt` (MNN / LiteRT bindings) on `:8085` when in **Phone-as-Engine** opt-in mode

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The mobile app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via `/v1/audio/speech` response)
4. Captures mic audio (WebRTC for Companion Mode + VAD-driven `audio_ws_service`)
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
│   │   ├── prefrontal/                  # Mobile wrappers around prefrontal (7 files)
│   │   ├── database/                    # SQLite repositories (11 files)
│   │   ├── genui/                       # GenUI server helpers (Agent2UI)
│   │   ├── audio_ws_service.dart        # WebSocket audio streaming (VAD-driven)
│   │   ├── webrtc_companion.dart        # flutter_webrtc + WS signaling (196 LOC)
│   │   ├── webrtc_signaling.dart        # SDP / ICE offer-answer bookkeeping
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
│   │   └── prefrontal_client.dart       # HTTP client to prefrontal :8082 (fallback)
│   ├── providers/                       # Riverpod state (14 providers)
│   │   ├── ai/                          # AI-specific providers (model registry, embeddings)
│   │   ├── cortex_provider.dart
│   │   ├── chat_provider.dart / conversation_mode_provider.dart / companion_mode_provider.dart
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

// WebRTC (Companion Mode — flutter_webrtc + WS signaling)
POST {host}/api/sessions/{id}/webrtc/offer  → { sdp: answer, ice: ... }

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard
```

## TELENCEPHALON-SPECIFIC ENDPOINTS (Sprint 1+2)

`lib/services/cortex/cortex_client.dart` (~814 lines after 2026-09-27 telencephalon migration) is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontal_client.dart` against the telencephalon `/v1/*` shim).

```dart
// === Health / discovery ===
Future<Map<String, dynamic>> health()                  // GET /.well-known/agent.json
Future<AgentsResponse>    listAgents()                 // GET /api/telencephalon/agents
Future<Map<String, dynamic>> getAgent(String name)     // GET /api/telencephalon/agents/{name}
Future<Map<String, dynamic>> getAgentMirror(...)       // GET /api/telencephalon/agents/mirror

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
//   - open WS ws://host:60080/api/webrtc/... for companion mode
```

Persist discovered hosts in `preferences` (or SQLite via `group_service.dart`); the user can pin favourites on the Group page (`group_screen.dart`).

## COMPANION MODE (WebRTC + flutter_webrtc)

`lib/services/webrtc_companion.dart` (196 LOC) wires `flutter_webrtc` to telencephalon's WebRTC endpoint:

```
flutter_webrtc (RTCPeerConnection + getUserMedia)
       ↕ SDP/ICE (W3C WebRTC)
WebRtcSignaling (WebSocket over /api/sessions/{id}/ws)
       ↕ webrtc_offer / webrtc_answer / webrtc_ice
Telencephalon webrtc (ModalityRouter + SRTP relay, Opus 48kHz, VAD, Agent.process)
       ↕ A2A / OpenAI /v1/* / etc.
```

State machine (`WebRtcPhase` in `companion_mode_provider.dart`):
- `idle → connecting → signaling → negotiating → connected → speaking`
- `error` is terminal until `stop()` is called.

VAD events (`vad_state` messages) drive `voiceState: idle | listening | speaking | bargeIn`.
Barge-in (user starts talking while agent is mid-response) is signalled via `webrtc_barge_in` and resets the agent.

> For the message-style **Conversation Mode** (one-shot voice messages over WebSocket, not real-time), use `conversation_mode_provider` + `AudioWsService` instead. That path stays for low-bandwidth or text-with-voice-attach workflows; the WebRTC path is the real-time Companion Mode.

## AGENTS (in-process)

`lib/agents/` hosts three runtimes + their providers:

| Subdir | Files | Role |
|---|---|---|
| `a2a/` | `a2a_client.dart` / `a2a_message.dart` / `a2a_server.dart` | A2A message types + client (outbound HTTP to other telencephalon / prefrontal / external) + server stub |
| `main_agent/` | `main_agent.dart` / `main_agent_prompt.dart` / `main_agent_tools.dart` | Primary chat orchestrator; system prompt + tool registry; runs on-device in Standalone mode |
| `mobile_action_agent/` | `actions.dart` / `mobile_action_agent.dart` / `mobile_actions_tools.dart` / `mobile_actions_viewmodel.dart` | Sub-agent that calls `AccessibilityController` to tap / swipe / type on Android UI elements |
| `providers/` | `agent_provider.dart` | Riverpod glue |

The `main_agent` is intentionally thin — for any non-trivial task (file ops, code edits, browser automation), it delegates to a **telencephalon flow** via `CortexClient.runFlow(...)`. The `mobile_action_agent` is one of the few exceptions (it must run on-device because it touches the Android Accessibility API).

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
| `com.ibloc.shadow/engine` | Phone-as-Engine OpenAI server: `startServer` / `stopServer` / `isServerRunning` / `getServerUrl` / `getApiKey` / `setApiKey` / `setAuthEnabled` / `getServiceName` |
| `com.ibloc.shadow/ble_provision` | **v2.5** — `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** — `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |

## MULTIMODAL INPUT

`lib/multimodal/` wraps three input channels:
- `audio_input_handler.dart` — mic capture via `record` package; PCM chunks → `pcm_audio_recorder.dart`
- `image_input_handler.dart` — `image_picker` + `camera`; feeds `video_frame_collector.dart` for streaming
- `file_input_handler.dart` — `file_picker`; uploads to telencephalon via `CortexClient`

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
- flutter_webrtc 1.4.1 for WebRTC
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
- **Companion Mode (WebRTC)** — `webrtc_companion.dart` (196 LOC) + `webrtc_signaling.dart` + VAD-driven barge-in via `audio_ws_service.dart` + `wake_word_service.dart`; mirrors desktop `webrtcCompanion.ts` so the two clients share the same end-to-end protocol
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
- WebRTC full DTLS-SRTP handshake on the mobile side — currently relies on telencephalon to handle encryption; mobile only deals with plain RTP via flutter_webrtc's default stack
- Offline-first chat — main_agent can run locally for trivial replies but anything non-trivial still requires telencephalon or neuron HTTP
- **v2.5 — shadow-esp32 BLE provisioning flow** is wired (Kotlin + Dart) but the live-streaming screen doesn't yet auto-discover a shadow-esp32 over BLE; v2.6 adds an `onAttach` hook that opens the provisioning screen when the user plugs the device in
- **v2.5 — USB Audio routing** is wired at the platform-channel level (UsbAudioRouter.kt + usb_audio_routing_service.dart); the actual `setMode(MODE_NORMAL) / isSpeakerphoneOn = false / preferredDevice` calls land in v2.6 once the live-streaming screen flips them on user-tap
- **Provisioning — security** — SSID/PSK travel over BLE cleartext in v2.5; v2.6 enables BLE bonding + MITM protection to encrypt the GATT writes

**Planned** 📋:
- iOS companion-mode parity (current focus is Android; iOS WebRTC works but accessory flows need re-testing on a physical device)
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