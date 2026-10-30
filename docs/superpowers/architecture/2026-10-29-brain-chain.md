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
- **~~真机未验~~（2026-10-30 已验，见 §9）**。
- **云端供应商还没进叶区**：叶区的 LLM 端点只有一个（`TELENCEPHALON_NEURON_URL`），
  桌面端 provider_manager 配的云端模型怎么选到叶区，是另一个问题。
- **`/v1/chat/completions` 仍挂在端脑根上**（与独立端脑同形状），叶区默认指向它；
  本轮显式改到了 neuron 的真实监听 `:8085`，但两个面都在，属于已知冗余。

---

## 9. 真机复验（2026-10-30）

设备：小米 MIX 4（`2106118C` / Android 13 / arm64-v8a / Odin + SD835）。

### 9.1 断点精确定位：叶区 → LLM 那一跳

重建了 `libencephalon.so`（`encephalon/scripts/build-android.ps1`，33 min，150.5 MB）
与含链路改造 Dart 代码的 APK，装到真机后逐段验证：

| 段 | 状态 | 证据 |
| --- | --- | --- |
| 大脑（neuron OpenAI 面） | ✅ | `/health` → `{"status":"healthy"}`；`/v1/models` → 25 个模型 |
| 端脑面 | ✅ | `files/flows` 的 mtime = 点「启动大脑」那一刻；`/.well-known/agent.json`、`/shadow/v1/agents` 均 200，四个 native 叶区都在 |
| 端脑会话 | ✅ | `POST /shadow/v1/conversations` → 200 + RFC3339 `created_at` |
| **叶区 → LLM** | ❌ **断** | `messages` 与 `messages:stream` 均 `502`：`Failed to get models: error sending request for url (http://localhost:60080/v1/models)` |

`localhost:60080` 是**桌面 sidecar 的端口**，移动端上没有任何东西监听它。

### 9.2 根因：改了一套存储，调用读的是另一套

`NativeLobeRegistry` 同时持有两份叶区：

| 存储 | 内容 | 谁在用 |
| --- | --- | --- |
| `inner` | `Arc<dyn NativeLobe>` | **shadow API**（`build_lobe_client_with` → `native_registry.get()`） |
| `runtimes` | `LobeRuntime`（带 `openai_base_url`） | `reconfigure` / `point_lobes_at_neuron` |

`point_lobes_at_neuron` 改的是 `runtimes`；而 `LobeClient::NativeWithConfig` 拿到的是 `inner` 里的
trait 对象，自己读环境变量 `TELENCEPHALON_NEURON_URL`，读不到就退回硬编码的
`http://localhost:60080` ⇒ **宿主的配置对实际调用路径完全无效**。

⚠️ **桌面端有完全相同的 bug**：`shadow-desktop/src-tauri/src/cortex_http.rs:126` 用的也是
`state.native_lobes.reconfigure(...)`，改的同样是 `runtimes`。

### 9.3 修法

让**端点跟着 client 走**，而不是让 client 自己去猜：

- `LobeClient` 新增 `NativeAt(lobe, config, url)` 变体，端点由宿主在构造时给
  （取自 registry 的 runtime，即宿主真正 `reconfigure` 过的那个）。
- 环境变量只作**兜底**（registry 里没有该叶区的 runtime 时）。
- 两条回归测试：端点必须真的到达 client；永远不许退回那个死端口。

### 9.4 还差最后一环：移动端怎么给 neuron 配 LLM

修好端点后，neuron 能被正确命中，但 `available_count = 0`（无本地模型）。
而 **neuron 的所有 LLM 后端都靠环境变量选**（`NEURON_LLM_RUNTIME` /
`NEURON_REMOTE_BASE_URL` / `NEURON_MODEL_DIRS` …），**App 进程注入不了环境变量**
（Android 的 zygote 决定）⇒ 需要一条不依赖环境变量的配置通道。

现有 `shadow-mobile/lib/services/model_download_service.dart` 走的是 **LiteRT `.litertlm`**
（Kotlin 侧 `OpenAIServer.kt` / `MNN`），与 neuron 的 candle / gguf 是**两套引擎**，接不上。

---

## 10. 补上 LLM 供给：程序化注册通道（2026-10-30）

§9.4 留下的问题是「移动端怎么给 neuron 配 LLM」。答案分两半：**通道怎么建**，
以及**注册进去的东西为什么没生效**——后者踩到了 neuron 上游的一个真 bug。

### 10.1 供给通道：程序化注册，不走环境变量

neuron 的 remote 引擎**只认环境变量**（`NEURON_REMOTE_BASE_URL` /
`NEURON_REMOTE_MODELS` / `NEURON_REMOTE_API_KEY`，见
`neuron::server::state::ServerState::new`）。而 Android App 进程的环境变量由
zygote 决定，**宿主从外部注入不了**（Android 10+ 连 `/proc/<pid>/environ`
都读不到）⇒ 环境变量路线在移动端是死的。

于是另开一条**程序化**通道（上游 `telencephalon`）：

