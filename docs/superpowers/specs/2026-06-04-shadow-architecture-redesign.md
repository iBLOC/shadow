# Shadow 平台架构重构 (2026-06-04)

## 背景

Shadow 是一个分布式 AI 用户分身系统，由多个独立项目组成。本次重构目的是把当前的"应用+服务"混合形态，演进为**清晰的 4 层架构**，每一层都通过**标准协议**解耦，从而支持：

1. 跨平台客户端（Flutter Desktop/Web、React/Tauri Desktop、ESP32、未来嵌入式设备）
2. 跨服务部署（手机/电脑/服务器任意节点都能成为 Agent、Engine 或 Storage）
3. 跨服务 A2A 调用（不同物理节点的 Agent 互相对话）
4. 灵活的资源组合（手机只跑 LLM，电脑只跑 TTS，服务器做 Agent 编排）

## 4 层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Interaction Layer (交互层)                        │
│  - Flutter (Shadow-Mobile)                                  │
│  - React + Tauri (Shadow-Desktop)                           │
│  - Web (未来)                                                │
│  - ESP32 + LCD (未来硬件设备)                                │
│  - Telegram/Discord/Slack (Channel 适配器)                   │
│                                                              │
│  协议:                                                        │
│  - OpenAI /v1/chat/completions (主对话)                     │
│  - OpenAI /v1/audio/speech (TTS)                            │
│  - OpenAI /v1/audio/transcriptions (ASR)                    │
│  - WebRTC SDP/ICE (实时语音, Companion Mode)                │
│  - A2A /.well-known/agent.json + /a2a/tasks (Agent 调用)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Agent Layer (智能体编排层)                         │
│  - Prefrontal (Rust, cross-platform core lib)                │
│  - 单一 crate 可嵌入任何 Rust 应用，也可独立运行             │
│                                                              │
│  职责:                                                        │
│  - Session 管理、对话上下文                                  │
│  - Tool/Skill 调度、MCP 集成                                 │
│  - 跨服务 A2A 调度                                           │
│  - 工作流引擎                                                │
│  - 记忆系统接口（实际存储由 Storage Layer 提供）             │
│                                                              │
│  对上层:                                                      │
│  - 暴露标准 OpenAI API (compatibility 模式)                 │
│  - 暴露 A2A 协议                                             │
│  - 暴露 WebSocket / SSE 流式接口                            │
│                                                              │
│  对下层:                                                      │
│  - 通过标准 OpenAI /v1/* 调用 LLM/TTS/ASR                   │
│  - 不直接依赖任何特定 Engine                                 │
│  - 通过 trait `LlmProvider` 抽象 Engine                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Engine Layer (引擎层)                              │
│  本地模型推理运行时，可独立部署                              │
│                                                              │
│  Rust 引擎:                                                  │
│  - voxcpm-rs (TTS)                                          │
│  - burn (LLM)                                                │
│  - earshot (VAD)                                             │
│                                                              │
│  Kotlin/Native 引擎:                                         │
│  - LiteRT (LLM on-device)                                    │
│  - MNN (LLM/Vision on-device)                                │
│                                                              │
│  职责:                                                        │
│  - 实现 OpenAI /v1/chat/completions, /v1/audio/*             │
│  - 设备内模型加载、推理、卸载                                │
│  - 通过 mDNS 广播自身能力（model, size, endpoint）          │
│                                                              │
│  部署:                                                        │
│  - Rust: 嵌入 Prefrontal 进程 或独立 HTTP 服务               │
│  - Kotlin: Android JNI, 通过 HTTP 暴露 OpenAI API            │
│  - 未来: ESP32 (lite 推理)                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Model Layer (模型供应层)                           │
│  - Cloud: MiniMax, Xiaomi Mimo, OpenAI, Anthropic, DeepSeek │
│  - Local: GGUF, safetensors, .mnn, .litertlm                │
│  - 所有通过统一 OpenAI API 调用                              │
│                                                              │
│  Layer 0: Storage Layer (存储层) [横切关注]                  │
│  - Embedded PostgreSQL (单节点模式)                          │
│  - Neon (存算分离, 多节点)                                   │
│  - S3-compatible (OSS/RustFS/MinIO/NAS) for blob            │
│  - Hippocampus (向量 + 关系记忆)                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心协议契约

### Engine Layer → Agent Layer 协议

Engine 必须实现以下 OpenAI 兼容端点：

```
POST /v1/chat/completions
POST /v1/audio/speech
POST /v1/audio/transcriptions
GET  /v1/models
```

Agent 永远通过上述端点和 Engine 对话，不直接 import Engine 代码。

### Agent Layer → Interaction Layer 协议

Agent 必须实现：

```
POST /v1/chat/completions              (OpenAI 兼容)
GET  /v1/models
POST /api/sessions/{id}/messages
GET  /api/sessions/{id}/ws            (WebSocket 流式)
GET  /api/sessions/{id}/webrtc        (WebRTC SDP exchange)
GET  /.well-known/agent.json          (A2A AgentCard)
POST /a2a/tasks/send
GET  /a2a/tasks/{id}
POST /a2a/tasks/{id}/cancel
```

### Service Discovery (mDNS)

每个节点都广播 `_shadow._tcp` 服务，包含 TXT 记录：

```
id=<uuid>
name=<device-name>
type=agent|engine|hybrid
capabilities=llm,tts,asr,vad
endpoints=chat,audio,webrtc
version=1.0
```

Agent 启动时扫描局域网，发现可用 Engine 并注册到 `ModelAdvertiser`。

## 当前代码评估与改造计划

### Prefrontal (Rust 核心)

**已具备 ✅**:
- `Agent` struct + `AgentBuilder` (agent.rs)
- `LlmProvider` trait + `OpenAiProvider` + `AnthropicProvider` (llm.rs)
- `TtsProvider` trait + `VoxCpmTtsProvider` (tts.rs)
- `MemoryBackend` trait + 3 个实现 (memory.rs)
- `OpenAiProvider` 已能调用 OpenAI API (chat_completions)
- mDNS 服务发现 (discovery/network_discovery.rs)
- A2A handler (a2a_handler.rs)
- WebSocket (websocket.rs) + WebRTC (webrtc_handler.rs)
- `/v1/chat/completions` 端点 (handlers.rs:434)
- TTS 端点 (handlers.rs:1710)

**需要新增 ❌**:
1. `/v1/audio/speech` (OpenAI 兼容 TTS) — 把 `/api/tts/synthesize` 包装
2. `/v1/audio/transcriptions` (OpenAI 兼容 ASR) — 需要新增 ASR
3. `/v1/models` 端点 — 列出可用模型
4. `/.well-known/agent.json` (A2A AgentCard) — a2a_handler 已有，需要暴露
5. WebRTC 主动 ICE candidate 推送 (目前 trickle 等待 gathering_complete)
6. Session 内 TTS 流式推送

**架构边界问题 🔧**:
- `src/server/handlers.rs` 2000+ 行，应拆分为子模块
- WebRTC 信令、ASR、TTS 应该作为可插拔的 "Channel Adapter"（参考 OpenFang）
- 当前所有端点混在 `routes.rs`，没有按层分组

### Shadow-Desktop (Tauri + React)

**已具备 ✅**:
- Tauri invoke 调 Rust
- React + Zustand 状态管理
- React Router 7
- 我刚加的 `webrtcCompanion.ts` + `companionModeStore.ts`
- `prefrontalClient.ts` 已能调用 Prefrontal API
- `conversationStore.ts` 状态管理

**需要更新 ❌**:
1. 把所有 Prefrontal 调用迁移到标准 OpenAI `/v1/*` 端点
2. 删除 `prefrontal_create_session` 等自定义 Tauri invoke (改用 HTTP `/api/sessions`)
3. 添加 `/v1/audio/speech` 客户端调用 (TTS 播放)
4. 添加 `/v1/audio/transcriptions` 客户端 (浏览器 Web Speech API 或上传)
5. 服务发现 UI：mDNS 扫描局域网内其他 Agent/Engine

**架构问题 🔧**:
- 移动端 Companion Mode 用了 Tauri 内部的 WebSocket，应改为标准 `/api/sessions/{id}/ws`
- Tauri 端 Rust 后端几乎只是窗口管理，可以进一步精简

### Shadow-Mobile (Flutter + Android)

**已具备 ✅**:
- Flutter UI + Riverpod 状态
- Kotlin Platform Channel (MNN/LiteRT)
- Prefrontal HTTP 客户端 (lib/services/prefrontal_client.dart)
- MNN/LiteRT Engine 集成 (android/app/src/main/cpp/)

**需要更新 ❌**:
1. **Companion Mode**: 当前用 EventChannel 传 PCM，应该改为：
   - 客户端：浏览器 `RTCPeerConnection` (WebView 内) 或 `flutter_webrtc`
   - 服务端：Prefrontal WebRTC (已实现)
2. **引擎层抽象**: Mobile 内嵌的 LiteRT/MNN Engine 应该暴露 OpenAI 兼容 HTTP 端点，让 Prefrontal Agent 调用
3. **服务发现**: Mobile 启动时扫描局域网，找到更强大的桌面/服务器后切换

**架构问题 🔧**:
- 当前 mobile 的 Engine 在 Kotlin 内部，外部无法访问
- 没有跨服务 A2A 调用入口
- TTS 在 Kotlin TtsManager (Android 原生)，没暴露 OpenAI API

### Resonance (任务编排)

(待评估 - 简述)

## 部署模式

### 模式 A: 单机 (Single Node)

```
┌──────────────────┐
│ Shadow-Desktop   │
│  ┌────────────┐  │
│  │ Tauri+React│  │  ← Interaction
│  ├────────────┤  │
│  │ Prefrontal │  │  ← Agent
│  │ (Rust)     │  │
│  ├────────────┤  │
│  │ Burn+vosx  │  │  ← Engine
│  │ (Local LLM)│  │
│  └────────────┘  │
│  SQLite/Embedded │
└──────────────────┘
```

### 模式 B: 桌面 + 手机

```
Desktop: Agent (用手机 Engine 跑 LLM)
Mobile:  Engine (LiteRT 跑本地 LLM, 暴露 :8085)
         ↓ mDNS 自动发现
Desktop 自动注册 `http://mobile.local:8085/v1/chat/completions` 为 LLM
```

### 模式 C: 多节点

```
Phone A:  Engine (LLM)       -- /v1/chat/completions
Phone B:  Engine (TTS)       -- /v1/audio/speech
Server:   Agent              -- 用 A 的 LLM + B 的 TTS
User:     任意设备 Browser   -- 调 Server 的 OpenAI 兼容 API
```

### 模式 D: 多用户协作 (Resonance 协调)

```
User Phone ─┐
User Laptop ─┼─→ Resonance (Cloud) → 路由到最近 Agent
User Server ─┘
```

## 实施计划

> **Status legend:** `[x]` done · `[~]` partial / scaffolded · `[ ]` not started

### Phase 1: 解耦 OpenAI 端点 ✅ COMPLETE (2026-06-04)

在 Prefrontal 实现完整的 OpenAI 兼容层：
- [x] `/v1/chat/completions` (had it; verified SSE streaming)
- [x] `/v1/audio/speech` wraps existing TTS providers with OpenAI spec
- [x] `/v1/audio/transcriptions` accepts multipart, returns 501 with guidance (waiting for an ASR engine)
- [x] `/v1/models` lists LLM/TTS/ASR models from all registered providers
- [x] `/.well-known/agent.json` A2A AgentCard with capabilities + skills

Commits: `feat(api): add OpenAI-compatible /v1/* endpoints` in prefrontal repo.

### Phase 2: 桌面端迁移 ✅ COMPLETE (2026-06-04)

- [x] New `lib/openaiClient.ts` typed wrapper for `/v1/*` (chat, speech, transcriptions, models)
- [x] `prefrontalClient.ts` gains `listModelProviders()` / `addProvider()` / `deleteProvider()`
- [x] `agentStore.ts` migrated from `invoke('prefrontal_list_agents')` to `prefrontalClient.listAgents()`
- [x] SetupPage Tauri invokes audited: 3 keep (window), 1 migrated (agents), 7 deferred (auth/storage wrappers need HTTP equivalents in Rust first)
- [x] Browser-native WebRTC via `webrtcCompanion.ts` (RTCPeerConnection + getUserMedia + WebSocket signaling)
- [x] Service discovery UI: `pages/DiscoveryPage.tsx` + `DeviceCard.tsx` + `stores/discoveryStore.ts` (localStorage persistence)

Commits: `feat(desktop): migrate Tauri invoke calls to standard OpenAI /v1/* HTTP` + `feat(desktop): add Shadow Discovery page`.

### Phase 3: 移动端 Engine 模式 ✅ COMPLETE (2026-06-04)

- [x] `OpenAIServer.kt` enabled on port 8085 (was scaffolded but commented out)
- [x] `EngineProvider` bridge: `OpenAIServer` now delegates to `LitertEngine.generateContent()`
- [x] `OpenAIServerManager` exposes `setEngineProvider()`
- [x] New Platform Channel `com.ibloc.shadow/engine` (start/stop server, advertise, auth)
- [x] mDNS registration: `_shadow._tcp` with TXT records (`id`, `type=engine`, `capabilities`, `endpoints`, `version`)
- [x] `network_security_config.xml` permits cleartext to localhost/127.0.0.1/10.0.2.2/*.local for dev
- [x] `lib/services/engine_service.dart` Dart wrapper
- [x] Companion Mode: `companionModeProvider.dart` state machine, `audio_ws_service.dart` WebSocket streaming
- [x] **Fix**: LiteRT init hang — `initializeWithTimeout` (10s default) + `diagnoseModelDirectory` returning `recommendation: download|wrong-format|ready`; chat_provider now calls diagnose FIRST and shows download dialog immediately if model missing
- [~] Mobile-side WebRTC: **not yet** using `flutter_webrtc`; still using WebSocket audio streaming over `/api/sessions/{id}/audio`. Desktop already uses browser WebRTC. Future work.
- [~] Prefrontal mobile (as lib): Tauri embedding is the test bed; not yet FFI into Flutter.

Commits: `feat(mobile): enable OpenAI-compatible HTTP server (Layer 2 Engine)` + `fix(mobile): add timeout + model-dir diagnosis to LiteRT engine init`.

### Phase 4: 跨服务 A2A ✅ COMPLETE (2026-06-04)

- [x] A2A outbound client (`src/a2a_outbound.rs`): wraps `synapse::a2a::A2AClient` with peer cache, timeouts, structured errors
- [x] `A2ADelegateTool` registered with the Tool Registry so any agent can call `a2a_delegate(peer_id, message, wait)` to route a message to a remote agent
- [x] Admin API: `GET /api/a2a/peers`, `POST /api/a2a/peers` (with optional `fetch_card: true`), `DELETE /api/a2a/peers/{id}`, `POST /api/a2a/delegate`, `GET /api/a2a/peers/{id}/tasks/{tid}`, `DELETE .../cancel`
- [x] Inbound A2A (had it): `/.well-known/agent.json`, `POST /api/a2a`
- [~] Cross-service workflow: not yet a built-in primitive; must be composed in the agent via the `a2a_delegate` tool
- [ ] Resonance as L4 orchestrator: still in `Resonance` repo, not touched in this round

Commits: `feat(a2a): add outbound A2A client + admin endpoints + delegate tool` in prefrontal repo.

### Phase 5: 多节点存储 📋 PLANNED

- [ ] PostgreSQL primary (replacing SQLite default)
- [ ] S3-compatible blob storage (RustFS / MinIO / NAS / OSS)
- [ ] Neon adapter (serverless Postgres, multi-region)
- [ ] Cross-node session sync (probably via NATS or Redis pubsub)

### Phase 6: 嵌入式 (ESP32) 📋 PLANNED

- [ ] lite WebRTC client for ESP32 (likely via `esp_webrtc` or `libdatachannel-esp`)
- [ ] ESP32 mDNS listener + button → A2A `tasks/send`
- [ ] LCD / e-ink display of agent response
- [ ] Companion mode: ESP32 as a "voice-only" peripheral that delegates to a stronger phone/desktop

---

## Cross-cutting: documentation sync (2026-06-04)

Each project has an `AGENTS.md` aligned with this spec, plus per-project docs:

| Project | AGENTS.md | Module docs | API docs | Per-feature docs |
|---|---|---|---|---|
| `/prefrontal` | ✅ | ✅ rustdoc on `a2a_outbound`, `openai_api`, `webrtc_handler`, `a2a_delegate`, `a2a_admin_handler` | ✅ `docs/API.md` | — |
| `/shadow` | ✅ | n/a | n/a | ✅ `docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md` |
| `/shadow/shadow-desktop` | ✅ | ✅ module CSS in `*.css` next to components | n/a | (Discovery usage is in `AGENTS.md`) |
| `/shadow/shadow-mobile` | ✅ | ✅ per-platform-channel doc in `AGENTS.md` | n/a | (Engine mode covered in `AGENTS.md`) |
| `/shadow/shadow-mobile/android` | ✅ | Kotlin module structure | n/a | n/a |

## 参考实现借鉴

| 来源 | 借鉴点 |
|---|---|
| [openfang](https://github.com/RightNow-AI/openfang) | 14-crate workspace, KernelHandle trait, A2A, 单一二进制 |
| [ironclaw](https://github.com/nearai/ironclaw) | WASM sandbox, PostgreSQL 强制, 隐私优先 |
| [openclaw](https://github.com/openclaw/openclaw) | 多 Channel 适配器, Voice Wake, Canvas A2UI |
| [livekit](https://github.com/livekit/livekit) | WebRTC SFU, 实时音视频 |
| [pi-mono](https://github.com/earendil-works/pi-mono) | Tauri 内嵌 kernel 模式 |

## 命名约定

| 概念 | 名称 |
|---|---|
| 总项目 | Shadow (影) |
| Agent 引擎 | Prefrontal (前额叶) |
| Memory 系统 | Hippocampus (海马体) |
| Task 编排 | Resonance (共振) |
| 4 层架构 | Interaction / Agent / Engine / Model |
| 协议 | "Shadow Protocol" 或简称 SP/ |
| 标准 API | "Shadow OpenAI 兼容 API" (与 OpenAI 完全相同) |
| 服务发现 | `_shadow._tcp` mDNS |
| A2A | "Shadow A2A" (兼容 Google A2A) |

## 不在本次范围

- 🛑 移动端 Kotlin Engine 重构为独立 OpenAI 服务 (工作量大, Phase 3)
- 🛑 ESP32 硬件适配 (Phase 6)
- 🛑 多节点存储迁移 (Phase 5)
- 🛑 Resonance 详细改造
