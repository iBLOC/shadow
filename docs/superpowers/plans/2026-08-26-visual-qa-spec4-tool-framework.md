# Spec #4: cortex 通用 Tool Framework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Spec #3 minimal VisualQATool 泛化成统一 Tool trait；让 MCP / Skill / Lobe invoke 全部走 ToolRegistry；NodeKind::Tool 作为唯一 tool flow 节点；支持 per-agent tool 分配 + 跨 cortex peer tools。

**Architecture:** `Tool<Args: DeserializeOwned, Returns: Serialize>` + schemars 自动 schema → `AnyToolWrapper` 类型擦除 → `ToolRegistry`。Built-in (capture_frame / list_video_sources from Spec #3 迁移) + MCP / Skill / Lobe / Peer 四种 adapter。NodeKind::Tool 是主路径；NodeKind::Mcp/Skill/Lobe 保留为 legacy adapter 全部 delegate。LLM system prompt 由 ToolPromptBuilder 拼装。

**Tech Stack:**
- cortex: axum 0.8 + sqlx 0.8 + schemars 0.8 (new dep) + existing
- shadow-desktop / mobile: unaffected (no client-side changes)
- Existing 187 lib + 4 webrtc e2e + 28 integration tests must keep passing

**Spec:** `/home/ibloc/Projects/shadow/docs/superpowers/specs/2026-08-26-cortex-tool-framework-design.md`

---

## File Structure

### New files (cortex)

- `cortex/src/tool/mod.rs` — Tool trait + AnyTool wrapper + Empty marker + ToolContext + ToolError + ToolRegistry
- `cortex/src/tool/builtins/mod.rs` — BuiltinTools aggregate
- `cortex/src/tool/builtins/capture_frame.rs` — migrated from Spec #3 VisualQATool
- `cortex/src/tool/builtins/list_video_sources.rs` — migrated from Spec #3 VisualQATool
- `cortex/src/tool/adaptors/mcp.rs` — McpBackedTool
- `cortex/src/tool/adaptors/skill.rs` — SkillBackedTool
- `cortex/src/tool/adaptors/lobe.rs` — LobeBackedTool
- `cortex/src/tool/adaptors/peer.rs` — PeerToolWrapper
- `cortex/src/tool/prompt.rs` — ToolPromptBuilder
- `cortex/src/tool/peer_bridge.rs` — PeerToolBridge (mds_discovery subscription + per-peer reconcile)
- `cortex/src/api/tools.rs` — REST routes (tools list / invoke / agent assignments)

### Modified files (cortex)

- `cortex/Cargo.toml` — add `schemars = "0.8"`
- `cortex/src/lib.rs` — `pub mod tool;`
- `cortex/src/state.rs` — AppState gains `tool_registry: Arc<ToolRegistry>` + `peer_tool_bridge`
- `cortex/src/server.rs` — wire tool routes + capability bootstrap
- `cortex/src/flow/schema/kinds.rs` — `ToolParams` extends; add LegacyMcp/Skill/Lobe params
- `cortex/src/flow/adapter/registry.rs` — register `ToolNodeAdapter` (replaces/augments existing Mcp/Skill/Lobe)
- `cortex/src/flow/adapter/mcp.rs` — delegate to ToolNodeAdapter (refactor)
- `cortex/src/flow/adapter/skill.rs` — delegate (refactor)
- `cortex/src/flow/adapter/lobe.rs` — delegate (refactor)
- `cortex/src/flow/adapter/llm.rs` — call ToolPromptBuilder for system prompt + parse tool_calls
- `cortex/src/mcp/mod.rs` — register McpBackedTool for each discovered tool when server starts

### New files (tests)

- `cortex/src/tool/mod.rs` (inline tests)
- `cortex/tests/tools_e2e.rs`

### New files (sqlx migration)

- `cortex/migrations/<timestamp>_cortex_tool_assignments.sql`

---

## Chunk 4.1: Tool trait + Registry + Empty marker

**Files:**
- Create: `cortex/src/tool/mod.rs`
- Modify: `cortex/Cargo.toml`
- Modify: `cortex/src/lib.rs`

- [ ] **Step 1: Add schemars dep**

```toml
# cortex/Cargo.toml
[dependencies]
schemars = { version = "0.8", features = ["derive"] }
```

Run: `cd cortex && cargo build` (auto-resolves).

- [ ] **Step 2: Write core trait + tests**

```rust
// cortex/src/tool/mod.rs

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{de::DeserializeOwned, Serialize};
use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct Empty {}

pub struct ToolContext {
    pub requester: String,
    pub call_id: Uuid,
    pub timeout_ms: Option<u64>,
    pub require_authorization: bool,
}

impl ToolContext {
    pub fn for_lobe(name: &str) -> Self {
        Self { requester: name.into(), call_id: Uuid::new_v4(),
               timeout_ms: None, require_authorization: false }
    }
    pub fn for_rest(agent: String) -> Self {
        Self { requester: agent, call_id: Uuid::new_v4(),
               timeout_ms: Some(30_000), require_authorization: true }
    }
}

pub enum ToolError {
    InvalidArgs(String),
    Runtime { message: String, transient: bool },
    Timeout { timeout_ms: u64 },
    Unauthorized { required: String, actual: String },
    Unavailable { reason: String },
    Internal(String),
}

impl std::fmt::Display for ToolError { /* ... */ }
impl std::error::Error for ToolError {}

#[async_trait]
pub trait Tool: Send + Sync {
    type Args: DeserializeOwned + JsonSchema + Send + 'static;
    type Returns: Serialize + JsonSchema + Send + 'static;
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn version(&self) -> &str { "1" }
    async fn invoke(&self, args: Self::Args, ctx: &ToolContext) -> Result<Self::Returns, ToolError>;
}

pub trait AnyTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn version(&self) -> &str;
    fn args_schema(&self) -> &serde_json::Value;
    fn returns_schema(&self) -> &serde_json::Value;
    async fn invoke_value(&self, args: serde_json::Value, ctx: &ToolContext)
        -> Result<serde_json::Value, ToolError>;
}

pub struct AnyToolWrapper<T: Tool + 'static> { tool: Arc<T> }

impl<T: Tool + 'static> AnyTool for AnyToolWrapper<T> {
    fn name(&self) -> &str { self.tool.name() }
    fn description(&self) -> &str { self.tool.description() }
    fn version(&self) -> &str { self.tool.version() }
    fn args_schema(&self) -> &serde_json::Value {
        schemars::schema_for!(T::Args).into()
    }
    fn returns_schema(&self) -> &serde_json::Value {
        schemars::schema_for!(T::Returns).into()
    }
    async fn invoke_value(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        let typed_args: T::Args = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        let typed_out = self.tool.invoke(typed_args, ctx).await?;
        serde_json::to_value(typed_out).map_err(|e| ToolError::Internal(e.to_string()))
    }
}

pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn AnyTool>>>,
    assignments: RwLock<HashMap<String /* agent */, Vec<String> /* tool names */>>,
}

impl ToolRegistry {
    pub fn new() -> Self { Self::default() }
    pub async fn register<T: Tool + 'static>(&self, tool: T) {
        let wrapper = AnyToolWrapper { tool: Arc::new(tool) };
        self.tools.write().await.insert(wrapper.name().into(), Arc::new(wrapper));
    }
    pub async fn register_arc(&self, tool: Arc<dyn AnyTool>) {
        self.tools.write().await.insert(tool.name().into(), tool);
    }
    pub async fn get(&self, name: &str) -> Option<Arc<dyn AnyTool>> {
        self.tools.read().await.get(name).cloned()
    }
    pub async fn unregister(&self, name: &str) {
        self.tools.write().await.remove(name);
    }
    pub async fn list(&self) -> Vec<ToolDescriptor> {
        self.tools.read().await.values()
            .map(|t| ToolDescriptor {
                name: t.name().into(), description: t.description().into(),
                version: t.version().into(),
                args_schema: t.args_schema().clone(),
                returns_schema: t.returns_schema().clone(),
                origin: ToolOrigin::default(),
                agent_assignable: true,
            }).collect()
    }
    pub async fn list_for_agent(&self, agent: &str) -> Vec<ToolDescriptor> {
        let assigned = self.assigned_tools(agent).await;
        self.list().await.into_iter()
            .filter(|t| assigned.iter().any(|name| name == &t.name))
            .collect()
    }
    pub async fn is_assigned(&self, agent: &str, tool_name: &str) -> bool {
        self.assignments.read().await.get(agent)
            .map(|v| v.iter().any(|n| n == tool_name))
            .unwrap_or(false)
    }
    pub async fn assign(&self, agent: &str, tools: Vec<String>) {
        self.assignments.write().await.insert(agent.into(), tools);
    }
    pub async fn unassign(&self, agent: &str, tool: &str) {
        if let Some(v) = self.assignments.write().await.get_mut(agent) {
            v.retain(|n| n != tool);
        }
    }
    pub async fn assigned_tools(&self, agent: &str) -> Vec<String> {
        self.assignments.read().await.get(agent).cloned().unwrap_or_default()
    }
    pub async fn invoke_value(&self, name: &str, args: Value, ctx: &ToolContext)
        -> Result<Value, ToolError> {
        let tool = self.get(name).await
            .ok_or_else(|| ToolError::InvalidArgs(format!("unknown tool: {name}")))?;
        if ctx.require_authorization && !self.is_assigned(&ctx.requester, name).await {
            return Err(ToolError::Unauthorized {
                required: name.into(), actual: ctx.requester.clone(),
            });
        }
        tool.invoke_value(args, ctx).await
    }
}

#[derive(Serialize, Clone)]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub version: String,
    pub args_schema: serde_json::Value,
    pub returns_schema: serde_json::Value,
    pub origin: ToolOrigin,
    pub agent_assignable: bool,
}

#[derive(Serialize, Clone, Default)]
pub struct ToolOrigin { /* see Spec #4 Section 5 */ }
```

Inline tests at bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Serialize, Deserialize};

    struct HelloTool;
    #[derive(Deserialize, JsonSchema)] struct HelloArgs { name: String }
    #[derive(Serialize, JsonSchema, PartialEq, Debug)] struct HelloReturns { greeting: String }

    #[async_trait]
    impl Tool for HelloTool {
        type Args = HelloArgs;
        type Returns = HelloReturns;
        fn name(&self) -> &str { "hello" }
        fn description(&self) -> &str { "Greet someone" }
        async fn invoke(&self, args: HelloArgs, _: &ToolContext)
            -> Result<HelloReturns, ToolError> {
            Ok(HelloReturns { greeting: format!("hi, {}", args.name) })
        }
    }

    struct EmptyTool;
    #[derive(Deserialize, JsonSchema)] struct EmptyArgs(Empty);
    impl Tool for EmptyTool {
        type Args = EmptyArgs;
        type Returns = EmptyArgs;
        fn name(&self) -> &str { "empty" }
        fn description(&self) -> &str { "Empty-args tool" }
        async fn invoke(&self, _a: EmptyArgs, _: &ToolContext)
            -> Result<EmptyArgs, ToolError> { Ok(EmptyArgs(Empty {})) }
    }

    #[tokio::test]
    async fn register_and_invoke_roundtrip() {
        let reg = ToolRegistry::new();
        reg.register(HelloTool).await;
        let out = reg.invoke_value("hello", json!({"name": "alice"}),
            &ToolContext::for_lobe("test")).await.unwrap();
        assert_eq!(out["greeting"], "hi, alice");
    }

    #[tokio::test]
    async fn empty_args_tool_works() {
        let reg = ToolRegistry::new();
        reg.register(EmptyTool).await;
        let out = reg.invoke_value("empty", json!({}), &ToolContext::for_lobe("t")).await.unwrap();
        assert_eq!(out, json!({}));
    }

    #[tokio::test]
    async fn invoke_returns_unauthorized_when_agent_not_assigned() {
        let reg = ToolRegistry::new();
        reg.register(HelloTool).await;
        let ctx = ToolContext::for_rest("unauthorized_agent".into());
        let err = reg.invoke_value("hello", json!({"name": "x"}), &ctx).await.unwrap_err();
        assert!(matches!(err, ToolError::Unauthorized { .. }));
    }

    #[tokio::test]
    async fn agent_assignment_wildcard_matches() {
        let reg = ToolRegistry::new();
        reg.assign("*", vec!["hello".into()]).await;
        assert!(reg.is_assigned("new_agent", "hello").await);
    }
}
```

Run: `cd cortex && cargo test --lib tool`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
cd cortex
git add Cargo.toml src/tool/mod.rs src/lib.rs
git commit -m "feat(cortex): Tool trait + Registry + Empty marker (Spec #4 core)"
```