| 层 | 东西 |
| --- | --- |
| `telencephalon::neuron_embed` | `RemoteLlmProvider { base_url, api_key, model }` + `register_remote_llm(state, provider)` —— 把 `neuron::engine::remote::RemoteLlmEngine` 注册进 **`state.engines.llm`**（新派发表），注册键 = 上游模型 id；无默认引擎时同时设为默认 |
| `telencephalon::neuron_embed` | `NeuronEmbed::register_remote_llm(&self, provider)` —— 委托方法，注册进**活着的那份** neuron 状态 |
| `encephalon::embedded` | `LlmProvider` + `EmbeddedConfig.llm_provider` + `Embedded::llm_provider()`；`Embedded::boot` 里注册远端引擎 |
| `encephalon::mobile` | `encephalon_mobile_set_llm_provider(base_url, api_key, model)`（**必须在 `start` 之前**）+ `encephalon_mobile_get_llm_provider()`；JNI 入口 `nativeSetLlmProvider` |
| `shadow-mobile` | `EncephalonRuntime.kt` / `MainActivity.kt` 的 `com.ibloc.shadow/encephalon_runtime` channel 新增 `"setLlmProvider"`；`encephalon_mobile_service.dart` 的 `setLlmProvider(...)`；`encephalon_mobile_provider.dart` 的 `_applyCloudProvider()`（启动前把本地 SQLite `models` 表里 `source='cloudProvider'` 的那条推给大脑） |

**为什么注册进 `state.engines.llm` 而不是旧的 `llm_registry`**：`/v1/chat/completions`
的路由挂的是 `adapter_dispatch`（`neuron/src/server/mod.rs` 的 `routes()`），它按
`state.engines.lookup` 找引擎；旧表只认磁盘上的权重，云端模型没有权重。

**为什么「注册引擎」和「叶区会用它」是两件事**：叶区是按**模型 id** 去请求
neuron 的 OpenAI 面的，宿主还必须把叶区的默认模型指到那个 id 上
（`state.native_lobes.set_default_model_for_all_lobes(model)`）。两件事都做了
才会通；只做一件仍然回 `NO_MODEL_CONFIGURED`。

**端点要含 `/v1`**：neuron 拼的是 `{base_url}/chat/completions`。

### 10.2 真机撞上的第二个坑：neuron 建了**两份** `ServerState`

通道建好、装到真机、供应商也配好了，发消息仍然失败，但**错误变了**：

```text
502 {"error":{"code":5022,
  "message":"neuron returned 404 Not Found: {\"error\":{\"type\":\"no_engine_for_model\",\"message\":\"no engine registered for model 'mock-model'\"}}"}}
```

错误形状很关键：模型 id `mock-model` **到了 neuron**（说明宿主→大脑→叶区→
neuron 这一段全通），但 neuron's 派发表里**查不到**这个模型。

根因在 neuron 上游：`neuron::run_embedded`（`src/embedded.rs`）把
`ServerState` 建了**两份**：

```rust
let state = ServerState::new(config.clone());   // ① 交给 NeuronHandle.state
let router = create_router(config.clone());      // ② create_router 内部又建了一份
                                                //    —— 这份才是真正在服务请求的
```

两份不是同一个实例。于是往 `NeuronHandle.state` 里注册的引擎，**listener
完全看不见**——请求落到另一份 state 上，只能回 `no_engine_for_model`。

⚠️ **同一类问题的第三个实例**：`NeuronEmbed::router()` 原来调
`neuron::create_router(self.config.clone())`，那是**第三份** state ⇒
端脑内嵌的 neuron's OpenAI 面与进程内 `infer()` 各说各话。

### 10.3 修法：只建一份 state，listener 与 router 共用

在 `telencephalon` 侧自己建**一份** `ServerState`，listener 与
`NeuronEmbed::state` 都用它：

- `neuron_router(state)` —— 复刻 `neuron::create_router` 的路由表 + 宽松 CORS，
  但由调用方决定用哪份 state；
- `start_neuron` 不再调 `neuron::run_embedded`，改为自建 state + 自建 router +
  自建 listener（`NeuronHandle` 的字段全是 pub，可以在 crate 外构造）；
- `NeuronEmbed::router()` 改用 `self.state`。

副作用：`ServerState::new` 从两次变一次（启动更快、内存更省），端脑内嵌的
neuron OpenAI 面与进程内 `infer()` 看到同一套注册表。

### 10.4 测试有效性：前两条测试是**真绿假绿**

⚠️ 值得单独记一笔：通道刚建好时写的两条测试
（`remote_llm_answers_through_the_neuron_route` /
`remote_llm_round_trips_tool_calls_through_the_neuron_route`）**是绿的**，
但真机是坏的。原因：它们**自己**建 state、自己建 router
（`neuron::server::routes().with_state(state)`），**绕开了生产路径**——
于是 §10.2 那个 bug 对它们完全不可见。

补第三条**走生产路径**的回归测试
（`remote_llm_is_reachable_through_the_started_neuron_listener`）：
从 `start_neuron` 起步 → 注册远端引擎 → 打那个 listener ⇒
这条在 bug 存在时必红。

