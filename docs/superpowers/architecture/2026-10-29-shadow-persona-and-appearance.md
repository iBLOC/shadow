# 影子的外观与人格 —— 从「用户设置」到「影子自己决定」

> 2026-10-29 · 承接《跨端视觉语言》《对话为主的两端 IA》
> 触发：用户提出产品愿景 ——「影子作为个人助理监护陪伴与任务处理，支持 agent 自定义客户端主题色来适配用户的需求；用户可以向影子要求换个颜色、生成一张背景图设为聊天背景；影依托海马体记忆可以有自己的人格或者说灵魂，可以有自己的喜好。」

---

## 0. 三个已拍板的决定

用户在 2026-10-29 的问卷里定了三件事。它们不是偏好，是**架构约束**——每一件都会改写落点。

| 议题 | 决定 | 对实现的硬约束 |
|---|---|---|
| 背景图技术路线 | **云端生成 / 端侧生成双模式** | 出图能力要接两处，且两端运行环境不同（桌面端 Chromium WebView / 移动端 Android 原生），必须**分别验证** |
| 人格落点 | **海马体 `dimension=Agent`** | 基础设施已经站在这一边（见 §1.5），但**推理链现在根本不读**，`dimension=Agent` 的记忆目前是只写不读 |
| 跨端同步 | 主题色**也是记忆的一部分**；多端**只有组成零信任网络时**才共享海马体；**一个海马体存多个人格**（家庭里只部署一个海马体，但每个人都有自己的个人助理） | 「外观」不是全局设置，是**某个助理的记忆**；隔离轴 = `tenant_id`，**不用改海马体 schema** |

**这三条合起来的含义**：外观不是「App 的主题」，是**影子对这个用户的偏好**。它存在海马体里，跟着人格走。

---

## 1. 现状测绘

### 1.1 外观：槽位是通的，但两端不同源，也没有 agent→客户端的通道

| 事实 | 位置 |
|---|---|
| 主题色是唯一的「可覆盖槽位」，中性黑白灰是基底 | `design-tokens.json` `color.accent` |
| 桌面端运行时改主题：直接改 `<html>` 的 CSS 变量，无缓存、即时重投影 | `src/stores/themeStore.ts:41-60` |
| 移动端运行时改主题：落 `app_config.json`，每次重建重投影 | `lib/providers/theme_provider.dart` |
| **两端的值不同源**：桌面端在 localStorage，移动端在 `app_config.json` | — |
| **没有 agent→客户端通道**：移动端 `tool_call` 事件只打一条日志 | `lib/providers/chat_provider.dart:766-769` |
| **桌面端有渲染骨架但没有消费方**：`ToolPartRouter` / `ClientToolForm` 存在，全仓无人用 | `src/components/chat/ToolPartRouter.tsx:35`、`src/components/chat/ClientToolForm.tsx:62` |
| ⚠️ **桌面端 Tauri 构建的对话根本不过端脑** | `src/lib/telencephalonClient.ts:665-673`：`streamMessage` 在 Tauri 下走 `streamMessageNeuron`（直连进程内 neuron）；`createConversation` 走 `newLocalConversation` 本地桩 |

服务端侧同样没有出口：

- 端脑 `Intent` 九个变体，**不覆盖外观**（`telencephalon/src/lobes/intent.rs:6-38`：Chat / TaskCreate / TaskConfirm / TaskQuery / TaskUpdate / MemoryQuery / AgentQuery / VisualQA / VisualTask）
- `call_llm` 的请求体是 `{model, messages, stream:false}`，**没有 tools 字段**（`telencephalon/src/lobes/mod.rs:321-344`）
- 端脑**已经备好**了出工具的三件套：`ToolRegistry`（`src/tools/mod.rs:96-151`）、SSE `tool_call` / `tool_result` 事件（`src/api/shadow.rs:444-464`）、flow 的 `NodeKind::Tool`
- 但端脑**没有 client action 这个概念**：`NodeKind` 十六种里没有 client/ui 一类；`DeviceToolProvider.invoke` 直接 501

> **判定**：服务端不是「没有工具系统」，是**工具系统里没有「作用于客户端」这一类工具**。

### 1.1b ⚠️ 桌面端 Tauri 构建：端脑的 agent 面**完全不在链路上**

这一条比上面所有条目都重，单独拎出来：

