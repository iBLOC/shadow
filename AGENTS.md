# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21
**Updated:** 2026-03-21
**Project:** shadow (影) - AI 用户分身系统

## OVERVIEW

**Shadow (影)** 是用户的 AI 安全分身，运行在用户设备上（桌面或移动端），代表用户执行日常任务和工作。与其他 AI 多智能体应用不同，Shadow 中的所有执行都是**任务目标驱动**的 —— Shadow 不主动行动，只接受来自 **Resonance** 的任务派发。

### 核心特性

- **任务目标驱动**：所有执行由 Resonance 统一派发
- **零信任安全**：mTLS 双向认证，Shadow 主动发起连接
- **本地推理能力**：移动端 MNN，桌面端 candle-vllm
- **模型多样性**：支持本地、云端、魔搭社区、Resonance 提供
- **A2A 协议**：Shadow 向 Resonance 注册能力，Benchmark 评分同步

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Resonance                                     │
│                    任务编排 / 规划 / 工作流引擎                            │
│                              Port 8080                                    │
│                                                                             │
│  • 任务派发 (WebSocket push)     • 模型 Benchmark 评分                    │
│  • A2A 能力注册                  • mDNS 服务发现                          │
│  • 工作流编排                    • 用户认证                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ mTLS 双向认证
                                     │ WebSocket 推送任务
                                     │ A2A 协议能力同步
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Shadow (影)                                   │
│                         用户设备上的安全分身                                │
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐        │
│  │    Shadow-Mobile (移动端)   │    │   Shadow-Desktop (桌面端)  │        │
│  │       Flutter + MNN        │    │      Tauri + Rust          │        │
│  │                             │    │                             │        │
│  │  • MNN 本地推理            │    │  • candle-vllm 本地推理    │        │
│  │  • 魔搭社区下载模型        │    │  • 魔搭社区下载模型       │        │
│  │  • flutter_genui Agent2UI  │    │  • CopilotKit Agent2UI     │        │
│  │  • Android 无障碍 API       │    │  • 桌面自动化              │        │
│  └─────────────────────────────┘    └─────────────────────────────┘        │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     Prefrontal (前额叶)                               │  │
│  │                    Rust 多智能体执行引擎                               │  │
│  │                         Port 8082                                    │  │
│  │                                                                      │  │
│  │  • 内置 Agent (Rust)           • Skill 系统                        │  │
│  │  • 工具执行                    • LLM 提供者 (OpenAI/Anthropic)       │  │
│  │  • 会话管理                    • MCP 工具支持                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    Hippocampus (海马体)                               │  │
│  │                       长期记忆存储                                   │  │
│  │                         Port 8081                                    │  │
│  │                                                                      │  │
│  │  • HybridRAG 搜索           • 向量存储                               │  │
│  │  • 知识图谱                 • 会话记忆                               │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 与 Resonance 的交互

### 连接流程

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

### A2A 能力注册

Shadow 通过 A2A 协议向 Resonance 注册：
- **模型列表**：本地可用的模型及配置
- **Skill**：Shadow 支持的技能
- **MCP 工具**：可用的 MCP 工具服务器

### 任务评估体系

Resonance 建立任务评估体系，根据任务复杂程度给出模型评分建议：

| 复杂度 | 评分要求 | 示例 |
|--------|----------|------|
| 简单 | 60+ | 查天气、设置闹钟 |
| 中等 | 75+ | 写邮件、生成报告 |
| 复杂 | 85+ | 代码开发、复杂分析 |
| 专家 | 90+ | 架构设计、战略规划 |

## 项目结构

```
shadow/
├── AGENTS.md                    # 系统级文档
├── docs/superpowers/specs/      # 设计规范文档
│   └── 2026-03-21-shadow-design.md
├── shadow-desktop/              # 桌面端 (Tauri + React)
│   ├── src/                    # React 19 前端
│   │   ├── pages/              # 8 个页面
│   │   ├── stores/             # Zustand store
│   │   ├── components/         # 共享组件
│   │   └── i18n/               # 国际化
│   └── src-tauri/              # Rust 后端
│       └── Cargo.toml          # Prefrontal 依赖
│
└── shadow-mobile/              # 移动端 (Flutter + MNN)
    ├── lib/                    # Flutter UI (Dart)
    │   ├── screens/            # 页面
    │   ├── providers/          # Riverpod 状态
    │   ├── services/          # 服务层
    │   └── mnn_engine.dart    # MNN Platform Channel
    └── android/                # Android Native (Kotlin)
        └── app/src/main/
            ├── kotlin/         # Kotlin 代码
            └── cpp/            # C++ JNI 桥接
```

