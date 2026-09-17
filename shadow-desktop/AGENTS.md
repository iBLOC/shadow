# PROJECT KNOWLEDGE BASE

**Updated:** 2026-08-23
**Project:** shadow-desktop (Layer 4 — Interaction)
**Sprint-2 status:** ✅ MCP management wired through cortex — AgentsPage per-card binding panel + bind modal + 12 new cortexClient methods + 18 i18n keys. 10 AgentsPage + 10 chartbi + 20 lib vitest tests passing (147 pre-existing failures in unrelated test files unchanged). TypeScript clean.

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
cortexClient.neure.models()                         → GET /api/cortex/neure/preview/models
cortexClient.neure.stats()                           → GET /api/cortex/neure/preview/stats
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

- **SettingsPage is the only home for model management.** Its Models section (`ModelsSection`) now covers: cloud provider CRUD (per-row Edit/Delete buttons + `AddProviderModal` in add or edit mode via `initialProvider`/`initialType` props), and local engine models via `components/business/LocalEnginePanel` (type tabs, neure `/v1/models` list, download queue with job polling, install/release, source-repo download dialog — ported verbatim from the deleted ModelsPage).
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

## STATE STATUS (2026-07-13, post-Sprint-2)

**Completed** ✅ (since 2026-07-13):
- **MCP management UI** (commits `0109bad`-precedent, `40ba82e`, `445df73`) — `MCPPage` and AgentsPage's per-card binding panel both read from the cortex admin API (no more browser-local mcpStore for MCP). 12 new methods on `cortexClient` (listMcpServers / create / delete / start / stop / bind / unbind / etc.) plus McpServerRecord / McpToolSummary / McpAgentBinding / McpServerList TS types matching the cortex wire format. AgentsPage now shows a McpBindingsPanel below each InternalAgentCard with truncated server_id chips that unbind on click, plus a 'Bind MCP' button that opens a per-agent modal showing currently-running servers not yet bound. 18 new i18n keys (mcpTitle / mcpStart / mcpStop / mcpBind / etc.) added to both zh-CN and en-US.
- **WASM fs-mirror + agent search bar** (commits `0109bad`) — Already in Sprint 1.

**Completed earlier** ✅:
- **ChatBI frontend** (commits `acc45be`, `f1e8e31` followup) — ConversationPage parses `ChartPayload` from cortex SSE and renders `ChartCard` via `echarts-for-react`; chartRegistry builds ECharts option per `VizType`. `isChatBiPayload` guard at `src/lib/chatbi/guards.ts`. 10 chartbi tests passing.
- **Agent search bar** (commit `0109bad`) — full-width Find-Agent panel above the internal section: skill filter + text query backed by `cortexClient.searchAgents({skill, q})`. Skill filter is exact; text is case-insensitive substring across name / description / skills / url.
- **Generate-description wired through cortex** (commit `b4f1f2c`) — replaced inline `openaiClient.chatCompletions({model:"gpt-4o-mini"})` in CreateCustomAgentModal with `cortexClient.generateAgentDescription(systemPrompt)`. Errors surface in a red banner; 503 → "Cortex LLM not configured".
- **WASM install UI** (commit `82f5494`) — AgentsPage WASM section between Custom and External. Lists installed binaries with size/sha/source badges. Delete per row. Refresh button. Disabled-when-cortex-stopped empty state. Cortex stores these in postgres `cortex_wasm_binaries` and mirrors to `${CORTEX_WASM_DIR or exe_dir}/wasm_modules/`.
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
- **Database type simplification** — 仅支持 `internal`（内部数据库）+ `distributed`（分布式数据库/Neon），移除 external pgsql
- **FlowsPage i18n** — "Cortex Flows" → "思维定式"
- **ResonancePage** — 独立共鸣管理页面，支持多实例配置、主实例设置、Agent 开放选择
- **AgentsPage unified** — Cortex & Lobe 合并入智能体页面，所有 lobe 视为内部智能体，支持为内部智能体设置模型
- **ModelOnboardingPage** — 应用启动时通过 neure API 检查模型配置，若无可用模型则跳转引导页。下载由 neure 后端处理（`POST /v1/models/pull`），用户可在下载期间自由导航

**Planned** 📋:
- Tauri Rust backend → embed Prefrontal core (drop in-process, no separate service)
- Finish SetupPage Tauri invoke migration (needs Rust HTTP endpoints for secure_auth + model_storage)
- Cross-device session transfer
- A2A peer card in Discovery page (promote a discovered node to a delegatable A2A peer)
- 思维定式编辑能力 — 用户可修改已抽象的流程
- Resonance 连接测试 — 实际 HTTP 连接检测 + 延迟测量
- 后端持久化 — lobe 模型绑定保存到 cortex/agent.json
