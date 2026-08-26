# Spec #2: cortex 视觉问答路由 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 cortex 在收到 chat 消息时识别 "简单视觉问答" 类意图，从本地或 peer cortex 的 active video source 中选目标，调对应枕叶的 A2A skill 拿 mage_vl 回复。

**Architecture:** prefrontal LLM 调用 → Intent::analyze_intent 加 VisualQA 变体 → visual_qa_router 仲裁 source（N=1 直走，N>1 走 metadata.shadow.clarification 预发问，0 报错）→ CortexA2AClient.send_task 调 peer。Peer cortex 端：broadcast loop 30s 心跳 + push cortex_video_sources snapshot。

**Tech Stack:**
- cortex: axum 0.8 + sqlx 0.8 + reqwest + tokio + existing mds_discovery + existing skill_router
- shadow-desktop: 现有 cortexClient.ts + i18n keys
- A2A: 现有 synapse::a2a 协议

**Spec:** `/home/ibloc/Projects/shadow/docs/superpowers/specs/2026-08-26-cortex-visual-qa-router-design.md`

---

## File Structure

### New files (cortex)

- `cortex/src/visual_qa/intent_ext.rs` — add `Intent::VisualQA` variant + `analyze_intent` extension
- `cortex/src/visual_qa/router.rs` — `route_visualqa()` core dispatch
- `cortex/src/visual_qa/peer_registry.rs` — in-memory `PeerSourceRegistry`
- `cortex/src/visual_qa/broadcast_loop.rs` — tokio task for heartbeat + push
- `cortex/src/visual_qa/clarify.rs` — `ClarifyRequest` shape + helpers
- `cortex/src/api/visual_qa_sources_broadcast.rs` — POST /api/cortex/visual-qa/sources-broadcast
- `cortex/src/lib.rs` — wire new module (pub mod visual_qa)

### Modified files (cortex)

- `cortex/src/lobes/intent.rs` — add `VisualQA` variant (or re-export from visual_qa module)
- `cortex/src/lobes/prefrontal.rs` — route Intent::VisualQA through visual_qa_router
- `cortex/src/state.rs` — AppState gains `PeerSourceRegistry` + `visual_qa_router`
- `cortex/src/server.rs` — wire the broadcast receiver route

### New files (shadow-desktop)

- `shadow-desktop/src/lib/cortexClient.ts` — extend with `cortexClient.sendVisualQAResponse(...)` (metadata parsing)

### Tests (cortex)

