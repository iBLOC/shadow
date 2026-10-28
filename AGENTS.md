# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21
**Updated:** 2026-10-28 (移动端 l10n 全量收口：220+ 处硬编码中文接入 `AppLocalizations`，arb 179→441 key；测试断言改走 `l10nOf(tester)` 不再写死中英文；修 `arb` 里 `openVoiceMode` 重复键（JSON 后者覆盖前者）；`currentL10n()` 改用 `PlatformDispatcher.instance`（`WidgetsBinding.instance` 要求 binding 已初始化，纯 Dart 单测与后台 isolate 会抛）；孤儿页处理 —— 嵌入式 Prefrontal 页接进路由 `/settings/prefrontal`，外部进程架构三件套（死代码）删除；`prefrontal` 仓新增**宿主 JVM 直测 JNI**（模拟器不可用时的替代验证，12 项断言全绿），顺带修一个真 bug：provider 与 agent 用的不是同一份 `LlmConfig`，导致嵌入式运行时永远指向 `api.openai.com` 且无 key)
**Updated:** 2026-10-28 (移动端测试从 173/28 修到 **201/201 全绿**并接入 CI：修 3 处真实代码 bug —— `AgentsResponse` 的 legacy `cortex` 键 fallback 写成了重复的 `telencephalon`、`AppConfigService` 解析失败只重置了一个字段且 `init()` 被 `_isInitialized` 短路导致永不重载、`TelencephalonClient.listConversations` 把 JSON 数组强转 Map；另修 20 处文案断言（屏幕硬编码中文）、3 处缺 localization delegate、2 处 `pumpAndSettle` 撞无限动画超时；CI 新增 `Mobile Test` 作业。同日修复移动端打包缺陷：`externalNativeBuild.cmake.path` 未设导致 Flutter 插件把 CMake 源目录改写成空模板，`libmnnbridge.so` 从未进过 APK)
**Project:** shadow (影) - AI 用户分身系统
**Spec version:** 2026-06-04 4-layer architecture (aligned with root `/AGENTS.md`)
**Parent project summary**: `/home/ibloc/Projects/AGENTS.md` (not git-tracked — drift-prone; **not present on this Windows checkout**, paths stay verbatim Linux for now). Sibling audit: [`2026-09-23-iBLOC-progress-assessment.md`](docs/superpowers/architecture/2026-09-23-iBLOC-progress-assessment.md). Companion E2E coverage assessment: [`2026-09-25-e2e-coverage-assessment.md`](docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md).
**Telencephalon (Layer 3.5) subsystem surface**: see [`telencephalon/AGENTS.md` §Subsystem Management (3-tier auth)](../telencephalon/AGENTS.md) — the active repo after the 2026-09 rename chain. The original `cortex/` directory at `C:\Projects\iBLOC\cortex\` is empty (placeholder).

## OVERVIEW

**Shadow (影)** 是用户的 AI 安全分身，运行在用户设备上（桌面或移动端），代表用户执行日常任务和工作。与其他 AI 多智能体应用不同，Shadow 中的所有执行都是**任务目标驱动**的 —— Shadow 不主动行动，只接受来自 **Resonance** 的任务派发。

### 核心特性

- **任务目标驱动**：所有执行由 Resonance 统一派发
- **零信任安全**：mTLS 双向认证，Shadow 主动发起连接
- **本地推理能力**：移动端 MNN (LiteRT) + Kotlin `OpenAIServer.kt`，桌面端 neuron (embedded at :8085 via `run_embedded()`，candle / burn / litert 三个 ML 后端)
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
│  │   Tauri 2 + React 19        │    │   Flutter 3.41.4            │          │
│  │   • Zustand 5               │    │   • Riverpod                │          │
│  │   • React Router 7          │    │   • GoRouter                │          │
│  │   • CopilotKit (Agent2UI)   │    │   • flutter_genui (Agent2UI)│          │
│  │   • neuron (embedded :8085)  │    │   • MNN C++ JNI 本地推理    │          │
│  │   • 桌面自动化              │    │   • Android 无障碍 API      │          │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘          │
│                 │                                │                           │
│  ┌──────────────┴───────────────┐                │                           │
│  │   Shadow-ESP32 (v0.x 概念)  │                │                           │
│  │   shadow/shadow-esp32/      │                │                           │
│  │                             │                │                           │
│  │   Zephyr 4.4.x + C          │                │                           │
│  │   • ESP32-S3-DevKitC 板级   │                │                           │
│  │   • cJSON A2A 客户端        │                │                           │
│  │   • mDNS `_shadow._tcp`     │                │                           │
│  └──────────────┬──────────────┘                │                           │
│                 │                                │                           │
│                 │  OpenAI /v1/* + WebSocket + WebRTC + mDNS + A2A (JSON-RPC)│
└─────────────────┼────────────────────────────────┼─────────────────────────┘
                  ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 3: AGENT  (外部项目)                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Encephalon (大脑)  https://github.com/iBLOC/encephalon             │    │
│  │  顶层 agent crate: diencephalon(间脑) + telencephalon(端脑) +       │    │
│  │  hippocampus(海马体), 捆在一个 ACP 总线和一棵 axum HTTP 树里        │    │
│  │  • Embedded::boot() —— 进程内嵌入; 桌面端已用它 (:8085 跑 neuron)   │    │
│  │                                                                     │    │
│  │  Prefrontal (前额叶)  https://github.com/iBLOC/prefrontal  :8082    │    │
│  │  Rust 多智能体执行引擎 (单 crate, 可嵌入或独立运行)                 │    │
│  │  • agent / session / tool / skill / MCP / A2A orchestration         │    │
│  │  • 四叶拆分后它只是 telencephalon 管的 lobe, 不再是独立的一层       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                  │  OpenAI /v1/*                                            │
└──────────────────┼──────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 3.5: CORTEX  (Agent 编排层, 单 shadow 中心化)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Telencephalon  https://github.com/iBLOC/telencephalon Port 60080    │    │
│  │  (was cortex → encephalon → telencephalon, 2026-09 rename chain)     │    │
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
│  │  Talks up: A2A to Resonance / other telencephalons (mTLS)            │    │
│  │  Talks down: A2A to native lobes, WASM in-process                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                  │  A2A (skill)                                              │
└──────────────────┼──────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 2: ENGINE  (外部项目)                                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  neuron  github.com/ibloc/neuron    Port 8083 (8085 embedded)    │    │
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
│  Shadow-Desktop 通过 neuron 加载 candle 本地模型                              │
│  Shadow-Mobile 通过 Kotlin `OpenAIServer.kt` (MNN + LiteRT) 加载本地模型      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 0: STORAGE  (横切, 所有层共享)                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Hippocampus  https://github.com/iBLOC/hippocampus      Port 8081        │    │
│  │  5-crate Rust workspace — HybridRAG + temporal + consciousness      │    │
│  │  • hippocampus-core (lib)  • hippocampus-storage (内部数据库/分布式数据库)   │    │
│  │  • hippocampus-server (Axum REST)  • hippocampus-mcp (stdio)        │    │
│  │  • hippocampus-cli                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  + Prefrontal persistence/ (postgres / file / neon / s3_blob; SQLite 已删除, 70a9976) │
│  + 模型权重: ~/.neuron/models/{engine}/{id}/                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 5 (横切): ORCHESTRATION  (外部项目, 多用户/跨设备)                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Resonance  https://github.com/iBLOC/resonance         Port 8080        │    │
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
| 嵌入式职责 | 包含 Layer 2 (neuron embedded at :8085) + Prefrontal 客户端 |
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

└── shadow-esp32/               # 边缘 ESP32-S3 客户端 (Zephyr + C, v0.x 概念阶段)
    ├── main/                   # 当前是 ESP-IDF esp_hid_device scaffold (过渡)
    ├── docs/
    │   ├── RESEARCH.md         # 2026-08-16 调研报告(esp-claw 对比 + Zephyr/Rust 评估)
    │   └── adr/
    │       └── 0001-stack-choice-zephyr-c.md   # 决策 ADR:采用 Zephyr + C
    ├── build/                  # ESP-IDF v6.0.2 编译产物(已验证工具链 OK)
    ├── README.md
    └── sdkconfig.defaults.esp32s3
```