| 环节 | Tauri 构建实际走的路 | 后果 |
|---|---|---|
| 建会话 | `createConversation` → `newLocalConversation`（本地 UUID 桩） | 没有端脑会话 |
| 发消息 | `streamMessage` → `streamMessageNeuron` → 进程内 neuron 的 `/v1/chat/completions` | **没有意图路由、没有工具、没有 flow** |
| 工具事件 | neuron 的 chat completions **不带 tools** | **桌面端压根不会产生 `tool_call` 事件** |
| 海马体 | `Embedded::boot()` 只起了 neuron 的 listener（`:8085`） | 端脑的 HTTP 面没起 → **前端够不到进程内海马体** |

⇒ 桌面端 Tauri 现在的对话 = **一个 neuron 的薄壳**。端脑这一层在桌面端是「装了但没接线」。

⇒ **推论**：批次 A 在桌面端做不了，不是「客户端还没接 handler」，是**事件根本不会来**。要让「用户向影子要求换个颜色」在桌面端成立，桌面端的对话路径必须改走端脑 —— 这是批次 A 里最大的一个决定（见 §4 批次 A 的「桌面端前置」）。

⇒ 移动端相反：**嵌入式大脑带端脑**（`encephalon-wt-mobile` 的 `mobile` feature 含 `telencephalon`），对话走端脑的 `cortex_router`，`tool_call` 事件**在链路上**（只是客户端只打日志）。**所以批次 A 先在移动端落地是可行的。**

### 1.2 聊天背景：两端都没有，而且背景层是不透明的

| | 桌面端 | 移动端 |
|---|---|---|
| 背景层 | `bg-background`，不透明 | `Container(gradient: ...)`，**不透明** |
| 位置 | `src/pages/ConversationPage.tsx` | `lib/widgets/main_shell.dart:71-83` |

玻璃拟态两端都做了，而且是**真 `BackdropFilter`**（桌面 `.glass` / 移动 `glass_card.dart`）。**后果**：一旦铺上照片，玻璃后面的内容对比度会塌，正文读不清。

### 1.3 出图：两端零能力

- 11 个云端 provider **无一暴露 `images/generations`**
- neuron 无 diffusion 后端、无 `/v1/images/*`
- `libdiffusion.so` 是 MNN 自带的 Stable Diffusion（`MNN::DIFFUSION::StableDiffusion`），**零接线**（没有 `loadLibrary("diffusion")`）
- 可复用的落盘范式：`model_download_service.dart` 的 `LiteRTDownloadService.downloadModel`

**用户要的是双模式（云端 + 端侧），所以这两条都得接。** 云端那条要先补 provider 的 `images/generations`；端侧那条要把 MNN 的 SD 拉起来。

### 1.4 人格：三个断裂

| 断裂 | 证据 |
|---|---|
| soul 只在前额叶，且**纯内存** | `prefrontal/src/soul_store.rs:26-29` — `RwLock<HashMap<String, Soul>>`，重启即丢 |
| soul 只有 HTTP PUT，**没有自动更新逻辑** | `prefrontal/src/server/routes.rs:123-125` — 只有 get/put/history/version |
| **推理链根本不读 soul** | 端脑 `call_llm` 的 system prompt 是硬编码的 |
| **移动端 soul UI 指错服务** | `prefrontal_client.dart:33` 默认 baseUrl = `http://localhost:60080`（**端脑**），`getSoul` 打 `GET /api/soul/{agentId}`（`:385-389`）—— 而 `/api/soul/*` 是**前额叶**的路由，端脑没有这个端点 → 必 404 |
| 桌面端 **0 处** soul | — |
| 设计文档承诺过 SQLite + Neo4j | `docs/superpowers/plans/2026-05-26-soul-storage-migration-plan.md` —— **从未实现** |

### 1.5 海马体：基础设施已经站在「人格」这一边了

这是本轮最重要的发现，也是用户选「海马体 `dimension=Agent`」最有力的支撑：

```rust
// hippocampus-core/src/consciousness/observer.rs:21-38
pub fn as_memory(&self, tenant_id: &str) -> Memory {
    Memory {
        uri: format!("insight://{}", self.id),
        content: self.content.clone(),
        layer: Some(Layer::L2Detail),
        dimension: Dimension::Agent,        // ← 洞见直接落成 Agent 维度
        metadata: serde_json::json!({ "title": ..., "source_events": ... }),
        memory_type: Some(MemoryType::Insight),
        ...
    }
}
```

