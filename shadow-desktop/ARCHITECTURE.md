# shadow-desktop 架构

> 本文描述**现状**。平台级架构见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)；改造全过程见 [`../docs/superpowers/architecture/2026-10-29-brain-chain.md`](../docs/superpowers/architecture/2026-10-29-brain-chain.md)。

## 进程模型

桌面端是**一个进程**：Tauri 的 Rust 侧里同时住着大脑、端脑、叶区和 neuron，前端只是这个进程的 WebView。

```text
┌─ shadow-desktop 进程 ────────────────────────────────┐
│  Tauri / wry WebView                                  │
│    └── React 前端（Zustand / React Router）           │
│         │  HTTP  127.0.0.1:60080                      │
│  Rust sidecar                                          │
│    ├── 嵌入式大脑  encephalon::Embedded                │
│    │      thalamus（间脑）+ ACP 总线                   │
│    │      └── 端脑 telencephalon                       │
│    │             └── 叶区 temporal / prefrontal / parietal │
│    │                    └── neuron  127.0.0.1:8085    │
│    └── telencephalon_http.rs —— 端脑 HTTP 面  :60080    │
└────────────────────────────────────────────────────────┘
```

## 启动顺序

1. `src-tauri/src/lib.rs` → `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })`
   - `Embedded` 持有 thalamus、ACP 总线、端脑，以及**唯一**的 neuron 实例。
   - 它只负责**钉住生命周期**：`AppState.embedded_stack` 标了 `#[allow(dead_code)]` —— 客户端**不允许**拿它直接推理。
2. 后台任务里 `telencephalon_http::serve(&stack)` 起端脑的 HTTP 面：
   - `telencephalon::boot::build_app_state(Some(stack.neuron().as_ref()))` —— 端脑自己的 `AppState` / 会话存储 / 海马体状态；
   - `state.native_lobes.reconfigure(name, stack.neuron_addr())` —— 把三个叶区的 LLM 端点改到 `:8085`；
   - `telencephalon::api::build_full_app(state, conv_store, Some(neuron.router()), Some(hippocampus.router()))`；
   - bind `127.0.0.1:60080`。**端口被占用不算错** —— 那说明外面已经有一台端脑在跑，前端正该连那台。

## 挂载形状

```text
127.0.0.1:60080
  ├── /shadow/v1/*            端脑 shadow API（会话 / agent）
  ├── /api/telencephalon/*    端脑管理面（状态 / provider / MCP / 任务 / 语音 / thalamus 预览）
  ├── /hippocampus/api/*      海马体（长时记忆）
  └── /v1/chat/completions    neuron 的 OpenAI 兼容面（挂在根）
```

与**独立运行的端脑完全一致** —— 所以前端一行都不用改，`DEFAULT_BASE_URL` 本来就是 `http://127.0.0.1:60080`。

## 前端

| 模块 | 职责 |
|---|---|
| `src/lib/telencephalonClient.ts` | 端脑方言的**唯一**客户端：`createConversation` / `streamMessage`（`messages:stream`）/ `health`（探 `/api/telencephalon/status`） |
| `src/lib/hippocampusClient.ts` | 海马体客户端，打 `{端脑}/hippocampus/api/*` |
| `src/lib/openaiClient.ts` | **云端供应商 / 语音**客户端（TTS、转写、模型列表）—— **不是**对话链路（守门员白名单） |
| `src/lib/appearanceMemory.ts` | 主题色 ↔ 海马体记忆（`preference://theme/accent`，`dimension = Agent`） |
| `src/stores/themeStore.ts` | 外观运行时变量：主题色、玻璃强度、对话框背景 |
| `src/stores/telencephalonStore.ts` | 端脑连接状态与 `DEFAULT_BASE_URL` |

### 人设怎么到模型

```text
提示词设置页 → promptStore → composeSystemPrompt(persona)
   → createConversation({ system }) → 端脑记进会话 → 转发给叶区 → 模型
```

端脑把 system 与多轮历史打包进已有的 metadata 通道下发（叶区 `decode_metadata_from_name` 还原），**wire format 不变**。

