# 端脑的工具调用拦截点：一个类型化的 seam

> 2026-11-02 · **设计稿（未落地，等拍板）** · 下面每一条事实都当场核对过（file:line 可点）· 本稿**一行代码都没改**

---

## 0. 结论

三句话：

1. **不需要**为了「装插件」引入钩子框架 —— 插件装载我们已经有三条通道（MCP 服务器、叶区注册、MDS 发现），端脑是唯一真相源这件事不需要动。
2. **需要**一个类型化的运行时拦截点，但它的位置在**能力调用**上，不在**工具派发**上 —— 因为今天的门只罩 HTTP 面，**工具调用那一层是裸奔的**。
3. 第一个消费者**已经存在**了：`ToolDescriptor.user_only` 这个字段**声明了但没有任何人执行**（全仓 grep 只有赋值、没有读取）。

⚠️ 这不是「加一层安全」的活 —— 它会**改变工具调用的失败姿态**（今天工具调用不失败），所以分期和闸必须一起设计（§6、§7）。

✅ **P0 已于 2026-11-02 落地**（端脑仓 + shadow 仓的新闸）—— 落地记录、读数与反向验证见 **§9**。

---

## 1. 外部对照：钩子 ≠ 装插件

这一节只做一件事：**把概念摆正**，免得照抄错东西。

### 1.1 DeepSeek Harness（DSH）

DSH 是 plugin-first，底座是 **Cordis** 插件框架，harness 自己的内置工具、策略面、用户插件**都在同一条类型化派发管线上**。

工具调用的唯一通道是一条有序 waterfall：

```text
tool/call → tools/pre-execute → tools/execute → tools/post-execute → tool/result
```

- `tools/pre-execute` 返回类型化决策：`{kind:'allow'}` / `{kind:'deny', reason}` / `{kind:'ask', reason}`；`ask` 交给 **DSH 自己的审批流**（`ctx.approval`），而不是另造一套提示机制。
- `tools/post-execute` 在调用之后跑，**可以改写结果内容**再交给模型。
- 每个 listener 调 `next()` 委托给链上下一个 ⇒ ⇒ 是**进程内插件注册**，没有子进程、没有 JSON-over-stdin 方言。

⚠️ **第三方插件 `dsh-plugin-hooks` 是另一回事**：DSH 0.1.0-rc.6 当时**没有**钩子能力，官方只预留了 `tools/pre-execute` / `tools/post-execute` 两个接缝；这个插件用 **shell 命令 + stdin 喂 JSON** 去模拟 Claude Code 的 PreToolUse/PostToolUse，pre-tool 非零退出即阻断。⇒ ⇒ **它恰恰是「作为插件补上钩子缺口」的样板**，而不是 DSH 的原生形状。

### 1.2 OpenClaw

- `src/agents/agent-hooks/` —— 内建运行时钩子：**压缩保护、压缩指令、上下文裁剪**。
- `src/agents/agent-tools*.ts` —— 工具定义、参数 schema、**tool policy**、**before/after tool-call 适配器**。
- `src/agents/harness/` —— harness 注册表、选择策略、生命周期；插件可注册额外 runtime id，`auto` 按 model/provider 作用域选。
- 插件只准用 `openclaw/plugin-sdk/*` 桶导出，**不准 import `src/**`**；manifest（`package.json`）声明 `extensions` / `skills` / `prompts` / `themes`，未声明的类型回落到约定目录发现。

### 1.3 我们要不要抄

| 东西 | 抄不抄 | 理由 |
|---|---|---|
| 插件装载框架（manifest + 注册表 + SDK 桶） | **不抄** | 我们已有 MCP / 叶区注册 / MDS 发现三条通道，端脑是唯一真相源 |
| shell 式钩子（子进程 + stdin JSON） | **不抄** | 我们要的是**确定性判定**，子进程换不来确定性，还多一层解析方言 |
| 进程内类型化拦截点（allow/ask/deny + 结果改写） | **抄** | 这正是我们的缺口（§2.3） |
| 拦截点的**位置** | **不照抄** | DSH 能有一个 waterfall 是因为它的工具**全都**经那条路；我们的工具**不止一条路**（§2.1）⇒ ⇒ 拦截点要挂在**能力调用**的汇聚点上 |

---

## 2. 现状盘点（实测）

### 2.1 工具调用的全部路径

端脑里能对外产生副作用的调用面，穷举下来是 **三类五路**：

