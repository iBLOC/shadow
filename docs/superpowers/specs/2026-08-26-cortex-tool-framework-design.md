# Cortex 通用 Tool Framework 设计 (Spec #4)

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: cortex (Layer 3.5)
**关联 Spec**:
- Spec #1: shadow-desktop 视频源配置 (3a474e2, shipped)
- Spec #2: cortex 视觉问答路由 (ba79ff1, shipped)
- Spec #3: cortex 视觉问答 Service + minimal Tool 抽象 (d0cc43d, shipped)
- Spec #4（本文件）: 通用 Tool framework + flow 集成 + 跨 cortex peer 工具

## 目标

把 Spec #3 的 `VisualQATool` 最小抽象、cortex 现有的 MCP / Skill / Lobe invoke、
未来将出现的工具类型，全部统一到一个 `Tool` trait + `ToolRegistry` 之下。
让 agent 在 LLM prompt 看到一份统一的工具列表，在 flow 里以 `NodeKind::Tool`
统一调用 MCP / Skill / 本机 / 跨 cortex peer 的任何工具。

非目标：
- 不重写 MCP 的 wasm runtime / transport（沿用现有 `cortex::mcp`）
- 不重写 Skill / Lobe invoke 的 A2A 调用细节
- 不重写 A2A protocol
- 不实现新的 HTTP / Code / Shell tool provider（保留 hook）
- 不实现 Tool 安全 sandboxing（Spec #4 之后；当前走 admin token + 进程边界）
- 不实现 Tool 调用 audit / metering（未来）

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ cortex (一个 binary, 内嵌所有 native lobes + embedded neuron + flow)        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ core::tool::ToolRegistry                                          │    │
│  │   ├─ builtin tools: capture_frame, list_video_sources (Spec #3)  │    │
│  │   ├─ McpBackedTool     (per MCP server × per tool)               │    │
│  │   ├─ SkillBackedTool   (per skill id × per peer cortex)          │    │
│  │   ├─ LobeBackedTool     (per lobe id)                            │    │
│  │   └─ PeerToolWrapper   (per peer cortex × per remote tool)       │    │
│  │                                                                  │    │
│  │   agent_assignments:  HashMap<agent_name, Vec<tool_name>>       │    │
│  │   REST surface:                                                │    │
│  │     GET    /api/cortex/tools                                      │    │
│  │     POST   /api/cortex/tools/invoke                              │    │
│  │     GET    /api/cortex/agents/{name}/tools                       │    │
│  │     POST   /api/cortex/agents/{name}/tools                       │    │
│  │     DELETE /api/cortex/agents/{name}/tools/{tool}                │    │
│  │     POST   /api/cortex/agents/{name}/tools/grant-all             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ core::flow                                                       │    │
│  │   NodeKind::Tool(ToolParams)              — NEW primary          │    │
│  │   NodeKind::Mcp(LegacyMcpParams)          — legacy adapter       │    │
│  │   NodeKind::Skill(LegacySkillParams)      — legacy adapter       │    │
│  │   NodeKind::Lobe(LegacyLobeParams)        — legacy adapter       │    │
│  │                                                                  │    │
│  │   All 4 NodeKinds → resolve to ToolNodeAdapter                   │    │
│  │   LLM node system prompt += ToolPromptBuilder                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ core::peer::PeerToolBridge                                       │    │
│  │   - subscribes to mds_discovery updates                          │    │
│  │   - GETs each peer's /api/cortex/tools                            │    │
│  │   - registers/unregisters PeerToolWrapper instances              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                          ↑
┌──────────────────────────────────────────────────────────────────────────┐
│ Peer cortex (separate process / sidecar)                                  │
│   exposes /api/cortex/tools (read-only for now)                            │
│   when a local Tool is invoked and the agent specifies peer_tool_name,    │
│   the peer A2A-skill dispatch happens transparently                        │
└──────────────────────────────────────────────────────────────────────────┘
```

## Section 1: Tool trait + Registry

```rust
// cortex/src/tool/mod.rs (NEW top-level module)

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{de::DeserializeOwned, Serialize};
use uuid::Uuid;

/// Central abstraction. Anything an agent can call is a Tool:
/// - Built-in (capture_frame, list_video_sources from Spec #3 migrated)
/// - MCP-backed (registered dynamically when MCP server starts)
/// - Skill-backed (per A2A skill discovered)
/// - Lobe-backed (per cortex lobe registered)
/// - Peer-backed (per remote cortex tool discovered)
#[async_trait]
pub trait Tool: Send + Sync {
    type Args: DeserializeOwned + JsonSchema + Send + 'static;
    type Returns: Serialize + JsonSchema + Send + 'static;

    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn version(&self) -> &str { "1" }

    /// Auto-generated JSON Schema for Args; can be overridden.
    fn args_schema(&self) -> serde_json::Value {
        serde_json::to_value(schemars::schema_for!(Self::Args)).unwrap_or_default()
    }
    fn returns_schema(&self) -> serde_json::Value {
        serde_json::to_value(schemars::schema_for!(Self::Returns)).unwrap_or_default()
    }

    async fn invoke(
        &self,
        args: Self::Args,
        ctx: &ToolContext,
    ) -> Result<Self::Returns, ToolError>;
}

/// Marker for tools with no input / no output. You said "输入输出可以为空".
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct Empty {}

pub struct ToolContext {
    pub requester: String,           // agent / lobe / flow-id
    pub call_id: Uuid,
    pub timeout_ms: Option<u64>,      // default 30s
    pub require_authorization: bool,  // flow path = false, REST path = true
}

pub enum ToolError {
    InvalidArgs(String),
    Runtime { message: String, transient: bool },
    Timeout { timeout_ms: u64 },
    Unauthorized { required: String, actual: String },
    Unavailable { reason: String },
    Internal(String),
}

/// Type-erased wrapper around `Arc<dyn Tool<Args, Returns>>`.
/// Stored in the registry as `Arc<dyn AnyTool>`.
pub trait AnyTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn version(&self) -> &str;
    fn args_schema(&self) -> &serde_json::Value;
    fn returns_schema(&self) -> &serde_json::Value;
    async fn invoke_value(
        &self,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> Result<serde_json::Value, ToolError>;
}

pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn AnyTool>>>,
    agent_assignments: RwLock<HashMap<String, Vec<String>>>,
    assignments_loaded: OnceCell<()>,    // load from DB on first call
}

