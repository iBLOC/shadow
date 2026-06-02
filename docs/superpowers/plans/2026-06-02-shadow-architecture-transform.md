# Shadow Architecture Transformation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 统一架构 - Flutter和Desktop都通过Rust服务进行AI交互，Kotlin/Android实现LiteRT本地推理和移动端Action Agent

**Architecture:**
- Flutter/Desktop 作为纯UI层，所有AI能力通过HTTP调用Rust (Prefrontal) 服务
- Kotlin/Android 实现LiteRT本地推理引擎，通过OpenAI兼容API注册到Rust
- Kotlin/Android 实现Mobile Action Agent，通过A2A协议与Rust MainAgent通讯
- Rust实现完整的Agent框架、Skill、MCP、Memory等，所有逻辑集中管理

**Tech Stack:**
- Flutter + Riverpod
- Kotlin + LiteRT (Google AI Edge)
- Rust + Prefrontal
- A2A Protocol (Agent to Agent)
- OpenAI Compatible API

---

## Phase 1: Kotlin OpenAI Server 改进

### 1.1 改进 OpenAIServer 实现完整 OpenAI 兼容

**Files:**
- Modify: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/mnn/OpenAIServer.kt`
- Modify: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/litert/LitertEngine.kt`

- [ ] **Step 1: 完善 Chat Completion 支持**

```kotlin
// 在 OpenAIServer.kt 中添加 streaming 支持
private fun handleChatCompletionStream(writer: PrintWriter, body: String) {
    // 实现 Server-Sent Events (SSE) 格式
    // data: {"id":"...","choices":[{"delta":{"content":"..."}}]}
    // data: [DONE]
}
```

- [ ] **Step 2: 添加完整的 model list**

```kotlin
// 动态获取 LiteRT 加载的模型信息
private fun getModelList(): List<ModelInfo> {
    return listOf(
        ModelInfo(
            id = "litert-local",
            object = "model",
            created = System.currentTimeMillis() / 1000,
            owned_by = "android",
            permission = emptyList()
        )
    )
}
```

- [ ] **Step 3: 添加 embedding 支持 (可选)**

- [ ] **Step 4: 测试 OpenAI SDK 连接**

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{"model":"litert-local","messages":[{"role":"user","content":"Hello"}]}'
```

### 1.2 集成 LiteRT 模型信息

**Files:**
- Modify: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/litert/LitertEngine.kt`

- [ ] **Step 1: 添加模型元信息获取**

```kotlin
data class ModelInfo(
    val id: String,
    val modelPath: String,
    val backend: String,
    val loadedAt: Long
)

suspend fun getLoadedModelInfo(): ModelInfo? {
    if (!_isInitialized.value) return null
    return ModelInfo(
        id = "litert-${conversation.hashCode()}",
        modelPath = engine?.modelPath ?: "",
        backend = "CPU",
        loadedAt = System.currentTimeMillis()
    )
}
```

---

## Phase 2: Rust LiteRT Provider

### 2.1 添加 LiteRT OpenAI Provider

**Files:**
- Create: `prefrontal/src/llm/litert_provider.rs`
- Modify: `prefrontal/src/provider_registry.rs`
- Modify: `prefrontal/src/lib.rs`

- [ ] **Step 1: 创建 LiteRT Provider**

```rust
// prefrontal/src/llm/litert_provider.rs
use crate::error::{PrefrontalError, Result};
use crate::llm::{LlmProvider, LlmRequest, LlmMessage, LlmResponse, LlmChoice, LlmUsage};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct LiteRTProvider {
    base_url: String,
    api_key: String,
    client: Client,
}

impl LiteRTProvider {
    pub fn new(base_url: String, api_key: String) -> Self {
        Self {
            base_url,
            api_key,
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    id: String,
    choices: Vec<OpenAIChoice>,
    usage: OpenAIUsage,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessageResponse,
}

#[derive(Deserialize)]
struct OpenAIMessageResponse {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LlmProvider for LiteRTProvider {
    async fn chat(&self, request: LlmRequest) -> Result<LlmResponse> {
        let openai_req = OpenAIRequest {
            model: request.model.clone(),
            messages: request.messages.into_iter().map(|m| {
                OpenAIMessage {
                    role: m.role,
                    content: m.content.unwrap_or_default(),
                }
            }).collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(false),
        };

        let response = self.client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&openai_req)
            .send()
            .await
            .map_err(|e| PrefrontalError::provider(format!("HTTP error: {}", e)))?;

        let openai_resp: OpenAIResponse = response.json().await
            .map_err(|e| PrefrontalError::provider(format!("Parse error: {}", e)))?;

        Ok(LlmResponse {
            id: openai_resp.id,
            model: request.model,
            choices: vec![LlmChoice {
                message: openai_resp.choices[0].message.content.clone(),
                finish_reason: Some("stop".to_string()),
            }],
            usage: LlmUsage {
                prompt_tokens: openai_resp.usage.prompt_tokens,
                completion_tokens: openai_resp.usage.completion_tokens,
                total_tokens: openai_resp.usage.total_tokens,
            },
        })
    }

    fn name(&self) -> &str {
        "litert"
    }
}
```

