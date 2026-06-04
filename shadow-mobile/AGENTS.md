# PROJECT KNOWLEDGE BASE

**Updated:** 2026-06-04
**Project:** shadow-mobile (Layer 4 Interaction + Layer 2 Engine hybrid)

## ARCHITECTURAL ROLE

Shadow-Mobile is BOTH:
- **Layer 4** (Interaction): Flutter UI for the user
- **Layer 2** (Engine): Kotlin Native + LiteRT/MNN for on-device LLM/VLM

This dual role is what makes Mobile special: it can run as a **standalone LLM Engine** for desktop/server agents, while also being a UI client.

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## HYBRID MODE

The phone can operate in 3 modes (user-configurable):

| Mode | Layer 4 | Layer 2 | Description |
|---|---|---|---|
| **Standalone** | Flutter UI | MNN/LiteRT in-process | One app, all layers, no network |
| **UI Only** | Flutter UI | (use remote) | Phone is just UI, desktop is Agent+Engine |
| **Engine Only** | (hidden) | Kotlin HTTP server | Phone runs LLM, exposes `/v1/*` for desktop |

## STRUCTURE

```
shadow-mobile/
├── lib/                              # Flutter (Layer 4 UI)
│   ├── main.dart                     # App entry
│   ├── router/                       # GoRouter (10 routes)
│   ├── screens/                      # 10 pages
│   │   ├── chat_screen.dart          # Chat + Companion Mode
│   │   ├── task_board_screen.dart
│   │   ├── conversation_screen.dart
│   │   ├── agents_screen.dart
│   │   ├── model_management_screen.dart
│   │   ├── mcp_screen.dart
│   │   ├── skills_screen.dart
│   │   ├── memory_screen.dart
│   │   ├── providers_screen.dart
│   │   └── settings_screen.dart
│   ├── providers/                    # Riverpod
│   │   ├── chat_provider.dart        # LLM state + LiteRT
│   │   ├── companion_mode_provider.dart  # NEW: WebRTC companion
│   │   ├── conversation_mode_provider.dart # NEW: voice conversation
│   │   └── model_download_provider.dart
│   ├── services/                     # Service layer
│   │   ├── prefrontal_client.dart    # HTTP to Prefrontal Agent
│   │   ├── model_download_service.dart
│   │   ├── audio_ws_service.dart     # WebSocket audio streaming
│   │   ├── video_frame_collector.dart
│   │   ├── mdns_discovery.dart
│   │   └── accessibility_controller.dart
│   ├── multimodal/                   # Image / Audio / Video input
│   │   ├── multimodal_input_manager.dart
│   │   ├── audio_input_handler.dart  # PcmAudioRecorder (16kHz)
│   │   ├── image_input_handler.dart
│   │   └── video_input_handler.dart
│   ├── mnn_engine.dart               # Dart MNN binding
│   ├── litert_engine.dart            # Dart LiteRT binding
│   └── ...
└── android/                          # Android Native (Layer 2)
    └── app/src/main/
        ├── kotlin/com/ibloc/shadow/
        │   ├── MainActivity.kt       # Platform Channels
        │   ├── PrefrontalAccessibilityService.kt
        │   ├── litert/
        │   │   └── LitertEngine.kt   # Google AI Edge LiteRT
        │   ├── mnn/                  # MNN wrapper
        │   ├── pcm/PcmAudioRecorder.kt  # 16kHz PCM recording
        │   ├── tts/TtsManager.kt
        │   ├── http/MobileActionServer.kt
        │   └── ...
        └── cpp/                      # C++ JNI bridge
            ├── mnn_bridge.cpp
            └── CMakeLists.txt
```

## INBOUND PROTOCOLS (calls Prefrontal)

All HTTP to standard OpenAI endpoints:

```dart
// LLM Chat
POST {prefrontalUrl}/v1/chat/completions

// TTS
POST {prefrontalUrl}/v1/audio/speech

// ASR
POST {prefrontalUrl}/v1/audio/transcriptions

// Sessions + WebSocket
POST {prefrontalUrl}/api/sessions
WS   {prefrontalUrl}/api/sessions/{id}/ws

// WebRTC
POST {prefrontalUrl}/api/sessions/{id}/webrtc/offer
```

## OUTBOUND PROTOCOLS (when Mobile is Engine)

The phone's Kotlin native should expose an HTTP server with OpenAI endpoints:

```
POST /v1/chat/completions    # Delegates to LiteRT.generateContent()
GET  /v1/models              # Lists installed .litertlm files
```