| # | 路径 | 入口 | 出口 | 今天有没有门 |
|---|---|---|---|---|
| **A1** | agent loop 调 MCP 工具 | `tools/agent_loop.rs`（6 个 `.dispatch(` 调用点：355 / 848 / 1802 / 2013 / 2054 / 2103） | `ToolRegistry::dispatch` → `McpToolProvider::invoke` → `McpRuntime::invoke` | ❌ **无** |
| **A2** | agent loop 调设备工具 | 同上 | `DeviceToolProvider::invoke` → `DeviceToolRouter::invoke_tool`（今天返回 not-wired） | ❌ 无（但尚未接线） |
| **A3** | agent loop 调 WASM 叶区工具 | 同上 | `WasmToolProvider::invoke` → HTTP POST `{url}/a2a/tasks/send` | ❌ **无** |
| **B** | flow 的 `tool` 节点调 MCP | `flow/adapter/mcp.rs:46` | HTTP POST `{url}/api/telencephalon/mcp/{srv}/tools/{tool}/invoke` | ⚠️ 路由**不存在** ⇒ 404（见 §2.4-②） |
| **C** | flow 的 `lobe`/`a2a` 节点调叶区 | `flow/adapter/lobe.rs:56`、`flow/adapter/a2a.rs:39` | HTTP POST `{peer}/a2a/tasks/send` | 目标机自己管；端脑这侧 `/a2a/tasks/*` 是 **open**（D 类跨机协议） |

外加一条**同进程**的路径：
- `api/device.rs:59` `POST /api/telencephalon/devices/{id}/invoke` —— HTTP 面，门型 `auto`（POST ⇒ admin）。

### 2.2 三个汇聚点（seam 该挂在哪）

穷举之后，**能力**层面只有三个真正的汇聚点：

1. **`McpRuntime::invoke`（`mcp/runtime.rs:207`）** —— MCP 的全部路径（A1、未来的 B）最终都落到这里。
2. **A2A `tasks/send`** —— 叶区调用的全部路径（A3、C）最终都落到这里。**出站** POST 点 **4 处**：`tools/mod.rs:374`、`flow/adapter/a2a.rs:39`、`flow/adapter/lobe.rs:56`、`visual_qa/router.rs:100`。
   ⚠️ `api/wasm_route.rs:14` 的 `/wasm/{name}/a2a/tasks/send` 是**入站路由定义**（本机替 WASM 叶区开的口），不是出站点 ⇒ ⇒ 它归门型表管（`/wasm/*/a2a/tasks/send` = **open**），不归拦截点管。
   ⚠️ 另有 **2 处路径不同的跨机转发**：`api/webrtc_route.rs:267` 与 `:340` 打的是 `{lobe_url}/api/a2a/tasks/send`（**多一段 `api/`**）⇒ ⇒ 不是 `/a2a/tasks/send` ⇒ ⇒ 目标机的门型表里没有它 ⇒ ⇒ 跨机 WebRTC 转发这条路**今天不在任何一张门型表里**（登记在此，本设计不处理）。
3. **`ToolRegistry::dispatch`（`tools/mod.rs:122`）** —— 进程内派发的总入口，覆盖 A1/A2/A3。

⇒ ⇒ **一个 `ToolRegistry::dispatch` 上的拦截点是不够的**（漏 B 和 C）；**三个点都要挂**。

### 2.3 门型表今天管到哪里

门（`api/door.rs:305` `door_middleware`）挂在**合并后的 router** 上，门型由 `api/door_policy.txt` 决定：

- 150 行、**59 条规则**、**56 个不同路径前缀**；四种门型 `open / read / admin / owner`，`auto` 按方法派生（GET/HEAD ⇒ read，其余 ⇒ admin）。
- **匹配不到任何一条 ⇒ 关着（403 `telencephalon_door_unclassified`）** ⇒ 新增路由默认关。
- 钥匙复用 `security::` 里既有校验（`verify_read_credential` / `verify_admin_token` / `verify_internal_token`）⇒ 一条规则一处实现。

⚠️ **这张表管的是「HTTP 路由」，不是「工具」**。一次通过了 `/api/telencephalon/chat/completions`（**owner** 门）的请求，agent 随后发起的 MCP 工具调用、WASM 叶区调用、设备调用 —— **都不再逐个过门**。

⇒ ⇒ **门授权的是「你可以对话」，不是「你可以调这个工具」。** 这就是缺口。