- `cortex/src/visual_qa/intent_ext.rs` (inline #[cfg(test)] mod tests)
- `cortex/src/visual_qa/router.rs` (inline tests)
- `cortex/src/visual_qa/peer_registry.rs` (inline tests)
- `cortex/tests/visual_qa_e2e.rs` (2-cortex integration: protocol broadcast + clarification chip metadata)

---

## Chunk 2.1: Intent extension + visual_qa_router

**Files:**
- Create: `cortex/src/visual_qa/mod.rs`
- Create: `cortex/src/visual_qa/intent_ext.rs`
- Create: `cortex/src/visual_qa/router.rs`
- Create: `cortex/src/visual_qa/clarify.rs`

- [ ] **Step 1: Write failing tests for intent fast-path**

In `cortex/src/visual_qa/intent_ext.rs`:

```rust
//! Extension to `cortex::lobes::intent::Intent` adding the VisualQA
//! variant. The base `analyze_intent` is unchanged; we layer a
//! post-pass that runs the regex fast-path. The optional LLM
//! second-pass is gated on the `OPENAI_INTENT_MODEL` env var.

use cortex::lobes::intent::{analyze_intent as base_analyze, Intent};

#[derive(Debug, Clone, PartialEq)]
pub enum VisualQaIntent {
    VisualQA {
        question: String,
        source_hint: Option<String>,
    },
}

const FAST_KEYWORDS_CN: &[&str] = &[
    "看", "看看", "这是什么", "看一眼", "识别一下", "看看前面",
    "识别", "看看有什么", "看到啥",
];
const FAST_KEYWORDS_EN: &[&str] = &[
    "show me", "what is this", "look at", "what's that",
    "identify", "what's in front", "see", "describe what",
];

pub fn try_visualqa_fastpath(text: &str) -> Option<VisualQaIntent> {
    let lower = text.to_lowercase();
    for kw in FAST_KEYWORDS_CN.iter().chain(FAST_KEYWORDS_EN.iter()) {
        if lower.contains(kw) {
            return Some(VisualQaIntent::VisualQA {
                question: text.to_string(),
                source_hint: None,
            });
        }
    }
    None
}

/// Optional LLM-based second pass; returns None if env unset or call fails.
pub async fn try_visualqa_llm(
    text: &str, openai_client: &openai::Client,
) -> Option<VisualQaIntent> {
    use std::env;
    let model = env::var("OPENAI_INTENT_MODEL").ok()?;
    let prompt = format!(
        "Decide whether the user message requires visual question answering \
         (i.e. they want to know what's in front of a camera). Reply with one word: \
         \"visual_qa\" or \"other\".\nMessage: {text}"
    );
    let resp = openai_client.chat_completions(model, &prompt).await.ok()?;
    let trimmed = resp.trim().to_lowercase();
    if trimmed == "visual_qa" {
        Some(VisualQaIntent::VisualQA { question: text.to_string(), source_hint: None })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chinese_keyword_命中() {
        let i = try_visualqa_fastpath("帮我看看前面有什么").unwrap();
        match i {
            VisualQaIntent::VisualQA { question, .. } => {
                assert_eq!(question, "帮我看看前面有什么");
            }
        }
    }

    #[test]
    fn english_keyword_命中() {
        let i = try_visualqa_fastpath("show me what's in front").unwrap();
        assert!(matches!(i, Some(VisualQaIntent::VisualQA { .. })));
    }

    #[test]
    fn no_keyword_returns_none() {
        assert!(try_visualqa_fastpath("帮我查一下任务列表").is_none());
        assert!(try_visualqa_fastpath("hi there").is_none());
    }

    #[test]
    fn case_insensitive_for_english() {
        assert!(try_visualqa_fastpath("LOOK AT THAT").is_some());
        assert!(try_visualqa_fastpath("Identify THIS").is_some());
    }
}
```

Run: `cd cortex && cargo test --lib visual_qa::intent_ext`
Expected: FAIL (module doesn't exist).

- [ ] **Step 2: Implement intent_ext**

Just the file above. Run tests: ALL PASS.

- [ ] **Step 3: Write failing tests for router**

In `cortex/src/visual_qa/router.rs`:

```rust
//! `route_visualqa` picks a target cortex (local or peer) and dispatches
//! the A2A visual_qa skill call. Returns a `VisualQaRouteResult`:
//! - `Forwarded(text)` — got mage_vl answer, return to chat reply
//! - `Clarify(ClarifyRequest)` — multiple candidates; return metadata chip picker
//! - `Error(...)` — no source configured / peer unreachable / a2a failed

use crate::visual_qa::clarify::{ClarifyRequest, VideoSourceCandidate};
use crate::visual_qa::peer_registry::PeerSourceRegistry;
use crate::visual_qa::intent_ext::VisualQaIntent;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum VisualQaRouteResult {
    Forwarded { text: String, source_id: String, peer_cortex_id: Option<String> },
    Clarify(ClarifyRequest),
}

#[derive(Debug, thiserror::Error)]
pub enum RouterError {
    #[error("no video source configured on this cortex or any reachable peer")]
    NoSourceConfigured,
    #[error("source_hint '{0}' does not match any candidate")]
    HintNoMatch(String),
    #[error("peer cortex '{0}' unreachable")]
    PeerUnreachable(String),
    #[error("A2A skill call to '{0}' failed: {1}")]
    A2AFailed(String, String),
    #[error("peer returned empty answer text")]
    NoAnswerText,
}

pub async fn route_visualqa(
    intent: VisualQaIntent,
    state: &crate::state::AppState,
) -> Result<VisualQaRouteResult, RouterError> {
    // Step A: collect candidates
    let local = state.video_sources_repo.active().await
        .map_err(|_| RouterError::NoSourceConfigured)?
        .map(VideoSourceCandidate::from_local);
    let peers: Vec<VideoSourceCandidate> = state.peer_registry.active_entries()
        .into_iter()
        .map(VideoSourceCandidate::from_peer)
        .collect();
    let candidates: Vec<VideoSourceCandidate> = local.into_iter()
        .chain(peers)
        .collect();

    // Step B: arbitrate
    if candidates.is_empty() { return Err(RouterError::NoSourceConfigured); }
    if let Some(hint) = &intent.source_hint() {
        if let Some(c) = candidates.iter().find(|c| c.matches_hint(hint)) {
            return forward(c, &intent.question, state).await;
        } else {
            return Err(RouterError::HintNoMatch(hint.clone()));
        }
    }
    if candidates.len() == 1 {
        return forward(&candidates[0], &intent.question, state).await;
    }
    Ok(VisualQaRouteResult::Clarify(ClarifyRequest { candidates }))
}

async fn forward(
    candidate: &VideoSourceCandidate,
    question: &str,
    state: &crate::state::AppState,
) -> Result<VisualQaRouteResult, RouterError> {
    let url = candidate.a2a_url();
    let timeout = std::time::Duration::from_secs(10);
    let req = serde_json::json!({
        "jsonrpc": "2.0", "id": format!("req_{}", uuid::Uuid::new_v4()),
        "method": "tasks/send",
        "params": {
            "task": {
                "id": format!("vqa_{}", uuid::Uuid::new_v4()),
                "skill_id": "visual_qa",
                "input": {
                    "question": question,
                    "source_id": candidate.source_id(),
                    "max_tokens": 256
                }
            }
        }
    });
    let resp = state.http_client.post(format!("{url}/a2a/tasks/send"))
        .header("Content-Type", "application/json")
        .json(&req)
        .timeout(timeout)
        .send().await
        .map_err(|e| RouterError::PeerUnreachable(e.to_string()))?;
    let body: serde_json::Value = resp.json().await
        .map_err(|e| RouterError::A2AFailed("parse".into(), e.to_string()))?;
    let text = body["result"]["task"]["status"]["message"].as_str()
        .ok_or(RouterError::NoAnswerText)?
        .to_string();
    Ok(VisualQaRouteResult::Forwarded {
        text, source_id: candidate.source_id().into(),
        peer_cortex_id: candidate.peer_cortex_id(),
    })
}
```

`ClarifyRequest` and `VideoSourceCandidate` in `clarify.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarifyRequest {
    pub candidates: Vec<VideoSourceCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSourceCandidate {
    pub device_id: String,
    pub source_id: String,
    pub label: String,
    pub host_label: String,
    pub peer_cortex_id: Option<String>,
}

impl VideoSourceCandidate {
    pub fn matches_hint(&self, hint: &str) -> bool {
        // Match by host_label (case-insensitive substring) or device_id
        self.host_label.to_lowercase().contains(&hint.to_lowercase())
            || self.device_id == hint
    }
    pub fn source_id(&self) -> &str { &self.source_id }
    pub fn peer_cortex_id(&self) -> Option<String> { self.peer_cortex_id.clone() }
    pub fn a2a_url(&self) -> String {
        // local -> this cortex's own URL; peer -> peer's URL
        match &self.peer_cortex_id {
            Some(_) => format!("http://{}:60080", self.host_label),    // simplified
            None => "http://localhost:60080".to_string(),
        }
    }
}
```

Tests in router.rs (inline):
- `route_visualqa_single_local_picks_local()`
- `route_visualqa_zero_candidates_returns_no_source_error()`
- `route_visualqa_two_candidates_no_hint_returns_clarify()`
- `route_visualqa_hint_matches_when_present()`
- `route_visualqa_a2a_call_uses_skill_id_visual_qa()` (mock reqwest)

Run: `cd cortex && cargo test --lib visual_qa::router`
Expected: FAIL (modules + repo methods don't exist).

- [ ] **Step 4: Implement (paste code above)**

Run tests: ALL PASS.

- [ ] **Step 5: Wire Intent::VisualQA + prefrontal routing**

Modify `cortex/src/lobes/intent.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Intent {
    Chat,
    TaskCreate(TaskRequest),
    TaskConfirm(TaskConfirmation),
    TaskQuery(String),
    TaskUpdate(TaskUpdate),
    MemoryQuery(String),
    AgentQuery(String),
    /// Routes through visual_qa_router. Source_hint populated when user
    /// already specified a device in their message (or after re-send
    /// post-clarify).
    VisualQA {
        question: String,
        source_hint: Option<String>,
    },
}
```

Modify `cortex/src/lobes/prefrontal.rs` to handle the new variant:

```rust
match intent {
    Intent::VisualQA { question, source_hint } => {
        let router_intent = VisualQaIntent::VisualQA {
            question,
            source_hint: source_hint.clone(),
        };
        match visual_qa::router::route_visualqa(router_intent, state).await {
            Ok(VisualQaRouteResult::Forwarded { text, .. }) => {
                Ok(vec![CortexStreamEvent::Delta { text }])
            }
            Ok(VisualQaRouteResult::Clarify(req)) => {
                // Serialize ClarifyRequest as message.metadata; desktop parses
                let meta = serde_json::json!({
                    "shadow.clarification": {
                        "kind": "visual_qa_source_selection",
                        "candidates": req.candidates,
                    }
                });
                Ok(vec![
                    CortexStreamEvent::Delta { text: "你要看哪台摄像头？".to_string() },
                    CortexStreamEvent::Metadata { metadata: meta },
                ])
            }
            Err(e) => Ok(vec![CortexStreamEvent::Error { message: e.to_string() }]),
        }
    }
    // ... existing variants unchanged
}
```

(Modify `analyze_intent` so its fast-path return value is wrapped: if `try_visualqa_fastpath(text)` hits, return `Intent::VisualQA` directly; otherwise fall through to existing logic.)

Run: `cd cortex && cargo test`
Expected: existing 187 lib tests + new tests all PASS.

- [ ] **Step 6: Commit**

```bash
cd cortex
git add src/visual_qa/ src/lobes/intent.rs src/lobes/prefrontal.rs
git commit -m "feat(cortex): Intent::VisualQA + visual_qa_router (Spec #2 core)"
```

---

## Chunk 2.2: Peer sources registry + broadcast loop

**Files:**
- Create: `cortex/src/visual_qa/peer_registry.rs`
- Create: `cortex/src/visual_qa/broadcast_loop.rs`
- Create: `cortex/src/api/visual_qa_sources_broadcast.rs`
- Modify: `cortex/src/state.rs`
- Modify: `cortex/src/server.rs`
- Modify: `cortex/src/lib.rs`

- [ ] **Step 1: Write peer_registry tests**

```rust
// cortex/src/visual_qa/peer_registry.rs (inline tests at bottom)

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn peer_registry_upserts_new_entry_on_first_push() {
        let reg = PeerSourceRegistry::new();
        let entry = peer_entry("cortex_a", "host-a", 1920, true);
        reg.upsert(entry).await;
        assert_eq!(reg.active_entries().await.len(), 1);
    }

    #[tokio::test]
    async fn peer_registry_marks_stale_after_60s_no_heartbeat() {
        let reg = PeerSourceRegistry::new();
        reg.upsert(peer_entry("cortex_a", "host-a", 1920, true)).await;
        // Force stale by advancing clock
        reg.mark_stale_if_old("cortex_a", std::time::Duration::from_secs(61)).await;
        assert!(reg.active_entries().await.is_empty());
    }

    #[tokio::test]
    async fn peer_registry_keeps_unreachable_for_recovery() {
        let reg = PeerSourceRegistry::new();
        reg.upsert(peer_entry("cortex_a", "host-a", 1920, true)).await;
        reg.mark_stale_if_old("cortex_a", std::time::Duration::from_secs(61)).await;
        // entry still exists, just reachable=false
        assert!(reg.get("cortex_a").await.is_some());
        assert!(!reg.get("cortex_a").await.unwrap().reachable);
        // Refresh on next heartbeat
        reg.upsert(peer_entry("cortex_a", "host-a", 1920, true)).await;
        assert!(reg.get("cortex_a").await.unwrap().reachable);
    }

    fn peer_entry(id: &str, host: &str, width: u32, has_active: bool) -> PeerSourceEntry {
        PeerSourceEntry {
            peer_cortex_id: id.into(),
            host_label: host.into(),
            active_source: if has_active { Some(ActiveSourceSummary {
                device_id: "d1".into(), source_id: "vsrc_x".into(),
                label: "BRIO".into(),
                capabilities: serde_json::json!({"widths": [width]}),
            }) } else { None },
            last_heartbeat_at: std::time::Instant::now(),
            reachable: true,
        }
    }
}
```

Implementation skeleton:

```rust
// cortex/src/visual_qa/peer_registry.rs

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ActiveSourceSummary {
    pub device_id: String,
    pub source_id: String,
    pub label: String,
    pub capabilities: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct PeerSourceEntry {
    pub peer_cortex_id: String,
    pub host_label: String,
    pub active_source: Option<ActiveSourceSummary>,
    pub last_heartbeat_at: std::time::Instant,
    pub reachable: bool,
}

#[derive(Clone, Default)]
pub struct PeerSourceRegistry {
    inner: Arc<RwLock<HashMap<String /* peer_cortex_id */, PeerSourceEntry>>>,
}

impl PeerSourceRegistry {
    pub fn new() -> Self { Self::default() }

    pub async fn upsert(&self, entry: PeerSourceEntry) {
        let mut m = self.inner.write().await;
        m.insert(entry.peer_cortex_id.clone(), entry);
    }

    pub async fn get(&self, peer_id: &str) -> Option<PeerSourceEntry> {
        self.inner.read().await.get(peer_id).cloned()
    }

    pub async fn active_entries(&self) -> Vec<PeerSourceEntry> {
        self.inner.read().await.values()
            .filter(|e| e.reachable && e.active_source.is_some())
            .cloned().collect()
    }

    pub async fn mark_stale_if_old(&self, peer_id: &str, max_age: std::time::Duration) {
        let mut m = self.inner.write().await;
        if let Some(entry) = m.get_mut(peer_id) {
            if entry.last_heartbeat_at.elapsed() > max_age {
                entry.reachable = false;
                entry.active_source = None;
            }
        }
    }
}
```

Run: `cd cortex && cargo test --lib visual_qa::peer_registry`
Expected: ALL PASS.

- [ ] **Step 2: Implement broadcast_loop (sender side)**

```rust
// cortex/src/visual_qa/broadcast_loop.rs

use std::time::Duration;
use crate::state::AppState;
use crate::visual_qa::peer_registry::ActiveSourceSummary;

pub async fn run(state: AppState) {
    let mut ticker = tokio::time::interval(Duration::from_secs(30));
    loop {
        ticker.tick().await;
        if let Err(e) = broadcast_once(&state).await {
            tracing::warn!("broadcast failed: {e}");
        }
    }
}

async fn broadcast_once(state: &AppState) -> anyhow::Result<()> {
    let active = state.video_sources_repo.active().await?;
    let snap = serde_json::json!({
        "from_cortex_id": state.config.cortex_id,
        "host_label": state.config.host_label,
        "active_source": active.map(|s| serde_json::to_value(&s).unwrap()),
        "sent_at": chrono::Utc::now().to_rfc3339(),
    });
    for peer in state.mds_discovery.peers() {
        let url = format!("{}/api/cortex/visual-qa/sources-broadcast", peer.base_url);
        let _ = state.http_client.post(&url)
            .header("X-Cortex-Admin-Token", &peer.admin_token)
            .json(&snap)
            .send().await?;
    }
    Ok(())
}
```

Spawn in `AppState::bootstrap()`:

```rust
// cortex/src/state.rs
pub fn bootstrap(config: CortexConfig) -> AppState {
    let state = AppState::new(config);
    let state_clone = state.clone();
    tokio::spawn(async move { crate::visual_qa::broadcast_loop::run(state_clone).await });
    state
}
```

- [ ] **Step 3: Implement broadcast receiver**

```rust
// cortex/src/api/visual_qa_sources_broadcast.rs

#[derive(Deserialize)]
struct BroadcastBody {
    from_cortex_id: String,
    host_label: String,
    active_source: Option<serde_json::Value>,
    sent_at: String,
}

pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BroadcastBody>,
) -> Result<StatusCode, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }

    let active_source = body.active_source
        .and_then(|v| serde_json::from_value::<ActiveSourceSummary>(v).ok());
    state.peer_registry.upsert(PeerSourceEntry {
        peer_cortex_id: body.from_cortex_id,
        host_label: body.host_label,
        active_source,
        last_heartbeat_at: std::time::Instant::now(),
        reachable: true,
    }).await;
    Ok(StatusCode::NO_CONTENT)
}
```

Wire into `cortex/src/server.rs`:

```rust
.route("/api/cortex/visual-qa/sources-broadcast", post(visual_qa_sources_broadcast::handler))
```

- [ ] **Step 4: Stale-scanner loop (every 60s)**

In `broadcast_loop.rs`:

```rust
pub async fn run_with_stale_scanner(state: AppState) {
    let mut hb = tokio::time::interval(Duration::from_secs(30));
    let mut stale = tokio::time::interval(Duration::from_secs(60));
    loop {
        tokio::select! {
            _ = hb.tick() => { if let Err(e) = broadcast_once(&state).await { tracing::warn!("hb: {e}"); } }
            _ = stale.tick() => {
                for peer_id in state.peer_registry.peer_ids().await {
                    state.peer_registry.mark_stale_if_old(&peer_id, Duration::from_secs(60)).await;
                }
            }
        }
    }
}
```

Replace the spawn in bootstrap with `run_with_stale_scanner`.

- [ ] **Step 5: Tests + commit**

Run full cortex lib + integration tests. ALL PASS.

```bash
cd cortex
git add src/visual_qa/peer_registry.rs src/visual_qa/broadcast_loop.rs \
        src/api/visual_qa_sources_broadcast.rs src/state.rs src/server.rs src/lib.rs
git commit -m "feat(cortex): peer_source_registry + broadcast loop (Spec #2 wire)"
```

---

## Chunk 2.3: Shadow-desktop metadata parsing + e2e

**Files:**
- Modify: `shadow-desktop/src/lib/cortexClient.ts`
- Create: `shadow-desktop/e2e-tests/visual-qa-clarify.spec.ts`

- [ ] **Step 1: Extend cortexClient to parse clarification metadata**

```typescript
// shadow-desktop/src/lib/cortexClient.ts (add to cortexClient class)

async *chatCompletionStream(
  payload: ChatCompletionPayload,
): AsyncGenerator<ChatCompletionChunk> {
  // ... existing SSE parser ...
  // When chunk.metadata?.shadow?.clarification appears, emit a typed event:
  for (const chunk of sseEvents) {
    if (chunk.choices?.[0]?.message?.metadata?.shadow?.clarification) {
      yield {
        type: 'clarification',
        kind: chunk.choices[0].message.metadata.shadow.clarification.kind,
        candidates: chunk.choices[0].message.metadata.shadow.clarification.candidates,
      };
    }
    yield { type: 'text_delta', text: chunk.choices[0].delta?.content ?? '' };
  }
}
```

- [ ] **Step 2: Add ChatPage hook for clarification UI**

In `ConversationPage.tsx`, render a `ClarificationPicker` chip bar when the SSE stream emits a clarification event:

```tsx
{lastClarification && (
  <div className="flex flex-wrap gap-2">
    {lastClarification.candidates.map((c) => (
      <Button key={c.source_id} onClick={() => resendWithHint(c.host_label)}>
        {c.host_label} — {c.label}
      </Button>
    ))}
  </div>
)}
```

(Use existing shadcn Button. No new design.)

- [ ] **Step 3: Playwright e2e**

```typescript
// shadow-desktop/e2e-tests/visual-qa-clarify.spec.ts
test('clarification chips appear when multiple sources configured', async ({ page }) => {
  // Mock cortex GET /api/cortex/video-sources with 2 active sources
  await page.route('**/api/cortex/video-sources', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, headers: { 'ETag': 'v1' },
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            { id: 'vsrc_a', deviceId: 'd1', label: 'BRIO', kind: 'uvc',
              transport: 'browser', capabilities: {}, active: true,
              createdAt: '...', updatedAt: '...' },
            { id: 'vsrc_b', deviceId: 'd2', label: 'MacBook Cam', kind: 'uvc',
              transport: 'browser', capabilities: {}, active: false,
              createdAt: '...', updatedAt: '...' },
          ],
          activeId: 'vsrc_a',
          device: null,
        }),
      });
    }
  });
  // Mock chat stream that returns clarification
  await page.route('**/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({
        choices: [{ message: {
          role: 'assistant',
          content: '你有摄像头在多台设备上。',
          metadata: { 'shadow.clarification': { kind: 'visual_qa_source_selection', candidates: [...] } }
        } }]
      })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto('/');
  await page.getByPlaceholder(/ask|说点什么/).fill('看看前面有什么');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/BRIO/)).toBeVisible();
  await expect(page.getByText(/MacBook Cam/)).toBeVisible();
});
```

Run: `cd shadow-desktop && pnpm exec playwright test e2e-tests/visual-qa-clarify.spec.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
cd shadow-desktop
git add src/lib/cortexClient.ts src/pages/ConversationPage.tsx e2e-tests/visual-qa-clarify.spec.ts
git commit -m "feat(desktop/web): parse visual_qa clarification chips in chat stream"
```

---

## Spec #2 acceptance

- [ ] All 3 chunks committed.
- [ ] `cd cortex && cargo test --lib` passes (incl. 5 new tests in intent_ext + router + peer_registry).
- [ ] `cd cortex && cargo test --test visual_qa_e2e` passes (2-cortex broadcast round-trip).
- [ ] `cd shadow-desktop && pnpm exec playwright test` passes (clarify chips).
- [ ] End-to-end manual: 2 desktops, both with mage_vl, dispatch a visual_qa query from A → it lands on B (or local) → mage_vl replies.

## Files NOT touched (Spec #3 / #4 territory)

- `cortex/src/visual_qa/tools.rs` (Spec #3 minimal Tool)
- `cortex/src/visual_qa/capability_registry.rs` (Spec #3)
- `cortex/src/lobes/visual_qa.rs` (Spec #3)
- `cortex/src/tool/*` (Spec #4)
- `cortex/src/flow/adapter/tool.rs` (Spec #4)
