# Soul 存储迁移到 Prefrontal 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Soul 数据存储从 Flutter 本地迁移到 Prefrontal (Rust) 服务，实现多端复用

**Architecture:** Prefrontal 提供 Soul REST API，包含 SQLite 持久化和 Neo4j 版本历史。Flutter 改为调用 Prefrontal API，不直接操作数据库。

**Tech Stack:** Rust (Axum, SQLite, Neo4j HTTP Client), Flutter (Riverpod, http)

---

## Chunk 1: Prefrontal SoulStore 实现

### Files
- Create: `prefrontal/src/soul_store.rs`
- Modify: `prefrontal/src/lib.rs`
- Modify: `prefrontal/src/server/state.rs`

---

- [ ] **Step 1: 创建 soul_store.rs**

```rust
// prefrontal/src/soul_store.rs
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Soul {
    pub agent_id: String,
    pub soul: String,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulVersion {
    pub id: String,
    pub agent_id: String,
    pub content: String,
    pub source: String, // "user" | "agent"
    pub reason: Option<String>,
    pub conversation_summary: Option<String>,
    pub trigger_type: String,
    pub version: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub struct SoulStore {
    souls: RwLock<HashMap<String, Soul>>,
    versions: RwLock<HashMap<String, Vec<SoulVersion>>>,
}

impl SoulStore {
    pub fn new() -> Self {
        Self {
            souls: RwLock::new(HashMap::new()),
            versions: RwLock::new(HashMap::new()),
        }
    }

    pub fn get_soul(&self, agent_id: &str) -> Option<Soul> {
        self.souls.read().get(agent_id).cloned()
    }

    pub fn set_soul(&self, agent_id: String, soul: String, source: &str, reason: Option<String>, conversation_summary: Option<String>, trigger_type: &str) -> Soul {
        let now = chrono::Utc::now();
        let versions_count = self.versions.read().get(&agent_id).map(|v| v.len()).unwrap_or(0) as i32;

        // Create version record
        let version = SoulVersion {
            id: Uuid::new_v4().to_string(),
            agent_id: agent_id.clone(),
            content: soul.clone(),
            source: source.to_string(),
            reason,
            conversation_summary,
            trigger_type: trigger_type.to_string(),
            version: versions_count + 1,
            created_at: now,
        };

        // Store version
        let mut versions = self.versions.write();
        versions.entry(agent_id.clone())
            .or_insert_with(Vec::new)
            .push(version);

        // Update current soul
        let soul_record = Soul {
            agent_id: agent_id.clone(),
            soul,
            updated_at: now,
        };
        self.souls.write().insert(agent_id, soul_record.clone());
        soul_record
    }

    pub fn get_version_history(&self, agent_id: &str) -> Vec<SoulVersion> {
        self.versions.read().get(agent_id).cloned().unwrap_or_default()
    }

    pub fn get_version(&self, agent_id: &str, version_id: &str) -> Option<SoulVersion> {
        self.versions.read()
            .get(agent_id)
            .and_then(|versions| versions.iter().find(|v| v.id == version_id))
            .cloned()
    }
}

impl Default for SoulStore {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 2: 在 lib.rs 中添加模块**

找到 `prefrontal/src/lib.rs`，添加：
```rust
pub mod soul_store;
```

- [ ] **Step 3: 在 state.rs 中添加 SoulStore**

在 `prefrontal/src/server/state.rs`:
```rust
use crate::soul_store::SoulStore;

#[derive(Clone)]
pub struct AppState {
    // ... existing fields ...
    pub soul_store: Arc<SoulStore>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            // ... existing initialization ...
            soul_store: Arc::new(SoulStore::new()),
        }
    }
}
```

---

## Chunk 2: Prefrontal Handlers 和 Routes

### Files
- Modify: `prefrontal/src/server/handlers.rs`
- Modify: `prefrontal/src/server/routes.rs`

---

- [ ] **Step 4: 添加 Soul handlers 到 handlers.rs**

在 `prefrontal/src/server/handlers.rs` 末尾添加：

```rust
// ============ Soul Handlers ============

