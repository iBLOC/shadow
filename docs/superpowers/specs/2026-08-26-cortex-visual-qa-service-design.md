# Cortex 视觉问答 Service 设计 (Spec #3)

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: cortex (Layer 3.5) + shadow-desktop + shadow-mobile
**关联 Spec**:
- Spec #1: shadow-desktop 视频源配置 (3a474e2, shipped)
- Spec #2: cortex 视觉问答路由 (ba79ff1, shipped)
- Spec #3（本文件）: visual_qa skill + minimal Tool 抽象
- Spec #4（后续 cycle）: 通用 Tool framework + flow 集成

## 目标

让 cortex 能在收到 peer 设备的 visual_qa A2A 请求后：抓帧（从本地
camera）→ 调 mage_vl 推理 → 返回文本。具体分两件事：
- **Service 端**：cortex 注册 `visual_qa` skill，服务端接收 A2A 请求
- **Provider 抽象**：让 desktop / mobile 各自实现 capture_frame 能力
  并注册到 cortex；cortex 把工具调用路由到合适的 provider

非目标：
- 不实现通用 Tool framework（Spec #4）；本 spec 只为 visual_qa 服务
  提供最小抽象
- 不集成 flow 作为 NodeKind（Spec #4）
- 不重写现有的 Skill / MCP / Agent 注册路径（Spec #4）
- 不做 multi-frame / streaming / 缓存（未来）

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Device A (requesting)                                                    │
│   ── 已有 cortex A 上的 visual_qa_router (Spec #2)                       │
│      POST /a2a/tasks/send { skill_id: "visual_qa", source_id, question }  │
└──────────────────────────────────────────────────────────────────────────┘
                          ↑ A2A
                          │
┌──────────────────────────────────────────────────────────────────────────┐
│ Device B (this device)                                                   │
│                                                                          │
│  cortex B                                                                │
│   ├─ visual_qa skill (new)                                                │
│   │   ├─ Tool 1: capture_frame                                            │
│   │   │   └─ capability "capture_frame_uvc" | "capture_frame_native_camera"│
│   │   ├─ Tool 2: list_video_sources                                        │
│   │   └─ capability "list_local_video_sources" (any provider)              │
│   ├─ visual_qa_lobe (Native lobe; existing occipital slot reused)          │
│   │   ├─ handle(message) → parse visualqa intent →                         │
│   │   │   1) tool.invoke("capture_frame", { source_id })                 │
│   │   │   2) tool result → mage_vl via embedded neure                      │
│   │   │   3) mage_vl reply → CortexStreamEvent::Delta { text }            │
│   │   └─ embedded neure (cortex::neure_embed)                             │
│   ├─ capability_registry (new; visual-qa-scoped)                           │
│   │   ├─ register / heartbeat / invoke                                    │
│   │   └─ stale-aware provider selection                                    │
│   └─ HTTP server (cortex side; existing :60080)                          │
│       ├─ POST /api/cortex/visual-qa/capabilities/register                 │
│       ├─ POST /api/cortex/visual-qa/capabilities/{id}/heartbeat            │
│       ├─ POST /api/cortex/visual-qa/capabilities/invoke                   │
│       ├─ GET  /api/cortex/visual-qa/tools                                  │
│       └─ POST /api/cortex/visual-qa/tools/invoke                          │
└──────────────────────────────────────────────────────────────────────────┘
                  ↑ HTTP (localhost) for capability invocation
                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ device-b-provider (process; desktop Tauri or mobile Flutter)            │
