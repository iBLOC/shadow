# Shadow 平台架构 / Platform Architecture

> 本文描述的是**现状**。历史设计记录在 `docs/superpowers/{specs,plans,scenarios}/`（按日期存档，记录的是**当时**的决策）。两者冲突时以本文与 [`AGENTS.md`](AGENTS.md) 为准。

## 一句话

桌面端与移动端是**同一个 agent 的两个终端**。所有通信都走 **大脑 → 端脑 → 叶区**，客户端不直接调推理。

## 组件与职责

| 组件 | 仓库 | 角色 |
|---|---|---|
| **大脑** `encephalon` | iBLOC/encephalon | 顶层封装：thalamus（间脑）+ ACP 总线 + 端脑 + **单一** neuron 运行时。桌面端 `Embedded::boot()`；移动端编译成 `libencephalon.so` 跑在 App 进程内。 |
| **端脑** `telencephalon` | iBLOC/telencephalon | **agent 运行时**：会话、agent 注册表、A2A 网关、WASM host、MCP 管理、意图路由、工具调用、工作流。客户端**唯一**的对话对象。 |
| **叶区** lobes | iBLOC/{temporal,prefrontal,parietal} | 端脑内的 native lobe。temporal = 对话 / 意图，prefrontal = 任务，parietal = 编排。 |
| **推理** `neuron` | iBLOC/neuron | **唯一推理实例**，OpenAI 兼容面 `/v1/chat/completions`。**叶区**调它，客户端不调它。 |
| **记忆** `hippocampus` | iBLOC/hippocampus | 长时记忆，挂在端脑面的 `/hippocampus/api/*` 下。 |

> 「叶区」不是一个独立进程：它是端脑进程内的 native lobe，由端脑持有、端脑调用。

## 链路

### 桌面端 —— 进程内 sidecar

```text
React 前端 (WebView)
   │  HTTP  端脑方言
   ▼
127.0.0.1:60080  端脑 HTTP 面 (cortex_http.rs)
   │
   ├── /shadow/v1/*            会话 / agent
   ├── /api/telencephalon/*    管理面：状态 / provider / MCP / 任务 / 语音 / thalamus 预览
   ├── /hippocampus/api/*      海马体（长时记忆）
   └── /v1/chat/completions    neuron 的 OpenAI 兼容面（叶区用）
   │
   ▼
端脑内部：叶区 temporal / prefrontal / parietal (native lobe)
   │
   ▼
neuron  127.0.0.1:8085   ← 唯一推理实例
```

装配代码在两个地方：

- `shadow-desktop/src-tauri/src/lib.rs` —— `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })`，`Embedded` 只负责**钉住生命周期**。
- `shadow-desktop/src-tauri/src/cortex_http.rs` —— `telencephalon::boot::build_app_state(...)` + `telencephalon::api::build_full_app(...)`，把端脑 + neuron + 海马体合成一台**形状与独立端脑完全一致**的服务。

前端 `DEFAULT_BASE_URL = http://127.0.0.1:60080`，**一行都不用改**就换掉了旧的直连路径。

### 移动端 —— Android 进程内

```text
Flutter UI (Dart)
   │  MethodChannel 'com.ibloc.shadow/encephalon_runtime'
   ▼
MainActivity (Kotlin)  ── JNI ──▶  libencephalon.so (Rust)
                                          │
                                          ├── 大脑（thalamus + ACP 总线）
                                          ├── 端脑 cortex_router  127.0.0.1:0（随机端口）
                                          └── neuron
```

端脑面端口由 `cortex_router` 绑 `127.0.0.1:0` 随机分配，JNI 通过 `nativeGetAgentPort` 取回；Dart 侧 `EncephalonMobileService.start()` 拿到 `{port, agentPort}` 后，把 `TelencephalonClient` 指向 `http://127.0.0.1:$agentPort`。端脑面没起来时，client **保持**指向外部端脑 `:60080`（指向一个没人监听的端口比指向外部端脑更糟）。

## 协议

| 用途 | 路径 | 方法 |
|---|---|---|
| 创建会话（带人设） | `/shadow/v1/conversations` | POST `{agent?, system?}` |
| 发送消息 | `/shadow/v1/conversations/{id}/messages` | POST |
| 流式消息 | `/shadow/v1/conversations/{id}/messages:stream` | POST（流） |
| 会话列表 / 详情 | `/shadow/v1/conversations[/{id}]` | GET |
| agent 列表 / 详情 | `/shadow/v1/agents[/{name}]` | GET |
| 端脑状态（健康度） | `/api/telencephalon/status` | GET |
| agent 搜索 / 扫描 / 同步 | `/api/telencephalon/agents/{search,scan,sync/*}` | GET / POST |
| agent 管理（建 / 注册 / 装 WASM） | `/api/telencephalon/admin/agents/*` | POST / DELETE |
| MCP 服务器与绑定 | `/api/telencephalon/{mcp,admin/mcp}/*` | GET / POST / DELETE |
| 任务 | `/api/telencephalon/tasks[/{id}/confirm]` | GET / POST |
| 工作流 | `/api/flows` | GET |
| 语音（转写 / 合成） | `/api/telencephalon/voice/{transcribe,synthesize}` | POST |
| 记忆 | `/hippocampus/api/*` | GET / POST / PUT |
| **推理（仅叶区用）** | `/v1/chat/completions` | POST |