> **Note (2026-07-19)**: shadow-mobile 现在有独立的 AGENTS.md（`https://github.com/iBLOC/shadow/shadow-mobile/AGENTS.md`，431 行重写覆盖了 2026-06-04 的旧 204 行版本）。原版本描述「Layer 4 + Layer 2 hybrid」3 模式架构，已被 cortex-centric 视图取代——mobile 默认走 cortex (`:60080`)，只有 Phone-as-Engine 模式才在 Kotlin 层暴露 OpenAIServer `:8085`。

## 双端差异

### Shadow-Mobile (移动端)

| 特性 | 实现 |
|------|------|
| **框架** | Flutter 3.41.4 |
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
| **本地推理** | neuron (embedded at :8085 via `run_embedded()`) — candle / burn / litert backends |
| **Agent2UI** | React 19 components + Tauri OS bridge (CopilotKit 一度是候选, 实际未采用) |
| **自动化** | Tauri commands (window / tray / notifications / fs) |
| **模型来源** | 本地 neuron (candle 默认) / 魔搭社区 (默认 NEURON_DEFAULT_SOURCE) / 云端 / Resonance |

## 模块说明

| 模块 | 位置 | 端口 | 功能 |
|------|------|------|------|
| **Resonance** | `https://github.com/iBLOC/resonance` | 8080 | 任务编排、规划、工作流引擎 |
| **Cortex** (renamed to **Telencephalon** 2026-09) | `https://github.com/iBLOC/telencephalon` | 60080 | 单 shadow 中心化 agent 注册 + A2A gateway + WASM 宿主 + 外部智能体扫描同步 + MCP 管理 (v0.5 Sprint 2) |
| **Encephalon** (大脑) | `https://github.com/iBLOC/encephalon` | 进程内 | 顶层 agent crate: diencephalon(间脑) + telencephalon(端脑) + hippocampus(海马体) 捆在一个 ACP 总线里; 桌面端已改为进程内嵌入 (`Embedded::boot`), 旧的 cortex sidecar 模式已废弃 |
| **Prefrontal** | `https://github.com/iBLOC/prefrontal` | 8082 | 多智能体执行、工具调用、内置 Agent (prefrontal 是 telencephalon 管理的 lobe 之一) |
| **Hippocampus** | `https://github.com/iBLOC/hippocampus` | 8081 | 长期记忆、HybridRAG 搜索 |
| **Shadow-Desktop** | `shadow-desktop/` | N/A | 桌面端 UI + neuron (embedded :8085 via Tauri shell) |
| **Shadow-Mobile** | `shadow-mobile/` | N/A | 移动端 UI + MNN |
| **Shadow-ESP32** | `shadow-esp32/` | N/A | 边缘客户端原型 — **Zephyr 4.4.x + C + west**(`esp32s3_devkitc` 板级;v0.x 概念阶段;决策见 `shadow-esp32/docs/adr/0001-stack-choice-zephyr-c.md`;调研见 `shadow-esp32/docs/RESEARCH.md`)。通过 mDNS `_shadow._tcp` + A2A (JSON-RPC) 加入 Shadow 平台与 telencephalon/prefrontal 通信 |

