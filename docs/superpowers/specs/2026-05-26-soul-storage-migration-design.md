# Soul 存储迁移到 Prefrontal 设计文档

**日期**: 2026-05-26
**状态**: 设计完成
**目标**: 将 Soul 数据存储从 Flutter 本地迁移到 Prefrontal (Rust) 服务，便于多端复用

## 背景

当前 Soul 系统存在以下问题：
- Soul 数据存储在 Flutter 本地 SQLite，无法多端共享
- Soul 版本历史由 Flutter 直接调用 Neo4j，架构不统一
- 多端（移动端、桌面端）无法同步 Soul 数据

## 目标架构

```
Flutter/桌面端                    Prefrontal (Rust)
     │                                │
     │  ──── REST API ──────────►    │
     │                                │
     │                          ┌────┴────┐
     │                          │ SoulStore│ (SQLite 持久化)
     │                          └─────────┘
     │                                │
     │                          ┌──────┴──────┐
     │                          │ Neo4j Client│ (版本历史)
     │                          └─────────────┘
```

## API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/soul/:agentId` | 获取当前 Soul |
| PUT | `/api/soul/:agentId` | 更新 Soul（用户修改） |
| POST | `/api/soul/:agentId` | 创建/更新 Soul（Agent 修改） |
| GET | `/api/soul/:agentId/history` | 获取版本历史 |
| GET | `/api/soul/:agentId/version/:versionId` | 获取特定版本 |

### 请求/响应格式

**GET /api/soul/:agentId**
```json
Response: {
  "success": true,
  "data": {
    "agentId": "chat",
    "soul": "你是一个友好的个人助理...",
    "updatedAt": "2026-05-26T10:00:00Z"
  }
}
```

**PUT /api/soul/:agentId**
```json
Request: {
  "soul": "新的 Soul 内容...",
  "source": "user",
  "reason": "用户直接编辑"
}
```

**POST /api/soul/:agentId (Agent 修改)**
```json
Request: {
  "soul": "新的 Soul 内容...",
  "source": "agent",
  "reason": "根据对话习惯自动调整",
  "conversationSummary": "3 个对话，50 条消息"
}
```

## 数据模型

### SQLite 表: souls
```sql
CREATE TABLE souls (
  agent_id TEXT PRIMARY KEY,
  soul TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Neo4j 图结构: SoulVersion
```cypher
(:SoulVersion {
  id: UUID,
  content: TEXT,
  source: "user" | "agent",
  reason: TEXT,
  conversationSummary: TEXT,
  triggerType: TEXT,
  version: INT,
  createdAt: DATETIME
})-[:triggered_by]->(:TriggerEvent)
```

## 实现计划

### Phase 1: Prefrontal Rust 侧

1. 创建 `src/soul_store.rs` - SoulStore 实现
   - SQLite 持久化
   - Neo4j 版本历史
   - 内存缓存

2. 修改 `src/server/state.rs` - 添加 SoulStore 到 AppState

3. 修改 `src/server/handlers.rs` - 添加 Soul CRUD handlers

4. 修改 `src/server/routes.rs` - 注册 Soul 路由

### Phase 2: Flutter 侧

1. 创建 `PrefrontalSoulRepository` - 实现 IAgentRepository 接口
2. 修改 `SoulService` - 通过 Prefrontal API 操作 Soul
3. 删除 `neo4j_client.dart`, `soul_history_repository.dart` - Flutter 不再直接调用 Neo4j
4. 更新 `repository_factory.dart` - 使用 PrefrontalSoulRepository

## 迁移策略

1. **向后兼容**: Flutter 保留 `IAgentRepository` 接口，只是实现改为调用 Prefrontal API
2. **数据迁移**: 首次启动时，Prefrontal 从 SQLite 读取现有 Soul 数据
3. **多端同步**: 未来可通过 Neon 实现多端实时同步

## 文件清单

### 新建文件
- `prefrontal/src/soul_store.rs`

### 修改文件
- `prefrontal/src/server/state.rs`
- `prefrontal/src/server/handlers.rs`
- `prefrontal/src/server/routes.rs`
- `prefrontal/src/lib.rs` (添加模块)
- `shadow-mobile/lib/services/prefrontal_client.dart` (添加 Soul API 方法)
- `shadow-mobile/lib/services/soul_service.dart` (改为调用 Prefrontal)
- `shadow-mobile/lib/services/database/agent_repository.dart` (简化实现)
- `shadow-mobile/lib/services/database/repository_factory.dart`
- `shadow-mobile/lib/services/neo4j/neo4j_client.dart` (删除)
- `shadow-mobile/lib/services/neo4j/soul_history_repository.dart` (删除)
- `shadow-mobile/lib/services/neo4j/soul_version_graph.dart` (删除)
