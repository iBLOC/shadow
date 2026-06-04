# android/app/src/main/kotlin/com/ibloc/shadow/ - Android Native (Layer 2 Engine)

## OVERVIEW

Kotlin native code that implements the **Layer 2 (Engine)** of the 4-layer Shadow platform when the app runs in "Engine" mode. Hosts the on-device LLM (LiteRT) and exposes it as an OpenAI-compatible HTTP server over mDNS so any Layer 3 (Prefrontal) agent on the LAN can consume it.

Also handles UI automation (AccessibilityService) and a low-level Mobile Action HTTP server.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Main Activity | `MainActivity.kt` | Hosts all Platform Channels; starts Engine + registers mDNS |
| OpenAI-compatible HTTP server | `mnn/OpenAIServer.kt` | `/v1/chat/completions`, `/v1/models` |
| Server manager | `mnn/OpenAIServerManager.kt` | Default port 8085, API key auth, SSE streaming |
| LiteRT LLM engine | `litert/LitertEngine.kt` | Google AI Edge LiteRT LM. Has `initializeWithTimeout` + `diagnoseModelDirectory` to avoid hangs |
| Audio recording | `pcm/PcmAudioRecorder.kt` | 16kHz PCM via Platform Channel + EventChannel |
| TTS | `tts/TtsManager.kt` | Android native TTS |
| Accessibility (UI automation) | `PrefrontalAccessibilityService.kt` | `dispatchGesture` for tap/swipe |
| Mobile Action HTTP | `http/MobileActionServer.kt` | `/api/mobile/action` (NanoHTTPD) |
| Network security config | `res/xml/network_security_config.xml` | Permits cleartext to localhost/LAN for dev |

## ARCHITECTURAL ROLE

```
Mobile App
├── Flutter UI (Layer 4 — Interaction)         → calls Prefrontal over HTTP
└── Kotlin native (Layer 2 — Engine)           ← WE ARE HERE
    ├── LitertEngine (LLM inference)
    ├── OpenAIServer (HTTP + SSE)
    └── mDNS _shadow._tcp advertisement
```

The phone can run in three modes:
| Mode | What runs |
|---|---|
| **Standalone** | Flutter UI calls in-process Kotlin via PlatformChannel; OpenAIServer not started |
| **UI Only** | Flutter UI calls a remote Prefrontal; OpenAIServer not started |
| **Engine Only** | Flutter UI hidden; Kotlin starts OpenAIServer on :8085 + mDNS, Prefrontal on desktop consumes the phone's LLM |

## PLATFORM CHANNELS (registered in `MainActivity.configureFlutterEngine`)

| Channel name | Direction | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | ⇅ | Load / infer / diagnose LiteRT model |
| `com.ibloc.shadow/engine` | ⇅ | Start/stop OpenAIServer, mDNS, auth, port config |
| `com.ibloc.shadow/tts` | ⇅ | Android TTS control |
| `com.ibloc.shadow/pcm_audio` | → | Start/stop 16kHz PCM recording |
| `com.ibloc.shadow/pcm_audio_stream` | ← | EventChannel: PCM chunks to Dart |
| `com.ibloc.shadow/mdns` | ⇅ | Discover + resolve `_shadow._tcp` services |
| `com.ibloc.shadow/mnn_logs` | ← | EventChannel: logcat streaming |
| `com.ibloc.shadow/accessibility` | ⇅ | A11Y service queries + settings deep-link |
| `com.ibloc.shadow/http_server` | ⇅ | MobileActionServer start/stop |

## ANTI-PATTERNS

- ❌ **Don't call `LitertEngine.initialize()` without a timeout** — historically the native library hangs forever when the model dir is empty or missing the dispatch library. Always use `initializeWithTimeout()` (10s default) and call `diagnoseModelDirectory()` first to bail fast with a `recommendation: "download"` so the UI can show the model-download dialog.
- ❌ **Don't hard-code model paths** — read from `Environment.getExternalStorageDirectory()` or app-private `filesDir`.
- ❌ **Don't access PrefrontalAccessibilityService.instance off the main thread** — wrap in `Handler(Looper.getMainLooper())`.

## CONVENTIONS

- MethodChannel prefix: `com.ibloc.shadow/`
- Engine server port: **8085** (configurable via `startServer` arg)
- Accessibility service must be declared in `AndroidManifest.xml`
- Gestures use `dispatchGesture` (NOT `AccessibilityNodeInfo.performAction` for raw touch coords)
- HTTP server is `ServerSocket`-based (`OpenAIServer.kt`) with a small custom JSON parser. Do not pull in OkHttp just for the server; only the Dart side uses OkHttp.
- mDNS service type: `_shadow._tcp.` (note the trailing dot — NSD requires it)

## INBOUND PROTOCOL (what we expose when Engine is running)

```
POST /v1/chat/completions     # body: {model, messages, stream}
                              # stream: SSE with OpenAI format
GET  /v1/models               # returns { object: "list", data: [{ id: "litert-local", ... }] }
```

Authorization: `Authorization: Bearer <random-key>` header (printed to logcat at startup, exposed to Flutter via `getApiKey`).

## OUTBOUND PROTOCOL (how the app discovers other nodes)

`mdns_discovery` Platform Channel queries `_shadow._tcp` and returns:
```dart
[{ "name": "...", "host": "192.168.1.42", "port": 8085, "txtRecords": { "type": "engine", "capabilities": "llm,asr,tts", ... } }]
```

## NOTES

- **arm64-v8a only** (LiteRT + MNN are heavy)
- JNI bridge: `cpp/mnn_bridge.cpp` (for MNN; LiteRT is pure Kotlin via `litertlm-android` Maven artifact)
- Minimum Android 7.0 (API 24) for TTS, 8.0 (API 26) for foreground services
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17
- See top-level `shadow-mobile/AGENTS.md` for how this Kotlin layer integrates with the Flutter UI.