---

## Chunk 4.2: Migrate Spec #3 builtins + adapter scaffolds

**Files:**
- Create: `cortex/src/tool/builtins/mod.rs`
- Create: `cortex/src/tool/builtins/capture_frame.rs`
- Create: `cortex/src/tool/builtins/list_video_sources.rs`
- Modify: `cortex/src/state.rs`

- [ ] **Step 1: Migrate Spec #3 capture_frame to typed Tool**

```rust
// cortex/src/tool/builtins/capture_frame.rs

use crate::tool::{Empty, Tool, ToolContext, ToolError};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

#[derive(Deserialize, JsonSchema)]
pub struct CaptureFrameArgs {
    pub source_id: String,
}

#[derive(Serialize, JsonSchema)]
pub struct CaptureFrameReturns {
    pub jpeg_base64: String,
    pub width: u32,
    pub height: u32,
    pub captured_at: String,
}

pub struct CaptureFrameTool {
    pub capabilities: Arc<crate::visual_qa::capability_registry::CapabilityRegistry>,
    pub video_sources_repo: Arc<crate::visual_qa::repo::VideoSourcesRepo>,
}

#[async_trait]
impl Tool for CaptureFrameTool {
    type Args = CaptureFrameArgs;
    type Returns = CaptureFrameReturns;
    fn name(&self) -> &str { "capture_frame" }
    fn description(&self) -> &str { "Capture a single frame from the configured video source as JPEG bytes (base64-encoded)." }
    async fn invoke(&self, args: CaptureFrameArgs, ctx: &ToolContext) -> Result<Self::Returns, ToolError> {
        let source = self.video_sources_repo.get(&args.source_id).await
            .map_err(|e| ToolError::Internal(e.to_string()))?
            .ok_or_else(|| ToolError::InvalidArgs(format!("source not found: {}", args.source_id)))?;
        let capability = match source.transport.as_str() {
            "browser" => "capture_frame_uvc",
            "tauri-rust" => "capture_frame_native_camera",
            other => return Err(ToolError::Internal(format!("unknown transport: {other}"))),
        };
        let provider = self.capabilities.resolve(capability).await
            .ok_or_else(|| ToolError::Unavailable(format!("no reachable provider for {capability}")))?;
        // HTTP POST to provider.invoke endpoint (existing logic from Spec #3 tools.rs)
        // ... (copy from Spec #3 CaptureFrameTool::invoke_value body)
        todo!("port Spec #3 implementation")
    }
}
```