│   ├─ Local capability implementations                                      │
│   │   ├─ desktop:  capture_frame_uvc (WebRTC API)                          │
│   │   │            list_local_video_sources                                │
│   │   └─ mobile:   capture_frame_native_camera                            │
│   │                list_local_video_sources                                │
│   ├─ HTTP server (127.0.0.1:<random>) — cortex invokes via this         │
│   │   POST /api/cortex/capabilities/invoke                                 │
│   └─ Heartbeat loop (30s) → POST /heartbeat to cortex                      │
└──────────────────────────────────────────────────────────────────────────┘
```

## Section 1: 数据模型 + Wire shape

### Capability descriptor

```json
{
  "provider_id": "ibloc-desktop",
  "platform": "linux",
  "host_label": "ibloc-desktop",
  "capabilities": [
    {
      "name": "capture_frame_uvc",
      "description": "Capture a single frame from a UVC webcam via WebRTC.",
      "parameters": {
        "type": "object",
        "properties": { "source_id": { "type": "string" } },
        "required": ["source_id"]
      },
      "returns": {
        "type": "object",
        "properties": {
          "jpeg_base64": { "type": "string", "contentEncoding": "base64" },
          "width":       { "type": "integer" },
          "height":      { "type": "integer" },
          "captured_at": { "type": "string", "format": "date-time" }
        },
        "required": ["jpeg_base64", "width", "height"]
      }
    },
    {
      "name": "list_local_video_sources",
      "description": "Return local zustand view of configured video sources.",
      "parameters": { "type": "object", "properties": {} },
      "returns": { "type": "object", "properties": { "sources": { "type": "array" } } }
    }
  ]
}
```

### Tool registry

`/api/cortex/visual-qa/tools` returns:

```json
{
  "tools": [
    {
      "name": "capture_frame",
      "description": "Capture a single frame from the configured video source as JPEG bytes (base64-encoded).",
      "parameters_schema": { ... },
      "returns_schema": { ... },
      "required_capabilities": ["capture_frame_uvc", "capture_frame_native_camera"]
    },
    {
      "name": "list_video_sources",
      "description": "List video sources configured on this device's cortex.",
      "parameters_schema": { "type": "object", "properties": {} },
      "returns_schema": { ... },
      "required_capabilities": ["list_local_video_sources"]
    }
  ]
}
```

`required_capabilities` lists **any** capability that satisfies the tool —
the runtime picks the first one whose provider is reachable AND whose
arguments validate against the capability's `parameters` schema.

### Tool invocation wire

```
POST /api/cortex/visual-qa/tools/invoke
Headers: X-Admin-Token (or per-agent token in Spec #4)
Body: { tool: "capture_frame", args: { source_id: "vsrc_abc" } }

200 OK
{
  "result": { "jpeg_base64": "...", "width": 1920, "height": 1080, "captured_at": "..." },
  "called_at": "...",
  "provider_id": "ibloc-desktop"
}

4xx { "error": { "code": "INVALID_ARGS" | "NO_PROVIDER" | "TIMEOUT" | "PROVIDER_FAILED", "message": "..." } }
```

## Section 2: Minimal Tool 抽象

只为视觉问答设计；通用 Tool framework 是 Spec #4。

```rust
// cortex/src/visual_qa/tools.rs (NEW module)

#[async_trait]
pub trait VisualQATool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters_schema(&self) -> serde_json::Value;  // JSON Schema 7; {} = no inputs
    fn returns_schema(&self) -> serde_json::Value;
    /// Capabilities whose presence (provider-side) enables this tool.
    /// Empty = tool always available.
    fn required_capabilities(&self) -> Vec<String>;
    async fn invoke(
        &self,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> Result<serde_json::Value, VisualQAToolError>;
}

pub struct ToolContext {
    pub requester: String,           // lobe/agent name for audit
    pub call_id: Uuid,
}

pub enum VisualQAToolError {
    UnknownTool(String),
    InvalidArgs(String),
    NoProvider(String),             // "no reachable provider for capability X"
    ProviderFailed(String, String),  // (provider_id, reason)
    Timeout(u64),                    // timeout_seconds
    Internal(String),
}

pub struct VisualQAToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn VisualQATool>>>,
}
```

**Built-in tools**:

```rust
pub struct CaptureFrameTool {
    capabilities: Arc<CapabilityRegistry>,
    video_sources_repo: Arc<VideoSourcesRepo>,
}

