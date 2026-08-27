# Spec #5: cortex WasmToolProvider 设计

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: cortex (Layer 3.5)
**关联 Spec**:
- Spec #4: 通用 Tool framework (已落地，d0cc43d / 785051d)
- Spec #5（本文件）: WasmToolProvider + 1 个示例 wasm tool

## 目标

让 cortex 把任意 Tool 包装成 wasm 隔离的 backend（WasmToolProvider）。
通过 Spec #4 的 `Tool<Args, Returns>` 抽象，工具作者可以写 Rust →
编译到 wasm → 通过 `WasmInstanceManager` 在 cortex 进程内安全运行。
不重写 Spec #4：WasmToolProvider 是 `Tool` trait 的一个 backend 实现，
与 built-in / MCP / Skill / Lobe / Peer 五种 adapter 并列。

非目标：
- 不实现通用 Tool sandbox 框架（wasm 隔离就是本 spec 唯一 sandbox 通道；
  future Spec 引入 HTTP / Code / Shell 时可加 nsjail / gVisor 路线）
- 不迁移 built-in tools 到 wasm（built-in 是 cortex 自己代码，不存在隔离需求）
- 不实现 agent 作为 wasm 模块（"agent 是 wasm" 是更深的 Spec #6+ 范围）
- 不改 MCP transport（保持 Spec #4 不变；MCP tools 继续走现有 McpRuntime）
- 不支持多语言 tool（仅 Rust → wasm32-unknown-unknown；Python / JS 留 future）

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ cortex                                                                 │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ core::tool::ToolRegistry (Spec #4)                                │ │
│  │   ├─ Builtin Tools (capture_frame, list_video_sources)          │ │
│  │   ├─ McpBackedTool      ──→ McpRuntime (Sprint 2, 已有)         │ │
│  │   ├─ SkillBackedTool    ──→ CortexA2AClient (已有)              │ │
│  │   ├─ LobeBackedTool     ──→ LobeClient (已有)                    │ │
│  │   ├─ PeerToolWrapper    ──→ CortexA2AClient (Spec #4, 已有)      │ │
│  │   └─ WasmToolProvider   ──→ WasmInstanceManager  ← NEW (本 spec)  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  WasmInstanceManager (cortex::wasm)                                     │
│   ├─ ResourceQuota: memory_bytes / fuel / wall_clock_ms / network    │
│   │   policy (DenyAll | AllowLoopback | AllowEgress)                  │
│   ├─ Per-instance Arc<Mutex<...>>; multiple calls serialize           │
│   └─ Out-of-process proxy: cortex has spawn_blocking wrapper          │
│                                                                        │
│  wasm tool binary                                                      │
│   ├─ exports: handle(args_ptr, args_len, out_ptr, out_cap) -> i32   │
│   └─ exports: manifest(out_ptr, out_cap) -> i32                       │
│      returns JSON: { "tools": [ {name, args_schema, returns_schema} ] }│
└──────────────────────────────────────────────────────────────────────────┘
                          ↑
         load via REST: POST /api/cortex/tools/wasm/register
         (body: { wasm_base64, manifest_json })
```

## Section 1: WasmToolProvider trait impl

```rust
// cortex/src/tool/wasm_provider.rs (NEW module)

use crate::tool::{AnyTool, Tool, ToolContext, ToolError};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;

/// Adapter that wraps a `WasmInstanceManager` + a single tool name as
/// a Spec #4 `Tool`. The wasm side exports a canonical `handle` C-ABI
/// function (JSON in, JSON out) and a `manifest` function listing the
/// tools the module provides.
pub struct WasmToolProvider {
    instance: Arc<synapse::wasm::WasmInstanceManager>,
    tool_name: String,           // Box::leak'd to 'static for trait
    args_schema: serde_json::Value,
    returns_schema: serde_json::Value,
    description: String,
}

// Wasm tools use a dynamic schema (untyped Value args/returns) because the
// schema is supplied at registration time via the manifest, not derived
// from a static Rust type. Spec #4 supports this through the
// serde_json::Value instantiation.
#[async_trait]
impl Tool for WasmToolProvider {
    type Args = serde_json::Value;
    type Returns = serde_json::Value;
    
    fn name(&self) -> &str { &self.tool_name }    // already 'static (Box::leak at registration)
    fn description(&self) -> &str { &self.description }
    fn version(&self) -> &str { "1" }            // wasm module re-load = bump version
    
    fn args_schema(&self) -> serde_json::Value { self.args_schema.clone() }
    fn returns_schema(&self) -> serde_json::Value { self.returns_schema.clone() }
    
    async fn invoke(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        let serialized = serde_json::to_vec(&args)
            .map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        let timeout = ctx.timeout_ms.unwrap_or(30_000);
        let result_bytes = self.instance
            .call_json(&self.tool_name, &serialized, timeout).await
            .map_err(|e| {
                if e.is_timeout() { ToolError::Timeout(timeout / 1000) }
                else { ToolError::Runtime { message: e.to_string(), transient: true } }
            })?;
        serde_json::from_slice(&result_bytes)
            .map_err(|e| ToolError::Internal(format!("wasm return parse: {e}")))
    }
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

pub async fn register_wasm_tools(
    tool_registry: Arc<ToolRegistry>,
    instance: Arc<WasmInstanceManager>,
    manifest: WasmToolManifest,
) -> Result<(), ToolError> {
    for entry in manifest.tools {
        let provider = WasmToolProvider {
            instance: instance.clone(),
            tool_name: Box::leak(entry.name.clone().into_boxed_str()),
            args_schema: entry.args_schema,
            returns_schema: entry.returns_schema,
            description: entry.description,
        };
        tool_registry.register_arc(Arc::new(provider)).await;
    }
    Ok(())
}
```

## Section 2: Sample wasm tool (echo_tool)

```toml
# cortex/tests/fixtures/wasm/echo_tool/Cargo.toml
[package]
name = "echo_tool"
edition = "2024"
version = "0.1.0"

[lib]
crate-type = ["cdylib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
// cortex/tests/fixtures/wasm/echo_tool/src/lib.rs
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct EchoArgs { pub text: String }
#[derive(Serialize, PartialEq, Debug)]
pub struct EchoReturns { pub echo: String }

/// C-ABI entry: read JSON args from input buffer, write JSON returns
/// to output buffer. Return value: positive = bytes written; negative
/// = error code (-1 args parse, -2 returns serialize, -3 output cap).
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

/// C-ABI entry: write the tool manifest JSON to output buffer.
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

**CI build step** (`.github/workflows/cortex-tests.yml`):

```yaml
- name: Build wasm sample tool
  run: |
    rustup target add wasm32-unknown-unknown
    cd cortex/tests/fixtures/wasm/echo_tool
    cargo build --release --target wasm32-unknown-unknown
    mkdir -p ../../fixtures
    cp target/wasm32-unknown-unknown/release/echo_tool.wasm ../../fixtures/
```

## Section 3: Inline tests in cortex

```rust
// cortex/src/tool/wasm_provider.rs (inline tests at bottom)

#[cfg(test)]
mod tests {
    use super::*;

    fn load_echo_wasm() -> Vec<u8> {
        include_bytes!("../../tests/fixtures/wasm/echo_tool.wasm").to_vec()
    }

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
        let wasm_bytes = load_echo_wasm();
        let quota = synapse::wasm::ResourceQuota::default();
        let instance = WasmInstanceManager::new(wasm_bytes.into(), quota).unwrap();
        let reg = Arc::new(ToolRegistry::new());
        register_wasm_tools(reg.clone(), Arc::new(instance), manifest).await.unwrap();
        let out = reg.invoke_value("echo", json!({ "text": "hi" }),
            &ToolContext::for_lobe("test")).await.unwrap();
        assert_eq!(out, json!({ "echo": "echo: hi" }));
    }

    #[tokio::test]
    async fn wasm_tool_provider_timeout() {
        // Use a wasm module that loops forever (separate fixture);
        // assert ToolError::Timeout with the configured timeout.
    }

    #[tokio::test]
    async fn wasm_tool_provider_runtime_error_on_panic() {
        // Use a wasm module that panics inside handle; assert
        // ToolError::Runtime { message: ..., transient: true }.
    }

    #[tokio::test]
    async fn wasm_tool_provider_invalid_args_returns_invalid_args_error() {
        // Pass args that don't match the schema (e.g. wrong type);
        // wasm handle returns -1; assert ToolError::InvalidArgs.
    }
}
```

## Section 4: REST surface

```rust
// cortex/src/api/tools.rs (extend Spec #4 routes)

#[derive(Deserialize)]
struct WasmRegisterBody {
    wasm_base64: String,        // base64-encoded .wasm bytes
    manifest_json: String,      // raw JSON string of WasmToolManifest
    #[serde(default)] resource_quota: Option<ResourceQuotaOverride>,
}

#[derive(Deserialize)]
struct ResourceQuotaOverride {
    memory_bytes: Option<u64>,
    fuel: Option<u64>,
    wall_clock_ms: Option<u64>,
    network_policy: Option<String>,
}

async fn wasm_register_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WasmRegisterBody>,
) -> Result<Json<Value>, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let wasm_bytes = base64_decode(&body.wasm_base64)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let manifest: WasmToolManifest = serde_json::from_str(&body.manifest_json)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let quota = body.resource_quota.map(|q| ResourceQuota::override(q)).unwrap_or_default();
    let instance = WasmInstanceManager::new(wasm_bytes.into(), quota)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    register_wasm_tools(state.tool_registry.clone(), Arc::new(instance), manifest).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "registered": true })))
}
```

Wire into the existing Spec #4 routes:
```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cortex/tools", get(list_tools))
        .route("/api/cortex/tools/{name}", get(get_tool))
        .route("/api/cortex/tools/invoke", post(invoke_tool))
        // ... Spec #4 routes ...
        .route("/api/cortex/tools/wasm/register", post(wasm_register_handler))
        // ... agent assignments ...
}
```

## Section 5: 错误处理 + 测试

| Case | Behavior |
|---|---|
| wasm `handle` panics | ToolError::Runtime { message: "wasm trap: ...", transient: true } |
| `handle` returns negative code | Map to typed error: -1 = InvalidArgs, -2 = Internal, -3 = ToolError::Runtime "output too large" |
| Timeout (default 30s; env 覆盖) | ToolError::Timeout |
| args size > quota (default 64KB) | ToolError::InvalidArgs "args too large" |
| output size > quota (default 1MB) | ToolError::Runtime "output too large" |
| `manifest` returns malformed JSON | HTTP 400 at registration; existing tools unaffected |
| unknown tool name in manifest | Skip with log warn (don't fail registration) |
| concurrent calls to same wasm tool | Serialized by WasmInstanceManager's internal lock; max_parallel = 1 by default |
| wasm module always panics | After N failures (default 3), mark `Broken`; skip in future resolution until admin restarts it |
| wasm module exceeds memory quota | Instance crashes; tool returns ToolError::Runtime "out of memory" |
| network policy = DenyAll (default) | wasm can't make outbound network calls; safe by construction |
| network policy = AllowLoopback | Can call localhost; not exposed to internet |

**Integration test** (gated, runs in CI only when `cargo build --target wasm32-unknown-unknown` succeeds):

```rust
// cortex/tests/wasm_tools_e2e.rs
#[tokio::test]
async fn full_wasm_tool_round_trip() {
    let (app, _) = boot_cortex_test().await;
    let wasm_bytes = include_bytes!("fixtures/wasm/echo_tool.wasm").to_vec();
    let body = serde_json::json!({
        "wasm_base64": base64::encode(&wasm_bytes),
        "manifest_json": include_str!("fixtures/wasm/echo_tool.manifest.json"),
    });
    let resp = reqwest::Client::new()
        .post(format!("{}/api/cortex/tools/wasm/register", app))
        .header("X-Cortex-Admin-Token", admin())
        .json(&body)
        .send().await.unwrap();
    assert_eq!(resp.status(), 201);
    // Now invoke through normal Tool registry
    let resp = reqwest::Client::new()
        .post(format!("{}/api/cortex/tools/invoke", app))
        .header("X-Cortex-Admin-Token", admin())
        .json(&serde_json::json!({ "tool": "echo", "args": { "text": "hi" } }))
        .send().await.unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["result"], serde_json::json!({ "echo": "echo: hi" }));
}
```

**Test counts added**:
- 4 inline unit tests in `wasm_provider.rs`
- 1 e2e integration test (`tests/wasm_tools_e2e.rs`)
- Plus 1 sample wasm module (`echo_tool.wasm`) built in CI

## 与 Spec #4 / cortex 现有代码的依赖

| 项 | 来源 | Spec #5 读取 |
|---|---|---|
| `Tool<Args, Returns>` trait | Spec #4 | `WasmToolProvider` 直接 impl 该 trait |
| `ToolRegistry::register_arc` | Spec #4 | wasm 工具注册 |
| `WasmInstanceManager` (synapse::wasm) | cortex 已有（per Sprint 2 McpRuntime） | wasm 隔离 + 资源 quota |
| `ResourceQuota` (memory / fuel / wall / network) | cortex 已有 | quota 注入 |
| `cortex::wasm::instance` | cortex 已有 | tool wasm 调进这个模块 |

## 范围外（未来 spec）

- HTTP / Code / Shell tools（Spec #6+ 引入 nsjail 或独立 sandbox）
- 多语言 tool（Python / JS / Ruby）→ 需要 wasi-python 之类的 runtime
- agent 作为 wasm 模块（"agent 是 wasm" 整层）
- 自动重载 / HMR 模式（目前需要 admin 显式调用 register）
- wasm 工具的 audit / metering（Spec #4 之后，Spec #6+）

## 风险

1. **C-ABI 兼容性**：`handle` 的 ABI 在不同 host 平台可能有对齐差异。`#[no_mangle] extern "C"` + u8 指针是稳定方案。
2. **工具作者的认知负担**：要懂 wasm32 target + C-ABI 序列化约定。文档 + example module 缓解。
3. **内存 quota 设置不当**：太小 → 工具 OOM；太大 → 单个恶意工具占用 cortex 过多内存。默认 64MB + 64KB args / 1MB output 留有余地。
4. **WasmInstanceManager 单例 per call**：Spec #4 + Spec #5 都假设 wasm instance 可以共享（`Arc<WasmInstanceManager>`）；现有 MCP runtime 也这样用——不需要 per-tool instance。
5. **CI 构建 wasm target**：`wasm32-unknown-unknown` 不在 rustup 默认组件——CI step 需要 `rustup target add` + `wasmtime` 系统库。
6. **并发调用 1 个 wasm module**：现有 WasmInstanceManager 内部 serialize；并发等于 1。这对长任务不友好；future Spec 允许多实例 + per-tool scheduler。
