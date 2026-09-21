# Spec #5: cortex WasmToolProvider Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 cortex 把任意 Rust 工具编译到 wasm32-unknown-unknown，通过 `WasmToolProvider` 注册进 Spec #4 的 `ToolRegistry`，与 built-in / MCP / Skill / Lobe / Peer 五种 backend 并列。

**Architecture:** `WasmToolProvider` impl Spec #4 `Tool<Args=Value, Returns=Value>` trait。`WasmInstanceManager` 复用 Spec #2 / Sprint 2 已有，资源 quota 注入。C-ABI 稳定 (`#[no_mangle] extern "C"` + u8 ptr)。`POST /api/cortex/tools/wasm/register` 接收 base64 wasm + manifest JSON，注册到中心 ToolRegistry。

**Tech Stack:**
- cortex: axum 0.8 + sqlx 0.8 + `synapse::wasm` (existing)
- 工具: Rust → wasm32-unknown-unknown + serde + serde_json
- CI: GitHub Actions `wasm32-unknown-unknown` target + `wasmtime` 系统库

**Spec:** `https://github.com/iBLOC/shadow/docs/superpowers/specs/2026-08-26-cortex-wasm-tool-provider-design.md`

---

## File Structure

### New files (cortex)

- `cortex/src/tool/wasm_provider.rs` — `WasmToolProvider` struct + `WasmToolManifest` + `register_wasm_tools()` + inline tests
- `cortex/src/api/wasm_tool.rs` — `POST /api/cortex/tools/wasm/register` handler
- `cortex/tests/fixtures/wasm/echo_tool/Cargo.toml` — sample wasm tool Cargo
- `cortex/tests/fixtures/wasm/echo_tool/src/lib.rs` — sample wasm source
- `cortex/tests/wasm_tools_e2e.rs` — e2e integration test

### Modified files (cortex)

- `cortex/src/tool/mod.rs` — re-export `wasm_provider` module
- `cortex/src/api/tools.rs` — register the wasm register handler into the existing Spec #4 router
- `cortex/src/state.rs` — no new fields (tool_registry is the entry point)
- `.github/workflows/cortex-tests.yml` — add wasm32 build step

### Skipped (defer)

- `cortex/src/api/tools/wasm/*` subroutes — only one route needed for Spec #5

---

## Chunk 5.1: WasmToolProvider core

**Files:**
- Create: `cortex/src/tool/wasm_provider.rs`
- Modify: `cortex/src/tool/mod.rs`

- [ ] **Step 1: Write failing tests**

```rust
// cortex/src/tool/wasm_provider.rs (inline #[cfg(test)] mod)

#[cfg(test)]
mod tests {
    use super::*;

    fn load_echo_wasm() -> Vec<u8> {
        include_bytes!("../../tests/fixtures/wasm/echo_tool.wasm").to_vec()
    }

    fn quota() -> synapse::wasm::ResourceQuota { synapse::wasm::ResourceQuota::default() }

    #[tokio::test]
    async fn wasm_tool_provider_roundtrip() {
        let manifest_json = r#"{
            "tools": [{
                "name": "echo",
                "description": "Echo",
                "args_schema": {"type":"object","properties":{"text":{"type":"string"}},"required":["text"]},
                "returns_schema": {"type":"object","properties":{"echo":{"type":"string"}},"required":["echo"]}
            }]
        }"#;
        let manifest: WasmToolManifest = serde_json::from_str(manifest_json).unwrap();
        let instance = WasmInstanceManager::new(load_echo_wasm().into(), quota()).unwrap();
        let reg = Arc::new(ToolRegistry::new());
        register_wasm_tools(reg.clone(), Arc::new(instance), manifest).await.unwrap();
        let out = reg.invoke_value("echo", json!({ "text": "hi" }),
            &ToolContext::for_lobe("test")).await.unwrap();
        assert_eq!(out, json!({ "echo": "echo: hi" }));
    }

    #[tokio::test]
    async fn wasm_tool_provider_returns_runtime_error_on_negative_handle_code() {
        // Stub a wasm module that returns -1 (InvalidArgs code).
        // Assert ToolError::InvalidArgs.
    }

    #[tokio::test]
    async fn wasm_tool_provider_returns_invalid_args_on_bad_json() {
        // Pass args that aren't valid JSON; assert ToolError::InvalidArgs.
    }

    #[tokio::test]
    async fn wasm_tool_provider_registers_multiple_tools_from_one_manifest() {
        // Manifest with 2 tools; assert both appear in registry.list().
    }
}
```