- **巩固器（consolidator）产出的洞见，已经被写成 `dimension=Agent` 的记忆**（`consolidate.rs:118-124` → `insight.as_memory(tenant_id)` → `insert_memory`）
- 洞见的输出形状是 `{title, content, source_indices}`（`consciousness/prompt.rs:12-14`），title 可以是 `"Theme preference"` 这类偏好 —— **形状正好装得下「影子记下的用户偏好」**
- 端脑已有 `dimension=agent` 的先例：`telencephalon/src/agents_registry.rs:86-89` 直接查 `{端脑}/hippocampus/api/memory?dimension=agent`
- `Memory.metadata` 是自由 JSON（`hippocampus-core/src/types.rs:115`）→ 装结构化偏好**零 schema 改动**

**所以「人格在海马体 `dimension=Agent`」不是一个提案，是一个已经建好、但只写不读的方向。** 缺的不是存储，是**读**和**注入**。

### 1.6 海马体在哪（两端不同，这是移动端的硬约束）

| | 桌面端 | 移动端 |
|---|---|---|
| feature | `encephalon/Cargo.toml` `default = ["telencephalon","hippocampus",...]` | `encephalon-wt-mobile/Cargo.toml` `mobile` = "agent runtime + neuron only; **no hippocampus**" |
| 实际地址 | `{端脑}/hippocampus/api/*`（端脑把它 `nest` 在 `/hippocampus` 下，`telencephalon/src/api/mod.rs:160`） | **没有** —— 移动端脑不带海马体（Lance 约 47.8MB，退出移动端依赖图） |

**推论**：桌面端的人格可以本地闭环；**移动端的人格必须走零信任网络**（连远端海马体）或者退而求其次。这正好和用户「多端只有组成零信任网络时才使用共享的海马体」对上了——**不是妥协，是本来就该这样**。

---

## 2. 核心判断：缺的是一根线 —— 「agent → 客户端的结构化动作」

把上面的证据横着看，会看到同一件事的三种表现：

```
        影子（服务端）                    客户端
   ┌──────────────────────┐      ┌────────────────────────┐
   │ Intent：没有外观意图  │      │ 有「客户端工具」渲染骨架 │
   │ call_llm：没有 tools  │      │ ToolPartRouter         │──┐
   │ ToolRegistry：没有    │      │ ClientToolForm         │  │ 全仓无消费方
   │   client action 类    │      │                        │◀─┘
   └──────────────────────┘      │ tool_call 事件：只打日志 │
                                  └────────────────────────┘
```

两端各自都有半截，**中间那一段没接**。所以：

- 「用户向影子要求换个颜色」今天**必然失败** —— 不是因为哪一行写错了，而是因为这条通道**不存在**
- 只在客户端加 UI 没用（影子不会发起）
- 只在服务端加 Intent 也没用（客户端不执行）

**结论：批次 A 的本质是补这条通道，而不是加功能。** 一旦这条线通了，「换颜色」「换背景图」「改偏好」都只是它的一个实例。

---

## 3. 本轮已落地：桌面端记忆读/写路径修复

人格落海马体，前提是**记忆这条路径本身是通的**。它原来是断的，本轮修好了。

### 3.1 原来的样子

| 问题 | 证据 |
|---|---|
| store 打的是一个**不存在的服务** | `memoryStore.ts` `apiBase: 'http://localhost:8081'` —— 桌面端**没有独立的海马体进程**（海马体嵌在端脑里） |
| 搜索端点**不存在** | 打 `POST {apiBase}/memories/search` —— 海马体的搜索是 `POST /api/search`（`hippocampus-server/src/lib.rs:360`） |
| 增删改是**纯本地**，不写后端 | `addMemory` / `removeMemory` / `updateMemory` 只改了 store 数组 |
| 页面**从来没发过请求** | `MemoryPage` 没有任何地方调 `fetchMemories` → 记忆页永远是空的 |
| 移动端记忆页也是死的 | 打 `GET /hippocampus/api/memory/search`（海马体无此端点），且移动端脑根本没挂海马体 |

### 3.2 改完之后

新增 `shadow-desktop/src/lib/hippocampusClient.ts`：**端脑里嵌着的海马体**的客户端，base URL 跟着端脑运行时配置走（`useTelencephalonStore.connection.baseUrl || prefrontalUrl()`），不再有第二个真相源。