**反向验证**：把 `start_neuron` 里的 router 改回 `neuron::create_router(...)`
（= 复现「两份 state」），新测试立刻变红（404 而不是 200）；
改回来又变绿。

### 10.5 装机验证：全链路跑通（2026-10-30）

设备：小米 MIX 4（`2106118C` / Android 13 / arm64-v8a）。PC 侧跑确定性 mock 上游
（`shadow-mobile/tool/mock_openai_server.mjs`，`http://192.168.31.147:8899/v1`，
model id `mock-model`），**mock 记录每一个请求** ⇒ 「人设与多轮有没有真的穿过去」
是可断言的事实，不是靠猜。

流程：模型管理页添加「云端供应商」（名称 `mock` / Endpoint
`http://192.168.31.147:8899/v1` / Key `testkey` / 模型名 `mock-model`）→
设置 → 嵌入式大脑 → 启动大脑。

证据：

| 段 | 结果 | 证据 |
| --- | --- | --- |
| 宿主 → 大脑的供给交接 | ✅ | 云端供应商写进本地 SQLite `models` 表（`source='cloudProvider'`），启动时 `_applyCloudProvider()` 推给大脑 |
| 大脑 → 端脑 | ✅ | 端脑面 `127.0.0.1:38535`：`/.well-known/agent.json` 200、`/shadow/v1/agents` 200（temporal/prefrontal/parietal/occipital 四个 native 叶区齐全） |
| 端脑 → 叶区 | ✅ | `POST /shadow/v1/conversations/{id}/messages` → **200**，`"reply":"MOCK-OK"` |
| 叶区 → neuron | ✅ | neuron 面 `127.0.0.1:40315`：`/health` → healthy；错误信息从 `localhost:60080` 断链 → `NO_MODEL_CONFIGURED` → `no_engine_for_model` → **消失** |
| neuron → 上游 | ✅ | PC 上的 mock 收到了请求，`model` = `mock-model` |

**人设与多轮（上游收到的原始请求）**：

```json
{"model":"mock-model","messages":[
  {"role":"system","content":"You are the temporal lobe of Shadow, a personal AI assistant. Reply concisely and helpfully.\n\nECLIPSE-PERSONA-42 你是影子的本地助理，代号 ECLIPSE-7，只用中文简短回答。"},
  {"role":"user","content":"第一轮：请报上你的代号，并说明你和人设里的设定一致吗？"},
  {"role":"assistant","content":"MOCK-OK"},
  {"role":"user","content":"第二轮：请把「ECLIPSE-7」这个代号再说一遍，谢谢。"}
],"stream":false}
```

⇒ **人设**（叶区默认 system + 会话创建时带的 system 拼在同一段）与
**多轮历史**（上一轮的 user + 上一轮的 assistant）都真的穿过了
大脑 → 端脑 → 叶区 → neuron → 上游的每一跳。

### 10.6 装机时撞到的另外两个缺口（都已修）

这两个都**不是** LLM 供给的问题，是链路本身的洞，值得单独记。

#### (a) 记忆查询意图在没有海马体时把整条消息变成 502

第二轮实测报 `502 / memory returned 404 Not Found: `。根因是**意图路由用
关键词规则**（`intent.rs` 的 `is_memory_query`：`记得` / `之前` / `上次` /
`历史` / `回忆`），命中后去打 `{端脑}/hippocampus/api/search` —— 而
**移动端 profile 不编海马体**（`telencephalon/hippocampus` 没被转发），
那条路由**根本不存在** ⇒ 404 ⇒ 整条消息失败。

「你还记得上次我说了什么吗」是极常见的问法 ⇒ 移动端只要提到这五个词之一，
聊天就断。

修法：记忆查询失败时**退回普通对话**（`_generateLitertResponse` 那条路本来
就是「先端脑、后本地」的形状），让模型用会话历史自己回答。回归测试
`memory_query_falls_back_to_chat_when_hippocampus_is_absent`（mock 上游只认
`/v1/chat/completions`，其余路由一律 404 —— 正好复刻「海马体不存在」的
形状）。

#### (b) 移动端对话页**永远进不了端脑链路**

真机上对话页卡在「初始化中…」，标题是 **LiteRT**。逐层看下来：

- `ChatNotifier` 构造函数无条件调 `_initLiteRT()`，而它**一上来就把
  `mode` 设成 `ChatMode.litert`**；
- `chat_screen.dart` 用 `isLitertMode = mode == ChatMode.litert` 决定渲染
  哪个视图 ⇒ 恒渲染 `PrefrontalChatView`；
- 而 `PrefrontalChatView` 走的是**前额叶方言**（`/api/sessions`）——
  「改嵌大脑」之后端脑面上**根本没有这条路由** ⇒ 永远转圈。

更要命的是 `generateResponse` 的守卫：

```dart
if (state.mode == ChatMode.litert && state.isLitertReady) { ... }
```

