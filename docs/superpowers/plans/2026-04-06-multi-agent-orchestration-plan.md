# Multi-Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Shadow 桌面端的多 Agent 协作系统，支持 Planner/Coordinator/Executor/Reviewer 工作流，集成 OpenCode 多实例执行和 Git Worktree 隔离。

**Architecture:** 
- 前端：React 19 + Zustand，新增 TaskBoardPage、ApprovalPage、AgentSettingsPage
- 后端：Rust Tauri，新增 OpenCode Manager、Worktree Manager、Agent Config
- 工作流：Backlog → Planning → [审批] → Running → Review → Done

**Tech Stack:** 
- Frontend: React 19, Zustand, React Router 7, i18next
- Backend: Rust, Tauri v2, git2, reqwest, tokio
- External: OpenCode Server API, Git Worktree

---

## Phase 1: 核心框架

### Chunk 1: 类型定义和 Store 扩展

**Files:**
- Modify: `shadow-desktop/src/types/index.ts`
- Create: `shadow-desktop/src/stores/taskStore.ts`
- Create: `shadow-desktop/src/stores/workflowStore.ts`
- Modify: `shadow-desktop/src/stores/agentStore.ts`

- [ ] **Step 1: 添加 Agent 类型扩展**

在 `types/index.ts` 中添加：
```typescript
// Agent 类型定义扩展
export type AgentType = 'planner' | 'coordinator' | 'executor' | 'reviewer' | 'opencode';

export interface AgentModelConfig {
  provider: string;
  modelId: string;
  apiBase?: string;
  apiKey?: string;
}

export interface OpenCodeConfig {
  endpoint?: string;
  port?: number;
  autoLaunch?: boolean;
  autoInstall?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  category: 'built-in' | 'external';
  model?: AgentModelConfig;
  opencodeConfig?: OpenCodeConfig;
  status: 'online' | 'offline' | 'busy';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Task 类型定义
export type TaskPhase = 'backlog' | 'planning' | 'running' | 'review' | 'done';

export interface PlanStep {
  order: number;
  description: string;
  agentType: AgentType;
  targetFile?: string;
}

export interface TaskContext {
  taskId: string;
  worktreePath: string;
  sessionId?: string;
  branchName: string;
  baseBranch: string;
}

export interface TaskApproval {
  required: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  autoApproved: boolean;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  diff: string;
}

export interface TaskResult {
  diff: FileDiff[];
  summary?: string;
  reviewComments?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  phase: TaskPhase;
  plan?: {
    steps: PlanStep[];
    estimatedTime?: string;
    requiredAgents: string[];
  };
  context: TaskContext;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  approval?: TaskApproval;
  result?: TaskResult;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// OpenCode 实例类型
export interface OpenCodeInstance {
  id: string;
  port: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  processId?: number;
  error?: string;
}
```

- [ ] **Step 2: 创建 taskStore.ts**

```typescript
// shadow-desktop/src/stores/taskStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskPhase, TaskApproval } from '../types';

interface TaskState {
  tasks: Task[];
  currentTaskId: string | null;
  isLoading: boolean;
  error: string | null;
  
  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setCurrentTask: (id: string | null) => void;
  advanceTask: (taskId: string, toPhase: TaskPhase) => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string, reason: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      currentTaskId: null,
      isLoading: false,
      error: null,
      
      createTask: async (taskInput) => {
        const task: Task = {
          ...taskInput,
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
      },
      
      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
        ),
      })),
      
      deleteTask: (id) => set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
      })),
      
      setCurrentTask: (id) => set({ currentTaskId: id }),
      
      advanceTask: async (taskId, toPhase) => {
        const task = get().tasks.find((t) => t.id === taskId);
        if (!task) return;
        
        // 调用 Rust 后端推进任务阶段
        if (toPhase === 'planning') {
          await invoke('workflow_start_planning', { taskId });
        } else if (toPhase === 'running') {
          await invoke('workflow_start_execution', { taskId });
        } else if (toPhase === 'review') {
          await invoke('workflow_start_review', { taskId });
        } else if (toPhase === 'done') {
          await invoke('workflow_complete_task', { taskId });
        }
        
        get().updateTask(taskId, { phase: toPhase });
      },
      
      approveTask: async (taskId) => {
        await invoke('approve_task', { taskId });
        get().updateTask(taskId, {
          approval: { required: true, approvedAt: new Date(), autoApproved: false },
          phase: 'running',
        });
      },
      
      rejectTask: async (taskId, reason) => {
        await invoke('reject_task', { taskId, reason });
        get().updateTask(taskId, {
          phase: 'planning', // 回到规划阶段
        });
      },
      
      fetchTasks: async () => {
        set({ isLoading: true });
        try {
          const tasks = await invoke<Task[]>('list_tasks');
          set({ tasks, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },
    }),
    { name: 'shadow-task-storage' }
  )
);
```