Similar for `ListVideoSourcesTool` (with `Empty` Args).

- [ ] **Step 2: Register in AppState**

```rust
// cortex/src/state.rs (AppState::new)
let tool_registry = ToolRegistry::new();
tool_registry.register(CaptureFrameTool::new(capabilities.clone(), video_sources_repo.clone())).await;
tool_registry.register(ListVideoSourcesTool::new(video_sources_repo.clone())).await;
// Migrate Spec #3's VisualQAToolRegistry → fold into the central tool_registry.
// VisualQALobe gets a reference to the central registry.
```

- [ ] **Step 3: Commit**

```bash
cd cortex
git add src/tool/builtins/ src/state.rs
git commit -m "feat(cortex): builtins migrate from Spec #3 VisualQATool"
```

---

## Chunk 4.3: Adapter scaffolds (MCP / Skill / Lobe / Peer)

**Files:**
- Create: `cortex/src/tool/adaptors/mod.rs`
- Create: `cortex/src/tool/adaptors/mcp.rs`
- Create: `cortex/src/tool/adaptors/skill.rs`
- Create: `cortex/src/tool/adaptors/lobe.rs`
- Create: `cortex/src/tool/adaptors/peer.rs`

- [ ] **Step 1: McpBackedTool**

```rust
// cortex/src/tool/adaptors/mcp.rs

pub struct McpBackedTool {
    pub runtime: Arc<crate::mcp::McpRuntime>,
    pub server_id: String,
    pub tool_name: String,
}

#[async_trait]
impl Tool for McpBackedTool {
    type Args = serde_json::Value;
    type Returns = serde_json::Value;
    fn name(&self) -> &str {
        // Internal allocation — 'static leak acceptable for tool names
        Box::leak(format!("mcp:{}:{}", self.server_id, self.tool_name).into_boxed_str())
    }
    fn description(&self) -> &str { "MCP-backed tool" }
    async fn invoke(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        self.runtime.invoke(&self.server_id, &self.tool_name, args,
            ctx.timeout_ms.unwrap_or(30_000)).await
            .map_err(|e| ToolError::Runtime { message: e.to_string(), transient: true })
    }
}
```

