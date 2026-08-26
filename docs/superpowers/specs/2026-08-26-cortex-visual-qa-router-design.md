# Cortex 视觉问答路由设计 (Spec #2)

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: cortex (Layer 3.5 — Agent Orchestrator)
**关联 Spec**:
- Spec #1: shadow-desktop 视频源配置 (3a474e2, shipped)
- Spec #2（本文件）: cortex 路由 + A2A 调度
- Spec #3（后续 cycle）: peer 枕叶 A2A skill + mage_vl 帧摄取

## 目标

让 cortex 在收到「简单视觉问答」类聊天消息时，自动调度到对端设备的
枕叶 (occipital lobe) 执行 mage_vl 推理；多端有摄像头时通过预发问 chat
询问澄清；与现有 task-system 路由共存。

非目标：
- 不实现枕叶 A2A skill 的服务端（Spec #3）
- 不实现 mage_vl 帧摄取（Spec #3）
- 不重写现有 Intent 分类（只在 `analyze_intent` 加一个 variant）
- 不影响 prefrontal / OpenAI /v1/* / WebRTC 现有路径

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Device A (requesting)                                                    │
│                                                                          │
│  POST /v1/chat/completions                                               │
│       ↓                                                                  │
│  cortex A prefrontal (现有 path)                                          │
│       ↓ 触发 visual_qa_router (新增)                                     │
│  visual_qa_router::classify_and_route(msg)                                │
│       ├─ 1) 调 analyze_intent (新增 Intent::VisualQA 分支)                │
│       ├─ 2) 若 Intent::VisualQA → 进入 source selection                  │
│       │     ├─ candidate = 本机 active + peer registry 里 active 的      │
│       │     ├─ 0 个 → 报错                                                │
│       │     ├─ 1 个 → 直接路由                                           │
│       │     └─ N 个 → 走预发问 chat 询问 (返回 ClarifyRequest)          │
│       ├─ 3) CortexA2AClient::send_task → 对端 occipital skill            │
│       ├─ 4) A2A 响应文本                                                │
│       └─ 5) prefrontal 拼成 reply                                         │
│                                                                          │
│  peer_sources_registry (in-memory, 来自 broadcasts)                      │
│       ↑                                                                   │
│  broadcast_loop (tokio task)                                             │
│       每 30s heartbeat + 立即 push (PUT video-sources 时触发)            │
└──────────────────────────────────────────────────────────────────────────┘
                  ↑ A2A POST /a2a/tasks/send
                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ Device B (peer)                                                          │
│                                                                          │
│  cortex B /api/cortex/visual-qa/sources-broadcast (Spec #2 receiver)       │
│  cortex B /a2a/tasks/send (现有 gateway; Spec #3 在 occipital lobe 加 skill)│
└──────────────────────────────────────────────────────────────────────────┘
```

## Section 1: Intent 扩展 + classify pipeline

```rust
// cortex/src/lobes/intent.rs 新增
pub enum Intent {
    Chat,                                  // 现有
    TaskCreate(TaskRequest),                // 现有
    TaskConfirm(TaskConfirmation),          // 现有
    TaskQuery(String),                      // 现有
    TaskUpdate(TaskUpdate),                 // 现有
    MemoryQuery(String),                    // 现有
    AgentQuery(String),                     // 现有
    VisualQA {                              // 新增
        question: String,
        source_hint: Option<String>,        // 用户在 message 里点名的 device/label
    },
}

pub fn analyze_intent(text: &str, conversation_context: &str) -> Intent {
    // 现有 fast-path 完全不变
    // 新增分支:
    //   if visual_qa_keyword_match(text):
    //     return Intent::VisualQA { question: text.to_string(), source_hint: None }
    // 新增 fallback: 如果 OPENAI_INTENT_MODEL 设置且没匹配 fast-path,
    //   调 openai 二次判定; 命中 visualqa → Intent::VisualQA; 否则原分支
}
```

**Keyword fast-path** (中英文):
- 中文: "看", "看看", "这是什么", "看一眼", "识别一下", "是否"
- 英文: "show me", "what is this", "look at", "see", "identify"

**LLM 二次判定**: 仅当用户启用 `OPENAI_INTENT_MODEL` 且 fast-path 未命中。
沿用 `OPENAI_API_KEY` + `OPENAI_API_BASE`（per cortex AGENTS.md 已支持）。
prompt:

```
You are an intent classifier. Decide whether the user's message
requires a visual question answering capability (i.e. the user
wants to know what's in front of a camera they have access to).

Reply with exactly one of:
- "visual_qa" — user wants to see/identify something via their camera
- "other" — any other intent (chat, task, memory, etc.)
```

**Pipeline** (per chat msg):

```
POST /v1/chat/completions msg
  ↓
1) analyze_intent (regex fast-path)
   - 命中 visual_qa → Intent::VisualQA
   - 命中 老 path → return 老 Intent (TaskCreate / Chat / 等)
   - 不命中 → step 2
  ↓
2) if OPENAI_INTENT_MODEL set:
     LLM 二次判定 → visual_qa / other
     - visual_qa → Intent::VisualQA
     - other → Intent::Chat (fallback)
   else: Intent::Chat (fallback)
  ↓
3) Route by Intent variant:
   - VisualQA → visual_qa_router::route
   - 其他 → 现有 path (prefrontal task handler / 直接 chat)
```

## Section 2: source selection + 预发问逻辑

```rust
// cortex/src/visual_qa/router.rs (新增)
pub async fn route_visualqa(
    intent: Intent::VisualQA,
    state: &AppState,
) -> Result<Either<String, ClarifyRequest>, RouterError> {
    // Step A: 收集候选
    let local = state.video_sources_repo.active()?;  // Option<VideoSource>
    let peers = state.peer_sources_registry.active_entries();  // Vec<PeerSourceEntry>
    
    let candidates: Vec<VideoSourceCandidate> = local
        .into_iter()
        .map(|s| s.into_local())
        .chain(peers.into_iter().map(|p| p.into_remote()))
        .collect();
    
    // Step B: 仲裁
    match candidates.len() {
        0 => Err(RouterError::NoSourceConfigured),
        1 => Ok(Either::Left(/* A2A 调这一个 */)),
        n if n > 1 => {
            if let Some(hint) = intent.source_hint {
                if let Some(c) = candidates.iter().find(|c| c.matches(&hint)) {
                    Ok(Either::Left(/* 调匹配的那个 */))
                } else {
                    Err(RouterError::HintNoMatch(hint, candidates))
                }
            } else {
                Ok(Either::Right(ClarifyRequest { candidates }))
            }
        }
        _ => unreachable!(),
    }
}

