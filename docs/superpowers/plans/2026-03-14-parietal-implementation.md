# 顶叶 (Parietal) 项目实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建顶叶任务规划模块的基础框架，包括 Next.js 前端和 Rust 后端的完整项目结构

**Architecture:** 采用 monorepo 结构，前端使用 Next.js App Router，后端使用 Rust Axum，通过 HTTP/WebSocket 与前额叶通讯，嵌入海马体作为记忆层

**Tech Stack:** Next.js 14, React, TypeScript, TailwindCSS, Rust, Axum, Tokio, PostgreSQL, tokio-postgres

---

## Chunk 1: 项目基础结构搭建

### Task 1: 创建 Monorepo 基础配置

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `README.md`
- Create: `.gitignore`

- [ ] **Step 1: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "parietal",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

- [ ] **Step 3: 创建 turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    }
  }
}
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
.next/
dist/
target/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: add monorepo基础配置"
```

---

### Task 2: 创建 packages 目录结构

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/backend/Cargo.toml`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/next.config.js`

- [ ] **Step 1: 创建 frontend package.json**

```json
{
  "name": "@parietal/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next": "14.1.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "zod": "^3.22.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0"
  }
}
```

- [ ] **Step 2: 创建 backend Cargo.toml**

```toml
[package]
name = "parietal-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio-postgres = "0.7"
bb8 = "0.8"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: 创建 next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@parietal/shared'],
}

module.exports = nextConfig
```

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "chore: 创建packages目录结构"
```

---

## Chunk 2: 后端基础架构

### Task 3: 创建 Rust 后端入口和基础结构

**Files:**
- Create: `packages/backend/src/main.rs`
- Create: `packages/backend/src/lib.rs`
- Create: `packages/backend/src/api/mod.rs`
- Create: `packages/backend/src/models/mod.rs`
- Create: `packages/backend/src/config.rs`

- [ ] **Step 1: 创建 main.rs**

```rust
use parietal_backend::run;

#[tokio::main]
async fn main() {
    run().await;
}
```

- [ ] **Step 2: 创建 lib.rs**

```rust
pub mod api;
pub mod config;
pub mod models;

use axum::{Router, routing::get};
use tower_http::cors::{CorsLayer, Any};
use tracing_subscriber;

pub async fn run() {
    tracing_subscriber::fmt::init();
    
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    let app = Router::new()
        .route("/health", get(health_check))
        .layer(cors);
    
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("Server running on {}", listener.local_addr().unwrap());
    
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}
```

- [ ] **Step 3: 创建 config.rs**

```rust
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub hippocampus_enabled: bool,
    pub prefrontal_ws_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgresql://localhost:5432/parietal".to_string()),
            hippocampus_enabled: std::env::var("HIPPOCAMPUS_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            prefrontal_ws_url: std::env::var("PREFRONTAL_WS_URL")
                .unwrap_or_else(|_| "ws://localhost:8081".to_string()),
        }
    }
}
```

- [ ] **Step 4: 创建 api/mod.rs**

```rust
pub mod tasks;
pub mod planning;
```

- [ ] **Step 5: 创建 models/mod.rs**

```rust
pub mod task;
pub mod plan;
```

- [ ] **Step 6: 创建 task.rs**

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: Priority,
    pub assignee: Option<String>,
    pub result: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Planning,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
    Urgent,
}
```

- [ ] **Step 7: 创建 plan.rs**

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: Uuid,
    pub goal: String,
    pub tasks: Vec<PlannedTask>,
    pub context: String,
    pub status: PlanStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedTask {
    pub title: String,
    pub description: String,
    pub dependencies: Vec<Uuid>,
    pub estimated_duration: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlanStatus {
    Draft,
    Planned,
    Running,
    Completed,
    Failed,
}
```

- [ ] **Step 8: 测试编译**

```bash
cd packages/backend && cargo check
```

Expected: 编译成功，无错误

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/
git commit -feat: 添加后端基础架构"
```

---

### Task 4: 创建数据库 Schema 和连接

**Files:**
- Create: `packages/backend/src/db/mod.rs`
- Create: `packages/backend/src/db/schema.rs`
- Create: `packages/backend/migrations/001_initial.sql`

- [ ] **Step 1: 创建 db/mod.rs**

```rust
use tokio_postgres::{NoTls, Row};
use bb8::Pool;
use crate::config::Config;