### 2.4 顺带查出来的三件事（**不在本设计范围内，但必须登记**）

**① `user_only` 声明了但没人执行。**
`ToolDescriptor.user_only`（`tools/mod.rs:43`）与 `DeviceToolSummary.user_only`（`mcp/device_router.rs:38`）都存在；全仓 grep 的结果是 —— **只有赋值，没有作为判定被读取**（唯一一处"读"是 `tools/mod.rs:278` 把 device 的字段抄进 descriptor）。⇒ ⇒ 今天「这个工具只能人手动触发」这句话**没有任何一行代码在兑现**。

⚠️ 而且**意图就写在注释里**（`mcp/device_router.rs:36-38`）：

```rust
/// Privileged tools (e.g., `system.reboot`) require a
/// user-flagged session before they are invoked.
pub user_only: bool,
```

⇒ ⇒ 「特权工具（比如 `system.reboot`）必须先有用户标记的会话才能被调用」—— **这句话今天是一个注释，不是一道检查**。
⚠️ 今天的侥幸来自别处：`DeviceToolRouter::invoke_tool` 目前直接返回 `InvokeUnimplemented`（`mcp/device_router.rs:167`，错误串写着 *「invoke not yet wired to data-channel transport (ADR-0002 v2 §4.5 follow-up)」*）⇒ ⇒ **等那条 data-channel 通道接上、检查就变成必需的那一刻，这个检查恰好不存在**。⇒ ⇒ 它是本设计**第一个消费者**（§3.3）。
✅ **P0 已让它真的被执行**（端脑 `src/tools/intercept.rs` + `ToolProvider::describe()`）—— 见 §9。

**② flow 的 `tool` 节点打在一个不存在的路由上。**
`flow/adapter/mcp.rs:46` 请求 `{url}/api/telencephalon/mcp/{server_id}/tools/{tool}/invoke`；但端脑的 MCP HTTP 面只有（`api/mcp_admin.rs:43-54`）：

```text
GET  /api/telencephalon/mcp/servers
GET  /api/telencephalon/mcp/servers/{id}
GET  /api/telencephalon/mcp/servers/{id}/tools
GET  /api/telencephalon/mcp/agents/{name}/servers
GET  /api/telencephalon/mcp/agents/{name}/tools
（外加 /api/telencephalon/admin/mcp/** 的管理面）
```

⇒ ⇒ **没有 invoke 路由** ⇒ 该节点必然 404。
⚠️ 但 `McpAdapter` **从来没有被构造过**（全仓 grep：只有 `mcp.rs` 里的定义 + `adapter/mod.rs` 的 `pub use` 重导出）；`A2aAdapter` / `LobeAdapter` / `SkillAdapter` / `HumanAdapter` / `HttpAdapter` **同样没有构造点**，`NodeAdapterRegistry::register` 在 `src/flow` 内**只出现在它自己的单测里**。
⇒ ⇒ **flow 的节点→适配器接线目前整体没接上**（需要在落地前再核一次，可能走了别的装配路径）。⇒ ⇒ **本设计不为 flow 路径背书**，只把「将来接上时必须经过 gate」写成硬约束。

**③ flow 的 schema 里已经有一个 `plugin` 节点，但没有任何实现。**
`flow/schema/kinds.rs:200` 有 `Plugin(PluginParams)`（`:152` 定义 `plugin_id`），`as_str()` 返回 `"plugin"`（`:221`）；但 `flow/adapter/mod.rs` 的模块列表里**没有 `plugin`**，也没有对应适配器。
⇒ ⇒ 「插件」这个概念在 flow 层是**占位**，不是能力。⇒ ⇒ **不要把它当成「我们已经有插件系统」的证据**。

---

## 3. 设计

### 3.1 seam 的类型签名

新建 `telencephalon/src/tools/intercept.rs`：