> ⚠️ 端脑侧的上下文转发目前在 PR 分支上（`feat/shadow-system-prompt`）。**合并之前**，人设与多轮历史只到端脑、不进模型 —— 链路的形状对了，模型还没拿到。

## 为什么是这套形状

桌面端曾经有一条 `isTauri()` 分支：对话直连进程内 neuron 的 `/v1/chat/completions`，会话是本地桩 `newLocalConversation`。后果是桌面端**永远收不到 `tool_call`** —— 意图路由、工具、flow、人格注入全都不在链路上，「影子给客户端换主题」在桌面端根本不成立。

这些旁路现在全部删除：

| 已删除 | 替代 |
|---|---|
| `newLocalConversation`（本地桩会话） | `createConversation`（端脑） |
| `streamMessageNeuron`（直连 neuron 的流） | `streamMessage`（端脑 `messages:stream`） |
| `pickNeuronModel` / `neuronHistory` / `NEURON_CHAT_MODEL_FALLBACK` | 端脑的 agent 与会话状态 |
| Tauri 命令 `neuron_infer` | 无 —— 链路不留后门 |

## 海马体只有一份

`Cargo.toml` 里 `encephalon` 是 `default-features = false, features = ["telencephalon", "hippocampus", "ziti"]` —— `hippocampus` **显式**要回来（2026-11-05 之前是端脑那条直连边带的，现在由大脑转发 `telencephalon/hippocampus` ＋ `dep:hippocampus-server`）。海马体状态由 `telencephalon::boot::build_app_state` 建，路由从**同一个** state 挂出来。两份 Lance 指向同一存储会互相抢锁。

⚠️ 2026-11-05：桌面端**不再直连**端脑 / 间脑 / 海马体 —— 三个都是 `encephalon` 的 re-export（`encephalon::telencephalon::…` / `encephalon::diencephalon::…` / `encephalon::hippocampus_server::…`）⇒ ⇒ 依赖图上「大脑 → 端脑」是**唯一**一条边 ⇒ ⇒ 端脑的 feature 集合**完全由大脑决定** ⇒ ⇒ 桌面端不会再偷偷打开端脑的 default feature。

## 依赖约束

| 依赖 | 形式 | 为什么 |
|---|---|---|
| `encephalon`（大脑） | `path = "../../../encephalon"`，`default-features = false`，`features = ["telencephalon", "hippocampus", "ziti"]` | **唯一**一条进大脑内部的边。端脑 / 间脑 / 海马体都从它 re-export 出来 ⇒ ⇒ 同一个 path ⇒ ⇒ cargo unify 成**一个** crate ⇒ ⇒ 两套 `AppState` / `ConversationStore` 类型传不过去的问题不会发生。 |
| `neuron` | `path = "../../../neuron"`，`default-features = false`（**仅 dev-dependency**） | 测试要用嵌入运行时；**必须与端脑同源同路径**，否则 cargo 编出两份 neuron，类型对不上。 |

⚠️ 2026-11-05 **删掉的三条直连边**：`telencephalon` / `diencephalon` / `hippocampus-server` —— 它们与 `encephalon` 里的那些是**同一个 path**，所以两条边并不会产生第二份代码，但会让「**谁决定 feature**」变模糊（端脑的 default 被桌面端那条边全打开）。⇒ ⇒ 要用端脑的 API 一律写 `encephalon::telencephalon::…`。

## 可执行的不变量

`node ../scripts/check-brain-chain.mjs` 拦下面 6 条（CI job `Brain chain check`）：

1. 桌面端客户端不得直连推理（`neuron_infer` / `/v1/chat/completions`）
2. 桌面端客户端不得有绕过端脑会话 API 的平台分支
3. 桌面端 sidecar 必须挂起端脑的 HTTP 面
4. 桌面端 sidecar 不得再暴露直连推理的 Tauri 命令
5. 移动端对话必须走端脑方言（`/shadow/v1/conversations`）
6. 移动端不得保留本地直连推理的对话编排器

## 本地校验

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build:web
cargo check --tests --manifest-path src-tauri/Cargo.toml
node ../scripts/check-brain-chain.mjs
node ../scripts/check-agent-surface.mjs
```