impl ToolRegistry {
    pub fn register<T: Tool + 'static>(&self, tool: T);
    pub fn register_arc(&self, tool: Arc<dyn AnyTool>);
    pub async fn get(&self, name: &str) -> Option<Arc<dyn AnyTool>>;
    pub async fn list(&self) -> Vec<ToolDescriptor>;
    pub async fn list_for_agent(&self, agent: &str) -> Vec<ToolDescriptor>;
    pub async fn is_assigned(&self, agent: &str, tool: &str) -> bool;
    pub async fn assign(&self, agent: &str, tools: Vec<String>);
    pub async fn unassign(&self, agent: &str, tool: &str);
    pub async fn invoke_value(
        &self, tool: &str, args: serde_json::Value, ctx: &ToolContext,
    ) -> Result<serde_json::Value, ToolError>;
}
```

**Wrapper**:

```rust
pub struct AnyToolWrapper<T: Tool + 'static> {
    tool: Arc<T>,
}

impl<T: Tool + 'static> AnyTool for AnyToolWrapper<T> {
    fn name(&self) -> &str { self.tool.name() }
    fn description(&self) -> &str { self.tool.description() }
    fn version(&self) -> &str { self.tool.version() }
    fn args_schema(&self) -> &serde_json::Value {
        // Box::leak to get 'static — cheap; cacheable later if profiling shows
        Box::leak(Box::new(self.tool.args_schema()))
    }
    fn returns_schema(&self) -> &serde_json::Value {
        Box::leak(Box::new(self.tool.returns_schema()))
    }
    async fn invoke_value(
        &self, args: serde_json::Value, ctx: &ToolContext,
    ) -> Result<serde_json::Value, ToolError> {
        // Deserialize args via the typed Args; pass to typed invoke.
        let typed_args: T::Args = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        let typed_out = self.tool.invoke(typed_args, ctx).await?;
        serde_json::to_value(typed_out).map_err(|e| ToolError::Internal(e.to_string()))
    }
}
```

## Section 2: NodeKind integration + adapter translations

```rust
// cortex/src/flow/schema/kinds.rs (MODIFIED)

