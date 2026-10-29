# 通信链路：大脑 → 端脑 → 叶区

**日期**：2026-10-29
**起因**：用户定调 ——「所有的通信都要走大脑 端脑 叶区，两个客户端都需要维持这个链路」。

---

## 1. 这条链路是什么

```
客户端（桌面 / 移动）
   │  HTTP：端脑方言
   ▼
端脑 telencephalon ──► 叶区（进程内 native lobe：temporal / prefrontal / parietal）
   │                        │
   │                        └──► neuron（唯一那个推理实例）
   ▼
海马体 hippocampus（长时记忆，挂在 /hippocampus 下）
```

客户端**不是推理后端的客户端**。它只跟端脑说话；推理由叶区发起，叶区再调 neuron。

### 为什么这条链路不能被绕过

绕过了会**静默失效**，而不是「少个功能」：

| 绕过 | 后果 |
| --- | --- |
| 端脑不在链路上 | 意图路由、工具、flow 全都不在链路上 → 客户端**永远收不到 `tool_call` 事件** |
| 叶区不在链路上 | 人格 / 记忆注入无处落地；对话变成无状态单轮 |
| 直连 neuron | 同上，而且两端行为分叉（桌面端一套、移动端另一套） |

桌面端**真实发生过**这件事：`telencephalonClient.ts` 里有一个 `isTauri()` 分支，
Tauri 下对话直连 neuron 的 `/v1/chat/completions`（`streamMessageNeuron` +
`neuron_infer` Tauri 命令），会话也是本地桩（`newLocalConversation`）。
于是「影子给客户端换主题」在桌面端根本不成立 —— 没有 `tool_call` 可渲染。

---

## 2. 改之前的现状（实测）

| 面 | 状态 |
| --- | --- |
| 端脑 → 叶区 | ✅ 真的经过叶区：`api/shadow.rs` 的 `send_message_stream` 从 `lobe_cache` 取叶区 → `SkillRouter::build_lobe_client_with` → native lobe 走进程内 `LobeClient::NativeWithConfig` |
| 移动端 → 端脑 | ✅ 已经在链路上：`chat_provider.dart` 走 `/shadow/v1/conversations`（嵌入式大脑挂的 `cortex_router`） |
| 桌面端 → 端脑 | ❌ **旁路**：`isTauri()` → `streamMessageNeuron` 直连 neuron；会话是本地桩 |
| 桌面端 sidecar | ❌ 只挂了海马体（`hippo_http.rs`，`/hippocampus`），端脑的 HTTP 面根本没起 |
| 移动端本地直连 | ⚠️ `main_agent/main_agent.dart`（`MainAgentNotifier`）—— **全仓无消费者**，但留着就可能被重新接上 |

端脑侧还有一个更深的缺口：**端脑只把「当前这一条」发给叶区**，会话历史和系统提示词
都留在自己的会话存储里、不往下传 ⇒ 链路上**没有多轮上下文，也没有人格**。

---

## 3. 桌面端改造

### 3.1 sidecar：起完整端脑面（`src-tauri/src/cortex_http.rs`）

替换掉只挂海马体的 `hippo_http.rs`：

```rust
let (state, conv_store, hippocampus_state) =
    telencephalon::boot::build_app_state(Some(stack.neuron().as_ref())).await?;
let app = telencephalon::api::build_full_app(
    state, conv_store,
    Some(stack.neuron().router()),          // neuron 的 OpenAI 面挂根
    Some(hippocampus_server::build_router_unit(hippocampus_state)),  // 海马体挂 /hippocampus
);
```

挂载形状与**独立运行的端脑完全一致**（复用端脑自己的 `build_full_app`，不自己拼）：

```
127.0.0.1:60080
  ├── /shadow/v1/*            会话 / agent
  ├── /api/telencephalon/*    管理面
  ├── /hippocampus/api/*      长时记忆
  └── /v1/chat/completions    neuron 的 OpenAI 兼容面
```

**前端一行没改**：`telencephalonStore.ts` 的 `DEFAULT_BASE_URL` 就是 `http://127.0.0.1:60080`。

三个关键决策：

1. **海马体只有一份。** `encephalon` 的 `hippocampus` feature 在桌面端**关掉**
   （`Cargo.toml` 里 `default-features = false, features = ["telencephalon"]`）：海马体状态由
   `telencephalon::boot::build_app_state` 建，路由也从**同一个** state 挂出来。两份 Lance
   指向同一份存储会互相抢锁。