impl VisualQATool for CaptureFrameTool {
    fn name(&self) -> &str { "capture_frame" }
    fn description(&self) -> &str { "Capture a single frame from the configured video source as JPEG bytes (base64-encoded)." }
    fn required_capabilities(&self) -> Vec<String> {
        vec!["capture_frame_uvc".into(), "capture_frame_native_camera".into()]
    }
    
    async fn invoke(&self, args: Value, ctx: &ToolContext) -> Result<Value, VisualQAToolError> {
        let source_id: String = serde_json::from_value(
            args.get("source_id").cloned().ok_or_else(|| "missing source_id".to_string())?
        ).map_err(|e| VisualQAToolError::InvalidArgs(e.to_string()))?;
        
        let source = self.video_sources_repo
            .get(&source_id)
            .await
            .map_err(|e| VisualQAToolError::Internal(e.to_string()))?
            .ok_or_else(|| VisualQAToolError::InvalidArgs(format!("source not found: {source_id}")))?;
        
        let capability = match source.transport.as_str() {
            "browser" => "capture_frame_uvc",
            "tauri-rust" => "capture_frame_native_camera",
            other => return Err(VisualQAToolError::Internal(
                format!("unknown transport: {other}")
            )),
        };
        
        self.capabilities.invoke(capability, json!({ "source_id": source_id }), ctx).await
    }
}

pub struct ListVideoSourcesTool {
    video_sources_repo: Arc<VideoSourcesRepo>,
}

impl VisualQATool for ListVideoSourcesTool {
    fn name(&self) -> &str { "list_video_sources" }
    fn description(&self) -> &str { "List video sources configured on this device's cortex." }
    fn required_capabilities(&self) -> Vec<String> {
        vec!["list_local_video_sources".into()]
    }
    
    async fn invoke(&self, _args: Value, _ctx: &ToolContext) -> Result<Value, VisualQAToolError> {
        let sources = self.video_sources_repo.list().await
            .map_err(|e| VisualQAToolError::Internal(e.to_string()))?;
        let active = sources.iter().find(|s| s.active).map(|s| s.id.clone());
        Ok(json!({
            "sources": sources,
            "active_id": active,
        }))
    }
}
```

## Section 3: Capability registry (Provider-side)

```rust
// cortex/src/visual_qa/capability_registry.rs (NEW)

#[async_trait]
pub trait Capability: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> serde_json::Value;        // JSON Schema 7
    fn returns(&self) -> serde_json::Value;
    async fn invoke(
        &self,
        args: serde_json::Value,
        ctx: &CapabilityContext,
    ) -> Result<serde_json::Value, CapabilityError>;
}

pub struct CapabilityContext {
    pub call_id: Uuid,
    pub provider_id: String,
}

pub struct CapabilityDescriptor {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub returns: serde_json::Value,
}

pub struct ProviderEntry {
    pub provider_id: String,
    pub platform: String,
    pub host_label: String,
    pub callback_url: String,            // e.g. http://127.0.0.1:51234
    pub capabilities: Vec<CapabilityDescriptor>,
    pub last_heartbeat_at: Instant,
    pub reachable: bool,
}

pub struct CapabilityRegistry {
    // capability_name → providers offering it
    by_name: RwLock<HashMap<String, Vec<String /* provider_id */>>>,
    providers: RwLock<HashMap<String /* provider_id */, ProviderEntry>>,
    // Per-provider invoke URL + auth token
    auth_tokens: RwLock<HashMap<String /* provider_id */, String>>,
}
```

**Selection rule** (for capability invocation):
```
Reachable providers that offer this capability AND whose
parameters schema validates the args → pick first (FIFO order
of registration, deterministic).
```

**Stale detection**: scan every 60s; `last_heartbeat_at - now > 60s` → mark
`reachable = false`. Re-mark `reachable = true` on next heartbeat.

## Section 4: Provider 实现 — desktop + mobile

### Desktop Tauri shell

```rust
// shadow-desktop/src-tauri/src/visual_qa_provider.rs (NEW)