## 移动端本地开发环境

CI 的 `Mobile Analyze` 作业固定 **Flutter 3.41.4（Dart 3.11.1）**（Dart 版本对应 `pubspec.yaml` 的 `sdk: ^3.11.1`）。本地装同版本，analyze 结果才和 CI 可比。

- SDK：`C:\src\flutter`（用户级 PATH 已含 `C:\src\flutter\bin`），`flutter --version` = 3.41.4 / Dart 3.11.1
- 拉依赖：`flutter pub get`（工作目录 `shadow-mobile/`）
- 复刻 CI：`flutter analyze --no-fatal-infos --no-fatal-warnings` —— issues 全是 warning/info 才算过（2026-10-28：74 issues，无 error）
- **CI 现在有移动端测试作业**（`Mobile Test`，2026-10-28 补上）。此前 `flutter test` 从未被任何自动化跑过，仓库里 201 个用例中 28 个是坏的，且**坏在三个方向**：① 多个屏幕（soul / mcp / skills / prompt-settings / model-settings / conversation）**硬编码中文文案**却断言英文；② 测试 MaterialApp 漏注册 `AppLocalizations.delegate` / `GlobalCupertinoLocalizations.delegate`，`AppLocalizations.of(context)!` 直接崩；③ `pumpAndSettle` 撞上 `CircularProgressIndicator` 这类无限动画必然超时。2026-10-28 全部修完，**201/201 全绿**（本地 exit 0）
- Windows 上 `flutter pub get` 末尾会因缺符号链接支持退出 1（Developer Mode 未开）。依赖其实已解析完，`analyze` / `test` 不受影响；要跑桌面端构建需管理员执行 `reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f`
- 根 `.gitignore` 原本忽略 `pubspec.lock` —— **2026-10-28 已改**（`dd16ffe`）：忽略规则移除、锁文件入库（48265 B），构建可复现了
- **移动端 l10n（2026-10-28 完成）**：移动端原先有 220+ 处硬编码中文（14 个屏幕 + features/ + widgets/chat/ + provider/service 层），英文界面下照样露中文。现已全部接入 `AppLocalizations`，arb 从 179 key 增到 **441 key**（`lib/l10n/app_en.arb` / `app_zh.arb`，`flutter gen-l10n` 生成到 `lib/generated/l10n/`）。
  - **有意保留中文的地方**：LLM 提示词与工具描述（`lib/agents/`）、关键词匹配表（`mnn_agent_integration.dart` 的 `_localKeywords`、`wake_word_service.dart`）、内部日志（`_log.info`）。这些不是 UI 文案。
  - **拿不到 `BuildContext` 的地方**（provider / notifier / model）用 `lib/l10n/current_l10n.dart` 的 `currentL10n()`。它读 `PlatformDispatcher.instance.locale` 而不是 `WidgetsBinding.instance.platformDispatcher` —— 后者要求 binding 已初始化，纯 Dart 单测和后台 isolate 里都会抛 "Binding has not yet been initialized"。
  - **测试断言不要写死中英文**：用 `test/widget/test_helper.dart` 的 `l10nOf(tester)`（取 widget 树里的 `AppLocalizations`）——翻译一改测试不用跟着改。
  - **`arb` 里不能有重复 key**：`openVoiceMode` 曾在 HEAD 里写了两遍，JSON 后者覆盖前者，代码实际拿到的是被遮住的那份。已改名 `openVoiceAssistant`。
