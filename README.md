[![CI](https://github.com/ibloc/shadow/actions/workflows/ci.yml/badge.svg)](https://github.com/ibloc/shadow/actions/workflows/ci.yml)

# Shadow (影) — AI 用户分身系统 / AI User Avatar

**Layer 4 (Interaction)** — Shadow 是用户的 AI 安全分身，运行在用户设备上（桌面或移动端），代表用户执行日常任务和工作。所有执行都是**任务目标驱动**：Shadow 不主动行动，只接受来自 **Resonance** 的任务派发。
*Shadow is the user's secure AI avatar that runs on user devices (desktop or mobile) and represents the user for daily tasks. All execution is **task-goal driven** — Shadow never acts proactively, only accepting task dispatch from **Resonance**.*

> Canonical project knowledge base: **[`AGENTS.md`](AGENTS.md)** (382 lines, updated 2026-09-25). This README is the landing-page summary only.

## 🧩 项目结构 / Projects

| Project / 项目 | Path | Description / 说明 |
|---|---|---|
| **shadow-desktop** | `shadow-desktop/` | Tauri v2 + React 19 桌面端，Tauri commands + Zustand 5 + React Router 7，神经元嵌入式 :8085 (`run_embedded()`) |
| **shadow-mobile** | `shadow-mobile/` | Flutter 3.11+ 移动端，Riverpod + GoRouter + MNN (LiteRT) 本地推理 |
| **shadow-esp32** | `shadow-esp32/` | Zephyr 4.4.x + C 边缘客户端（v0.x 概念阶段），mDNS `_shadow._tcp` + A2A (JSON-RPC) |
| **shadow-benchmark** | `benchmark/` | 性能基准 + leaderboard 三方对照（桌面 / encephalon-server / engine），`shadow-benchmark` crate |

## 🏗️ 4-层架构 / 4-Layer Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 4: INTERACTION (本仓库 / this repo)                          │
│   shadow-desktop · shadow-mobile · shadow-esp32 · shadow-benchmark  │
├────────────────────────────────────────────────────────────────────┤
│ Layer 3: AGENT (外部项目 / external)                                │
│   Prefrontal   https://github.com/iBLOC/prefrontal      Port 8082  │
│   Rust multi-agent 引擎 (A2A / MCP / skill / session orchestration)  │
├────────────────────────────────────────────────────────────────────┤
│ Layer 3.5: CORTEX (端脑 / per-shadow hub)                            │
│   Telencephalon https://github.com/iBLOC/telencephalon  Port 60080  │
│   agent registry + A2A gateway + WASM host + MCP management          │
├────────────────────────────────────────────────────────────────────┤
│ Layer 2: ENGINE                                                      │
│   neuron        github.com/ibloc/neuron    Port 8083 (8085 embed)   │
│   candle / burn / litert 三个 ML 后端 / three ML backends           │
├────────────────────────────────────────────────────────────────────┤
│ Layer 1: MODEL                                                       │
│   云端 MiniMax / OpenAI / Anthropic / DeepSeek + 本地 GGUF /       │
│   MNN / candle / burn                                            │
└────────────────────────────────────────────────────────────────────┘
```

完整架构图 / Full diagram: `AGENTS.md §系统架构` + `docs/architecture.md`

## 🧠 核心特性 / Core Features

- **任务目标驱动** / **Task-goal driven** — 所有执行由 Resonance 统一派发
- **零信任安全** / **Zero-trust** — mTLS 双向认证，Shadow 主动发起连接；可选 OpenZiti dark service
- **本地推理能力** / **Local inference** — 移动端 MNN (LiteRT) + Kotlin `OpenAIServer.kt`；桌面端 neuron (embedded :8085)
- **多端 + 多引擎** / **Multi-end + multi-engine** — 桌面 / 移动 / 边缘；candle / burn / litert / MNN
- **A2A 协议** / **A2A protocol** — Shadow 向 Resonance 注册能力，Benchmark 评分同步
- **MCP 目录 5×28** / **MCP catalog 5×28** — stdio / http / wasm 三种 transport
- **Recording mode R1-R4** / **录制模式** — 音频→颞叶 / 视觉→枕叶，事件 + 总结 + LanceGraph 边
- **Workflow Studio v1** — Drag-drop 编辑器 at `cerebellum/apps/editor` (R-08/R-09)

## 📚 文档 / Documentation

- **[`AGENTS.md`](AGENTS.md)** — 项目知识库 / Project knowledge base (canonical, 382L)
- **[`docs/superpowers/specs/`](docs/superpowers/specs/)** — 设计规范 / Design specs
- **[`docs/superpowers/architecture/`](docs/superpowers/architecture/)** — 架构审计 / Architecture audits
- **最近改版 / Recent changes** — `AGENTS.md §Recent changes` (2026-09-25 audit cycle)

## 🤝 贡献 / Contributing

See [`AGENTS.md`](AGENTS.md) for full project context. PRs welcome — please run:
- `cargo test --workspace` in any sub-project before pushing
- `pnpm tauri dev` for shadow-desktop local verification

## 📝 License

[Apache License 2.0](LICENSE)