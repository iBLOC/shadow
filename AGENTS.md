# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21
**Updated:** 2026-07-19 (post-port-unification 2757fea: cortex :8443→:60000; SQLite dropped from prefrontal 70a9976/2561ece; candle-vllm reference removed in favor of neure-embedded)
**Project:** shadow (影) - AI 用户分身系统
**Spec version:** 2026-06-04 4-layer architecture (aligned with root `/AGENTS.md`)

## OVERVIEW

**Shadow (影)** 是用户的 AI 安全分身，运行在用户设备上（桌面或移动端），代表用户执行日常任务和工作。与其他 AI 多智能体应用不同，Shadow 中的所有执行都是**任务目标驱动**的 —— Shadow 不主动行动，只接受来自 **Resonance** 的任务派发。

### 核心特性

- **任务目标驱动**：所有执行由 Resonance 统一派发
- **零信任安全**：mTLS 双向认证，Shadow 主动发起连接
- **本地推理能力**：移动端 MNN (LiteRT) + Kotlin `OpenAIServer.kt`，桌面端 neure (embedded at :8085 via `run_embedded()`，candle / burn / litert 三个 ML 后端)
- **模型多样性**：支持本地、云端、魔搭社区、Resonance 提供
- **A2A 协议**：Shadow 向 Resonance 注册能力，Benchmark 评分同步

## 系统架构