```rust
/// 一次能力调用的**发起者身份** —— 复用端脑既有的凭据概念，不新造。
/// 来源：security::api_key / security::internal_token / security::subsystem_token
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Principal {
    /// 进程内主人凭据（internal token）
    Owner,
    /// admin token
    Admin,
    /// 读门凭据（shadow key）
    Read,
    /// 子系统令牌（带 scopes）
    Subsystem { scope: &'static str },
    /// 模型自己（agent loop 内发起的调用）
    Model,
}

/// 哪个面发起的调用 —— 决定默认姿态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Surface {
    /// agent loop（模型发起）
    AgentLoop,
    /// flow 运行时
    Flow,
    /// HTTP 面（已经被门罩过）
    Http,
    /// 跨机叶区
    Remote,
}

/// 拦截点要回答的问题。
#[derive(Debug, Clone)]
pub struct InterceptCall {
    pub surface: Surface,
    pub principal: Principal,
    pub tool_name: String,
    pub provider: ToolProviderKind,
    pub args: Value,
    pub session_id: Option<Uuid>,
}

/// 判定结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InterceptDecision {
    Allow,
    /// 交给端脑自己的确认流（**不是**交给模型 —— 见 §3.2）
    Ask { reason: String },
    Deny { reason: String },
}

#[async_trait]
pub trait ToolInterceptor: Send + Sync {
    /// 调用发出前
    async fn pre(&self, call: &InterceptCall) -> InterceptDecision;
    /// 结果返回后（可改写）
    async fn post(&self, call: &InterceptCall, result: &mut Value);
}
```

**为什么是 `pre` + `post` 两个方法而不是一个**：DSH 的 waterfall 是同一件事的两侧 —— `pre` 决定**能不能做**，`post` 决定**结果能不能给模型看**。后者正好接台账里那笔密钥改造的第三道闸（§3.5）。

### 3.2 决策类型：allow / ask / deny

- **`Allow`** —— 放行。
- **`Deny`** —— 拒绝，**理由必须是人能读的**（模型会看到它 ⇒ 它要能指导模型换一条路，而不是"unknown tool"）。
- **`Ask`** —— ⚠️ **交给用户，不交给模型**。

这一条有**仓内先例**，必须照抄：`tools/agent_loop.rs` 的头注释写得很清楚 ——「**确认是端脑的活，不是模型的活**」：本体工具的写操作里，凡是会**作废既有状态**的，必须先由用户确认，而这个确认**由模块按用户的话字面匹配**决定；**模型根本拿不到 confirm 工具**（否则一句幻觉的"yes"就会悄悄改写本体）。

⇒ ⇒ `Ask` 的实现形状必须是：**端脑向客户端发一个待确认事件 ⇒ 客户端由人点确认/拒绝 ⇒ 端脑据此放行或拒绝**。**不给模型任何"代答"的机会**。

### 3.3 策略随工具声明（**不造第二套真相源**）

关键决策：**不给工具策略另开一张表**，而是**让它跟着工具描述走**。

理由：工具集合是**动态的**（MCP server 可以运行时安装/启动/停用），而 HTTP 路由是**静态的**（编译期固定）。门型表能 fail-closed 正是因为它是静态的；工具集合是动态的，在它上面做「运行期默认拒绝」⇒ ⇒ 每次装一个 MCP server 都要改策略 ⇒ ⇒ 必然漂。

⇒ ⇒ 扩展 `ToolDescriptor`：

```rust
pub struct ToolDescriptor {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
    pub provider_kind: ToolProviderKind,

    // ↓ 已有字段：今天声明了但没人执行 ⇒ 本设计让它第一次被执行
    pub user_only: bool,

    // ↓ 新增
    /// 写操作（改状态/删数据/花钱）
    pub mutates: bool,
    /// 需要人工确认才能执行
    pub requires_confirmation: bool,
    /// 这个工具的暴露面 —— 决定默认姿态
    pub exposure: Exposure,
}

pub enum Exposure {
    /// 完全在本机进程内
    Local,
    /// 出网 / 跨机
    External,
}
```

**执行点**（这是 `user_only` 终于有人执行的地方）：

```rust
// 拦截点内部的默认策略实现
fn default_decision(call: &InterceptCall, desc: &ToolDescriptor) -> InterceptDecision {
    // 「只能人手动触发」⇒ 模型不许自己调
    if desc.user_only && call.principal == Principal::Model {
        return InterceptDecision::Deny {
            reason: "这个工具只能由人手动触发，不能由模型调用".into(),
        };
    }
    // 写操作 + 要确认 ⇒ 走 Ask（交给人，不交给模型）
    if desc.mutates && desc.requires_confirmation {
        return InterceptDecision::Ask {
            reason: format!("{} 会修改状态，需要你确认", desc.name),
        };
    }
    InterceptDecision::Allow
}
```

⚠️ **默认是 Allow**（不是 Deny）—— 理由见 §3.3 上文的动态集合论证。**兜底不靠运行期，靠闸**（§7）。

### 3.4 挂在哪三个点