2. **叶区指向活着的那个 neuron。** `neuron::create_router` 每次调用都会**重建**
   `ServerState`，所以合并进端脑面的那张 neuron 路由和进程内**活的**那个不是同一份状态。
   装配完 AppState 后用 `state.native_lobes.reconfigure(name, url)` 把三个叶区的 LLM 端点
   显式改到 `stack.neuron_addr()`（桌面端 `127.0.0.1:8085`）。
3. **`telencephalon` 必须是 path 依赖，且和 `encephalon` 指向同一个目录** —— 两份端脑
   = 两套 `AppState` / `ConversationStore` 类型，互相传不过去。

### 3.2 前端：去掉旁路（`telencephalonClient.ts`）

| 改前 | 改后 |
| --- | --- |
| `createConversation`：`isTauri()` → `newLocalConversation()` | 恒走 `POST /shadow/v1/conversations` |
| `streamMessage`：`isTauri()` → `streamMessageNeuron()` | 恒走 `POST /shadow/v1/conversations/{id}/messages:stream` |
| `health()`：探 neuron `/health` | 探端脑 `/api/telencephalon/status`（同时回报 `neuron_reachable`） |
| 人设：`streamMessageNeuron` 里塞进本地 history | 人设随**会话创建**送进端脑（`createConversation({ system })`） |

删掉的东西：`newLocalConversation`、`streamMessageNeuron`、`pickNeuronModel`、`neuronHistory`、
`neuronModel`、`NEURON_CHAT_MODEL_FALLBACK`，以及 Tauri 命令 **`neuron_infer`** ——
直连推理的 IPC 门直接拆掉，链路不留后门。

> `neuron_infer` 拆掉后，`AppState.embedded_stack` 只剩「钉住大脑生命周期」的作用
> （`Arc<Embedded>` 是 neuron 监听 / thalamus / ACP 总线的持有者），标了 `#[allow(dead_code)]`。

### 3.3 桌面端多轮 / 人设怎么保住

端脑只发「当前这一条」⇒ 光切链路，多轮上下文和自定义人设会丢。
用户在两条路里选了**端脑提 PR 补上下文转发**（见第 4 节），桌面端这边按端脑的
canonical 机制走：人设随会话创建送进端脑，端脑记进会话记录并转发给叶区。

---

## 4. 端脑 PR：会话上下文转发

**分支**：`feat/shadow-system-prompt`（已有 worktree `C:\Projects\iBLOC\telencephalon-wt-feat`）
**PR**：#1（已开，本轮扩到多轮历史）

端脑仓是他人 WIP（master 上 84 个 dirty 文件）⇒ 一律走**分支 + PR**，绝不碰它的工作区。

### 设计：复用已有的 metadata 通道，不改 wire format

shadow API 把 metadata map 打包进 `metadata["name"]`（v1 线上唯一透传的 key），
叶区用 `decode_metadata_from_name` 还原 ⇒ **加字段不用改协议**。

| 转发的东西 | metadata key | 叶区侧读取 |
| --- | --- | --- |
| 会话级系统提示词 | `"system"` | `extract_system_prompt()` → `compose_system_prompt()` 拼在叶区基线之后 |
| 先前几轮 | `"history"` | `extract_history()` → `llm_messages()` 还原成 LLM 消息 |

### 多轮历史的细节

- `history_of(&conv)` 在 `conversations.rs`：跳过系统提示词那条，其余按
  `TurnRole::User → "user"` / `TurnRole::Agent → "assistant"` 映射，**最旧在前**。
- **两条上限**：`MAX_HISTORY_TURNS = 20`、`MAX_HISTORY_CHARS = 12_000`。
  多了会炸上下文窗口（云端供应商还会烧钱）。超出时**先丢最旧的**。
- 系统提示词那条**只在第一轮**且角色是 Agent 时才算（`system_prompt_of`）——
  会话可以从导入的 session 来，导入的 agent 消息不能冒充系统提示词。
- 叶区侧 `llm_messages(text, system, history)`：system 在前 → 历史 → 当前这一轮在最后。

### 端脑仓本地的构建前提

`lance-encoding` 的 build script 要 `protoc`。本机没有系统 protoc，但 cargo registry 里有
`protoc-bin-vendored-win32-3.3.0`：

```powershell
$env:PROTOC="$env:USERPROFILE\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\protoc-bin-vendored-win32-3.3.0\bin\protoc.exe"
```

---

## 5. 移动端

移动端**本来就在链路上**，这轮做两件事：

1. **删掉本地直连的死路径**：`lib/agents/main_agent/main_agent.dart`（`MainAgentNotifier`）
   —— 它直接拿 `ModelEngine`（本地 MNN）跑推理，**全仓无消费者**。留着就可能被重新接上，
   移动端会静默退回旧链路。连带从 `agent_provider.dart` 移除 `mainAgentProvider`。
   （`main_agent_prompt.dart` 保留 —— 提示词设置页在用它的默认人设。）