pub enum NodeKind {
    Start(StartParams),
    End(EndParams),
    Answer(AnswerParams),
    Llm(LlmParams),
    Tool(ToolParams),                  // PRIMARY; upgraded to ToolRegistry dispatch
    Code(CodeParams),
    Condition(ConditionParams),
    Loop(LoopParams),
    Parallel(ParallelParams),
    Variable(VariableParams),
    Knowledge(KnowledgeParams),
    HttpRequest(HttpParams),
    Plugin(PluginParams),
    Human(HumanParams),
    SubFlow(SubFlowRef),
    // Legacy — preserved for backward compat; delegate to ToolNodeAdapter
    Mcp(LegacyMcpParams),
    Skill(LegacySkillParams),
    Lobe(LegacyLobeParams),
}

pub struct ToolParams {
    pub tool_name: String,
    pub args_template: String,
    #[serde(default)] pub assign_to: Option<String>,
    #[serde(default)] pub timeout_ms: Option<u64>,
}

pub struct LegacyMcpParams {
    pub server_id: String,
    pub tool_name: String,
    pub args_template: String,
    #[serde(default)] pub timeout_ms: Option<u64>,
}

pub struct LegacySkillParams {
    pub skill_id: String,
    pub args_template: String,
    #[serde(default)] pub timeout_ms: Option<u64>,
    #[serde(default)] pub peer_cortex_id: Option<String>,    // explicit peer; default from registry
}

pub struct LegacyLobeParams {
    pub lobe_id: String,
    pub input_template: String,
    #[serde(default)] pub timeout_ms: Option<u64>,
}
```

**新的 ToolNodeAdapter** + 旧的三个 adapter 全部 delegate 到它：

```rust
// cortex/src/flow/adapter/tool.rs (NEW)

pub struct ToolNodeAdapter {
    registry: Arc<ToolRegistry>,
}

#[async_trait]
impl FlowNodeAdapter for ToolNodeAdapter {
    fn kind(&self) -> &'static str { "tool" }
    async fn execute(&self, node: &Node, ctx: &mut FlowContext) -> Result<(), String> {
        let p = node.kind.as_tool().ok_or("not a tool node")?;
        let agent = p.assign_to.as_deref().unwrap_or(&ctx.flow_owner_agent);
        if !self.registry.is_assigned(agent, &p.tool_name).await {
            return Err(format!("tool '{}' not assigned to agent '{}'", p.tool_name, agent));
        }
        let args_value = render_template(&p.args_template, &ctx.vars)
            .map_err(|e| format!("args template: {e}"))?;
        let timeout = p.timeout_ms.unwrap_or(30_000);
        let tool_ctx = ToolContext {
            requester: format!("flow:{}", ctx.flow_id),
            call_id: Uuid::new_v4(),
            timeout_ms: Some(timeout),
            require_authorization: false,    // flow path doesn't re-check
        };
        let result = self.registry.invoke_value(&p.tool_name, args_value, &tool_ctx).await
            .map_err(|e| format!("tool invoke: {e}"))?;
        ctx.set_var(&node.id, result);
        Ok(())
    }
}

// cortex/src/flow/adapter/mcp.rs (MODIFIED — delegate to ToolNodeAdapter)
pub struct McpNodeAdapter { tool_adapter: ToolNodeAdapter, runtime: Arc<McpRuntime> }

#[async_trait]
impl FlowNodeAdapter for McpNodeAdapter {
    fn kind(&self) -> &'static str { "mcp" }
    async fn execute(&self, node: &Node, ctx: &mut FlowContext) -> Result<(), String> {
        let p = node.kind.as_legacy_mcp().ok_or("not an mcp node")?;
        let synthetic_name = format!("mcp:{}:{}", p.server_id, p.tool_name);
        let synthetic_node = Node {
            kind: NodeKind::Tool(ToolParams {
                tool_name: synthetic_name,
                args_template: p.args_template,
                assign_to: None,
                timeout_ms: p.timeout_ms,
            }),
            ..node.clone()
        };
        self.tool_adapter.execute(&synthetic_node, ctx).await
    }
}

// cortex/src/flow/adapter/skill.rs (MODIFIED — delegate)
pub struct SkillNodeAdapter { tool_adapter: ToolNodeAdapter }

impl SkillNodeAdapter {
    async fn execute(&self, node: &Node, ctx: &mut FlowContext) -> Result<(), String> {
        let p = node.kind.as_legacy_skill().ok_or("not a skill node")?;
        let synthetic_name = match &p.peer_cortex_id {
            Some(peer) => format!("peer:{}:skill:{}", peer, p.skill_id),
            None => format!("skill:{}", p.skill_id),
        };
        // rest same as Mcp adapter
    }
}