#[derive(Serialize)]
struct CapabilityDescriptor {
    name: String,
    description: String,
    parameters: serde_json::Value,
    returns: serde_json::Value,
}

fn build_local_capabilities() -> Vec<CapabilityDescriptor> {
    vec![
        CapabilityDescriptor {
            name: "capture_frame_uvc".into(),
            description: "Capture a single frame from a UVC webcam using the browser WebRTC API (navigator.mediaDevices.getUserMedia + canvas.toDataURL). Returns JPEG bytes as base64.".into(),
            parameters: json!({
                "type": "object",
                "properties": { "source_id": { "type": "string" } },
                "required": ["source_id"]
            }),
            returns: json!({
                "type": "object",
                "properties": {
                    "jpeg_base64": { "type": "string", "contentEncoding": "base64" },
                    "width":       { "type": "integer" },
                    "height":      { "type": "integer" },
                    "captured_at": { "type": "string", "format": "date-time" }
                },
                "required": ["jpeg_base64", "width", "height"]
            }),
        },
        CapabilityDescriptor {
            name: "list_local_video_sources".into(),
            description: "Return the local zustand view of configured video sources (read-only mirror of cortex_video_sources).".into(),
            parameters: json!({ "type": "object", "properties": {} }),
            returns: json!({
                "type": "object",
                "properties": {
                    "sources": { "type": "array", "items": { "type": "object" } },
                    "active_id": { "type": ["string", "null"] }
                }
            }),
        },
    ]
}

#[tauri::command]
async fn vqa_provider_register(app: AppHandle, cortex_url: String) -> Result<(), String> {
    let provider_id = hostname::gethostname().to_string_lossy().to_string();
    let token = std::env::var("CORTEX_PROVIDER_TOKEN")
        .map_err(|_| "missing CORTEX_PROVIDER_TOKEN env var")?;
    
    let reg = json!({
        "provider_id": provider_id,
        "platform": std::env::consts::OS,
        "host_label": provider_id,
        "capabilities": build_local_capabilities(),
    });
    
    reqwest::Client::new()
        .post(format!("{cortex_url}/api/cortex/visual-qa/capabilities/register"))
        .header("X-Provider-Token", &token)
        .json(&reg)
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    
    start_heartbeat(app.clone(), cortex_url.clone(), provider_id.clone(), token.clone());
    start_invoke_server(app.clone()).await?;
    Ok(())
}

async fn handle_invoke(call: ProviderInvoke) -> Result<serde_json::Value, String> {
    match call.capability.as_str() {
        "capture_frame_uvc" => {
            let source_id: String = serde_json::from_value(call.args["source_id"].clone())
                .map_err(|e| format!("INVALID_ARGS: {e}"))?;
            // 1. frontend IPC: ask webview to grab frame via WebRTC + canvas
            //    and return { jpeg_base64, width, height }
            // 2. (or read from a local cache if webview already grabbed one)
            Ok(json!({
                "jpeg_base64": "...", "width": 1920, "height": 1080,
                "captured_at": chrono::Utc::now().to_rfc3339()
            }))
        }
        "list_local_video_sources" => {
            Ok(json!({
                "sources": get_local_sources_snapshot(),
                "active_id": get_local_active_id(),
            }))
        }
        _ => Err(format!("UNKNOWN_CAPABILITY: {}", call.capability)),
    }
}

async fn start_heartbeat(app: AppHandle, cortex_url: String, provider_id: String, token: String) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        let _ = client.post(format!(
            "{cortex_url}/api/cortex/visual-qa/capabilities/{provider_id}/heartbeat"
        ))
        .header("X-Provider-Token", &token)
        .send().await;
    }
}
```

**桌面端抓帧 (关键的 WebRTC 细节)**: Webview 调用
`navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact } } })`
短暂打开 stream → draw 到 `<canvas>` → `canvas.toDataURL("image/jpeg",
0.85)` → 立即 stop tracks。需要 webview 端的 Tauri command wrapper
把 source_id 转换成 deviceId 并启动上述流程。

### Mobile Flutter shell

```dart
// shadow-mobile/lib/services/cortex/visual_qa_provider.dart (NEW)