| 动作 | 端点 | 契约细节 |
|---|---|---|
| 列表 | `GET {端脑}/hippocampus/api/memory` | dimension **请求侧小写**（`handlers.rs:216-222` 传错直接 400 "Invalid dimension"） |
| 搜索 | `POST {端脑}/hippocampus/api/search` | body `{query, limit, minScore?, tenantId?}`；**没有** `GET /api/memory/search` |
| 新增 | `POST {端脑}/hippocampus/api/memory` | body camelCase（`AddMemoryRequest` 有 `rename_all = "camelCase"`），dimension 小写 |
| 更新 | `PUT {端脑}/hippocampus/api/memory/{id}` | **只能改 `content` / `dimension`** |
| 删除 | `DELETE {端脑}/hippocampus/api/memory/{id}` | → `{success:true}` |

**响应 → UI 的三处映射**（`toUiMemory`）：

| 线上 | UI |
|---|---|
| `session_id` / `created_at` / `updated_at`（snake_case） | `sessionId` / `createdAt` / `updatedAt`（camelCase + `Date`） |
| `dimension: "Agent"`（PascalCase） | `dimension: 'Agent'`（本来就匹配） |
| `layer: "L1Overview"`（枚举全名） | `layer: 'L1'`（UI 简写），认不出来兜底 `'L2'` |

### 3.3 顺带修掉的三个真问题

1. **维度过滤的语义搞反了**：海马体的**搜索**端点不吃 `dimension`（`SearchRequest` 只有 `query/limit/minScore/tenantId`），只有**列表**端点吃。所以维度筛选改走 `fetchMemories(dimension)`，搜索则是全维度的。
2. **新增记忆时的 layer 选择器是假的**：`AddMemoryRequest` 没有 `layer` 字段，`UpdateMemoryRequest` 也没有 —— layer 是服务端分配的（`Memory::new` 恒为 `L2Detail`）。客户端选的那个值**根本没地方存**。已从 UI 移除，卡片上仍显示服务端给的真实 layer。
3. **「搜索到 0 条」会显示全部记忆**：老逻辑是 `searchResults.length > 0 ? 搜索结果 : 完整列表`。新增 `hasSearched` 状态区分「搜过但没搜到」和「还没搜」。

### 3.4 多灵魂的隔离轴：`tenant_id`

用户要的「一个海马体、多个灵魂」有现成落点，**零 schema 改动**：

- 海马体所有读写都按 `tenant_id` 隔离（`ListMemoriesQuery.tenant_id`、`SearchRequest.tenant_id`、`Memory.tenant_id`）
- 客户端 `HippocampusClient.setTenantId()` / store 的 `personaId` 把「人格」直接映射成租户
- **家庭场景**：一个海马体服务全家，每人一个助理 → 每人一个 tenant id → 各自的人格、偏好、记忆互不串味

已落地的接口面（尚无 UI，等批次 C）：

```ts
hippocampusClient.setTenantId('persona-ada');
useMemoryStore.getState().setPersona('persona-ada');   // 持久化 + 同步给 client
```

### 3.5 验证

- `pnpm exec tsc --noEmit` → **exit 0**
- `pnpm exec vitest run` → **111 文件 / 1132 passed / 2 skipped**（新增 `src/lib/__tests__/hippocampusClient.test.ts` 12 例端点契约测试）
- `node scripts/check-agent-surface.mjs` → **0 阻断 / 0 提示**

---

## 3bis. 第二批落地：桌面端「够得到海马体」+「主题色就是记忆」

### 3bis.1 Tauri sidecar 把进程内海马体挂成 HTTP 面

§3.2 的修复在 **web 构建**里直接生效（前端本来就打端脑的 HTTP），但**桌面 Tauri 应用里打不通** —— 见 §1.1b：端脑是进程内嵌的、**没有 HTTP 面**，而海马体虽然就在那个进程里，前端够不到。

修法（新增 `shadow-desktop/src-tauri/src/hippo_http.rs`）：

```
进程内 hippocampus (AppState)
   └─ build_router_unit()  →  Router<()>
        └─ nest("/hippocampus")  →  127.0.0.1:60080/hippocampus/api/*
```

- 端口 **60080** = 前端 `telencephalonStore.ts` 的 `DEFAULT_BASE_URL` → **前端一行都不用改**
- 路径前缀 `/hippocampus` 与端脑自己的挂法一致（`telencephalon/src/api/mod.rs:160`）→ **同一套客户端代码两端通用**
- CORS 放开（WebView 跨源），与 neuron 一致
- 端口被占用**不算错**：那说明外部已经有一台端脑在跑，前端本来就该连那一台（而且那一台还带完整端脑面）→ 直接跳过
- **只挂海马体**，不挂端脑其余的面（conversations / flows / agents）—— 那些要等桌面端对话改走端脑

