# Spec #3: cortex 视觉问答 Service Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Spec #2 第 3 节锁定的 A2A `visual_qa` skill 服务端 —— cortex 接到对端 A2A 调用后抓帧（通过本机 provider）→ 调 mage_vl → 返回文本。同时实现 minimal Tool 抽象（Spec #3 范围，不含通用框架）。

**Architecture:** skill_router 加一条 `skill_id="visual_qa" → VisualQALobe`。VisualQALobe 通过 CapabilityRegistry 路由 capture_frame 到 desktop/mobile provider；embedded neure 调用 mage_vl；结果以 CortexStreamEvent::Delta 流回。Provider 在 desktop/mobile Tauri shell 启动时注册 capabilities + 30s heartbeat。

**Tech Stack:**
- cortex: axum + reqwest + sqlx + existing neure_embed + skill_router
- shadow-desktop (Tauri Rust): reqwest + tiny_http 或 axum (localhost invoke server)
- neure: existing mage_vl runtime (per Spec #1 verified)

**Spec:** `/home/ibloc/Projects/shadow/docs/superpowers/specs/2026-08-26-cortex-visual-qa-service-design.md`

---

## File Structure

### New files (cortex)

- `cortex/src/visual_qa/tools.rs` — `VisualQATool` trait + Registry + CaptureFrameTool + ListVideoSourcesTool
- `cortex/src/visual_qa/capability_registry.rs` — provider registry + heartbeat scan
- `cortex/src/lobes/visual_qa.rs` — VisualQALobe implementing NativeLobe
- `cortex/src/api/visual_qa_capabilities.rs` — capability register/heartbeat/invoke HTTP
- `cortex/src/api/visual_qa_tools.rs` — tool list + invoke HTTP

### Modified files (cortex)

- `cortex/src/lib.rs` — `pub mod visual_qa;`
- `cortex/src/state.rs` — bootstrap `CapabilityRegistry` + `VisualQAToolRegistry`; wire VisualQALobe
- `cortex/src/skill_router.rs` — add `skill_id="visual_qa" → VisualQALobe`
- `cortex/src/server.rs` — mount new routes

### New files (shadow-desktop)

- `shadow-desktop/src-tauri/src/visual_qa_provider.rs` — capability register + heartbeat + localhost invoke server
- `shadow-desktop/src-tauri/src/visual_qa_provider.test.rs`

### Tests

- `cortex/src/visual_qa/tools.rs` (inline tests)
- `cortex/src/visual_qa/capability_registry.rs` (inline tests)
- `cortex/tests/visual_qa_service_e2e.rs`

---

## Chunk 3.1: Capability registry + Tool trait (minimal)

**Files:**
- Create: `cortex/src/visual_qa/capability_registry.rs`
- Create: `cortex/src/visual_qa/tools.rs`
- Modify: `cortex/src/state.rs`

- [ ] **Step 1: Write tests for capability_registry**

In `cortex/src/visual_qa/capability_registry.rs`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityDescriptor {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub returns: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct ProviderEntry {
    pub provider_id: String,
    pub platform: String,
    pub host_label: String,
    pub callback_url: String,           // http://<host>:<port>
    pub capabilities: Vec<CapabilityDescriptor>,
    pub last_heartbeat_at: Instant,
    pub reachable: bool,
}

#[derive(Clone, Default)]
pub struct CapabilityRegistry {
    by_name: Arc<RwLock<HashMap<String /* cap */, Vec<String /* provider */>>>>,
    providers: Arc<RwLock<HashMap<String /* provider */, ProviderEntry>>>,
}

impl CapabilityRegistry {
    pub fn new() -> Self { Self::default() }
    pub async fn register(&self, provider: ProviderEntry);
    pub async fn unregister(&self, provider_id: &str);
    pub async fn mark_heartbeat(&self, provider_id: &str);
    pub async fn mark_stale(&self, provider_id: &str);
    pub async fn list_capabilities(&self) -> Vec<(String /* cap */, Vec<String> /* providers */)>;
    /// Find the first reachable provider offering `capability`, returning
    /// a clone of its entry so the caller can invoke without holding the lock.
    pub async fn resolve(&self, capability: &str) -> Option<ProviderEntry>;
    pub async fn scan_stale(&self, max_age: Duration);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str, caps: &[&str]) -> ProviderEntry {
        ProviderEntry {
            provider_id: id.into(),
            platform: "linux".into(),
            host_label: id.into(),
            callback_url: format!("http://{id}:60000"),
            capabilities: caps.iter().map(|c| CapabilityDescriptor {
                name: (*c).into(), description: "".into(),
                parameters: serde_json::json!({}),
                returns: serde_json::json!({}),
            }).collect(),
            last_heartbeat_at: Instant::now(),
            reachable: true,
        }
    }

    #[tokio::test]
    async fn register_and_resolve() {
        let reg = CapabilityRegistry::new();
        reg.register(provider("p1", &["capture_frame_uvc"])).await;
        let p = reg.resolve("capture_frame_uvc").await.unwrap();
        assert_eq!(p.provider_id, "p1");
    }

    #[tokio::test]
    async fn resolve_skips_unreachable() {
        let reg = CapabilityRegistry::new();
        reg.register(provider("p1", &["capture_frame_uvc"])).await;
        reg.mark_stale("p1").await;
        assert!(reg.resolve("capture_frame_uvc").await.is_none());
    }

    #[tokio::test]
    async fn scan_stale_marks_old_entries() {
        let reg = CapabilityRegistry::new();
        reg.register(provider("p1", &["capture_frame_uvc"])).await;
        reg.scan_stale(Duration::from_secs(0)).await;   // everything is stale
        assert!(!reg.resolve("capture_frame_uvc").await.unwrap().reachable);
    }

    #[tokio::test]
    async fn heartbeat_marks_provider_reachable_again() {
        let reg = CapabilityRegistry::new();
        reg.register(provider("p1", &["capture_frame_uvc"])).await;
        reg.mark_stale("p1").await;
        reg.mark_heartbeat("p1").await;
        assert!(reg.resolve("capture_frame_uvc").await.unwrap().reachable);
    }
}
```

Run: `cd cortex && cargo test --lib visual_qa::capability_registry`
Expected: FAIL (module doesn't exist).

- [ ] **Step 2: Implement capability_registry**

Standard implementation following the tests above. ~80 LOC.

- [ ] **Step 3: Write tests for VisualQATool + minimal tools**

```rust
// cortex/src/visual_qa/tools.rs (inline tests at bottom)

#[tokio::test]
async fn capture_frame_tool_prefers_browser_capability() {
    let cap = CapabilityRegistry::new();
    let tool = CaptureFrameTool::new(cap.clone(), mock_repo_with_browser_source());
    let args = serde_json::json!({ "source_id": "vsrc_abc" });
    let ctx = ToolContext::for_lobe("occipital");
    // No provider registered → expect NoProvider
    let result = tool.invoke_value(args, &ctx).await;
    assert!(matches!(result, Err(ToolError::NoProvider(_))));
}

#[tokio::test]
async fn list_video_sources_tool_returns_empty_when_no_sources() { /* ... */ }

#[tokio::test]
async fn empty_args_tool_works_with_no_args() {
    let tool = EmptyArgsTool;
    let result = tool.invoke(Empty {}, &ctx()).await.unwrap();
    assert_eq!(result, Empty {});
}
```

(See `text_tower.rs` for the `empty_test_works` pattern from Spec #1's reset_cache test if needed.)

- [ ] **Step 4: Implement VisualQATool trait + minimal tools**

```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Empty {}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolContext {
    pub requester: String,
    pub timeout_ms: Option<u64>,
}

impl ToolContext {
    pub fn for_lobe(name: &str) -> Self { Self { requester: name.into(), timeout_ms: None } }
}

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("unknown tool: {0}")]
    UnknownTool(String),
    #[error("invalid args: {0}")]
    InvalidArgs(String),
    #[error("no provider for capability {0}")]
    NoProvider(String),
    #[error("provider {0} failed: {1}")]
    ProviderFailed(String, String),
    #[error("timeout after {0}s")]
    Timeout(u64),
    #[error("internal: {0}")]
    Internal(String),
}