pub struct ClarifyRequest {
    pub candidates: Vec<VideoSourceCandidate>,
}

pub enum RouterError {
    NoSourceConfigured,
    HintNoMatch(String, Vec<VideoSourceCandidate>),  // 返回 candidates 让 UI 重选
    PeerUnreachable(String),
    A2AFailed(String),
    NoAnswerText,
}
```

**预发问 wire shape** (cortex A → prefrontal → /v1/chat/completions → desktop):

```json
{
  "id": "msg_...",
  "object": "chat.completion",
  "created": 1693000000,
  "model": "ibloc-cortex",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你有摄像头在多台设备上。要用哪台？",
      "metadata": {
        "shadow.clarification": {
          "kind": "visual_qa_source_selection",
          "candidates": [
            { "deviceId": "vsrc_abc", "deviceLabel": "Logitech BRIO", "hostLabel": "ibloc-desktop (this device)" },
            { "deviceId": "vsrc_def", "deviceLabel": "MacBook Camera", "hostLabel": "ibloc-mbp" }
          ]
        }
      }
    },
    "finish_reason": "stop"
  }],
  "usage": { ... }
}
```

Desktop side (per AGENTS.md `metadata.shadow.*` convention):
- `cortexClient.ts` 解析 `metadata.shadow.clarification` → 渲染 device chip picker
- 用户点击 chip → 重发原 question + `source_hint=hostLabel`
- cortex 重新走 classifier，命中后 hint 匹配，走 A2A

## Section 3: A2A 调用契约

**调用方视角 (cortex A 调 cortex B)**:

```json
POST cortex B /a2a/tasks/send
{
  "jsonrpc": "2.0",
  "id": "req_<ulid>",
  "method": "tasks/send",
  "params": {
    "task": {
      "id": "vqa_<ulid>",
      "skill_id": "visual_qa",
      "input": {
        "question": "<user question text>",
        "source_id": "<cortex_video_sources.id on peer B>",
        "max_tokens": 256
      }
    }
  }
}
```

**响应 (Spec #3 服务端实现)**:

```json
HTTP 200
{
  "jsonrpc": "2.0",
  "id": "req_<ulid>",
  "result": {
    "task": {
      "id": "vqa_<ulid>",
      "status": {
        "state": "completed",
        "message": "<mage_vl answer text>",
        "timestamp": "2026-08-26T11:23:14Z"
      }
    }
  }
}
```

**失败**:

```json
{
  "jsonrpc": "2.0",
  "id": "req_<ulid>",
  "result": {
    "task": {
      "id": "vqa_<ulid>",
      "status": {
        "state": "failed",
        "message": "<error description>"
      }
    }
  }
}
```

**实现**:
- cortex A 通过现有 `CortexA2AClient::send_task` 发请求
- peer cortex B 的 `skill_router` 按 `skill_id = "visual_qa"` 路由到 occipital lobe（Spec #3 实现 service 端）
- skill_id 路由先于现有 name-based skill 路由；当前 `NativeLobeRegistry` 里没有名为 "visual_qa" 的 lobe，Spec #3 添加
- timeout 默认 10s；超时视为失败
- 文本提取从 `result.task.status.message` 读；空字符串视为失败

## Section 4: peer sources registry + broadcast loop

```rust
// cortex/src/visual_qa/peer_registry.rs (新增)
pub struct ActiveSourceSummary {
    pub device_id: String,        // cortex_video_sources.device_id
    pub source_id: String,        // cortex_video_sources.id
    pub label: String,
    pub capabilities: SourceCapabilities,
}

