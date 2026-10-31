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

---

## ⚠️⚠️ 补测（2026-10-31 晚）：**受控对照** —— 「两道门都配好」的那个实例

上面那份基线是**开发机 `:60080`** 上那个端脑（16:38 编的）测的 ⇒ 它**配了** shadow key
⇒ 「锁着的 5 条」是真的锁着。但那只覆盖了**一种**状态 ⇒ ⇒ **补一组受控对照**：
**同一个二进制、同一个端口、同一个 canary provider，只换配置**。

### 怎么做的

零编译成本：`encephalon/target/debug/encephalon-server.exe`（已编好的）＋
`TELENCEPHALON_CONFIG` 指向一份临时 YAML ＋ `TELENCEPHALON_PROVIDERS_FILE`
指向一份只含**假** provider 的 JSON（key 是 canary 串，不是真凭据）。

| 实例 | admin token | shadow key | 配置 |
|---|---|---|---|
| **Run B** | `dev-admin-key`（**默认**） | 空（**默认**） | 只有 canary provider |
| **Run C** | 一把真钥匙 `real-admin-key-7f3a91` | `probe-shadow-key-0001` | 同上，同一份 providers.json |

⚠️ 两个实例**同一个端口先后跑**（60091）⇒ 端口、路由、provider 数据全同 ⇒
**唯一变量就是那两行配置**。

<details>
<summary>复跑用的临时文件（原件）</summary>

`with-key.yaml`（Run C；⚠️ **必须写全** —— 少一个必需字段 ⇒ serde 解析失败 ⇒
**整份配置被丢弃** ⇒ 回落成默认配置 ⇒ key 为空 ⇒ 看起来像「门没生效」，
实测时我第一轮就踩了这个坑）：

```yaml
telencephalon:
  id: "probe-with-key"
  instance_name: "probe-with-key"
  bind: { http: "127.0.0.1:60091", mtls: "127.0.0.1:60011" }
  admin: { api_key: "probe-admin-token" }
  mds_discovery: { enabled: false, encryption_key_id: "default", advertise_interval_sec: 30, discover_interval_sec: 60 }
  trust_store: { auto_accept: false }
  storage: { neon_url: "postgres://probe", pool_max_conn: 4, audit_log_retention_days: 7 }
  wasm_runtime:
    default_resources: { memory_bytes: 104857600, fuel: 1000000, wall_clock_ms: 30000, network_policy: "deny_all" }
    auto_start_on_install: false
    health_check_interval_sec: 30
    max_concurrent_agents: 20
  a2a_gateway: { request_timeout_ms: 30000, rate_limit_per_minute: 1000, audit_enabled: true }
  shadow: { api_key: "probe-shadow-key-0001" }
```

`providers.json`（两份实例共用同一个文件 ⇒ provider 数据也全同）：

```json
{ "canary-openai": { "id": "canary-openai", "name": "Canary OpenAI (probe)",
  "provider_type": "openai", "api_base": "https://api.openai.com/v1",
  "api_key": "sk-FAKE-CANARY-LEAK-0001-DO-NOT-USE", "models": [] } }
```

跑法：

```powershell
$env:TELENCEPHALON_PROVIDERS_FILE = "$T\providers.json"
$env:TELENCEPHALON_CONFIG       = "$T\with-key.yaml"     # Run C；Run B 不设它
$env:TELENCEPHALON_ADMIN_KEY    = 'real-admin-key-7f3a91' # Run C；Run B 不设它
& 'C:\Projects\iBLOC\encephalon\target\debug\encephalon-server.exe' --port 60091
```

</details>

### 结果

```
Run B（默认安装的样子）
  admin 无凭据      => 200     ⚠️ 认任何 token
  admin 错 token    => 200     ⚠️
  admin 空 token    => 200     ⚠️
  shadow 无凭据     => 200     ⚠️ 开发模式全放行
  shadow 错的 key   => 200     ⚠️
  /models/providers => 200     ⚠️ 明文 canary key 原样吐出

Run C（两道门都正确配好）
  admin 无凭据      => 401   ✔
  admin 错 token    => 401   ✔
  admin 空 token    => 401   ✔
  admin 对的 token  => 200   ✔
  shadow 无凭据     => 401   ✔
  shadow 错的 key   => 401   ✔
  shadow 对的 key   => 200   ✔
  /models/providers => 200   ⚠️⚠️ 明文 canary key 照样吐出来
```

`/models/providers` 的 body（**无凭据**）：

```json
[{"id":"canary-openai","name":"Canary OpenAI (probe)","provider_type":"openai",
  "api_base":"https://api.openai.com/v1",
  "api_key":"sk-FAKE-CANARY-LEAK-0001-DO-NOT-USE","models":[]}]
```

CORS 头（Run C，同一条路由）：
`access-control-allow-origin: *`、`access-control-expose-headers: *`
⇒ **任意网站能跨域读走**。

### 这组对照量出来的三件事