#[async_trait]
pub trait VisualQATool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters_schema(&self) -> serde_json::Value;
    fn returns_schema(&self) -> serde_json::Value;
    async fn invoke_value(
        &self, args: serde_json::Value, ctx: &ToolContext,
    ) -> Result<serde_json::Value, ToolError>;
}

// CaptureFrameTool + ListVideoSourcesTool implementations

pub struct CaptureFrameTool {
    pub capabilities: CapabilityRegistry,
    pub video_sources_repo: Arc<VideoSourcesRepo>,
}

#[async_trait]
impl VisualQATool for CaptureFrameTool {
    fn name(&self) -> &str { "capture_frame" }
    fn description(&self) -> &str { "Capture a single frame from the configured video source." }
    fn parameters_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": { "source_id": { "type": "string" } },
            "required": ["source_id"]
        })
    }
    fn returns_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "jpeg_base64": { "type": "string" },
                "width": { "type": "integer" },
                "height": { "type": "integer" }
            },
            "required": ["jpeg_base64", "width", "height"]
        })
    }
    async fn invoke_value(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        let source_id = args.get("source_id").and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArgs("missing source_id".into()))?;
        let source = self.video_sources_repo.get(source_id).await
            .map_err(|e| ToolError::Internal(e.to_string()))?
            .ok_or_else(|| ToolError::InvalidArgs(format!("source not found: {source_id}")))?;
        let capability = match source.transport.as_str() {
            "browser" => "capture_frame_uvc",
            "tauri-rust" => "capture_frame_native_camera",
            other => return Err(ToolError::Internal(format!("unknown transport: {other}"))),
        };
        let provider = self.capabilities.resolve(capability).await
            .ok_or_else(|| ToolError::NoProvider(capability.into()))?;
        let url = format!("{}/api/cortex/visual-qa/capabilities/invoke", provider.callback_url);
        let token = read_cortex_provider_token(&provider);
        let timeout = ctx.timeout_ms.unwrap_or(5_000);
        let resp = state_http_client(&ctx).post(&url)
            .header("X-Provider-Token", &token)
            .json(&json!({ "capability": capability, "args": { "source_id": source_id } }))
            .timeout(Duration::from_millis(timeout))
            .send().await
            .map_err(|e| if e.is_timeout() { ToolError::Timeout(timeout / 1000) } else { ToolError::ProviderFailed(provider.provider_id.clone(), e.to_string()) })?;
        let body: Value = resp.json().await
            .map_err(|e| ToolError::ProviderFailed(provider.provider_id.clone(), e.to_string()))?;
        body.get("result").cloned()
            .ok_or_else(|| ToolError::ProviderFailed(provider.provider_id.clone(), "missing result".into()))
    }
}

