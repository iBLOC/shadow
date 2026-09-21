# Shadow (影) 系统设计规范

**版本：** 1.0
**日期：** 2026-03-21
**状态：** 设计中

---

## 1. 概述

### 1.1 项目定位

**Shadow (影)** 是用户的 AI 安全分身，运行在用户设备上（桌面或移动端），代表用户执行日常任务和工作。

### 1.2 核心特性

- **任务目标驱动**：所有执行由 Resonance 派发，Shadow 不主动行动
- **零信任安全**：mTLS 双向认证，Shadow 主动发起连接
- **本地推理能力**：移动端 MNN，桌面端 candle-vllm
- **模型多样性**：支持本地、云端、魔搭社区、Resonance 提供
- **双向能力同步**：A2A 协议，Shadow 向 Resonance 注册能力

### 1.3 与其他 AI 多智能体应用的区别

| 特性 | 传统多智能体 | Shadow |
|------|-------------|--------|
| 任务来源 | Agent 自主决定 | Resonance 统一派发 |
| 执行模式 | 主动行动 | 被动响应任务 |
| 安全模型 | 中心化信任 | 零信任 |
| 认证方式 | API Key / OAuth | mTLS 双向证书 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Resonance (共鸣)                                │
│                    任务编排 / 规划 / 工作流引擎                              │
│                              Port 8080                                      │
│                                                                             │
│  • 任务派发 (WebSocket push)     • 模型 Benchmark 评分                       │
│  • A2A 能力注册                  • mDNS 服务发现                            │
│  • 工作流编排                    • 用户认证                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ mTLS 双向认证
                                     │ WebSocket 推送任务
                                     │ A2A 协议能力同步
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Shadow (影)                                     │
│                         用户设备上的安全分身                                  │
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐        │
│  │    Shadow-Mobile (移动端)   │    │   Shadow-Desktop (桌面端)   │        │
│  │       Flutter + MNN         │    │      Tauri + Rust           │        │
│  │                              │    │                              │        │
│  │  • MNN 本地推理             │    │  • candle-vllm 本地推理    │        │
│  │  • 魔搭社区下载模型         │    │  • 魔搭社区下载模型         │        │
│  │  • flutter_genui Agent2UI   │    │  • CopilotKit Agent2UI     │        │
│  │  • Android 无障碍 API        │    │  • 桌面自动化               │        │
│  └─────────────────────────────┘    └─────────────────────────────┘        │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Prefrontal (前额叶)                               │   │
│  │                    Rust 多智能体执行引擎                               │   │
│  │                         Port 8082                                     │   │
│  │                                                                      │   │
│  │  • 内置 Agent (Rust)           • Skill 系统                         │   │
│  │  • 工具执行                    • LLM 提供者 (OpenAI/Anthropic)         │   │
│  │  • 会话管理                    • MCP 工具支持                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Hippocampus (海马体)                               │   │
│  │                       长期记忆存储                                    │   │
│  │                         Port 8081                                    │   │
│  │                                                                      │   │
│  │  • HybridRAG 搜索           • 向量存储                               │   │
│  │  • 知识图谱                 • 会话记忆                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责

| 模块 | 位置 | 端口 | 职责 |
|------|------|------|------|
| **Resonance** | `https://github.com/iBLOC/resonance` | 8080 | 任务编排、规划、工作流引擎、模型评分 |
| **Shadow-Mobile** | `https://github.com/iBLOC/shadow/shadow-mobile` | - | 移动端 UI、MNN 推理、flutter_genui |
| **Shadow-Desktop** | `https://github.com/iBLOC/shadow/shadow-desktop` | - | 桌面端 UI、candle-vllm、CopilotKit |
| **Prefrontal** | `https://github.com/iBLOC/prefrontal` | 8082 | 多智能体执行、工具调用、内置 Agent |
| **Hippocampus** | `https://github.com/iBLOC/hippocampus` | 8081 | 长期记忆、HybridRAG 搜索 |

---

## 3. Resonance 与 Shadow 的交互协议

### 3.1 连接建立流程

```
1. Shadow 启动
       │
       ▼
2. mDNS 广播 "_shadow._tcp" 服务
       │
       ▼
3. 发现局域网内 Resonance 服务
       │
       ▼
4. Shadow 主动建立 mTLS 连接
       │
       ▼
5. TLS 握手期间完成双向证书认证
       │
       ▼
6. A2A 协议：Shadow 注册能力到 Resonance
       │
       ▼
7. Resonance 返回模型 Benchmark 评分
       │
       ▼
8. 双向 WebSocket 信道建立（用于任务推送）
```