- [ ] **Step 3: 创建 workflowStore.ts**

```typescript
// shadow-desktop/src/stores/workflowStore.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { OpenCodeInstance } from '../types';

interface WorkflowState {
  isRunning: boolean;
  currentTaskId: string | null;
  executorInstanceId: string | null;
  autoApprove: boolean;
  worktreeBaseDir: string;
  maxParallelExecutors: number;
  
  // OpenCode 实例管理
  opencodeInstances: OpenCodeInstance[];
  
  launchOpenCode: (port?: number) => Promise<string>;
  stopOpenCode: (instanceId: string) => Promise<void>;
  checkOpenCodeInstalled: () => Promise<boolean>;
  installOpenCode: () => Promise<void>;
  
  // 工作流控制
  setAutoApprove: (enabled: boolean) => void;
  setWorktreeBaseDir: (dir: string) => void;
  startWorkflow: (taskId: string) => Promise<void>;
  pauseWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  isRunning: false,
  currentTaskId: null,
  executorInstanceId: null,
  autoApprove: false,
  worktreeBaseDir: '',
  maxParallelExecutors: 3,
  opencodeInstances: [],
  
  launchOpenCode: async (port = 4096) => {
    const instanceId = await invoke<string>('opencode_launch', { port });
    const instance: OpenCodeInstance = {
      id: instanceId,
      port,
      status: 'starting',
    };
    set((state) => ({
      opencodeInstances: [...state.opencodeInstances, instance],
    }));
    return instanceId;
  },
  
  stopOpenCode: async (instanceId) => {
    await invoke('opencode_stop', { instanceId });
    set((state) => ({
      opencodeInstances: state.opencodeInstances.map((i) =>
        i.id === instanceId ? { ...i, status: 'stopped' as const } : i
      ),
    }));
  },
  
  checkOpenCodeInstalled: async () => {
    return invoke<boolean>('opencode_check_installed');
  },
  
  installOpenCode: async () => {
    await invoke('opencode_install');
  },
  
  setAutoApprove: (enabled) => set({ autoApprove: enabled }),
  setWorktreeBaseDir: (dir) => set({ worktreeBaseDir: dir }),
  
  startWorkflow: async (taskId) => {
    set({ isRunning: true, currentTaskId: taskId });
  },
  
  pauseWorkflow: () => set({ isRunning: false, currentTaskId: null }),
}));
```

- [ ] **Step 4: 扩展 agentStore.ts**

添加 OpenCode 实例管理和 Agent 模型配置方法到现有的 `agentStore.ts`

- [ ] **Step 5: 验证类型编译**

Run: `cd shadow-desktop && pnpm tsc --noEmit`
Expected: 无错误

---

### Chunk 2: Rust 后端 - OpenCode Manager

