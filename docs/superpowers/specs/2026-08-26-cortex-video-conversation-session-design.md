# Spec #6: 持续视频对话会话 (Continuous Video Conversation) 设计

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: cortex (Layer 3.5) + shadow-desktop
**关联 Spec**:
- Spec #1-#5: 之前已 commit（visual_qa 单帧路由 + tool 框架）
- Spec #6（本文件）: 持续视频会话 + 上下文累积
- 配套: `docs/superpowers/scenarios/visual-qa-scenarios.md`（场景测试文档）

## 目标

让用户开启"视频对话模式"后，cortex 通知颞叶 + 枕叶**持续启动**：
- 枕叶**持续抓帧**（默认 0.5 fps，2s 窗口）→ mage_vl 推理 → 写描述到上下文缓存
- 颞叶**每次回答**用户 chat 时，注入最近 N 条 description 到 system prompt
- 用户能"暂停 / 继续 / 结束"会话
- 一个 device 同时只允许 1 路 video session（per-agent 单例；MVP 限制）

非目标：
- 跨 cortex peer 的持续视频会话（未来 spec 补）
- Audio + Video 同步（Companion Mode 已经做 audio；本 spec 不重复）
- 实时字幕推流到 desktop（description 已经在 cortex 表里，desktop 简单 poll 即可）
- 自动说话触发（VAD 集成留给 future spec）
- 视频片段检索（"5 分钟前有什么？" → timestamp 查询的 UX；当前只看最近 N 条）

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ shadow-desktop                                                          │
│                                                                        │
│  ConversationPage                                                      │
│   ├─ CompanionModePanel  (现有, audio)                                 │
│   └─ VideoModePanel       (NEW, 视频对话)                                │
│        ├─ useEffect: 启动 session, poll description 列表                 │
│        └─ actions: Pause / Stop / 启动后通过 chat 提问                  │
│                                                                        │
│  stores/videoModeStore.ts (NEW, 仿 companionModeStore)                 │
│   ├─ state: idle | starting | active | paused | stopped                │
│   └─ recentDescriptions: VideoDescription[]                            │
│                                                                        │
│  src-tauri/src/video_session.rs (NEW)                                  │
│   ├─ start_video_session(agent, source_id) → POST /api/cortex/...     │
│   ├─ stop_video_session(session_id)                                    │
│   └─ get_recent_descriptions(session_id, limit)                         │
└──────────────────────────────────────────────────────────────────────────┘
                │
                │  HTTP (X-Admin-Token + JSON)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ cortex (本机 sidecar)                                                    │