## 双端差异

### Shadow-Mobile (移动端)

| 特性 | 实现 |
|------|------|
| **框架** | Flutter 3.11+ |
| **状态管理** | Riverpod |
| **路由** | GoRouter |
| **本地推理** | MNN (C++ JNI) |
| **Agent2UI** | flutter_genui |
| **自动化** | Android Accessibility API |
| **模型来源** | 本地 MNN / 魔搭社区 / 云端 / Resonance |

### Shadow-Desktop (桌面端)

| 特性 | 实现 |
|------|------|
| **框架** | Tauri v2 (Rust + React 19) |
| **状态管理** | Zustand 5 |
| **路由** | React Router 7 |
| **本地推理** | candle-vllm |
| **Agent2UI** | CopilotKit |
| **自动化** | CopilotKit |
| **模型来源** | 本地 candle / 魔搭社区 / 云端 / Resonance |

## 模块说明

| 模块 | 位置 | 端口 | 功能 |
|------|------|------|------|
| **Resonance** | `/home/ibloc/Projects/resonance` | 8080 | 任务编排、规划、工作流引擎 |
| **Prefrontal** | `/home/ibloc/Projects/prefrontal` | 8082 | 多智能体执行、工具调用、内置 Agent |
| **Hippocampus** | `/home/ibloc/Projects/hippocampus` | 8081 | 长期记忆、HybridRAG 搜索 |
| **Shadow-Desktop** | `shadow-desktop/` | N/A | 桌面端 UI + candle-vllm |
| **Shadow-Mobile** | `shadow-mobile/` | N/A | 移动端 UI + MNN |

## 环境变量

```bash
# Resonance 连接
export RESONANCE_HOST="http://localhost:8080"    # Resonance 服务器地址
export SHADOW_ID="uuid"                           # Shadow 实例 ID
export MTLS_CERT_PATH="/path/to/client.pem"       # mTLS 客户端证书
export MTLS_KEY_PATH="/path/to/client.key"         # mTLS 客户端密钥
export MTLS_CA_PATH="/path/to/ca.pem"              # CA 证书

# 前额叶 (Prefrontal) - 任务执行
export PREFRONTAL_HOST="http://localhost:8082"

# 海马体 (Hippocampus) - 记忆存储
export HIPPOCAMPUS_HOST="http://localhost:8081"

# 模式配置
export PREFRONTAL_MODE="executor"                 # executor / full
```

## 相关项目

| 项目 | 路径 | 说明 |
|------|------|------|
| **Resonance** | `/home/ibloc/Projects/resonance` | 任务编排、规划、工作流引擎 |
| **Prefrontal** | `/home/ibloc/Projects/prefrontal` | 多智能体执行引擎 |
| **Hippocampus** | `/home/ibloc/Projects/hippocampus` | 长期记忆存储 |
| **Shadow** | `/home/ibloc/Projects/shadow` | 用户分身系统 |
| **Shadow-Desktop** | `shadow-desktop/` | 桌面端执行器 (Tauri) |
| **Shadow-Mobile** | `shadow-mobile/` | 移动端执行器 (Flutter) |

## 技术栈

| 层级 | 移动端 | 桌面端 |
|------|--------|--------|
| **UI 框架** | Flutter 3.11+ | React 19 + Tauri v2 |
| **状态管理** | Riverpod | Zustand 5 |
| **路由** | GoRouter | React Router 7 |
| **本地推理** | MNN | candle-vllm |
| **Agent2UI** | flutter_genui | CopilotKit |
| **后端** | Kotlin (Android) | Rust |
| **IPC** | Platform Channel | 直接调用 |

## 外部集成

### MNN (移动端本地推理)
- 阿里巴巴深度学习推理引擎
- 支持本地 LLM 运行
- GitHub: github.com/alibaba/MNN

### candle-vllm (桌面端本地推理)
- Rust 原生 vLLM 实现
- 高性能推理
- GitHub: github.com/EricLBuehler/candle-vllm

### flutter_genui (移动端 Agent2UI)
- 对话式 Agent UI
- 自动化操作支持
- GitHub: github.com/fluttergenui

### CopilotKit (桌面端 Agent2UI)
- AI 助手集成框架
- 自动化操作支持
- GitHub: github.com/CopilotKit/CopilotKit

### 魔搭社区
- 模型下载平台
- 支持 MNN 和 candle 格式模型
- modelscope.cn
