[![CI](https://github.com/iBLOC/shadow/actions/workflows/ci.yml/badge.svg)](https://github.com/iBLOC/shadow/actions/workflows/ci.yml)

# Shadow (影) — 每个人的影子 / A Personal Agent for Everyone

Shadow 是跑在**用户自己设备上**的个人助理（AI 影子）。桌面端与移动端是**同一个 agent 的两个终端**：共享同一套大脑、同一套端脑、同一份设计语言。

> Canonical project knowledge base: **[`AGENTS.md`](AGENTS.md)**（持续更新）。本 README 只做落地页摘要；细节以 `AGENTS.md` 与 [`docs/superpowers/architecture/`](docs/superpowers/architecture/) 为准。

## ⬇️ 下载 / Download

**一个仓库，一个下载入口** —— 桌面端、移动端都在本仓的
[Releases 页面](https://github.com/iBLOC/shadow/releases/latest)。

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `*.msi` | 安装包（推荐） |
| macOS | `*.dmg` | Apple Silicon / Intel 通用 |
| Linux | `*.deb` · `*.AppImage` · `*.rpm` | 依发行版挑 |
| Android | `*.apk` | 按 ABI 分包 |

发布由 [`.github/workflows/release.yml`](.github/workflows/release.yml) 在 `v*` 标签上触发：三个桌面平台的 Tauri 包 ＋ Android APK **一起挂到同一个 Release** 上。桌面端的自动更新也从这个页面取 `latest.json`。

> 源码与全部客户端都在本仓：`shadow-desktop/`（Tauri 2 + React 19）、`shadow-mobile/`（Flutter）、`shadow-esp32/`（Zephyr 边缘端）。

## 🔗 通信链路 —— 所有通信都走 大脑 → 端脑 → 叶区

```text
客户端（桌面 WebView ／ 移动端 Dart）
   │  HTTP —— 唯一入口：大脑那张面
   ▼
大脑 encephalon（进程内 ／ .so 内）
   │
   ├─ 「大脑那张面」＝ 一张 router（由大脑统一组装，三处宿主同形）
   │    ├─ 端脑方言   /shadow/v1/*     ← 端脑 telencephalon
   │    ├─ 推理面     /v1/*            ← neuron（唯一推理实例，router-only）
   │    └─ 记忆面     /hippocampus/*   ← 海马体（端脑 boot 时建的那份状态）
   │
   ├─ 端脑 telencephalon ＝ **组件**：只提供路由与方言，
   │    **自己不起 http-server**（「端脑 :60080」这种说法是错的）
   │    └─ 叶区 temporal / prefrontal / parietal（端脑内的 native lobe）
   │
   └─ neuron ＝ **router-only**：推理面挂在脑面根上，**不再自己监听端口**
        （桌面端的 `:8085` 早已作废 —— 客户端不许知道 neuron's 地址）
```

**那张面由宿主起，不是由端脑起。** 端脑是进程内的组件，它只贡献路由与方言；真正 `bind` 端口、`axum::serve` 的是**宿主**：

| 宿主 | 谁起面 | 绑在哪 | 面里有什么 |
|---|---|---|---|
| 桌面端 Tauri 主进程 | 桌面 Rust 侧 `telencephalon_http::serve`（同进程 spawn） | `127.0.0.1:60080` | 端脑方言 ＋ 推理面 ＋ `/hippocampus` |
| 移动端 `libencephalon.so` | .so 内的 Encephalon 启动面 | `127.0.0.1:<随机端口>`，端口经 JNI 交回宿主 | 端脑方言 ＋ 推理面（默认 `mobile` profile 不编海马体 ⇒ 无 `/hippocampus`；`mobile-memory` profile 会编 ⇒ 那张面也在） |

**客户端不直接调推理。** 意图路由、工具调用（`tool_call`）、工作流、人格注入全都发生在端脑与叶区。绕过它们，对话照样能回话，但 agent 的能力会**静默失效**——桌面端真实发生过这件事（`isTauri()` 分支让对话直连 neuron，于是永远收不到 `tool_call`）。客户端**只有一个入口**——大脑那张面；知道 neuron's 地址就是绕过大脑的第二个入口。

这条规则不是口头约定：[`scripts/check-brain-chain.mjs`](scripts/check-brain-chain.mjs) 把它写成 6 条可执行检查并接进 CI（`Brain chain check`）。改造全文见 [`docs/superpowers/architecture/2026-10-29-brain-chain.md`](docs/superpowers/architecture/2026-10-29-brain-chain.md)。

## 🧩 项目结构 / Projects

| 项目 | 路径 | 说明 |
|---|---|---|
| **shadow-desktop** | [`shadow-desktop/`](shadow-desktop/) | Tauri 2 + React 19 桌面端。**桌面主进程内嵌**大脑（端脑 + 叶区 + 单一 neuron，不是独立进程）；由桌面 Rust 侧起那张面，绑 `127.0.0.1:60080`。 |
| **shadow-mobile** | [`shadow-mobile/`](shadow-mobile/) | Flutter 3.47.8 + shadcn_ui 移动端。Android 进程内嵌 `libencephalon.so`（大脑 + 端脑 + 叶区），那张面由 .so 起、端口经 JNI 取回（随机端口）。 |
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
- **进程内大脑** — 桌面端 `encephalon::Embedded::boot()`，移动端 `libencephalon.so`；推理实例只有一个（neuron，router-only 挂在脑面上，不自己监听端口）。
- **长时记忆** — 海马体挂在**大脑那张面**的 `/hippocampus/*`（端脑 boot 时建的那份状态）；人设与主题色可以写成 `dimension=agent` 的记忆（⚠️ **维度值只收小写**：`agent` / `user` / `session` / `resources`，写成 `Agent` 会被海马体以 `Invalid dimension` 拒收）。
- **外观可定制** — 主题色、玻璃强度、对话框背景都是运行时变量；品牌色是**用户可覆盖的槽位**，影子本身保持中性。
- **对话为主** — 对话是两端唯一主干与默认落地页；语音 / 直播 / 客服是对话的**形态**，不是并列 tab。
- **可执行的跨端契约** — 仓内 **62 道** `check-*.mjs` 闸，其中 **26 道**接在 `ci.yml` 里：通信链路、能力清单、设计 token 漂移、导航漂移、品牌资产漂移……闸的结论**带分母**（真判 N ｜ 判不了 K ｜ 红 M）⇒ ⇒ 「绿」这个字不含量。

## 📚 文档 / Documentation

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 唯一知识库（canonical）：架构决定、坑、验证记录。**改动前先读它。** |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 平台架构：链路、组件职责、端口、协议。 |
| [`docs/superpowers/architecture/`](docs/superpowers/architecture/) | **多数是带日期的设计/审计/实测快照**（28 份里只有 5 份还能当现状读）⇒ ⇒ 逐份状态见 [`INDEX.md`](docs/superpowers/architecture/INDEX.md)，**先看它再点进任何一份**。 |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) · [`plans/`](docs/superpowers/plans/) · [`scenarios/`](docs/superpowers/scenarios/) | **历史设计记录**（2026-03 ～ 2026-09，44 份），按日期存档，描述的是**当时**的决策，不是现状。 |

> 现状与历史记录冲突时，以 `AGENTS.md` + `ARCHITECTURE.md` 为准。`docs/superpowers/architecture/` 里那几份标着 ✅ 的现行文档，也只对它们各自的主题负责（视觉语言、logo、门/闸治理、flow::learner 对照）。

## 🧪 本地校验 / Local checks

```bash
# 仓根：跨端守门员 + 生成物漂移
node scripts/check-brain-chain.mjs      # 通信链路 9 条规则
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

桌面端是**进程内**跑大脑的（不是独立 sidecar 进程）：它的 Rust 侧直接 path 依赖两个兄弟仓 —— `encephalon` 与 `synapse`；端脑 / 海马体 / 叶区 / neuron 都由 `encephalon` **传递**引入（`encephalon/Cargo.toml` 里才有 `../telencephalon`）。克隆后需要把兄弟仓放在**与本仓同级**的目录（`../<repo>`），否则 path 依赖解析不到。

## 🤝 贡献 / Contributing

改动前先读 [`AGENTS.md`](AGENTS.md)。跨端改动要**同时**改两端并跑齐上面的守门员；生成物（token / 导航 / 图标）改完必须重跑生成器，CI 会查漂移。

## 📝 License

Apache License 2.0