│                                                                        │
│  api/video_sessions.rs (NEW)                                           │
│   ├─ POST   /api/cortex/video-sessions                                 │
│   ├─ GET    /api/cortex/video-sessions                                 │
│   ├─ GET    /api/cortex/video-sessions/{id}                            │
│   ├─ GET    /api/cortex/video-sessions/{id}/descriptions                 │
│   ├─ POST   /api/cortex/video-sessions/{id}/pause                      │
│   └─ POST   /api/cortex/video-sessions/{id}/stop                       │
│                                                                        │
│  visual_session/ (NEW module)                                          │
│   ├─ mod.rs          : VideoSession, VideoSessionState, VideoConfig      │
│   ├─ repo.rs         : VideoSessionRepo (sqlx)                          │
│   ├─ capture_loop.rs : VideoCaptureLoop (tokio::spawn)                 │
│   └─ session.rs      : VisualQASession (impl LobeSession)               │
│                                                                        │
│  lobes/session.rs (NEW)                                                 │
│   └─ LobeSession trait + SessionRegistry in AppState                   │
│                                                                        │
│  lobes/prefrontal.rs (MODIFY)                                          │
│   └─ assemble_system_prompt() 注入 session recent descriptions          │
└──────────────────────────────────────────────────────────────────────────┘
                │
                │  HTTP (Spec #3 capability invoke)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ desktop Tauri (per Spec #3)                                            │
│   capability: capture_frame_uvc (WebRTC → JPEG base64)                  │
│   capability: list_local_video_sources (Spec #1)                        │
└──────────────────────────────────────────────────────────────────────────┘
                │
                │  embedded neure HTTP /v1/chat/completions
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ embedded neure (Spec #3)                                                │
│   mage_vl → 返回 "桌子空着, 远处书架可见"                                │
└──────────────────────────────────────────────────────────────────────────┘
```

## Section 1: VideoSession 数据模型

```rust
// cortex/src/visual_session/mod.rs (NEW module)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSession {
    pub id: String,                  // uuid
    pub agent: String,               // owner (per-agent singleton)
    pub video_source_id: String,     // Spec #1's cortex_video_sources.id
    pub fps: f32,                    // default 0.5
    pub window_seconds: u32,         // default 2
    pub state: VideoSessionState,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub total_descriptions: u64,      // cumulative entry count
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum VideoSessionState {
    Active,         // capture + inference running
    Paused,         // user paused; capture loop suspended, descriptions retained
    Completed,      // user-initiated stop
    Failed,         // capture loop died (e.g. provider offline, mage_vl OOM)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoDescription {
    pub id: i64,
    pub session_id: String,
    pub window_start: DateTime<Utc>,
    pub window_end: DateTime<Utc>,
    pub description: String,
    pub created_at: DateTime<Utc>,
}
```

**Postgres schema** (new migration):

```sql
CREATE TABLE cortex_video_sessions (
    id                  TEXT PRIMARY KEY,
    agent               TEXT NOT NULL,
    video_source_id     TEXT NOT NULL,
    fps                 REAL NOT NULL,
    window_seconds      INTEGER NOT NULL,
    state               TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    stopped_at          TIMESTAMPTZ,
    total_descriptions  INTEGER NOT NULL DEFAULT 0
);

-- One active session per agent (partial unique index)
CREATE UNIQUE INDEX cortex_video_sessions_one_active_per_agent
    ON cortex_video_sessions (agent)
    WHERE state = 'Active';

CREATE TABLE cortex_video_session_descriptions (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES cortex_video_sessions(id) ON DELETE CASCADE,
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    description     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_session_descriptions_session
    ON cortex_video_session_descriptions (session_id, window_start DESC);
```

**GC**: cleanup task runs every 60s, deletes `cortex_video_session_descriptions` rows older than 5 minutes (150 rows / 0.5fps × 5min) per active session. Prevents unbounded growth.

## Section 2: Capture loop

```rust
// cortex/src/visual_session/capture_loop.rs (NEW)

use std::collections::VecDeque;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

pub struct VideoCaptureLoop {
    pub session: Arc<VisualQASession>,
    pub capabilities: Arc<CapabilityRegistry>,
    pub neure: Arc<neure_embed::EmbeddedNeure>,
    pub repo: Arc<VideoSessionRepo>,
    pub cancel_token: CancellationToken,
}

impl VideoCaptureLoop {
    pub async fn run(self) {
        let frame_interval = Duration::from_secs_f64(1.0 / self.session.config.fps as f64);
        let window = Duration::from_secs(self.session.config.window_seconds as u64);
        let mut frame_buffer: VecDeque<CapturedFrame> = VecDeque::new();
        let mut last_window_start = Instant::now();
        let mut last_description: Option<String> = None;

        let mut frame_ticker = tokio::time::interval(frame_interval);
        let mut window_checker = tokio::time::interval(window);
        // Skip the immediate first tick (tokio::time::interval fires immediately)
        frame_ticker.tick().await;
        window_checker.tick().await;

        loop {
            tokio::select! {
                _ = self.cancel_token.cancelled() => {
                    info!(session = %self.session.id, "video capture loop cancelled");
                    return;
                }
                _ = frame_ticker.tick() => {
                    match self.capture_one_frame().await {
                        Ok(frame) => frame_buffer.push_back(frame),
                        Err(e) => warn!(session = %self.session.id, "frame capture failed: {e}"),
                    }
                }
                _ = window_checker.tick() => {
                    if frame_buffer.is_empty() { continue; }
                    let last_frame = frame_buffer.back().cloned();
                    frame_buffer.clear();
                    if let Some(frame) = last_frame {
                        let prev = last_description.as_deref();
                        match self.run_mage_vl(&frame, prev).await {
                            Ok(desc) => {
                                if let Err(e) = self.repo.append_description(
                                    &self.session.config.id,
                                    &desc,
                                    last_window_start,
                                    Instant::now(),
                                ).await {
                                    warn!("description persist failed: {e}");
                                }
                                last_description = Some(desc);
                            }
                            Err(e) => warn!("mage_vl failed: {e}"),
                        }
                    }
                    last_window_start = Instant::now();
                }
            }
        }
    }

    /// Single frame capture via Spec #3 capability registry.
    /// Returns JPEG base64 + dimensions.
    async fn capture_one_frame(&self) -> Result<CapturedFrame, String> {
        let provider = self.capabilities
            .resolve("capture_frame_uvc").await
            .ok_or_else(|| "no provider for capture_frame_uvc".to_string())?;
        let url = format!("{}/api/cortex/capabilities/invoke", provider.callback_url);
        let token = read_cortex_provider_token(&provider);
        let resp = reqwest::Client::new().post(&url)
            .header("X-Provider-Token", &token)
            .json(&json!({
                "capability": "capture_frame_uvc",
                "args": { "source_id": &self.session.config.video_source_id }
            }))
            .timeout(Duration::from_millis(5_000))
            .send().await
            .map_err(|e| e.to_string())?;
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        let jpeg = body["result"]["jpeg_base64"].as_str()
            .ok_or_else(|| "missing jpeg_base64".to_string())?;
        Ok(CapturedFrame {
            jpeg_base64: jpeg.to_string(),
            width: body["result"]["width"].as_u64().unwrap_or(0) as u32,
            height: body["result"]["height"].as_u64().unwrap_or(0) as u32,
        })
    }

    /// Run mage_vl on the last frame of the window.
    /// Prompt asks for a concise 1-2 sentence description,
    /// optionally informed by the previous description.
    async fn run_mage_vl(&self, frame: &CapturedFrame, prev: Option<&str>)
        -> Result<String, String>
    {
        let prev_section = match prev {
            Some(p) => format!("\nPrevious description: \"{p}\"\nFocus on changes from this."),
            None => String::new(),
        };
        let prompt = format!(
            "Describe what is happening in this short video clip. \
             Be concise (1-2 sentences, under 30 words). Focus on visible objects and actions.{prev_section}"
        );
        let reply = self.neure.chat_completions(json!({
            "model": "microsoft/Mage-VL",
            "max_tokens": 80,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": format!("data:image/jpeg;base64,{}", frame.jpeg_base64)
                    }}
                ]
            }]
        })).await.map_err(|e| e.to_string())?;
        Ok(reply["choices"][0]["message"]["content"]
            .as_str().unwrap_or("").trim().to_string())
    }
}

