# Phase 2.1: Prefrontal Core 库集成设计

**版本:** 1.0
**日期:** 2026-03-22
**项目:** Shadow (影)

## 概述

本设计描述了如何将 Prefrontal 改造为共享核心库，使 Shadow-Desktop 和 Shadow-Mobile 都能直接调用核心逻辑，最大化代码复用。

## 目标

1. **最大化代码复用**: 核心逻辑 100% 放在 prefrontal-core
2. **内存中直接调用**: 跳过 HTTP 开销，Desktop 直接调用 Rust API
3. **统一接口**: Desktop (Tauri/Rust) 和 Mobile (JNI/Kotlin) 使用相同核心逻辑

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        prefrontal-core                          │
│                   (Agent, Session, LLM, Tools)                   │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Prefrontal Client                    │   │
│   │  - PrefrontalConfig                                    │   │
│   │  - create_session() -> session_id                      │   │
│   │  - process(session_id, message) -> response            │   │
│   │  - process_with_tools(session_id, message) -> response│   │
│   │  - list_sessions() -> Vec<session_id>                 │   │
│   │  - delete_session(session_id) -> bool                   │   │
│   │  - list_tools() -> Vec<ToolMetadata>                  │   │
│   │  - execute_tool(name, args) -> Result                 │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│     Shadow-Desktop      │      │     Shadow-Mobile      │
│       (Tauri/Rust)      │      │        (Kotlin)        │
│                         │      │                         │
│  直接调用 Rust API      │      │  JNI 绑定到            │
│  (无 HTTP 开销)        │      │  prefrontal-core        │
│                         │      │                         │
│  暴露 Tauri Commands   │      │  Kotlin 薄封装         │
│  给 React 前端         │      │  PrefrontalClient.kt    │
└─────────────────────────┘      └─────────────────────────┘
```

## 设计

### 1. Prefrontal Client 接口

新增 `prefrontal-core/src/client.rs`:

```rust
use crate::config::{AgentConfig, LlmConfig};
use crate::agent::Agent;
use crate::session::{Session, SessionManager};
use crate::tool::ToolRegistry;
use crate::error::PrefrontalError;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct PrefrontalConfig {
    pub llm_provider: String,      // "openai" | "anthropic"
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

pub struct Prefrontal {
    agent: Arc<RwLock<Option<Agent>>>,
    session_manager: Arc<SessionManager>,
    config: PrefrontalConfig,
}

impl Prefrontal {
    pub fn new(config: PrefrontalConfig) -> Result<Self, PrefrontalError> {
        let session_manager = Arc::new(SessionManager::new());
        
        Ok(Self {
            agent: Arc::new(RwLock::new(None)),
            session_manager,
            config,
        })
    }

    pub async fn initialize(&self) -> Result<(), PrefrontalError> {
        let llm = self.create_llm_provider()?;
        let memory = Arc::new(crate::memory::InMemoryBackend::new());
        
        let agent = Agent::new(
            AgentConfig::default(),
            LlmConfig::from(self.config.clone()),
            llm,
            memory,
        );
        
        *self.agent.write().await = Some(agent);
        Ok(())
    }

    fn create_llm_provider(&self) -> Result<Arc<dyn LlmProvider>, PrefrontalError> {
        match self.config.llm_provider.as_str() {
            "openai" => Ok(Arc::new(OpenAiProvider::new(&LlmConfig::from(self.config.clone())))),
            "anthropic" => Ok(Arc::new(AnthropicProvider::new(&LlmConfig::from(self.config.clone())))),
            _ => Err(PrefrontalError::config("Unknown LLM provider")),
        }
    }

    pub fn create_session(&self) -> String {
        let session = self.session_manager.create_session();
        session.id().to_string()
    }

    pub fn delete_session(&self, session_id: &str) -> bool {
        if let Ok(uuid) = uuid::Uuid::parse_str(session_id) {
            self.session_manager.remove_session(uuid).is_some()
        } else {
            false
        }
    }

    pub fn list_sessions(&self) -> Vec<String> {
        self.session_manager.list_sessions()
            .iter()
            .map(|id| id.to_string())
            .collect()
    }

    pub async fn process(&self, session_id: &str, message: &str) -> Result<String, PrefrontalError> {
        let session = self.get_session(session_id)?;
        let agent = self.agent.read().await;
        let agent = agent.as_ref().ok_or_else(|| PrefrontalError::agent("Agent not initialized"))?;
        
        agent.process(&session, message).await
    }

    pub async fn process_with_tools(&self, session_id: &str, message: &str) -> Result<String, PrefrontalError> {
        let session = self.get_session(session_id)?;
        let agent = self.agent.read().await;
        let agent = agent.as_ref().ok_or_else(|| PrefrontalError::agent("Agent not initialized"))?;
        
        agent.process_with_tools(&session, message).await
    }

    pub fn list_tools(&self) -> Vec<crate::tool::ToolMetadata> {
        // 需要从 agent 获取 tools
        vec![]
    }

    fn get_session(&self, session_id: &str) -> Result<Arc<Session>, PrefrontalError> {
        let uuid = uuid::Uuid::parse_str(session_id)
            .map_err(|_| PrefrontalError::session("Invalid session ID"))?;
        
        self.session_manager
            .get_session(uuid)
            .ok_or_else(|| PrefrontalError::session("Session not found"))
    }
}

impl From<PrefrontalConfig> for LlmConfig {
    fn from(config: PrefrontalConfig) -> Self {
        LlmConfig {
            provider: config.llm_provider,
            model: config.model,
            api_key: config.api_key,
            base_url: config.base_url,
            max_tokens: config.max_tokens,
            temperature: config.temperature,
        }
    }
}
```

### 2. 模块导出

修改 `prefrontal-core/src/lib.rs`:

```rust
pub mod client;  // 新增

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

### 3. Shadow-Desktop 集成

修改 `shadow-desktop/src-tauri/src/lib.rs`:

```rust
mod prefrontal_client;

use prefrontal_core::{Prefrontal, PrefrontalConfig};
use std::sync::Arc;
use tokio::sync::RwLock;

struct AppState {
    prefrontal: Arc<RwLock<Prefrontal>>,
}

#[tauri::command]
async fn prefrontal_init(config: PrefrontalConfig) -> Result<(), String> {
    let prefrontal = Prefrontal::new(config).map_err(|e| e.to_string())?;
    prefrontal.initialize().await.map_err(|e| e.to_string())?;
    
    app_state().prefrontal = Arc::new(RwLock::new(prefrontal));
    Ok(())
}

#[tauri::command]
fn prefrontal_create_session() -> Result<String, String> {
    Ok(app_state().prefrontal.blocking_read().create_session())
}

#[tauri::command]
fn prefrontal_list_sessions() -> Result<Vec<String>, String> {
    Ok(app_state().prefrontal.blocking_read().list_sessions())
}

#[tauri::command]
fn prefrontal_delete_session(session_id: String) -> Result<bool, String> {
    Ok(app_state().prefrontal.blocking_read().delete_session(&session_id))
}

#[tauri::command]
async fn prefrontal_process(session_id: String, message: String) -> Result<String, String> {
    app_state().prefrontal.read().await
        .process(&session_id, &message)
        .await
        .map_err(|e| e.to_string())
}
```

### 4. Shadow-Mobile JNI 绑定

新增 `prefrontal-core/src/ffi/jni.rs`:

```rust
#[cfg(feature = "jni")]
pub mod jni {
    use super::*;
    use jni::{JNIEnv, JavaVM, objects::{JObject, JString}, sys::jstring};
    
    #[no_mangle]
    pub extern "C" fn Java_com_ibloc_shadowmobile_PrefrontalClient_createSession(
        env: JNIEnv,
        obj: JObject,
    ) -> jstring {
        // 获取 JVM 和 Prefrontal 实例
        // 调用 create_session() 并返回
    }
    
    #[no_mangle]
    pub extern "C" fn Java_com_ibloc_shadowmobile_PrefrontalClient_process(
        env: JNIEnv,
        obj: JObject,
        session_id: JString,
        message: JString,
    ) -> jstring {
        // 调用 process() 并返回
    }
}
```

Kotlin 封装 `PrefrontalClient.kt`:

```kotlin
class PrefrontalClient {
    companion object {
        init { System.loadLibrary("prefrontal") }
        
        external fun createSession(): String
        external fun process(sessionId: String, message: String): String
        external fun deleteSession(sessionId: String): Boolean
        external fun listSessions(): Array<String>
    }
    
    fun initialize(config: PrefrontalConfig): Boolean {
        // JNI 调用初始化
        return true
    }
}
```

### 5. Cargo 依赖

Shadow-Desktop `src-tauri/Cargo.toml`:

```toml
[dependencies]
prefrontal-core = { path = "/home/ibloc/Projects/prefrontal" }
```

Prefrontal `Cargo.toml` 需要启用 jni feature:

```toml
[features]
default = []
desktop = []
flutter = []
jni = ["jni"]
```

## 实现步骤

1. **修改 prefrontal-core**
   - 创建 `client.rs` 模块
   - 实现 `Prefrontal` 和 `PrefrontalConfig`
   - 更新 `lib.rs` 导出
   - 添加 jni feature

2. **Shadow-Desktop 集成**
   - 添加 Cargo 依赖
   - 创建 `prefrontal_client.rs`
   - 实现 Tauri Commands
   - 更新 `lib.rs` 初始化

3. **Shadow-Mobile JNI (后续 Phase)**
   - 配置 jni feature
   - 实现 JNI 绑定
   - 创建 Kotlin 封装

## 风险和缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| JNI 复杂度 | 中 | 使用薄封装，只做桥接 |
| 线程安全 | 中 | 使用 Arc<RwLock<>> 保护状态 |
| 初始化时机 | 低 | 前端显式调用 init |

## 验证

1. Shadow-Desktop 能创建 session 并处理消息
2. Mobile JNI 绑定能调用核心逻辑 (后续验证)