- [ ] **Step 2: Wire MCP runtime → McpBackedTool registration**

In `cortex/src/mcp/mod.rs`, when a server starts (`start()` succeeds), iterate discovered tools and register an `McpBackedTool` for each:

```rust
pub fn on_server_started(...) -> Vec<McpBackedTool> {
    tools.iter().map(|t| McpBackedTool { runtime: self.clone(), server_id: id.clone(), tool_name: t.name.clone() }).collect()
}
```

Then register them with the central `tool_registry`:

```rust
for tool in mcp_runtime.on_server_started(server_id) {
    tool_registry.register_arc(Arc::new(tool)).await;
}
```

- [ ] **Step 3: SkillBackedTool + LobeBackedTool**

Similar pattern. SkillBackedTool calls `CortexA2AClient::send_task(skill_id, args)`. LobeBackedTool calls `LobeClient::Native/Http/Wasm`.

- [ ] **Step 4: PeerToolBridge**

- [ ] **Step 5: Commit (per adapter)**

```bash
cd cortex
git add src/tool/adaptors/ src/mcp/mod.rs
git commit -m "feat(cortex): tool adapters for MCP / Skill / Lobe / Peer"
```

---

## Chunk 4.4: NodeKind integration + ToolNodeAdapter

**Files:**
- Create: `cortex/src/flow/adapter/tool.rs`
- Modify: `cortex/src/flow/schema/kinds.rs`
- Modify: `cortex/src/flow/adapter/registry.rs`
- Modify: `cortex/src/flow/adapter/mcp.rs` (delegate)
- Modify: `cortex/src/flow/adapter/skill.rs` (delegate)
- Modify: `cortex/src/flow/adapter/lobe.rs` (delegate)