pub struct CapturedFrame {
    pub jpeg_base64: String,
    pub width: u32,
    pub height: u32,
}
```

## Section 3: LobeSession trait + SessionRegistry

```rust
// cortex/src/lobes/session.rs (NEW)

// LobeSession is the long-running sibling of NativeLobe. Used for
// video sessions (Spec #6), audio streaming (future), etc. NativeLobe
// stays untouched — its one-shot handle() pattern is fine for Q&A.

use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq)]
pub enum SessionState {
    Initializing,
    Active,
    Paused,
    Completed,
    Failed(String),
}

#[async_trait]
pub trait LobeSession: Send + Sync {
    fn session_id(&self) -> &str;
    fn name(&self) -> &str;
    fn state(&self) -> SessionState;
    async fn start(&self) -> Result<(), String>;
    async fn stop(&self) -> Result<(), String>;     // graceful, 5s timeout
    async fn force_cancel(&self);
}

pub struct SessionRegistry {
    sessions: RwLock<std::collections::HashMap<String, Arc<dyn LobeSession>>>,
}

impl SessionRegistry {
    pub fn new() -> Self { Self { sessions: RwLock::new(Default::default()) } }
    pub async fn insert(&self, session: Arc<dyn LobeSession>) -> Result<(), String> {
        let agent = session.name().to_string();   // MVP: name() doubles as agent
        let mut s = self.sessions.write().await;
        if s.values().any(|x| x.name() == agent && x.state() == SessionState::Active) {
            return Err(format!("agent {agent} already has an active video session"));
        }
        s.insert(session.session_id().to_string(), session);
        Ok(())
    }
    pub async fn get(&self, id: &str) -> Option<Arc<dyn LobeSession>> {
        self.sessions.read().await.get(id).cloned()
    }
    pub async fn list(&self) -> Vec<Arc<dyn LobeSession>> {
        self.sessions.read().await.values().cloned().collect()
    }
    pub async fn list_active(&self) -> Vec<Arc<dyn LobeSession>> {
        self.list().await.into_iter()
            .filter(|s| s.state() == SessionState::Active)
            .collect()
    }
    pub async fn remove(&self, id: &str) { self.sessions.write().await.remove(id); }
}