- **`flutter test` 的两个本地坑**：① 上一次 `flutter test` 的输出管道被提前关闭会留下 `flutter_tester` 残留进程，占着 `build/native_assets/windows/sqlite3.dll`，下次跑会报 `PathExistsException: 当文件已存在时，无法创建该文件`。先 `Get-Process flutter_tester | Stop-Process` 再重跑。② `mavis-trash` 对 `build/` 下的文件会报「指定的路径无效」，清不掉就用 `flutter clean` + `flutter pub get`。

## Android 打包环境与 APK 验收

本机（Windows）已具备完整 Android 打包链路，均为免安装免管理员路线：

- JDK 17：Temurin 17.0.20.1 → `C:\src\jdk17`（用户级 `JAVA_HOME`）
- Android SDK：`C:\Users\87462\AppData\Local\Android\Sdk`（用户级 `ANDROID_HOME` / `ANDROID_SDK_ROOT`）。新 cmdline-tools 用 `android sdk install <pkg>@<ver>` / 路径式 `platforms/android-36` 语法，**旧 `sdkmanager` 已弃用**
- 关键组件：`platforms/android-36`（Flutter 3.41.4 compileSdk=36）、`ndk/30.0.14904198`（工程钉死版本）、`cmake/3.22.1`（AGP 默认版本）
- 打包：`flutter build apk --debug`（工作目录 `shadow-mobile/`）→ `build/app/outputs/flutter-apk/app-debug.apk`
- 产物验收三件套：`aapt2 dump badging <apk>`（包名/SDK/ABI）、`tar -tf <apk>`（列 `.so`）、`llvm-nm -D --defined-only <so>`（校验 JNI 导出符号）

**原生库打包陷阱（2026-10-28 修复，`69ff642`）**：`android/app/build.gradle.kts` 的 `externalNativeBuild` 必须写 `cmake { path = ... }`，否则 Flutter 的 Gradle 插件（`FlutterPluginUtils.forceNdkDownload`）会把 CMake 源目录改写成 flutter_tools 里那份**空的** CMakeLists.txt，`src/main/cpp/mnn_bridge.cpp` 永不编译，`libmnnbridge.so` 不进包。注意 **AGP 公共 DSL 里 `defaultConfig` 层的 `externalNativeBuild` 是 `ExternalNativeBuildFlags`（只有 cppFlags/arguments/abiFilters，没有 path/version）**，`path`/`version` 只能在**模块级** `android { externalNativeBuild { cmake { } } }` 上设置 —— 写错层级会报 "Unresolved reference"。

**模拟器硬阻塞**：本机 `systeminfo` 显示 `Virtualization Enabled In Firmware: No`、`HypervisorPresent=False`（AMD Ryzen 5 5600X，BIOS 未开 SVM），因此 Hyper-V / Windows Hypervisor Platform / Android Emulator hypervisor driver **全部不可用**；`aehd` 服务虽已安装但处于 Stopped，且当前 shell 非管理员。要跑模拟器必须先进 BIOS 开启 SVM 并重启。没有物理设备时 `adb devices` 为空，APK 无法安装验证。

## 桌面端系统提示词链路

桌面端「提示词设置」页（`/prompt-settings`，`PromptSettingsPage` + `promptStore`）的提示词要真正到达模型，**平台不同路径不同**，两条都要接：

- **桌面 Tauri 模式**（对话跑在内置 neuron 上，`streamMessageNeuron`）：提示词直接进本地消息历史的 system 消息。`composeSystemPrompt()` 的顺序是**内置基线在前、用户人设在后** —— 基线带着 Qwen3 的 `/no_think` 指令（功能性的，不能丢），人设放后面是因为越靠近用户轮次权重越高。
- **Web 模式**（对话走 telencephalon）：`createConversation({ system })` → 后端把提示词存成会话的 `[system] …` agent turn（`SYSTEM_TURN_PREFIX`，没有单独的列，也就不用改表结构）→ 发消息时 `system_prompt_of(&conv)` 取回 → 塞进 A2A 的 `metadata["system"]` → lobe 侧 `extract_system_prompt()` 取出 → `compose_system_prompt()` 拼在 lobe 基线之后。