## 端口

| 端口 | 谁在听 | 说明 |
|---|---|---|
| `60080` | 端脑 HTTP 面 | 桌面端固定；移动端嵌入式时是随机端口。 |
| `8085` | neuron | 桌面端固定（loopback 元数据读取依赖它）。 |
| `8081` | 外部海马体 | 移动端默认指向（桌面端的海马体在进程内，不占这个端口）。 |

## 改代码前必读的约束

1. **客户端不许直连推理。** 桌面端的 `neuron_infer` Tauri 命令已整个拆掉。绕过端脑 = 工具调用、意图路由、人格注入、工作流全部失效，而且**不会报错**。
2. **海马体只有一份。** 桌面端 `encephalon` 关掉 `hippocampus` feature，状态由端脑的 `build_app_state` 建、路由从**同一个** state 挂出来。两份 Lance 指向同一存储会抢锁。
3. **`telencephalon` 必须是 path 依赖**，且与 `encephalon` 同目录（`../../../telencephalon`）。两份端脑 = 两套 `AppState` / `ConversationStore` 类型，传不过去。
4. **叶区要指向活着的那个 neuron。** `neuron::create_router` 每次调用都**重建** `ServerState`，所以装配完必须用 `native_lobes.reconfigure(name, stack.neuron_addr())` 显式改端点。
5. **移动端不许留本地直连编排器。** `MainAgentNotifier`（直接拿 `ModelEngine` 跑 MNN）已删除——留着就可能被重新接上。

## 三种运行形态，同一条链路

| 形态 | 端脑面对外端口 | 叶区 → LLM 指向 | 修在哪 |
|---|---|---|---|
| 桌面端 sidecar（进程内嵌） | `127.0.0.1:60080` | `native_lobes.reconfigure` → `:8085`（neuron 自己的 listener） | shadow 仓 `src-tauri/src/cortex_http.rs` |
| 移动端 App（`libencephalon.so`） | 随机端口 | `point_lobes_at_neuron` → 进程内 neuron | 大脑仓 `point_lobes_at_neuron`（PR #2） |
| 独立大脑（`encephalon-server`） | `:8082` | 同上 | 同上 |

**为什么必须指向 neuron 自己的 listener**：端脑 HTTP 面里合并的那张 neuron 路由是 `neuron::create_router` **重建**的 `ServerState` —— 不是活着的那个实例。更要紧的是叶区的默认端点 `http://localhost:60080` 在移动端与独立大脑上**没有任何东西在听**（端脑面分别是随机端口和 `:8082`），于是叶区发起的 LLM 调用 connection refused，而对话照样有回音 —— 能力静默失效。

## 跨端契约（可执行的守门员）

| 脚本 | 管什么 | CI |
|---|---|---|
| `scripts/check-brain-chain.mjs` | 上面 5 条约束（6 条规则） | `Brain chain check` |
| `scripts/check-agent-surface.mjs` | 能力清单 ↔ 两端路由、生成物漂移、两端手写色值、玻璃语义对等 | `Cross-client consistency check` |
| `scripts/gen_tokens.mjs --check` | 设计 token 漂移 | `Design token drift check` |
| `scripts/gen_nav.mjs --check` | 导航结构漂移 | `Navigation drift check` |
| `brand/gen-icons.mjs --check` | 品牌资产漂移 | `Brand asset drift check` |

## 相关文档

- [`AGENTS.md`](AGENTS.md) —— 唯一知识库：架构决定、踩过的坑、验证记录
- [`docs/superpowers/architecture/2026-10-29-brain-chain.md`](docs/superpowers/architecture/2026-10-29-brain-chain.md) —— 链路改造全文（含改造前后对比）
- [`docs/superpowers/architecture/2026-10-29-cross-platform-design-system.md`](docs/superpowers/architecture/2026-10-29-cross-platform-design-system.md) —— 跨端设计系统（一份真相源，两端投影）
- [`shadow-desktop/ARCHITECTURE.md`](shadow-desktop/ARCHITECTURE.md) —— 桌面端细节
- [`shadow-mobile/ARCHITECTURE.md`](shadow-mobile/ARCHITECTURE.md) —— 移动端细节
