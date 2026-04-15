# 顶叶 (Parietal) 项目完整实现计划

> **For agentic workers:** This is a comprehensive plan. Execute in phases using superpowers:subagent-driven-development.

**Goal:** 完整复刻 Plane 项目所有核心功能

**Architecture:** Next.js + Rust 后端，PostgreSQL/Neon 数据库，微前端架构

**Tech Stack:** Next.js 14, React, TypeScript, TailwindCSS, Rust, Axum, PostgreSQL

---

## Phase 1: 基础架构 (Foundation)

### Chunk 1.1: 项目初始化

**Task 1.1.1: 创建项目结构**

```
parietal-lobe/
├── packages/
│   ├── frontend/           # Next.js 前端
│   ├── backend/           # Rust 后端
│   └── shared/           # 共享类型
├── apps/
│   └── api/             # API Server
├── docker/
└── docs/
```

**Task 1.1.2: 数据库Schema设计**

参考 Plane 的核心模型:
- Workspace (工作空间)
- Project (项目)
- Member (成员)
- User (用户)

### Chunk 1.2: 认证系统

**Task 1.2.1: 用户认证**

- 邮箱/密码登录
- OAuth (Google, GitHub, GitLab)
- Magic Link
- JWT Token

**Task 1.2.2: 权限系统**

- Workspace 成员角色 (Owner, Admin, Member, Guest)
- Project 成员角色
- 资源级别的权限控制

---

## Phase 2: Issues 核心功能

### Chunk 2.1: Issue 数据模型

```rust
// Issue
struct Issue {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    state_id: Uuid,
    name: String,           // Issue 标题
    description: Option<String>,  // Rich Text
    priority: Priority,      // urgent, high, medium, low, none
    target_date: Option<DateTime>,
    start_date: Option<DateTime>,
    created_at: DateTime,
    updated_at: DateTime,
}

// Issue Label
struct Label {
    id: Uuid,
    name: String,
    color: String,
    workspace_id: Uuid,
}

// Issue Relation (关联)
struct IssueRelation {
    id: Uuid,
    issue_id: Uuid,
    related_issue_id: Uuid,
    relation_type: String, // blocks, relates to, duplicates
}

// Issue Subtask
struct IssueSubTask {
    id: Uuid,
    parent_issue_id: Uuid,
    child_issue_id: Uuid,
}
```

### Chunk 2.2: Issue CRUD API

| Method | Endpoint | 功能 |
|--------|----------|------|
| POST | /api/v1/workspaces/{id}/projects/{id}/issues | 创建 Issue |
| GET | /api/v1/workspaces/{id}/projects/{id}/issues | 列表 Issue |
| GET | /api/v1/workspaces/{id}/projects/{id}/issues/{id} | 详情 |
| PATCH | /api/v1/workspaces/{id}/projects/{id}/issues/{id} | 更新 |
| DELETE | /api/v1/workspaces/{id}/projects/{id}/issues/{id} | 删除 |
| POST | /api/v1/workspaces/{id}/projects/{id}/issues/{id}/comments | 评论 |
| POST | /api/v1/workspaces/{id}/projects/{id}/issues/{id}/labels | 标签 |

### Chunk 2.3: Issue 前端页面

- Issue 列表页 (Kanban, List, Table, Calendar 视图)
- Issue 详情页
- Issue 创建/编辑弹窗
- Rich Text Editor (描述)

---

## Phase 3: Cycles (Sprint)

### Chunk 3.1: Cycle 数据模型

```rust
struct Cycle {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    name: String,
    description: Option<String>,
    start_date: Option<DateTime>,
    end_date: Option<DateTime>,
    status: CycleStatus, // upcoming, active, completed
    created_at: DateTime,
}

struct CycleIssue {
    id: Uuid,
    cycle_id: Uuid,
    issue_id: Uuid,
    created_at: DateTime,
}
```

### Chunk 3.2: Cycle 功能

- 创建/编辑/删除 Cycle
- 将 Issue 分配到 Cycle
- Burndown Chart (燃尽图)
- Cycle 进度视图
- 拖拽分配 Issue

---

## Phase 4: Modules

### Chunk 4.1: Module 数据模型

