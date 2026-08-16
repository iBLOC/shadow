# Shadow Multi-Agent Orchestration System

**日期：** 2026-04-06  
**状态：** 设计中  
**参考：** [agtx](https://github.com/fynnfluegge/agtx), [OpenCode Server](https://opencode.ai/docs/zh-cn/server/)

---

## 1. 概述

Shadow 桌面端内置多 Agent 协作系统，参考 agtx 的 Kanban 工作流架构，实现自动化任务规划、执行和审查。

### 1.1 核心特性

- **多 Agent 协作**：Planner（规划）、Coordinator（协调）、Executor（执行）、Reviewer（审查）
- **OpenCode 集成**：支持本地拉起和远程连接多个并行实例
- **Git Worktree 隔离**：每个任务独立 Git 工作目录，避免冲突
- **混合审批模式**：规划阶段需审批，执行过程全自动
- **灵活模型配置**：每个 Agent 可配置本地（candle-vllm）或云端模型

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Shadow Desktop                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
│  │   Planner   │────▶│ Coordinator │────▶│   Executor  │             │
│  │   Agent     │     │   Agent     │     │ (OpenCode)  │             │
│  └─────────────┘     └─────────────┘     └─────────────┘             │
│         │                   │                   │                     │
│         │                   │                   ▼                     │
│         │                   │         ┌─────────────────┐              │
│         │                   │         │ OpenCode Server │              │
│         │                   │         │ (多实例并行)    │              │
│         │                   │         └─────────────────┘              │
│         │                   │                   │                     │
│         ▼                   ▼                   ▼                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
│  │   Reviewer  │◀────│   Review    │◀────│   Running   │             │
│  │   Agent     │     │   Phase     │     │   Phase     │             │
│  └─────────────┘     └─────────────┘     └─────────────┘             │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Settings Page: 为每个 Agent 配置模型（本地/云端）                       │
│  Task Board Page: Kanban 面板查看和审批任务                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 工作流设计

### 2.1 阶段定义

| 阶段 | 说明 | 自动化程度 |
|------|------|-----------|
| **Backlog** | 待处理任务池 | 手动创建 |
| **Planning** | Planner 分解任务 | 自动 |
| **Running** | OpenCode 执行开发 | 自动 |
| **Review** | Reviewer 审查代码 | 自动 |
| **Done** | 任务完成 | 自动 |

### 2.2 审批流程

```
                    ┌─────────────────┐
                    │     Backlog     │
                    └────────┬────────┘
                             │ 人类创建任务
                             ▼
                    ┌─────────────────┐
                    │    Planning     │◀──────────┐
                    │  Planner 分解   │           │
                    └────────┬────────┘           │
                             │                     │
              ┌──────────────┴──────────────┐    │
              │                             │    │
              ▼                             ▼    │
     ┌─────────────────┐           ┌─────────────┐ │
     │   无需审批模式   │           │   需审批    │ │
     │  autoApprove   │           │ 等待人类    │ │
     │     =true       │           │  点击"批准"  │ │
     └────────┬────────┘           └──────┬──────┘ │
              │                            │        │
              └──────────────┬─────────────┘        │
                             │                     │
                             ▼                     │
                    ┌─────────────────┐           │
                    │    Running      │           │
                    │  OpenCode 执行  │           │
                    └────────┬────────┘           │
                             │                     │
                             ▼                     │
                    ┌─────────────────┐           │
                    │    Review      │───────────┘
                    │  Reviewer 审查 │   重新规划
                    └────────┬────────┘
                             │ 审查通过
                             ▼
                    ┌─────────────────┐
                    │      Done      │
                    └─────────────────┘
```

### 2.3 审批规则

- **Planning 阶段**：必须人类审批后才能进入 Running（除非 `autoApprove=true`）
- **Running 阶段**：全自动执行，无需审批
- **Review 阶段**：审查通过则 Done，失败则回到 Planning

---

## 3. Agent 类型定义

### 3.1 内置 Agent 角色

| Agent | 类型 | 职责 | 可配置模型 |
|-------|------|------|-----------|
| **Planner** | `planner` | 任务分解、制定执行计划 | ✅ |
| **Coordinator** | `coordinator` | 管理任务流程、协调各阶段 | ✅ |
| **Executor** | `executor` | 通过 OpenCode 执行代码 | ✅ |
| **Reviewer** | `reviewer` | 代码审查、质量检查 | ✅ |

### 3.2 OpenCode Executor

| 属性 | 说明 |
|------|------|
| `type` | `opencode` |
| `instanceId` | 实例 ID（支持多实例） |
| `endpoint` | 远程地址（可选，本地用 `autoLaunch`） |
| `port` | 本地端口（默认 4096） |
| `autoLaunch` | 是否自动拉起本地服务 |
| `autoInstall` | 未安装时是否自动安装 |

### 3.3 Agent 配置接口

```typescript
interface Agent {
  id: string;
  name: string;
  type: 'planner' | 'coordinator' | 'executor' | 'reviewer' | 'opencode';
  category: 'built-in' | 'external';
  
  // 模型配置
  model?: {
    provider: string;      // 'openai' | 'anthropic' | 'local'
    modelId: string;       // 'claude-sonnet-4' | 'Qwen2.5'
    apiBase?: string;      // 自定义 API 端点
    apiKey?: string;       // 加密存储
  };
  
  // OpenCode 特定配置
  opencodeConfig?: {
    endpoint?: string;      // 远程地址
    port?: number;         // 本地端口
    autoLaunch?: boolean;  // 自动拉起
    autoInstall?: boolean;  // 自动安装
  };
  
  // 状态
  status: 'online' | 'offline' | 'busy';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 4. OpenCode Server 管理

### 4.1 本地拉起

```rust
// Rust 端命令
#[tauri::command]
async fn opencode_launch(port: u16) -> Result<OpenCodeInstance, String>;

#[tauri::command]
async fn opencode_check_installed() -> Result<bool, String>;

#[tauri::command]
async fn opencode_install() -> Result<(), String>;

#[tauri::command]
async fn opencode_stop(instance_id: String) -> Result<(), String>;
```

### 4.2 多实例管理

```rust
struct OpenCodeManager {
    instances: HashMap<String, OpenCodeInstance>,
}

struct OpenCodeInstance {
    id: String,
    process: Child,
    port: u16,
    status: InstanceStatus,
}

enum InstanceStatus {
    Starting,
    Running,
    Stopped,
    Error(String),
}
```

### 4.3 OpenCode API 交互

```rust
// 创建会话
async fn opencode_create_session(
    instance_id: String, 
    project_path: String
) -> Result<String, String>;  // 返回 session_id

// 发送消息
async fn opencode_send_message(
    instance_id: String,
    session_id: String,
    message: String,
) -> Result<OpenCodeResponse, String>;

// 获取 diff
async fn opencode_get_diff(
    instance_id: String,
    session_id: String,
) -> Result<Vec<FileDiff>, String>;

// 中止会话
async fn opencode_abort(
    instance_id: String,
    session_id: String,
) -> Result<(), String>;
```

### 4.4 自动安装逻辑

```bash
# 检测是否安装
which opencode || echo "not found"

# 安装脚本（参考 agtx install.sh）
curl -fsSL https://raw.githubusercontent.com/anomalyco/opencode/main/install.sh | sh

# 或通过 npm
npm install -g opencode-ai
```

---

## 5. Git Worktree 隔离

### 5.1 工作目录结构

```
project/
├── .shadow/
│   ├── worktrees/
│   │   ├── task-{uuid-1}/
│   │   ├── task-{uuid-2}/
│   │   └── ...
│   └── config.toml
└── .git/
```

### 5.2 Worktree 操作

```rust
#[tauri::command]
async fn worktree_create(
    task_id: String,
    base_branch: String,
) -> Result<String, String>;  // 返回 worktree 路径

#[tauri::command]
async fn worktree_delete(task_id: String) -> Result<(), String>;

#[tauri::command]
async fn worktree_sync(task_id: String) -> Result<(), String>;  // 同步变更
```

### 5.3 任务上下文

```typescript
interface TaskContext {
  taskId: string;
  worktreePath: string;
  sessionId?: string;      // OpenCode session
  branchName: string;      // 自动生成的分支名
  baseBranch: string;      // 基础分支
}
```

---

## 6. 任务数据结构

### 6.1 Task 定义

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  
  // 工作流
  phase: 'backlog' | 'planning' | 'running' | 'review' | 'done';
  
  // 规划结果
  plan?: {
    steps: PlanStep[];
    estimatedTime?: string;
    requiredAgents: string[];
  };
  
  // 执行上下文
  context: TaskContext;
  
  // 元数据
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  
  // 审批状态
  approval?: {
    required: boolean;
    approvedAt?: Date;
    approvedBy?: string;
    autoApproved: boolean;  // 无需审批模式
  };
  
  // 结果
  result?: {
    diff: FileDiff[];
    summary?: string;
    reviewComments?: string[];
  };
  
  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface PlanStep {
  order: number;
  description: string;
  agentType: 'planner' | 'executor' | 'reviewer';
  targetFile?: string;
}
```

---

## 7. 审批界面设计

### 7.1 审批面板

```
┌─────────────────────────────────────────────────────────────┐
│  📋 任务审批                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  任务: 实现用户登录功能                                       │
│  创建者: Shadow                                             │
│  创建时间: 2026-04-06 14:30                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📝 规划结果                                                 │
│                                                             │
│  步骤 1: 创建数据库迁移文件 users_table.sql                   │
│          执行者: Executor (OpenCode)                         │
│          目标文件: db/migrations/001_users.sql              │
│                                                             │
│  步骤 2: 实现后端登录 API                                    │
│          执行者: Executor (OpenCode)                         │
│          目标文件: src/api/auth/login.ts                     │
│                                                             │
│  步骤 3: 实现前端登录表单                                     │
│          执行者: Executor (OpenCode)                         │
│          目标文件: src/pages/Login.tsx                       │
│                                                             │
│  步骤 4: 编写单元测试                                         │
│          执行者: Executor (OpenCode)                         │
│          目标文件: tests/auth.test.ts                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ⏱️ 预计时间: 2 小时                                         │
│  🤖 执行者: OpenCode Instance #1                            │
│                                                             │
│  ☑️ 我确认以上规划，并授权执行                                 │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │    返回修改      │  │     批准执行     │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 设置页面 - Agent 模型配置

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Agent 配置                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Planner Agent                                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 名称: Planner                                        │   │
│  │ 状态: 🟢 在线                                        │   │
│  │                                                      │   │
│  │ 模型配置:                                             │   │
│  │ ┌────────────────────────────────────────────────┐ │   │
│  │ │ 供应商: [MiniMax          ▼]                    │ │   │
│  │ │ 模型:   [MiniMax-M2.7     ▼]                   │ │   │
│  │ │ 端点:   [https://api.minimaxi.com/v1      ]   │ │   │
│  │ └────────────────────────────────────────────────┘ │   │
│  │                                                      │   │
│  │ ☑️ 启用本地模型 fallback                             │   │
│  │    本地: [candle-vllm (Qwen2.5) ▼]                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Executor Agent (OpenCode #1)                         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 名称: OpenCode Dev 1                                 │   │
│  │ 状态: 🟢 在线                                        │   │
│  │                                                      │   │
│  │ 运行模式: [本地自动拉起 ▼]                            │   │
│  │ 端口: [4096]                                        │   │
│  │                                                      │   │
│  │ ☑️ 自动安装（如果未检测到）                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Executor Agent (OpenCode #2)                         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ...                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Reviewer Agent                                       │   │
│  │ ...                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  全局设置:                                                   │
│  ☑️ 启用无需审批模式（规划完成后自动执行）                    │
│                                                             │
│  ⌘ Worktree 基础目录: [/home/user/projects]                │
│                                                             │
│                    [保存配置]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 任务面板 (Kanban)

### 8.1 布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📋 任务面板                              [+ 新建任务]  [⚙ 设置]           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Backlog      Planning       Running       Review        Done           │
│  ┌─────┐     ┌─────┐       ┌─────┐      ┌─────┐      ┌─────┐          │
│  │     │     │     │       │     │      │     │      │     │          │
│  │ T1  │     │ T2  │       │ T3  │      │ T4  │      │ T5  │          │
│  │     │     │     │       │     │      │     │      │     │          │
│  │     │     │ ⚠️  │       │ 🔄  │      │ ✅  │      │     │          │
│  └─────┘     └─────┘       └─────┘      └─────┘      └─────┘          │
│                                                                         │
│  状态说明:                                                              │
│  ⚠️ 等待审批  🔄 执行中  ✅ 审查通过  ❌ 审查失败                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 任务卡片

```
┌─────────────────────────┐
│ 🔵 实现用户登录功能        │
│                         │
│ 优先级: 中  标签: auth   │
│ 创建: 2小时前            │
│                         │
│ 👤 Planner → OpenCode #1│
│                         │
│ ┌─────────────────────┐ │
│ │ 📝 待审批            │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

---

## 9. Rust 后端接口

### 9.1 新增 Tauri 命令

```rust
// OpenCode 管理
opencode_launch(port: u16) -> Result<OpenCodeInstance>
opencode_check_installed() -> Result<bool>
opencode_install() -> Result<()>
opencode_stop(instance_id: String) -> Result<()>
opencode_list_instances() -> Result<Vec<OpenCodeInstance>>
opencode_create_session(instance_id: String, project: String) -> Result<String>
opencode_send_message(instance_id: String, session: String, msg: String) -> Result<String>
opencode_get_diff(instance_id: String, session: String) -> Result<Vec<FileDiff>>
opencode_abort(instance_id: String, session: String) -> Result<()>

// Worktree 管理
worktree_create(task_id: String, base_branch: String) -> Result<String>
worktree_delete(task_id: String) -> Result<()>
worktree_sync(task_id: String) -> Result<()>

// Agent 配置
get_agent_config() -> Result<AgentConfig>
save_agent_config(config: AgentConfig) -> Result<()>

// 审批
approve_task(task_id: String) -> Result<()>
reject_task(task_id: String, reason: String) -> Result<()>

// 工作流
advance_task(task_id: String, to_phase: Phase) -> Result<()>
```

### 9.2 配置存储

```json
// ~/.shadow/agent-config.json
{
  "agents": [
    {
      "id": "planner-1",
      "name": "Planner",
      "type": "planner",
      "model": {
        "provider": "minimax",
        "modelId": "MiniMax-M2.7",
        "apiBase": "https://api.minimaxi.com/v1"
      }
    },
    {
      "id": "executor-1",
      "name": "OpenCode #1",
      "type": "opencode",
      "opencodeConfig": {
        "autoLaunch": true,
        "port": 4096,
        "autoInstall": true
      }
    }
  ],
  "settings": {
    "autoApprove": false,
    "worktreeBaseDir": "/home/user/projects",
    "maxParallelExecutors": 3
  }
}
```

---

## 10. 前端页面结构

### 10.1 页面列表

| 页面 | 路由 | 说明 |
|------|------|------|
| TaskBoardPage | `/tasks` | Kanban 任务面板 |
| AgentSettingsPage | `/agents` | Agent 配置 |
| ApprovalPage | `/approval/:taskId` | 审批页面 |

### 10.2 Store 结构

```typescript
// stores/agentStore.ts - 扩展
interface AgentState {
  agents: Agent[];
  configurations: Record<string, AgentConfig>;
  
  // OpenCode 实例
  opencodeInstances: OpenCodeInstance[];
  launchOpenCode: (port?: number) => Promise<void>;
  stopOpenCode: (instanceId: string) => Promise<void>;
  
  // Agent 模型配置
  updateAgentModel: (agentId: string, config: ModelConfig) => void;
  saveConfigurations: () => Promise<void>;
}

// stores/taskStore.ts - 新增
interface TaskState {
  tasks: Task[];
  currentTaskId: string | null;
  
  createTask: (task: CreateTaskInput) => Promise<void>;
  advanceTask: (taskId: string, toPhase: Phase) => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string, reason: string) => Promise<void>;
}

// stores/workflowStore.ts - 新增
interface WorkflowState {
  isRunning: boolean;
  currentTaskId: string | null;
  executorInstanceId: string | null;
  
  startWorkflow: (taskId: string) => Promise<void>;
  pauseWorkflow: () => void;
  resumeWorkflow: () => Promise<void>;
}
```

---

## 11. 依赖和安装

### 11.1 前端依赖

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "zustand": "^5.0.0",
    "react-router-dom": "^7.0.0",
    "i18next": "^24.0.0",
    "lucide-react": "^0.400.0"
  }
}
```

### 11.2 Rust 依赖

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }

[dependencies]
# Git worktree 操作
git2 = "0.19"

# 进程管理
portpicker = "0.1"
```

---

## 12. 实现优先级

### Phase 1: 核心框架
1. ✅ Agent 类型定义和 Store
2. ✅ OpenCode Server 拉起和 API 交互
3. ✅ Git Worktree 创建/删除
4. ✅ 基础 Kanban 面板

### Phase 2: 工作流
1. ✅ Planner Agent 任务分解
2. ✅ 审批界面和流程
3. ✅ Executor 执行和状态更新

### Phase 3: 高级功能
1. ⬜ 并行 OpenCode 多实例
2. ⬜ Reviewer Agent 审查
3. ⬜ 无需审批模式
4. ⬜ 一键安装 OpenCode

---

## 13. 参考资料

- [agtx GitHub](https://github.com/fynnfluegge/agtx)
- [OpenCode Server](https://opencode.ai/docs/zh-cn/server/)
- [agtx 安装脚本](https://raw.githubusercontent.com/fynnfluegge/agtx/main/install.sh)