> **规范版本**: 2026-06-04 4 层架构（与根 `/AGENTS.md` 对齐）。
> 旧版"Resonance 中心 + Shadow 二级"图已弃用，仅在 `docs/architecture.md §7` 留作历史参考。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 4: INTERACTION (本仓库)                                              │
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐          │
│  │   Shadow-Desktop            │    │   Shadow-Mobile             │          │
│  │   shadow/shadow-desktop/    │    │   shadow/shadow-mobile/     │          │
│  │                             │    │                             │          │
│  │   Tauri 2 + React 19        │    │   Flutter 3.11+             │          │
│  │   • Zustand 5               │    │   • Riverpod                │          │
│  │   • React Router 7          │    │   • GoRouter                │          │
│  │   • CopilotKit (Agent2UI)   │    │   • flutter_genui (Agent2UI)│          │
│  │   • neure (embedded :8085)  │    │   • MNN C++ JNI 本地推理    │          │
│  │   • 桌面自动化              │    │   • Android 无障碍 API      │          │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘          │
│                 │  OpenAI /v1/* + WebSocket + WebRTC                        │
└─────────────────┼──────────────────────────────────┼─────────────────────────┘
                  ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 3: AGENT  (外部项目)                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Prefrontal  /home/ibloc/Projects/prefrontal       Port 8082        │    │
│  │  Rust 多智能体执行引擎 (单 crate, 可嵌入或独立运行)                    │    │
│  │  • agent / session / tool / skill / MCP / A2A orchestration        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                  │  OpenAI /v1/*                                            │
└──────────────────┼──────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 3.5: CORTEX  (Agent 编排层, 单 shadow 中心化)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Cortex  /home/ibloc/Projects/cortex            Port 60000        │    │
│  │  Rust (axum 0.8 + synapse::wasm)                                     │    │
│  │  • 本地 registry (native lobes + user WASM agents)                    │    │
│  │  • A2A gateway (skill-based routing)                                  │    │
│  │  • encrypted mDNS 广播 + mTLS 信任存储                                │    │
│  │  • hot-reload config + admin API (X-Admin-Token)                      │    │
│  │  • LobeKind: Native / Wasm / Prompt / External                        │    │
│  │  • agent/scan + agent/sync/{provider_id} 外部智能体管理                │    │
│  │  • agent/create 纯提示词智能体 + agent/discover A2A 自发现             │    │
│  │  • MCP 管理 (v0.5 Sprint 2): wasm-only transport, 10-route HTTP,     │    │
│  │    cortex_lobes/cortex_wasm_binaries/cortex_mcp_servers PG schema     │    │
│  │  Talks up: A2A to Resonance / other cortexes (mTLS)                  │    │
│  │  Talks down: A2A to native lobes, WASM in-process                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                  │  A2A (skill)                                              │
└──────────────────┼──────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 2: ENGINE  (外部项目)                                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  neure  github.com/iBLOC/neure-rs    Port 8083 (8085 embedded)    │    │
│  │  Rust 单二进制推理运行时 (LLM/TTS/ASR/Rerank)                         │    │
│  │  • candle (默认) / voxcpm (burn) / litert 三个 ML 后端              │    │
│  │  • 9 个 OpenAI-兼容 HTTP 端点                                        │    │
│  │  • 模型来源: 本地 / HuggingFace / 魔搭社区                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                  │  OpenAI /v1/* (云) 或 in-process (本地)                 │
└──────────────────┼──────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 1: MODEL  (横切)                                                     │
│                                                                             │
│  云端 (MiniMax / Xiaomi Mimo / OpenAI / Anthropic / DeepSeek)               │
│  本地 (GGUF / safetensors / .mnn / .litertlm / burn .mpk)                  │
│                                                                             │
│  Shadow-Desktop 通过 neure 加载 candle 本地模型                              │
│  Shadow-Mobile 通过 Kotlin `OpenAIServer.kt` (MNN + LiteRT) 加载本地模型      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 0: STORAGE  (横切, 所有层共享)                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Hippocampus  /home/ibloc/Projects/hippocampus      Port 8081        │    │
│  │  5-crate Rust workspace — HybridRAG + temporal + consciousness      │    │
│  │  • hippocampus-core (lib)  • hippocampus-storage (内部数据库/分布式数据库)   │    │
│  │  • hippocampus-server (Axum REST)  • hippocampus-mcp (stdio)        │    │
│  │  • hippocampus-cli                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  + Prefrontal persistence/ (postgres / file / neon / s3_blob; SQLite 已删除, 70a9976) │
│  + 模型权重: ~/.neure/models/{engine}/{id}/                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 5 (横切): ORCHESTRATION  (外部项目, 多用户/跨设备)                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Resonance  /home/ibloc/Projects/resonance         Port 8080        │    │
│  │  任务编排 / 规划 / 工作流引擎 / Benchmark 评分                       │    │
│  │  • 任务派发 (WebSocket push)                                          │    │
│  │  • A2A 能力注册 (Shadow → Resonance)                                  │    │
│  │  • mDNS 服务发现 (_shadow._tcp)                                       │    │
│  │  • mTLS 双向认证 (Shadow 主动连接)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shadow 在 4 层架构中的位置

| 维度 | 位置 |
|---|---|
| 主要职责 | Layer 4 (Interaction) — 用户交互 UI |
| 嵌入式职责 | 包含 Layer 2 (neure embedded at :8085) + Prefrontal 客户端 |
| 跨层通信 | L4↔L3 (OpenAI/WS/WebRTC), L4↔L5 (mTLS/WS/A2A/mDNS) |
| 独立服务 | 不运行独立服务器; Tauri/Flutter 直接调用 Layer 3 Prefrontal |

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
├── docs/superpowers/specs/      # 设计规范文档 (NOT version-controlled — see note below)
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
    │   ├── services/          # 服务层 (含 cortex_client.dart, webrtc_companion.dart)
    │   └── mnn_engine.dart    # MNN Platform Channel
    └── android/                # Android Native (Kotlin)
        └── app/src/main/
            ├── kotlin/         # Kotlin 代码
            └── cpp/            # C++ JNI 桥接
```

> **Note (2026-07-19)**: shadow-mobile 现在有独立的 AGENTS.md（`/home/ibloc/Projects/shadow/shadow-mobile/AGENTS.md`，431 行重写覆盖了 2026-06-04 的旧 204 行版本）。原版本描述「Layer 4 + Layer 2 hybrid」3 模式架构，已被 cortex-centric 视图取代——mobile 默认走 cortex (`:60000`)，只有 Phone-as-Engine 模式才在 Kotlin 层暴露 OpenAIServer `:8085`。

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
| **本地推理** | neure (embedded at :8085 via `run_embedded()`) — candle / burn / litert backends |
| **Agent2UI** | React 19 components + Tauri OS bridge (CopilotKit 一度是候选, 实际未采用) |
| **自动化** | Tauri commands (window / tray / notifications / fs) |
| **模型来源** | 本地 neure (candle 默认) / 魔搭社区 (默认 NEURE_DEFAULT_SOURCE) / 云端 / Resonance |

## 模块说明

| 模块 | 位置 | 端口 | 功能 |
|------|------|------|------|
| **Resonance** | `/home/ibloc/Projects/resonance` | 8080 | 任务编排、规划、工作流引擎 |
| **Cortex** | `/home/ibloc/Projects/cortex` | 60000 | 单 shadow 中心化 agent 注册 + A2A gateway + WASM 宿主 + 外部智能体扫描同步 + MCP 管理 (v0.5 Sprint 2) |
| **Prefrontal** | `/home/ibloc/Projects/prefrontal` | 8082 | 多智能体执行、工具调用、内置 Agent (prefrontal 是 cortex 管理的 lobe 之一) |
| **Hippocampus** | `/home/ibloc/Projects/hippocampus` | 8081 | 长期记忆、HybridRAG 搜索 |
| **Shadow-Desktop** | `shadow-desktop/` | N/A | 桌面端 UI + neure (embedded :8085 via Tauri shell) |
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
| **本地推理** | MNN (LiteRT + MNN) | neure (embedded at :8085) |
| **Agent2UI** | flutter_genui | React 19 + Tauri commands |
| **后端** | Kotlin (Android) | Rust (Tauri shell) |
| **IPC** | Platform Channel | Tauri invoke + HTTP |

## 外部集成

### MNN (移动端本地推理)
- 阿里巴巴深度学习推理引擎
- 支持本地 LLM 运行
- GitHub: github.com/alibaba/MNN

### ~~candle-vllm~~ (桌面端本地推理 — 弃用)
- ~~Rust 原生 vLLM 实现~~
- ~~GitHub: github.com/EricLBuehler/candle-vllm~~
- **现状 (2026-07-19)**: 已被 `neure` 取代; neure 通过 `run_embedded()` 在 Shadow-Desktop Tauri shell 内 :8085 提供推理服务, 默认 candle runtime。candle-vllm 不再作为桌面端默认引擎。

### flutter_genui (移动端 Agent2UI)
- 对话式 Agent UI
- 自动化操作支持
- GitHub: github.com/fluttergenui

### ~~CopilotKit~~ (桌面端 Agent2UI — 弃用)
- ~~AI 助手集成框架~~
- ~~GitHub: github.com/CopilotKit/CopilotKit~~
- **现状 (2026-07-19)**: Shadow-Desktop 实际采用 React 19 + Tauri commands + 原生 React 组件而非 CopilotKit。CopilotKit 仅在早期设计评估阶段被考虑, 未实际落地。

### 魔搭社区
- 模型下载平台
- 支持 MNN 和 candle 格式模型
- modelscope.cn

## 设计规范版本控制策略

`/home/ibloc/Projects/docs/superpowers/specs/` **不是 git 仓库**。架构规范（如 `2026-06-04-shadow-architecture-redesign.md`）的修改不进入 git 历史，依赖**手动 SOP 同步**。

决策记录（2026-06-08 → 2026-06-09）：评估 neure 重构后的代码/文档对齐时，Layer 2 ENGINE 块加入了 neure 说明。该修改已反映在以下文档中：
- `/home/ibloc/Projects/AGENTS.md` PROJECTS 表（neure 列入 Layer 2，synapse 列为 shared/突触层）
- `/home/ibloc/Projects/docs/architecture.md`（完整架构图 + 内嵌 Mermaid + 生物类比 §8）
- `/home/ibloc/Projects/docs/diagrams/architecture.mmd`（SVG/PNG 渲染源文件）
- `/home/ibloc/Projects/hippocampus/AGENTS.md`（synapse path dep 关系说明）
- 8 个项目根目录分别放置了 `ARCHITECTURE.md` 指针文件