Run: `cd cortex && cargo test --lib tool::wasm_provider`
Expected: FAIL (module doesn't exist).

- [ ] **Step 2: Implement WasmToolProvider**

```rust
// cortex/src/tool/wasm_provider.rs

use crate::tool::{Tool, ToolContext, ToolError, ToolRegistry};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use synapse::wasm::WasmInstanceManager;

pub struct WasmToolProvider {
    instance: Arc<WasmInstanceManager>,
    tool_name: &'static str,        // 'static via Box::leak at registration
    description: &'static str,
    args_schema: serde_json::Value,
    returns_schema: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct WasmToolManifest {
    pub tools: Vec<WasmToolManifestEntry>,
}

#[derive(Serialize, Deserialize)]
pub struct WasmToolManifestEntry {
    pub name: String,
    pub description: String,
    pub args_schema: serde_json::Value,
    pub returns_schema: serde_json::Value,
}

#[async_trait]
impl Tool for WasmToolProvider {
    type Args = serde_json::Value;
    type Returns = serde_json::Value;
    fn name(&self) -> &str { self.tool_name }
    fn description(&self) -> &str { self.description }
    fn version(&self) -> &str { "1" }
    fn args_schema(&self) -> serde_json::Value { self.args_schema.clone() }
    fn returns_schema(&self) -> serde_json::Value { self.returns_schema.clone() }
    async fn invoke(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        let serialized = serde_json::to_vec(&args)
            .map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        let timeout_ms = ctx.timeout_ms.unwrap_or(30_000);
        let result_bytes = self.instance
            .call_json(self.tool_name, &serialized, Duration::from_millis(timeout_ms as u64)).await
            .map_err(|e| {
                if e.is_timeout() { ToolError::Timeout(timeout_ms / 1000) }
                else { ToolError::Runtime { message: e.to_string(), transient: true } }
            })?;
        serde_json::from_slice(&result_bytes)
            .map_err(|e| ToolError::Internal(format!("wasm return parse: {e}")))
    }
}

pub async fn register_wasm_tools(
    tool_registry: Arc<ToolRegistry>,
    instance: Arc<WasmInstanceManager>,
    manifest: WasmToolManifest,
) -> Result<(), ToolError> {
    for entry in manifest.tools {
        let tool_name: &'static str = Box::leak(entry.name.clone().into_boxed_str());
        let description: &'static str = Box::leak(entry.description.clone().into_boxed_str());
        let provider = WasmToolProvider {
            instance: instance.clone(),
            tool_name,
            description,
            args_schema: entry.args_schema,
            returns_schema: entry.returns_schema,
        };
        tool_registry.register_arc(Arc::new(provider)).await;
    }
    Ok(())
}
```

Run: `cd cortex && cargo test --lib tool::wasm_provider`
Expected: ALL PASS (gated on the `.wasm` fixture; if missing, use a `#[ignore]` with `requires = "echo_tool.wasm"` and document the build step).

- [ ] **Step 3: Re-export in tool/mod.rs**

```rust
// cortex/src/tool/mod.rs (add to existing pub mod tree)
pub mod wasm_provider;
```

- [ ] **Step 4: Commit**

```bash
cd cortex
git add src/tool/wasm_provider.rs src/tool/mod.rs
git commit -m "feat(cortex): WasmToolProvider impl Spec #4 Tool (Spec #5 core)"
```

---

## Chunk 5.2: Sample echo_tool wasm module

**Files:**
- Create: `cortex/tests/fixtures/wasm/echo_tool/Cargo.toml`
- Create: `cortex/tests/fixtures/wasm/echo_tool/src/lib.rs`

- [ ] **Step 1: Cargo.toml**

```toml
# cortex/tests/fixtures/wasm/echo_tool/Cargo.toml
[package]
name = "echo_tool"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Source**

```rust
// cortex/tests/fixtures/wasm/echo_tool/src/lib.rs
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct EchoArgs { pub text: String }
#[derive(Serialize, PartialEq, Debug)]
pub struct EchoReturns { pub echo: String }

#[no_mangle]
pub extern "C" fn handle(
    args_ptr: *const u8, args_len: usize,
    out_ptr: *mut u8, out_cap: usize,
) -> i32 {
    let input = unsafe { std::slice::from_raw_parts(args_ptr, args_len) };
    let args: EchoArgs = match serde_json::from_slice(input) { Ok(v) => v, Err(_) => return -1 };
    let out = EchoReturns { echo: format!("echo: {}", args.text) };
    let serialized = match serde_json::to_vec(&out) { Ok(v) => v, Err(_) => return -2 };
    if serialized.len() > out_cap { return -3; }
    unsafe { std::ptr::copy_nonoverlapping(serialized.as_ptr(), out_ptr, serialized.len()); }
    serialized.len() as i32
}

#[no_mangle]
pub extern "C" fn manifest(out_ptr: *mut u8, out_cap: usize) -> i32 {
    let manifest = r#"{
        "tools": [{
            "name": "echo",
            "description": "Echo tool — returns input prefixed with 'echo:'",
            "args_schema": {
                "type": "object",
                "properties": { "text": { "type": "string" } },
                "required": ["text"]
            },
            "returns_schema": {
                "type": "object",
                "properties": { "echo": { "type": "string" } },
                "required": ["echo"]
            }
        }]
    }"#;
    if manifest.len() > out_cap { return -1; }
    unsafe { std::ptr::copy_nonoverlapping(manifest.as_ptr(), out_ptr, manifest.len()); }
    manifest.len() as i32
}
```

- [ ] **Step 3: Build the .wasm locally (one-time, then committed)**

```bash
cd cortex/tests/fixtures/wasm/echo_tool
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
mkdir -p ../../wasm
cp target/wasm32-unknown-unknown/release/echo_tool.wasm ../../wasm/
```

- [ ] **Step 4: Verify cortex picks it up**

```bash
cd cortex && cargo test --lib tool::wasm_provider
```

- [ ] **Step 5: Commit**

```bash
cd cortex
git add tests/fixtures/wasm/
git commit -m "test(cortex): sample echo_tool wasm fixture (Spec #5 sample)"
```

---

## Chunk 5.3: REST surface

**Files:**
- Create: `cortex/src/api/wasm_tool.rs`
- Modify: `cortex/src/api/tools.rs`

- [ ] **Step 1: Implement handler**

```rust
// cortex/src/api/wasm_tool.rs