// ListVideoSourcesTool: similar, calls capability "list_local_video_sources"
// EmptyArgsTool: trivial
```

- [ ] **Step 5: Wire into AppState**

```rust
// cortex/src/state.rs
pub struct AppState {
    // ... existing ...
    pub visual_qa_capabilities: CapabilityRegistry,
    pub visual_qa_tools: VisualQAToolRegistry,
}

// in AppState::new():
let capabilities = CapabilityRegistry::new();
let mut tools = VisualQAToolRegistry::new();
tools.register(Box::new(CaptureFrameTool::new(capabilities.clone(), video_sources_repo.clone())));
tools.register(Box::new(ListVideoSourcesTool::new(video_sources_repo.clone())));
let state = AppState { /* existing */ visual_qa_capabilities: capabilities, visual_qa_tools: tools };
// Spawn stale scanner
let caps = state.visual_qa_capabilities.clone();
tokio::spawn(async move {
    let mut tick = tokio::time::interval(Duration::from_secs(60));
    loop {
        tick.tick().await;
        caps.scan_stale(Duration::from_secs(60)).await;
    }
});
state
```

Run: `cd cortex && cargo test --lib`
Expected: 187 existing + new tests all PASS.

- [ ] **Step 6: Commit**

```bash
cd cortex
git add src/visual_qa/tools.rs src/visual_qa/capability_registry.rs src/state.rs
git commit -m "feat(cortex): capability_registry + VisualQATool (Spec #3 minimal)"
```

---

## Chunk 3.2: VisualQALobe + A2A skill routing + REST surface

**Files:**
- Create: `cortex/src/lobes/visual_qa.rs`
- Create: `cortex/src/api/visual_qa_capabilities.rs`
- Create: `cortex/src/api/visual_qa_tools.rs`
- Modify: `cortex/src/skill_router.rs`
- Modify: `cortex/src/server.rs`

- [ ] **Step 1: Write VisualQALobe test (gated on mage_vl shards)**

```rust
// cortex/src/lobes/visual_qa.rs (inline #[cfg(test)])

