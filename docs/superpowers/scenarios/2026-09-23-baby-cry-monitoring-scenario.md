---
**Updated:** 2026-09-23 (initial scenario; introduces the 4-lobe terminology used across BC-01..BC-05; cross-references telencephalon AGENTS.md §4-lobe model)
**Status:** 🔵 草案 → 评审中
**Author:** diencephalon + telencephalon + shadow-desktop
**Spec companions:** none yet (this doc *is* the spec for the audio-monitoring flow)
**Plan companion:** none yet
**Layer coverage:** L4 (shadow-desktop UI) ↔ L3.5 (telencephalon, 4 lobes) ↔ L2-equivalent (diencephalon audio pipeline) ↔ L0 (hippocampus blob for evidence audio)
**Related docs:**
- `shadow/docs/superpowers/scenarios/visual-qa-scenarios.md` — established scenario format (VQA-01..VQA-06); BC-* follows the same template.
- `shadow/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md` — overall 4-layer platform (Interaction / Agent / Engine / Model) this scenario runs on.
- `telencephalon/AGENTS.md` § 4-lobe model (added alongside this scenario) — canonical mapping of 颞叶/枕叶/顶叶/前额叶 to code paths.
- `diencephalon/AGENTS.md` — sensory pipeline + zero-shot audio event detection (relies on `from_audio_classifier` + `event_nms`).

---

## 0. Why this scenario exists

Shadow's existing scenario scenarios (`visual-qa-scenarios.md`, VQA-01..VQA-06) are all **video-centric** — frame capture, mage_vl captioning, peer-source routing. There is no audio path today: no `audio_sources` table, no `AudioCaptureLoop`, no `AcousticMonitorLobe`, no `LobeSession::Audio`. **This scenario is the first audio flow** in the platform and exercises the *full* lobe set (颞叶 ↔ 前额叶 ↔ 间脑 + 顶叶/枕叶 for adjacent branches).

It also formalises the **"4-lobe model"** of the shadow interaction layer — 颞叶 / 枕叶 / 顶叶 / 前额叶 — which had been used informally across the 2026-08 visual-QA specs without being given a name. After this doc, "4 lobes" is the canonical term used across `telencephalon/AGENTS.md`, this file, and any future lobe-related design.

---

## 1. 4-lobe model (binding to code paths)