// VisualQASession is the concrete impl of LobeSession for Spec #6.

pub struct VisualQASession {
    pub config: VisualSessionConfig,
    pub capabilities: Arc<CapabilityRegistry>,
    pub neure: Arc<neure_embed::EmbeddedNeure>,
    pub repo: Arc<VideoSessionRepo>,
    pub cancel: CancellationToken,
    state: RwLock<SessionState>,
    handle: RwLock<Option<JoinHandle<()>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualSessionConfig {
    pub session_id: String,            // uuid
    pub agent: String,                 // matches session_id for MVP (1 session per agent)
    pub video_source_id: String,       // cortex_video_sources.id (Spec #1)
    pub fps: f32,                      // default 0.5
    pub window_seconds: u32,           // default 2
    pub started_at: chrono::DateTime<chrono::Utc>,
}

#[async_trait]
impl LobeSession for VisualQASession {
    fn session_id(&self) -> &str { &self.config.session_id }
    fn name(&self) -> &str { &self.config.agent }
    fn state(&self) -> SessionState { self.state.blocking_read().clone() }
    async fn start(&self) -> Result<(), String> {
        let me = self.clone_arc();
        let cancel = self.cancel.clone();
        let handle = tokio::spawn(async move {
            VideoCaptureLoop {
                session: me,
                capabilities: me.capabilities.clone(),
                neure: me.neure.clone(),
                repo: me.repo.clone(),
                cancel_token: cancel,
            }.run().await;
        });
        *self.handle.write().await = Some(handle);
        *self.state.write().await = SessionState::Active;
        Ok(())
    }
    async fn stop(&self) -> Result<(), String> {
        self.cancel.cancel();
        if let Some(h) = self.handle.write().await.take() {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), h).await;
        }
        *self.state.write().await = SessionState::Completed;
        Ok(())
    }
    async fn force_cancel(&self) { self.cancel.cancel(); }
}
```

**AppState wiring** (in `cortex/src/state.rs`):

```rust
pub struct AppState {
    // ... existing ...
    pub session_registry: SessionRegistry,
}
```

**Recovery on boot**: at startup, scan `cortex_video_sessions WHERE state = 'Active'`. For each, set state to `Failed` (since the previous capture loop is dead) and log warn. Don't auto-resume (cortex restart likely means device was rebooted, so source is also gone).

## Section 4: Temporal lobe 集成 (context cache loading)

```rust
// cortex/src/lobes/prefrontal.rs (MODIFY existing assemble_system_prompt)

impl TemporalLobe {
    async fn assemble_system_prompt(&self, state: &AppState) -> String {
        let mut prompt = self.base_prompt.clone();

        // Inject the most recent N descriptions from any active video session
        for session in state.session_registry.list_active().await {
            let descs = state.video_session_repo
                .recent_descriptions(session.session_id(), 5).await.unwrap_or_default();
            if !descs.is_empty() {
                prompt.push_str(&format!(
                    "\n\n# Live video context (session {}, source {}, since {})\n",
                    session.session_id(), session.name(),
                    session.state().to_string_lossy(),
                ));
                prompt.push_str("Recent visual descriptions (newest first):\n");
                for d in descs.iter() {
                    prompt.push_str(&format!(
                        "  [{} – {}] {}\n",
                        d.window_start.format("%H:%M:%S"),
                        d.window_end.format("%H:%M:%S"),
                        d.description,
                    ));
                }
            }
        }

        // Existing Spec #4 ToolPromptBuilder (tool schemas)
        let tool_section = self.tool_prompt_builder
            .build_for_agent(&self.config.owner_agent).await;
        if !tool_section.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&tool_section);
        }

        prompt
    }
}
```

The user's question is then answered by the LLM with both:
- the live video descriptions (Spec #6 context)
- the available tools (Spec #4 tool schemas)

## Section 5: REST surface + shadow-desktop UI

**cortex routes** (admin only, all under `/api/cortex/video-sessions/*`):

```rust
// cortex/src/api/video_sessions.rs (NEW)

#[derive(Deserialize)]
struct StartBody {
    agent: String,
    video_source_id: String,
    #[serde(default)] fps: Option<f32>,
    #[serde(default)] window_seconds: Option<u32>,
}

async fn start_handler(
    State(state): State<AppState>, headers: HeaderMap, Json(body): Json<StartBody>,
) -> Result<(StatusCode, Json<VideoSession>), StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let fps = body.fps.unwrap_or(0.5);
    let window = body.window_seconds.unwrap_or(2);
    let session = VisualQASession::new(
        body.agent.clone(), body.video_source_id, fps, window, &state
    ).await;
    state.session_registry.insert(session.clone_arc_as_lobe()).await
        .map_err(|_| StatusCode::CONFLICT)?;
    session.start().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(session.to_dto())))
}

async fn list_handler(State(state): State<AppState>, headers: HeaderMap)
    -> Result<Json<Vec<VideoSession>>, StatusCode> { /* ... */ }