两个条件说的都是**本地** LiteRT 引擎 ⇒ 没装本地模型的设备上
**一条消息都发不出去**（函数直接返回）；`local_chat_view.dart` 里的输入框
`enabled` 也是同一个条件 ⇒ **输入框整个是禁用的**。

修法（Dart 侧，不涉及 `.so`）：

- `mode` 只在**本地引擎真的就绪**时才设成 `litert`（移到 `initLitert()`
  的成功分支）；没有本地模型时保持 `off` = 端脑链路；
- `generateResponse` / `generateResponseWithAttachments` **总是**走
  `_generateLitertResponse`（它自己的语义就是「先端脑、后本地」）；
- `ChatState.canChat` 取代「本地引擎就绪」作为输入框可用的条件。

⚠️ 这条的意义不止是「聊天能用」：它正是「**所有通信都要走 大脑 → 端脑 →
叶区，两个客户端都要维持这个链路**」这条规则在移动端 **UI 面**的兑现 ——
之前移动端那半边在代码上是断的。

### 10.7 `tool_call`：端脑那条事件分支以前**没有任何生产者**

端脑的 SSE 会话接口有一条 `tool_call` 事件分支
（`api/shadow.rs` 的 `TelencephalonStreamEvent::ToolCall` ⇒
`event: tool_call`）。它是「影子让客户端换主题」那条产品线的地基
（⑪ 条定的方向），所以值得把「它到底能不能响」查到底。

**逐层结论（都是读源码 + 实测，不是推测）**：

| 层 | 能不能产出 `tool_call` | 依据 |
| --- | --- | --- |
| 端脑事件翻译 | ✅ 能 | `a2a/client.rs` 的 `translate_event` 把 `AgentStreamEvent::ToolStart` / `ToolCall` 翻成 `TelencephalonStreamEvent::ToolCall` |
| native 叶区路径 | ❌ 不能 | `lobes/mod.rs` 全程只产 `Delta` / `Error`（47 处 `TelencephalonStreamEvent::Delta`，**零** `ToolCall`） |
| A2A 路径 | ❌ **以前不能** | 见下 |

⇒ **只有 A2A 对端能触发端脑的 `tool_call`**，而 A2A 那条路当时是断的。

#### 根因：工具事件在 A2A 线上被消灭了（两层）

**第一层 —— 协议形状**：A2A 官方的 `StreamResponse` 枚举只有
`Task` / `Message` / `StatusUpdate` / `ArtifactUpdate` 四个变体，
**没有任何一类能承载工具调用**。

**第二层 —— synapse 把工具事件降级成纯文本，然后自己丢掉**：

- 服务端（`synapse/src/a2a/server.rs`）：`AgentStreamEvent::ToolStart`
  被 `format!("Calling tool: {}({})", name, args)` 拍平成一句人话，塞进
  `StatusUpdate.status.message`，`metadata` 写 `None`；
- 客户端（`synapse/src/a2a/client.rs`）：
  `translate_a2a_response_to_agent_events` 只在 `state == Failed` 时把
  `StatusUpdate` 翻成 `Error`，**其余一律丢弃**。

⇒ 工具调用过了这一跳就变成了「一句没人读的文本」，端脑的 `tool_call`
分支**没有任何可达的生产者**。

#### 修法：用 `StatusUpdate.metadata` 开一条结构化旁路（改在 synapse）

`StatusUpdate` 有个自由格式的 `metadata` map —— 用它当旁路：

- 新模块 `synapse/src/a2a/tool_event.rs`：键名 `synapse_tool_event`，
  值是 `{ "kind": "start" | "call" | "end", ... }`；
- **服务端**：把结构化事件写进 `metadata`，**纯文本照样保留** ⇒
  老对端看到的还是老样子，线上没有任何东西被删；
- **客户端**：从 `metadata` 把原事件**还原**成 `AgentStreamEvent::ToolStart`
  / `ToolCall` / `ToolEnd` ⇒ 端脑 `translate_event` 的工具分支第一次
  真的可达。

**反向验证**（探针 = 把客户端的还原逻辑短路掉）：圆跳测试
`a2a::server::tests::tool_call_survives_the_full_a2a_hop` **FAILED**
（`exactly one event must come back: left 0, right 1`）—— 0 个事件
正是「工具调用在线上被消灭」的老行为；恢复后 synapse `a2a` 相关
**30 passed / 0 failed**。

#### 真机验证：端脑在手机上真的发出了 `tool_call`

PC 侧跑一个确定性 A2A 对端（`shadow-mobile/tool/mock_a2a_agent.mjs`，
`http://192.168.31.147:8898`，按那条旁路的线上格式发事件），注册进
**手机里**的端脑：

```
POST /api/telencephalon/admin/agents/register
{ "name": "toolbot", "endpoint": "http://192.168.31.147:8898",
  "skills": ["set_theme"], "version": "0.1.0", "provider_type": "custom" }
→ 200 {"name":"toolbot","kind":"external","skills":["set_theme"]}
```

端脑的流式会话（`POST /shadow/v1/conversations/{id}/messages:stream`）
**在手机上**返回：