**Files:**
- Create: `shadow-desktop/src-tauri/src/opencode_manager.rs`
- Modify: `shadow-desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 opencode_manager.rs**

```rust
// shadow-desktop/src-tauri/src/opencode_manager.rs
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use portpicker::pick_unused_port;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeInstance {
    pub id: String,
    pub port: u16,
    pub status: InstanceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InstanceStatus {
    Starting,
    Running,
    Stopped,
    Error { message: String },
}

#[derive(Default)]
pub struct OpenCodeManager {
    instances: Arc<Mutex<HashMap<String, OpenCodeInstance>>>,
}

impl OpenCodeManager {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub async fn launch(&self, port: Option<u16>) -> Result<OpenCodeInstance, String> {
        let port = port.unwrap_or_else(|| pick_unused_port().unwrap_or(4096));
        let id = uuid::Uuid::new_v4().to_string();
        
        // 检查 opencode 是否安装
        if !Self::check_installed().await {
            return Err("OpenCode is not installed. Use opencode_install first.".to_string());
        }
        
        // 启动 opencode serve
        let mut child = Command::new("opencode")
            .args(["serve", "--port", &port.to_string()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn opencode: {}", e))?;
        
        let instance = OpenCodeInstance {
            id: id.clone(),
            port,
            status: InstanceStatus::Starting,
            process_id: Some(child.id()),
        };
        
        let mut instances = self.instances.lock().await;
        instances.insert(id.clone(), instance);
        
        Ok(OpenCodeInstance {
            id,
            port,
            status: InstanceStatus::Running,
            process_id: None,
        })
    }
    
    pub async fn check_installed() -> bool {
        Command::new("opencode")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    pub async fn install() -> Result<(), String> {
        // 使用官方安装脚本
        let output = Command::new("sh")
            .args(["-c", "curl -fsSL https://raw.githubusercontent.com/anomalyco/opencode/main/install.sh | sh"])
            .output()
            .await
            .map_err(|e| format!("Install script failed: {}", e))?;
        
        if !output.status.success() {
            return Err("Installation failed".to_string());
        }
        Ok(())
    }
    
    pub async fn stop(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().await;
        if let Some(instance) = instances.get_mut(id) {
            if let Some(pid) = instance.process_id {
                // 发送 SIGTERM
                #[cfg(unix)]
                {
                    Command::new("kill")
                        .arg(pid.to_string())
                        .output()
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            instance.status = InstanceStatus::Stopped;
        }
        Ok(())
    }
    
    pub async fn list_instances(&self) -> Vec<OpenCodeInstance> {
        let instances = self.instances.lock().await;
        instances.values().cloned().collect()
    }
    
    pub async fn create_session(&self, instance_id: &str, project_path: &str) -> Result<String, String> {
        // 调用 OpenCode API 创建会话
        let instance = self.instances.lock().await;
        let inst = instance.get(instance_id).ok_or("Instance not found")?;
        
        let url = format!("http://127.0.0.1:{}/session", inst.port);
        let client = reqwest::Client::new();
        
        #[derive(Serialize)]
        struct CreateSessionRequest {
            title: String,
        }
        
        #[derive(Deserialize)]
        struct CreateSessionResponse {
            id: String,
        }
        
        let resp = client.post(&url)
            .json(&CreateSessionRequest { title: "task".to_string() })
            .send()
            .await
            .map_err(|e| e.to_string())?;
        
        if !resp.status().is_success() {
            return Err(format!("API error: {}", resp.status()));
        }
        
        let session: CreateSessionResponse = resp.json().await
            .map_err(|e| e.to_string())?;
        
        Ok(session.id)
    }
    
    pub async fn send_message(&self, instance_id: &str, session_id: &str, message: &str) -> Result<String, String> {
        let instance = self.instances.lock().await;
        let inst = instance.get(instance_id).ok_or("Instance not found")?;
        
        let url = format!("http://127.0.0.1:{}/session/{}/message", inst.port, session_id);
        let client = reqwest::Client::new();
        
        #[derive(Serialize)]
        struct MessageRequest {
            parts: Vec<serde_json::Value>,
        }
        
        let resp = client.post(&url)
            .json(&MessageRequest {
                parts: vec![serde_json::json!({ "type": "text", "text": message })],
            })
            .send()
            .await
            .map_err(|e| e.to_string())?;
        
        if !resp.status().is_success() {
            return Err(format!("API error: {}", resp.status()));
        }
        
        #[derive(Deserialize)]
        struct MessageResponse {
            info: serde_json::Value,
        }
        
        let result: MessageResponse = resp.json().await
            .map_err(|e| e.to_string())?;
        
        Ok(serde_json::to_string(&result.info).unwrap_or_default())
    }
}
```

- [ ] **Step 2: 在 lib.rs 中添加命令**

在 `lib.rs` 中添加：
```rust
mod opencode_manager;

use opencode_manager::OpenCodeManager;

struct AppState {
    // ... existing fields
    opencode_manager: Arc<OpenCodeManager>,
}

// 在 run() 中初始化
let app_state = AppState {
    // ... existing fields
    opencode_manager: Arc::new(OpenCodeManager::new()),
};

// 添加 Tauri 命令
#[tauri::command]
async fn opencode_launch(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<String, String> {
    let instance = state.opencode_manager.launch(port).await?;
    Ok(instance.id)
}

#[tauri::command]
async fn opencode_check_installed() -> Result<bool, String> {
    Ok(OpenCodeManager::check_installed().await)
}

#[tauri::command]
async fn opencode_install() -> Result<(), String> {
    OpenCodeManager::install().await
}

#[tauri::command]
async fn opencode_stop(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    state.opencode_manager.stop(&instance_id).await
}

#[tauri::command]
async fn opencode_list_instances(
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeInstance>, String> {
    Ok(state.opencode_manager.list_instances().await)
}

#[tauri::command]
async fn opencode_create_session(
    state: State<'_, AppState>,
    instance_id: String,
    project_path: String,
) -> Result<String, String> {
    state.opencode_manager.create_session(&instance_id, &project_path).await
}

#[tauri::command]
async fn opencode_send_message(
    state: State<'_, AppState>,
    instance_id: String,
    session_id: String,
    message: String,
) -> Result<String, String> {
    state.opencode_manager.send_message(&instance_id, &session_id, &message).await
}

// 在 invoke_handler 中注册
.opencode_launch
.opencode_check_installed
.opencode_install
.opencode_stop
.opencode_list_instances
.opencode_create_session
.opencode_send_message
```

- [ ] **Step 3: 添加 Rust 依赖**

在 `shadow-desktop/src-tauri/Cargo.toml` 中添加：
```toml
portpicker = "0.1"
uuid = { version = "0.8", features = ["v4"] }
```

- [ ] **Step 4: 验证 Rust 编译**

Run: `cd shadow-desktop/src-tauri && cargo check`
Expected: 无错误

---

### Chunk 3: Rust 后端 - Worktree Manager

**Files:**
- Create: `shadow-desktop/src-tauri/src/worktree_manager.rs`
- Modify: `shadow-desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 worktree_manager.rs**

```rust
// shadow-desktop/src-tauri/src/worktree_manager.rs
use std::path::Path;
use git2::Repository;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub task_id: String,
    pub path: String,
    pub branch_name: String,
    pub base_branch: String,
}

#[derive(Default)]
pub struct WorktreeManager {
    worktrees: Arc<Mutex<std::collections::HashMap<String, WorktreeInfo>>>,
}

impl WorktreeManager {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub async fn create(
        &self,
        task_id: &str,
        repo_path: &str,
        base_branch: Option<&str>,
    ) -> Result<WorktreeInfo, String> {
        let repo = Repository::open(repo_path)
            .map_err(|e| format!("Failed to open repo: {}", e))?;
        
        // 确定基础分支
        let base_branch = base_branch.unwrap_or("main");
        
        // 生成 worktree 路径和分支名
        let worktree_path = format!(".shadow/worktrees/task-{}", task_id);
        let branch_name = format!("task/{}/{}", task_id, uuid::Uuid::new_v4().to_string()[..8].to_string());
        
        // 创建 worktree
        let (wt, _) = repo.worktree(&branch_name, &worktree_path, Some(base_branch))
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        
        let info = WorktreeInfo {
            task_id: task_id.to_string(),
            path: worktree_path,
            branch_name: branch_name.clone(),
            base_branch: base_branch.to_string(),
        };
        
        let mut worktrees = self.worktrees.lock().await;
        worktrees.insert(task_id.to_string(), info.clone());
        
        Ok(info)
    }
    
    pub async fn delete(&self, task_id: &str) -> Result<(), String> {
        let worktrees = self.worktrees.lock().await;
        let info = worktrees.get(task_id).ok_or("Worktree not found")?;
        
        // 删除 worktree 目录
        std::fs::remove_dir_all(&info.path)
            .map_err(|e| format!("Failed to remove worktree: {}", e))?;
        
        drop(worktrees);
        
        let mut worktrees = self.worktrees.lock().await;
        worktrees.remove(task_id);
        
        Ok(())
    }
    
    pub async fn get(&self, task_id: &str) -> Option<WorktreeInfo> {
        let worktrees = self.worktrees.lock().await;
        worktrees.get(task_id).cloned()
    }
    
    pub async fn list(&self) -> Vec<WorktreeInfo> {
        let worktrees = self.worktrees.lock().await;
        worktrees.values().cloned().collect()
    }
}
```

- [ ] **Step 2: 在 lib.rs 中集成 WorktreeManager**

添加命令：
```rust
#[tauri::command]
async fn worktree_create(
    state: State<'_, AppState>,
    task_id: String,
    repo_path: String,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    state.worktree_manager.create(&task_id, &repo_path, base_branch.as_deref()).await
}

#[tauri::command]
async fn worktree_delete(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    state.worktree_manager.delete(&task_id).await
}

#[tauri::command]
async fn worktree_get(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Option<WorktreeInfo>, String> {
    Ok(state.worktree_manager.get(&task_id).await)
}
```

- [ ] **Step 3: 验证编译**

Run: `cd shadow-desktop/src-tauri && cargo check`
Expected: 无错误

---

## Phase 2: 前端页面

### Chunk 4: TaskBoardPage (Kanban 面板)

**Files:**
- Create: `shadow-desktop/src/pages/TaskBoardPage.tsx`
- Create: `shadow-desktop/src/pages/TaskBoardPage.css`

- [ ] **Step 1: 创建 TaskBoardPage.tsx**

实现 5 列 Kanban 面板（Backlog, Planning, Running, Review, Done），每列显示任务卡片，支持拖拽（可选）和任务创建。

- [ ] **Step 2: 添加路由**

在 `App.tsx` 中添加路由：
```tsx
<Route path="/tasks" element={<TaskBoardPage />} />
```

- [ ] **Step 3: 验证页面渲染**

Run: `cd shadow-desktop && pnpm dev`
Expected: 访问 /tasks 显示 Kanban 面板

---

### Chunk 5: AgentSettingsPage (Agent 配置)

**Files:**
- Create: `shadow-desktop/src/pages/AgentSettingsPage.tsx`
- Create: `shadow-desktop/src/pages/AgentSettingsPage.css`

- [ ] **Step 1: 创建 AgentSettingsPage.tsx**

实现：
- 每个 Agent 的模型配置（供应商、模型、API 端点）
- OpenCode 实例配置（端口、自动拉起、自动安装）
- 全局设置（autoApprove、worktree 目录）

- [ ] **Step 2: 添加 i18n 翻译**

在 `zh-CN.json` 和 `en-US.json` 中添加必要的翻译 key

- [ ] **Step 3: 验证页面和国际化**

Run: `cd shadow-desktop && pnpm build`
Expected: 构建通过，翻译完整

---

### Chunk 6: ApprovalPage (审批页面)

**Files:**
- Create: `shadow-desktop/src/pages/ApprovalPage.tsx`
- Create: `shadow-desktop/src/pages/ApprovalPage.css`

- [ ] **Step 1: 创建 ApprovalPage.tsx**

实现：
- 显示 Planner 生成的规划结果
- 任务步骤列表
- 批准/拒绝按钮
- 预计时间和执行者信息

- [ ] **Step 2: 添加路由**

```tsx
<Route path="/approval/:taskId" element={<ApprovalPage />} />
```

- [ ] **Step 3: 验证审批流程**

---

## Phase 3: 工作流集成

### Chunk 7: Planner Agent 集成

**Files:**
- Modify: `shadow-desktop/src-tauri/src/lib.rs`
- Modify: `shadow-desktop/src/stores/taskStore.ts`

- [ ] **Step 1: 实现 workflow_start_planning 命令**

调用 Planner 模型，生成任务分解

- [ ] **Step 2: 实现审批后自动进入 Running**

如果 autoApprove=true，规划完成自动推进

- [ ] **Step 3: OpenCode 执行集成**

调用 opencode_send_message 执行开发任务

---

### Chunk 8: 完整工作流测试

- [ ] **Step 1: 创建测试任务**

Run: 在 TaskBoardPage 创建新任务

- [ ] **Step 2: 验证 Planning 阶段**

Expected: Planner 生成规划步骤

- [ ] **Step 3: 验证审批流程**

Expected: 显示审批界面，批准后进入 Running

- [ ] **Step 4: 验证 OpenCode 执行**

Expected: 创建 worktree，OpenCode 执行开发

---

## 文件清单

### 新建文件
```
shadow-desktop/src/stores/taskStore.ts
shadow-desktop/src/stores/workflowStore.ts
shadow-desktop/src/pages/TaskBoardPage.tsx
shadow-desktop/src/pages/TaskBoardPage.css
shadow-desktop/src/pages/AgentSettingsPage.tsx
shadow-desktop/src/pages/AgentSettingsPage.css
shadow-desktop/src/pages/ApprovalPage.tsx
shadow-desktop/src/pages/ApprovalPage.css
shadow-desktop/src-tauri/src/opencode_manager.rs
shadow-desktop/src-tauri/src/worktree_manager.rs
docs/superpowers/plans/2026-04-06-multi-agent-orchestration-plan.md
```

### 修改文件
```
shadow-desktop/src/types/index.ts
shadow-desktop/src/stores/agentStore.ts
shadow-desktop/src/App.tsx
shadow-desktop/src-tauri/src/lib.rs
shadow-desktop/src-tauri/Cargo.toml
shadow-desktop/src/i18n/zh-CN.json
shadow-desktop/src/i18n/en-US.json
```

---

## 实施顺序

1. **Chunk 1**: 类型定义和 Store（前端基础）
2. **Chunk 2**: OpenCode Manager（Rust 核心）
3. **Chunk 3**: Worktree Manager（Rust 核心）
4. **Chunk 4**: TaskBoardPage（Kanban 面板）
5. **Chunk 5**: AgentSettingsPage（配置页面）
6. **Chunk 6**: ApprovalPage（审批页面）
7. **Chunk 7**: Planner 集成
8. **Chunk 8**: 完整工作流测试