// cortex/src/flow/adapter/lobe.rs (MODIFIED — delegate)
pub struct LobeNodeAdapter { ... }    // similar pattern with "lobe:<id>"
```

**Migration safety**: existing flow tests reference `NodeKind::Mcp(...)` etc. — those variants stay, but the adapters delegate. 23 flow unit tests keep passing without modification.

## Section 3: Built-in Tools (Spec #3 migration)

```rust
// cortex/src/tool/builtins/mod.rs (NEW)

pub struct BuiltinTools {
    pub capture_frame: Arc<CaptureFrameTool>,
    pub list_video_sources: Arc<ListVideoSourcesTool>,
}

impl BuiltinTools {
    pub fn register_all(self, registry: &mut ToolRegistry) {
        registry.register_arc(Arc::new(AnyToolWrapper { tool: self.capture_frame }));
        registry.register_arc(Arc::new(AnyToolWrapper { tool: self.list_video_sources }));
    }
}

// cortex/src/tool/builtins/capture_frame.rs (migrated from Spec #3 VisualQATool)
pub struct CaptureFrameTool {
    capabilities: Arc<CapabilityRegistry>,
    video_sources_repo: Arc<VideoSourcesRepo>,
}

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

#[async_trait]
impl Tool for CaptureFrameTool {
    type Args = CaptureFrameArgs;
    type Returns = CaptureFrameReturns;
    fn name(&self) -> &str { "capture_frame" }
    fn description(&self) -> &str {
        "Capture a single frame from the configured video source as JPEG bytes (base64-encoded)."
    }
    async fn invoke(&self, args: CaptureFrameArgs, _ctx: &ToolContext) 
        -> Result<Self::Returns, ToolError> {
        // 1. read source from cortex_video_sources
        // 2. map transport -> capability
        // 3. capability_registry.invoke(capability, args)
        // 4. unpack jpeg_base64 / width / height / captured_at
        todo!()  // implementation: copy from Spec #3 CaptureFrameTool
    }
}

// similar ListVideoSourcesTool — Args = Empty, Returns = { sources, active_id }
```

**Migration adapters for existing concrete implementations**:

```rust
// cortex/src/tool/adaptors/mcp.rs (NEW)
/// Wraps an McpRuntime + (server_id, tool_name) pair as a Tool.
/// `McpRuntime` registers these automatically when an MCP server starts.
pub struct McpBackedTool {
    runtime: Arc<McpRuntime>,
    server_id: String,
    tool_name: String,
}

#[derive(Deserialize, Serialize, JsonSchema)]
pub struct McpInvokeArgs(Value);

#[async_trait]
impl Tool for McpBackedTool {
    type Args = serde_json::Value;   // untyped — MCP tools have dynamic schemas
    type Returns = serde_json::Value;
    fn name(&self) -> &str {
        format!("mcp:{}:{}", self.server_id, self.tool_name).leak()   // 'static str
    }
    // description: cached from initial registration
    async fn invoke(&self, args: Value, ctx: &ToolContext) -> Result<Value, ToolError> {
        self.runtime.invoke(&self.server_id, &self.tool_name, args, ctx.timeout_ms.unwrap_or(30_000)).await
            .map_err(|e| ToolError::Runtime { message: e.to_string(), transient: true })
    }
}

// cortex/src/tool/adaptors/skill.rs (NEW)
pub struct SkillBackedTool {
    client: Arc<CortexA2AClient>,
    skill_id: String,
    peer_cortex_id: Option<String>,
}

// cortex/src/tool/adaptors/lobe.rs (NEW)
pub struct LobeBackedTool {
    client: Arc<LobeClient>,
    lobe_id: String,
}
```

## Section 4: Cross-cortex / peer 工具

```rust
// cortex/src/tool/peer.rs (NEW)

pub struct PeerToolBridge {
    peer_registry: PeerRegistry,         // 复用 Spec #2 同名 registry (broadcast-driven)
    tool_registry: Arc<ToolRegistry>,
    mds: Arc<MdsDiscovery>,
    peer_clients: RwLock<HashMap<String, Arc<CortexA2AClient>>>,
}