```
event: tool_call
data: {"type":"tool_call","agent":"http://192.168.31.147:8898","name":"set_theme","args":"{\"color\":\"#71717A\"}"}

event: delta
data: {"type":"delta","agent":"toolbot","delta":"MOCK-A2A-OK (called set_theme)"}

event: done
data: {"type":"done","agent":"toolbot","state":"COMPLETED", ...}
```

PC 侧 mock 对端的请求日志（`mock_a2a_requests.jsonl`）反过来证明是
**手机**连过来的：

```json
{"method":"SendStreamingMessage","peer":"192.168.31.85",
 "body":{"jsonrpc":"2.0","method":"SendStreamingMessage",
   "params":{"message":{"role":"ROLE_USER","parts":[{"text":"把主题色换成靛蓝"}],
     "metadata":{"name":"__telencephalon_meta_v1__{\"source\":\"telencephalon-shadow\",\"target_agent\":\"toolbot\",\"skill\":\"shadow-conversation\"}"}}}}}
```

端脑仓也补了一条**走真实 A2A 客户端**的回归测试
（`a2a::client::tests::a2a_peer_tool_call_becomes_a_tool_call_event`）：
起一个本地 mock 对端 → 真的打一次 A2A → 断言端脑同时收到
`tool_call`（名字与参数原样穿过）与正文。

⚠️ **注意这个 `.so` 的依赖关系**：`telencephalon` 是 `synapse` 的
path 依赖 ⇒ **synapse 的改动会改变手机里的 `.so`**。这次为了带上
synapse 的修复，`libencephalon.so` 重编了 4m59s（增量）、
`flutter build apk` 40s ⇒ 装机后端脑才真的能发 `tool_call`。

#### ⚠️ 还没修的（明确记录，别以为通了就是通了）

**native 叶区 → LLM 那条路仍然只发 `Delta`。** 上面跑通的 `tool_call`
来自**外部 A2A 对端**，不是「模型自己决定调用客户端的工具」。要让
「用户说『把主题换成靛蓝』，模型自己决定调 `set_theme`」成立，还差：

1. **叶区**：`call_llm` 请求里带 `tools` 字段（现在没有），
   并把返回的 `choices[0].message.tool_calls` 翻成
   `TelencephalonStreamEvent::ToolCall`；
2. **工具执行回路**：端脑把 `tool_call` 发给客户端 → 客户端执行 →
   回传结果 → 端脑续上下一轮；
3. **两端客户端的渲染与执行**：桌面端有渲染骨架
   （`ToolPartRouter` / `ClientToolForm`）但**零消费方**；移动端
   **完全没有**。

好消息是第 1 步的地基已经有了：neuron 的 OpenAI 面**能往返
`tool_calls`**（`telencephalon` 侧有测试
`remote_llm_round_trips_tool_calls_through_the_neuron_route`），
所以剩下的是端脑叶区 + 两端客户端的活，不是协议问题。

### 10.8 模型路由：最小单位改成「叶区」（2026-10-30）

§10.1 那条「程序化注册通道」把「云端模型怎么进来」解决了，但**哪个叶区
用哪个模型**还只有一个全局开关。用户的要求是：

> 模型的使用最小单位是叶区，用户可以决定哪个叶区使用云端或者使用本地。
> 默认设本地就各叶区都走本地，默认设云端就各叶区都走云端，**单个叶区
> 可以覆盖**（比如任务决策的前额叶走本地、实际执行任务的区域走云端、
> 颞叶走本地）。

#### 两条边界（用户纠正过的，别再搞混）

| kind | 走哪条路 | 要不要配模型 |
| --- | --- | --- |
| **Native** | 端脑**进程内**执行，端脑自己发 LLM 请求 | ✅ **唯一**被 per-lobe 路由管的 |
| **External** | 外部 A2A 对端（`a2a`） | ❌ **不需要** —— 端脑只**转发**，用什么模型是对端自己的事 |
| **Wasm** | `wasm-runtime` | 🔧 **自定义叶区，独立配置** —— 不吃叶区的 `default_model` |
| **Prompt** | `telencephalon-prompt` | — 端脑用系统提示词执行，不需要模型路由 |

⇒ 路由表**只有 native 叶区**。叶区清单也是**从端脑读**
（`GET /api/telencephalon/lobes/list`），**不硬编码**叶区名 ⇒ 端脑注册了
哪些原生叶区就管哪些。

⚠️ **neuron 由大脑内嵌，端脑不重复嵌**：端脑面用的是大脑内嵌的那份
（`AppState.neuron_state` 取自 `NeuronEmbed::state()`，与 neuron's
listener 共用同一份状态）⇒ 远端引擎可以**运行时**注册 ⇒ **换模型来源
不必重启大脑**（§10.1 那条约束在这里被推翻了）。

#### 三层语义（一个键三种含义）

`lobe_models` 是**完整的覆盖集合**，一个键三种含义：

| 写法 | 含义 |
| --- | --- |
| **不在表里** | 跟随全局默认 |
| `Some(id)` | 固定用这个模型 |
| `null` | 强制回落本地 |