class MobileVisualQAProvider {
  Future<void> registerOnBoot(String cortexUrl) async {
    final providerId = await DeviceInfo.hostname;
    final reg = {
      'provider_id': providerId,
      'platform': Platform.operatingSystem,    // "android" / "ios"
      'host_label': await DeviceInfo.deviceName,
      'capabilities': [
        {
          'name': 'capture_frame_native_camera',
          'description': 'Capture a frame from the device native camera (Android Camera2 / iOS AVFoundation)',
          'parameters': { 'source_id': 'string' },
          'returns': { 'jpeg_base64': 'string', 'width': 'int', 'height': 'int', 'captured_at': 'string' },
        },
        {
          'name': 'list_local_video_sources',
          'description': 'Return sources registered via Android Camera2 / iOS AVFoundation',
          'parameters': {},
          'returns': { 'sources': 'array', 'active_id': 'string?' },
        },
      ],
    };
    await http.post('$cortexUrl/api/cortex/visual-qa/capabilities/register',
      headers: { 'X-Provider-Token': providerToken },
      body: json.encode(reg));
    startHeartbeat();
    startLocalInvokeServer();    // ServerSocket on localhost
  }
  
  Future<Map> invoke(String capability, Map args) async {
    // Platform channel → Kotlin (Android Camera2 ImageReader)
    //                       → Swift   (AVCaptureSession + AVCapturePhotoOutput)
    // returns { jpeg_base64, width, height, captured_at }
  }
}
```

## Section 5: visual_qa lobe + skill 注册

```rust
// cortex/src/lobes/visual_qa.rs (NEW)

pub struct VisualQALobe {
    tools: Arc<VisualQAToolRegistry>,
    neure: Arc<neure_embed::EmbeddedNeure>,
}

#[async_trait]
impl NativeLobe for VisualQALobe {
    fn name(&self) -> &str { "occipital" }   // existing occipital slot reused
    