**A2A metadata 通道**：`metadata` 走的是把整张表打包进 `metadata["name"]`（`__cortex_meta_v1__` 前缀，`encode_metadata_for_transport` / `decode_metadata_from_name`）。v1 线上协议只转发 `name` 这一个键，所以**加一个新字段不需要改 synapse、也不需要改线上格式** —— 只要 lobe 侧从解包后的 map 里读。

**为什么不用改独立 lobe 仓库（2026-10-28 核实）**：lobe 记录全是 `LobeKind::Native`，默认 agent `temporal` 命中 telencephalon 进程内的 `NativeLobeRegistry::with_temporal()` → 走 `LobeClient::NativeWithConfig`（进程内，metadata 完整保留），所以提示词能到。走 HTTP 的只有**不在 registry 里的 lobe**（`occipital`、mDNS 发现的外来 agent）。而独立的 `temporal` 仓库是 ASR/TTS/音频管线、`occipital` 是视觉管线（Mage-VL，只发 `role: "user"`），**两者都没有带 system 插槽的文本对话 LLM 路径** —— 文本对话只存在于 telencephalon 的 native `TemporalLobe`。所以远端仓库无需改动；真要让外部 agent 支持人设，得让对方自己解 `metadata["name"]`。

**桌面端页面的孤儿问题**：`src/pages/` 下出现过两次"写好了但没人引用"的页面（`RecordingPage` 被 `RecordingPanel` 取代后遗留、`PromptSettingsPage` 从未挂路由）。`src/__tests__/pageRouting.test.ts` 现在会挡住这类问题：每个页面模块必须被路由挂载，每条路由必须指向存在的页面。

**`scripts/ui-smoke.sh` 是"假绿"陷阱（2026-10-28 修复）**：它原本只判断 HTTP 200，而 Vite 对不存在的路径会回退到 index.html **同样返回 200**，所以缺失模块一律"通过"。现在改成从文件系统自动发现模块，并要求响应体不是 HTML 外壳。跑它需要先起 `pnpm dev`（脚本打的是 `http://localhost:1420`）。

## 移动端嵌入式前额叶（Prefrontal .so）

链路：Flutter → MethodChannel(`com.ibloc.shadow/prefrontal_runtime`) → `PrefrontalRuntimeService`(Kotlin) → JNI → `libprefrontal_core_lib.so`(Rust) → axum mini HTTP server(localhost)。

**注意措辞**：这一段嵌的是**前额叶（前额叶 = telencephalon 管的 lobe 之一）**，不是「大脑」本身。桌面端已经升级成嵌**大脑**（`encephalon::Embedded::boot()`，见 `shadow-desktop/src-tauri/src/lib.rs`），两端嵌的运行时**目前不是同一个**——这是已知的不一致，见下。

**2026-10-28 之前这条链路从未通过**，三个原因都在 prefrontal 仓：

1. `mobile` feature **编译不过**（`AgentBuilder::build()` 改成返回 `Result`、`AppState::agent_store` 是字段不是方法、`agent::Agent` 没有 `spec.id`/`runtime_mut().with_model()`）—— `scripts/build-android.sh` 一直在构建一个不存在的东西。
2. 仓库里**没有任何 JNI 入口**。`prefrontal_mobile_*` 是普通 C 符号（裸指针），Kotlin 的 `external fun` 找不到它们 → `UnsatisfiedLinkError`。已在 `src/mobile/jni.rs` 补上 6 个 JNI 入口（`Java_com_ibloc_shadow_PrefrontalRuntime_*`）。
3. `scripts/build-android.sh` 有六处硬伤（末尾多余 `EOF` 让 `set -e` 直接失败、产物改名成 `libprefrontal_mobile.so` 而 Kotlin 要 `prefrontal_core_lib`、JNI 头文件符号前缀写错、输出目录指向 prefrontal 自己的 `android/`、覆盖全局 `~/.cargo/config.toml`、API level 硬编码 24 而 minSdk 是 31）。

**怎么产出 `.so`**（在 prefrontal 仓）：

```bash
# 默认只编 arm64（41MB），装进 shadow-mobile 的 jniLibs
./scripts/build-android.sh aarch64-linux-android
# 显式指定 App 目录
./scripts/build-android.sh aarch64-linux-android --output /path/to/shadow-mobile
```

脚本会用 `llvm-nm` 校验 6 个 JNI 符号确实导出 —— **「编译成功」不等于「Kotlin 调得到」**（符号名写错的话 loadLibrary 能成功但 native 调用必炸）。

**`.so` 不入库**：它是兄弟仓库源码的构建产物（40MB/ABI），按需构建。`.gitignore` 里排除了它；jniLibs 里的 MNN 那几个是 vendored 第三方二进制，仍然入库。

