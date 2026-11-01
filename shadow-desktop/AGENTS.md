# PROJECT KNOWLEDGE BASE

**Updated:** 2026-11-01 (桌面端那把 shadow key 真的能用了 + 探针与列表递同一套钥匙 —— 见文末「STATE STATUS (2026-11-01, 桌面端那把 shadow key 真的能用了 —— 探针与列表终于递同一套钥匙)」)
**Project:** shadow-desktop (Layer 4 — Interaction)
**Sprint-2 status:** ✅ MCP management wired through cortex — AgentsPage per-card binding panel + bind modal + 12 new cortexClient methods + 18 i18n keys. 10 AgentsPage + 10 chartbi + 20 lib vitest tests passing. TypeScript clean. **Post-audit-cycle (2026-09-24/25)**: recording mode R1-R4 closed, MCP catalog 5×28 + transport-aware MCPPage, Workflow Studio v1 (R-12/R-13), subsystem management panel client, cortex sidecar replaced with embedded encephalon. Companion E2E assessment: [`../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md).

## ARCHITECTURAL ROLE

Shadow-Desktop is the **Interaction Layer** (Layer 4) of the Shadow Platform 4-layer architecture. It is a **thin UI client** that talks to:

- **Agent Layer** (Prefrontal) via OpenAI `/v1/*` and A2A protocols
- **Engine Layer** (optional, when bundling local models) via OpenAI `/v1/*`

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The desktop app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via browser `Audio` element from `/v1/audio/speech` response)
4. Captures mic audio (WebRTC for Companion Mode)
5. Renders UI (React 19 + Tauri 2)

## UI COMPONENTS

**必须优先使用 shadcn/ui 组件**，避免自行实现基础 UI 功能。详见 `UI_COMPONENT_SPEC.md`。

已安装的 shadcn/ui 组件：Button, Input, Textarea, Label, Select, Dialog, AlertDialog, Tabs, Badge, Card, Progress, Skeleton, Separator, Toast (Sonner), Tooltip, Popover, Dropdown Menu, Command, Table, Calendar, DatePicker 等。

## STRUCTURE

```
shadow-desktop/
├── src/                          # TypeScript frontend (React 19)
│   ├── App.tsx                   # Root
│   ├── main.tsx                  # Entry
│   ├── pages/                    # Routes
│   │   ├── ConversationPage.tsx  # Includes CompanionModePanel (WebRTC)
│   │   ├── AgentsPage.tsx
│   │   ├── SettingsPage.tsx      # Models section = provider CRUD + LocalEnginePanel
│   │   ├── SetupPage.tsx
│   │   ├── MCPPage.tsx
│   │   ├── MemoryPage.tsx
│   │   ├── SkillsPage.tsx
│   │   └── TaskBoardPage.tsx
│   ├── components/
│   │   ├── AppInitializer.tsx
│   │   ├── Layout.tsx
│   │   ├── DatabaseSettings.tsx
│   │   ├── business/             # Business components
│   │   └── ui/                   # Reusable UI primitives
│   ├── stores/                   # Zustand stores
│   │   ├── companionModeStore.ts # NEW: WebRTC companion state
│   │   ├── conversationStore.ts
│   │   ├── agentStore.ts
│   │   ├── resonanceStore.ts
│   │   └── ...
│   ├── lib/                      # Utilities
│   │   ├── webrtcCompanion.ts    # NEW: RTCPeerConnection + WebSocket signaling
│   │   ├── prefrontalClient.ts   # OpenAI-style HTTP client
│   │   └── ...
│   ├── i18n/
│   ├── hooks/
│   └── types/
└── src-tauri/                    # Tauri 2 backend (RUST — Layer 3 host)
    ├── src/lib.rs                # Prefrontal embedding + window mgmt
    └── Cargo.toml
```

## INBOUND PROTOCOLS (calls Prefrontal)

All HTTP calls go to standard endpoints. **No custom Tauri invoke for chat!**

```typescript
// LLM Chat (streaming)
POST {host}/v1/chat/completions
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

// Sessions
POST {host}/api/sessions
GET  {host}/api/sessions/{id}

// WebSocket streaming
WS {host}/api/sessions/{id}/ws

// WebRTC (Companion Mode)
POST {host}/api/sessions/{id}/webrtc/offer  → { sdp: answer, ice: ... }

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard

## CORTEX-SPECIFIC ENDPOINTS (Sprint 1)

> **DEPRECATED 2026-09-22:** the cortex sidecar has been replaced by the
> embedded `encephalon` crate (at `C:/Projects/iBLOC/encephalon/`) — see
> the rewrite in `src-tauri/` (`Cargo.toml`, `src/lib.rs`, `src/video_source.rs`).
> The Rust backend now boots an in-process `Encephalon` + `diencephalon::Thalamus`
> in `setup()`; the old `cortex_manager.rs` sidecar spawner is deleted.
> This **frontend** cortexClient still hits the listed `/api/cortex/*` HTTP
> endpoints, which **do not currently exist** on the in-process encephalon.
> A follow-up PR must either (a) add an HTTP surface to encephalon mirroring
> these routes, or (b) rewrite cortexClient.ts to call Tauri commands instead.
> Until then the corticalAgent MCP UI is non-functional.

The actual runtime talks to **Cortex**, not Prefrontal. The cortexClient in `src/lib/cortexClient.ts` is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontalClient.ts` against the cortex `/v1/*` shim).

```typescript
// AgentsPage surface (Sprint 1)
GET    /api/cortex/agents                  → list installed lobes (Native + Wasm + Prompt + External)
POST   /api/cortex/agents/scan            → probe 6 external CLIs (opencode, claude-code, codex, openclaw, aider, continue)
POST   /api/cortex/agents/sync/{provider_id} → promote scan row → LobeKind::External
GET    /api/cortex/agents/discover        → A2A-shaped discovery payload
GET    /api/cortex/agents/search?skill=&q= → lexical agent search (desktop AgentsPage search bar)
GET    /api/cortex/agents/mirror?limit=N  → raw hippocampus Dimension::Agent memory rows

// Admin (requires CORTEX_ADMIN_KEY)
POST   /api/cortex/admin/agents/create         → pure-prompt agent with system_prompt
POST   /api/cortex/admin/agents/install        → base64 / URL WASM upload
GET    /api/cortex/admin/agents/installed      → list installed WASM with sha256 + size
DELETE /api/cortex/admin/agents/{name}/{version} → uninstall WASM (cleans up filesystem mirror)
POST   /api/cortex/admin/agents/generate-description → LLM-backed description generator

// MCP surface (Sprint 2 — wasm-only transport)
GET    /api/cortex/mcp/servers                  → McpServerList (id, name, wasm, state, tools)
GET    /api/cortex/mcp/servers/{id}/tools       → live McpToolSummary[] (lazy fetch)
GET    /api/cortex/mcp/agents/{name}/servers    → bindings for an agent
GET    /api/cortex/mcp/agents/{name}/tools      → flattened tools across all bindings
POST   /api/cortex/admin/mcp/servers            → register (name + wasm ref + sha256)
DELETE /api/cortex/admin/mcp/servers/{id}       → uninstall (cascade bindings)
POST   /api/cortex/admin/mcp/servers/{id}/start → run JSON-RPC initialize + tools/list
POST   /api/cortex/admin/mcp/servers/{id}/stop  → state=Stopped
POST   /api/cortex/admin/mcp/agents/{name}/servers/{id}  → bind
DELETE /api/cortex/admin/mcp/agents/{name}/servers/{id}  → unbind

// Chat stream surface (Sprint 1 ChatBI)
POST   /shadow/v1/conversations/{id}/messages:stream → SSE stream; payload may carry ChartPayload (viz_type + columns[] + rows[][])

// Subsystem management surface (Sprint 3 — 3-tier auth)
cortexClient.thalamus.listSensors()                  → GET /api/cortex/thalamus/preview/sensors
cortexClient.thalamus.getStats(name)                 → GET /api/cortex/thalamus/preview/sensors/{name}/stats
cortexClient.thalamus.tail(name, limit)              → GET /api/cortex/thalamus/preview/sensors/{name}/tail?limit=N
cortexClient.thalamus.query(template, sensor, limit) → POST /api/cortex/thalamus/preview/query
cortexClient.thalamus.register({name, kind, capacity}) → POST /api/cortex/thalamus/manage/sensors
cortexClient.thalamus.deregister(name)              → DELETE /api/cortex/thalamus/manage/sensors/{name}
cortexClient.thalamus.updateConfig(name, {capacity}) → PUT /api/cortex/thalamus/manage/sensors/{name}/config
cortexClient.hippocampus.stats()                    → GET /api/cortex/hippocampus/preview/stats
cortexClient.hippocampus.recent({layer, dimension, limit}) → GET /api/cortex/hippocampus/preview/recent
cortexClient.hippocampus.consolidator()             → GET /api/cortex/hippocampus/preview/consolidator
cortexClient.hippocampus.graphNode(nodeId)          → GET /api/cortex/hippocampus/preview/graph/{node_id}
cortexClient.neuron.models()                         → GET /api/cortex/neuron/preview/models
cortexClient.neuron.stats()                           → GET /api/cortex/neuron/preview/stats
cortexClient.issueSubsystemToken(scopes, ttlSeconds) → POST /api/cortex/admin/token (via Tauri command cortex_issue_subsystem_token)
```

Discovery is centralised in `src/lib/cortexClient.ts`. Stale data in the desktop is *not* modelled — every read goes through cortex with `refreshLobes` on a 5s polling interval. Fetching more than a polled refresh (e.g. after a write) calls the affected method directly.
```

## mDNS SERVICE DISCOVERY

On startup, browser uses WebRTC mDNS or HTTP-based discovery to find nearby Prefrontal instances:

```typescript
// mDNS query for _shadow._tcp services
// then for each found service, GET /.well-known/agent.json
// display in settings UI: "Found Agent: home-server.local:8082"
```

## COMPANION MODE (WebRTC)

The `webrtcCompanion.ts` service uses:
- `RTCPeerConnection` (browser native) for peer connection
- `WebSocket` to `ws://{host}/api/sessions/{id}/ws` for signaling (SDP/ICE)
- Microphone via `navigator.mediaDevices.getUserMedia`
- Opus codec (auto-negotiated)
- Audio playback via `<audio>` element

## CONVENTIONS

- React 19 with TypeScript
- Zustand for state management
- React Router 7
- i18next + react-i18next
- Zod for validation
- NEVER use Tauri invoke for chat — always HTTP
- Tauri only for OS-level (window, tray, notifications, fs)

## MODEL MANAGEMENT CONSOLIDATION (added 2026-08-23)

- **SettingsPage is the only home for model management.** Its Models section (`ModelsSection`) now covers: cloud provider CRUD (per-row Edit/Delete buttons + `AddProviderModal` in add or edit mode via `initialProvider`/`initialType` props), and local engine models via `components/business/LocalEnginePanel` (type tabs, neuron `/v1/models` list, download queue with job polling, install/release, source-repo download dialog — ported verbatim from the deleted ModelsPage).
- **Deleted as deprecated:** `pages/ModelsPage.tsx`, `pages/ProvidersPage.tsx`, `pages/ModelDownloadPage.tsx`, `stores/modelDownloadStore.ts`. Routes `/models`, `/models/download`, `/providers` removed from `App.tsx`.
- **Provider constants live in `src/lib/cloudProviders.ts`** (`CLOUD_PROVIDER_TYPES` + `DEFAULT_API_BASE`), shared by SettingsPage; `AddProviderModal` resolves its base URL via `prefrontalUrl()` (no more hardcoded `:60080`).
- **`AppInitializer.MODEL_SETUP_PATHS = ['/settings', '/setup']`** — `/settings` must stay in this whitelist or users without models loop between `/onboarding` and `/settings` forever. `ModelOnboardingPage` navigates to `/settings`.
- Provider edit/delete backend: cortex `PUT/DELETE /models/providers/{id}`; client methods `cortexClient.updateProvider/deleteProvider`.
- Tests: ModelsPage-exclusive test files deleted; `tests/e2e/setup-lifecycle.test.tsx` platform mock now exports `prefrontalUrl`.

## DEFAULT ROUTE & TTS PLAYBACK (added 2026-08-23)

- **Default entry** is `ConversationPage` (`<Route index element={<ConversationPage />} />` in `App.tsx`). `TaskBoardPage` is reachable via `/tasks` but no longer the index.
- **TTS playback** of agent responses lives in `src/lib/tts.ts` (wraps `openaiClient.speech()` + browser `HTMLAudioElement` + per-text audio cache). Triggered automatically when an assistant message is added (skipped for ChatBI chart payloads to avoid noisy narration). User can disable via the TTS toggle in the conversation header; preference persists in `localStorage` (`shadow.tts.enabled`). Per-message Volume2/VolumeX buttons let the user replay or stop the current playback. Architecture follows the synapse-first standard: TTS request goes through `OpenAIProvider::chat`-style abstraction (`openaiClient.speech` is the wrapped OpenAI client).

## BUILD COMMANDS

```bash
pnpm dev                  # Vite dev (Tauri) on :1420
pnpm dev:web              # Vite dev (web SPA) on :5173
pnpm build                # tsc -b && vite build
pnpm build:web            # Web SPA build → dist-web/
pnpm preview:web          # Serve the built web SPA on :4173
pnpm tauri dev            # Tauri dev with hot reload
pnpm tauri build          # Production native bundle
pnpm test                 # Vitest
pnpm lint                 # ESLint over src/
pnpm test:tauri           # Wdio Tauri E2E (full stack — auto-xvfb on Linux)
pnpm test:tauri:headed    # Wdio Tauri E2E without xvfb (use existing display)
pnpm test:tauri:reuse     # Reuse already-running Tauri + cortex
pnpm test:tauri:spec      # Run a single spec file
```

### Tauri Wdio E2E (full stack)

Runs the actual Tauri WebView shell + cortex sidecar via the W3C
WebDriver protocol exposed by `tauri-plugin-wdio-webdriver` at
port 4445. Use for testing platform-specific features (system tray,
IPC, native dialogs) and the cortex-sidecar launch path.

State reset between specs hits `POST /api/cortex/admin/test/reset`
(see `cortex/src/api/test_reset.rs`). Single worker (`maxInstances:1`)
because of `tauri-plugin-single-instance` — bypass env var
`TAURI_TEST_NO_SINGLE_INSTANCE=1` is set by `global-setup.ts`.

The cortex sidecar receives test-specific env vars via
`SHADOW_CORTEX_CONFIG` (YAML file with `LANCE_URI`, etc.) —
`cortex_manager.rs` loads this file and merges
into the cortex child process env. Production behavior is unchanged
when `SHADOW_CORTEX_CONFIG` is unset.

## BUILD TARGETS

The same `src/` produces **two artefacts**:

| Command | Output | Run-time |
|---|---|---|
| `pnpm build` → `pnpm tauri build` | `src-tauri/target/release/bundle/...` | Native binary (Linux/macOS/Windows) |
| `pnpm build:web` | `dist-web/` | Static SPA — host on Vercel / Netlify / S3 / GitHub Pages |

`src/lib/platform.ts` is the single source of truth for which target is in use. Tauri-only calls go through `src/lib/tauriSafe.ts::safeInvoke()` which returns `null` on the web build.

## STATE STATUS (2026-09-02, post-supervisor)

**Completed** ✅ (since 2026-09-02):
- **Cortex sidecar supervisor** (commit `cd84a71`) — `cortex_manager.rs` now respawns the cortex sidecar on unexpected exit. Backoff schedule is 1s → 2s → 4s → 8s → ... → 30s, capped at 5 consecutive failures before parking the manager in `Error` state. User-initiated `stop()` disables the supervisor so a deliberate shutdown is never undone; toggleable at runtime via `cortex_set_supervision`. Frontend wired in SettingsPage with `supervisor` state on `cortexStore` and 6 new i18n keys (`supervisor` / `supervisorEnabled` / `supervisorDisabled` / `supervisorHelp` / `restartCount`). 4 unit tests on the supervisor lifecycle + 1 unit test on `check_process_alive_when_no_child_is_none`. **45 lib tests pass.**

> **⚠ Sidecar replaced** — `be50b7f` (2026-09-23) removed `cortex_manager.rs` entirely; the Tauri shell now boots an in-process `Encephalon` + `diencephalon::Thalamus` in `setup()`. The supervisor lifecycle block above describes the intermediate state — see the CORTEX-SPECIFIC ENDPOINTS note at line 104+ for the runtime-truth on what the embedded mode actually exposes.

## STATE STATUS (2026-09-25, post-audit-cycle)

**Completed** ✅ (since 2026-09-23 audit; 39+ commits):

### Recording mode R1-R4 (commits `a1e3509` → `afa8d60` → `3600166` → `0390379` → `965bc15` → `ec467b7`)
- `a1e3509` — design spec for 录音/录像记录模式 (recording mode)
- `de0913e` — R1: data model + Tauri commands (`recording_start/stop/status/events/list/report`)
- `8520c31` — lobe ownership rule: 音频 → 颞叶, 视觉 → 枕叶
- `afa8d60` — RecordingPage UI + repair corrupted i18n JSON
- `3600166` / `30d7f59` — temporal-lobe audio pipeline + occipital-lobe video pipeline
- `0390379` / `856621c` — recording summary + LanceGraph edges (R4) + neuron-backed adapters
- `965bc15` / `ec467b7` — 4-lobe split: pipelines moved to lobe repos, deps repointed at real GitHub homes
- **e2e gap**: no Playwright/WDIO test exercises `RecordingPage` or any `recording_*` command (see E2E assessment §2.1)

### MCP catalog 5×28 + transport-aware MCPPage (commits `ccae5ce`, `1c0c3ec`, `5679021`, `f02ba35`)
- 5 built-in servers × 28 tools, runtime registry via `src-tauri/src/mcp_catalog.rs`
- Transport-aware add form: stdio / http / wasm
- Button import fix from UI lib (not lucide-react)
- Duplicate StatusBadge import removed
- **e2e gap**: `tests/e2e-ui/mcp.spec.ts` is page-smoke only; no test for `add_server / remove_server / builtin_servers` runtime

### Workflow Studio v1 — R-12/R-13 closure (commit `4023493`)
- Drag-drop workflow editor; backend lives at `telencephalon/apps/editor` (originally `cerebellum/apps/editor`, commit `b4730e2`; moved to the telencephalon on 2026-10-14, after which the `cerebellum` concept was retired)
- `93f4ef9` — WorkflowStudio syntax + Univer locale/core deps for dev runtime
- **e2e gap**: zero Playwright/WDIO/tauri-driver spec references Workflow Studio

### Computer Use R-10/R-11 (commits `84418a2`, `9c46327`, `c37b163`, `b5743fc`)
- 11 `cu_*` Tauri commands (`cu_screenshot`, `cu_mouse_click/move/scroll`, `cu_keyboard_type/combo`, `cu_set/get_enabled`, `cu_list_ui_elements`, `cu_click_ui_by_name`, `cu_read_ui_text`, `cu_set_ui_value`)
- ComputerUsePage in nav
- Windows UI Automation surface (4 Windows-only cu_* commands)
- Preview-before-commit modal
- **e2e gap**: zero coverage of any `cu_*` command

### Document productization DOC-01..05 (commits `2bb8932`, `90878db`, `00c43fc`, `d7d1466`, `8bbc260`, `2aa0d3b`, `37feb88`, `1cb6ba2`)
- `<UniverSheet>` component + `/document/:taskId` route
- Feishu MCP bridge + open-lark backend + feishu_mcp Tauri module
- FeishuPublishedCard wired into chat
- Feishu Settings toggle
- UniverSheet i18n wired
- Per-task result management with local git
- Scenario doc DOC-01..05

### Browser-use R-08/R-09 (commits `b834d20`, `858f0df`)
- WebviewWindow per-task replaces iframe preview
- PreviewButton in TaskDetailDialog + PreviewsPage in nav

### AudioEventChip R-01 (commit `c08da1d`)
- R-11 SSE schema + UniverSheet i18n — closes UI/UX audit R-01

### History tab R-04/05 (commit `f246c31`)
- TaskDetailDialog History tab — closes R-04/R-05

### Build fixes (commits `cc1b787`, `2fee8eb`, `73b4cda`, `8f01cde`, `89e478b`)
- ziti-sdk patch + dep-graph + API-drift compile fixes
- vitest component tests + smoke script + pre-push checks
- `@univerjs/core` 0.6.10 lock + pnpm lock update
- Univer locale imports → default (CJS interop)

### Recording R1-R4 in detail
- `src-tauri/src/recording/mod.rs` defines `RecordingStore` with `start_session`, `add_event`, `summarize`
- 6 Tauri commands registered in `src-tauri/src/lib.rs`
- `RecordingPage.tsx` mounted under `/recording` route
- Voiceprint enrolment wired into `hippocampus::voiceprint` (server-side, commit `6aea5e1`)

## STATE STATUS (2026-07-13, post-Sprint-2)

**Completed** ✅ (since 2026-07-13):
- **MCP management UI** (commits `0109bad`-precedent, `40ba82e`, `445df73`) — `MCPPage` and AgentsPage's per-card binding panel both read from the cortex admin API (no more browser-local mcpStore for MCP). 12 new methods on `cortexClient` (listMcpServers / create / delete / start / stop / bind / unbind / etc.) plus McpServerRecord / McpToolSummary / McpAgentBinding / McpServerList TS types matching the cortex wire format. AgentsPage now shows a McpBindingsPanel below each InternalAgentCard with truncated server_id chips that unbind on click, plus a 'Bind MCP' button that opens a per-agent modal showing currently-running servers not yet bound. 18 new i18n keys (mcpTitle / mcpStart / mcpStop / mcpBind / etc.) added to both zh-CN and en-US.
- **WASM fs-mirror + agent search bar** (commits `0109bad`) — Already in Sprint 1.

**Completed earlier** ✅:
- **ChatBI frontend** (commits `acc45be`, `f1e8e31` followup) — ConversationPage parses `ChartPayload` from cortex SSE and renders `ChartCard` via `echarts-for-react`; chartRegistry builds ECharts option per `VizType`. `isChatBiPayload` guard at `src/lib/chatbi/guards.ts`. 10 chartbi tests passing.
- **Agent search bar** (commit `0109bad`) — full-width Find-Agent panel above the internal section: skill filter + text query backed by `cortexClient.searchAgents({skill, q})`. Skill filter is exact; text is case-insensitive substring across name / description / skills / url.
- **Generate-description wired through cortex** (commit `b4f1f2c`) — replaced inline `openaiClient.chatCompletions({model:"gpt-4o-mini"})` in CreateCustomAgentModal with `cortexClient.generateAgentDescription(systemPrompt)`. Errors surface in a red banner; 503 → "Cortex LLM not configured".
- **WASM install UI** (commit `82f5494`) — AgentsPage WASM section between Custom and External. Lists installed binaries with size/sha/source badges. Delete per row. Refresh button. Disabled-when-cortex-stopped empty state. Cortex stores these in Lance `cortex_wasm_binaries` and mirrors to `${CORTEX_WASM_DIR or exe_dir}/wasm_modules/`.
- **Sprint 1 backend alignment** — fixed pre-existing flow-agent.rs test compile errors (`FlowContext`/`FlowError` imports) and one agent_management.rs route that used axum 0.7 `:name` syntax (axum 0.8 wants `{name}`).

**Completed earlier** ✅:
- React 19 + Tauri 2 foundation
- Zustand stores for all entities (with Sprint 1 selector-pattern refactor to avoid Maximum-update-depth loop)
- PrefrontalClient (HTTP) with `/v1/*` standard + `/api/*` Prefrontal-specific methods
- New `lib/openaiClient.ts` typed wrapper for OpenAI /v1/* (chatCompletions, speech, transcriptions, listModels)
- ConversationPage with text chat
- **CompanionModePanel (WebRTC)** — `lib/webrtcCompanion.ts` + `stores/companionModeStore.ts` (VAD-driven, barge-in, multi-turn)
- **Discovery page** (`pages/DiscoveryPage.tsx`) — mDNS browser, manual add, active node, localStorage persistence
- i18n (zh-CN + en-US) — 100+ keys across chatbi / install / search / HF token / ngrok URLs etc.
- mDNS service discovery (HTTP-based via Prefrontal `/api/discovery/*`)
- **Tauri invoke migration** — `agentStore.fetchAgents()` now uses `prefrontalClient.listAgents()` over HTTP instead of `invoke('prefrontal_list_agents')`
- A2A-ready: HTTP client can talk to `/api/a2a/peers` for cross-service agent delegation
- **Lance-only storage** — hippocampus now ships with Lance as the single backend (no Postgres / pgsql UI or embedded binary). See commits `b4939e5`–`8e590b8` for the cleanup.
- **FlowsPage i18n** — "Cortex Flows" → "思维定式"
- **ResonancePage** — 独立共鸣管理页面，支持多实例配置、主实例设置、Agent 开放选择
- **AgentsPage unified** — Cortex & Lobe 合并入智能体页面，所有 lobe 视为内部智能体，支持为内部智能体设置模型
- **ModelOnboardingPage** — 应用启动时通过 neuron API 检查模型配置，若无可用模型则跳转引导页。下载由 neuron 后端处理（`POST /v1/models/pull`），用户可在下载期间自由导航

**Planned** 📋:
- Tauri Rust backend → embed Prefrontal core (drop in-process, no separate service)
- Finish SetupPage Tauri invoke migration (needs Rust HTTP endpoints for secure_auth + model_storage)
- Cross-device session transfer
- A2A peer card in Discovery page (promote a discovered node to a delegatable A2A peer)
- 思维定式编辑能力 — 用户可修改已抽象的流程
- Resonance 连接测试 — 实际 HTTP 连接检测 + 延迟测量
- 后端持久化 — lobe 模型绑定保存到 cortex/agent.json

## STATE STATUS (2026-10-30, 客户端工具执行回路)

**Completed** ✅:

- **客户端工具（client tools）—— 端脑让这台设备干的活** ——
  `src/lib/clientTools.ts` + `src/components/chat/ToolCallMessageCard.tsx`。
  端脑的工具分两种：**端脑本地工具**（`telencephalon::tools`，改端脑自己的
  状态）与**客户端工具**（改**用户眼前这台设备**的状态 —— 主题色、明暗、
  窗口、剪贴板、通知）。**两端各有一份注册表** —— **能做什么由设备决定**：
  手机没有窗口可最小化，桌面端没有麦克风权限可申请。
  - `ClientTool`（名字 / 说明 / 要不要用户点头 / `collectsInput` 要不要先收
    输入 / 字段声明 / 真正干活的 `execute`，**抛异常 = 执行失败**）+
    `ClientToolRegistry`（工具名 → 工具）+ `parseToolArgs` + `parseHexColor`；
  - 内置两个工具：`set_theme`（`color` → 换主题色，`dark` → 切明暗）与
    **`ask_user`**（模型反问用户 —— `collectsInput: true`，先渲染
    `ClientToolForm` 收答案再执行）。**`ClientToolForm` 那个骨架终于有消费方
    了**（以前是零消费方）。
  - 主题色的两端色调由 `styles/accent.g.ts` 的 `deriveAccentTones` 派生
    （与移动端 `app_colors.dart` **同一套算法**）—— 两端算出来的明暗两端色调
    必须一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
- **执行回路**（`pages/ConversationPage.tsx`）—— 端脑只负责**点名**（工具名 +
  参数），真正干活的是这台设备，干完再把结果回传端脑
  （`telencephalonClient.reportToolResult`）—— 端脑把它喂回模型，模型才知道
  「主题已经换好了」，否则模型会一直等一个不来的结果。端脑点了一个这台设备
  不会的活 ⇒ **明确失败并回传**，不闷着不吭声。
- **⚠️ 认错的代价很具体**（三处都写在代码注释里）：① `args` 线上有两种形态
  （端脑的 `ToolCall.args` 是 `String` ⇒ 序列化出来是 JSON 文本；有些路径传
  的是已经拆好的 map）⇒ 拿到字符串还当对象用 ⇒ 参数全是空的，「把主题换成
  靛蓝」会退化成「换成默认色」，而且**看不出哪里错了**；② 端脑的 `tool_call` 事件**现在带 `tool_call_id`**
  （uuid）⇒ 两端把它回传，端脑按 id 对上号（老端脑没有才自己合成）；③ 工具在本地跑成了 **≠** 端脑知道了 ⇒ 两端要
  分开显示（否则「本地换了主题、端脑那头模型还在等」会被看成成功）。
- **客户端工具的 JSON Schema（2026-10-30 补）** —— `ClientTool.parameters`
  （JSON Schema，独立于 `fields`）+ `toOpenAiTools(registry)` 导出成 OpenAI
  function-calling 数组，随 `SendMessageRequest.tools` 发给端脑。
  - **为什么必须有**：没有它，模型只知道有 `set_theme`，**不知道它要一个
    `color` 还是 `dark`** ⇒ 只能瞎猜，或者干脆不调。
  - **⚠️ `parameters` 与 `fields` 不是一回事**：`fields` 描述**输入框**（UI
    变体），`parameters` 描述**参数**（JSON Schema）⇒ 各管各的。
  - **⚠️ 两端同名工具必须导出同样的内容** ⇒ **两端测试各自断言同一份字面量**
    （桌面 `src/lib/__tests__/clientTools.test.ts` / 移动
    `shadow-mobile/test/unit/client_tool_registry_test.dart`）⇒ **任一端漂移
    则该端测试立刻变红** —— 跨仓没有共享运行时，这是唯一可行的保证方式。
  - **`color` 与 `dark` 都不是必填** —— 给哪个都算一次合法调用；两个都不给时
    工具**明确失败**而不是默默什么也不做。
  - **端脑今天还不认识 `tools` 这个字段** ⇒ serde 默认忽略未知字段 ⇒ **带上
    无害** ⇒ 客户端可以先发，等端脑接上即生效。
  - **⚠️ 两条桌面端的路必须给模型看**同一份工具清单**：`pages/ConversationPage.tsx`
    （现役）与 `lib/aiSdkTelencephalonTransport.ts`（AI SDK 适配器，**今天零消费方**）
    —— 后者原先**不带** `tools` ⇒ 一旦被接上就是「同一个模型、同一个问题，走哪条路
    决定模型能不能调 `set_theme`」，而这个差异在界面上**完全看不出来**。
    现在两条路都是 `toOpenAiTools(desktopClientTools)`（**同一个来源**），
    并由 `src/lib/__tests__/aiSdkTransportClientTools.test.ts`（3 条）锁住。

**修掉一个真 bug**：`parseHexColor` 对 `#AARRGGBB` 取的是**前** 6 位（把 alpha
当成了红通道）⇒ `#FF71717A` 会变成 `#FF7171`（蓝通道错了）。新写的测试把它
逮住了，已改成 `slice(2)`（丢的是 alpha）。

**验证**：`npx tsc --noEmit` **EXIT=0**（TypeScript clean）；`npx vitest run` ⇒
**114 个测试文件 / 1161 passed / 2 skipped / 0 failed**（本轮 **+5** ——
`src/lib/__tests__/clientTools.test.ts` 现有 16 条：参数两种形态、非 JSON 不丢
调用、数组不当参数表、颜色归一化与「不猜」、注册表查找，外加 `toOpenAiTools`
5 条：导出形状 / `set_theme` 的 **schema 字面量（跨端契约）** / 两个都非必填 /
无 schema 时空参数表 / 空注册表）。

**⚠️ 闭环通了一半**：端脑的**接收端路由已经补上** ——
`POST /shadow/v1/conversations/{id}/tool-results`（`telencephalon/src/api/shadow.rs`）
⇒ 结果**记进会话历史**（agent 角色 + `[tool_result] ` 前缀）⇒ 下一轮模型看得见
「我调过这个工具、结果是什么」；`tool_call` 事件**现在带 `tool_call_id`**（端脑
生成的 uuid）⇒ 同一轮里同名工具调两次也分得清。**还差的是叶区 `call_llm` 带
`tools`** —— native 叶区今天既产生不了工具调用、也接不了工具结果 ⇒
「模型自己决定调客户端工具」目前**只对外部 A2A 对端成立**。
⚠️ **客户端这边已经把 `tools` 发过去了（但还是惰性的）** —— 桌面端与移动端
现在都随消息把**这台设备能跑的客户端工具**（含 JSON Schema）发给端脑
（`SendMessageRequest.tools`）⇒ **端脑今天还不认识这个字段**（serde 忽略未知
字段 ⇒ 带上无害）⇒ **端脑那侧接上之前，模型看不见这些工具**。

---

## STATE STATUS (2026-10-31, A2UI 桌面端接入)

**Completed** ✅:

桌面端现在能消费端脑的 A2UI 产出面（`POST {baseUrl}/a2a`）⇒
**两端连的是同一张服务端画出来的界面** ⇒ 跨端契约的 fixture
（`shadow/fixtures/a2ui/`）有了**第三个消费者**。

- **⚠️ 第一件事是把「硬约束」与「我的判断」分开** ——
  能力清单 `agent-surface.json` 的 `a2ui.desktop` 原先写着
  「更划算的是让现有那套渲染（`ToolPartRouter` / `ClientToolForm` /
  `ToolCallMessageCard`）接受 A2UI 的数据模型，而不是再实现一遍协议栈」。
  **本轮没有照做**，而是**在 TypeScript 里另写了一份协议栈**。拆开看：
  - **(a)「再实现一遍协议栈」在桌面端是硬约束** —— `genui` / `genui_a2ui` 是
    **Flutter 包**（Dart），桌面端是 React/TS + Tauri ⇒ **进程里没有 Dart
    运行时** ⇒ 那套栈在桌面端**一行都跑不了**（`package.json` 里也确实没有
    `genui` 依赖）⇒ **不是选择**。
  - **(b)「不复用现有那套渲染」才是我的判断** —— 现有那套吃的是 **AI SDK 的
    `UIMessage` part 形状**、长在**聊天消息列表**里；而 A2UI surface 是
    **另一条链路**（自己的 surface id、自己的组件树、自己的 `POST /a2a`
    请求，**不是一条消息**）⇒ 要复用就得让**消息 store** 学会
    「有一类东西不是消息」⇒ **代价** = 多维护一份协议栈（~250 行 TS），
    **收益** = 两种模型不搅在一起。
  - ⇒ ⚠️ **这一片因此偏离了清单的建议**（清单已改写成如实描述）。
    **若将来 A2UI surface 要内联进对话流**，那时才该合并，
    而不是继续维护两份。

- **落地了什么**（`shadow-desktop/`）：
  - `src/lib/a2uiProtocol.ts`（新）—— **纯协议**：SSE 分帧、A2UI 载荷抽取、
    surface 模型。**不碰网络、不碰 React**（协议能被单独测）。
  - `src/lib/a2uiClient.ts`（新）—— `POST {baseUrl}/a2a` + `X-Shadow-Key` +
    `X-A2A-Extensions` + **流式** SSE 读取。
  - `src/components/chat/A2uiSurface.tsx`（新）—— 只画端脑**实际会发的 4 种**
    组件（`Column` / `Text` / `TaskCard` / `AgentStatusIndicator`）；
    **未知组件类型降级成占位**（新版大脑不能把旧版桌面端白屏）。
  - `src/components/chat/A2uiPanel.tsx`（新）—— 加载 / 空 / 错误 / 就绪 四态
    + 视图切换。
  - `src/pages/ConversationPage.tsx`（改）—— **只改这一个干净文件**
    （一个按钮 + 面板挂载）。
  - `src/i18n/{en-US,zh-CN}.json`（改）—— 新增 `a2ui.*` **4 个** key
    （`i18next/no-literal-string` 是 **error** ⇒ 诊断文案必须进 i18n）。
    ⚠️ **加在文件末尾**而不是 `surface` 段旁边 —— 那两个文件**正被并行会话改着**
    ⇒ 追加在末尾 + 用**唯一锚点**编辑 ⇒ 冲突时是**响亮地失败**而不是静默覆盖。

- **⚠️ 四个「照抄协议，不自作主张」**：
  1. **两段式语义** —— `surfaceUpdate` 只**缓存**、`beginRendering` 才**渲染**
     ⇒ 不会画出「组件还没到齐」的半成品；
  2. **载荷位置** —— `result.status.message.parts[]` 里 `kind === "data"` 的 part；
  3. **扩展声明走请求头** —— `X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8`
     （与移动端自造 transport 时的 `authHeaders` 同一个常量）；
  4. **状态 / 优先级显示协议原值而不翻译** —— 移动端也是这么做的
     ⇒ **两端对同一个 surface 的读法不会分叉**。

- **⚠️ 三个「我的判断」**：
  1. **视图用 `metadata.a2ui.view` 显式指定**，不靠关键词匹配 ——
     关键词会被用户文案带偏（用户说「我的日程」就不命中「任务」）；
  2. **「空」与「失败」分开** —— 端脑对「这次没有可渲染的视图」的回答是
     **一段纯文本**、**不是错误** ⇒ 面板把**大脑的原话**显示出来，
     而不是笼统的「无数据」（那样会把大脑说了什么藏起来）；
  3. **未知组件类型不抛异常**。

- **⚠️ 钥匙没有新开通道** —— 面板的钥匙来自 `telencephalonClient.getApiKey()`
  ⇒ **与桌面端现有的 `/shadow/v1/*` 请求同源同值** ⇒ 不会出现
  「A2UI 带了钥匙、其它请求没带」的分叉。
  ⚠️ **既有缺口（非本片引入）**：桌面端**没有**输入 shadow key 的界面
  （store 有 `connection.apiKey`、会持久化、rehydrate 时会补设，
  `IdentityPanel.tsx:43` 在读它，但**没有设置入口**）⇒ 若端脑配了 key 而
  客户端手里没有 ⇒ 面板 **401**（面板会**明说**）⇒ **这一格对桌面端所有请求
  都一样**，不是本片欠的。

**验证**：

- 新测试 **15 条**（协议 5 + 客户端 3 + 渲染 4 + 面板 3）**全绿**；
- **反向验证四连**（每一条都精确对应一处故意破坏，其余断言仍绿）：
  ① 拆掉 `X-Shadow-Key` 注入 ⇒ **恰好 1 条红**；
  ② 让 `surfaceUpdate` 也能渲染 ⇒ **恰好 1 条红**；
  ③ 把载荷路径改成 `result.message.parts` ⇒ **恰好 6 条红**
  （**4 条不依赖抽取的仍绿**）；
  ④ 把判环守卫退回「全树已见集合」（**忠实复刻旧写法**）⇒ **恰好 1 条红**
  ⇒ ⇒ **断言有分辨力、不是整片红**；
- ⚠️ **第 ④ 处对应一个真缺陷**：第一版的判环用「全树已见集合」
  ⇒ **同一个组件被引用两次时，第二次会整个消失**（用户莫名少一块界面）
  ⇒ **已改成祖先路径**（每层一份拷贝）⇒ 重复引用**照画两次**、
  自引用仍被截断（不会爆栈）⇒ **这条是写测试时才发现的，不是读代码时想到的**；
- 桌面端**全量** `vitest run` ⇒ **120 个测试文件 / 1209 passed / 2 skipped /
  0 failed**（基线 119 文件 / 1194 passed，**+1 文件 / +15 条**）；
- `tsc --noEmit -p tsconfig.json` **EXIT=0**；`eslint`（6 个改动文件）**EXIT=0**；
- `vite build --outDir dist-a2ui-verify` **EXIT=0**（`✓ built in 19.95s`）
  ⇒ 打完已用可恢复删除清掉；
- `node scripts/check-agent-surface.mjs` ⇒ **阻断 0 / 提示 0**（⚠️ 中途**短暂**出现过
  2 条提示 —— 那是**并行会话**新登记的 `a2ui` / `identity` 两个能力的 `labelKey`
  在**移动端 ARB** 里还没补上 ⇒ 已被他们的 `5ebd5a4` 补齐
  ⇒ **不是本片引入**：本片**没新增能力、没动任何 labelKey**）。
- ⚠️ `node scripts/validate-i18n-keys.mjs` **EXIT=1**，但那 **260 条缺失全是
  既有缺口**（`identity` / `computerUse` / `subsystem` / `preview` / `voice` /
  `questionnaire` …）⇒ 本轮用到的 **11 个 key 逐个核对，全部在两份 i18n 里存在**。

⚠️ **还欠的**：

- **桌面端从未对着一个活的端脑跑过** —— 测试喂的是**录下来的**端脑字节
  （`fixtures/a2ui/tasks_sse.txt`）。
  ⚠️ 但「桌面的端脑真的提供 `/a2a`」**可静态证明**：桌面 sidecar 起的是
  `telencephalon::api::build_full_app`（`src-tauri/src/cortex_http.rs:212`）
  ⇒ 包着 `build_with_conversation_store` ⇒ 而 `telencephalon/src/api/mod.rs:99`
  在那张 router 上 merge 了 `a2ui_gateway::router` ⇒ **`/a2a` 与那道 shadow
  key 门都在** ⇒ **还差的是「桌面客户端真的把界面画出来」那段运行时证据**；
- **设备端（ESP32）零 A2UI** ⇒ ⇒ **已定：不是欠账**（ESP32 只是**输入设备**，2026-11-01 用户定）；
- 界面文案本地化（服务端出的 chrome 仍是英文）—— 桌面端这侧**本地化只覆盖了
  诊断文案**，组件内容是服务端给的原文。

## STATE STATUS (2026-10-31, 桌面端 admin 钥匙不再常量)

**这一档**：桌面端递给端脑的 admin token **不再是那个常量**。

- **⚠️ 原来的洞（两条叠起来）**：
  - 端脑有一条后门：`verify_admin_token` 里
    `if expected == "dev-admin-key" { return Ok(()); }` ⇒ expected 恰好是那个
    **源码里的字面量**时，**连请求头都不看**就放行；
  - 而桌面端递进去的 expected **恰好就是** `dev-admin-key`
    （旧的 `desktop_admin_token()` 的默认值）⇒ ⇒ 桌面端的 admin 面
    **任何请求都过**；
  - 再叠加端脑面的 `CorsLayer::permissive()`（任意 origin 可跨域、**能读到
    响应**）⇒ ⇒ **浏览器里任意一个网站**都能往用户的大脑里插一个它自己写的
    叶区（`POST /api/telencephalon/admin/agents/create`）＝ 往模型面前插一条
    自己写的路。
  - 端脑那一刀在 `telencephalon` 仓（`src/security/api_key.rs`）⇒ 本仓是
    **另一半**：得有真钥匙可递。
- **做了什么**：
  - 新增 `src-tauri/src/admin_token.rs` —— **环境变量 → 持久化文件 → 首次生成
    一把随机的**（32 字节 ⇒ hex 64 字符）⇒ 每台安装一把自己的、猜不到的；
    持久化位置 `<配置目录>/shadow/admin.key`；Unix 下 `0600`；
    **绝不打日志**（只报长度与来源）；进程内用 `OnceLock` 缓存 ⇒ sidecar 与
    前端命令拿到的**是同一把**；
  - 新增 Tauri 命令 `get_admin_token` ⇒ 前端拿得到那把钥匙；
  - 新增 `src/lib/adminToken.ts` —— Tauri 走 sidecar，web 走
    `localStorage['shadow-admin-token']` ⇒ **拿不到就 `undefined`**；
  - `telencephalonClient.request()` 统一带上 `X-Admin-Token`；
  - `issueSubsystemToken` 里那个 `?? 'dev-admin-key'` **字面量删掉**
    （它打进前端产物 ⇒ 从来不是秘密 ⇒ 而端脑曾对它「认任何人」）。
- **⚠️ 一条设计取舍**：**没有钥匙就不带那个头**（不塞占位值）⇒ 因为**空的
  `X-Admin-Token` 在旧实现里与空串 `ct_eq` 相等 ⇒ 等于带对了** ⇒ 宁可不带
  （端脑回 401 且说人话）。
- **⚠️ 契约套件跟着改**（`tests/api-contract/*`）：admin token **只从环境变量
  来**（`SHADOW_TEST_ADMIN_TOKEN`）⇒ 没有就**跳过** admin 类探测并说清原因
  ⇒ 以前那个字面量默认值让套件在默认安装下**不带凭据也能过** ⇒ 等于没测。
- **验证**：`cargo check --lib` **EXIT=0**；`tsc --noEmit` **EXIT=0**；
  全量 `vitest run` ⇒ **121 文件 / 1216 passed / 6 skipped / 0 failed**
  （基线 120 / 1209 ⇒ **+1 文件 / +7 条**）；端脑侧 `--lib` **617 passed**、
  端到端 **5 passed**、跨域取证 **2 passed**；项目静态闸
  `scripts/check-auth-backdoors.mjs` ⇒ **4 → 0**。
- **✅ 反向验证**：去掉客户端的 header 注入 ⇒ **恰好 2 条红**（断言「带上了」
  +「两个域」），另 2 条（「没有就不带」）仍绿；端脑放回那条后门 ⇒ **恰好 1 条
  红**（其余 13 条仍绿）；端脑让 providers 的掩码失效 ⇒ **恰好 2 条红**
  （写回那条仍绿 —— 它测的是回写逻辑，本就不依赖掩码）。
- **⚠️ 新测试当场抓到一个真 bug**：JS 里 `'   '` 是 **truthy** ⇒ 「
  `if (adminToken)`」这个判据太松 ⇒ **空白值会被当成一把钥匙发出去** ⇒ ⇒
  改成「trim 之后还剩东西吗」。
- **⚠️ 本机跑不了桌面端的 Rust 单测**（既有环境限制，非本档引入）：
  dev-dependency `neuron` ⇒ `lance` ⇒ `lance-encoding` 的 build script 需要
  **`protoc`**（本机没有）⇒ ⇒ 改用 `rustc --test` **单编那个模块** ⇒
  **4 passed** ⇒ ⇒ 至少证明 `#[cfg(test)]` 那段**编得过、跑得过**。
- **⚠️ 还欠的**：`CorsLayer::permissive()` **没收**（这张面同时是 webview 的
  目标 ⇒ 收它要带 allowlist）；`/models/providers` **仍零鉴权**（端脑仓改成
  掩码了 ⇒ 密钥不再出网，但「删光供应商」仍可做 ⇒ 加门归 router 层那一档）；
  独立端脑服务器现在**默认 admin 面关着**（没配 `TELENCEPHALON_ADMIN_KEY`）
  ⇒ 桌面端若指向它，两边要用**同一个**环境变量。

## STATE STATUS (2026-11-01, A2UI 真机实测 + 叶区状态不许撒谎)

**Completed** ✅:

桌面端这一侧本轮只动了一处，但它是**同一条链上的一块**：

- **✅ 父仓 `shadow/AGENTS.md` ㋊ 条记整条真机链路**（手机第一次真的把 A2UI
  界面画出来 ⇒ `scripts/prove-a2ui-on-device.ps1` ⇒ 7 条机器可判 + 截图）
  ⇒ 端脑那一侧见 `telencephalon/AGENTS.md` ㉝ 条，移动端那一侧见
  `shadow-mobile/AGENTS.md` ㋀ 条 ⇒ **本条只记桌面端这一侧的形状**。
- **⚠️⚠️ 修掉一个「失败长得像成功」**：`AgentStatusIndicator` 的 `status`
  以前**不认识的值一律落回 `idle`**（`A2uiSurface.tsx:255`）⇒ ⇒ 端脑说
  `unknown`（=「我们从没探活过它」）⇒ 桌面端会画成 `idle`；端脑哪天**多说一个词**
  ⇒ 同样落成 `idle` ⇒ ⇒ **又一次「失败长得像成功」**。
  ⇒ **改法**：① `status` 联合类型加 `unknown`；② `AGENT_STATUS_STYLE` 加
  `unknown`（**虚线框** ⇒ 形状上就与 `idle` 分得开，不靠颜色赌）；
  ③ **兜底从 `idle` 改成 `unknown`**；④ **缺 `status` 声明 ⇒ 缺省 `unknown`**
  （「没说」和「没事」是两件事）。
- **✅ 测试 + 反向验证**：`src/components/chat/__tests__/a2ui.test.tsx` 新增一条
  （断言**形状**与 `data-status`：三行分别给 `unknown` / 端脑多说的词 / `idle`，
  外加一行**根本不说 status**）⇒ ⚠️ **反向验证**：把兜底改回 `idle` ⇒
  **恰好 1 红**，其余 15 条仍绿 ⇒ ⇒ **断言有分辨力，不是恒绿**。
  ⇒ 全量 `pnpm exec vitest run` ⇒ **124 文件 / 1230 通过 / 6 跳过 / 0 失败**。
- **⚠️ 还欠的**：**服务端产出的界面文案仍是英文**（`Tasks (1)` / `HIGH` /
  `not probed`）⇒ 桌面端面板现在中英混排；「空 / 失败」在协议层是**三种**状态
  （有内容 / 有 surface 但空 / 纯文本），面板仍并成两种；**桌面端没有 shadow key
  输入入口**（既有缺口）⇒ 端脑配了 key 而桌面端没有 ⇒ 面板 401（面板会明说）。
## STATE STATUS (2026-11-01, 界面文案随用户的语言走)

**Completed** ✅:

- **✅ 父仓 `shadow/AGENTS.md` ㋐ 条记整片**（端脑产的界面文案随用户的语言走 ⇒
  两端界面不再是中英混排）⇒ 端脑那一侧见 `telencephalon/AGENTS.md` ㉟ 条，
  移动端那一侧见 `shadow-mobile/AGENTS.md` ㋁ 条 ⇒ **本条只记桌面端这一侧的形状**。
- **✅ 机制**：面板把 i18next 的 `i18n.language`（`zh-CN` / `en-US`）交给客户端
  ⇒ 客户端发成 `Accept-Language` 头（`src/lib/a2uiClient.ts` 的
  `buildA2uiHeaders(apiKey, locale)`）⇒ 端脑据此产出中文界面
  （真相源在服务端：`telencephalon/src/a2a/a2ui_i18n.rs`）。
  ⚠️ **不碰 `telencephalonClient.ts`**（那个文件此刻被并行会话在飞改动占着）
  ⇒ 沿用面板原来那条独立通道（与 A2UI 接入那片同一个取舍）。
- **✅ 测试 + 反向验证**：`src/components/chat/__tests__/a2ui.test.tsx` 新增 **3** 条
  （① 客户端带 `Accept-Language`；② **没语言时就不带** —— 端脑会落英文，
  与本功能之前**逐字相同** ⇒ 跨端契约 fixture 继续有效、旧客户端不受影响；
  ③ **面板把 i18n 的语言交下去** —— `tests/setup.ts` 把 `react-i18next`
  mock 成 `i18n: { language: 'en' }` ⇒ 断言请求头是 `en`）
  ⇒ `a2ui.test.tsx` **19 passed**；全量 **124 文件 / 1233 通过 / 6 跳过 / 0 失败**；
  `tsc --noEmit` EXIT=0；`eslint`（改动的 3 个文件）EXIT=0。
- **⚠️ 协议值仍在英文**：`TaskCard.status` / `priority` /
  `AgentStatusIndicator.status` 是 **A2UI 目录里的枚举** ⇒ 翻了客户端就解析不出来
  ⇒ `HIGH` / `in_progress` 不翻；⚠️ 但两端**显示**是一致的（桌面端徽标带
  `uppercase` 的 CSS、手机端显式 `toUpperCase()` ⇒ 两边都显示 `HIGH`）。
- **⚠️ 还欠的**：**移动端真机那一截**（设备上的 APK 与内嵌端脑都是旧的 ⇒ 看不到中文界面）；
  **协议值仍是英文**；**「空 / 失败」三态**（`Tasks (0)` 现在被当「成功」）仍未拆；
  **桌面端没有 shadow key 输入入口**（既有缺口）⇒ 端脑配了 key 而桌面端没有 ⇒ 面板 401。

## STATE STATUS (2026-11-01, 「空 / 失败」三态)

- **✅ 端脑有三种回答，客户端以前并成了两种，还把端脑的原话丢了**
  （父仓 `shadow/AGENTS.md` ㋕ 条记整片；移动端那一侧见 `shadow-mobile/AGENTS.md` ㋂ 条）。
  - **⚠️ 病**：纯文本与「什么都没有」并成 `empty` ⇒ 界面上先压一句**「暂无数据」**
    再显示端脑的原话 ⇒ ⇒ **「端脑明明说了话」被说成「没有数据」**。
  - **✅ 修**：`a2uiProtocol.ts` 新增 `isStructurallyEmptySurface`（**结构规则**：
    除 `Column`/`Text` 之外没有别的组件 ⇒ 空 ⇒ ⚠️ **规则反过来写**，
    端脑加新组件时**不会**把有内容的界面说成空的）；
    `A2uiSurface.tsx` 把「空」标到 DOM（`data-surface-empty="true|false"` ⇒ **机器可判**）；
    `A2uiPanel.tsx` 的 `PanelState` 增 `text` 档 ⇒ **纯文本时只显示端脑的原话**，
    `empty` 档**只**留给「端脑什么都没说」。
  - **⚠️ 一条刻意的决定**：空 surface 与「有内容」的 surface **界面上长得一样** ——
    因为**端脑自己已经在空 surface 里说了实话**（「任务（0）」「还没有任务」）
    ⇒ 客户端**不再补一句**概括 ⇒ 两处文案不打架；⇒ 但**状态可判**（`data-surface-empty`）。
  - **✅ 测试 + 反向验证**：`a2ui.test.tsx` **19 ⇒ 24 passed**（新 5 条）⇒
    全量 **124 文件 / 1238 通过 / 6 跳过 / 0 失败**；`tsc --noEmit` EXIT=0；`eslint` EXIT=0；
    ⚠️ **反向验证**：把「暂无数据」放回纯文本分支（＝**修复前的形状**）⇒ **恰好 1 条红**、
    其余 23 条仍绿 ⇒ 断言有分辨力、不是恒绿。
  - **⚠️ 顺带记一条：上面那个「失败说真话」的洞**只在移动端** ——
    桌面端同一件事**本来是对的**（`requestA2uiSurface` 对非 2xx 抛 `A2uiHttpError`
    ⇒ 面板的 `.catch` 直接进 `phase: 'error'`）；
    ⚠️ 但桌面端那条错误文案是**硬编码中文**（`a2uiClient.ts` 的 `A2uiHttpError`）
    ⇒ **英文界面里也是中文** ⇒ 既有小瑕疵（i18n 文件当时在飞 ⇒ 没动）。
  - **⚠️ 还欠的**：**移动端真机那一截**；**「空」仍是客户端的结构推断**
    （端脑还没显式声明状态）；**桌面端没有 shadow key 输入入口**。

## STATE STATUS (2026-11-01, 「读不到」不许长得像「没有」—— 桌面端三态收进一份实现)

**Completed** ✅:

- **⚠️ 病（三处，同一个病：「问不到」被折成「没有」）**：
  - `pages/SettingsPage.tsx` 两处 `fetchProviders` 的 `catch { setProviders([]) }`
    ⇒ ⇒ 供应商列表**读不到**时界面显示「**暂无模型供应商**」⇒ ⇒ 用户于是去
    **重复配置已经配好的东西**⇒ ⇒ 而真正的原因（门关着 / 端脑没起）
    **一个字都没人告诉他**；
  - 同文件 `InternalAgentCard` 的**模型下拉** ⇒ ⇒ 读不到时只剩「不设默认模型」
    一个选项 ⇒ ⇒ 等于告诉用户「你没模型」；
  - `pages/ModelOnboardingPage.tsx` ⇒ ⇒ 云那半 401（门关着）⇒ ⇒ 这一页说
    「**你没配模型**」⇒ ⇒ 而 `AppInitializer` 那一处**已经修好了**（不踢）
    ⇒ ⇒ **同一个病、两处症状**⇒ ⇒ 而用户看到的恰恰是**没好的那一处**
    （onboarding 页就是「说没配」的那张脸）。
- **✅ 修（一份实现，多处调用）**：新模块 `src/lib/modelConfigProbe.ts`
  ⇒ ⇒ 三态判定（`configured` / `not-configured` / `unknown`）+ 两发探测
  （`probeCloudProviders` / `probeLocalModels`）+ 列表三态
  （`providerListState`：`ready` / `empty` / `unreadable`）
  ⇒ ⇒ **`AppInitializer` 与 `ModelOnboardingPage` 现在共用它**
  ⇒ ⇒（以前各抄一份 ⇒ ⇒ 改了一边忘了另一边 ⇒ ⇒ 一个病两处症状）。
  - ⚠️ **`combineModelConfig` 是「搬运」不是「改判」**：与 `AppInitializer`
    修复前的行为**逐条等价**（云那半问到了才算「没配」；本地那半只在「有」
    时加分 —— 本地读不到 ≠ 用户没配）⇒ ⇒ **Tauri 路径也改走它**（本地那半
    原来自己打 neuron 面，现在也走共享探测 ⇒ ⇒ 「本地模型在哪张面」只写一次）。
  - ⚠️ **唯一一处比旧代码更严**：云那半 **200 但 body 形状不对**（端脑回的是
    `Json<Vec<ProviderView>>` ＝ 数组；拿到别的形状 ⇒ 这一发**没问对**）
    ⇒ ⇒ 旧写法当成「确认空」（＝确认没配）⇒ ⇒ 现在归「**问不到**」
    ⇒ ⇒ 免得一个版本不匹配的部署**把用户踢回向导**。
- **✅ 界面**：onboarding 页新增 `unknown` 分支（「连不上端脑」＋「稍后配置」
  ⇒ ⇒ **不放也不拒**）；设置页供应商列表三态（`unreadable` ⇒ 「读不到供应商
  列表」＋原因提示，**不用**「暂无模型供应商」）＋ 底部计数三态；内部代理卡片
  的模型下拉在读不到时**禁用**并显示读不到的原因（**不许**只剩「不设默认模型」）。
- **⚠️ 一条可复用的工程事实（本轮当场踩到并验掉）**：**模块加载时求值**会引入
  隐性耦合 —— 新模块若在**导入时**就调 `prefrontalUrl()` / `neuronUrl()`
  ⇒ ⇒ 那些对 `platform` 做**部分 mock** 的既有测试（只给 `isTauri` /
  `prefrontalUrl`）**直接加载失败**（vitest：No "neuronUrl" export is defined）
  ⇒ ⇒ ⇒ 改成**函数里惰性求值** ⇒ ⇒ 导入本模块不再碰 `platform` ⇒ ⇒ 老测试照旧
  ⇒ ⇒ **「新模块在加载时碰了谁」是一条要付的税**。
- **⚠️ 另一条：机器闸判不判得了，取决于「形状」**：闸
  `scripts/check-provider-admin-headers.mjs` 要在**同一个文件里**找到
  ① base 的赋值 ② 凭据的来源 ⇒ ⇒ 把 base 做成**形参** ⇒ ⇒ 闸**判不了**
  （判不了 ≠ 没问题 ⇒ ⇒ 闸会报红）⇒ ⇒ ⇒ 所以共享模块**自己拥有**两张面与
  凭据（`adminHeaders()` 只在这一处出现）⇒ ⇒ 闸直接判绿：「headers（简写）
  —— 它来自 admin 凭据」⇒ ⇒ **闸绿 8 / 红 0 / 判不了 0**。
- **✅ 证据**：`tsc --noEmit` EXIT=0；新 `src/lib/__tests__/modelConfigProbe.test.ts`
  **21 条**；`AppInitializer.test.tsx` **6 条**（重构后逐条仍绿 ⇒ 证明等价）；
  `ModelOnboardingPage.test.tsx` **3 ⇒ 6 条**（新 3 条钉「问不到 ≠ 没配」）；
  `tests/e2e/settings-lifecycle.test.tsx` **20 条**（加载失败那条已修）。
  ⚠️ **反向验证**：把 `combineModelConfig` 的「问不到 ⇒ unknown」翻回病灶
  （⇒ `not-configured`）⇒ ⇒ **恰好 6 红**（模块 ③⑤ / onboarding ④⑥ /
  AppInitializer ①①b），其余 25 条纹丝不动；再把「形状不对 ⇒ 问不到」那条
  拆掉 ⇒ ⇒ **恰好 2 红**（模块 ⑥ / onboarding ⑥）⇒ ⇒ 断言钉在真东西上、不是恒绿。
- **⚠️ 全量回归里的 1 条 flaky（既有，非本轮引入）**：
  `tests/e2e/conversation-lifecycle.test.tsx` 的「shows select or create message
  when no active conversation」—— 它 `await` 动态 import 之后**同步**断言
  （**没有 `waitFor`**）⇒ ⇒ 全量并发高负载时 import 还没解析完就断言 ⇒ ⇒
  偶发红；⇒ ⇒ 单跑 **18/18 全绿** ⇒ ⇒ 与本轮改动零交集（`ConversationPage`
  不碰本轮任何文件）。
- **⚠️ 还欠的**：**web 形态 6 处条件 401**（没有 sidecar ⇒ admin token 要用户
  自备 `localStorage`）⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**；
  **桌面端 shadow key 输入入口**仍然欠着（但它**不是**上锁的阻塞项）；
  **真机 UI 未验**（本轮只有单测与机器闸）；**「形状不对」这条更严的判定**
  对 `AppInitializer` 也是新的（以前非数组 ＝「确认空」）⇒ ⇒ 行为**收紧**了
  一点点（方向：宁可说「问不到」，也不说「你没配」）。

## STATE STATUS (2026-11-01, 真浏览器那一发 —— 「看起来对不对」只有眼睛能钉)

- **✅ 上一条欠的「真机 UI 未验」，本轮换成「真浏览器已验」**：新 Playwright spec
  `tests/e2e-ui/three-state-providers.spec.ts`（4 条）⇒ ⇒ 真 Chromium + **构建产物**
  ⇒ ⇒ **4 passed / 10.3 秒** ⇒ ⇒ 三档各钉在 `data-state` 上（`unreadable` /
  `empty` / `ready`），**不钉文案**（文案随语言走 ⇒ ⇒ 默认 zh-CN）。
- **⚠️ 为什么是「构建产物」而不是 dev server**：本机被别人会话的编译占满
  （4 cargo + 4 rustc、load 99%）⇒ ⇒ vite 逐模块 transform 把浏览器**饿死**
  （首屏 `GET /` 实测 **38.4 秒**；`/settings` 的 `load` **180 秒**没等到
  ⇒ ⇒ 失败截图**全白**）⇒ ⇒ ⇒ 改跑**静态预览**（`vite build --config
  vite.config.web.ts` 约 24 秒 ⇒ ⇒ 浏览器只下一个 bundle ⇒ ⇒ 页面**秒开**）
  ⇒ ⇒ ⇒ 为此 `playwright.config.ts` 加了三个环境变量（`SHADOW_E2E_BASE_URL`
  / `SHADOW_E2E_SERVER_URL` / `SHADOW_E2E_SERVER_CMD`）⇒ ⇒ **dev server 与
  构建产物两条路都能跑**（默认仍是 dev server ⇒ ⇒ 不影响既有 spec）。
- **⚠️ 断言要比**决定性字段**：④ 原本比两档的整块 `innerText` ⇒ ⇒ 提示语不同就能
  蒙过去 ⇒ ⇒ 改成比**标题那一行**（`innerText` 的第一行）⇒ ⇒ ⇒ 断言这才钉在「用户
  第一眼看到的那句话」上。
- **✅ 反向验证（在真浏览器里做）**：把「空档」的标题换成「读不到档」的标题 ⇒ ⇒
  **恰好 2 红**（② ④），① ③ 绿 ⇒ ⇒ 还原后 **4/4 再绿** ⇒ ⇒ 断言钉在真东西上、不是恒绿。
- **✅ 其余**：`tsc --noEmit` EXIT=0；定向 vitest **33 条**；全量 vitest __VITEST__；
  **七道闸全 EXIT=0**。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是真浏览器 + 构建产物，不是桌面真机）；
  **web 形态 6 处条件 401**（web 版没有 sidecar ⇒ admin token 要用户自备 `localStorage`）
  ⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**；**桌面端 shadow key 输入入口**仍欠（**不是**
  上锁的阻塞项）。

## STATE STATUS (2026-11-01, 探针与列表读的是**同一张面**，却递了**不同的钥匙**)

- **⚠️ 病（自相矛盾）**：客户端有**两发**读 `/models/providers`（读门 = shadow ∪ admin）：
  ① **列表**（`SettingsPage` → `telencephalonClient.listProviders()` → `request()`）
     ⇒ ⇒ **shadow ∪ admin 两把都递**（`telencephalonClient.ts`：`if (this.apiKey) headers['X-Shadow-Key'] = …`
     ＋ `X-Admin-Token`）⇒ ⇒ ⇒ **读门认哪把都能过**；
  ② **探针**（`modelConfigProbe.probeCloudProviders()`）⇒ ⇒ **只递 admin**
     （`adminHeaders()`）⇒ ⇒ ⇒ **shadow key 它拿不到**。
  ⇒ ⇒ 于是在「**独立端脑服务器** + 那台机器**配了 shadow key** + 桌面端**填了 shadow key**」
  这一个形态上（端脑的 admin 面是 **fail-closed** 的 ⇒ 桌面 sidecar 那把 admin token
  **对不上** ⇒ ⇒ 读面只剩 **shadow** 那把）⇒ ⇒ **列表读得到、探针读不到** ⇒ ⇒
  ⇒ ⇒ **`AppInitializer` 与 onboarding 那一格会说「问不到端脑」** ⇒ ⇒ **而设置页那一格
  明明列出了供应商** ⇒ ⇒ ⇒ **同一个客户端、同一个端脑，两处给出互相矛盾的说法**。
- **⚠️ 根因是上一轮那条决策的前提不成立**：探针里写着「**刻意不发 `X-Shadow-Key`**：
  读门认的是 shadow ∪ admin，admin 是另一把钥匙 ⇒ 这一发带 admin 就够」⇒ ⇒
  **「带 admin 就够」只在「客户端手里有 admin token」时成立** ⇒ ⇒ 而独立端脑服务器形态
  **没有**（端脑只认 `TELENCEPHALON_ADMIN_KEY`，且 fail-closed）⇒ ⇒ ⇒ **前提是假的**。
- **✅ 修法（一条规则）**：**客户端读面的凭据集合必须与门形一致** ⇒ ⇒ 读门 = shadow ∪ admin
  ⇒ ⇒ ⇒ 客户端读面就递 **shadow ∪ admin**（**不是**二选一）⇒ ⇒ ⇒ 于是「列表能读、探针读不到」
  这件事**结构上不可能**发生。
- **✅ 那个口子开了（`7e45429` → `8781373`）**：`getApiKey()` 已入库 ⇒ ⇒ store → client
  的同步也入库了 ⇒ ⇒ ⇒ **这个矛盾从那一刻起是「活的」**（在那之前客户端**根本递不出**
  shadow key ⇒ ⇒ 两发都只递 admin ⇒ ⇒ **一致** ⇒ ⇒ 矛盾**不活**）
  ⇒ ⇒ ⇒ 探针那笔修复合入 `8781373`（探针递 **shadow ∪ admin**）⇒ ⇒ ⇒ 已在活仓 HEAD 上复验。
  ⚠️ **订正上一句**：HEAD 上**连 `setApiKey` 都没有**（不只是缺 `getApiKey`）⇒ ⇒
  当时那句「只有私有的 `this.apiKey` 与 `setApiKey`」**不成立** ⇒ ⇒ ⇒ 以本条为准。
- **⚠️ 一条可复用的判据**：**同一个端点、客户端有两发读它** ⇒ ⇒ 先核「两发带的凭据集合
  是不是同一个」⇒ ⇒ **不是的话，先出现的矛盾是「一处说读到了、另一处说读不到」**
  ⇒ ⇒ 而不是「都读不到」⇒ ⇒ ⇒ 而这种矛盾**单测很难发现**（两条路各自都绿）。
## STATE STATUS (2026-11-01, 桌面端那把 shadow key 真的能用了 —— 探针与列表终于递同一套钥匙)

- **✅ 病（一个客户端、同一张面，两处互相矛盾）**：`/models/providers` 这张面在端脑那边是
  **读门（shadow ∪ admin）**，而客户端有**两发**读它：
  - **列表**（`SettingsPage` → `telencephalonClient.listProviders()` → `request()`）⇒ **shadow ∪ admin 两把都递**；
  - **探针**（`modelConfigProbe.probeCloudProviders()` ⇒ 裸 fetch）⇒ 以前**只递 admin**。

  ⇒ ⇒ 于是在「**独立端脑服务器** + 那台机器**配了 shadow key** + 桌面端**填了 shadow key**」
  这一个形态上（端脑的 admin 面 **fail-closed** ⇒ 桌面 sidecar 那把 admin token **对不上**
  ⇒ ⇒ 读面只剩 **shadow** 那把）⇒ ⇒ **列表读得到、探针读不到**
  ⇒ ⇒ ⇒ `AppInitializer` 与 onboarding 那一格说「**问不到端脑**」
  ⇒ ⇒ **而设置页那一格明明列出了供应商** ⇒ ⇒ ⇒ **同一个客户端、同一张面，两处互相矛盾**。
- **⚠️ 根因是一句写进注释的假前提**：「读门认的是 shadow ∪ admin，admin 是**另一把**钥匙
  ⇒ 这一发带 admin 就够 ⇒ 不多递一把」⇒ ⇒ **那个前提只在「客户端手里握有 admin token」时成立**。
- **✅ 修（一条规则）**：**客户端读面的凭据集合必须与门形一致** ⇒ 门认哪几把，客户端就递哪几把
  ⇒ ⇒ 探针现在把 `telencephalonClient.getApiKey()` 那把**一并递上**
  ⇒ ⇒ 拿不到就**不带那个头**（绝不塞空串：空串与空串相等 ⇒ 等于带对了 ⇒ 反而把门骗开）
  ⇒ ⇒ 顺带把「shadow key 的唯一出处」钉成 client（与发请求的那个 client 是**同一把**）
  ⇒ ⇒ 「列表用一把、探针用另一把」结构上不可能。
- **✅ 顺带把「那把 shadow key 真的能用了」补齐（`7e45429`）**：
  - `telencephalonClient` 补 `setApiKey()` / `getApiKey()`（之前**没有 getter** ⇒
    「client 到底有没有拿到 key」**无法从外部观察**，只能靠猜）；
  - `telencephalonStore.setApiKey` 现在**同步给 client**（以前只改 store ⇒ client 永远拿不到 key
    ⇒ 端脑一开 `shadow.api_key` ⇒ 客户端**全量 401**）；
  - `telencephalonStore` 补 `onRehydrateStorage` ⇒ 重启后把 baseUrl 与 apiKey **推回 client**
    （`persist` 只灌 store ⇒ 用户改完地址**重启后又打回默认**，而 store 里看着是对的）；
  - `TelencephalonStatusPage` 不再写死 `localhost:60080`（改读 store），路径前缀从**根本不存在的**
    `/api/cortex/*` 改成 `/api/telencephalon/*`（服务端 `system_status.rs:6-7` ⇒ 那一页以前一直 404）；
  - zh-CN 的 `cortexStatus.connectionHint` 改成插值 `{{url}}` ⇒ 否则中文界面会告诉用户一个**写死的端口**。
- **⚠️⚠️ 一条被实测钉住的读数：「HEAD 编译不过」** —— 在 `7e45429` 之前，
  `ConversationPage.tsx` 调用 `telencephalonClient.getApiKey()`，而 client 类**没有那个方法**
  ⇒ ⇒ **实测**（把旧 client 文件放回去跑 `tsc --noEmit`）⇒ **3 条 TS2339**
  ⇒ ⇒ ⇒ **桌面端在那一版 HEAD 上根本编译不过** ⇒ ⇒ 「getter 还没入库」不只是「少个方法」，
  是**整个桌面端构建是断的** ⇒ ⇒ ⇒ **凡是说「HEAD 缺 X」的读数，都要先问「那 HEAD 编译过吗」**。
- **✅ 证据 + 反向验证**：探针单测 **21 ⇒ 24 passed**（新增 3 条）；store 单测**新增 5 条**；
  `tsc --noEmit` EXIT=0；全量 vitest **1262 ⇒ 1265 passed / 0 failed**；
  闸 `scripts/check-provider-admin-headers.mjs` ⇒ **绿 8 / 红 0 / 判不了 0**、EXIT=0，
  且它现在把探针那一发报成「**直接带 shadow 凭据（这道门认 shadow 或 admin）**」⇒ ⇒ 机器闸看得见两把钥匙了；
  ⚠️ 反向验证：拆掉 shadow key 那一把 ⇒ **恰好 2 红**；拆掉 `setApiKey` 的同步 ⇒ **恰好 2 红**；
  拆掉 `onRehydrateStorage` ⇒ **恰好 2 红**；其余纹丝不动。
- **⚠️ 还欠的**：**桌面端没有「输入 shadow key」的入口** ⇒ ⇒ setter 有、但**没有 UI 调用方**
  ⇒ ⇒ 「配了能生效、但**无处可配**」⇒ ⇒ 那个入口仍欠；
  **en-US.json 没有根级 `cortexStatus`** ⇒ 英文界面落回代码里的默认值（那句默认值是**中文**）；
  **web 形态的 6 处条件 401**（web 没有 sidecar ⇒ admin token 要用户自备）。

## STATE STATUS (2026-11-01, 「同一张面」有**两个字**：**钥匙**与**地址** —— 钥匙已补齐，**地址还在分叉**)

- **⚠️ 病（同一个病，换了个面）**：客户端**两发**读 `/models/providers`（读门 = shadow ∪ admin），
  「同一张面」这件事其实有**两个**条件：**同一个地址** + **同一套钥匙**。
  ⇒ ⇒ **钥匙**那一半已由 `8781373` 补齐（探针递 shadow ∪ admin）⇒ ⇒ **地址**那一半还分叉：
  * **列表**（`telencephalonClient.listProviders()`）⇒ 打 **client 的地址**
    （`store.connection.baseUrl` ⇒ 用户可配 ⇒ 持久化 ⇒ 重启复原 ⇒ `7e45429` 之后才不是写死的）；
  * **探针**（`modelConfigProbe.probeCloudProviders()`）⇒ 以前打 **`prefrontalUrl()`**
    ⇒ ⇒ 那是 platform 里**写死**的 `localhost:60080`（`platform.ts:57-63`）。
  ⇒ ⇒ ⇒ 用户改过端脑地址之后 ⇒ ⇒ **列表打新地址、探针打老地址** ⇒ ⇒
  ⇒ ⇒ ⇒ 「列表读到了、探针说问不到端脑」—— **自相矛盾，只是这次错的是地址**。
  ⇒ ⇒ ⇒ 而**探针那半只在 web 形态跑**（Tauri 形态走 `invoke('provider_list')`）
  ⇒ ⇒ ⇒ ⇒ ⇒ **web 形态下这个分叉是常态**（web 没有 sidecar ⇒ 地址只能用户自己配）
  ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **而 web 形态恰恰是 shadow key 最要紧的那个形态**。
- **✅ 修（一条规则，两件事）**：**两发读同一张面 ⇒ 必须同一个地址、同一套凭据**
  ⇒ ⇒ 探针的 base 改成 `telencephalonClient.getBaseUrl()`（= 列表那一发的地址）
  ⇒ ⇒ ⇒ 「同一张面」从此不是口号，而是**结构上的同一**。
- **⚠️ 一条通用代价：「判不了」必须当红** —— 机器闸 `check-provider-admin-headers.mjs`
  的 `classifySurface()` 原来只认 `prefrontalUrl()` / `store.connection.baseUrl`
  ⇒ ⇒ **新的形状它认不出来** ⇒ ⇒ ⇒ 闸当场报「**判不了**」（红 ⇒ EXIT=1）
  ⇒ ⇒ ⇒ ⇒ 这条规矩又生效了一次：形状变了而闸没跟上 ⇒ **闸报红是对的**
  ⇒ ⇒ ⇒ ⇒ 修法是**升级闸**（不是让它猜）：多认 `telencephalonClient.getBaseUrl()`
  ⇒ ⇒ ⇒ ⇒ + `--self-test` 里加一条钉它 ⇒ ⇒ ⇒ ⇒ 回到 **绿 8 / 红 0 / 判不了 0 / EXIT=0**。
- **✅ 新增证据（运行时，不是「读代码觉得对」）**：新文件
  `shadow-desktop/src/lib/__tests__/readDoorCredentials.test.ts`（**5 条**）
  ⇒ ⇒ **真 client + 真 probe**（只替换传输层 fetch 与两把钥匙的来源 ⇒ ⇒ 路径/请求头/解析全是生产代码在跑）
  ⇒ ⇒ **stub 就是那道门**（读门 = shadow ∪ admin ⇒ 有任一把就放行 ⇒ 一把都没有就 401）
  ⇒ ⇒ ⇒ ① **只有 shadow key** ⇒ 两发都过得去（**这正是曾经坏掉的那个形态**）
  ⇒ ⇒ ⇒ ② 只有 admin token ⇒ 两发也都过得去
  ⇒ ⇒ ⇒ ③ 两把都没有 ⇒ **两发一起失败**，而探针说的是「**问不到**」（`known:false`）不是「没有」
  ⇒ ⇒ ⇒ ④ 两发递的是**同一个钥匙集合**
  ⇒ ⇒ ⇒ ⑤ 两发打的是**同一个地址**
- **✅ 反向验证（断言钉在真东西上、不是恒绿）**：把探针退回「**只递 admin**」⇒ ⇒ **恰好 2 红**（① ④）
  ⇒ ⇒ 退回「**写死地址**」⇒ ⇒ **恰好 1 红**（⑤）⇒ ⇒ ⇒ 还原后 **5/5 再绿**。
- **✅ 其余证据**：`tsc --noEmit` EXIT=0；全量 vitest **127 文件(+1 跳过) / 1271 通过 / 6 跳过 / 0 失败**
  （基线 1265 ⇒ +6：跨会话 5 + 探针地址 1）；真浏览器 E2E **4 passed (8.5s)**（构建产物那条路）；
  **七道闸全 EXIT=0**。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是真浏览器 + 构建产物）；
  **web 形态 6 处条件 401**（web 没有 sidecar ⇒ admin token 要用户自备 `localStorage`）
  ⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**（⚠️ 一旦落地 ⇒ ⇒ 钥匙进 store → client
  ⇒ ⇒ ⇒ **两发同时生效** ⇒ ⇒ 因为探针现在也递 shadow ∪ admin）；
  **桌面端 shadow key 输入入口**仍欠（**不是**上锁的阻塞项）。


## STATE STATUS (2026-11-01, 「读面的凭据集合必须与门形一致」—— 桌面端剩下那几处读面递的是**半套钥匙**)

- **⚠️ 病（半套钥匙 ⇒ 同一张面两处互相矛盾）**：桌面端有 **4 处**读面是**裸 fetch**，
  其中 **3 处只递 `X-Admin-Token`**（`TelencephalonStatusPage.tsx` 的 status/logs
  + `telencephalonClient.health()` 的 Tauri 分支）⇒ ⇒ 而门形是**读门 = 影子锁 ∪ admin token**
  ⇒ ⇒ **少递一把** ⇒ ⇒ 在「客户端手里只有影子锁」的形态上（独立端脑服务器 + 那台机器
  配了 shadow key + 桌面 sidecar 那把 admin token 对不上）⇒ ⇒ 那 3 处 **401**
  ⇒ ⇒ 而同一张面的另一发（`telencephalonClient.request()`）**读得到**
  ⇒ ⇒ ⇒ 「列表读得到、状态页读不到」。
- **✅ 修（一条规则、一处实现）**：新模块 `src/lib/readDoorHeaders.ts`
  ⇒ `readDoorHeaders(shadowKey?)` ⇒ **影子锁 ∪ admin token**（各一把，**有就带**；
  **拿不到就不带那个头** ⇒ 绝不塞空串 ⇒ 空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开）
  ⇒ ⇒ client 的 `readHeaders()` / `request()` / `streamMessage()` 与端脑状态页的
  status/logs **都走它** ⇒ ⇒ 不再各抄一份。
- **⚠️⚠️ 一条必须钉住的边界：钥匙只递给它所属的那张面** —— `ModelsPage.tsx` 的读面
  （`GET /models/providers`）**本轮故意没改** ⇒ 因为它打的地址是 `prefrontalUrl()`
  （**构建期口径**）⇒ ⇒ 与 client 那张面（用户可配 ⇒ 持久化）**可能不是同一台**
  ⇒ ⇒ 把 client 的影子锁递过去 = **把一把机器级钥匙递给另一台机器**
  ⇒ ⇒ ⇒ 要统一得先定「web 形态的地址契约」（**另一个决定**）
  ⇒ ⇒ 本轮**只修地址明确同源的那几处**（状态页的地址取自 store ⇒ 而 store 的
  `setBaseUrl`/`setApiKey` **同步给 client** ⇒ ⇒ 那就是 client 那张面）。
- **✅ 证据（运行时，不是「读代码觉得对」）**：新增 **8 条**
  （`src/lib/__tests__/readDoorHeaders.test.ts` 7 + `src/pages/__tests__/TelencephalonStatusPage.test.tsx` 1
  ⇒ 那一页**真的渲染** ⇒ ⇒ 钉的是「它**实际发出去**的请求头」）
  ⇒ ⇒ `tsc --noEmit` **EXIT=0**；eslint **0 error**（7 条 `any` warning 是既有的）
  ⇒ ⇒ 三道闸（providers / door-policy / client-endpoint-map）**EXIT=0**
  ⇒ ⇒ 全量 vitest **1280 passed / 0 failed**（1271 ⇒ +9）。
- **✅ 反向验证**：把 `readDoorHeaders` 退回「**只递 admin**」⇒ ⇒ **恰好 5 红**
  （① ② ⑥ ⑦ + 页面那条）⇒ ⇒ 其余 3 条仍绿 ⇒ ⇒ 还原后 **8/8 再绿**。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是单测 + 真渲染）；**`ModelsPage` 的地址契约**
  （见上）；**web 形态 6 处条件 401**；**桌面端 shadow key 输入入口**仍欠。