use crate::soul_store::{Soul, SoulVersion};

#[derive(Debug, Serialize)]
pub struct SoulResponse {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub soul: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

impl From<&Soul> for SoulResponse {
    fn from(s: &Soul) -> Self {
        Self {
            agent_id: s.agent_id.clone(),
            soul: s.soul.clone(),
            updated_at: s.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateSoulRequest {
    pub soul: String,
    pub source: String,
    pub reason: Option<String>,
    #[serde(rename = "conversationSummary")]
    pub conversation_summary: Option<String>,
    #[serde(rename = "triggerType")]
    pub trigger_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SoulVersionResponse {
    pub id: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub content: String,
    pub source: String,
    pub reason: Option<String>,
    #[serde(rename = "conversationSummary")]
    pub conversation_summary: Option<String>,
    #[serde(rename = "triggerType")]
    pub trigger_type: String,
    pub version: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl From<&SoulVersion> for SoulVersionResponse {
    fn from(v: &SoulVersion) -> Self {
        Self {
            id: v.id.clone(),
            agent_id: v.agent_id.clone(),
            content: v.content.clone(),
            source: v.source.clone(),
            reason: v.reason.clone(),
            conversation_summary: v.conversation_summary.clone(),
            trigger_type: v.trigger_type.clone(),
            version: v.version,
            created_at: v.created_at.to_rfc3339(),
        }
    }
}

pub async fn get_soul(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
) -> impl IntoResponse {
    match state.soul_store.get_soul(&agent_id) {
        Some(soul) => ApiResponse::ok(SoulResponse::from(&soul)),
        None => ApiResponse::err("Soul not found"),
    }
}

pub async fn update_soul(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
    Json(payload): Json<UpdateSoulRequest>,
) -> impl IntoResponse {
    let source = payload.source.as_str();
    let reason = payload.reason.or_else(|| {
        if source == "user" {
            Some("User directly edited Soul".to_string())
        } else {
            None
        }
    });
    let trigger_type = payload.trigger_type.unwrap_or_else(|| {
        if source == "user" { "user_edit".to_string() } else { "agent_review".to_string() }
    });

    let soul = state.soul_store.set_soul(
        agent_id,
        payload.soul,
        source,
        reason,
        payload.conversation_summary,
        &trigger_type,
    );

    ApiResponse::ok(SoulResponse::from(&soul))
}

pub async fn get_soul_history(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
) -> impl IntoResponse {
    let versions = state.soul_store.get_version_history(&agent_id);
    let version_responses: Vec<SoulVersionResponse> = versions.iter().map(SoulVersionResponse::from).collect();
    ApiResponse::ok(version_responses)
}

pub async fn get_soul_version(
    State(state): State<AppState>,
    Path((agent_id, version_id)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.soul_store.get_version(&agent_id, &version_id) {
        Some(version) => ApiResponse::ok(SoulVersionResponse::from(&version)),
        None => ApiResponse::err("Version not found"),
    }
}
```

- [ ] **Step 5: 添加 Soul routes 到 routes.rs**

在 `prefrontal/src/server/routes.rs` 添加：

```rust
.route("/api/soul/:agentId", get(get_soul))
.route("/api/soul/:agentId", put(update_soul))
.route("/api/soul/:agentId/history", get(get_soul_history))
.route("/api/soul/:agentId/version/:versionId", get(get_soul_version))
```

---

## Chunk 3: Flutter PrefrontalClient 更新

### Files
- Modify: `shadow-mobile/lib/services/prefrontal_client.dart`

---

- [ ] **Step 6: 在 PrefrontalClient 中添加 Soul API 方法**

在 `PrefrontalClient` 类中添加：

```dart
// Soul API
Future<SoulResponse?> getSoul(String agentId) async {
  try {
    final response = await _get('/api/soul/$agentId');
    if (response['success'] == true && response['data'] != null) {
      return SoulResponse.fromJson(response['data']);
    }
    return null;
  } catch (e) {
    return null;
  }
}

Future<SoulResponse?> updateSoul({
  required String agentId,
  required String soul,
  required String source,
  String? reason,
  String? conversationSummary,
  String? triggerType,
}) async {
  final body = {
    'soul': soul,
    'source': source,
    if (reason != null) 'reason': reason,
    if (conversationSummary != null) 'conversationSummary': conversationSummary,
    if (triggerType != null) 'triggerType': triggerType,
  };

  final response = await _put('/api/soul/$agentId', body);
  if (response['success'] == true && response['data'] != null) {
    return SoulResponse.fromJson(response['data']);
  }
  return null;
}

Future<List<SoulVersionResponse>> getSoulHistory(String agentId) async {
  try {
    final response = await _get('/api/soul/$agentId/history');
    if (response['success'] == true && response['data'] != null) {
      return (response['data'] as List)
          .map((v) => SoulVersionResponse.fromJson(v))
          .toList();
    }
    return [];
  } catch (e) {
    return [];
  }
}

Future<SoulVersionResponse?> getSoulVersion(String agentId, String versionId) async {
  try {
    final response = await _get('/api/soul/$agentId/version/$versionId');
    if (response['success'] == true && response['data'] != null) {
      return SoulVersionResponse.fromJson(response['data']);
    }
    return null;
  } catch (e) {
    return null;
  }
}
```

在文件末尾添加 Response 类：

```dart
class SoulResponse {
  final String agentId;
  final String soul;
  final DateTime updatedAt;

  SoulResponse({
    required this.agentId,
    required this.soul,
    required this.updatedAt,
  });

  factory SoulResponse.fromJson(Map<String, dynamic> json) {
    return SoulResponse(
      agentId: json['agentId'] as String,
      soul: json['soul'] as String,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

class SoulVersionResponse {
  final String id;
  final String agentId;
  final String content;
  final String source;
  final String? reason;
  final String? conversationSummary;
  final String triggerType;
  final int version;
  final DateTime createdAt;

  SoulVersionResponse({
    required this.id,
    required this.agentId,
    required this.content,
    required this.source,
    this.reason,
    this.conversationSummary,
    required this.triggerType,
    required this.version,
    required this.createdAt,
  });

  factory SoulVersionResponse.fromJson(Map<String, dynamic> json) {
    return SoulVersionResponse(
      id: json['id'] as String,
      agentId: json['agentId'] as String,
      content: json['content'] as String,
      source: json['source'] as String,
      reason: json['reason'] as String?,
      conversationSummary: json['conversationSummary'] as String?,
      triggerType: json['triggerType'] as String,
      version: json['version'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
```

---

## Chunk 4: Flutter SoulService 更新

### Files
- Modify: `shadow-mobile/lib/services/soul_service.dart`

---

- [ ] **Step 7: 重写 SoulService 使用 PrefrontalClient**

将 `SoulService` 改为：

```dart
import 'prefrontal_client.dart';

/// High-level service for Soul management
/// Coordinates between Flutter UI and Prefrontal API
class SoulService {
  final PrefrontalClient _client;

  SoulService({
    required PrefrontalClient client,
  }) : _client = client;

  /// Get current Soul content for an agent
  Future<String?> getCurrentSoul(String agentId) async {
    final response = await _client.getSoul(agentId);
    return response?.soul;
  }

  /// Update Soul by user directly (no review needed)
  Future<void> updateSoulByUser({
    required String agentId,
    required String newSoul,
    String? triggerType = 'user_edit',
  }) async {
    await _client.updateSoul(
      agentId: agentId,
      soul: newSoul,
      source: 'user',
      reason: 'User directly edited Soul',
      triggerType: triggerType,
    );
  }

  /// Update Soul by agent evaluation (auto-modified with reason)
  Future<void> updateSoulByAgent({
    required String agentId,
    required String newSoul,
    required String reason,
    String? conversationSummary,
    String triggerType = 'agent_review',
  }) async {
    await _client.updateSoul(
      agentId: agentId,
      soul: newSoul,
      source: 'agent',
      reason: reason,
      conversationSummary: conversationSummary,
      triggerType: triggerType,
    );
  }

  /// Get version history for UI display
  Future<List<SoulVersionResponse>> getVersionHistory(String agentId) async {
    return await _client.getSoulHistory(agentId);
  }

  /// Get specific version details
  Future<SoulVersionResponse?> getVersion(String agentId, String versionId) async {
    return await _client.getSoulVersion(agentId, versionId);
  }
}
```

---

## Chunk 5: Flutter Repository 重构

### Files
- Modify: `shadow-mobile/lib/services/database/agent_repository.dart`
- Modify: `shadow-mobile/lib/services/database/repository_factory.dart`
- Delete: `shadow-mobile/lib/services/neo4j/` (整个目录)

---

- [ ] **Step 8: 重构 agent_repository.dart 使用 PrefrontalClient**

将 `SqliteAgentRepository` 改为 `PrefrontalAgentRepository`：

```dart
import '../prefrontal_client.dart';
import 'agent_settings.dart';
import 'repositories.dart';

/// Prefrontal API implementation of IAgentRepository
/// Fetches agent data from Prefrontal server
class PrefrontalAgentRepository implements IAgentRepository {
  final PrefrontalClient _client;

  PrefrontalAgentRepository({required PrefrontalClient client})
      : _client = client;

  @override
  Future<List<AgentSettings>> getAll() async {
    // Agent list still from Prefrontal
    final agents = await _client.getAgents();
    return agents.map((a) => AgentSettings(
      id: a['id'] as String,
      name: a['name'] as String,
      description: a['description'] as String?,
      isEnabled: a['is_online'] as bool? ?? true,
      settings: {},
      soul: null, // Soul is fetched separately via SoulService
    )).toList();
  }

  @override
  Future<List<AgentSettings>> getAllAgents() => getAll();

  @override
  Future<AgentSettings?> getById(String id) async {
    final agents = await getAll();
    try {
      return agents.firstWhere((a) => a.id == id);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<AgentSettings?> getAgentById(String id) => getById(id);

  @override
  Future<void> insert(AgentSettings agent) async {
    // Not supported via Prefrontal - agents are managed server-side
    throw UnimplementedError('Use Prefrontal server to create agents');
  }

  @override
  Future<void> insertAgent(AgentSettings agent) => insert(agent);

  @override
  Future<void> update(AgentSettings agent) async {
    // Agent metadata update not supported
    throw UnimplementedError('Use Prefrontal server to update agents');
  }

  @override
  Future<void> updateAgent(AgentSettings agent) => update(agent);

  @override
  Future<void> delete(String id) async {
    throw UnimplementedError('Use Prefrontal server to delete agents');
  }

  @override
  Future<void> deleteAgent(String id) => delete(id);

  @override
  Future<void> toggleAgent(String id) async {
    throw UnimplementedError('Use Prefrontal server to toggle agents');
  }

  @override
  Future<void> initializeDefaultAgents() async {
    // No-op - agents initialized server-side
  }
}

// Alias for backward compatibility
typedef AgentRepository = PrefrontalAgentRepository;
```

- [ ] **Step 9: 更新 repository_factory.dart**

```dart
class RepositoryFactory {
  final PrefrontalClient _client;

  RepositoryFactory({required PrefrontalClient client}) : _client = client;

  IAgentRepository createAgentRepository() {
    return PrefrontalAgentRepository(client: _client);
  }

  // ... other repositories ...
}
```

- [ ] **Step 10: 删除 Neo4j 目录**

```bash
rm -rf shadow-mobile/lib/services/neo4j/
```

---

## Chunk 6: 构建验证

### Files
- Build: `prefrontal`
- Build: `shadow-mobile`

---

- [ ] **Step 11: 构建 Prefrontal**

```bash
cd /home/ibloc/Projects/prefrontal
cargo build
```

预期：无编译错误

- [ ] **Step 12: 构建 Flutter**

```bash
cd /home/ibloc/Projects/shadow/shadow-mobile
flutter build apk --debug
```

预期：构建成功

---

## 验证清单

- [ ] Prefrontal 编译通过
- [ ] Flutter 编译通过
- [ ] Soul API 路由注册成功
- [ ] Flutter 不再直接操作 SQLite/Neo4j
- [ ] Soul 数据通过 Prefrontal API 获取