| 汇聚点 | 文件:行 | 覆盖 | 挂法 |
|---|---|---|---|
| `ToolRegistry::dispatch` | `tools/mod.rs:122` | A1 / A2 / A3（进程内全部） | provider 循环**之前**插 `gate.pre()`；拿到 `ToolResult` 后插 `gate.post()` |
| `McpRuntime::invoke` | `mcp/runtime.rs:207` | A1 的 MCP 底座 + 未来的 B | 进 `invoke` 前 `pre()`，出 `JsonRpcResponse` 后 `post()` |
| A2A `tasks/send` | 出站 4 处：`tools/mod.rs:374`、`flow/adapter/a2a.rs:39`、`flow/adapter/lobe.rs:56`、`visual_qa/router.rs:100` | A3 / C | 发请求前 `pre()`，收响应后 `post()` |

⚠️ **注意 A1 的双重挂载**：`ToolRegistry::dispatch` 和 `McpRuntime::invoke` 都会命中 ⇒ ⇒ 同一个 MCP 调用会被判两次。
⇒ ⇒ **必须幂等**：`gate` 用 `(call_id, phase)` 去重，同一次调用的 `pre` 只跑一次。**或者**更简单：**只在 `McpRuntime::invoke` 挂 MCP**（它是真汇聚点），`ToolRegistry::dispatch` 只挂**非 MCP** 的 provider。⇒ ⇒ **推荐后者**：职责不重叠，也不会出现"判了两遍、理由不一样"的鬼故事。

### 3.5 post：结果改写

`post` 的第一个用例是**密钥**。台账（㋷ 条）里那笔 keyring 改造留了三道闸：读面永不回明文 / 写面掩码往返不洗真值 / 日志不落 key —— **今天全靠约定**。

⇒ ⇒ 一个 `post` 拦截点可以在结果交给模型之前**确定性地**把明文 key 洗掉：

```rust
/// 把结果里的秘密字段换成掩码 —— 由 config_center::policy 的同一张 secret 表决定，
/// 不另写一份"哪些字段是秘密"的清单。
async fn post(&self, call: &InterceptCall, result: &mut Value) {
    if let Some(policy) = self.secret_policy() {
        policy.redact_in_place(result);
    }
}
```

⚠️ **约束**：`post` **只允许把内容变少/变模糊**（掩码、截断），**不允许凭空造内容**。⇒ ⇒ 一个"结果改写器"如果能加东西，它就能被用来骗模型。

### 3.6 与门型表的分工

**边界原则：门管「能不能进这扇门」，拦截点管「进来之后能不能动这个工具」。两者不重叠、不互相调用。**

| 维度 | 门型表（`door_policy.txt`） | 拦截点（`tools/intercept.rs`） |
|---|---|---|
| 管什么 | **HTTP 路由** | **工具/能力调用** |
| 粒度 | 路径 + 方法 | 工具名 + 能力声明 + 发起者 |
| 时机 | 请求进入时（axum middleware） | 调用发出前 / 结果返回后 |
| 钥匙 | shadow key / admin token / 内部凭据 / 子系统令牌 | **同一套 Principal 概念**（复用 `security::`） |
| 集合性质 | **静态**（编译期固定） | **动态**（MCP server 运行时可增删） |
| 失败姿态 | 匹配不到 ⇒ **关**（403） | 无声明 ⇒ **放行**（但闸红，见 §7） |
| 执行者 | `api/door.rs::door_middleware` | `tools/intercept.rs::gate` |

⚠️ **两套东西 ⇒ 漂移风险**。缓解办法：**只有一处会同时看两者** —— HTTP 面上的工具调用（`Surface::Http`）**已经在门里判过了**，拦截点对它是 **no-op**（不重复判），只对 `AgentLoop` / `Flow` / `Remote` 生效。⇒ ⇒ **一个调用在一个请求里最多被同一套规则判一次。**

---

## 4. Provider 要声明什么

| Provider | `user_only` | `mutates` | `requires_confirmation` | `exposure` | 谁填 |
|---|---|---|---|---|---|
| `McpToolProvider` | 继承 MCP server 上报的 tool summary | 由 summary 声明 | 同左 | `External`（MCP server 多为出网） | **MCP server 的 tool summary 里带**（`McpToolSummary` 加字段）⇒ 策略随安装包一起来 |
| `DeviceToolProvider` | `DeviceTool.user_only`（**字段已存在**，今天空转） | 视设备能力 | 视设备能力 | `Local`（设备在零信任网内） | 设备清单 |
| `WasmToolProvider` | 叶区自报 | 视叶区 | 视叶区 | `External` | 叶区 agent card |
| 未来的 flow 适配器 | 由节点参数声明 | 同左 | 同左 | 视目标 | flow 参数 |

