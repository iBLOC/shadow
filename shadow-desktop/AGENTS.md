# PROJECT KNOWLEDGE BASE

**Updated:** 2026-06-04
**Project:** shadow-desktop (Layer 4 — Interaction)

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

## STRUCTURE

```
shadow-desktop/
├── src/                          # TypeScript frontend (React 19)
│   ├── App.tsx                   # Root
│   ├── main.tsx                  # Entry
│   ├── pages/                    # Routes
│   │   ├── ConversationPage.tsx  # Includes CompanionModePanel (WebRTC)
│   │   ├── AgentsPage.tsx
│   │   ├── ModelsPage.tsx
│   │   ├── SettingsPage.tsx
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

## BUILD COMMANDS

```bash
pnpm dev                  # Vite dev (Tauri) on :1420
pnpm dev:web              # Vite dev (web SPA) on :5173
pnpm build                # Tauri build: validate-i18n + tsc + lint + vite build
pnpm build:web            # Web SPA build → dist-web/
pnpm preview:web          # Serve the built web SPA on :4173
pnpm tauri dev            # Tauri dev with hot reload
pnpm tauri build          # Production native bundle
pnpm test                 # Vitest
```

## BUILD TARGETS

The same `src/` produces **two artefacts**:

| Command | Output | Run-time |
|---|---|---|
| `pnpm build` → `pnpm tauri build` | `src-tauri/target/release/bundle/...` | Native binary (Linux/macOS/Windows) |
| `pnpm build:web` | `dist-web/` | Static SPA — host on Vercel / Netlify / S3 / GitHub Pages |

`src/lib/platform.ts` is the single source of truth for which target is in use. Tauri-only calls go through `src/lib/tauriSafe.ts::safeInvoke()` which returns `null` on the web build.

## STATE STATUS (2026-06-04)

**Completed** ✅:
- React 19 + Tauri 2 foundation
- Zustand stores for all entities
- PrefrontalClient (HTTP) with `/v1/*` standard + `/api/*` Prefrontal-specific methods
- New `lib/openaiClient.ts` typed wrapper for OpenAI /v1/* (chatCompletions, speech, transcriptions, listModels)
- ConversationPage with text chat
- **CompanionModePanel (WebRTC)** — `lib/webrtcCompanion.ts` + `stores/companionModeStore.ts` (VAD-driven, barge-in, multi-turn)
- **Discovery page** (`pages/DiscoveryPage.tsx`) — mDNS browser, manual add, active node, localStorage persistence
- i18n (zh-CN + en-US) with ~20 new keys for Discovery
- mDNS service discovery (HTTP-based via Prefrontal `/api/discovery/*`)
- **Tauri invoke migration** — `agentStore.fetchAgents()` now uses `prefrontalClient.listAgents()` over HTTP instead of `invoke('prefrontal_list_agents')`
- A2A-ready: HTTP client can talk to `/api/a2a/peers` for cross-service agent delegation

**Planned** 📋:
- Tauri Rust backend → embed Prefrontal core (drop in-process, no separate service)
- Finish SetupPage Tauri invoke migration (needs Rust HTTP endpoints for secure_auth + model_storage)
- Cross-device session transfer
- A2A peer card in Discovery page (promote a discovered node to a delegatable A2A peer)