- [ ] **Step 1: Write failing tests for ToolNodeAdapter**

```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn flow_with_tool_node_runs_through_tool_registry() {
        let tool_registry = ToolRegistry::new();
        tool_registry.register(EchoTool).await;
        let adapter = ToolNodeAdapter::new(tool_registry);
        let node = Node { kind: NodeKind::Tool(ToolParams {
            tool_name: "echo".into(),
            args_template: r#"{"text": "hi"}"#.into(),
            assign_to: None,
            timeout_ms: None,
        }), .. };
        let mut ctx = FlowContext::default();
        ctx.flow_owner_agent = "test_agent".into();
        tool_registry.assign("test_agent", vec!["echo".into()]).await;
        adapter.execute(&node, &mut ctx).await.unwrap();
        assert_eq!(ctx.get_var(&node.id), Some(json!({ "echo": "hi" })));
    }

    #[tokio::test]
    async fn flow_with_legacy_mcp_node_runs_through_tool_registry() {
        let tool_registry = ToolRegistry::new();
        tool_registry.register(McpBackedToolEcho).await;
        let adapter = ToolNodeAdapter::new(tool_registry);
        let node = Node { kind: NodeKind::Mcp(LegacyMcpParams {
            server_id: "srv1".into(),
            tool_name: "echo".into(),
            args_template: "{}".into(),
            timeout_ms: None,
        }), .. };
        let mut ctx = FlowContext::default();
        ctx.flow_owner_agent = "test_agent".into();
        adapter.execute(&node, &mut ctx).await.unwrap();
    }
}
```

- [ ] **Step 2: Implement ToolNodeAdapter**

```rust
// cortex/src/flow/adapter/tool.rs

pub struct ToolNodeAdapter { tool_registry: Arc<ToolRegistry> }

#[async_trait]
impl FlowNodeAdapter for ToolNodeAdapter {
    fn kind(&self) -> &'static str { "tool" }
    async fn execute(&self, node: &Node, ctx: &mut FlowContext) -> Result<(), String> {
        let synthetic_name = match &node.kind {
            NodeKind::Tool(p) => p.tool_name.clone(),
            NodeKind::Mcp(p) => format!("mcp:{}:{}", p.server_id, p.tool_name),
            NodeKind::Skill(p) => match &p.peer_cortex_id {
                Some(peer) => format!("peer:{}:skill:{}", peer, p.skill_id),
                None => format!("skill:{}", p.skill_id),
            },
            NodeKind::Lobe(p) => format!("lobe:{}", p.lobe_id),
            _ => return Err("not a tool-kind node".into()),
        };
        let (args_template, timeout_ms, assign_to) = match &node.kind {
            NodeKind::Tool(p) => (p.args_template.clone(), p.timeout_ms, p.assign_to.clone()),
            NodeKind::Mcp(p) => (p.args_template.clone(), p.timeout_ms, None),
            NodeKind::Skill(p) => (p.args_template.clone(), p.timeout_ms, None),
            NodeKind::Lobe(p) => (p.input_template.clone(), p.timeout_ms, None),
            _ => unreachable!(),
        };
        let agent = assign_to.unwrap_or_else(|| ctx.flow_owner_agent.clone());
        if !self.tool_registry.is_assigned(&agent, &synthetic_name).await {
            return Err(format!("tool '{synthetic_name}' not assigned to agent '{agent}'"));
        }
        let args_value = render_template(&args_template, &ctx.vars)
            .map_err(|e| format!("args template: {e}"))?;
        let timeout = timeout_ms.unwrap_or(30_000);
        let tool_ctx = ToolContext {
            requester: format!("flow:{}", ctx.flow_id),
            call_id: Uuid::new_v4(),
            timeout_ms: Some(timeout),
            require_authorization: false,
        };
        let result = self.tool_registry.invoke_value(&synthetic_name, args_value, &tool_ctx).await
            .map_err(|e| format!("tool invoke: {e}"))?;
        ctx.set_var(&node.id, result);
        Ok(())
    }
}
```

