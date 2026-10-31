# 端脑面**实测**基线 —— 「不拿凭据就能进」的端点清单

> 判定表（[端点 × 是否该锁](./2026-10-31-agent-surface-endpoint-lock-matrix.md)）是**静态分析**：
> 对着源码把 127 条路由列出来分级。这份是它的**实测对照**：真的敲一遍，看**哪些端点
> 不拿任何凭据就能进**。
>
> **探针**：`scripts/probe-agent-surface.mjs`（直接读上面那张判定表 ⇒ 表变了探针自动跟着变，
> 不另抄一份端点清单 —— 另抄一份就会过期）。

## 测的时候

| 项 | 值 |
|---|---|
| 被测对象 | `encephalon/target/debug/encephalon-server.exe`（16:38 编译，`--port 60080`） |
| 端脑面 | `http://127.0.0.1:60080`（开发机） |
| 凭据 | **不带任何凭据**（这才是安全问题本身：谁能不拿钥匙就进） |
| 判定表读到 | **91 行** |
| 探测 | **只探 GET/HEAD** ⇒ 写路径一律不探（门开着就会真的改状态） |

⚠️ **这台开发机上的端脑是空壳**：没配 provider、没装 MCP server、找不到日志文件
⇒ 下面那些「开着」的端点**恰好返回空**。⇒ **「门是开的」是实测事实；「泄了什么」要看
那台机器上配了什么** —— 源码层面能证明一旦配了会泄什么（见下）。

## 结果

### 锁着的（401）—— 证明「锁确实生效」

| 端点 | 分类 | 说明 |
|---|---|---|
| `/shadow/v1/agents` | B | shadow key 生效 ✔ |
| `/shadow/v1/conversations` | B | shadow key 生效 ✔ |
| `/api/telencephalon/admin/agents/installed` | B | admin 面 fail-closed 生效 ✔ |
| `/api/telencephalon/thalamus/video/cameras` | B | 要 admin token ✔ |
| `/api/telencephalon/hippocampus/admin/config` | B | 要 admin token ✔ |

⇒ **开发机上 `:60080` 的端脑是配了 shadow key 的**（有配置文件）⇒ `/shadow/v1/*` 那扇门是关着的。

### ⚠️ 开着的（不拿凭据就能进）—— A/B 类共 **13 条**

| 端点 | 状态码 | 泄什么（判定表的判断，源码已核） |
|---|---|---|
| `/models/providers` | 200 | **provider 配置，含 `api_key`** ⇒ ⚠️ **明文 API key**（下面详述） |
| `/api/telencephalon/logs` | 200 | **日志尾部** + 日志文件路径（本机实测：路径 + 1 行「读不到」） |
| `/api/telencephalon/mcp/servers` | 200 | 外部 MCP server 清单（`McpWasmRef` 只有 name/version/sha256 ⇒ **不含凭据**） |
| `/api/telencephalon/mcp/servers/{id}/tools` | 404* | 外部 server 暴露的工具面（*见下方「404 怎么读」） |
| `/api/telencephalon/status` | 200 | 运行态 |
| `/api/telencephalon/agents/list` | 200 | 叶区与 agent 清单 |
| `/api/telencephalon/lobes/capabilities` | 200 | 叶区能力面 |
| `/api/telencephalon/lobes/list` | 200 | 叶区清单 |
| `/api/telencephalon/devices` | 200 | 设备清单 |
| `/api/telencephalon/video-sources` | 200 | 视频源清单 |
| `/api/telencephalon/visual-tasks` | 200 | 视觉任务 |
| `/api/telencephalon/prefrontal/agents` | 200 | 前额叶 agent 清单 |
| `/api/flows` | 200 | **工作流定义与执行历史** |

\* **404 怎么读**：带 `{id}` 的路径探的是「合法但不存在」的 id ⇒ 门开着 ⇒ 404（到了处理
函数，只是没这个实体）；门锁着 ⇒ 401。探针分不清「路由不在这个构建里」与「门开着但没实体」
⇒ 于是**再拿一个非法 id**（`not-a-valid-id`）打一次：变成 **400**（路径参数解析失败）⇒
**路由确实存在** ⇒ 那么刚才那个 404 就是「门开着」。

### 该开着、确实还开着（C 类）✔

`/.well-known/agent.json` ⇒ 200（代理发现，判定表说它**该开着** ⇒ 实测符合）。

### D 类：确认**完全无鉴权** ✔

`/a2a/tasks/{id}` ⇒ **501**（到了处理函数，任务查询还没实现）⇒ **门是开的** ——
与判定表的「D 类现在完全无鉴权」一致。

### 未探测的 65 条

写路径（POST/DELETE/PUT/PATCH）+ SSE / WebSocket。⚠️ **写路径在门开着的时候探测它就等于
真的做了一遍**（装 agent、改 LLM 上游、抹数据）⇒ 一律不探，诚实标出来。

### 覆盖缺口