pub struct PeerSourceEntry {
    pub peer_cortex_id: String,
    pub host_label: String,
    pub active_source: Option<ActiveSourceSummary>,
    pub last_heartbeat_at: Instant,
    pub reachable: bool,
}

pub struct PeerSourceRegistry {
    pub(crate) entries: RwLock<HashMap<String /* peer_cortex_id */, PeerSourceEntry>>,
}

impl PeerSourceRegistry {
    pub fn upsert(&self, entry: PeerSourceEntry);
    pub fn active_entries(&self) -> Vec<PeerSourceEntry>;  // reachable AND active_source.is_some()
    pub fn mark_stale(&self, peer_id: &str);  // heartbeat 超时时调
    pub fn evict(&self, peer_id: &str);
}
```

**Broadcast protocol**:

```
HTTP POST cortex-peer /api/cortex/visual-qa/sources-broadcast
Headers: X-Admin-Token: <peer admin key>

Body:
{
  "from_cortex_id": "cortex_<this>",
  "host_label": "ibloc-desktop",
  "active_source": {
    "device_id": "<cortex_video_sources.device_id>",
    "source_id": "<cortex_video_sources.id>",
    "label": "Logitech BRIO",
    "capabilities": { ... }
  } | null,
  "sent_at": "2026-08-26T11:23:14Z"
}