- [ ] **Step 2: 注册 Provider 到 Registry**

```rust
// prefrontal/src/provider_registry.rs 添加
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Ollama,
    LiteRT,  // 新增
}
```

- [ ] **Step 3: 导出模块**

```rust
// prefrontal/src/lib.rs
pub mod llm;
pub use llm::LiteRTProvider;
```

---

## Phase 3: Flutter HTTP API 改造

### 3.1 更新 PrefrontalClient 支持 Chat

**Files:**
- Modify: `shadow-mobile/lib/services/prefrontal_client.dart`

- [ ] **Step 1: 添加 Chat API 方法**

```dart
// ============ Chat APIs ============

/// 创建新会话
Future<String> createSession({String? name}) async {
  final data = await _request<Map<String, dynamic>>(
    'POST',
    '/api/sessions',
    body: {'name': name},
  );
  return data['id'] as String;
}

/// 发送消息并获取响应
Future<String> sendMessage(String sessionId, String message) async {
  final data = await _request<Map<String, dynamic>>(
    'POST',
    '/api/sessions/$sessionId/process',
    body: {'message': message},
  );
  return data['response'] as String;
}

/// 获取会话消息历史
Future<List<MessageResponse>> getSessionMessages(String sessionId) async {
  final data = await _request<List<dynamic>>(
    'GET',
    '/api/sessions/$sessionId/messages',
  );
  return data.map((m) => MessageResponse.fromJson(m)).toList();
}

/// 删除会话
Future<void> deleteSession(String sessionId) async {
  await _request('DELETE', '/api/sessions/$sessionId');
}
```

- [ ] **Step 2: 添加流式响应支持 (可选)**

```dart
/// 流式发送消息
Stream<String> sendMessageStream(String sessionId, String message) async* {
  // 使用 SSE 或 WebSocket
}
```

### 3.2 重构 Chat Screen 使用 HTTP

**Files:**
- Modify: `shadow-mobile/lib/screens/chat_screen.dart`
- Modify: `shadow-mobile/lib/providers/chat_provider.dart`

- [ ] **Step 1: 创建 ChatProvider 使用 PrefrontalClient**

```dart
// shadow-mobile/lib/providers/chat_provider.dart
class ChatState {
  final List<ChatMessage> messages;
  final bool isLoading;
  final String? error;
  final String? sessionId;

  const ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.error,
    this.sessionId,
  });
}

class ChatNotifier extends StateNotifier<ChatState> {
  final PrefrontalClient _client;

  ChatNotifier(this._client) : super(const ChatState());

  Future<void> sendMessage(String content) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      String sessionId = state.sessionId ?? await _client.createSession();

      final response = await _client.sendMessage(sessionId, content);

      state = state.copyWith(
        sessionId: sessionId,
        messages: [
          ...state.messages,
          ChatMessage(role: 'user', content: content),
          ChatMessage(role: 'assistant', content: response),
        ],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadHistory(String sessionId) async {
    state = state.copyWith(isLoading: true, sessionId: sessionId);
    final messages = await _client.getSessionMessages(sessionId);
    state = state.copyWith(
      messages: messages.map((m) => ChatMessage(
        role: m.role,
        content: m.content,
      )).toList(),
      isLoading: false,
    );
  }
}
```

- [ ] **Step 2: 更新 ChatScreen 使用 ChatNotifier**

```dart
// 在 ChatScreen 中
final chatNotifier = ref.read(chatProvider.notifier);

onPressed: () {
  chatNotifier.sendMessage(inputController.text);
}
```

---

## Phase 4: Kotlin Mobile Action Agent (A2A)

### 4.1 创建 Mobile Action Agent

**Files:**
- Create: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/agent/MobileActionAgent.kt`

- [ ] **Step 1: 定义 A2A 协议接口**

```kotlin
interface A2AAgent {
    suspend fun sendMessage(message: A2AMessage): A2AResponse
    suspend fun getCapabilities(): AgentCapabilities
}