- [ ] **Step 3: Refactor existing adapters to delegate**

Each of `mcp.rs`, `skill.rs`, `lobe.rs` becomes a 30-line file that just builds a synthetic NodeKind::Tool and calls ToolNodeAdapter.

- [ ] **Step 4: Run ALL existing flow tests + new tests**

```bash
cd cortex && cargo test --lib
```

Expected: 187 existing + new tests ALL PASS.

- [ ] **Step 5: Commit**

```bash
cd cortex
git add src/flow/
git commit -m "feat(cortex): ToolNodeAdapter + legacy adapter delegation"
```

---

## Chunk 4.5: ToolPromptBuilder + LLM tool_calls parsing

**Files:**
- Create: `cortex/src/tool/prompt.rs`
- Modify: `cortex/src/flow/adapter/llm.rs`

- [ ] **Step 1: Write tests**

```rust
// cortex/src/tool/prompt.rs (inline tests)
#[tokio::test]
async fn system_prompt_includes_only_assigned_tools() {
    let reg = ToolRegistry::new();
    reg.register(HelloTool).await;
    reg.register(WorldTool).await;
    reg.assign("agent_a", vec!["hello".into()]).await;
    let prompt = ToolPromptBuilder::new(Arc::new(reg)).build_for_agent("agent_a").await;
    assert!(prompt.contains("hello"));
    assert!(!prompt.contains("world"));
}

#[tokio::test]
async fn system_prompt_orders_tools_builtin_first() {
    // Assign capture_frame (builtin) and mcp:playwright:browser (mcp)
    // Assert section order: builtin then mcp
}
```

- [ ] **Step 2: Implement ToolPromptBuilder**

```rust
pub struct ToolPromptBuilder { registry: Arc<ToolRegistry> }

impl ToolPromptBuilder {
    pub async fn build_for_agent(&self, agent: &str) -> String {
        let assigned = self.registry.list_for_agent(agent).await;
        if assigned.is_empty() { return String::new(); }
        // Sort: builtin → mcp → skill → lobe → peer (lexicographic within group)
        let mut lines = vec!["# Available tools".to_string(),
            "You may call any of the following tools by name. Pass arguments per the schema.".to_string(),
            String::new()];
        // group + sort
        let mut by_origin: BTreeMap<String, Vec<&ToolDescriptor>> = BTreeMap::new();
        for t in &assigned {
            by_origin.entry(origin_group(&t.origin)).or_default().push(t);
        }
        for (group, mut tools) in by_origin {
            tools.sort_by(|a, b| a.name.cmp(&b.name));
            lines.push(format!("## {group} tools"));
            for t in tools {
                lines.push(format!("### `{}` (v{})", t.name, t.version));
                lines.push(t.description.clone());
                lines.push(String::new());
                lines.push(format!("Parameters:\n```json\n{}\n```",
                    serde_json::to_string_pretty(&t.args_schema).unwrap_or_default()));
            }
        }
        lines.join("\n")
    }
}

fn origin_group(o: &ToolOrigin) -> String {
    match o {
        ToolOrigin::Builtin { .. } => "Builtin".into(),
        ToolOrigin::Mcp { .. } => "MCP".into(),
        ToolOrigin::Skill { .. } => "Skill".into(),
        ToolOrigin::Lobe { .. } => "Lobe".into(),
        ToolOrigin::Peer { .. } => "Peer".into(),
    }
}
```

- [ ] **Step 3: Wire into LlmNodeAdapter**

```rust
// cortex/src/flow/adapter/llm.rs
impl LlmNodeAdapter {
    async fn assemble_system_prompt(&self, ctx: &FlowContext) -> String {
        let base = self.base_prompt.clone();
        let tool_section = ToolPromptBuilder::new(self.tool_registry.clone())
            .build_for_agent(&ctx.flow_owner_agent).await;
        if tool_section.is_empty() { base }
        else { format!("{base}\n\n{tool_section}") }
    }

    async fn execute(&self, node, ctx) -> Result<(), String> {
        let reply = call_llm(/* with the tool-equipped system prompt */).await?;
        // If reply contains tool_calls, dispatch each via tool_registry
        for call in reply.tool_calls {
            let result = self.tool_registry.invoke_value(
                &call.name, call.arguments, &tool_ctx_for_flow(ctx)).await?;
            // Append result to conversation history
        }
        Ok(())
    }
}
```