⚠️ **策略随工具一起来**（而不是另开一张表）⇒ ⇒ **不存在「已注册但未登记策略」这个状态** ⇒ ⇒ 也就不需要运行期默认拒绝。

---

## 5. 明确不做的事

1. **不引入 Cordis / 通用插件框架** —— 我们已有 MCP + 叶区注册 + MDS 发现。
2. **不做 shell 式钩子** —— 不要「子进程 + stdin JSON」这一层：我们要的是**确定性判定**，子进程换不来确定性。
3. **不改门型表的语义** —— 门仍然是路由级、仍然 fail-closed；拦截点是另一层，不去动它。
4. **不实现 flow 的 `plugin` 节点**（§2.4-③）—— 那是另一个议题，别混进来。
5. **不给模型任何"代答确认"的机会**（§3.2）。

---

## 6. 分期

| 期 | 内容 | 依赖 | 风险 |
|---|---|---|---|
| **P0** | ✅ **已落地（§9）**：`tools/intercept.rs` 的 `gate()`；`ToolProvider::describe()`（默认 `None` ⇒ 行为不变）；挂 `ToolRegistry::dispatch`；**执行 `user_only` / `destructive`** | 无 | 低：默认 Allow ⇒ 今天能跑的工具今天照跑 |
| **P1** | 挂 `McpRuntime::invoke` 与 A2A `tasks/send`；`mutates` 的默认拒绝 | P0 | 中：影响面变大，需要逐个 provider 核对 |
| **P2** | `Ask` 的客户端确认流（**新 SSE 事件**，两端都要改） | P1 | 高：协议变更，桌面端 + 移动端都要跟 |
| **P3** | `post` 结果改写（洗明文密钥，接㋷ 条那三道闸） | P0 | 中：改写会改模型看到的内容，必须有反向验证 |

⚠️ **P0 与闸必须同批落地** —— 否则会重演台账里那笔「拦截式闸必须与实现同批」的教训（`cc353e7` 那次修的就是顺序缺陷）。
✅ P0 与闸（`scripts/check-tool-interception.mjs`）**已同批落地**。

⚠️ **P0 没有扩 `ToolDescriptor`**（原设计稿写的是扩它）—— 实际落地改成：**能力声明走独立的 `ToolCapabilities`，由 provider 的 `describe()` 提供**。⇒ ⇒ 不用改 `ToolDescriptor` 的 8 个构造点（`tools/mod.rs` × 3、`tools/agent_loop.rs` × 5）⇒ ⇒ **少一处真相源**：`ToolDescriptor.user_only`（给模型看的元数据）与 `ToolCapabilities.user_only`（给拦截点看的）**同源**（都从 provider 自己的数据源来）。

---

## 7. 验证计划

**读数**（落地后必须能复现）：

- 端脑 `cargo test --lib` ⇒ 绿数与今天**条数相同**（新增的另计）。
- 新闸 `scripts/check-tool-interception.mjs` ⇒ EXIT=0。
- 父仓既有闸（`check-door-policy` / `check-door-policy-parity` / `check-endpoint-matrix` / `check-client-endpoint-map`）⇒ 全绿。

**反向验证**（每一条都必须「恰好红」，否则断言是恒绿的）：

| # | 削弱 | 期望 |
|---|---|---|
| 1 | 把 `gate` 短路成永远 `Allow` | 恰好红「`user_only` 的工具被模型调用 ⇒ 拒绝」那条 |
| 2 | 把 `user_only` 置 `true` 但不执行 | 恰好红同一条（且与 #1 是同一条 ⇒ 证明断言真的在管） |
| 3 | 把 `principal` 恒设成 `Admin` | 恰好红「模型不许调 user_only 工具」那条 |
| 4 | 删掉 `McpRuntime::invoke` 那处 gate | 闸红（不是测试红 —— 这是静态闸的职责） |
| 5 | 把 `post` 的掩码改成加一个字段 | 恰好红「post 只许变少不许造内容」那条 |