「不在表里」= 跟随全局，**不是**「不动」。

#### ⚠️ 两个自引入的缺陷（都是这轮自己发现并修掉的）

**(a)「跟随全局」名不副实** —— 第一版把全局默认与 per-lobe 覆盖**挤在
同一个字段**里，改全局默认会把每个叶区都写一遍 ⇒ **谁都不跟随谁**。
修法：注册表**分成两张表** —— `default_model`（全局默认）+
`lobe_model_overrides`（覆盖集合）。新 API：`set_global_default_model` /
`clear_default_model_for_lobe`（清覆盖 ⇒ 回全局）/ `replace_lobe_model_overrides`
（整份替换）/ `effective_default_model` / `lobe_model_override`。

顺带把两个容易混的动作拆开了：`set_default_model_for_lobe(name, None)`
= **强制本地**；`clear_default_model_for_lobe(name)` = **别管我，跟全局走**。

**(b) `config["model_id"]` 会静默盖过 per-lobe 路由** —— 叶区调 LLM 的
取值优先级是

```
config["model_id"]  >  叶区的 default_model  >  去 /v1/models 自动查找
```

所以 config 里那个**旧的** `model_id` 会让界面显示「已切到云端」而实际
还在跑老模型。修法：端点新增 `sync_lobe_model_configs` —— **有覆盖**就
写 `model_id`，**没有覆盖就把 `model_id` 删掉**（让全局默认说了算）。

#### 端脑面接口

```
POST /api/telencephalon/lobes/models
{ "default_model": "MiniMax-M3",
  "lobe_models": { "prefrontal": null, "temporal": "MiniMax-M3" },
  "providers": [ { "base_url": "...", "api_key": "...", "model": "..." } ] }
```

- `default_model` **三态**：字段不出现 = 不动 / `null` = 本地 / `"id"` = 该模型；
- `lobe_models` = **完整覆盖集合**（不在表里 = 跟随全局）；
- `providers` = 要注册进 neuron 派发表的全部远端引擎（**运行时**注册）。

⚠️ **客户端下发的必须是「覆盖集合」而不是「全量有效值」** —— 把每个
叶区的有效值都发下去会把「跟随全局」**钉死**（改全局默认时那些叶区不
跟着变）。两个面说的是**同一份 JSON**：端脑 HTTP 面与大脑 Rust 槽位的
字段名统一成 `providers` / `default_model` / `lobe_models`。

#### 验证（2026-10-30）

| 项 | 结果 |
| --- | --- |
| 端脑 `cargo test -p telencephalon --lib --no-default-features --features "flow candle"` | **475 passed / 0 failed**（新增 7 条） |
| 大脑 `cargo check --no-default-features --features mobile --lib` | **通过** |
| 移动端 `flutter analyze` | **0 error**（78 issues 全是既有风格 info/warning） |
| 移动端 `flutter test` | **300/300 全绿**（新增 3 条） |

⚠️ **端脑的默认 feature（带 hippocampus）现在编译不过** —— `hippocampus`
仓有**未提交改动**把 `hippocampus-server` 改挂了（`auth.rs` / `lib.rs`，
**不是路由的问题**）⇒ 本轮的端脑测试跑的是**移动端那套 feature**
（hippocampus 关掉）。跑带 hippocampus 的全量测试要先收尾那两个文件。

⚠️ **跨仓提醒**：`telencephalon` 与 `encephalon` 都改了 ⇒ 手机里的
`libencephalon.so` 变了 ⇒ 要重跑 `encephalon/scripts/build-android.ps1`
+ 重打 APK 装机，per-lobe 路由才会在真机上生效。**本轮没做真机复验
（手上没设备）**。

⚠️ **还没解决的**：「本地」在移动端仍是个抽象选项 —— neuron 里没有本地
权重，App 侧也没有本地模型目录（LiteRT 已下线）⇒「这个叶区用本地」
目前等价于「这个叶区不指定模型 id，去 neuron's `/v1/models` 里翻一个
`llm/` 前缀的可用模型」，翻不到就报 `NO_MODEL_CONFIGURED`。


### 10.9 移动端的「客户端工具」那一半（2026-10-30）

上一节留的三件事里，**第 3 件的移动端那一半**落地了。

#### 为什么要「客户端工具」这个概念

端脑的工具分两种：

| 谁执行 | 改什么 | 例子 |
| --- | --- | --- |
| **端脑本地工具**（`telencephalon::tools`） | 端脑**自己**的状态 | 读文件、查记忆 |
| **客户端工具**（`lib/services/client_tools/`） | **用户眼前这台设备**的状态 | 主题色、明暗、窗口、剪贴板、通知 |

**两端各有一份注册表** —— **能做什么由设备决定**：手机没有窗口可最小化，
桌面端没有麦克风权限可申请。

#### 形状

- `ClientTool` —— 名字 / 说明 / 要不要用户点头 / 真正干活的 `execute`
  （**抛异常 = 执行失败**，错误会回传给端脑，这样模型知道自己这条路走不通，
  而不是卡在等结果上）；