### 3.2 A2A 协议

Shadow 通过 A2A 协议向 Resonance 注册以下能力：

```json
{
  "type": "capability_register",
  "shadow_id": "uuid",
  "device_type": "mobile|desktop",
  "capabilities": {
    "models": [
      {
        "id": "qwen2.5-3b",
        "provider": "mnn|candle-vllm",
        "context_length": 8192,
        "quantization": "q4km"
      }
    ],
    "skills": [
      {
        "id": "web_search",
        "name": "Web Search",
        "description": "Search the web for information"
      }
    ],
    "mcp_tools": [
      {
        "server": "filesystem",
        "tools": ["read", "write", "list"]
      }
    ]
  }
}
```

### 3.3 任务派发协议

Resonance 通过 WebSocket 推送任务：

```json
{
  "type": "task_push",
  "task_id": "uuid",
  "priority": "high|normal|low",
  "goal": "完成用户注册流程",
  "required_capabilities": {
    "min_model_score": 80,
    "preferred_models": ["qwen2.5-3b"],
    "required_skills": ["web_search"]
  },
  "context": {
    "user_id": "user_uuid",
    "session_id": "session_uuid",
    "metadata": {}
  }
}
```

Shadow 响应：

```json
{
  "type": "task_response",
  "task_id": "uuid",
  "status": "accepted|rejected|deferred",
  "reason": "可选，拒绝原因",
  "selected_model": "选择的模型"
}
```

### 3.4 模型评分同步

Resonance 定期向 Shadow 同步模型评分：

```json
{
  "type": "model_scores",
  "timestamp": "2026-03-21T10:00:00Z",
  "scores": [
    {
      "model_id": "qwen2.5-3b",
      "benchmark_scores": {
        "reasoning": 85,
        "code": 78,
        "creativity": 82,
        "speed": 95
      },
      "overall_score": 84
    }
  ]
}
```

---

## 4. 任务执行流程

### 4.1 标准任务执行

```
1. Resonance 推送任务到 Shadow
       │
       ▼
2. Shadow 接收并评估任务
       │
       ├── 任务指定 "由当前 Shadow 执行" ──► 使用评分最高的本地模型
       │
       ├── 模型评分不满足要求 ──► 向 Resonance 反馈，要求重新指派
       │
       └── 其他情况 ──► 使用 Resonance 建议的模型
       │
       ▼
3. Prefrontal 执行任务
       │
       ▼
4. 任务过程中记忆存储到 Hippocampus
       │
       ▼
5. 任务完成，结果同步 Resonance
       │
       ▼
6. Resonance 更新任务状态并通知用户
```

### 4.2 任务评估体系

Resonance 建立任务评估体系，根据任务复杂程度给出模型评分建议：

| 复杂度 | 评分要求 | 示例 |
|--------|----------|------|
| 简单 | 60+ | 查天气、设置闹钟 |
| 中等 | 75+ | 写邮件、生成报告 |
| 复杂 | 85+ | 代码开发、复杂分析 |
| 专家 | 90+ | 架构设计、战略规划 |

---

## 5. 安全模型

### 5.1 零信任原则

- **默认不信任**：所有连接都需要显式认证
- **最小权限**：只暴露必要的接口
- **主动发起**：Shadow 决定何时连接 Resonance

### 5.2 mTLS 双向认证

```
Shadow 端                          Resonance 端
    │                                    │
    │◄────── Server Certificate ────────│  1. Resonance 证书
    │                                    │
    │────── Client Certificate ──────────►│  2. Shadow 证书
    │                                    │
    │◄────── Verify CA Signature ─────────│  3. 双方验证 CA 签名
    │                                    │
    │══════════ TLS 连接建立 ════════════│  4. 双向认证完成
    │                                    │
    │────── A2A Capability Register ────►│  5. 能力注册
    │◄───── Model Benchmark Scores ───────│  6. 模型评分同步
```

### 5.3 证书管理

- **CA**：由 Resonance 作为 CA 签发证书
- **Shadow 证书**：设备首次连接时注册并签发
- **证书轮换**：每 90 天自动轮换

---

## 6. 双端差异

### 6.1 移动端 (Shadow-Mobile)

| 特性 | 实现 |
|------|------|
| **框架** | Flutter |
| **本地推理** | MNN (C++ JNI) |
| **Agent2UI** | flutter_genui |
| **自动化** | Android 无障碍 API |
| **模型来源** | 本地 MNN / 魔搭社区 / 云端 / Resonance |
| **平台通道** | Flutter Platform Channel → Kotlin → Prefrontal |