| Lobe | Code path | Responsibility | Status |
|---|---|---|---|
| **颞叶 (Temporal)** | `cortex/src/lobes/prefrontal.rs::TemporalLobe` (Spec #6) | User dialog surface — receive natural language input, render SSE output (text + optional TTS via neuron TTS) | Scaffolded (Spec #6 design-only for video context); needs audio-flow extension |
| **枕叶 (Occipital)** | `cortex/src/lobes/visual_qa.rs::VisualQALobe` (Spec #3) | Visual QA: A2A `visual_qa` skill, mage_vl frame captioning | Spec #2 routing in review; Spec #3 implementation planned |
| **顶叶 (Parietal)** | `parietal-lobe/` monorepo | Task planning / project management (Plane clone) | 9-phase plan, Phase 1 partial |
| **前额叶 (Prefrontal)** | `cortex/src/lobes/prefrontal.rs` (Layer 3.5) | Intent classification + agent dispatch + cross-device orchestration | Shipped; contains Spec #2 `visual_qa_router` |

**Inter-lobe protocols:**
- 颞叶 ↔ 前额叶: ACP messages (synapse::acp), user-confirmation round-trips via SSE
- 前额叶 ↔ 枕叶 / 顶叶: A2A `tasks/send` JSON-RPC over HTTP
- 前额叶 ↔ 间脑/diencephalon: **MCP** (currently missing — see §3 Open work)
- 间脑 ↔ 海马体/hippocampus: **MCP `blob_put` / `blob_get`** for audio evidence
- 颞叶 → user: SSE on `/api/shadow/events`

---

## 2. Scenarios

### BC-01 — Baby-cry monitoring (main flow, 9 steps)

**Setup**
- User on shadow-desktop asks in natural language: "监控家里声音，当小孩哭的时候提醒我" (monitor home sounds, notify me when the baby cries).
- `diencephalon` is up at port 60080 with an audio source registered for the home microphone (`camera_id="home-mic"`, `kind="audio"`, transport: local USB mic or Home Assistant integration).
- `telencephalon` (port 60080 → Layer 3.5 cortex) is running; all four lobes have a stub handler.
- `hippocampus` (port 8081) is up with a `blob_*` MCP server and FS backend.
- `neuron` is embedded in shadow-desktop's Tauri shell at `:8085` (candle runtime; default model Qwen2.5-0.5b for intent classification + a small TTS model).

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | User NL input | 颞叶 (UI) | local UI event | Shadow-desktop chat input captures the natural-language request. |
| 2 | 颞叶 → 前额叶 | 颞叶 → 前额叶 | ACP message | 颞叶 forwards the raw user text + session_id to 前额叶's `cortex::lobes::prefrontal::on_user_input` handler. |
| 3 | 前额叶 introspects | 前额叶 | in-process | 前额叶 checks: "can diencephalon subscribe to audio events with a baby-cry filter?" → yes (assuming §3 MCP is in place). Pre-built composite task plan: "subscribe_audio(home-mic, baby_cry, callback=acp://prefrontal)". |
| 4 | 前额叶 asks user to confirm | 前额叶 → 颞叶 → user | ACP reply + SSE | 前额叶 sends a clarification request to 颞叶: "I'll monitor the home mic for baby cries (≤ 3s response). Continue?" 颞叶 renders an SSE delta with a yes/no prompt. |
| 5 | User confirms | user → 颞叶 | UI | User clicks confirm. |
| 6 | 颞叶 → 前额叶 approved | 颞叶 → 前额叶 | ACP message | 颞叶 sends `{ action: "approved", task_plan: ... }` back to 前额叶. |
| 7 | 前额叶 → 间脑: build workflow | 前额叶 → diencephalon | **MCP** `tools/call subscribe_audio` | 前额叶 invokes the new diencephalon MCP tool (see §3): `subscribe_audio({ source: "home-mic", event_filter: "baby_cry", callback_url: "acp://prefrontal/baby-cry" })`. diencephalon starts a continuous audio ingest pipeline using `from_audio_classifier` + `event_nms` (v0.1.0 already has both). |
| 8 | Audio event fires | diencephalon | internal | diencephalon's audio classifier emits `AudioEvent { time_window: [t0, t0+0.5], confidence: 0.87, class_id: <baby_cry> }`. Above `min_confidence`, this triggers the callback. |
| 9 | diencephalon → 前额叶 | diencephalon → 前额叶 | **A2A `tasks/send`** (HTTP POST) | diencephalon POSTs to `acp://prefrontal/baby-cry` with the event payload + a `blob_uri` for the raw audio clip. 前额叶 enqueues the event for the user's session. |
| 10 | 前额叶 → 颞叶 confirmation | 前额叶 → 颞叶 | ACP message | 前额叶 forwards the event to 颞叶 as a `CortexStreamEvent::Delta { kind: Notification, text: "...", attachment: { audio_blob_uri: ... } }`. |
| 11 | 颞叶 → user | 颞叶 → user | SSE | 颞叶 pushes a notification card to the shadow-desktop UI ("宝宝在哭 — 13:42:07"). Optionally triggers `neuron::tts` for a spoken version of the notification (skipped if user has TTS disabled — `localStorage['shadow.tts.enabled']`). |
| 12 | Evidence persisted | diencephalon → hippocampus | **MCP `blob_put`** | diencephalon POSTs the 5-second audio clip to `hippocampus`'s blob backend (`BLOB_BACKEND=fs` by default; can be `s3`/`oss`/etc.) under `audio/home-mic/2026-09-23T13-42-07.opus`. User can later ask "show me the last time the baby cried" → 颞叶 → 前额叶 → MCP `blob_get` → render in 颞叶. |

**Edge cases / variants covered separately: BC-02..BC-05.**

**Acceptance**
- End-to-end latency from cry onset to user SSE push ≤ 3 s on the local device (excluding network jitter for remote diencephalon).
- Zero data loss: every triggered event yields exactly one SSE notification, one A2A callback, one `blob_put` evidence row.
- Privacy: raw audio never leaves the diencephalon process boundary except to local hippocampus blob; the event label (e.g. `class_id` + `confidence`) is the only thing crossing ACP/A2A to 前额叶.
- User can disable monitor at any time via 颞叶 → 前额叶 → MCP `unsubscribe_audio` + diencephalon stops the capture loop.

---

### BC-02 — False positive suppression (background TV vs. baby cry)

**Setup:** diencephalon's audio source includes TV output on the same home mic.

**Flow**
1. Same as BC-01 steps 1–11, but with `event_filter: "baby_cry + tv_news"` to widen the candidate set.
2. diencephalon emits overlapping `AudioEvent`s; `event_nms` collapses co-occurring TV + cry into a single higher-confidence "cry-during-tv" event.
3. If the merged confidence drops below 0.6, 前额叶 routes to **顶叶** (Parietal) for an LLM-based classification (a small text model on neuron decides "looks like cry" vs. "looks like TV with crying scene" from the audio embedding) — adds latency budget but reduces false positives.

**Acceptance:** False-positive rate ≤ 1 event / day per typical home; cost: up to 2 s extra latency when triggered.

---

### BC-03 — Multi-source arbitration (multiple home mics)

**Setup:** two mics — `home-mic-kitchen` + `home-mic-nursery` — both producing `baby_cry` events within 1 s.

**Flow**
1. diencephalon's audio ingest pipeline emits two events with overlapping time windows.
2. `event_nms` (already implemented in `diencephalon::audio`) collapses them to one event whose source list is `[kitchen, nursery]`.
3. 前额叶 does **not** fan out — single SSE notification to 颞叶.
4. Notification card carries source list so the user knows which rooms heard it.

**Acceptance:** Single notification per burst regardless of how many sources overlap.

---

### BC-04 — diencephalon offline mid-monitor

**Setup:** diencephalon process crashes (or restarts for upgrade) 5 minutes after BC-01 is armed.

**Flow**
1. 前额叶 detects dropped heartbeat (or A2A callback failure).
2. 前额叶 posts a status event to 颞叶 → SSE: "声音监控暂时离线，已自动重连 X 次".
3. On recovery, 前额叶 re-issues MCP `subscribe_audio` and resumes.
4. **No silent gap**: the user is notified of the outage even if events were lost.

**Acceptance:** Outage detection ≤ 30 s (heartbeat interval); recovery is automatic and idempotent (diencephalon dedupes by `source + event_filter`).

---

### BC-05 — User disables monitor

**Setup:** user wants to turn off the baby-cry monitor.

**Flow**
1. User: "停止监控" (stop monitoring).
2. 颞叶 → 前额叶 ACP.
3. 前额叶 → MCP `unsubscribe_audio(source="home-mic", filter="baby_cry")` → diencephalon stops the capture loop + cleans the in-memory subscription.
4. 前额叶 → 颞叶 SSE: "已停止监控 home-mic".
5. Evidence blobs in hippocampus are retained (user can still browse history) but no new blobs are written.

**Acceptance:** Cleanup is idempotent — calling unsubscribe twice does not error.

---

## 3. Open work / dependencies

This scenario cannot run end-to-end today because:

1. **diencephalon has zero MCP support** (audit 2026-09-23). Needs to depend on `synapse` and expose an MCP server over `Arc<Thalamus>` with at least these tools:
   - `query` — DataFusion SQL over registered sensors (already implemented as `crate::query::query`).
   - `subscribe_audio(source, event_filter, callback_url)` — **NEW**: spawn an `IngestSource`-style audio loop using `from_audio_classifier` + `event_nms`, fire callbacks.
   - `unsubscribe_audio(source, event_filter)` — **NEW**: stop the loop.
   - `sensor_stats` / `sensor_tail` — convenience for the agent debugging path.
   - `archive_clip` — L1→L2 spill, useful when the user wants the audio evidence backed up to NVR.

   Reference implementation pattern: `hippocampus/hippocampus-mcp/` (uses `rust-mcp-sdk`) or `synapse::mcp::SimpleMcpServer` for a lighter in-repo option.

2. **颞叶 lobe expansion** beyond Spec #6's video-context injection — chat-side routing for non-VQA flows (audio events, future MCP tool results) is design-only.

3. **Audio capture source** for diencephalon — diencephalon's current `IngestSource` trait is sensor-shaped (synthetic, MQTT, etc.). Need either a concrete `UsbMicSource` or a Home Assistant audio bridge source. (See `diencephalon/src/ingest.rs`.)

4. **顶叶 (Parietal) audio-classification path** for BC-02 fallback — only useful if false-positive rate needs further suppression; defer until BC-01 ships.

---

## 4. Acceptance checklist (BC-01 only, the headline)

- [ ] diencephalon exposes MCP server with `subscribe_audio` + `unsubscribe_audio` tools.
- [ ] 颞叶 renders an SSE confirmation card before invoking `subscribe_audio`.
- [ ] 前额叶 round-trip (颞叶 ↔ 前额叶 ↔ 间脑) ≤ 3 s end-to-end.
- [ ] Evidence blob lands in hippocampus with predictable key (`audio/<source>/<iso8601>.<ext>`).
- [ ] BC-04 outage detection works (drop 30 s heartbeat → SSE alert).
- [ ] Unit + e2e tests: diencephalon MCP `subscribe_audio` happy path; cortex e2e covers the full flow.