use axum::{extract::State, http::{HeaderMap, StatusCode}, response::IntoResponse, Json};
use base64::Engine;
use crate::security::admin_auth;
use crate::state::AppState;
use crate::tool::wasm_provider::{register_wasm_tools, WasmToolManifest};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use synapse::wasm::{WasmInstanceManager, ResourceQuota};

#[derive(Deserialize)]
pub struct WasmRegisterBody {
    pub wasm_base64: String,
    pub manifest_json: String,
    #[serde(default)]
    pub resource_quota: Option<ResourceQuotaOverride>,
}

#[derive(Deserialize)]
pub struct ResourceQuotaOverride {
    pub memory_bytes: Option<u64>,
    pub fuel: Option<u64>,
    pub wall_clock_ms: Option<u64>,
    pub network_policy: Option<String>,
}

pub async fn wasm_register_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WasmRegisterBody>,
) -> Result<axum::response::Response, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let wasm_bytes = base64::engine::general_purpose::STANDARD
        .decode(&body.wasm_base64)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let manifest: WasmToolManifest = serde_json::from_str(&body.manifest_json)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let quota = body.resource_quota.map(|q| ResourceQuota {
        memory_bytes: q.memory_bytes.unwrap_or(64 * 1024 * 1024),
        fuel: q.fuel.unwrap_or(10_000_000),
        wall_clock_ms: q.wall_clock_ms.unwrap_or(30_000),
        network_policy: match q.network_policy.as_deref() {
            Some("allow_loopback") => synapse::wasm::NetworkPolicy::AllowLoopback,
            _ => synapse::wasm::NetworkPolicy::DenyAll,
        },
    }).unwrap_or_default();
    let instance = WasmInstanceManager::new(Arc::new(wasm_bytes), quota)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    register_wasm_tools(state.tool_registry.clone(), Arc::new(instance), manifest).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(json!({ "registered": true }))).into_response())
}
```

- [ ] **Step 2: Wire into Spec #4 routes**

```rust
// cortex/src/api/tools.rs (extend existing router)
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cortex/tools", get(list_tools))
        .route("/api/cortex/tools/{name}", get(get_tool))
        .route("/api/cortex/tools/invoke", post(invoke_tool))
        .route("/api/cortex/tools/wasm/register", post(super::wasm_tool::wasm_register_handler))
        .route("/api/cortex/agents/{name}/tools", get(get_agent_tools).post(set_agent_tools))
        .route("/api/cortex/agents/{name}/tools/{tool}", delete(unassign_tool))
        .route("/api/cortex/agents/{name}/tools/grant-all", post(grant_all))
}
```

- [ ] **Step 3: Commit**

```bash
cd cortex
git add src/api/wasm_tool.rs src/api/tools.rs
git commit -m "feat(cortex): POST /api/cortex/tools/wasm/register (Spec #5 REST)"
```

---

## Chunk 5.4: E2E integration

**Files:**
- Create: `cortex/tests/wasm_tools_e2e.rs`

- [ ] **Step 1: E2E test**

```rust
// cortex/tests/wasm_tools_e2e.rs

