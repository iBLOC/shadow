# shadow-desktop

Shadow 的**桌面端**：Tauri 2 + React 19 的外壳，Rust sidecar 在**同一个进程**里跑着大脑、端脑、叶区和唯一的 neuron 实例。

桌面端与移动端是同一个 agent 的两个终端 —— 通信链路完全一致：**大脑 → 端脑 → 叶区**。

## 技术栈

| 领域 | 选型 |
|---|---|
| 外壳 | Tauri 2（Rust sidecar + 系统 WebView） |
| UI | React 19.1 + TypeScript ~5.8.3 + Vite 7 |
| 状态 / 路由 | Zustand 5.0.2 / React Router 7.1.1 |
| 组件 | shadcn/ui（Radix + CVA）+ Tailwind 3.4.19 + lucide-react |
| 测试 | Vitest 3.1（单测）+ Playwright（E2E）+ WebdriverIO（Tauri / Web） |
| 其他 | i18next（en-US / zh-CN）、zod、swr、echarts、@modelcontextprotocol/sdk |

## 运行

```bash
pnpm install

pnpm tauri dev     # 桌面应用（会编译 Rust sidecar）
pnpm dev           # 只跑前端开发服务器
pnpm dev:web       # 纯 Web / PWA 构建的开发服务器
```

> `pnpm tauri dev` 需要**同级目录**有兄弟仓：`../encephalon`、`../telencephalon`、`../hippocampus`、`../synapse`、`../diencephalon`。它们是**本地 path 依赖**（不是 crates.io / git），少一个就编不过。
>
> 纯 Web 构建没有 sidecar，需要另有端脑在 `127.0.0.1:60080` 提供服务。

## 目录

```text
shadow-desktop/
├── src/                    React 前端
│   ├── pages/              路由页面（对话 / 任务 / 能力 / 设置 …）
│   ├── components/         组件（ui = shadcn 原语，另有 chat / task / brand / business …）
│   ├── stores/             Zustand store（theme / conversation / telencephalon / taskBoard …）
│   ├── lib/                客户端（telencephalonClient / hippocampusClient / openaiClient / tts …）
│   ├── navigation/nav.g.ts   ← 生成物
│   ├── styles/tokens.css     ← 生成物
│   ├── styles/accent.g.ts    ← 生成物
│   ├── i18n/               en-US / zh-CN
│   └── config/
├── src-tauri/              Rust sidecar
│   └── src/
│       ├── lib.rs            启动：boot 嵌入式大脑 + 起端脑 HTTP 面
│       ├── cortex_http.rs    端脑 + neuron + 海马体 合成一台服务（:60080）
│       ├── computer_use.rs   宿主 RPA（鼠标 / 键盘 / Windows UI Automation）
│       ├── provider_manager.rs / model_store.rs   模型与供应商
│       ├── mcp_catalog.rs / feishu_mcp/            MCP 目录与飞书 MCP
│       ├── config_manager.rs / crypto.rs           配置与加密
│       └── recording/ / ws_client.rs / mdns.rs …   录制 / WS / 发现
├── e2e-tests/              Playwright 用例
├── tests/                  Vitest 用例 + API 契约快照
└── web/                    纯 Web 入口
```

## 通信

前端**只**跟端脑说话（`src/lib/telencephalonClient.ts`，`DEFAULT_BASE_URL = http://127.0.0.1:60080`）。

| 场景 | 端点 |
|---|---|
| 会话（创建 / 列表 / 发消息 / 流式） | `/shadow/v1/conversations*` |
| agent（列表 / 详情） | `/shadow/v1/agents*` |
| 端脑状态 | `/api/telencephalon/status` |
| 记忆 | `/hippocampus/api/*` |
| **推理** | **客户端不许碰** `/v1/chat/completions` |

人设走**会话创建**：`composeSystemPrompt(persona)` → `createConversation({ system })` —— 与移动端同一机制。

细节见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` / `pnpm dev:web` | 开发服务器 |
| `pnpm build` / `pnpm build:web` | 构建（Tauri / 纯 Web）；两者前置都会跑 `pnpm test:api` |
| `pnpm exec vitest run` | 单元测试 |
| `pnpm test:api` | API 契约测试（先抓端点快照再跑） |
| `pnpm test:e2e` | Playwright E2E（需要 `xvfb-run`） |
| `pnpm test:wdio` | WebdriverIO（Web） |
| `pnpm test:tauri` | WebdriverIO（Tauri 应用） |
| `pnpm lint` | ESLint |

## 约定

- **行尾是 CRLF**（仓库 `core.autocrlf=true`）。新写或生成的 `.tsx` 记得转成 CRLF。
- 设计 token 与导航是**生成物**：改 `../../design-tokens.json` 或 `../../agent-surface.json` 之后要跑 `node ../../scripts/gen_tokens.mjs` / `node ../../scripts/gen_nav.mjs` —— CI 会查漂移。
- 主题色派生算法（`deriveAccentTones`）与移动端是**同一套规则**，契约快照在 `../../scripts/accent-tones.fixture.json`，两端各断言一次。
- 不要在客户端引入直连推理的代码路径 —— `node ../../scripts/check-brain-chain.mjs` 会拦（`Brain chain check`）。

## 相关

- 平台架构：[`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- 链路改造全文：[`../docs/superpowers/architecture/2026-10-29-brain-chain.md`](../docs/superpowers/architecture/2026-10-29-brain-chain.md)
- 本目录知识库：[`AGENTS.md`](AGENTS.md)