async fn descriptions_handler(
    State(state): State<AppState>, Path(id): Path<String>, Query(q): Query<DescQuery>,
) -> Result<Json<Vec<VideoDescription>>, StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let limit = q.limit.unwrap_or(20).min(200);
    Ok(Json(state.video_session_repo.recent_descriptions(&id, limit as i64).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

async fn stop_handler(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap)
    -> Result<StatusCode, StatusCode> { /* graceful stop */ }

async fn pause_handler(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap)
    -> Result<StatusCode, StatusCode> {
    // Pause = set state to Paused + cancel capture loop (keep descriptions)
}
```

Wire into `cortex/src/server.rs` as `.nest(crate::api::video_sessions::router())`.

**shadow-desktop UI** (modeled on `companionModeStore` + `VoicePage`):

```tsx
// shadow-desktop/src/components/business/VideoModePanel/VideoModePanel.tsx (NEW)
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api';
import { useVideoModeStore } from '../../../stores/videoModeStore';

export function VideoModePanel({ agent }: { agent: string }) {
  const state = useVideoModeStore();
  useEffect(() => { state.refresh(); }, []);
  
  if (!state.sessionId) {
    return <StartCard onStart={(src) => state.start(agent, src)} />;
  }
  return (
    <Card>
      <Header>● Live · Started {state.startedAt} · {state.elapsed}s</Header>
      <DescriptionList items={state.descriptions} />
      <Footer>
        <span>{state.fps} fps · {state.window}s window · {state.descriptions.length} descs</span>
        <Button onClick={state.pause}>Pause</Button>
        <Button onClick={state.stop}>Stop</Button>
      </Footer>
    </Card>
  );
}
```

`videoModeStore.ts` (mirror of `companionModeStore`):

```typescript
// zustand store with localStorage mirror (key: shadow.videoMode.v1)
interface VideoModeState {
  sessionId: string | null;
  state: 'idle' | 'active' | 'paused' | 'stopping';
  descriptions: VideoDescription[];
  startedAt?: number;
  fps: number;       // 0.5 default
  window: number;    // 2 default
  start(agent: string, sourceId: string): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  refresh(): Promise<void>;   // poll GET /video-sessions/{id}/descriptions
}
```

## Section 6: 错误处理 + 测试 + scenarios doc

| Case | Behavior |
|---|---|
| 同一 agent 启动第二个 session | 409 Conflict "agent already has an active video session" |
| 用户在 session 期间切换 video source | Stop current, start new with new source; descriptions are isolated per session |
| 枕叶连续失败 (5 frames 全 fail) | Session state → Failed; 停止 capture loop; descriptions 表保留已写入的 |
| mage_vl OOM | 一次调用失败 → log warn → 下个 window 重试；不影响 session 持续 |
| Session stop 5s timeout | force_cancel()，返回 504；session state → Failed |
| cortex 重启 + session 还 "Active" | 启动时扫描 sessions 表：state='Active' → 标 Failed + log warn (进程 crash 中止了) |
| 客户端 (Tauri) crash | 同上；session 自动标 Failed (后台 task 不会无限 run) |
| 10000+ description rows | 定期 GC: 只保留最近 5 分钟 (150 条 / 0.5fps × 5min) per active session |
| provider (desktop) 离线 | capture fail 5 frames 连续 → session 标 Failed |
| user 关 page 但 video session 还 active | session 持续；下次打开 page 看到列表；可以 stop |
| fps / window 在 session 中途修改 | 拒 (HTTP 409)；需 stop + restart |
| windwos > 30s | Reject at start (timeout; 1-10s 合理范围) |

**测试**:

```rust
// cortex/src/visual_session/mod.rs (inline tests)
#[tokio::test]
async fn capture_loop_emits_one_description_per_window() { /* uses fake capability */ }

#[tokio::test]
async fn capture_loop_skips_failed_frames_continues() { /* frame capture fail 2x then succeed */ }

#[tokio::test]
async fn capture_loop_respects_cancellation() { /* cancel after 3 windows */ }

#[tokio::test]
async fn mage_vl_prompt_includes_previous_description() { /* check prompt construction */ }

#[tokio::test]
async fn session_registry_rejects_duplicate_active_for_agent() { /* first OK, second 409 */ }

#[tokio::test]
async fn session_stop_5s_timeout_force_cancels() { /* spawn session that ignores cancel; stop blocks 5s then force_cancel */ }

#[tokio::test]
async fn gc_removes_descriptions_older_than_5_minutes() { /* insert old + new; run gc; verify */ }

#[tokio::test]
async fn prefrontal_assembles_recent_descriptions_into_prompt() { /* mock session + repo; check prompt */ }

// cortex/tests/video_session_e2e.rs
#[tokio::test]
#[ignore = "requires mage_vl shards + embedded neure boot"]
async fn end_to_end_30s_session_then_ask_about_recent() { /* see scenarios/VQA-06 */ }
```

8 new unit tests + 1 e2e (gated) = 9 new tests for Spec #6.

### scenarios 文档（满足"所有测试用例记录到专门的场景测试文档中"）

新建 `docs/superpowers/scenarios/visual-qa-scenarios.md`，内容见 Section 5 的场景表。涵盖 Spec #1-#6 的 6 个端到端场景，每个场景含 ID、标题、用户动作、期望行为、背后 spec 引用、可手动跑的 e2e 命令。

## 与 Spec #1-#5 的依赖

| 项 | 来源 | Spec #6 读取 |
|---|---|---|
| `cortex_video_sources` table | Spec #1 | `video_source_id` 列 |
| `CapabilityRegistry` + `capture_frame_uvc` capability | Spec #3 | 抓帧 |
| `LobeSession` 是新 trait | 本 spec | 不影响 `NativeLobe` |
| `embedded neure mage_vl` | Spec #3 | 持续推理 |
| `ToolPromptBuilder` (system prompt) | Spec #4 | temporal lobe 调用 (additively, not replace) |
| `Intent::VisualQA` | Spec #2 | 不变（spec #6 是新 intent path） |

## 范围外（未来 spec）

- 跨 cortex peer 的持续视频会话（A2A 视频流）
- 视频片段检索（"5 分钟前有什么" → timestamp query）
- Audio + Video 同步会话
- VAD 自动说话触发
- Sub-1Hz 帧率（spec 限制 ≥ 0.2 fps 防止用户设错）
- 自动 model selection（Qwen3-VL vs mage_vl 按 video 复杂度）
- 流式字幕推到 desktop（当前 desktop poll GET；real-time SSE 是 future）
- 视频 session 的 migration（设备切换时 transfer 描述缓存）

## 风险

1. **CPU 预算**：0.5 fps + mage_vl ~5s/token = 一个 session 占用一个 mage_vl 调用 5s 中 2.5s；单 device 跑 1 session 接近单核。MVP 限制 1 session/device。
2. **Context cache 大小**：5min × 0.5fps = 150 descriptions × ~50 chars = ~7.5KB/agent。对 LLM context 几乎无影响。
3. **跨 device 持续会话不覆盖**：spec #6 限定本机；用户跨设备时需 stop + start on new device（描述缓存不迁移）。
4. **mage_vl token 数与 prompt 长度**：用 max_tokens=80 + prompt 100 词 = 一次推理 ~180 token。CPU 0.5fps 下 1 秒生成 ~36 token，180 token 需 ~5s（与 spec #1 经验一致）。
5. **gc 频率**：60s 间隔 gc 描述表 → 旧 entries 最多停留 5min + 60s = 6 分钟。够用。
6. **session 长寿命**: Cortex 重启时未停止的 sessions 标 Failed，log warn。语义清晰。