### 6.2 桌面端 (Shadow-Desktop)

| 特性 | 实现 |
|------|------|
| **框架** | Tauri (Rust + React) |
| **本地推理** | candle-vllm (Rust) |
| **Agent2UI** | CopilotKit |
| **自动化** | CopilotKit 自动化 |
| **模型来源** | 本地 candle / 魔搭社区 / 云端 / Resonance |
| **集成方式** | 直接调用 Prefrontal Rust 库 |

---

## 7. 技术栈

### 7.1 移动端

| 层级 | 技术 |
|------|------|
| **UI** | Flutter 3.11+ / Material 3 |
| **状态管理** | Riverpod |
| **路由** | GoRouter |
| **本地推理** | MNN |
| **Agent2UI** | flutter_genui |
| **自动化** | Android Accessibility API |
| **IPC** | Platform Channel |

### 7.2 桌面端

| 层级 | 技术 |
|------|------|
| **UI** | React 19 + TypeScript |
| **状态管理** | Zustand |
| **路由** | React Router 7 |
| **本地推理** | candle-vllm |
| **Agent2UI** | CopilotKit |
| **自动化** | CopilotKit |
| **框架** | Tauri v2 |
| **后端** | Rust |

### 7.3 核心模块

| 模块 | 技术 |
|------|------|
| **Prefrontal** | Rust / Axum / Tokio |
| **Hippocampus** | Rust / Axum / SQLx / PostgreSQL |

---

## 8. 数据流

### 8.1 记忆存储流

```
User Interaction
       │
       ▼
Prefrontal Agent
       │
       ├──► Hippocampus (长期记忆)
       │         │
       │         ├──► 事件记忆
       │         ├──► 实体/关系
       │         └──► 向量索引
       │
       └──► 会话上下文
```

### 8.2 模型选择流

```
Task from Resonance
       │
       ▼
评估任务复杂度
       │
       ▼
┌──────────────────────────────────────┐
│  检查任务指定模型                      │
│  ├── 指定当前 Shadow ──► 使用该模型   │
│  └── 未指定 ──► 检查评分              │
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  模型评分比较                          │
│  ├── 本地模型满足 ──► 使用本地模型     │
│  └── 不满足 ──► 请求 Resonance 重新指派│
└──────────────────────────────────────┘
```

---

## 9. 外部依赖

### 9.1 移动端

| 依赖 | 用途 | 链接 |
|------|------|------|
| MNN | 本地 LLM 推理 | github.com/alibaba/MNN |
| flutter_genui | Agent2UI | github.com/fluttergenui |
| 魔搭社区 | 模型下载 | modelscope.cn |

### 9.2 桌面端

| 依赖 | 用途 | 链接 |
|------|------|------|
| candle-vllm | 本地 LLM 推理 | github.com/EricLBuehler/candle-vllm |
| CopilotKit | Agent2UI | github.com/CopilotKit/CopilotKit |
| 魔搭社区 | 模型下载 | modelscope.cn |

---

## 10. 实现优先级

### Phase 1: 核心连接 (MVP)
1. Shadow 与 Resonance 的 mDNS 发现
2. mTLS 双向认证
3. A2A 能力注册协议
4. 基础任务推送接收

### Phase 2: 任务执行
1. Prefrontal 集成
2. 基础任务执行流程
3. Hippocampus 记忆存储
4. 模型评分同步

### Phase 3: 双端差异
1. 移动端 MNN 集成
2. 桌面端 candle-vllm 集成
3. Agent2UI 集成（flutter_genui / CopilotKit）

### Phase 4: 高级特性
1. 魔搭社区模型下载
2. 自动化操作能力
3. 复杂任务评估与重指派

---

## 11. 文件结构

```
shadow/
├── AGENTS.md                    # 系统级文档
├── shadow-desktop/              # 桌面端
│   ├── AGENTS.md
│   ├── src/                    # React 前端
│   └── src-tauri/              # Rust 后端
└── shadow-mobile/              # 移动端
    ├── AGENTS.md
    ├── lib/                    # Flutter UI
    └── android/                 # Android Native
```

---

## 12. 相关项目

| 项目 | 路径 | 说明 |
|------|------|------|
| **Resonance** | `https://github.com/iBLOC/resonance` | 任务编排、规划、工作流引擎 |
| **Prefrontal** | `https://github.com/iBLOC/prefrontal` | 多智能体执行引擎 |
| **Hippocampus** | `https://github.com/iBLOC/hippocampus` | 长期记忆存储 |
| **Shadow** | `https://github.com/iBLOC/shadow` | 用户分身 (本文档) |