#[tokio::test]
#[ignore = "requires mage_vl shards (~9GB) and embedded neure boot (~30s)"]
async fn visual_qa_lobe_full_flow_capture_then_mage_vl() {
    // Boot minimal cortex with embedded neure + visual_qa_tools + capability_registry (with mock provider)
    // Send A2A-style message: { question: "test", source_id: ..., max_tokens: 256 }
    // Assert reply text non-empty
}
```

- [ ] **Step 2: Implement VisualQALobe**

```rust
// cortex/src/lobes/visual_qa.rs

use async_trait::async_trait;
use crate::a2a::client::CortexStreamEvent;
use crate::lobes::{NativeLobe, manifest::LobeManifest};
use crate::state::AppState;
use crate::visual_qa::tools::{ToolContext, VisualQAToolRegistry};
use serde_json::{json, Value};

pub struct VisualQALobe {
    tools: VisualQAToolRegistry,
    state: AppState,
}

#[async_trait]
impl NativeLobe for VisualQALobe {
    fn name(&self) -> &str { "occipital" }
    fn manifest(&self) -> LobeManifest {
        LobeManifest {
            name: "occipital".into(),
            description: "Visual Q&A — captures a frame from the configured video source and runs mage-vl on it.".into(),
            skills: vec!["visual_qa".into()],
        }
    }

    async fn handle(
        &self,
        message: synapse::a2a::protocol::Message,
        _openai_base_url: &str,
        _trace: Option<Arc<TraceBroadcaster>>,
        _lobe_config: Option<&Value>,
    ) -> Result<Vec<CortexStreamEvent>, String> {
        let intent = parse_visualqa_intent(&message)?;
        let ctx = ToolContext::for_lobe("occipital");
        let frame = self.tools.invoke_value(
            "capture_frame",
            json!({ "source_id": intent.source_id }),
            &ctx,
        ).await.map_err(|e| format!("capture_frame failed: {e}"))?;
        let jpeg_base64 = frame["jpeg_base64"].as_str().ok_or("missing jpeg_base64")?;
        let max_tokens = intent.max_tokens.unwrap_or(256);
        let reply = self.state.embedded_neure.chat_completions(json!({
            "model": "microsoft/Mage-VL",
            "max_tokens": max_tokens,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": intent.question},
                    {"type": "image_url", "image_url": {
                        "url": format!("data:image/jpeg;base64,{jpeg_base64}")
                    }}
                ]
            }]
        })).await.map_err(|e| format!("mage_vl failed: {e}"))?;
        let text = reply["choices"][0]["message"]["content"].as_str()
            .unwrap_or("").to_string();
        Ok(vec![CortexStreamEvent::Delta { text }])
    }
}