- `ClientToolRegistry` —— 工具名 → 工具；
- `ToolCallModel` —— 对话流里那张卡片的数据源，状态机
  `pending → running → (awaitingApproval) → succeeded / failed`。

内置工具目前只有 `set_theme`（`color` → 换主题色，`dark` → 切明暗）。
主题色的两端色调由 `app_colors.dart` 的 `deriveAccentTones` 派生
（与桌面端 `accent.g.ts` **同一套算法**）—— 两端算出来的明暗两端色调必须
一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。

#### 执行回路

端脑只负责**点名**（工具名 + 参数）；真正干活的是这台设备，干完再把结果
回传端脑（`TelencephalonClient.reportToolResult`）—— 端脑把它喂回模型，
模型才知道「主题已经换好了」，否则模型会一直等一个不来的结果。

端脑点了一个这台设备不会的活 ⇒ **明确失败并回传**，不闷着不吭声。

#### 三个具体的坑

1. **端脑的 `tool_call` 事件现在带调用 id**（`tool_call_id`，端脑生成的 uuid）
   ⇒ 两端把它回传，端脑按 id 精确对上号（同一轮里同名工具调两次也分得清）。
   **老端脑不带 id 时**客户端才自己合成一个（`client-tool-<序号>-<工具名>`）——
   用**单调递增的序号**而不是随机串：同一次会话里序号唯一就够，而且卡片
   按 id 排序时稳定（随机串会让卡片顺序看起来乱跳）。
2. **`args` 线上有两种形态** —— 端脑的 `ToolCall.args` 是 `String`
   （序列化出来是 JSON 文本），有些路径传的是已经拆好的 map ⇒
   `parseToolArgs` 两种都认。**认错的后果很具体**：拿到字符串还当对象用 ⇒
   参数全是空的，「把主题换成靛蓝」会退化成「换成默认色」，而且**看不出
   哪里错了**。
3. **两端要分开显示**：工具在本地跑成了 **≠** 端脑知道了 ⇒
   `ToolCallModel.reported` / `reportErrorText` 单独记，否则「本地换了主题、
   端脑那头模型还在等」会被看成成功。**认不出的颜色名不猜** —— 猜错一次，
   用户看到的主题色就和模型说的完全不是一回事，而模型以为自己成功了。

#### ⚠️ 闭环通了一半（这一节存在的意义）

客户端把结果回传到 `POST /shadow/v1/conversations/{id}/tool-results` ——
**端脑这条接收端路由已经补上了**（`telencephalon/src/api/shadow.rs`）⇒ 结果
**记进会话历史**（agent 角色 + `[tool_result] ` 前缀）⇒ 下一轮模型看得见
「我调过这个工具、结果是什么」；`ok=false` 渲染成 `→ failed` —— 失败不能长得
像成功。

⇒ §10.7 留的三件事现在的状态：

| # | 事情 | 状态 |
| --- | --- | --- |
| 1 | 叶区 `call_llm` 带 `tools` 并翻成 `ToolCall` 事件 | ✅ **通了**（端脑认客户端的 `tools`、透传给叶区、模型调客户端工具时发 `tool_call` 事件且**不自己执行**） |
| 2 | 端脑↔客户端的工具执行回路 | ✅ **通了**（端脑接收端已补上；`tool_call` 事件现在还带 `tool_call_id`） |
| 3 | 两端客户端的渲染与执行 | ✅ 两端都做完了（桌面端 `ToolCallMessageCard` + `ToolPartRouter` 已有消费方） |

**⚠️ 还差的两件事**（都不是「回传」这一环）：① **同一条 SSE 里端脑等结果后继续输出**没做 ——
上游 A2A 对端自己执行工具、从不等客户端（它的回合发完 `tool_call` 就跑完了
自己的 agent 循环，A2A 线上也没有「resume task」接口）⇒ 要「续跑」只能再发
一次上游调用（= 一次新的 agent 回合），或者在 synapse 里补一条反向结构化通道
（跨仓协议改动 + 重编 `.so`）⇒ **单独立项**；② **真机复验**（设备一接上就能跑：
端脑改了 ⇒ `.so` 要重编 ⇒ 重打 APK ⇒ 装机）。

验证：`flutter analyze` **0 error**、`flutter test` **334/334 全绿**（本节做完时）。

### 10.10 客户端工具的 JSON Schema —— 模型终于看得见工具的签名（2026-10-30）

上一节 §10.9 做完的是「**客户端**接到 `tool_call` 之后干什么」。这一节补的是
**它前面那一环**：**模型怎么知道 `set_theme` 要吃一个 `color` 还是 `dark`**。

#### 缺的是什么

没有工具签名时，模型只知道「有个叫 `set_theme` 的东西」⇒ 它只能**瞎猜参数**，
或者干脆不调。
⇒ 这一环不补，「模型自己让客户端换主题」永远是**看运气**的。

#### 两端各加了一份 `parameters`（JSON Schema）