1. **admin 面在默认安装上等于没鉴权** —— 根因是 `api_key.rs:28` 的
   `expected == "dev-admin-key"` ⇒ **连头都不看**；而两个宿主的默认值**恰好就是它**
   ⇒ ⇒ **默认安装走不到「没配 ⇒ fail-closed」那一支**。
   ⚠️ **「不带凭据 ⇒ 401」这种探测抓不到它** —— 那个探测测的是空分支。
2. **`/models/providers` 根本没有门** ⇒ 明文 key 在**两道门都正确配好**的实例上照样漏
   ⇒ ⇒ **凭据泄露不是「dev 模式才会」**。
3. **shadow key 不配就是开发模式** ⇒ ⇒ **「给 127 条路由加门」在默认安装上是空操作**
   ⇒ ⇒ 步 3 的规格要改成「加门 **且** 保证默认安装上钥匙存在」。

⇒ 判定表已据此改写（新增「二·补·二」小节 + 「步 3 的规格已被修正」+ **步 3a**）。

### 探针复跑（Run C：两道门都正确配好的那个实例）

```bash
node scripts/probe-agent-surface.mjs --base http://127.0.0.1:60091
```

⇒ **不拿凭据就能进的 A/B 类仍然是同样的 13 条**（与开发机 `:60080` 那份基线**逐条相同**），
其中包括 `/models/providers`（200，明文 canary key）⇒ ⇒
**「把 shadow key 配对」并不会让这 13 条变 401** —— 它们**压根没挂那道门**。
⇒ ⇒ **步 3a（给带凭据的路由补门）必须排在步 3 前面**，
否则步 3 上完，这 13 条**一条都不会变**。

⚠️ 另有 **25 条同族路径**没探（同一行的第 2…N 项，表里那几行写法有歧义 ⇒ 不猜）
+ **66 条写路径/SSE/WS** 未探测（探测就会真的改状态）。

### ⚠️ 探针的盲区（这次暴露出来的）

`probe-agent-surface.mjs` 默认只打**不带凭据**那一轮 ⇒ 它能发现「开着」，
但**发现不了「认任何 token」**（因为带**任意** token 都过 ⇒ 看起来像「带对钥匙就能进」）
⇒ ⇒ 补了一道**源码级**的闸：

```bash
node scripts/check-auth-backdoors.mjs
```

它抓「鉴权函数里 `== "字面量"` ⇒ 直接放行」「凭据默认值是源码字面量」
「前端 `?? '字面量'`」三类 ⇒ 当前 **4 条**，位置与上表一一对应
（`api_key.rs:28` / `a2a_server.rs:53` / `telencephalonClient.ts:1112` /
桌面端契约测试 `server-check.ts:22`）。
**反向验证**：摘掉后门的干净副本 ⇒ **0 条** ⇒ 闸门有分辨力，不是恒绿。
## ✅ 复测（2026-10-31 22:4x）：admin 面收口之后 —— **数目没变，成分变了**

admin 会话那档（端脑 `93121d1` / 独立宿主 `7a15359` / 桌面端 `aa80e43`）
落地之后，用**同一个探针**、**同一套配置**（shadow key 与 admin token **都真配好**）
重测了一遍那张面。

### 怎么做的

```bash
# 1) 起一台端脑（配置里 shadow key 与 admin token 都真配好；providers 指向 canary 文件）
$env:TELENCEPHALON_CONFIG       = "$T/with-key.yaml"      # shadow.api_key=probe-shadow-key-0001
$env:TELENCEPHALON_ADMIN_KEY    = 'probe-admin-token'     # admin.api_key 同值
$env:TELENCEPHALON_PROVIDERS_FILE = "$T/providers.json"   # 只含假 key 的 canary
& 'C:\Projects\iBLOC\encephalon\target\debug\encephalon-server.exe' --port 60091

# 2) 三轮探针：不带凭据 / 带 shadow key / 带 admin token
node scripts/probe-agent-surface.mjs --base http://127.0.0.1:60091 \
  --key probe-shadow-key-0001 --admin probe-admin-token --json
```

⚠️ 二进制是 **`--no-default-features --features mobile` 那档**（无 hippocampus）
⇒ 与第一次测的**全栈**二进制**不是同一个构建** ⇒ 路由集合略有差异（25 条同族
路径未探、66 条写路径未探，两次一致）⇒ ⇒ 下面比的是**同一张表、同一个探针**
在**两个时间点**上的结果。

### 量到的三件事

**① 数目没变，成分变了** —— 不拿凭据就能进的 A/B 类**仍然是 13 条**：

- `/models/providers`（200）、`/api/telencephalon/logs`、`/api/telencephalon/status`、
  `/api/telencephalon/agents`、`/api/telencephalon/lobes/capabilities`、
  `/api/telencephalon/lobes/list`、`/api/telencephalon/devices`、
  `/api/telencephalon/video-sources`、`/api/telencephalon/visual-tasks`、
  `/api/telencephalon/prefrontal/agents`、`/api/flows`、
  `/api/telencephalon/mcp/servers`、`/api/telencephalon/mcp/servers/{id}/tools`（500）。