impl PeerToolBridge {
    /// Periodically refresh peer tools (every 30s, same cadence as
    /// Spec #2's source broadcast) — that's intentional alignment
    /// so peer discovery stays consistent across surfaces.
    pub async fn refresh_all(&self) {
        for peer in self.peer_registry.reachable_peers() {
            self.refresh_one(peer).await;
        }
    }
    
    async fn refresh_one(&self, peer: PeerEntry) {
        match self.fetch_peer_tools(&peer).await {
            Ok(remote_tools) => {
                self.reconcile(peer.cortex_id.clone(), remote_tools).await;
            }
            Err(_) => {
                // Peer unreachable — mark all peer tools unreachable
                // but don't delete (peer may come back).
            }
        }
    }
    
    async fn fetch_peer_tools(&self, peer: &PeerEntry) -> Result<Vec<ToolDescriptor>> {
        let url = format!("{}/api/cortex/tools", peer.cortex_url);
        let token = peer.admin_token();
        reqwest::Client::new().get(&url)
            .header("X-Cortex-Admin-Token", &token)
            .send().await?
            .error_for_status()?
            .json().await
    }
    
    async fn reconcile(&self, peer_id: String, remote: Vec<ToolDescriptor>) {
        // For each remote tool, register a PeerToolWrapper under
        // "peer:<peer_id>:<tool_name>". Unregister any peer:<peer_id>:*
        // not in remote (peer retired that tool).
    }
}

pub struct PeerToolWrapper {
    peer_cortex_id: String,
    tool_name: String,
    client: Arc<CortexA2AClient>,
    args_schema: serde_json::Value,
    returns_schema: serde_json::Value,
}

#[async_trait]
impl Tool for PeerToolWrapper {
    type Args = serde_json::Value;       // peer-defined; runtime validates
    type Returns = serde_json::Value;
    fn name(&self) -> &str {
        Box::leak(format!("peer:{}:{}", self.peer_cortex_id, self.tool_name).into_boxed_str())
    }
    async fn invoke(&self, args: Value, _ctx: &ToolContext) -> Result<Value, ToolError> {
        self.client.send_task_skill(&self.tool_name, args).await
            .map_err(|e| ToolError::Runtime { message: e.to_string(), transient: true })
    }
}
```

**Peer discovery surface** (read-only):

```
GET <peer_cortex>/api/cortex/tools   Headers: X-Cortex-Admin-Token
→ 200 { tools: [ ToolDescriptor { name, description, args_schema, returns_schema, version, origin } ] }
```

## Section 5: REST surface + agent assignment

```rust
// cortex/src/api/tools.rs (NEW)

#[derive(Serialize)]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub version: String,
    pub args_schema: serde_json::Value,
    pub returns_schema: serde_json::Value,
    pub origin: ToolOrigin,
    pub agent_assignable: bool,         // false for read-only / admin tools
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolOrigin {
    Builtin { builtin_name: String },
    Mcp { server_id: String, tool: String },
    Skill { skill_id: String, peer_cortex_id: Option<String> },
    Lobe { lobe_id: String },
    Peer { peer_cortex_id: String, tool: String },
}

// === Routes ===
//
// Public reads (cached in-memory, no auth required within local cortex network):
GET    /api/cortex/tools                          → [ ToolDescriptor ]
GET    /api/cortex/tools/{name}                   → ToolDescriptor | 404
//
// Admin-only mutations / invocations:
POST   /api/cortex/tools/invoke   Headers: X-Admin-Token (or per-agent token)
       Body: { tool: "capture_frame", args: { source_id: "vsrc_..." }, agent?: String }
       → 200 { result, tool, called_at }
       | 400 { error: { code: "INVALID_ARGS", message } }
       | 401 { error: { code: "UNAUTHORIZED", required, actual } }
       | 503 { error: { code: "UNAVAILABLE", reason } }

// === Agent assignments ===
GET    /api/cortex/agents/{name}/tools             → [ ToolDescriptor ]
POST   /api/cortex/agents/{name}/tools   Headers: X-Admin-Token
       Body: { tools: [ "capture_frame", "mcp:playwright:browser", "skill:visual_qa" ] }
       → 200 { assigned: [...] }                          // idempotent replace
DELETE /api/cortex/agents/{name}/tools/{tool}      Headers: X-Admin-Token
       → 204
POST   /api/cortex/agents/{name}/tools/grant-all   Headers: X-Admin-Token
       → 200 { assigned_count: N }                       // assigns every registerable tool