**`.so` 缺失时必须优雅降级**：`PrefrontalRuntime` 的 companion `init{}` **不要重抛** `loadLibrary` 的失败 —— 重抛会让类初始化失败，之后每次访问变成 `NoClassDefFoundError`，而调用方接的是 `UnsatisfiedLinkError`（Error 不是 Exception，`catch (e: Exception)` 接不住）→ App 崩。现状是：不重抛 + 5 个 native 调用点各自 catch `UnsatisfiedLinkError`，于是错误以正确形态落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支。

**跨端不一致（2026-10-28 核实，未解决）**：桌面端嵌的是**大脑**，移动端嵌的是**前额叶**。

| 端 | 嵌入的运行时 | 证据 |
|---|---|---|
| shadow-desktop | `encephalon`（大脑） | `src-tauri/src/lib.rs`：`embedded_stack: Arc<encephalon::Embedded>` + `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })`；`Cargo.toml` 里 `encephalon = { path = "../../../encephalon" }`，且注释写明「旧的 cortex sidecar 模式 DEPRECATED (2026-09-22)，由 embedded encephalon 取代」「The embedded encephalon is the ONLY place shadow gets inference from」 |
| shadow-mobile | `prefrontal`（前额叶） | 本节的 `libprefrontal_core_lib.so`；prefrontal 仓 `src/mobile/{mod,jni}.rs` |

移动端**主链**已经是端脑（`engine_models_provider.dart`：`http://localhost:60080`，注释「Telencephalon is the single platform entry point」），prefrontal 在 HTTP 侧只是 fallback（`:8082`）。于是手机上有两套 agent 运行时：主链走端脑、嵌入支线跑前额叶 —— 手机本地拿不到端脑编排的各 lobe（temporal / occipital / parietal），且与桌面端行为不一致。

**改嵌「大脑」的成本**（2026-10-28 核实，不是换个 `.so` 那么简单）：`encephalon` / `telencephalon` 目前**没有 cdylib crate-type、没有 JNI 层、没有 android feature**。要嵌进 App 需要：① 加 `crate-type = ["cdylib"]`；② 重写一套 JNI 入口（prefrontal 那套 6 个入口是照它自己的 API 写的）；③ 整条依赖树交叉编译到 `aarch64-linux-android`：`telencephalon` → `neuron`(candle/wgpu) + `hippocampus`(sqlx/aes-gcm) + `synapse`(wasmtime) + `diencephalon` + `lance-graph`。prefrontal 已 40MB，带上 neuron/candle/wgpu 会显著变大。

功能上也**部分重叠**：桌面端「唯一推理来源 = 嵌入的大脑」在移动端不成立 —— 移动端另有 LiteRT / MNN 本地推理（`litert_engine.dart` / `mnn_engine.dart`），而端脑默认 feature 绑了 `neuron` + `candle`。所以「移动端该嵌哪个」是个需要决策的事，不是显然的替换。

**宿主 JVM 直测（2026-10-28 补上，`prefrontal` 仓 `scripts/jni-host-test/`）**：模拟器跑不起来时，「`.so` 编出来了」和「Kotlin 真的调得到」之间会断一层 —— JNI 是**按名字**解析符号的（`Java_<包名>_<类名>_<方法名>`），符号名写错的话 `llvm-nm` 看得到符号、Kotlin 一调却 `UnsatisfiedLinkError`。做法是把同一个 Rust cdylib 交给**宿主 JVM**，用与 Kotlin 侧同包同名的 Java 类去调，验证符号解析、`String` 编解码（含中文与 emoji 等增补平面字符）、`byte[]` 回写、mini HTTP server 起来了、以及 JNI → Rust → HTTP → mock LLM → 原路返回的端到端往返。**12 项断言全绿**。

```powershell
$env:JAVA_HOME='C:\src\jdk17'
& C:\Projects\iBLOC\prefrontal-wt-jni\scripts\jni-host-test\run.ps1
```

为此 `prefrontal` 的 `jni` 从「仅 Android target 的依赖」改成 `mobile` feature 的可选依赖（`mobile = ["dep:jni"]`），`Cargo.lock` 不用动（lock 格式不分 dev / 普通依赖）。

**嵌入式运行时的 LLM 端点（2026-10-28 修）**：`prefrontal_mobile_register_agent` 里 provider 用的是 `OpenAiProvider::new(&LlmConfig::default())`，和传给 agent 的 `llm_config` 是**两个不同对象** —— 于是请求地址永远是 `api.openai.com`、永远没有 key，嵌入式运行时此前调不通任何模型。现在 provider 与 agent 共用同一份 `llm_config`，端点 / 密钥从 `PREFRONTAL_LLM_BASE_URL` / `PREFRONTAL_LLM_API_KEY` 读（不设就是原默认值）。