**顺带修好一个既有的坏测试**：`src-tauri/tests/embedded_stack.rs` 用 `neuron_lib`，但 `Cargo.toml` 里从来就没有 `neuron` 这个依赖 → `cargo test` 编不过（**HEAD 就是坏的**，与本轮改动无关）。更妙的是 **`Cargo.lock` 里一直登记着 `axum` / `hippocampus-server` / `neuron` / `tower` / `tower-http`** —— 是 manifest 被削过而锁没跟上。补回依赖后**锁零改动**，两边重新对齐。

### 3bis.2 「主题色也是记忆的一部分」

这是用户拍板的第三条（主题色也是记忆）第一次真正落地：

| 动作 | 实现 |
|---|---|
| 用户在设置页改主题色 | `themeStore.setAppearance` → 写一条海马体记忆：`uri = 'preference://theme/accent'`、`dimension = Agent`、`content = '#rrggbb'` |
| 应用启动 | `App.tsx` → `useThemeStore.getState().hydrateFromMemory()` → 读回并应用 |
| 读不到（端脑没起 / 离线） | 静默用本地那一份，**不报错** |
| 记忆里是坏值 | `appearanceMemory.ts` 的 hex 校验拦掉，当作「没记过」 |

**一条稳定 uri，而不是每次新增一条** —— 偏好是「当前值」，不是历史流水。海马体没有 upsert 也没有「按 uri 查」，所以 `HippocampusClient.upsertMemory` 做的是「列出来按 uri 匹配 → 命中 PUT / 没命中 POST」。

**移动端还做不到这一步**：移动端脑不带海马体（§1.6），`HippocampusClient` 在移动端还是空壳。要等「零信任网络里的远端海马体」接通。

### 3bis.3 验证

- `cargo check --tests`（sidecar）→ **exit 0**，顺带修好了 `embedded_stack.rs` 的既有编译失败
- `cargo test --lib hippo_http` → 前缀挂载形状的单测
- 桌面 `pnpm exec tsc --noEmit` → **exit 0**
- 桌面 `pnpm exec vitest run` → **112 文件 / 1139 passed / 2 skipped**（新增 `tests/stores/appearanceMemory.test.ts` 8 例）
- **`Cargo.lock` 零改动**（依赖条目本来就登记着）

---

## 4. 路线

### 批次 A · 外观定制闭环（补上那根线）

**先说桌面端的前置**（§1.1b）：桌面端 Tauri 的对话**不过端脑**，所以 `tool_call` 事件在桌面端**压根不会产生**。批次 A 在桌面端要成立，得先让桌面端的对话走端脑 —— 这是一个**独立的架构决定**（端脑的 chat 路径要能跑本地模型、流式粒度会变、延迟会变）。在那个决定落地之前，**批次 A 先在移动端做**（移动端的端脑在链路上）。

**服务端**（`telencephalon` 是他人 WIP 仓，只读 —— 需要先提 PR 或换落点）：
- `ToolRegistry` 加一类 `client` 工具，动作是结构化的：`{kind:'setAppearance', payload:{accentSeed}}` / `{kind:'setChatBackground', payload:{imageUri}}`
- `call_llm` 的请求体加 `tools`，让 LLM 能产出这类动作
- SSE 的 `tool_call` 事件把 `kind` 透传给客户端

**移动端**（先落地，链路已通）：
- `chat_provider.dart:766-769` 的 `tool_call` 分支补成「渲染 + 执行」
- 执行 → `themeAppearanceProvider` 写主题 + 写记忆（`dimension=Agent`，uri `preference://theme/accent`）
- 桌面端的写记忆那一半**已经通了**（§3bis.2）—— 移动端对齐同一个 uri 与同一套语义

**桌面端**（等对话改走端脑）：
- 把 `ToolPartRouter` / `ClientToolForm` 真正接进 `ConversationPage`（现在是有骨架无消费方）
- 新增 `client_action` 处理器：`setAppearance` → `themeStore.setAppearance({accentSeed})` → 顺带写记忆

**为什么先做这个**：它是「用户向影子要求换个颜色」这句话唯一能变成真的路。而且它一次打通，后面背景图、人格偏好全是同一根线上的实例。