```

**Wildcard support**: `agent_assignments["*"] = ["capture_frame", ...]` sets the default
for any new agent. Agents with explicit assignments override.

**Persistence**: `cortex_tool_assignments` table — `(agent_name TEXT, tool_name TEXT)`,
primary key `(agent_name, tool_name)`. Loaded at registry init via `OnceCell`.

## Section 6: LLM prompt integration

```rust
// cortex/src/tool/prompt.rs (NEW)
pub struct ToolPromptBuilder {
    registry: Arc<ToolRegistry>,
}

impl ToolPromptBuilder {
    /// Inserted into LLM system prompt. Mirrors deepseek-harness's
    /// systemPrompt.toolOrder: builtin first, then MCP, then skills,
    /// then peer tools, alphabetical within each group.
    pub async fn build_for_agent(&self, agent: &str) -> String {
        let assigned = self.registry.list_for_agent(agent).await;
        if assigned.is_empty() { return String::new(); }
        let mut lines = vec!["# Available tools".to_string()];
        lines.push("You may call any of the following tools by name. Pass arguments per the schema.".to_string());
        lines.push(String::new());
        for tool in assigned {
            lines.push(format!("## `{}` (v{})", tool.name, tool.version));
            lines.push(tool.description.clone());
            lines.push(String::new());
            lines.push("Parameters (JSON Schema 7):".to_string());
            lines.push(format!("```json\n{}\n```",
                serde_json::to_string_pretty(&tool.args_schema).unwrap_or_default()));
            lines.push(String::new());
        }
        lines.join("\n")
    }
}

// Wire into LlmNodeAdapter (existing flow/adapter/llm.rs):
impl LlmNodeAdapter {
    async fn assemble_system_prompt(&self, ctx: &FlowContext) -> String {
        let mut prompt = self.base_prompt.clone();
        let tool_section = self.tool_prompt_builder
            .build_for_agent(&ctx.flow_owner_agent).await;
        if !tool_section.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&tool_section);
        }
        prompt
    }
}
```

**Tool-call parsing** (in `LlmNodeAdapter::execute` after receiving model reply):

```rust
match &reply_message {
    Message { tool_calls: Some(calls), .. } => {
        for call in calls {
            // resolve tool name against ToolRegistry; raise 4xx if not found / unauthorized
            let tool = self.tool_registry.get(&call.name).await.ok_or(...)?;
            // deserialize args against tool.args_schema
            let args: serde_json::Value = call.arguments.clone();
            let result = tool.invoke_value(args, &ctx).await?;
            // append result message to conversation
        }
    }
    _ => { /* normal text reply */ }
}
```

## Section 7: 错误处理 + 测试

| Case | Behavior |
|---|---|
| Tool 不存在 | 404 (REST) / InvalidArgs (flow) |
| Tool 存在但 agent 未分配 (REST) | 401 Unauthorized |
| Args type mismatch | 400 InvalidArgs 含 schemars 校验 message |
| Tool.invoke 返回 Runtime transient=true | 自动 retry 1 次（5s 后）；仍失败 → 透传 |
| Tool.invoke 返回 Runtime transient=false | 透传，立刻 |
| Tool.invoke 超时 | Timeout { timeout_ms } |
| Tool 是 Peer 工具但 peer unreachable | Unavailable "peer X unreachable" |
| Schema 不匹配 Args struct | 400 InvalidArgs |
| Empty args (`Empty {}`) | LLM 看到 `{ "type": "object" }`；invoke 时 `{}` 也接受 |
| Empty returns | 序列化为 `null` 或 `{}` (LLM 看到对应 schema) |
| Flow 的 Tool node 但 args_template 渲染失败 | 节点执行失败，整个 flow 中止（per flow::executor 当前语义） |
| Toolkit 在 flow 执行期间被卸载 | Runtime "tool X no longer registered"；flow 节点标 failed |
| PeerToolWrapper invoke 时 peer 不在 registry | Unavailable "peer X not in discovery" |

**测试**:

```rust
// cortex/src/tool/mod.rs
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn register_and_invoke_roundtrip();
    #[tokio::test]
    async fn invoke_returns_invalid_args_on_wrong_types();
    #[tokio::test]
    async fn invoke_returns_unauthorized_when_agent_not_assigned();
    #[tokio::test]
    async fn empty_args_tool_works_with_no_args();
    #[tokio::test]
    async fn empty_returns_tool_serializes_to_null_or_empty_object();
    #[tokio::test]
    async fn agent_assignment_wildcard_matches_unassigned_agent();

    // MCP migration
    #[tokio::test]
    async fn mcp_node_adapter_delegates_to_tool_registry_with_synthetic_name();
    #[tokio::test]
    async fn skill_node_adapter_delegates_to_a2a_via_tool_wrapper();
    #[tokio::test]
    async fn lobe_node_adapter_delegates_to_lobe_client();

    // Peer
    #[tokio::test]
    async fn peer_tool_refresh_registers_remote_tools();
    #[tokio::test]
    async fn peer_tool_unavailable_returns_unavailable_error();

    // Flow
    #[tokio::test]
    async fn flow_with_tool_node_runs_through_tool_registry();
    #[tokio::test]
    async fn flow_with_legacy_mcp_node_runs_through_tool_registry();

    // Prompt
    #[tokio::test]
    async fn system_prompt_includes_only_assigned_tools();
    #[tokio::test]
    async fn system_prompt_orders_tools_builtin_first();
}
```

```typescript
// shadow-desktop/src/lib/cortexClient.test.ts
test('listTools returns ToolDescriptor[]')
test('invokeTool (capture_frame) posts correct body')
test('assignAgentTools posts to agents/{name}/tools')
```

```typescript
e2e-tests/tools.spec.ts
  - Run flow with Tool node → MCP node → Skill node → end-to-end
  - Agent assignment workflow (grant-all, then revoke one, verify)