**孤儿页已处理（2026-10-28）**：`prefrontal_mobile_cluster_page.dart` 之前是孤儿页，但它是嵌入式大脑的唯一 UI，而嵌入式大脑正是活链路 —— 所以**接进路由**（`/settings/prefrontal`，设置页有入口），而不是删掉。另一套「外部进程架构」的 `prefrontal_cluster_page.dart` / `prefrontal_provider.dart` / `prefrontal_service.dart` 构成自引用闭环、零外部引用，已连同 ~107 处硬编码中文一起删除；`lib/services/prefrontal/README.md` 重写成实际架构。

**已知缺口**：CI 不构建 Rust，所以 CI 出的 APK 没有这个 `.so`。另 3 个 ABI（x86_64 / armeabi-v7a / x86）尚未构建，每 ABI 约 10 分钟。

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
| **Resonance** | `https://github.com/iBLOC/resonance` | 任务编排、规划、工作流引擎 |
| **Prefrontal** | `https://github.com/iBLOC/prefrontal` | 多智能体执行引擎 |
| **Hippocampus** | `https://github.com/iBLOC/hippocampus` | 长期记忆存储 |
| **Shadow** | `https://github.com/iBLOC/shadow` | 用户分身系统 |
| **Shadow-Desktop** | `shadow-desktop/` | 桌面端执行器 (Tauri) |
| **Shadow-Mobile** | `shadow-mobile/` | 移动端执行器 (Flutter) |

## 技术栈

| 层级 | 移动端 | 桌面端 |
|------|--------|--------|
| **UI 框架** | Flutter 3.41.4 | React 19 + Tauri v2 |
| **状态管理** | Riverpod | Zustand 5 |
| **路由** | GoRouter | React Router 7 |
| **本地推理** | MNN (LiteRT + MNN) | neuron (embedded at :8085) |
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
- **现状 (2026-07-19)**: 已被 `neuron` 取代; neuron 通过 `run_embedded()` 在 Shadow-Desktop Tauri shell 内 :8085 提供推理服务, 默认 candle runtime。candle-vllm 不再作为桌面端默认引擎。

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

## Recent changes (2026-09-24 / 2026-09-25)

39+ commits landed after the 2026-09-23 audit cycle. Highlights (full e2e gap analysis in [`2026-09-25-e2e-coverage-assessment.md`](docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md)):