data class A2AMessage(
    val type: String,  // "chat", "action", "query"
    val content: String,
    val metadata: Map<String, String> = emptyMap()
)

data class A2AResponse(
    val success: Boolean,
    val content: String,
    val error: String? = null
)

data class AgentCapabilities(
    val canProcessAudio: Boolean,
    val canControlUI: Boolean,
    val canAccessSensors: Boolean,
    val supportedActions: List<String>
)
```

- [ ] **Step 2: 实现 MobileActionAgent**

```kotlin
class MobileActionAgent(
    private val context: Context,
    private val prefrontalUrl: String = "http://localhost:8082"
) : A2AAgent {

    private val httpClient = OkHttpClient()
    private val json = Gson()

    override suspend fun sendMessage(message: A2AMessage): A2AResponse {
        return try {
            val request = Request.Builder()
                .url("$prefrontalUrl/api/a2a")
                .post(json.toJson(message).toRequestBody())
                .build()

            val response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: ""
            json.fromJson(body, A2AResponse::class.java)
        } catch (e: Exception) {
            A2AResponse(success = false, content = "", error = e.message)
        }
    }

    override suspend fun getCapabilities(): AgentCapabilities {
        return AgentCapabilities(
            canProcessAudio = true,
            canControlUI = true,
            canAccessSensors = true,
            supportedActions = listOf(
                "accessibility_action",
                "read_screen",
                "click_element",
                "scroll_view",
                "get_sensor_data"
            )
        )
    }
}
```

### 4.2 A2A Handler in Rust

**Files:**
- Modify: `prefrontal/src/server/a2a_handler.rs`
- Modify: `prefrontal/src/agent.rs`

- [ ] **Step 1: 扩展 A2A Message 类型**

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum A2AMessage {
    #[serde(rename = "chat")]
    Chat { content: String, metadata: Option<Map<String, String>> },
    #[serde(rename = "action")]
    Action { action: String, params: Value },
    #[serde(rename = "query")]
    Query { query: String },
}

#[derive(Serialize)]
pub struct A2AResponse {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
}
```

- [ ] **Step 2: 实现 Mobile Action 处理**

```rust
async fn handle_mobile_action(action: &str, params: Value) -> Result<String> {
    match action {
        "accessibility_action" => {
            // 调用无障碍服务
            let element_id = params["element_id"].as_str().unwrap();
            let action_type = params["action"].as_str().unwrap();
            execute_accessibility_action(element_id, action_type).await
        }
        "read_screen" => {
            // 获取屏幕内容
            read_screen_content().await
        }
        _ => Err(PrefrontalError::agent(format!("Unknown action: {}", action)))
    }
}
```

---

## Phase 5: Desktop 项目复用 (可选)

### 5.1 确保 PrefrontalClient 可复用

**Files:**
- Create: `shadow-desktop/lib/services/prefrontal_client.dart` (共享)

- [ ] **Step 1: 创建共享的 PrefrontalClient**

Flutter 共享代码结构:
```
shadow/
├── shared/
│   └── services/
│       └── prefrontal_client.dart  // 可被 mobile 和 desktop 共用
├── shadow-mobile/
│   └── lib/
└── shadow-desktop/
    └── lib/
```

---

## 依赖关系

```
Phase 1 (Kotlin OpenAI改进)
    ↓
Phase 2 (Rust LiteRT Provider)
    ↓
Phase 3 (Flutter HTTP改造) ← 需要 Phase 1+2 完成
    ↓
Phase 4 (Mobile Action Agent) ← 需要 Phase 2 完成
```

---

## 验证步骤

### 验证 OpenAI 兼容性
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"litert-local","messages":[{"role":"user","content":"测试"}]}'
```

### 验证 Rust Provider
```bash
# 在 Prefrontal 中添加 provider
curl -X POST http://localhost:8082/api/providers \
  -H "Content-Type: application/json" \
  -d '{"type":"openai","base_url":"http://localhost:8080","api_key":"test","model":"litert-local"}'
```

### 验证 Flutter Chat
```bash
# 创建会话
curl -X POST http://localhost:8082/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'

# 发送消息
curl -X POST http://localhost:8082/api/sessions/{session_id}/process \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'
```

---

## 预期结果

1. **代码复用**: Flutter 和 Desktop 都使用相同的 Rust HTTP API
2. **统一架构**: 所有 Agent 逻辑在 Rust 中，Kotlin 只负责本地推理
3. **可扩展性**: 未来添加新平台只需实现 A2A 客户端
4. **可测试性**: Rust 端可独立测试 Agent 逻辑