```rust
struct Module {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    name: String,
    description: Option<String>,
    status: ModuleStatus, // planned, in_progress, completed
    start_date: Option<DateTime>,
    target_date: Option<DateTime>,
    created_at: DateTime,
}

struct ModuleMember {
    id: Uuid,
    module_id: Uuid,
    member_id: Uuid,
}

struct ModuleIssue {
    id: Uuid,
    module_id: Uuid,
    issue_id: Uuid,
}
```

### Chunk 4.2: Module 功能

- 创建/编辑/删除 Module
- Module 成员管理
- Module 进度视图

---

## Phase 5: Views

### Chunk 5.1: View 数据模型

```rust
struct View {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    name: String,
    description: Option<String>,
    view_type: ViewType, // kanban, list, table, calendar, gantt
    filter_data: Json,  // 保存的过滤条件
    sort_data: Json,    // 排序条件
    group_by: Option<String>,
    created_by: Uuid,
    is_public: bool,
}

struct ViewFavorite {
    id: Uuid,
    view_id: Uuid,
    user_id: Uuid,
}
```

### Chunk 5.2: View 功能

- 创建/编辑/删除 View
- 过滤器 (状态, 负责人, 标签, 日期等)
- 排序
- 分组
- 保存视图
- 公开/私有视图

---

## Phase 6: Pages (Wiki)

### Chunk 6.1: Page 数据模型

```rust
struct Page {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Option<Uuid>,
    name: String,
    content: Json,        // Rich Text Content (Block Editor)
    icon: Option<String>,
    cover_image: Option<String>,
    parent_id: Option<Uuid>,  // 层级
    created_by: Uuid,
    created_at: DateTime,
    updated_at: DateTime,
}

struct PageFavorite {
    id: Uuid,
    page_id: Uuid,
    user_id: Uuid,
}
```

### Chunk 6.2: Pages 功能

- 创建/编辑/删除 Page
- Block Editor (类似 Notion)
- Page 层级 (父子)
- 收藏
- 模板

---

## Phase 7: Analytics

### Chunk 7.1: Analytics 数据模型

```rust
struct AnalyticsView {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Option<Uuid>,
    name: String,
    chart_type: ChartType,
    data_config: Json,
    created_by: Uuid,
}

enum ChartType {
    Bar,
    Line,
    Pie,
    Table,
    Number,
}
```

### Chunk 7.2: Analytics 功能

- Workspace 级别分析
- Project 级别分析
- 预置图表
- 自定义图表

---

## Phase 8: Webhooks

### Chunk 8.1: Webhook 数据模型

```rust
struct Webhook {
    id: Uuid,
    workspace_id: Uuid,
    name: String,
    url: String,
    secret: String,
    events: Vec<String>, // issue.created, issue.updated, etc.
    is_active: bool,
    created_by: Uuid,
}

struct WebhookLog {
    id: Uuid,
    webhook_id: Uuid,
    event: String,
    payload: Json,
    response_status: Option<i32>,
    response_body: Option<String>,
    created_at: DateTime,
}
```

### Chunk 8.2: Webhook 功能

- 创建/编辑/删除 Webhook
- 事件触发
- 日志记录
- 签名验证

---

## Phase 9: File Storage

### Chunk 9.1: File 数据模型

```rust
struct File {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Option<Uuid>,
    name: String,
    size: i64,
    mime_type: String,
    storage_type: StorageType, // local, s3
    url: String,
    uploaded_by: Uuid,
    created_at: DateTime,
}
```

### Chunk 9.2: File 功能

- 文件上传 (拖拽)
- 文件预览
- 文件删除
- 本地存储 / S3 存储

---

## 实施顺序

1. **Phase 1**: 基础架构 (已完成部分)
2. **Phase 2**: Issues (最核心)
3. **Phase 3**: Cycles
4. **Phase 4**: Modules
5. **Phase 5**: Views
6. **Phase 6**: Pages
7. **Phase 7**: Analytics
8. **Phase 8**: Webhooks
9. **Phase 9**: File Storage

---

## QA 验证

每个 Phase 需要验证:
- [ ] API 端点正确响应
- [ ] 前端页面正确渲染
- [ ] 数据库操作正常
- [ ] 权限控制正确
- [ ] 集成测试通过