判定表里有 **24 条同族路径**（同一行的第 2…N 项，例如
`/api/telencephalon/mcp/servers` \| `/{id}`）**没探** —— 那几行的写法有歧义
（`/mcp/agents/{name}/servers` 不是第一项的后缀），**不猜**。

## ⚠️⚠️ 本轮最重的发现：`/models/providers` 把 LLM 的明文 API key 交出去

`src/api/providers.rs:18`：

```rust
pub struct ModelProvider {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub api_base: Option<String>,
    pub api_key: Option<String>,   // ← 明文，且没有 skip_serializing
    pub models: Vec<ModelInfo>,
}
```

`src/api/providers.rs:211`：

```rust
async fn list_providers(State(store): State<ProviderStore>) -> Json<Vec<ModelProvider>> {
    let providers = store.providers.read().await;
    Json(providers.values().cloned().collect())   // ← 整份序列化，含 api_key
}
```

而 `GET /models/providers` **没有任何鉴权**（实测 **200**，空手进）⇒ **配了 provider 之后，
任何本机进程都能读到那些 LLM 的明文 API key。**

### ⚠️ 而且浏览器能读（这比「本机进程」严重一档）

`src/api/mod.rs:187` 给**整张面**挂了 `CorsLayer::permissive()`。实测：

```
access-control-allow-origin: *
access-control-allow-methods: *
access-control-allow-headers: *
```

⇒ **用户访问的任何一个网站**，都能用 JS `fetch('http://127.0.0.1:60080/models/providers')`
把这个响应**读走**（CORS 放行 ⇒ 响应体对 JS 可见）⇒ **不需要任何本机权限**。
同理，那些开着的**写**端点也能被网页跨域调用（`allow-methods: *`）。

⚠️ 手机上更糟：嵌入式端脑跑在 App 进程内（127.0.0.1 + 随机端口）⇒ **手机浏览器里的任意
网站**同样够得着 ⇒ **「别的 App 能碰」变成了「别的网站能碰」**。

### ⇒ 修法：**不能简单遮掉字段**

⚠️ 桌面端 `shadow-desktop/src/pages/ProvidersPage.tsx:552`：

```ts
await invoke('provider_set_api_key', {
  id: editing.id,
  apiKey: editKey.trim() || editing.api_key || '',   // ← 把读回来的 key 再存回去
});
```

⇒ 如果把 `api_key` 遮成 `null`/掩码，桌面端「**留空保持不变**」那条路就会把**掩码当成
真 key 存进去** ⇒ **把用户的 key 洗掉**。⇒ 所以正确的修法是**用凭据把这条端点关起来**，
不是遮字段。

⇒ 而桌面端**本来就带凭据**：`telencephalonClient.ts:854` 的 `listProviders()` 走
`this.request()` ⇒ **每个请求都带 `X-Shadow-Key`** ⇒ ⇒ **端脑面整体上锁（判定表步 3）
恰好把这条洞关掉，而且桌面端一点事没有** —— 它带着钥匙，照样读得到 key。

⇒ 这条是**步 3 不只是「建议」而是「必须」**的最硬理由。

## 判定表的步 3 现在有了**验收仪器**

```bash
node scripts/probe-agent-surface.mjs --base http://127.0.0.1:60080
```

步 3 落地之后重跑一次 ⇒ 上面那 **13 条** 应当全部变成 **401**，
而 **C 类那几条应当仍然是 200**（锁了会自锁 —— 端脑自己就进不去了）。

⚠️ **别把「锁着」读成「全锁上了」**：探针只打**读**路径；**写路径不探**（会真的改状态）⇒
写路径的锁由源码层保证（`tests/shadow_key.rs` 那一档）。

## ⚠️ 三条还没解决的（按大小）

1. **CORS `permissive()`** ⇒ 浏览器能跨域读写整张面。**步 3 之后**它就无害了
   （浏览器拿不到钥匙）⇒ **所以它跟着步 3 一起解决**，不必单独做。
   ⚠️ 但在步 3 之前，它是上面那条洞的**放大器**。
2. **D 类完全无鉴权**（`/a2a/tasks/send` 任何本地进程都能提交任务，而它是**跨机协议**）
   ⇒ 本机秘密锁不了它 ⇒ 要**每台远端一份凭据** ⇒ 判定表「步 4：另立」。
   ⚠️ **动它要小心**：杏仁核回推**正是**靠 `POST {TEMPORAL_URL}/a2a/tasks/send` 打别的脑
   ⇒ 直接上锁会**打断回推** ⇒ 必须连着「对端也要持凭据」一起改 ⇒ **跨仓**（杏仁核 / 颞叶 / 端脑）。
3. **`/api/telencephalon/logs`** ⇒ 开着的状态下把日志尾部交出去。日志里通常有
   **提示词、路径、偶尔还有 token** ⇒ 判定表把它标成 B 类是对的。
   ⇒ 步 3 之后它要钥匙 ⇒ 关闭。