fn parse_visualqa_intent(m: &synapse::a2a::protocol::Message) -> Result<VisualQaIntent, String> {
    // Read first text part for JSON: { "question": ..., "source_id": ..., "max_tokens": ... }
    let text = m.parts.iter().find_map(|p| match p {
        synapse::a2a::protocol::MessagePart::Text { text } => Some(text.clone()),
        _ => None,
    }).ok_or("no text part in visual_qa message")?;
    let parsed: VisualQaIntent = serde_json::from_str(&text)
        .map_err(|e| format!("visual_qa message parse: {e}"))?;
    Ok(parsed)
}

#[derive(Deserialize)]
struct VisualQaIntent {
    question: String,
    source_id: String,
    max_tokens: Option<u32>,
}
```

- [ ] **Step 3: Add visual_qa to skill_router**

```rust
// cortex/src/skill_router.rs (add a branch)

match skill_id.as_str() {
    "visual_qa" => LobeClient::Native(state.visual_qa_lobe.clone()),
    // ... existing branches
}
```

- [ ] **Step 4: Implement REST routes**

```rust
// cortex/src/api/visual_qa_capabilities.rs

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cortex/visual-qa/capabilities/register", post(register))
        .route("/api/cortex/visual-qa/capabilities/{id}/heartbeat", post(heartbeat))
        .route("/api/cortex/visual-qa/capabilities/invoke", post(invoke))
        .delete("/api/cortex/visual-qa/capabilities/{id}", delete_handler)
}

async fn register(
    State(state): State<AppState>, headers: HeaderMap,
    Json(body): Json<RegisterBody>,
) -> Result<StatusCode, StatusCode> {
    let token = headers.get("X-Provider-Token").and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if token != state.config.provider_token { return Err(StatusCode::UNAUTHORIZED); }
    state.visual_qa_capabilities.register(ProviderEntry {
        provider_id: body.provider_id.clone(),
        platform: body.platform, host_label: body.host_label,
        callback_url: body.callback_url,
        capabilities: body.capabilities,
        last_heartbeat_at: Instant::now(),
        reachable: true,
    }).await;
    Ok(StatusCode::CREATED)
}

async fn heartbeat(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>)
    -> Result<StatusCode, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    state.visual_qa_capabilities.mark_heartbeat(&id).await;
    Ok(StatusCode::NO_CONTENT)
}

async fn invoke(
    State(state): State<AppState>, headers: HeaderMap,
    Json(body): Json<InvokeBody>,
) -> Result<Json<Value>, StatusCode> {
    let token = headers.get("X-Provider-Token").and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let provider = state.visual_qa_capabilities.resolve(&body.capability).await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    if token != state.config.provider_token { return Err(StatusCode::UNAUTHORIZED); }
    let url = format!("{}/api/cortex/capabilities/invoke", provider.callback_url);
    let resp = state.http_client.post(&url)
        .header("X-Provider-Token", token)
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send().await
        .map_err(|_| StatusCode::GATEWAY_TIMEOUT))?;
    let result: Value = resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(Json(json!({ "result": result, "provider_id": provider.provider_id, "called_at": chrono::Utc::now().to_rfc3339() })))
}
```

`/api/cortex/visual-qa/tools` similar shape.

- [ ] **Step 5: Run lib + integration tests**

```bash
cd cortex && cargo test --lib
cd cortex && cargo test --test visual_qa_service_e2e -- --nocapture
```

Expected: all PASS (e2e gated on shards; 5+ new lib tests pass).

- [ ] **Step 6: Commit**

```bash
cd cortex
git add src/lobes/visual_qa.rs src/api/visual_qa_capabilities.rs src/api/visual_qa_tools.rs \
        src/skill_router.rs src/server.rs