| Area | Change | Commits |
|---|---|---|
| **hippocampus 任务板接入双端** (2026-10-28) | 桌面端 `CortexTaskSection` 挂进 TaskBoardPage（hippocampus 任务列表 + 详情/编辑弹窗 + 刷新/删除）；移动端任务卡片可点开详情，编辑弹窗从"写好了没人引用"变成真能走通；两端统一遵守 `TaskRecord` 契约 —— 标题/描述/优先级没有对应列，编辑只暴露后端真正持久化的状态与标签，客户端建的标题改放 `payload`；修移动端 `createTask` 缺 `taskId`/`targetAgent`（后端 400）、看板漏掉 failed/cancelled 两列、读取失败从不显示；桌面端新增 `silent` 选项避免挂载即弹全局错误框 | `2f8b472`, `c3221d0`, `c53c256` |
| **Benchmark harness 收口 + 双被测物真跑分** (2026-10-26/27) | τ²/SWE/GAIA/TB 四套件适配器全部入库可复跑（4042 行 WIP 收口）；agentic 模式真落地（此前 `[agent.mode]` 被 serde 静默丢弃）；跨模型 2×4 矩阵（deepseek/MiMo）；**shadow-desktop 被测物首个完整真跑分**（core-smoke 6/10，wdio 真应用栈）；behavior delta=产品边界（desktop 0/5 vs encephalon 5/5，对话路径无动作面）；修复 6 个 harness 缺陷（cmd.exe 吞 POSIX、answer_contract 丢失、hidden_files 不物化、孙进程管道挂死、180s 误杀→task_timeout_secs）+ 2 个环境问题（pytest editable 污染、WAT 违反 ABI）+ **neuron KV cache 竞态**（chat() reset/generate 分窗，77+58=135，neuron `2bce199`）；prefrontal 定时任务落地（`39563ad`）。总成绩单见 `benchmark/docs/benchmark-positioning.md` §3.5 | `b6ef666`…`3199b15`（shadow 15+）、prefrontal `39563ad`/`18fd479`、neuron `2bce199` |
| **ACP outbound delegation** (2026-09-27, local) | prefrontal `acp_delegate` tool + `acp_outbound` registry dispatch tasks to ACP coding agents (OpenCode / Claude Code / Codex) via `synapse::acp::AcpClient`; `Config.acp` presets; `acp_stub_agent` test double; synapse fix: `session/update` chunks were silently dropped (SessionNotification envelope) | uncommitted in `prefrontal` / `synapse` |
| **Rename chain closed** | cortex → encephalon → **telencephalon** (`telencephalon` is the active repo; `cortex/` directory is empty) | `b077a24`, `7128409`, `b0af1d7`, `f2d0015` |
| **Port unification** | :8443 → `:60080` across all lobes (cortex/temporal/occipital/parietal `CORTEX_URL`) | `2757fea` |
| **4-lobe GitHub homes** | Final decision: bare names `iBLOC/{temporal,occipital,parietal,prefrontal}`. `parietal-lobe/` skeleton superseded. Workflow schema + runtime moved to `cerebellum/` (2026-09), then **on to `telencephalon/crates/` 2026-10-14** — cerebellum now reserved for embodied intelligence. | `1dd1f0c`, `d7cfec7`, `43f9e97` |
| **Recording mode R1-R4** | RecordingPage UI + Tauri commands (recording_start/stop/status/events/list/report) + lobe ownership rule (音频→颞叶 / 视觉→枕叶) + recording summary + LanceGraph edges | `a1e3509`, `de0913e`, `8520c31`, `afa8d60`, `3600166`, `30d7f59`, `0390379`, `856621c`, `965bc15`, `ec467b7` |
| **MCP catalog 5×28 + transport-aware MCPPage** | stdio / http / wasm transports, 5 built-in servers × 28 tools; button import fixes | `ccae5ce`, `1c0c3ec`, `5679021`, `f02ba35` |
| **Workflow Studio v1 (R-12/R-13 closure)** | Drag-drop editor, originally `cerebellum/apps/editor`, now **`telencephalon/apps/editor`** (2026-10-14) + Univer locale deps | `4023493`, `93f4ef9` |
| **Subsystem management panel** | 3-tier auth client (thalamus / hippocampus / neuron preview/config) | `cd84a71` |
| **Cortex sidecar → embedded encephalon** | Tauri shell boots `Encephalon` + `diencephalon::Thalamus` in `setup()` | `be50b7f` |
| **Computer Use R-10/R-11** | 11 `cu_*` commands + ComputerUsePage + Windows UI Automation + preview-before-commit modal | `84418a2`, `9c46327`, `c37b163`, `b5743fc` |
| **browser-use R-08/R-09** | WebviewWindow per-task + PreviewButton + PreviewsPage | `b834d20`, `858f0df` |
| **Document productization DOC-01..05** | `<UniverSheet>` + `/document/:taskId` route + Feishu MCP bridge + open-lark backend + FeishuPublishedCard + Feishu Settings toggle + per-task result management with local git | `2bb8932`, `90878db`, `00c43fc`, `d7d1466`, `8bbc260`, `2aa0d3b` |
| **AudioEventChip R-01** | R-11 SSE schema + UniverSheet i18n | `c08da1d` |
| **History tab R-04/05** | TaskDetailDialog | `f246c31` |
| **shadow-desktop build fixes** | ziti-sdk patch + dep-graph + API-drift fixes; i18n JSON repaired; pnpm tauri dev running | `cc1b787`, `2fee8eb`, `73b4cda`, `8f01cde`, `89e478b` |
| **hippocampus voiceprint store** | Embedding table for audio enrolment (BC-01 pipeline anchor) | `6aea5e1` |
| **diencephalon BC-01** | `subscribe_audio` / `unsubscribe_audio` MCP tools + `Thalamus::stream` public method | `7593343`, `4e96474`, `8fc67d9` |
| **neuron** | `neure → neuron` rename; `AppState::register_engine`; test count → 618 | `e3d2c41`, `bccef7c` |
| **synapse** | `transport::ziti` module + A2A metadata wire-forwarding via `__encephalon_meta_v1__` + audio providers | `8ff2294`, `135f1fd`, `cdb6249` |

For the end-to-end coverage assessment of all the above (which has zero e2e in CI today), see the companion E2E assessment doc.

## 设计规范版本控制策略

`/home/ibloc/Projects/docs/superpowers/specs/` **不是 git 仓库**。架构规范（如 `2026-06-04-shadow-architecture-redesign.md`）的修改不进入 git 历史，依赖**手动 SOP 同步**。

决策记录（2026-06-08 → 2026-06-09）：评估 neuron 重构后的代码/文档对齐时，Layer 2 ENGINE 块加入了 neuron 说明。该修改已反映在以下文档中：
- `/home/ibloc/Projects/AGENTS.md` PROJECTS 表（neuron 列入 Layer 2，synapse 列为 shared/突触层）
- `/home/ibloc/Projects/docs/architecture.md`（完整架构图 + 内嵌 Mermaid + 生物类比 §8）
- `/home/ibloc/Projects/docs/diagrams/architecture.mmd`（SVG/PNG 渲染源文件）
- `https://github.com/iBLOC/hippocampus/AGENTS.md`（synapse path dep 关系说明）
- 8 个项目根目录分别放置了 `ARCHITECTURE.md` 指针文件