### 批次 B · 聊天背景图（云端 / 端侧双模式）

1. **背景层降 alpha** —— 这是前置条件，不做后面都白搭：
   - 移动端 `main_shell.dart:71-83` 的渐变容器改成半透明（现在是**不透明**的，照片会被盖死）
   - 桌面端 `ConversationPage` 的 `bg-background` 同理
   - **两端玻璃拟态行为不等价**（Chromium WebView vs Android 原生 `BackdropFilter`），**必须分别真机验**
2. **出图能力双接**：
   - 云端：补 provider 的 `images/generations`（现在 11 个 provider 一个都没有）
   - 端侧：接 MNN 自带的 `libdiffusion.so`（`MNN::DIFFUSION::StableDiffusion`，目前零接线）+ 照 `LiteRTDownloadService.downloadModel` 的落盘范式
3. **用户自选**：从相册选一张（最低成本），可作为生成模式之外的补充

### 批次 C · 人格

分三步，**顺序不能跳**：

**C1 · 先修断链**
- 移动端 soul UI 指错服务：`prefrontal_client.dart:33` 的 baseUrl 指向端脑，但 `/api/soul/*` 是前额叶的路由 → 必 404。要么改指前额叶，要么**直接把人格迁到海马体**（用户已经选了海马体 → 走后者）
- 桌面端 0 处 soul → 新增人格入口

**C2 · 把人格注入推理**
- 端脑 `call_llm` 现在是硬编码 system prompt → 改成「硬编码串 + 人格」
- 人格来源 = 海马体 `dimension=Agent` 的记忆（**这批记忆已经存在了**，只是没人读）

**C3 · 影子自己形成偏好**
- 巩固器已经产出 `dimension=Agent` 的洞见（`observer.rs:28`），但洞见内容是**关于用户的观察**
- 要让影子形成**自己的喜好**，需要洞见里能区分「这是关于用户的」和「这是我的偏好」
- 可行做法：洞见的 `metadata` 带上 `origin`（`user_observation` / `self_preference`），`title`/`content` 的形状已经够装（`prompt.rs:12-14`）

---

## 5. 三层的分工（重述一遍，因为很容易混）

| 层 | 是什么 | 存哪 | 谁写 | 谁读 |
|---|---|---|---|---|
| **偏好** | 影子记住的「这个用户要什么」 | 海马体 `dimension=Agent` | 巩固器 / 客户端动作 | 客户端（主题、背景）+ 推理链 |
| **人格** | 影子自己是谁 | 海马体 `dimension=Agent`（同域，用 `metadata` 或 uri 前缀区分） | 巩固器（C3） | 推理链 |
| **事实** | 关于用户的事实 | 海马体 `dimension=User` | 观察 / 录入 | 推理链 |

后两者现在**混在同一个 dimension 里** —— 这是批次 C 要拆开的。

---

## 6. 阻塞与待定

| 项 | 状态 |
|---|---|
| 🔴 **桌面端对话要不要改走端脑** | **新出现的架构分叉**（§1.1b）。不改 → 桌面端永远收不到 `tool_call`，「影子给客户端换主题」在桌面端不成立；改 → 端脑的 chat 路径要能跑本地模型，流式粒度与延迟都会变。**建议先在移动端把批次 A 走通，桌面端这个决定缓一步** |
| **端脑 `telencephalon` 是他人 WIP 仓（84 dirty）** | 批次 A 的服务端改动**必须走 PR**，不能直接改 |
| **移动端脑不带海马体** | 移动端人格必须走零信任网络连远端海马体；`HippocampusClient` 在移动端还是空壳（`agent_review_service.dart:189-193` 全 TODO）。移动端的「主题色写进记忆」因此**还没做** |
| **真机验证全部未做** | 设备失联。背景图对比度、玻璃拟态两端差异、「等 WiFi」黑屏修复的真实确认都等着；**新增的 sidecar 海马体 HTTP 面也没在真机/桌面应用里验过** |
| **CI 缺 `IBLOC_TOKEN` secret** | 本轮的记忆路径修复**还没在 CI 上跑过** |
| 出图 provider 的 `images/generations` | 要不要扩展 provider 协议，是端脑仓的改动，同样受上面的 PR 约束 |
| 一个海马体多灵魂的**身份来源** | `tenant_id` 从哪来（设备身份？用户手动选？），等批次 C 一起定 |