git commit -m "feat(cortex): VisualQALobe + visual_qa skill + provider REST (Spec #3 service)"
```

---

## Chunk 3.3: Shadow-desktop provider (Tauri localhost invoke server)

**Files:**
- Create: `shadow-desktop/src-tauri/src/visual_qa_provider.rs`
- Create: `shadow-desktop/src-tauri/src/visual_qa_provider.test.rs`
- Modify: `shadow-desktop/src-tauri/Cargo.toml` (add `axum` dep — already there)
- Modify: `shadow-desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests for invoke handler**

```rust
// shadow-desktop/src-tauri/src/visual_qa_provider.test.rs
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;   // tower::ServiceExt::oneshot
use crate::visual_qa_provider::*;

#[tokio::test]
async fn invoke_capture_frame_uvc_returns_jpeg_shape() {
    let app = build_test_app();    // mockable: injects known capabilities
    let req = Request::builder()
        .method("POST").uri("/api/cortex/capabilities/invoke")
        .header("content-type", "application/json")
        .header("x-provider-token", "test")
        .body(Body::from(json!({
            "capability": "capture_frame_uvc",
            "args": { "source_id": "vsrc_test" }
        }).to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body: serde_json::Value = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap()
        .try_into().unwrap();
    // For test, stub the WebRTC grabber to return a fixed PNG buffer
    assert!(body["result"]["jpeg_base64"].is_string());
}

#[tokio::test]
async fn invoke_unknown_capability_returns_404() { /* ... */ }
```

Run: `cd shadow-desktop && cargo test --lib visual_qa_provider`

- [ ] **Step 2: Implement provider**

```rust
// shadow-desktop/src-tauri/src/visual_qa_provider.rs

use axum::{routing::{get, post}, Json, Router, extract::State, http::{HeaderMap, StatusCode}};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct ProviderState {
    pub provider_id: String,
    pub platform: String,
    pub host_label: String,
    pub cortex_url: String,
    pub provider_token: String,
    pub invoke_port: u16,
}

#[derive(Serialize, Deserialize)]
pub struct CapabilityDescriptor { /* ... as in Spec #3 Section 4 ... */ }

pub fn build_local_capabilities() -> Vec<CapabilityDescriptor> { /* capture_frame_uvc + list_local_video_sources */ }

pub async fn register_with_cortex(state: ProviderState) -> anyhow::Result<()> {
    let body = json!({
        "provider_id": state.provider_id,
        "platform": state.platform,
        "host_label": state.host_label,
        "capabilities": build_local_capabilities(),
    });
    reqwest::Client::new()
        .post(format!("{}/api/cortex/visual-qa/capabilities/register", state.cortex_url))
        .header("X-Provider-Token", &state.provider_token)
        .json(&body)
        .send().await?
        .error_for_status()?;
    // Spawn heartbeat loop
    let st = state.clone();
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let _ = client.post(format!("{}/api/cortex/visual-qa/capabilities/{}/heartbeat",
                st.cortex_url, st.provider_id))
                .header("X-Provider-Token", &st.provider_token)
                .send().await;
        }
    });
    Ok(())
}

pub fn build_router(state: ProviderState) -> Router {
    Router::new()
        .route("/api/cortex/capabilities/invoke", post(handle_invoke))
        .route("/api/cortex/capabilities/{name}/invoke", post(handle_invoke))
        .with_state(Arc::new(state))
}

async fn handle_invoke(
    State(state): State<Arc<ProviderState>>,
    headers: HeaderMap,
    Json(body): Json<InvokeBody>,
) -> Result<Json<Value>, StatusCode> {
    if headers.get("X-Provider-Token").and_then(|v| v.to_str().ok()) != Some(&state.provider_token) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    match body.capability.as_str() {
        "capture_frame_uvc" => {
            let source_id = body.args["source_id"].as_str().ok_or(StatusCode::BAD_REQUEST)?;
            // In real impl: invoke a webview-side Tauri command to grab the frame.
            // For the test path, use a stubbed WebRTC grabber abstraction:
            let frame = state.frame_grabber.grab(source_id).await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok(Json(json!({ "result": frame })))
        }
        "list_local_video_sources" => {
            // Same — delegate to webview or read local zustand store
            Ok(Json(json!({ "result": { "sources": [], "active_id": null } })))
        }
        _ => Err(StatusCode::NOT_FOUND),
    }
}
```