2. **人设接进会话创建**：`chat_provider.dart` 之前 `createConversation()` **不带 system**，
   提示词设置页存的人设根本没进链路。现在随会话创建送出去，和桌面端同一条机制。
   用 `String? Function()` 而不是值 —— 改人设不重建 `ChatNotifier`（那会把当前对话冲掉）。

---

## 6. 守门员：把规则写成可执行的检查

`scripts/check-brain-chain.mjs`（仓根，接进 CI 的 `Brain chain check`）。

| 规则 | 拦什么 |
| --- | --- |
| `desktop-no-direct-inference` | 桌面端客户端引用 `neuron_infer` 或 `/v1/chat/completions` |
| `desktop-no-cortex-bypass` | `telencephalonClient.ts` 又长出 `newLocalConversation` / `streamMessageNeuron` |
| `desktop-sidecar-mounts-cortex` | sidecar 没挂端脑面（`cortex_http.rs` 必须真的调用 `build_full_app`） |
| `desktop-no-infer-command` | sidecar 又暴露直连推理的 Tauri 命令 |
| `mobile-chat-through-cortex` | 移动端对话不经过 `TelencephalonClient` / `/shadow/v1/conversations` |
| `mobile-no-local-llm-orchestrator` | 移动端留着 `MainAgentNotifier` |

### 两个实现坑

1. **只认代码行，不认注释。** 这个仓的注释里经常**解释**被禁的东西（「直连 neuron 的老路
   已经删掉」），拿注释当证据会满屏误报。
2. **不要手写注释词法分析器。** 曾经写过一个状态机，遇到 Rust 的**跨行字符串续行**
   （`tracing::info!("... \` 换行接着写）时字符串状态跨行断裂，把后面的代码整段当成注释吃掉
   —— 而且这种坑只在某个文件里出现一次，极难定位。改成**行级判定**（行首是 `//` / `*` / `/*`
   就跳过）后稳定。
3. **白名单**：`shadow-desktop/src/lib/openaiClient.ts` 是**云端供应商 / 语音**客户端
   （TTS、转写、模型列表），生产代码里只被 `lib/tts.ts` 用 —— 它不是对话链路的一部分。

### 反向验证

塞两个探针文件进去（桌面 `neuron_infer` + 移动 `MainAgentNotifier`）→ 守门员 **exit 1**
并精确点名两个文件；删掉探针 → **exit 0**。规则不是摆设。

---

## 7. 验证记录

| 项 | 结果 |
| --- | --- |
| 桌面 `pnpm exec tsc --noEmit` | **exit 0** |
| 桌面 `pnpm exec vitest run` | **112 文件 / 1140 passed / 2 skipped** |
| 桌面 `cargo check --tests`（src-tauri） | **exit 0**（只有存量告警） |
| 移动 `flutter analyze --no-fatal-infos --no-fatal-warnings` | **0 error**，89 issues（与基线一致） |
| 移动 `flutter test --reporter compact` | **247 / 247 全绿** |
| `node scripts/check-brain-chain.mjs` | **0 阻断**（反向验证：塞旁路 → exit 1） |
| `node scripts/check-agent-surface.mjs` | 0 阻断 / 0 提示 |
| 端脑分支 `cargo test --lib` | 见下 |

> 桌面 vitest 有一个连带修复：`ConversationPageTokenStats.test.tsx` 的模块 mock 必须提供
> `composeSystemPrompt` —— 人设改走会话创建之后，页面在 `createConversation` 之前就会调它。
> 这正是新链路的副作用被测试抓到了。

---

## 8. 遗留 / 待办

- **端脑 PR #1 待合并**。合并前，桌面端的人设**到不了模型**（端脑只把 system 记在会话里，
  不往下传）—— 链路的**形状**已经对了（人设确实送进了端脑），但叶区要到 PR 合并后才拿得到。
- **多轮上下文同理**：桌面端此前靠本地 `neuronHistory` 有多轮；切链路后要等端脑 PR 合并。
- **真机未验**：设备失联 ⇒ 桌面端 Tauri 起端脑面后的实跑没验过（只做了编译 + 契约测试），
  移动端同理。
- **云端供应商还没进叶区**：叶区的 LLM 端点只有一个（`TELENCEPHALON_NEURON_URL`），
  桌面端 provider_manager 配的云端模型怎么选到叶区，是另一个问题。
- **`/v1/chat/completions` 仍挂在端脑根上**（与独立端脑同形状），叶区默认指向它；
  本轮显式改到了 neuron 的真实监听 `:8085`，但两个面都在，属于已知冗余。
