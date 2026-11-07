# android/app/src/main/kotlin/com/ibloc/shadow/ - Android Native

## OVERVIEW

Kotlin native code for the **mobile app's platform layer**. It hosts the
**device bridges** (TTS, PCM recording, USB audio routing, accessibility,
BLE provisioning, device data) and the **embedded brain runtime host**
(`EncephalonRuntime.kt`).

⚠️ **推理不在这层**（2026-11-08 用户拍板）：本地权重与云端供应商的推理
**归 neuron 管** —— 请求体进进程内 adapter 管线（`EncephalonRuntime`
的 `infer` ⇒ `/v1/chat/completions`，OpenAI 兼容）。这一层**不再有**
本地推理实现（LiteRT 面已删除）。

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Main Activity | `MainActivity.kt` | Hosts all Platform Channels |
| 大脑运行时宿主 | `EncephalonRuntime.kt` | 起停 `libencephalon.so`；进程内推理通道 |
| Audio recording | `pcm/PcmAudioRecorder.kt` | 16kHz PCM via Platform Channel + EventChannel |
| TTS | `tts/TtsManager.kt` | Android native TTS |
| Accessibility (UI automation) | `PrefrontalAccessibilityService.kt` | `dispatchGesture` for tap/swipe |
| USB audio routing | `audio/UsbAudioRouter.kt` | shadow-esp32 路由 |
| BLE provisioning | `provision/BleProvisioningService.kt` | 设备配网 |
| Device data bridge | `device/DeviceDataBridge.kt` | 日历 / 联系人 / 短信 / 相册 |
| Network security config | `res/xml/network_security_config.xml` | Permits cleartext to localhost/LAN for dev |

## ARCHITECTURAL ROLE

```
Mobile App
├── Flutter UI (Layer 4 — Interaction)
└── Kotlin native (this layer)
    ├── EncephalonRuntime → libencephalon.so（thalamus + ACP + telencephalon + neuron）
    ├── TTS / PCM / USB audio / a11y / BLE / device data
    └── mDNS 发现（找局域网里的其它节点）
```

## PLATFORM CHANNELS (registered in `MainActivity.configureFlutterEngine`)

| Channel name | Direction | Purpose |
|---|---|---|
| `com.ibloc.shadow/encephalon_runtime` | ⇅ | 大脑运行时：起停 / 状态 / **进程内推理** / 路由下发 / 账号导出 |
| `com.ibloc.shadow/tts` | ⇅ | Android TTS control |
| `com.ibloc.shadow/pcm_audio` | → | Start/stop 16kHz PCM recording |
| `com.ibloc.shadow/pcm_audio_stream` | ← | EventChannel: PCM chunks to Dart |
| `com.ibloc.shadow/mdns` | ⇅ | Discover + resolve `_shadow._tcp` services |
| `com.ibloc.shadow/mnn_logs` | ← | EventChannel: 进程内 AppLog 流（**通道名沿用旧名**，两侧约定一致即可） |
| `com.ibloc.shadow/accessibility` | ⇅ | A11Y service queries + settings deep-link |
| `com.ibloc.shadow/ble_provision` | ⇅ | BLE 配网 |
| `com.ibloc.shadow/usb_audio` | ⇅ | USB 音频路由 |
| `com.ibloc.shadow/device_data` | ⇅ | 日历 / 联系人 / 短信 / 相册 |

⚠️ **已删除的通道**（2026-11-07/08 退役）：`litert`（本地推理）、
`engine`（OpenAI 兼容 HTTP 面）`http_server`（MobileActionServer）
—— 三个的后端都随 LiteRT/MNN 退役出仓。

## ANTI-PATTERNS

- ❌ **Don't add a local inference implementation in this layer** —— 推理
  归 neuron（`EncephalonRuntime.infer`）。再加一个本地引擎 ⇒ 两个真相
  源 ⇒ 「用哪个模型」说不清。
- ❌ **Don't access PrefrontalAccessibilityService.instance off the main thread** —— wrap in `Handler(Looper.getMainLooper())`.
- ❌ **Don't hard-code model paths** —— 模型目录与路由由大脑管（`/models/providers`）。

## CONVENTIONS

- MethodChannel prefix: `com.ibloc.shadow/`
- Accessibility service must be declared in `AndroidManifest.xml`
- Gestures use `dispatchGesture` (NOT `AccessibilityNodeInfo.performAction` for raw touch coords)
- mDNS service type: `_shadow._tcp.` (note the trailing dot — NSD requires it)

## OUTBOUND PROTOCOL (how the app discovers other nodes)

`mdns_discovery` Platform Channel queries `_shadow._tcp` and returns:
```dart
[{ "name": "...", "host": "192.168.1.42", "port": 8085, "txtRecords": { ... } }]
```

## NOTES

- **arm64-v8a only**（大脑运行时是重 native 库）
- Minimum Android 7.0 (API 24) for TTS, 8.0 (API 26) for foreground services
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17
- See top-level `shadow-mobile/AGENTS.md` for how this Kotlin layer integrates with the Flutter UI.