Returns: 204 No Content
Auth: 复用 X-Admin-Token (现有 convention)
```

**Push triggers** (broadcast_loop):
1. **30s 心跳** — 低流量；保证 stale detection 收敛
2. **立即 push** — 当 `PUT /api/cortex/video-sources` success 时
3. **立即 push (boot)** — cortex 启动后 1s 内 push 一次（让 peers 知道新节点）
4. **接收时立即转发** — peer push 给我后我也 push 给所有其他 peers（gossip）

**Stale detection** (扫描器 tokio task):
- 每 60s 跑一次
- 对每个 entry：若 `now - last_heartbeat_at > 60s` → 标记 `reachable=false`, `active_source=None`
- 不删除（peer 可能恢复）
- 恢复条件：收到下一次 push → 重新 reachable

**Peer discovery**:
- 复用现有 `mds_discovery` 找到的 peer cortex 列表
- 在 `AppState` 注入到 `PeerSourceRegistry`，新 peer 上线时 broadcast_loop 自动 push

## 错误处理 & 边界情况

| Case | Behavior |
|---|---|
| 所有 cortex 都没 active source | chat reply: "我这边没看到任何已配置的摄像头，请先在 Settings → Video Sources 配置一台" |
| 用户在 hint 中指定 peer 但 peer unreachable | chat reply: "选定的设备 N 秒没回应，请选另一台或重试"，附可用的本地候选（如果有） |
| peer broadcast 有 active 但 A2A 调不通 | 视为失败；chat reply: "选定的设备无响应"，附 fallback 候选 |
| 预发问 candidates ≥ 6 个 | 只显示前 6 个 + "..." 截断 + 提供 "show all" 链接 |
| A2A timeout (10s default，可 env 覆盖) | 视为失败；chat reply: "对方设备 N 秒无响应" |
| Intent 二次判定 (LLM) 失败 / 502 / 503 | fallthrough 到 Intent::Chat；UI 不感知 |
| OpenZiti 未就绪 | 走现有 HTTP mesh（无 mTLS），与 `cortex-to-cortex` 一致；Spec #2 不阻塞等 OpenZiti |
| 老 Intent (Chat / TaskCreate / ...) 完全不变 | 既有 187 lib + 4 e2e + 28 integration 测试不受影响 |
| source_hint 文本与多个 candidate 都模糊匹配 | 视作无匹配；要求用户重发 |
| cortex B 重启过程中收到 broadcast | 返回 503；cortex A 重试 3 次后放弃该 peer 30s |
| 同台 desktop 上 2 个 cortex 实例（罕见但可能） | 按 cortex_id 区分；broadcast 用 from_cortex_id 防环 |
| cortex A 的 broadcast 推给 cortex B 时携带 token | 复用本 cortex 的 admin token（per existing convention） |

## 测试

```rust
// cortex/src/visual_qa/router.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn visualqa_keyword_match_chinese_and_english() {
        // "看看前面有什么" → Intent::VisualQA
        // "show me what's there" → Intent::VisualQA
        // "你好" → not VisualQA
    }

    #[tokio::test]
    async fn visualqa_falls_through_to_chat_when_intent_classifier_fails() {
        // OPENAI_INTENT_MODEL set but returns 500
        // → Intent::Chat, no visual_qa path triggered
    }

    #[tokio::test]
    async fn source_selection_single_local_picks_local() {
        // 1 local active, 0 peers → route local
    }

    #[tokio::test]
    async fn source_selection_zero_candidates_returns_no_source_error() {
        // 0 local + 0 peer active → RouterError::NoSourceConfigured
    }

    #[tokio::test]
    async fn source_selection_two_candidates_no_hint_returns_clarify() {
        // 1 local + 1 peer, no hint → ClarifyRequest { candidates: [...] }
    }

    #[tokio::test]
    async fn source_selection_hint_matches_when_present() {
        // 2 candidates, hint="ibloc-mbp" → route peer (match)
        // hint="nonexistent" → RouterError::HintNoMatch
    }

    #[tokio::test]
    async fn clarify_metadata_serializes_correctly() {
        // ClarifyRequest → JSON wire shape matches spec
    }

    #[tokio::test]
    async fn a2a_call_invokes_peer_with_skill_id_visual_qa() {
        // mock CortexA2AClient; assert request body has skill_id="visual_qa"
        // and input.source_id matches peer registry entry
    }

    #[tokio::test]
    async fn a2a_call_timeout_returns_peer_unreachable_error() {
        // mock 10s timeout; assert RouterError::PeerUnreachable
    }

    #[tokio::test]
    async fn peer_registry_upserts_new_entry_on_push() {
        // POST sources-broadcast → registry has new entry
    }

    #[tokio::test]
    async fn peer_registry_marks_stale_after_60s_no_heartbeat() {
        // insert entry, advance clock 61s, run stale scanner, assert reachable=false
    }

    #[tokio::test]
    async fn broadcast_loop_fires_immediately_after_video_sources_put() {
        // PUT video-sources → mock peer server receives broadcast within 1s
    }

    #[tokio::test]
    async fn broadcast_loop_heartbeat_every_30s() {
        // tokio::time::pause + advance 30s; assert peer receives broadcast
    }

    #[tokio::test]
    async fn broadcast_loop_gossips_received_pushes_to_other_peers() {
        // cortex A receives push from B → A pushes to C (3-peer mesh)
    }

    #[tokio::test]
    async fn e2e_two_cortex_instances_visual_qa_round_trip() {
        // integration: 2 cortex in 2 procs + mage_vl shards (mock if missing)
        // POST /v1/chat/completions with "看看" → A2A → peer occipital → reply
    }
}
```

```typescript
// shadow-desktop/src/lib/cortexClient.test.ts
test('parses clarification metadata as device chips')
test('re-sends question with source_hint after user picks a chip')
```

```typescript
// shadow-desktop/e2e-tests/visual-qa.spec.ts
test('single local source routes directly', async ({ page }) => {
  // grant camera, configure 1 local source, post "看看", expect reply
});
test('two sources triggers clarification chips', async ({ page }) => {
  // configure local + mock peer broadcast, post "看看", expect chips
});
```

## 范围外但保留扩展点

- **TURN / OpenZiti**：当前 HTTP mesh 即可；OpenZiti 落地后只需替换 transport
- **多模态 intent** (audio / video clip)：未来 Intent 变体可加，本 spec 不动
- **枕叶 multi-image / streaming**：当前 1 question = 1 frame；后续可加 multi-frame
- **peers 之间的 video relay**（peer A 调 peer B 的视频 → 推到 peer C）：超出本 spec，假定 peer 互相直连
- **OpenAI function-calling style visual_qa skill**：本 spec 走 A2A skill_id 路由；若未来 prefrontal 支持 function-calling，可双协议

## 数据 / 接口 与 Spec #1 的依赖

| 字段 | Spec #1 写入 | Spec #2 读取 |
|---|---|---|
| `cortex_video_sources.active` | PUT | read for local candidate |
| `cortex_video_sources.sources[]` | PUT | read for label/deviceId 展示 |
| `cortex_video_sources.id` (source_id) | PUT | send in A2A input.source_id |
| Optional `device.platform/hostname` block | Spec #1 wire shape | Spec #2 broadcasts in `host_label` |

Spec #1 的 wire shape 已预留 `device` 块供 Spec #2 引用；如果 Spec #1
落地前字段命名变化，Spec #2 broadcast 也要同步调整。

## 关联 Spec 占位

- **Spec #3 (peer 枕叶 A2A skill + mage_vl 帧摄取)**：服务端的 `visual_qa`
  skill 必须按 Spec #2 第 3 节的调用契约实现；wire shape 锁定后两端可
  并行。