pub struct Db {
    pool: Pool<NoTls>,
}

impl Db {
    pub async fn new(config: &Config) -> Result<Self, Box<dyn std::error::Error>> {
        let (client, connection) = tokio_postgres::connect(&config.database_url, NoTls).await?;
        
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("Database connection error: {}", e);
            }
        });
        
        let pool = Pool::builder()
            .max_connections(10)
            .build(client)
            .await?;
        
        Ok(Self { pool })
    }
    
    pub fn pool(&self) -> &Pool<NoTls> {
        &self.pool
    }
}
```

- [ ] **Step 2: 创建 migrations/001_initial.sql**

```sql
-- Tasks 表
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    priority VARCHAR(10) DEFAULT 'medium',
    assignee VARCHAR(100),
    result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans 表
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal TEXT NOT NULL,
    context TEXT,
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PlanTasks 表 (规划生成的任务)
CREATE TABLE IF NOT EXISTS plan_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    dependencies UUID[],
    estimated_duration INT,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan ON plan_tasks(plan_id);
```

- [ ] **Step 3: 更新 lib.rs 添加数据库初始化**

```rust
pub mod db;

use db::Db;
use config::Config;

// 在 run() 函数中添加:
let config = Config::from_env();
let db = Db::new(&config).await.expect("Failed to connect to database");
```

- [ ] **Step 4: 测试编译**

```bash
cd packages/backend && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/
git commit -m "feat: 添加数据库连接和schema"
```

---

## Chunk 3: 后端 API 实现

### Task 5: 实现任务 CRUD API

**Files:**
- Modify: `packages/backend/src/api/mod.rs`
- Create: `packages/backend/src/api/tasks.rs`

- [ ] **Step 1: 创建 tasks.rs**

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put, delete},
    Json, Router,
};
use uuid::Uuid;
use crate::models::task::{Task, TaskStatus, Priority};
use crate::db::Db;

pub fn router(db: Db) -> Router {
    Router::new()
        .route("/api/v1/tasks", get(list_tasks).post(create_task))
        .route("/api/v1/tasks/{id}", get(get_task).put(update_task).delete(delete_task))
        .with_state(db)
}

async fn list_tasks(State(db): State<Db>) -> Json<Vec<Task>> {
    // 实现任务列表查询
    Json(vec![])
}

async fn get_task(State(db): State<Db>, Path(id): Path<Uuid>) -> Result<Json<Task>, StatusCode> {
    // 实现获取单个任务
    Err(StatusCode::NOT_FOUND)
}

async fn create_task(State(db): State<Db>, Json(payload): Json<CreateTaskPayload>) -> Result<Json<Task>, StatusCode> {
    let task = Task {
        id: Uuid::new_v4(),
        title: payload.title,
        description: payload.description,
        status: TaskStatus::Pending,
        priority: payload.priority.unwrap_or(Priority::Medium),
        assignee: None,
        result: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    Ok(Json(task))
}

async fn update_task(State(db): State<Db>, Path(id): Path<Uuid>, Json(payload): Json<UpdateTaskPayload>) -> Result<Json<Task>, StatusCode> {
    // 实现更新任务
    Err(StatusCode::NOT_FOUND)
}

async fn delete_task(State(db): State<Db>, Path(id): Path<Uuid>) -> Result<StatusCode, StatusCode> {
    // 实现删除任务
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
pub struct CreateTaskPayload {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<Priority>,
}

#[derive(serde::Deserialize)]
pub struct UpdateTaskPayload {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<Priority>,
    pub assignee: Option<String>,
    pub result: Option<String>,
}
```

- [ ] **Step 2: 更新 api/mod.rs**

```rust
pub mod tasks;
pub mod planning;

pub use tasks::router as tasks_router;
```

- [ ] **Step 3: 更新 lib.rs 添加路由**

```rust
use api::tasks_router;

let app = Router::new()
    .route("/health", get(health_check))
    .nest("/api/v1", tasks_router(db.clone()))
    .layer(cors);
```

- [ ] **Step 4: 测试编译**

```bash
cd packages/backend && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/api/
git commit -m "feat: 实现任务CRUD API"
```

---

### Task 6: 实现规划 API

**Files:**
- Create: `packages/backend/src/api/planning.rs`
- Create: `packages/backend/src/services/planner.rs`