#[tokio::test]
async fn full_wasm_tool_round_trip_via_rest() {
    let (app, _) = boot_cortex_test().await;
    let wasm_bytes = include_bytes!("fixtures/wasm/echo_tool.wasm").to_vec();
    let body = serde_json::json!({
        "wasm_base64": base64::encode(&wasm_bytes),
        "manifest_json": include_str!("fixtures/wasm/echo_tool.manifest.json"),
    });
    let client = reqwest::Client::new();

    // Register
    let resp = client.post(format!("{app}/api/cortex/tools/wasm/register"))
        .header("X-Cortex-Admin-Token", admin())
        .json(&body).send().await.unwrap();
    assert_eq!(resp.status(), 201);

    // List should now include "echo"
    let resp = client.get(format!("{app}/api/cortex/tools"))
        .header("X-Cortex-Admin-Token", admin())
        .send().await.unwrap();
    let tools: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert!(tools.iter().any(|t| t["name"] == "echo"));

    // Invoke
    let resp = client.post(format!("{app}/api/cortex/tools/invoke"))
        .header("X-Cortex-Admin-Token", admin())
        .json(&serde_json::json!({ "tool": "echo", "args": { "text": "hi" } }))
        .send().await.unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["result"], serde_json::json!({ "echo": "echo: hi" }));
}

#[tokio::test]
async fn wasm_register_with_invalid_base64_returns_400() {
    let (app, _) = boot_cortex_test().await;
    let client = reqwest::Client::new();
    let resp = client.post(format!("{app}/api/cortex/tools/wasm/register"))
        .header("X-Cortex-Admin-Token", admin())
        .json(&serde_json::json!({
            "wasm_base64": "not-base64!@#",
            "manifest_json": "{}",
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 400);
}
```

- [ ] **Step 2: Commit**

```bash
cd cortex
git add tests/wasm_tools_e2e.rs
git commit -m "test(cortex): WasmToolProvider REST round-trip e2e (Spec #5)"
```

---

## Chunk 5.5: CI build step

**Files:**
- Modify: `.github/workflows/cortex-tests.yml` (or equivalent)

- [ ] **Step 1: Add wasm build step**

```yaml
# in cortex-tests job:
- name: Build wasm sample tool
  run: |
    rustup target add wasm32-unknown-unknown
    cd cortex/tests/fixtures/wasm/echo_tool
    cargo build --release --target wasm32-unknown-unknown
    mkdir -p ../../wasm
    cp target/wasm32-unknown-unknown/release/echo_tool.wasm ../../wasm/
```

- [ ] **Step 2: Commit**

```bash
cd .github
git add workflows/cortex-tests.yml
git commit -m "ci(cortex): build wasm32 sample tool for Spec #5 e2e"
```

(Repo path is the cortex repo, not the shadow-orchestration repo. Find `.github/workflows/cortex-tests.yml` under `https://github.com/iBLOC/cortex`.)

---

## Spec #5 acceptance

- [ ] All 5 chunks committed.
- [ ] `cd cortex && cargo test --lib tool::wasm_provider` passes.
- [ ] `cd cortex && cargo test --test wasm_tools_e2e` passes.
- [ ] CI build of echo_tool.wasm succeeds.
- [ ] Manual: POST a real wasm module to `/api/cortex/tools/wasm/register`, then invoke via `/tools/invoke`, verify result.

## Files NOT touched

- `cortex/src/visual_qa/*` — Spec #3 territory unchanged.
- `cortex/src/tool/{mod.rs adapter/* builtins/* peer_bridge.rs prompt.rs}` — Spec #4 territory unchanged.
- `cortex/src/flow/*` — Spec #4 flow integration unchanged; WasmToolProvider appears as a normal Tool in the registry.
- `shadow-desktop/*` — No client-side changes.
- Spec #1, #2, #3, #4 files — all locked.

## Implementation order (in cortex repo)

The chunks map directly to a clean PR sequence:

1. Chunk 5.1 → PR "feat: WasmToolProvider"
2. Chunk 5.2 → PR "test: sample echo_tool wasm fixture"
3. Chunk 5.3 → PR "feat: POST /api/cortex/tools/wasm/register"
4. Chunk 5.4 → PR "test: wasm_tools_e2e"
5. Chunk 5.5 → PR "ci: build wasm32 sample tool"

Each chunk is a self-contained, independently testable diff.