**闸怎么写**（`scripts/check-tool-interception.mjs`）：枚举端脑里**所有**能力调用点，逐个断言它**在 gate 之内**。生产代码里的调用点是有限且可枚举的 —— 已逐个 grep 确认：

| 类别 | 生产调用点 | 处数 |
|---|---|---|
| `ToolRegistry::dispatch` | `tools/agent_loop.rs` 355 / 848 / 1802 / 2013 / 2054 / 2103 | **6** |
| `McpRuntime::invoke` | `tools/mod.rs:237` | **1** |
| 出站 A2A `tasks/send` POST | `tools/mod.rs:374`、`flow/adapter/a2a.rs:39`、`flow/adapter/lobe.rs:56`、`visual_qa/router.rs:100` | **4** |
| **合计** | —— | **11** |

⚠️ `tools/mod.rs:440` / `:489` 是**单测**里的调用点，不计入。⚠️ `api/wasm_route.rs:14` 是**入站路由**，归门型表管。⚠️ `api/webrtc_route.rs:267/340` 打的是**另一个路径**（`/api/a2a/tasks/send`），见 §2.2 ⇒ ⇒ 不在本闸范围内，但要单独登记。

⇒ ⇒ 这 11 处**写得出闸**（静态断言每个调用点附近必须有 gate 调用）。

---

## 8. 风险与未验证项

⚠️ **端脑仓此刻有并行会话在飞**（`src/api/providers.rs` 等 30+ 文件被改）⇒ ⇒ **本稿一行代码都没改**，真要动手**先确认没人正在改同一批文件**。

⚠️ **未验证**：

1. **flow 的节点→适配器装配路径** —— 我只证明了「这些适配器没有构造点」且「`register` 只出现在单测里」，**没有排除**存在另一条装配路径（不同拼写、不同文件）。落地前必须再核一次（§2.4-②）。
2. **`Ask` 的客户端协议** —— 需要桌面端 + 移动端同时改，且要定 SSE 事件形状；本稿只给了约束，没给协议。
3. **`McpToolSummary` 加字段的兼容性** —— 老版本 MCP server 的 summary 没有这个字段 ⇒ 缺省值必须是"不特殊"（Allow），不能是"特殊"。
4. **A2A 那条路径的主人** —— `/a2a/tasks/*` 在端脑这侧是 **open**（D 类跨机协议）⇒ ⇒ 拦截点在跨机那一侧能不能做主，取决于**目标机**的端脑有没有同一个 gate ⇒ ⇒ 跨机场景需要"两边都装"才完整，单边装只能防本边。

---

## 9. P0 落地记录（2026-11-02）

### 9.1 改了什么

| 文件 | 改动 |
|---|---|
| `telencephalon/src/tools/intercept.rs` | **新建**：seam 本体 —— `Principal` / `Surface` / `ToolCapabilities` / `InterceptCall` / `InterceptDecision` / `ToolInterceptor` / `DefaultInterceptor` / `gate()` ＋ 6 条单测 |
| `telencephalon/src/tools/mod.rs` | `ToolProvider` 加**带默认实现**的 `describe()`；`ToolRegistry` 加 `capabilities_of()`；`dispatch` 里接上 gate；`ToolError` 加 `DeniedByPolicy` / `NeedsConfirmation`；`McpToolProvider` / `DeviceToolProvider` 各实现 `describe()` |
| `telencephalon/src/mcp/server.rs` | `McpToolSummary` 加 `user_only` / `destructive`（**都带 `#[serde(default)]`** ⇒ 存量行读得回来、**不需要迁移**） |
| `telencephalon/src/mcp/runtime.rs` | `parse_tools_list` 读 MCP 规范的 `annotations.destructiveHint` 与扩展字段 `userOnly` / `user_only` |
| `shadow/scripts/check-tool-interception.mjs` | **新建**：闸（见 §7） |

### 9.2 「行为不变」在代码里的落点

`ToolProvider::describe()` 带**默认实现**（返回 `None`）⇒ ⇒

- 不实现 `describe` 的 provider ⇒ 它的工具**照旧**走原来的调用路径 ⇒ ⇒ **行为一字不变**；
- `dispatch` 里 gate **只在有 provider 声明了能力时**才跑 ⇒ ⇒ 今天的工具零影响。

⇒ ⇒ 这就是「默认 Allow」的落点：**不声明 = 不特殊**。

### 9.3 能力声明从哪来（两个通道）