- [ ] **Step 1: 创建 planning.rs**

```rust
use axum::{
    extract::{State, Json},
    routing::post,
    Router,
};
use crate::models::plan::{Plan, PlanStatus};
use crate::db::Db;

pub fn router(db: Db) -> Router {
    Router::new()
        .route("/api/v1/planning/plan", post(create_plan))
        .route("/api/v1/planning/delegate", post(delegate_task))
        .with_state(db)
}

async fn create_plan(State(db): State<Db>, Json(payload): Json<CreatePlanPayload>) -> Result<Json<Plan>, StatusCode> {
    // 调用 planner service 生成任务
    let plan = Plan {
        id: Uuid::new_v4(),
        goal: payload.goal,
        tasks: vec![],
        context: payload.context.unwrap_or_default(),
        status: PlanStatus::Planned,
        created_at: chrono::Utc::now(),
    };
    Ok(Json(plan))
}

async fn delegate_task(State(db): State<Db>, Json(payload): Json<DelegatePayload>) -> Result<Json<DelegateResponse>, StatusCode> {
    // 通过 WebSocket 发送给前额叶执行
    Ok(Json(DelegateResponse { task_id: Uuid::new_v4(), status: "delegated" }))
}

#[derive(serde::Deserialize)]
pub struct CreatePlanPayload {
    pub goal: String,
    pub context: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct DelegatePayload {
    pub task_id: Uuid,
    pub goal: String,
    pub context: String,
}

#[derive(serde::Serialize)]
pub struct DelegateResponse {
    pub task_id: Uuid,
    pub status: String,
}
```

- [ ] **Step 2: 创建 services/planner.rs**

```rust
// AI 规划服务 - 调用 LLM 分解任务
pub struct PlannerService {
    // LLM client 配置
}

impl PlannerService {
    pub fn new() -> Self {
        Self {}
    }
    
    pub async fn plan(&self, goal: &str, context: &str) -> Result<Vec<PlannedTask>, Box<dyn std::error::Error>> {
        // TODO: 调用 LLM API 生成任务分解
        // 临时返回空任务列表
        Ok(vec![])
    }
}
```

- [ ] **Step 3: 测试编译**

```bash
cd packages/backend && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/api/
git commit -m "feat: 实现规划API"
```

---

## Chunk 4: 前端基础架构

### Task 7: 创建 Next.js 基础页面结构

**Files:**
- Create: `packages/frontend/src/app/layout.tsx`
- Create: `packages/frontend/src/app/page.tsx`
- Create: `packages/frontend/src/app/globals.css`
- Create: `packages/frontend/tailwind.config.js`
- Create: `packages/frontend/postcss.config.js`

- [ ] **Step 1: 创建 layout.tsx**

```tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '顶叶 - 任务规划',
  description: 'AI 智能体任务规划系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: 创建 page.tsx**

```tsx
export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">顶叶 - 任务规划</h1>
      <div className="grid gap-4">
        <a href="/tasks" className="p-4 border rounded hover:bg-gray-50">
          任务管理
        </a>
        <a href="/planning" className="p-4 border rounded hover:bg-gray-50">
          AI 规划
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 创建 globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 4: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 5: 创建 postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 测试构建**

```bash
cd packages/frontend && pnpm install && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: 添加前端基础页面结构"
```

---

### Task 8: 创建任务管理页面

**Files:**
- Create: `packages/frontend/src/app/tasks/page.tsx`
- Create: `packages/frontend/src/app/tasks/components/TaskBoard.tsx`
- Create: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: 创建 api.ts**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'planning' | 'running' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  result?: string;
  created_at: string;
  updated_at: string;
}