- [ ] **Step 4: Tests + commit**

```bash
cd cortex
git add src/tool/prompt.rs src/flow/adapter/llm.rs
git commit -m "feat(cortex): ToolPromptBuilder + LlmNodeAdapter tool_calls"
```

---

## Chunk 4.6: Peer tool bridge + REST surface + persistence

**Files:**
- Create: `cortex/src/tool/peer_bridge.rs`
- Create: `cortex/src/api/tools.rs`
- Create: `cortex/migrations/<ts>_cortex_tool_assignments.sql`
- Modify: `cortex/src/state.rs`
- Modify: `cortex/src/server.rs`

- [ ] **Step 1: SQL migration**

```sql
CREATE TABLE cortex_tool_assignments (
    agent_name TEXT NOT NULL,
    tool_name  TEXT NOT NULL,
    PRIMARY KEY (agent_name, tool_name)
);
```

- [ ] **Step 2: PeerToolBridge**

```rust
pub struct PeerToolBridge {
    peer_registry: Arc<PeerSourceRegistry>,    // reuses Spec #2
    tool_registry: Arc<ToolRegistry>,
    mds: Arc<MdsDiscovery>,
}

impl PeerToolBridge {
    pub async fn refresh_all(&self) {
        for peer in self.peer_registry.all_peers().await {
            self.refresh_one(&peer).await;
        }
    }
    
    async fn refresh_one(&self, peer: &PeerSourceEntry) -> Result<()> {
        let url = format!("{}/api/cortex/tools", peer.cortex_url);
        let resp = reqwest::get(&url)
            .header("X-Cortex-Admin-Token", &peer.admin_token).send().await?;
        let body: PeerToolsResponse = resp.json().await?;
        self.reconcile(&peer.peer_cortex_id, body.tools).await;
        Ok(())
    }
    
    async fn reconcile(&self, peer_id: &str, remote: Vec<ToolDescriptor>) {
        // For each remote tool, register a PeerToolWrapper under
        // "peer:<peer_id>:<tool_name>". Unregister any peer:<peer_id>:*
        // not in remote.
        let current = self.tool_registry.list().await;
        let want: HashSet<String> = remote.iter().map(|t| format!("peer:{}:{}", peer_id, t.name)).collect();
        for t in current {
            if t.name.starts_with(&format!("peer:{peer_id}:")) && !want.contains(&t.name) {
                self.tool_registry.unregister(&t.name).await;
            }
        }
        for t in remote {
            self.tool_registry.register_arc(Arc::new(PeerToolWrapper {
                peer_cortex_id: peer_id.into(),
                tool_name: t.name.clone(),
                client: self.client_for(peer_id).await,
                args_schema: t.args_schema,
                returns_schema: t.returns_schema,
            })).await;
        }
    }
}
```