```

## Section 8: 数据流 (end-to-end)

```
agent "ibloc-temp" gets assigned: ["capture_frame", "skill:visual_qa"]
  ↓ LlmNodeAdapter
  system prompt = base + "# Available tools\n...capture_frame schema...\n...skill:visual_qa schema..."
  ↓ model reply: { tool_calls: [{ name: "capture_frame", args: { source_id: "vsrc_abc" } }] }
  ↓ LlmNodeAdapter post-processing
  ToolRegistry::invoke_value("capture_frame", { source_id: "vsrc_abc" }, ctx)
    └─ capture_frame tool -> capability_registry -> desktop provider -> JPEG base64
  ↓ ToolRegistry invokes skill:visual_qa (peer cortex B, A2A)
  ↓ result message appended to conversation
  ↓ next LLM turn: model produces final text reply
  ↓ chat reply to user
```

## 与 Spec #1/#2/#3 的依赖

| 字段 / 接口 | 来源 | Spec #4 读取 |
|---|---|---|
| `cortex_video_sources` schema | Spec #1 PUT | Built-in `capture_frame` 工具 |
| `Intent::VisualQA` | Spec #2 | (skill routing 不变；Spec #4 不影响) |
| `VisualQATool` + `CapabilityRegistry` | Spec #3 | migration 到统一 `Tool` trait |
| `embedded neuron` mage_vl | Spec #3 | 不变 |
| A2A skill contract | Spec #2 | SkillBackedTool 调同一个 A2A gateway |

## 范围外（未来 spec）

- **Tool 安全 sandboxing**（Sysbox / gVisor / wasm）
- **Tool 调用 audit + metering**（per-call metrics）
- **Tool version pinning**（agent 指定 tool 版本）
- **Tool marketplace / remote registry**（Spec #4+）
- **Code Mode**（agent 写代码 call tool；deepseek harness 风格）
- **Subagent tool**（`subagent` 调子 agent）

## 风险

1. **187 lib tests + 28 integration tests 影响面**: 23 flow unit tests + 4 webrtc e2e
   可能需要小幅调整；但 McpNodeAdapter / SkillNodeAdapter / LobeNodeAdapter 都
   delegate to ToolNodeAdapter，老 flow schema 不变 → 大概率全绿
2. **schemars dep 是新依赖**: 在 Cargo.toml 添加；纯 codegen，零运行时开销
3. **Box::leak 缓存 schema**: 大量 Box::leak 累积 — 用 `OnceCell` 缓存每个 tool 的 schema 一次
4. **McpBackedTool / SkillBackedTool 用 untyped Value**: 失去类型安全，但 MCP/Skill
   本身就是 dynamic schema；接受 trade-off
5. **PeerTool refresh 30s cadence 与 Spec #2 broadcast 30s 是否冲突**: 不冲突——
   broadcast 推的是 video sources；tool refresh 推 tool descriptors；两者独立