Wire into `lib.rs`:

```rust
// on tauri Builder setup:
let provider_state = ProviderState { /* read from .env */ };
visual_qa_provider::register_with_cortex(provider_state.clone()).await?;

// Start localhost invoke server on random port
let port = pick_random_port()?;
let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
let invoker_state = provider_state.with_callback_url(format!("http://127.0.0.1:{port}"));
let app = visual_qa_provider::build_router(invoker_state);
tokio::spawn(async move {
    axum::serve(listener, app).await.ok();
});
```

- [ ] **Step 3: Run tests**

```bash
cd shadow-desktop && cargo test --lib visual_qa_provider
```

- [ ] **Step 4: Commit**

```bash
cd shadow-desktop
git add src-tauri/src/visual_qa_provider.rs src-tauri/src/visual_qa_provider.test.rs \
        src-tauri/src/lib.rs Cargo.toml
git commit -m "feat(desktop/tauri): visual_qa provider + localhost invoke server"
```

---

## Chunk 3.4: E2E integration

**Files:**
- Create: `cortex/tests/visual_qa_service_e2e.rs`

- [ ] **Step 1: 2-cortex integration test**

```rust
// cortex/tests/visual_qa_service_e2e.rs
//! Boots 2 cortex instances in 2 processes (or threads with distinct
//! ports). cortex_a sends visual_qa A2A request to cortex_b; cortex_b
//! captures a fake frame from a stub provider and returns mage_vl text.

#[tokio::test]
#[ignore = "full e2e requires mage_vl shards + 2 cortex processes"]
async fn two_cortex_visual_qa_round_trip() {
    // Boot cortex_b on port 60081 with stubbed VisualQALobe + mage_vl mock
    let _b = boot_cortex_b(60081).await;
    // Boot cortex_a on port 60080, configured to talk to cortex_b as peer
    let a = boot_cortex_a(60080).await;
    // Send POST /v1/chat/completions with "看看前面"
    // Assert reply contains the stub mage_vl text
}
```

The test runs only locally (gated on shards). Production wire smoke deferred to manual cross-platform run.

- [ ] **Step 2: Commit**

```bash
cd cortex
git add tests/visual_qa_service_e2e.rs
git commit -m "test(cortex): 2-cortex visual_qa service e2e (gated)"
```

---

## Spec #3 acceptance

- [ ] All 4 chunks committed.
- [ ] `cd cortex && cargo test --lib` passes (incl. 8+ new tests).
- [ ] `cd shadow-desktop && cargo test --lib visual_qa_provider` passes.
- [ ] End-to-end manual: 2 desktops both with mage_vl, query on A → routed to B → mage_vl reply.

## Files NOT touched (Spec #4 territory)

- `cortex/src/tool/*` — General Tool framework comes in Spec #4. Spec #3's `VisualQATool` is the minimal abstraction; Spec #4 will absorb it.
- `cortex/src/flow/adapter/tool.rs` — Spec #4 introduces this; current flow tests unchanged.
- `shadow-desktop/src/components/business/VideoSourcesCard/*` — Spec #1 territory, unchanged.
- Mobile (Flutter) — deferred. Provider contract is platform-agnostic so adding `capture_frame_native_camera` later is mechanical.