| 通道 | 来源 | 今天的状态 |
|---|---|---|
| 设备工具 | `DeviceToolSummary.user_only`（**字段早就存在**，注释写着「特权工具如 `system.reboot` 需要用户标记的会话」） | ✅ P0 之后**真的被执行** |
| MCP 工具 | `tools/list` 的 `annotations.destructiveHint`（MCP 规范）＋ 扩展字段 `userOnly` | ✅ 通道已通；**存量 summary 没这个字段 ⇒ 默认 false ⇒ 行为不变**；MCP server 重启后重新 `tools/list` 才开始生效 |

### 9.4 读数

| 读数 | 结果 |
|---|---|
| 端脑 `cargo check --lib --tests` | **EXIT=0**（0 error；63 条 warning 全是并行会话在飞改动带出来的，不是我的） |
| 端脑 `cargo test --lib` | **796 passed / 3 failed** ⇒ 那 3 条失败全在 `config_center::tests`（**并行会话的半成品**：他们删了 `Bootstrap::from_env` 与两个环境变量常量，测试还按旧行为断言）⇒ ⇒ **不是我的改动** |
| 我的 6 条新测试 | `cargo test --lib tools::intercept` ⇒ **6 passed / 0 failed** |
| 闸自检 | `node scripts/check-tool-interception.mjs --self-test` ⇒ **11 条全过**，EXIT=0 |
| 闸 | `node scripts/check-tool-interception.mjs` ⇒ **EXIT=0**（扫了 203 个 `.rs`；已知缺口 5 条） |

### 9.5 反向验证（每条都「恰好红」）

| # | 削弱 | 期望 | 实测 |
|---|---|---|---|
| 1 | 把 gate 短路成永远 `Allow` | 恰好红 3 条 | ✅ **恰好红 3 条**（`a_user_only_tool_is_denied_for_the_model`、`a_destructive_tool_is_denied_for_the_model`、`dispatch_denies_a_declared_user_only_tool_and_never_calls_the_provider`） |
| 2 | 把 `capabilities_of` 恒设 `None`（拦截点根本不被调用） | 恰好红 1 条 | ✅ **恰好红 1 条**（只有 `dispatch_denies_...`）⇒ ⇒ 证明 dispatch 那条接缝真在管 |
| 3 | 拆掉 dispatch 里的 gate（闸自己） | 闸红 | ✅ **恰好红 1 条**（「接缝被拆」） |
| 4 | 从闸的已知缺口清单里拿掉一条 | 闸红 | ✅ **恰好红 2 条**（那个文件的两个调用点） |

⇒ ⇒ 还原后：**闸回到 EXIT=0、测试回到 6 passed / 0 failed**。

### 9.6 闸抓到的**我自己**的 bug（值得记）

闸第一次跑就红了 **23 条** —— 其中大部分是**探测器自己的错**：

1. **路径前缀算错**（算成 `tools/mod.rs` 而不是 `src/tools/mod.rs`）⇒ ⇒ 已知缺口清单一条都没匹配上；
2. **把 dispatch 的调用方当成未挂点**（`tools/agent_loop.rs` 的 6 处）⇒ ⇒ 覆盖模型错了：经 dispatch 的调用点罩不罩得住**只看 dispatch 里有没有 gate**；
3. **把测试代码里的路径字面量当成调用点**（`api/door.rs:410`）⇒ ⇒ 必须用 `stripTestModules` 抹掉 `#[cfg(test)]` 块；
4. **把入站路由定义当成出站调用点**（`api/wasm_route.rs:14`）；
5. **自检样本 8b 是假通过** —— 它因「找不到 DeviceToolProvider」而红，不是因命名不一致 ⇒ ⇒ 自检必须**只查被测的那个 provider**。

⇒ ⇒ 这五条全是**闸自己**的缺陷，人眼很难发现 ⇒ ⇒ `--self-test` 不是装饰。

### 9.7 还没做的（P1 及以后）

- 出站 A2A 汇聚点（`flow/adapter/a2a.rs`、`flow/adapter/lobe.rs`、`visual_qa/router.rs`、`a2a/client.rs`、`api/webrtc_route.rs`）—— **闸的已知缺口清单里写着 5 条**，不是「修好了」的证明。
- `Ask` 的客户端确认流（新 SSE 事件，两端都要改）。
- `post` 结果改写（洗明文密钥，接㋷ 条那三道闸）。
- `mutates` / `requires_confirmation` / `exposure` 三个能力字段（P0 只做了 `user_only` 与 `destructive`）。

