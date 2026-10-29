[![CI](https://github.com/ibloc/shadow/actions/workflows/ci.yml/badge.svg)](https://github.com/ibloc/shadow/actions/workflows/ci.yml)

# Shadow (影) — 每个人的影子 / A Personal Agent for Everyone

Shadow 是跑在**用户自己设备上**的个人助理（AI 影子）。桌面端与移动端是**同一个 agent 的两个终端**：共享同一套大脑、同一套端脑、同一份设计语言。

> Canonical project knowledge base: **[`AGENTS.md`](AGENTS.md)**（持续更新）。本 README 只做落地页摘要；细节以 `AGENTS.md` 与 [`docs/superpowers/architecture/`](docs/superpowers/architecture/) 为准。

## 🔗 通信链路 —— 所有通信都走 大脑 → 端脑 → 叶区

```text
桌面端 (Tauri 2 + React 19)                 移动端 (Flutter + shadcn_ui)
        │                                            │
        │            端脑方言 /shadow/v1/*            │
        ▼                                            ▼
  大脑 encephalon (进程内)                 大脑 encephalon (libencephalon.so)
        │                                            │
  端脑 telencephalon :60080                端脑 telencephalon (进程内随机端口)
        │                                            │
  叶区 temporal / prefrontal / parietal  (端脑内的 native lobe)
        │
  neuron —— 唯一推理实例（桌面端 :8085）
```

**客户端不直接调推理。** 意图路由、工具调用（`tool_call`）、工作流、人格注入全都发生在端脑与叶区。绕过它们，对话照样能回话，但 agent 的能力会**静默失效**——桌面端真实发生过这件事（`isTauri()` 分支让对话直连 neuron，于是永远收不到 `tool_call`）。

这条规则不是口头约定：[`scripts/check-brain-chain.mjs`](scripts/check-brain-chain.mjs) 把它写成 6 条可执行检查并接进 CI（`Brain chain check`）。改造全文见 [`docs/superpowers/architecture/2026-10-29-brain-chain.md`](docs/superpowers/architecture/2026-10-29-brain-chain.md)。

## 🧩 项目结构 / Projects

| 项目 | 路径 | 说明 |
|---|---|---|
| **shadow-desktop** | [`shadow-desktop/`](shadow-desktop/) | Tauri 2 + React 19 桌面端。Rust sidecar 内嵌**大脑 + 端脑 + 叶区 + 单一 neuron**，端脑 HTTP 面在 `127.0.0.1:60080`。 |
| **shadow-mobile** | [`shadow-mobile/`](shadow-mobile/) | Flutter 3.47.8 + shadcn_ui 移动端。Android 进程内嵌 `libencephalon.so`（大脑 + 端脑 + 叶区），端脑面由 JNI 取回随机端口。 |
| **shadow-esp32** | [`shadow-esp32/`](shadow-esp32/) | Zephyr 边缘客户端（v0.x 概念阶段），mDNS `_shadow._tcp` + A2A（JSON-RPC）。 |
| **benchmark** | [`benchmark/`](benchmark/) | 性能基准与三方对照报告。 |
| **brand** | [`brand/`](brand/) | 品牌几何真相源 + logo / 平台图标生成器。 |
| **scripts** | [`scripts/`](scripts/) | 跨端守门员与生成器（链路 / 能力清单 / 设计 token / 导航 / 品牌）。 |

## 🎨 一份真相源，两端投影

| 真相源 | 投影产物 |
|---|---|
| [`design-tokens.json`](design-tokens.json) | `shadow-desktop/src/styles/tokens.css`、`src/styles/accent.g.ts`、`shadow-mobile/lib/theme/app_tokens.g.dart`、`lib/theme/shad_scheme.g.dart`（`scripts/gen_tokens.mjs`） |
| [`agent-surface.json`](agent-surface.json) | 能力清单与两端导航：`src/navigation/nav.g.ts`、`shadow-mobile/lib/navigation/nav.g.dart`（`scripts/gen_nav.mjs`） |
| [`brand/geom.mjs`](brand/geom.mjs) | 产品 logo 与全套平台图标（`brand/gen-logo.mjs`、`brand/gen-icons.mjs`） |

统一的是**语义**（色彩、节奏、命名、能力名），分叉的是**容器形态**（桌面 WebView vs Android 原生）。两端不是「长得一样」，是「说同一种话」。

## 🧠 核心特性 / Core Features

- **统一链路** — 两端都走 大脑 → 端脑 → 叶区；意图路由、工具调用、工作流、人格注入都在链路上。
- **进程内大脑** — 桌面端 `encephalon::Embedded::boot()`，移动端 `libencephalon.so`；推理实例只有一个（neuron）。
- **长时记忆** — 海马体挂在端脑面的 `/hippocampus/api/*`；人设与主题色可以写成 `dimension=Agent` 的记忆。
- **外观可定制** — 主题色、玻璃强度、对话框背景都是运行时变量；品牌色是**用户可覆盖的槽位**，影子本身保持中性。
- **对话为主** — 对话是两端唯一主干与默认落地页；语音 / 直播 / 客服是对话的**形态**，不是并列 tab。
- **可执行的跨端契约** — 5 个守门员脚本进 CI：通信链路、能力清单、设计 token 漂移、导航漂移、品牌资产漂移。

## 📚 文档 / Documentation

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 唯一知识库（canonical）：架构决定、坑、验证记录。**改动前先读它。** |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 平台架构：链路、组件职责、端口、协议。 |
| [`docs/superpowers/architecture/`](docs/superpowers/architecture/) | 现行架构文档。2026-10-29 系列：链路改造、视觉语言、logo 定稿、跨端设计系统、对话为主 IA、人格与外观。 |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) · [`plans/`](docs/superpowers/plans/) · [`scenarios/`](docs/superpowers/scenarios/) | **历史设计记录**（2026-03 ～ 2026-09，44 份），按日期存档，描述的是**当时**的决策，不是现状。 |

> 现状与历史记录冲突时，以 `AGENTS.md` + `docs/superpowers/architecture/` 为准。

## 🧪 本地校验 / Local checks

```bash
# 仓根：跨端守门员 + 生成物漂移
node scripts/check-brain-chain.mjs      # 通信链路 6 条规则
node scripts/check-agent-surface.mjs    # 能力清单 ↔ 两端路由 ↔ 手写色值
node scripts/gen_tokens.mjs --check     # 设计 token 漂移
node scripts/gen_nav.mjs --check        # 导航结构漂移
node brand/gen-icons.mjs --check        # 品牌资产漂移

# 桌面端
cd shadow-desktop
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build:web
cargo check --tests --manifest-path src-tauri/Cargo.toml

# 移动端（不要并发跑两个 flutter 命令）
cd shadow-mobile
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
```

桌面端的 Rust sidecar 依赖兄弟仓（`encephalon` / `telencephalon` / `hippocampus` / `synapse` / `diencephalon`），是**本地 path 依赖**——克隆后需要把兄弟仓放在同级目录。

## 🤝 贡献 / Contributing

改动前先读 [`AGENTS.md`](AGENTS.md)。跨端改动要**同时**改两端并跑齐上面的守门员；生成物（token / 导航 / 图标）改完必须重跑生成器，CI 会查漂移。

## 📝 License

Apache License 2.0