Spawn a refresh loop in AppState bootstrap (every 30s, same cadence as Spec #2 broadcast).

- [ ] **Step 3: REST routes**

```rust
// cortex/src/api/tools.rs

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cortex/tools", get(list_tools))
        .route("/api/cortex/tools/{name}", get(get_tool))
        .route("/api/cortex/tools/invoke", post(invoke_tool))
        .route("/api/cortex/agents/{name}/tools", get(get_agent_tools).post(set_agent_tools))
        .route("/api/cortex/agents/{name}/tools/{tool}", delete(unassign_tool))
        .route("/api/cortex/agents/{name}/tools/grant-all", post(grant_all))
}

async fn list_tools(State(state): State<AppState>) -> Json<Vec<ToolDescriptor>> { Json(state.tool_registry.list().await) }

async fn invoke_tool(
    State(state): State<AppState>, headers: HeaderMap,
    Json(body): Json<InvokeToolBody>,
) -> Result<Json<Value>, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let ctx = ToolContext::for_rest(body.agent.unwrap_or_else(|| "anonymous".into()));
    let result = state.tool_registry.invoke_value(&body.tool, body.args, &ctx).await
        .map_err(|e| tool_error_to_status(&e))?;
    Ok(Json(json!({ "result": result, "tool": body.tool, "called_at": chrono::Utc::now().to_rfc3339() })))
}

async fn set_agent_tools(State(state): State<AppState>, Path(name): Path<String>,
    Json(tools): Json<SetToolsBody>) -> Result<StatusCode, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    state.tool_registry.assign(&name, tools.tools).await;
    // Persist to cortex_tool_assignments
    sqlx::query!("DELETE FROM cortex_tool_assignments WHERE agent_name = $1", name)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    for tool in &tools.tools {
        sqlx::query!("INSERT INTO cortex_tool_assignments (agent_name, tool_name) VALUES ($1, $2)",
            name, tool).execute(&state.pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::OK)
}

async fn grant_all(State(state): State<AppState>, Path(name): Path<String>) -> Result<Json<Value>, StatusCode> {
    let all = state.tool_registry.list().await;
    let names: Vec<String> = all.iter().filter(|t| t.agent_assignable).map(|t| t.name.clone()).collect();
    state.tool_registry.assign(&name, names.clone()).await;
    Ok(Json(json!({ "assigned_count": names.len() })))
}
```

Add `Persist agent_assignments on AppState::new()`: load from DB at boot.

- [ ] **Step 4: Tests**

```rust
// cortex/src/tool/mod.rs (extend inline tests)
#[tokio::test]
async fn agent_assignments_persist_roundtrip() {
    let reg = ToolRegistry::new();
    reg.register(HelloTool).await;
    reg.assign("agent_a", vec!["hello".into()]).await;
    // simulate persistence
    let stored = serde_json::to_string(&reg.assigned_tools("agent_a").await).unwrap();
    // simulate new registry instance + restore
    let reg2 = ToolRegistry::new();
    reg2.register(HelloTool).await;
    let names: Vec<String> = serde_json::from_str(&stored).unwrap();
    reg2.assign("agent_a", names).await;
    assert!(reg2.is_assigned("agent_a", "hello").await);
}
```

- [ ] **Step 5: Commit**

```bash
cd cortex
git add migrations/ src/tool/peer_bridge.rs src/api/tools.rs src/state.rs src/server.rs
git commit -m "feat(cortex): peer tool bridge + REST + agent assignment persistence"
```

---

## Chunk 4.7: E2E integration test

**Files:**
- Create: `cortex/tests/tools_e2e.rs`

- [ ] **Step 1: Integration test**

```rust
#[tokio::test]
async fn flow_with_tool_node_e2e() {
    let (app, _) = boot_cortex_test().await;
    // Register a builtin tool
    app.state.tool_registry.register(EchoTool).await;
    app.state.tool_registry.assign("default", vec!["echo".into()]).await;
    
    // POST flow run with a Tool node
    let resp = Client::new().post(format!("{app}/api/flows"))
        .header("X-Cortex-Admin-Token", admin())
        .json(&json!({
            "nodes": [
                { "id": "n1", "kind": { "type": "tool", "tool_name": "echo", "args_template": r#"{"x":42}"# } },
                { "id": "n2", "kind": { "type": "answer", "from": "n1" } }
            ],
            "edges": [{ "from": "n1", "to": "n2" }]
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn legacy_mcp_node_still_works_via_delegation() {
    // Same as above but with NodeKind::Mcp(LegacyMcpParams { ... })
}
```

Run: `cd cortex && cargo test --test tools_e2e -- --nocapture`
Expected: ALL PASS.

- [ ] **Step 2: Commit**

```bash
cd cortex
git add tests/tools_e2e.rs
git commit -m "test(cortex): Tool framework e2e + legacy MCP delegation"
```

---

## Spec #4 acceptance

- [ ] All 7 chunks committed.
- [ ] `cd cortex && cargo test --lib` passes — 187 existing + ~14 new tests green.
- [ ] `cd cortex && cargo test --test tools_e2e` passes.
- [ ] Existing flow tests still pass (legacy Mcp/Skill/Lobe delegation).
- [ ] End-to-end: assign tool to agent → flow runs Tool node → LLM system prompt contains the tool schema → tool_call dispatch works.

## Files NOT touched

- `cortex/src/visual_qa/tools.rs` — Spec #3's `VisualQATool` trait is folded into the central `Tool`; the file becomes `tool/builtins/capture_frame.rs`. The legacy type aliases for backward compat can stay as re-exports.
- `cortex/src/api/visual_qa_capabilities.rs` + `visual_qa_tools.rs` — Spec #3's REST surface stays as is (handles capability + tool invocations). Spec #4 adds `/api/cortex/tools/*` next to it.
- `cortex/src/lobes/visual_qa.rs` — Spec #3 VisualQALobe stays; just changes how it dispatches: uses `tool_registry.invoke_value` instead of `visual_qa_tools.invoke_value`.
- `shadow-desktop/src/*` — No client-side changes for Spec #4; the tool assignment endpoints are admin-only via cortex admin token.