- 桌面端 `src/lib/clientTools.ts`：`ClientTool.parameters?: ToolParameters`
  + `toOpenAiTools(registry)`；
- 移动端 `lib/services/client_tools/client_tool_registry.dart`：
  `ClientTool.parameters: Map<String, dynamic>?` + `toOpenAiTools(registry)`。

⚠️ **`parameters` 与界面表单的字段声明不是一回事**：后者描述的是**输入框**
（UI 变体），前者描述的是**参数**（JSON Schema）⇒ 两个都要有，各管各的。

⚠️ **两端同名工具必须导出同样的内容** —— 否则同一个模型在手机上和桌面上行为
不一样 ⇒ **两端测试各自断言同一份字面量**（桌面
`src/lib/__tests__/clientTools.test.ts` / 移动
`test/unit/client_tool_registry_test.dart`）⇒ **任一端漂移则该端测试立刻变红**
—— 跨仓没有共享运行时，这是唯一可行的保证方式。

`color` 与 `dark` **都不是必填**：给哪个都算一次合法调用；两个都不给时工具
**明确失败**，不默默什么也不做。

#### 线上契约

客户端随消息发 `tools`（OpenAI function-calling 数组）：
`[{type:'function', function:{name, description, parameters}}]`。
**端脑今天还不认识这个字段** ⇒ serde 默认忽略未知字段 ⇒ **带上无害** ⇒
客户端可以先发，等端脑接上即生效。

#### ✅ 端脑那边已经接上了（2026-10-30 晚）

**客户端发出去的 `tools` 不再是惰性的** —— 端脑这一半已经落地：

1. `SendMessageRequest` 认 `tools`（`#[serde(default)]` ⇒ **老客户端不发也不受影响**）；
2. 它搭 `synapse` 的 `Message.metadata` 便车透传给叶区 ⇒ **不用改跨仓协议**；
3. 叶区的 LLM 请求带 `tools`，并把返回的 `/choices/0/message.tool_calls` 翻成
   `TelencephalonStreamEvent::ToolCall` ⇒ 命中**客户端**工具时端脑**不执行**、
   只发事件（执行权在那台设备手上），并**结束这一回合**。

⚠️ **两族工具是合并的，不是两条路**：本体工具（MCP / 海马体图谱）与客户端工具
**一起**发给模型 ⇒ 模型在同一回合里既看得见「大脑能干什么」也看得见「这台设备
能干什么」。**为什么必须合并**：分两条的话，部署里**接了**海马体 MCP 的那一档，
问本体的问题时客户端工具就不可见；反过来优先客户端工具就把本体工具挡掉了 ⇒
两个都不可接受。

⚠️ **非流式端点明确拒绝客户端工具**（400）：那个端点只回一坨文本，**没有
`tool_call` 通道** ⇒ 工具调用会被**静默丢掉**（设备永远不知道要执行、模型一直等
一个不来的结果）⇒ **宁可大声拒绝，也不假装成功**。

⚠️ **仍然不做「同一条 SSE 里端脑等结果后继续输出」** —— 设备跑工具要一个来回，
端脑不能在同一回合里等 ⇒ 结果由客户端 POST 回
`/shadow/v1/conversations/{id}/tool-results` ⇒ 端脑记进会话历史 ⇒ **下一回合**
模型看得见。（本体工具那条回路是同一回合内自己执行自己继续，语义不同。）

#### ⚠️ 别把两条路混起来

端脑的**本体工具**（MCP / 海马体图谱）那条路**故意不发 `tool_call` 事件** ——
那个事件在 shadow SSE 上的含义是「**客户端**去执行这个工具」，发出去会让客户端
把同一个写操作**再执行一遍**。
⇒ **客户端工具要发事件、本体工具不发** —— 两条路的语义边界不能糊。

#### ⚠️ 桌面端有两条路，工具清单必须一致

`pages/ConversationPage.tsx`（现役）与 `lib/aiSdkTelencephalonTransport.ts`
（AI SDK 适配器，**今天零消费方**）。后者原先**不带** `tools` ⇒ 一旦被接上就是
「同一个模型、同一个问题，**走哪条路决定模型能不能调 `set_theme`**」，而这个
差异在界面上**完全看不出来**（模型就是没调，用户只会觉得「它这会儿不听指挥」）。
现在两条路都是 `toOpenAiTools(desktopClientTools)`（**同一个来源**），由
`src/lib/__tests__/aiSdkTransportClientTools.test.ts` 锁住。

#### 验证

桌面端 `npx tsc --noEmit` **EXIT=0**、`npx vitest run` ⇒
**115 个测试文件 / 1164 passed / 2 skipped / 0 failed**；
移动端 `flutter test --concurrency=1` ⇒ **334 全绿**、
`flutter analyze --no-pub` ⇒ **0 error**（78 issues 与基线逐条一致、零新增）。
**两端各做一次反向验证**：把 `dark` 的 description 改一个字 ⇒ 该端 schema
断言**立刻变红**（桌面 `1 failed | 15 passed`、移动 `+8 -1`）⇒ 确认这条测试
真在断言字面量、不是摆设。