⇒ ⚠️ **但 admin 类那几条**（`/api/telencephalon/admin/*`）**从清单里消失了**
⇒ ⇒ **「13」这个数字本身没变，换的是里面的人** ⇒ ⇒
**光盯计数会把这次收口完全藏起来** ⇒ ⇒ **报表必须带成分，不带计数**。

**② `/models/providers` 还在清单里，但泄的东西变了** ⇒ **掩码生效了**：
读接口现在回 `api_key = "********"`（**明文 canary key 不再出网**），
且客户端把掩码原样写回时**保留原 key**（不洗掉用户密钥）。
⇒ ⇒ **「明文泄露」这个洞已经关了**；**但这张面仍然零鉴权** ⇒
**写侧**（增删改 provider、改 LLM 上游指向、删模型）**任何本机进程都能做**
⇒ ⇒ **步 3a 仍然要做**（把凭据门挂上去），只是**理由从「明文泄露」变成了
「谁能重配这台大脑的上游」**。

**③ ⚠️⚠️ 决定性的一测：现有两把钥匙都关不住这 13 条**

- 带 **`X-Shadow-Key`**（正确的那把）那一轮：**13 条全部仍然进得去** ⇒
  **0 条被挡住**；
- 带 **`X-Admin-Token`**（正确的那把）那一轮：**同样 13 条全部仍然进得去** ⇒
  **0 条被挡住**。

⇒ ⇒ **这两张 router 上根本没有门** ⇒ ⇒ **加了门也没用**
（这两把钥匙压根不被读）⇒ ⇒ ⇒ **只有把锁提到 router 层（步 3）才能一次关掉这 13 条**。

⇒ ⇒ ⇒ **步 3 的规格因此收窄了一格**：要定的**不再**是「哪些端点加门」
（答案是「A+B 类全部」），**也不再**是「用哪把钥匙」（shadow key 与 admin token
**实测效果完全一样** ⇒ 因为它们现在都没被读）⇒ ⇒ **只剩一件事**：
**「默认安装上那把钥匙从哪来」** ⇒ ⇒ （手机端已经有答案：**宿主自己生成一把
随机 key 并持久化** ⇒ 桌面端照抄即可 ⇒ ⇒ 而端脑侧保持
「没配 ⇒ fail-closed」还是「没配 ⇒ 开发模式」仍是**唯一**需要拍板的点）。

### ⚠️ 一条探针自身的读法陷阱（这次差点读错）——**已修**

额外那两轮（带凭据）的判据**只出两个值**：`LOCKED`（401/403）或 `REACHED`
（其余一切）⇒ ⇒ **没有 `OPEN`** ⇒ ⇒ **「带 key 那轮 OPEN: 0 条」这句话是
无意义的**（那个字段压根不存在）⇒ ⇒ **要读的是 `REACHED`**（= 仍进得去）。
⇒ ⚠️ 记在这里，是因为**「0 条 OPEN」看起来像「全锁上了」** ——
而它其实说的是「那两项都没出现」⇒ ⇒ **失败长得像成功**的又一例。

✅ **已修（探针 `scripts/probe-agent-surface.mjs`）**：两轮现在**共用同一套判据**
（`classifyDoor()`：**2xx ⇒ `OPEN`**、401/403 ⇒ `LOCKED`、其余 ⇒ `REACHED`）⇒
⇒ 额外轮里 **200 就是 `OPEN`** ⇒ ⇒ **「带着钥匙仍然进得去」一眼能看出来**，
不必再靠「读 `REACHED`」这条暗规则 ⇒ ⇒ JSON 里也补了 `extraRounds[].stillOpen`
（= `OPEN` + `REACHED`）⇒ ⇒ **机器可读**。

### ✅ 修好之后重测（同一台实例，同一把钥匙）——**结论更锋利了**

| 轮次 | 仍然进得去的条数 | 说明 |
|---|---|---|
| 不拿凭据 | **13**（A/B 类） | 基线 |
| 带正确的 `X-Shadow-Key` | **24** | 13 条 A/B 类**一条都没被挡住** ⇒ 这把钥匙对这 13 条**完全无效** |
| 带正确的 `X-Admin-Token` | **24** | 同上 ⇒ 这把钥匙也一样**完全无效** |

⇒ ⇒ 24 里那多出来的 11 条，是**本来就该开着**的面（带钥匙才开）⇒ ⇒
⇒ **两把钥匙开的是不同的面**（这是**第一次**把它们分开量出来）：

- 带 `X-Shadow-Key` 才开：`/shadow/v1/agents`、`/shadow/v1/conversations`、
  `/.well-known/agent.json`（**shadow 面**）；
- 带 `X-Admin-Token` 才开：`/api/telencephalon/admin/agents/installed`、
  `/api/telencephalon/admin/config`（**admin 面**）。

⇒ ⇒ ⇒ **「两个域分开」这件事，第一次有了运行时证据**（不是设计文档里的声明）
⇒ ⇒ ⇒ 而**那 13 条对两把钥匙都免疫** ⇒ ⇒ ⇒ **步 3 = 在 router 层铺一把门 +
  定下那把钥匙的来源**（这两件事必须一起做：门铺了但钥匙是空的 ⇒ 等于没锁）。