export async function listTasks(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/api/v1/tasks`);
  return res.json();
}

export async function createTask(data: { title: string; description?: string; priority?: string }) {
  const res = await fetch(`${API_BASE}/api/v1/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateTask(id: string, data: Partial<Task>) {
  const res = await fetch(`${API_BASE}/api/v1/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteTask(id: string) {
  await fetch(`${API_BASE}/api/v1/tasks/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: 创建 TaskBoard.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { listTasks, Task } from '@/lib/api';

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  
  useEffect(() => {
    listTasks().then(setTasks);
  }, []);
  
  const columns = ['pending', 'planning', 'running', 'completed', 'failed'];
  
  return (
    <div className="grid grid-cols-5 gap-4">
      {columns.map(status => (
        <div key={status} className="border p-4 rounded">
          <h3 className="font-bold mb-4 uppercase">{status}</h3>
          {tasks.filter(t => t.status === status).map(task => (
            <div key={task.id} className="border p-2 mb-2 rounded bg-white">
              {task.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 创建 tasks/page.tsx**

```tsx
import TaskBoard from './components/TaskBoard';

export default function TasksPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">任务管理</h1>
      <TaskBoard />
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: 添加任务管理页面"
```

---

## Chunk 5: 外部集成

### Task 9: 实现与前额叶的 WebSocket 通讯

**Files:**
- Create: `packages/backend/src/services/executor.rs`

- [ ] **Step 1: 创建 executor.rs**

```rust
use tokio_tungstenite::{connect_async, tungstenite::Message};
use crate::config::Config;

pub struct ExecutorService {
    config: Config,
}

impl ExecutorService {
    pub fn new(config: Config) -> Self {
        Self { config }
    }
    
    pub async fn execute(&self, task_id: &Uuid, goal: &str, context: &str) -> Result<ExecutionResult, Box<dyn std::error::Error>> {
        let url = format!("{}/execute", self.config.prefrontal_ws_url);
        let (ws, _) = connect_async(&url).await?;
        
        let request = ExecuteRequest {
            task_id: task_id.to_string(),
            goal,
            context,
        };
        
        ws.send(Message::Text(serde_json::to_string(&request)?)).await?;
        
        let msg = ws.next().await.ok_or("No message received")??;
        let response: ExecuteResponse = serde_json::from_str(&msg.to_string())?;
        
        Ok(ExecutionResult {
            task_id: *task_id,
            status: response.status,
            result: response.result,
        })
    }
}

#[derive(Serialize)]
struct ExecuteRequest {
    task_id: String,
    goal: String,
    context: String,
}

#[derive(Deserialize)]
struct ExecuteResponse {
    status: String,
    result: Option<String>,
}

pub struct ExecutionResult {
    pub task_id: Uuid,
    pub status: String,
    pub result: Option<String>,
}
```

- [ ] **Step 2: 测试编译**

```bash
cd packages/backend && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/
git commit -m "feat: 添加WebSocket执行器服务"
```

---

### Task 10: 实现与海马体的集成

**Files:**
- Create: `packages/backend/src/services/memory.rs`

- [ ] **Step 1: 创建 memory.rs**

```rust
use hippocampus_core::session::SessionManager;
use hippocampus_storage::neon::NeonStorage;

pub struct MemoryService {
    // 嵌入海马体模块
}

impl MemoryService {
    pub async fn new(database_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // 使用 Neon 存储
        let storage = NeonStorage::from_connection_string(database_url).await?;
        storage.initialize().await?;
        
        let session_manager = SessionManager::new(storage);
        
        Ok(Self {})
    }
    
    pub async fn store_context(&self, tenant_id: &str, session_id: &str, context: &str) -> Result<(), Box<dyn std::error::Error>> {
        // 存储会话上下文到海马体
        Ok(())
    }
    
    pub async fn search_memories(&self, query: &str) -> Result<Vec<Memory>, Box<dyn std::error::Error>> {
        // 搜索相关记忆
        Ok(vec![])
    }
}
```

- [ ] **Step 2: 更新 Cargo.toml 添加依赖**

```toml
[dependencies]
hippocampus-core = { path = "https://github.com/iBLOC/hippocampus/hippocampus-core" }
hippocampus-storage = { path = "https://github.com/iBLOC/hippocampus/hippocampus-storage" }
```

- [ ] **Step 3: 测试编译**

```bash
cd packages/backend && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/services/
git commit -m "feat: 添加海马体集成"
```

---

## 执行完成检查清单

- [ ] Monorepo 基础结构
- [ ] Rust 后端入口
- [ ] 数据库 Schema
- [ ] 任务 CRUD API
- [ ] 规划 API
- [ ] Next.js 前端
- [ ] 任务看板页面
- [ ] WebSocket 执行器
- [ ] 海马体集成

---

## 下一步

1. 实现完整的 LLM 规划逻辑
2. 添加前端更多页面
3. 集成测试
4. Docker 配置
