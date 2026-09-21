# Prefrontal Core 库集成实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Prefrontal 改造为共享核心库，使 Shadow-Desktop 和 Shadow-Mobile 都能直接调用核心逻辑

**Architecture:** 在 prefrontal-core 中创建 `Prefrontal` 客户端类型，封装 Agent 和 SessionManager。Desktop 通过 Tauri Commands 暴露给前端，Mobile 通过 JNI 绑定调用。

**Tech Stack:** Rust (prefrontal-core), Tauri v2, tokio, jni

---

## Chunk 1: 修改 Prefrontal Core 创建 Client 模块

**Files:**
- Create: `https://github.com/iBLOC/prefrontal/src/client.rs`
- Modify: `https://github.com/iBLOC/prefrontal/src/lib.rs`

- [ ] **Step 1: 创建 client.rs 模块**

```rust
// https://github.com/iBLOC/prefrontal/src/client.rs
use crate::config::{AgentConfig, LlmConfig};
use crate::agent::Agent;
use crate::error::{PrefrontalError, Result};
use crate::llm::{LlmProvider, OpenAiProvider, AnthropicProvider};
use crate::memory::InMemoryBackend;
use crate::session::{Session, SessionManager};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct PrefrontalConfig {
    pub llm_provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub max_tokens: Option<usize>,
    pub temperature: Option<f32>,
}

impl Default for PrefrontalConfig {
    fn default() -> Self {
        Self {
            llm_provider: "openai".to_string(),
            model: "gpt-4".to_string(),
            api_key: None,
            base_url: None,
            max_tokens: Some(4096),
            temperature: Some(0.7),
        }
    }
}

impl From<PrefrontalConfig> for LlmConfig {
    fn from(config: PrefrontalConfig) -> Self {
        LlmConfig {
            provider: config.llm_provider.clone(),
            model: config.model.clone(),
            api_key: config.api_key.clone(),
            base_url: config.base_url.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
        }
    }
}

pub struct Prefrontal {
    agent: Arc<RwLock<Option<Agent>>>,
    session_manager: Arc<SessionManager>,
    config: PrefrontalConfig,
}

impl Prefrontal {
    pub fn new(config: PrefrontalConfig) -> Result<Self> {
        let session_manager = Arc::new(SessionManager::new());
        
        Ok(Self {
            agent: Arc::new(RwLock::new(None)),
            session_manager,
            config,
        })
    }

    pub async fn initialize(&self) -> Result<()> {
        let llm_config: LlmConfig = self.config.clone().into();
        let llm: Arc<dyn LlmProvider> = match self.config.llm_provider.as_str() {
            "openai" => Arc::new(OpenAiProvider::new(&llm_config)),
            "anthropic" => Arc::new(AnthropicProvider::new(&llm_config)),
            _ => return Err(PrefrontalError::config("Unknown LLM provider")),
        };
        
        let memory: Arc<dyn crate::memory::MemoryBackend> = Arc::new(InMemoryBackend::new());
        
        let agent = Agent::new(
            AgentConfig::default(),
            llm_config,
            llm,
            memory,
        );
        
        *self.agent.write().await = Some(agent);
        Ok(())
    }

    pub fn create_session(&self) -> String {
        let session = self.session_manager.create_session();
        session.id().to_string()
    }

    pub fn delete_session(&self, session_id: &str) -> bool {
        if let Ok(uuid) = Uuid::parse_str(session_id) {
            self.session_manager.remove_session(uuid).is_some()
        } else {
            false
        }
    }

    pub fn list_sessions(&self) -> Vec<String> {
        self.session_manager
            .list_sessions()
            .iter()
            .map(|id| id.to_string())
            .collect()
    }

    pub async fn process(&self, session_id: &str, message: &str) -> Result<String> {
        let session = self.get_session(session_id)?;
        let agent = self.agent.read().await;
        let agent = agent.as_ref().ok_or_else(|| PrefrontalError::agent("Agent not initialized"))?;
        
        agent.process(&session, message).await
    }

    pub async fn process_with_tools(&self, session_id: &str, message: &str) -> Result<String> {
        let session = self.get_session(session_id)?;
        let agent = self.agent.read().await;
        let agent = agent.as_ref().ok_or_else(|| PrefrontalError::agent("Agent not initialized"))?;
        
        agent.process_with_tools(&session, message).await
    }

    fn get_session(&self, session_id: &str) -> Result<Arc<Session>> {
        let uuid = Uuid::parse_str(session_id)
            .map_err(|_| PrefrontalError::session("Invalid session ID"))?;
        
        self.session_manager
            .get_session(uuid)
            .ok_or_else(|| PrefrontalError::session("Session not found"))
    }
}
```

- [ ] **Step 2: 更新 lib.rs 导出 client 模块**

修改 `https://github.com/iBLOC/prefrontal/src/lib.rs`:

```rust
pub mod client;

pub mod agent;
pub mod checkpoint;
pub mod config;
pub mod error;
pub mod llm;
pub mod memory;
pub mod persistence;
pub mod session;
pub mod server;
pub mod skill;
pub mod tool;
pub mod tools;
pub mod types;

pub use agent::{Agent, AgentBuilder, AgentState, AgentFullConfig};
pub use client::{Prefrontal, PrefrontalConfig};
pub use config::{Config, LlmConfig, AgentConfig, MemoryConfig, ToolsConfig};
pub use error::PrefrontalError;
pub use llm::{LlmProvider, LlmMessage, LlmRequest, LlmResponse, OpenAiProvider, AnthropicProvider};
pub use memory::{MemoryBackend, InMemoryBackend, MemoryEntry, MemoryQuery, MemorySearchResult};
pub use session::{Session, SessionManager};
pub use skill::Skill;
pub use tool::{Tool, ToolCall, ToolOutput, ToolRegistry, ToolMetadata};
pub use types::{Message, Role, ConversationContext};
```

- [ ] **Step 3: 验证 Prefrontal 编译**

Run: `cd https://github.com/iBLOC/prefrontal && cargo check 2>&1`
Expected: 编译成功 (可能有 warning)

- [ ] **Step 4: 提交**

```bash
cd https://github.com/iBLOC/prefrontal
git add src/client.rs src/lib.rs
git commit -m "feat: add Prefrontal client module for in-memory integration"
```

---

## Chunk 2: Shadow-Desktop 集成 Prefrontal

**Files:**
- Modify: `https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/Cargo.toml`
- Create: `https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/src/prefrontal_client.rs`
- Modify: `https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: 添加 Cargo 依赖**

修改 `https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/Cargo.toml`:
在 `[dependencies]` 部分添加:

```toml
[dependencies]
prefrontal-core = { path = "https://github.com/iBLOC/prefrontal" }
```

- [ ] **Step 2: 创建 prefrontal_client.rs**

```rust
// https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/src/prefrontal_client.rs
use prefrontal_core::{Prefrontal, PrefrontalConfig};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct PrefrontalState {
    pub client: Arc<RwLock<Prefrontal>>,
}

impl PrefrontalState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(Prefrontal::new(PrefrontalConfig::default()).unwrap())),
        }
    }

    pub async fn initialize(&self, config: PrefrontalConfig) -> Result<(), String> {
        let client = Prefrontal::new(config).map_err(|e| e.to_string())?;
        client.initialize().await.map_err(|e| e.to_string())?;
        *self.client.write().await = client;
        Ok(())
    }

    pub async fn create_session(&self) -> Result<String, String> {
        Ok(self.client.read().await.create_session())
    }

    pub async fn list_sessions(&self) -> Result<Vec<String>, String> {
        Ok(self.client.read().await.list_sessions())
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<bool, String> {
        Ok(self.client.read().await.delete_session(session_id))
    }

    pub async fn process(&self, session_id: &str, message: &str) -> Result<String, String> {
        self.client.read().await
            .process(session_id, message)
            .await
            .map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 3: 更新 lib.rs 集成 Prefrontal**

修改 `https://github.com/iBLOC/shadow/shadow-desktop/src-tauri/src/lib.rs`:

在文件顶部添加:
```rust
mod prefrontal_client;

use prefrontal_client::PrefrontalState;
use std::sync::Arc;
use tauri::State;
```

在 `run()` 函数中的 `tauri::Builder` 之前添加状态:
```rust
struct AppState {
    prefrontal: Arc<PrefrontalState>,
}

fn create_app_state() -> AppState {
    AppState {
        prefrontal: Arc::new(PrefrontalState::new()),
    }
}
```

在 `.setup(|app| {` 之前添加:
```rust
let app_state = create_app_state();
let app_state_clone = app_state.prefrontal.clone();
```

在 `.plugin(tauri_plugin_opener::init())` 之后添加:
```rust
.app_state(app_state)
```

在 `tauri::generate_handler![]` 中添加:
```rust
prefrontal_init,
prefrontal_create_session,
prefrontal_list_sessions,
prefrontal_delete_session,
prefrontal_process,
```

添加 Tauri Commands:
```rust
#[tauri::command]
async fn prefrontal_init(
    state: State<'_, AppState>,
    config: prefrontal_core::PrefrontalConfig,
) -> Result<(), String> {
    state.prefrontal.initialize(config).await
}

#[tauri::command]
async fn prefrontal_create_session(state: State<'_, AppState>) -> Result<String, String> {
    state.prefrontal.create_session().await
}

#[tauri::command]
async fn prefrontal_list_sessions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.prefrontal.list_sessions().await
}

#[tauri::command]
async fn prefrontal_delete_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    state.prefrontal.delete_session(&session_id).await
}

#[tauri::command]
async fn prefrontal_process(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> Result<String, String> {
    state.prefrontal.process(&session_id, &message).await
}
```

- [ ] **Step 4: 验证编译**

Run: `cd https://github.com/iBLOC/shadow/shadow-desktop && cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: 编译成功

- [ ] **Step 5: 提交**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop
git add src-tauri/Cargo.toml src-tauri/src/prefrontal_client.rs src-tauri/src/lib.rs
git commit -m "feat: integrate prefrontal-core for in-memory agent execution"
```

---

## 验证步骤

1. **Prefrontal 编译**: `cd https://github.com/iBLOC/prefrontal && cargo build`
2. **Shadow-Desktop 编译**: `cd https://github.com/iBLOC/shadow/shadow-desktop && cargo check --manifest-path src-tauri/Cargo.toml`

## 后续

- Mobile JNI 绑定在 Phase 2 后续任务中实现
- Hippocampus 记忆集成在 Phase 2.2 中实现
- 会话管理在 Phase 2.3 中实现