This allows a desktop/Prefrontal agent to call `http://mobile.local:8085/v1/chat/completions` and use the phone's local LLM.

(Planned for Phase 3)

## COMPANION MODE

Implemented as a **Riverpod-driven** state machine (`companion_mode_provider.dart`)
backed by real WebRTC peer connections:

```
flutter_webrtc (RTCPeerConnection + getUserMedia)
       ↕ SDP/ICE (W3C WebRTC)
WebRtcSignaling (WebSocket over /api/sessions/{id}/ws)
       ↕ webrtc_offer / webrtc_answer / webrtc_ice
Prefrontal webrtc_handler (webrtc-rs, Opus 48kHz, earshot VAD, Agent.process)
       ↕ A2A / OpenAI /v1/* / etc.
```

State machine (`WebRtcPhase`):
- `idle → connecting → signaling → negotiating → connected → speaking`
- `error` is terminal until `stop()` is called.

VAD events (`vad_state` messages) drive `voiceState: idle | listening | speaking | bargeIn`.
Barge-in (user starts talking while agent is mid-response) is signalled via
`webrtc_barge_in` and resets the agent.

> **For the message-style Conversation Mode (one-shot voice messages over
> WebSocket, not real-time), use `conversation_mode_provider` + `AudioWsService`
> instead. That path stays for low-bandwidth or text-with-voice-attach
> workflows; the WebRTC path is the real-time Companion Mode.

## PLATFORM CHANNELS (Flutter ↔ Kotlin)

| Channel | Purpose |
|---|---|
| `com.ibloc.shadow/litert` | LiteRT model load + inference |
| `com.ibloc.shadow/mnn` | MNN model load + inference |
| `com.ibloc.shadow/tts` | Android TTS engine |
| `com.ibloc.shadow/accessibility` | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | Network discovery |
| `com.ibloc.shadow/mnn_logs` | Logcat streaming |
| `com.ibloc.shadow/pcm_audio` | Audio recording control |
| `com.ibloc.shadow/pcm_audio_stream` | Audio data stream (EventChannel) |
| `com.ibloc.shadow/http_server` | Mobile action server |

## CONVENTIONS

- Flutter 3.11+
- Riverpod for state
- GoRouter for navigation
- flutter_genui for Agent2UI (planned)
- MNN + LiteRT (with CPU/Neural Accelerators)
- Android only (iOS stub)
- mTLS for secure communication
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17

## STATE STATUS (2026-06-04)

**Completed** ✅:
- Flutter UI with 10 pages
- Riverpod providers for state
- MNN + LiteRT integration
- Companion Mode (Riverpod state machine) — WebSocket audio streaming
- Audio recording via Platform Channel
- mDNS discovery
- mTLS group manager
- Model download from ModelScope/HF
- **LiteRT init timeout + model-dir diagnosis** (was hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing)
- **Phone-as-Engine mode** (`OpenAIServer.kt` on port 8085, SSE streaming, bridged to `LitertEngine` via `EngineProvider`, mDNS `_shadow._tcp` advertisement with capabilities TXT records)
- **Engine Platform Channel** `com.ibloc.shadow/engine` (startServer/stopServer/isServerRunning/getServerUrl/getApiKey/setApiKey/setAuthEnabled/getServiceName)
- **Network security config** permitting cleartext to localhost / 127.0.0.1 / 10.0.2.2 / *.local (dev only)
- **Companion Mode WebRTC** (`lib/services/webrtc_companion.dart` + `webrtc_signaling.dart` + rewritten `companion_mode_provider.dart`): real RTCPeerConnection via `flutter_webrtc`, getUserMedia mic capture, SDP/ICE exchange over the existing Prefrontal WebSocket, Opus codec auto-negotiated with Prefrontal's `webrtc_handler.rs`, VAD-driven voice state, barge-in signaling, RTCVideoRenderer for remote TTS playback. Mirrors the desktop `webrtcCompanion.ts` so the two clients share the same end-to-end protocol.

**In Progress** 🔄:
- (no current in-progress items)

**Planned** 📋:
- Voice wake word
- ESP32 / hardware device pairing (per `2026-06-04-shadow-architecture-redesign.md` Phase 6)
- Prefrontal mobile (as library, not server) via Tauri embedding or FFI

## COMMANDS

```bash
flutter run
flutter build apk --debug
flutter analyze
adb logcat | grep shadow
# Trigger phone-as-Engine mode (after UI button or automatic on Engine-Only config)
adb shell am start -n com.ibloc.shadow/.MainActivity
# Discover the phone from a Linux machine
avahi-browse -rt _shadow._tcp
```