    async fn handle(
        &self,
        message: Message,
        _openai_base_url: &str,
        _trace: Option<Arc<TraceBroadcaster>>,
        _lobe_config: Option<&Value>,
    ) -> Result<Vec<CortexStreamEvent>, String> {
        let intent = parse_visualqa_intent(&message)?;
        
        // Step 1: capture frame via tool
        let frame = self.tools.invoke(
            "capture_frame",
            json!({ "source_id": intent.source_id }),
            &ToolContext::for_lobe("occipital"),
        ).await.map_err(|e| format!("capture_frame failed: {e}"))?;
        let jpeg_base64 = frame["jpeg_base64"].as_str().ok_or("missing jpeg_base64")?;
        
        // Step 2: call mage_vl via embedded neure
        let max_tokens = intent.max_tokens.unwrap_or(256);
        let reply = self.neure.chat_completions(json!({
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
        
        // Step 3: stream back
        Ok(vec![CortexStreamEvent::Delta { text }])
    }
    
    fn manifest(&self) -> LobeManifest {
        LobeManifest {
            name: "occipital".into(),
            description: "Visual Q&A — captures a frame from the configured video source and runs mage-vl on it.".into(),
            skills: vec!["visual_qa".into()],
        }
    }
}

fn parse_visualqa_intent(message: &Message) -> Result<VisualQaIntent, String> {
    // Read message.metadata or message.parts[0].text for JSON-encoded intent:
    //   { "question": "...", "source_id": "...", "max_tokens": 256 }
    // (Per Spec #2 wire: A2A input is { question, source_id, max_tokens })
}
```

**skill_router 注册**: 加一条 `skill_id="visual_qa" → LobeClient::Native(VisualQALobe)`。

**embedded neure 启动**: cortex 启动时 init `EmbeddedNeure::new(NeureEmbedConfig {
llm_runtime: "mage_vl",
shard_dir: env("NEURE_MAGE_VL_SHARD_DIR"),
device: "cpu",
dtype: "f32",
})`。~18GB F32 内存（per Spec #1 经验）。启动延迟 30-40s。

## Section 6: 错误处理 + 测试

| Case | Behavior |
|---|---|
| 所有 provider 都 unreachable | `VisualQAToolError::NoProvider` → CortexStreamEvent::Error "无相机 provider 可用" |
| capture_frame tool 收到 source_id 不存在 | `InvalidArgs("source not found")` → Error "source not found: <id>" |
| Provider invoke 超时 (5s default, env 覆盖) | `Timeout` → Error "抓帧超时 (5s)" |
| Provider invoke 4xx/5xx | 透传 error code；chat reply 含 provider message |
| mage_vl 启动失败 (shards missing) | cortex 启动 panic with clear message；启动日志含 shard path |
| mage_vl 推理失败 | VisualQALobe 返回 Error → chat reply "推理失败: <原因>" |
| Provider token 不匹配 | 401；provider 端日志 warn |
| 同台 desktop 上 2 个 cortex | 第二 cortex 也注册 capabilities；round-robin 调用 (FIFO for now) |
| Mobile 还无 active source 但注册了 capability | capability 仍 register；capture_frame 调用 → source_id 不在 → InvalidArgs |
| 心跳超时但 task in-flight | 允许完成；下次 invoke 时该 provider 跳过 |
| 不支持的 source.transport | `Internal("unknown transport")` → Error |

**测试**:

```rust
// cortex/src/visual_qa/tools.rs
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn capture_frame_tool_looks_up_source_then_dispatches_to_capability();

    #[tokio::test]
    async fn capture_frame_tool_returns_invalid_args_on_missing_source_id();

    #[tokio::test]
    async fn capture_frame_tool_returns_no_provider_when_all_unreachable();

    #[tokio::test]
    async fn capture_frame_tool_returns_timeout_error_on_slow_provider();

    #[tokio::test]
    async fn capture_frame_tool_prefers_browser_capability_for_browser_transport();

    #[tokio::test]
    async fn list_video_sources_tool_returns_empty_when_no_sources_configured();

    // capability_registry
    #[tokio::test]
    async fn capability_register_stores_provider_and_lists_capabilities();

    #[tokio::test]
    async fn capability_invoke_returns_provider_id_and_result();

    #[tokio::test]
    async fn capability_invoke_skips_unreachable_providers();

    #[tokio::test]
    async fn heartbeat_marks_provider_unreachable_after_60s();

    #[tokio::test]
    async fn delete_capability_provider_unregisters_immediately();

    // visual_qa lobe (gated on mage_vl shards)
    #[tokio::test]
    #[ignore = "requires mage_vl shards (~9GB) and embedded neure boot (~30s)"]
    async fn visual_qa_lobe_full_flow_capture_then_mage_vl();
}
```

```typescript
// shadow-desktop/src-tauri/src/visual_qa_provider.test.ts (vitest, mocked reqwest)
test('registers on boot with all capabilities')
test('heartbeat fires every 30s')
test('handle_invoke_capture_frame_uvc_returns_jpeg_shape')
test('handle_invoke_unknown_capability_returns_404')
```

```dart
// shadow-mobile/test/visual_qa_provider_test.dart
testWidgets('registers on boot', (tester) async { ... });
testWidgets('handle_invoke_capture_frame_native_camera_returns_jpeg', (tester) async { ... });
```

```typescript
// Cross-platform integration
e2e-tests/visual-qa-provider.spec.ts
  // 1 cortex + 1 shadow-desktop Tauri + 1 mage_vl shard dir
  // registered → capability → visual_qa skill end-to-end
```

## 与 Spec #1 / Spec #2 的依赖

| 字段 / 接口 | 来源 | Spec #3 读取 |
|---|---|---|
| `cortex_video_sources.active` | Spec #1 PUT | spec#3 的 `capture_frame` 工具通过 `source_id` 查找并决定 capability 名 |
| `cortex_video_sources.transport` | Spec #1 PUT | 决定用 `capture_frame_uvc` 或 `capture_frame_native_camera` |
| A2A `visual_qa` skill wire | Spec #2 锁定 | Spec #3 服务端实现该契约 |
| `Intent::VisualQA` source_hint | Spec #2 | spec#3 通过 source_hint 取 source_id |
| embedded neure mage_vl runtime | Spec #1 验证可用 | Spec #3 cortex 端也用相同的 `cortex::neure_embed` |
| Mage-VL HTTP `/v1/chat/completions` with image_url | Spec #1 验证 | Spec #3 cortex → embedded neure 同接口 |

## 范围外但保留扩展点（→ Spec #4）

- **通用 Tool framework**：把 `VisualQATool` + `VisualQAToolRegistry` 泛化为
  `Tool` + `ToolRegistry`，路由层支持多类 agent / lobe 的工具分配
- **flow integration**：把 tool 作为 `cortex::flow::schema` 的新 NodeKind，
  在思维定式中作为节点使用
- **Type-safe args**：当前 serde_json::Value；未来 derive
  `Deserialize`/`Serialize` per-tool 提供强类型
- **Per-agent tool assignments**：REST `GET/POST/DELETE
  /api/cortex/agents/{name}/tools` (Spec #2 提到)
- **Skill/MCP tool 适配**：现有 Skill / MCP NodeKind 也通过同一 ToolRegistry
  调用 (Spec #4 整合)

## 数据流示例 (end-to-end)

```
user: "帮我看看这是什么"
  ↓ desktop (SettingsPage → /v1/chat/completions msg)
  ↓ cortex A prefrontal
  ↓ cortex A Intent::VisualQA { question, source_hint: None }
  ↓ cortex A visual_qa_router
       ├─ candidates: [local "ibloc-desktop active Logitech BRIO", peer "ibloc-mbp active MacBook Cam"]
       ├─ 2 → no hint → ClarifyRequest { candidates: [...] }
       ↓ chat reply: "你有摄像头在多台设备上。要用哪台？" + chip metadata
  ↓ user clicks "ibloc-desktop"
  ↓ re-send msg with source_hint="ibloc-desktop"
  ↓ cortex A Intent::VisualQA { source_hint: "ibloc-desktop" }
  ↓ cortex A picks local (matches hint)
  ↓ CortexA2AClient.send_task → cortex B /a2a/tasks/send
       { skill_id: "visual_qa", input: { question, source_id: "vsrc_abc", max_tokens: 256 } }
  ↓ cortex B skill_router → LobeClient::Native(VisualQALobe)
  ↓ VisualQALobe::handle
       ├─ tools.invoke("capture_frame", { source_id: "vsrc_abc" })
       │    ├─ video_sources_repo.get("vsrc_abc") → transport="browser"
       │    ├─ capability = "capture_frame_uvc"
       │    ├─ capability_registry.invoke("capture_frame_uvc", ...)
       │    │    ├─ pick reachable provider with "capture_frame_uvc"  → local device
       │    │    └─ HTTP POST localhost:<port>/api/cortex/capabilities/invoke
       │    │         └─ device-b-provider: WebRTC grab frame → JPEG base64
       │    └─ { jpeg_base64, width: 1920, height: 1080, captured_at }
       ├─ embedded neure /v1/chat/completions
       │    { model: "microsoft/Mage-VL", messages: [{role:user, content:[text, image_url]}] }
       └─ reply text "A red square" → CortexStreamEvent::Delta
  ↓ cortex A receives A2A result text
  ↓ cortex A packages into chat reply
  ↓ desktop displays "A red square"
```
