# 端脑面（agent surface）的端点 × 是否该锁 —— 一张可执行的判定表

**日期**: 2026-10-31
**范围**: `telencephalon::api::router` 合并出来的**全部 127 条路由 / 36 个模块**
（`src/api/*.rs` 的 117 条 ＋ `src/flow/api/mod.rs` 的 10 条 —— 后者在 `flow` feature
下才 merge，而**移动端带着 `telencephalon/flow` feature** ⇒ 它在移动端那张面上。）
**为什么现在做**: shadow key 那一档只锁了 `/shadow/v1/*`（127 条里的 **10 条**）⇒
剩下 **117 条**仍对同机任意进程敞开，其中包含「**叶区注册**」「**装 WASM agent**」
这两条比「换掉身份」更狠的路。
**这是决策档，不是实现档** —— 表列完、改代码是下一档。

---

## 一、三条判定原则

1. **同机任意进程打它，能造成什么？** —— 这是唯一的问题。「读」与「写」不是同一个量级：
   **写路径 = 改变大脑的行为**（往模型面前塞一条自己写的路、改 LLM 上游、签发 token）；
   **读路径 = 泄露这台机器的状态**（记忆预览、外部端点、provider 凭据、日志）。
2. **锁了会不会自锁？** —— App 自己要用的端点，锁上去必须让 App 仍然能带 key 打通 ⇒
   「客户端是否在**每一个**请求上都带 key」是这一档能不能做的**前提**（见第三节）。
3. **这把锁的钥匙由谁持有？** —— 「宿主与自己的客户端之间的门闩」只能锁**同机**的端点。
   **跨机**协议（A2A、WebRTC）**不能用本机秘密锁** ⇒ 它们要的是**另一种**机制
   （每台远端 agent 一份凭据）⇒ 别把它们混进这一张表（见 D 类）。

## 二、三条前置事实（不解决，「锁」这件事本身就站不住）

① **admin 面现在就是敞开的 —— 比 shadow key 那个洞更大。**
`verify_admin_token`（`telencephalon/src/security/api_key.rs:7`）与 `verify_shadow_token`
**语义不对称**：shadow 明确把「expected 为空」当**开发模式**放行；admin 却是
「expected 为空 ⇒ 必须带一个**空头**才算匹配」⇒ **空 `X-Admin-Token:` 头就能过**
⇒ 整个 `/api/telencephalon/admin/*`（**19 条**）无鉴权。
⚠️ 而**正牌 App 不发这个头 ⇒ 401** ⇒ 移动端的「建 agent / 装 WASM / 管 MCP」
功能**今天就是坏的**。⇒ **「改成 fail-closed」与「让 App 能用」是同一个原子问题**：
要么移动端也递一把 admin token（照 shadow key 那套），要么那批端点不该在移动端存在。
⚠️ 顺带：移动端设置页的提示写「留空则使用开发模式」（`settingsBackendAdminTokenHint`）
—— **与实际语义不符**（留空 ⇒ 401，不是开发模式；开发模式是**服务端**的 `dev-admin-key`）。

② **admin 鉴权是逐 handler 散的。** `agent_management.rs` / `llm_configure.rs` /
`llm_description.rs` / `mcp_admin.rs` 各自调 `verify_admin_token` ⇒ **漏一个就是一个洞**
⇒ 与 shadow key「挂在 router 层」的做法**形状正好相反** ⇒ 下一档应该**把它提到 router 层**
（一层管住 19 条），而不是继续逐个 handler 加。

③ **A2A 完全没有鉴权。** `src/api/a2a_gateway.rs` 里没有任何 auth/token/credential
⇒ `/a2a/tasks/send` 任何本地进程都能提交任务；而它又是**跨机**协议
⇒ **本机秘密锁不了它** ⇒ 要的是**每台远端 agent 一份凭据**
（即仍欠着的「签发侧接线」`src/acl/` + `credential_signer.rs`）。

④ **⚠️ admin 保护的端点并不都在 `/admin/` 路径下。**
`/api/telencephalon/thalamus/query` 与 `/api/telencephalon/thalamus/sensors`
（`src/api/thalamus.rs`）**各自在 handler 里校验 `X-Admin-Token`**，但它们的路径
**不在** `/api/telencephalon/admin/` 前缀下 ⇒ ⇒ **按路径前缀做「admin 面」的判断
会漏掉这两条** ⇒ ⇒ 「把 admin 鉴权提到 router 层」必须加在**合并之后的那个
router**（`api::router` 的返回值）上，**而不是每个模块自己的 router 上** ——
否则逐模块加一遍就会漏。

## 二·补：这张表是怎么验完整性的

表列完后用脚本把源码里 `.route(` 解析出来的**全部唯一路径**逐条与本文档比对
（`telencephalon/src/api/*.rs` + `telencephalon/src/flow/api/mod.rs`）⇒
**首轮漏了 8 条**（`PATCH /agents/{name}/config`、`POST /lobes/models`、
`POST /lobes/reconfigure/{name}`、`POST /thalamus/query`、`POST /flows/{id}/validate`
、`GET /hippocampus/admin/config`、`GET /thalamus/sensors`、
`GET /thalamus/video/cameras|clips`）⇒ 其中**三条是写路径** ⇒ **已补进本文档**。
⇒ **教训**：这种表**必须用脚本对着源码验一遍**，人肉列一定会漏 ⇒ 端点集合是会长的
（今天 127 条），表会过期。
⇒ **复验结果**：补完之后再跑一遍 ⇒ **121 条唯一路径（127 条路由条目，差额是同路径多方法），
逐条命中，0 条未覆盖**（文档里有 30 条是**成组写法**，如
`…/start | /stop`、`…/preview/*` ⇒ 已逐条核对过）。

### ✅ 复跑脚本已入库（2026-10-31）

⚠️ 上面那次校验用的脚本**从来没进过仓** ⇒ 下一个加端点的人**没法复跑** ⇒ 表会**静默过期**
⇒ 而表过期 = 判定错 = 该锁的没锁。⇒ 现在它在这儿：

```bash
node scripts/check-endpoint-matrix.mjs --source C:\Projects\iBLOC\telencephalon
```

它把 `telencephalon/src/api` 与 `src/flow/api/mod.rs` 里的 `.route("…"` 逐条解析出来，
与本文档比对 ⇒ **漏了就退出码 1**。
（它认得这三种成组写法：**后缀** `/…/servers` + `/{id}`、**兄弟** `/…/tools` + `/mcp/agents/…`、
**通配** `/…/preview/*` ⇒ 不会误报。`--why <路径>` 可以问「这条是被哪条规则算覆盖的」。）

**本次复跑抓到 2 条真漂移**（⇒ 已补进表）：

| 漏的 | 出处 | 说明 |
|---|---|---|
| `GET /api/telencephalon/agents` | `src/api/agents.rs` | 表里写的是 `/api/telencephalon/agents/list`（**那条也在**，`agents_registry.rs`）⇒ **两条并存**，表漏了后者 |
| `POST /a2a` | `src/api/a2ui_gateway.rs` | **2026-10-31 新增**的 A2UI 产出面 ⇒ 已归 B 类并标「**已锁**」 |

⇒ 复跑结果：**128 条路由 / 122 条唯一路径，0 条未覆盖**。

> ⚠️⚠️ **这份文档是「机器解析」的** ⇒ 改它的时候有两条硬约束（都是实测踩出来的）：
>
> ① **表格的第一格必须是端点** —— 复跑脚本把**每一行**以 `|` 开头的行都当端点行解析
>    ⇒ 在这里加一张**第一格不是端点**的表（哪怕只是给人看的对照表）⇒
>    它的第一格会被当成**一条不存在的路由** ⇒ 报成「表里有源码里找不到的东西」。
>    ⇒ **要放对照表 ⇒ 放基线文档那份**（`…-probe-baseline.md`），别放这里。
> ② **别在正文里写孤立的反引号串** —— markdown 的行内代码按反引号顺序两两配对
>    ⇒ 而**围栏记号（三个连续反引号）**里含**相邻**反引号 ⇒ 配不出空 span
>    ⇒ ⇒ **一个孤立的围栏记号出现在正文里 ⇒ 后面所有反引号的配对就整体错位一格**
>    ⇒ ⇒ 实测：在本文档里写一个孤立的围栏记号 ⇒ 复跑脚本报「漏了 18 条」、
>    「全文只提到 13 个路径 token」（文档明明有几百个），
>    **而源码一个路由都没变** ⇒ **表没坏，是解析器被文档格式搞坏了**。
>    ⇒ ⚠️ **围栏代码块本身是安全的**（成对的围栏净偏移为 0）⇒
>    **出问题的是正文里那一个孤立的**。
>    ⇒ ⚠️ **「已修」这句话当时是错的** —— 本轮修的只是**围栏块**（把它们剥出来
>    单独配对），**正文里那个孤立的仍然会把守卫弄红** ⇒ ⇒
>    ⇒ 真正的修法在**解析器**（按 CommonMark 规则：闭合的反引号串长度必须相等）
>    ⇒ **那一条正在落地**；在那之前，**正文里别写孤立的反引号串**。
>    ⇒ ⚠️ 这是「同一个字符串在两种语言里含义不同」的**孪生兄弟**
>    （JS 块注释不可嵌套 / Rust 可嵌套，见 ㊺ 条）⇒ **同一个道理：
>    校验器也得扛得住文档的普通写法**，不然它就成了「一改文档就误报」的东西。

## 二·补·二：「门在，但认任何人」—— 2026-10-31 受控实测抓到的三件事

⚠️ 这三条**不在**第二节那三条「前置事实」里 —— 第二节写的是「admin 面空头能过」
（那条 ㊻ 已修成 fail-closed）。**这三条是那一档修完之后再实测的，形状不同**：
第二节那条是「**没配钥匙** ⇒ 空分支」，这三条是「**配了钥匙，但那把钥匙是公开的**
⇒ 走的是另一个分支」⇒ ⇒ **第二节那条修好了，这三条一个都没动。**

### ① `dev-admin-key` 让 admin 面**认任何 token** ⇒ 默认安装等于没鉴权

`telencephalon/src/security/api_key.rs:27-30`：

```rust
// In development mode with default key, skip verification
if expected == "dev-admin-key" { return Ok(()); }
```

⇒ expected 是那个值时，**连请求头都不看**就放行 ⇒ 任何 token、甚至**完全不带
`X-Admin-Token`** 都过。⚠️ 而**两个宿主的默认值恰恰就是它**：

- `encephalon/src/a2a_server.rs:53` `standalone_admin_token()` ⇒ `unwrap_or_else(|| "dev-admin-key".to_string())`
- `shadow-desktop/src-tauri/src/cortex_http.rs` `desktop_admin_token()` ⇒ 同款

⇒ ⇒ **默认安装走不到「没配 ⇒ fail-closed」那一支**（`api_key.rs:23-25`，㊻ 修的那条）
⇒ **桌面端 + 独立端脑服务器的 admin 面（装 agent / 改 LLM 上游 / 动 MCP）默认等于
没有鉴权。** ⚠️ 这个后门**还有一条测试钉着**（`api_key.rs:181`
`admin_keeps_the_dev_bypass_for_the_dev_key`，断言 `headers` 为空也该过）
⇒ 改它要连测试一起改 ⇒ 而改它**必须同批**把两个宿主的默认凭据换掉
（桌面端**只有** `issueSubsystemToken` 带 `X-Admin-Token`，
`shadow-desktop/src/lib/telencephalonClient.ts:1110-1120`；
**它的 agent 管理请求根本不带那个头**）⇒ 否则桌面端「建 agent」401。

**受控实测**（同一个二进制 `encephalon/target/debug/encephalon-server.exe`，
唯一变量是 admin token 的取值）：

- **admin token = `dev-admin-key`（默认）** ⇒ 无凭据 **200** ／ 错 token **200** ／
  空 token **200** ／ 对的 token 200
- **admin token = 一把真钥匙** ⇒ 无凭据 401 ／ 错 token 401 ／ 空 token 401 ／
  对的 token 200

⇒ ⚠️ **光靠「不带凭据 ⇒ 401」这种探测看不出这个洞** —— 它测的是空分支，
而默认路径压根不在空分支上。

### ② `/models/providers` **根本没有门** ⇒ 明文 LLM key 在**正确配置的安装**上照样漏

`src/api/providers.rs:18-23` 的 `api_key` 没有 `skip_serializing`，`list_providers`
（`:211`）整份序列化，路由（`api/mod.rs:132`）**没挂任何门**。

**实测**（admin + shadow 两道门**都正确配好**的那个实例）：
`GET /models/providers` ⇒ **200**，body 里明文：

```json
[{"id":"canary-openai", … ,"api_key":"sk-FAKE-CANARY-LEAK-0001-DO-NOT-USE","models":[]}]
```

且 `Access-Control-Allow-Origin: *`（`api/mod.rs:188` 的 `CorsLayer::permissive()`）
⇒ **用户访问的任意网站都能跨域读走**。

⇒ ⇒ **凭据泄露不是「dev 模式才会」，是「那扇门不存在就永远会」** ⇒ ⇒
**步 3 必须先有步 3a**（把带凭据的路由关进门里），否则步 3 上完它照样漏。

### ③ shadow key 在没配配置文件时是**开发模式** ⇒ ⇒ **步 3 单独做是空操作**

`require_shadow_key`（`src/api/shadow_auth.rs:49`）`expected.is_empty()` ⇒ 全放行；
而 `boot.rs:116` 的 `TELENCEPHALON_CONFIG` **没有默认路径兜底**（`config/mod.rs` 的
`env_var` 只查环境变量，查不到就用默认配置）⇒ **不设它 ⇒ shadow key 必为空**
⇒ 桌面端 `shadow_api_key: None`、独立服务器 `BuildOptions::default()` ⇒ **正是这条路径**。

⇒ ⇒ ⚠️ **步 3 的规格因此要改**：不是「给 127 条路由加门」，而是
「**给 127 条路由加门，且保证默认安装上钥匙存在**」⇒ 否则那张门在默认安装上
**永远是开的**（`require_shadow_key` 会给每一个请求放行）。

### ⇒ 静态闸：这类洞「打一发」抓不全，得读源码

①②③ 的形状都是**源码属性**（运行时能测到「认任何 token」，但测不到
「那把 token 根本不是秘密」—— `dev-admin-key` 是**源码里的字面量**，谁都知道）
⇒ ⇒ 加了一道**源码级**的闸：

```bash
node scripts/check-auth-backdoors.mjs
```

它抓三类：**A** 鉴权函数里「`== "字面量"` ⇒ 直接 `return Ok(…)`」；
**B** 凭据解析函数的默认凭据是源码字面量；**C** 前端 `?? '字面量'` 的默认凭据。

**当前结果（4 条，位置与上面的实测一一对上）**：

- **A**（放行分支）⇒ `telencephalon/src/security/api_key.rs:28` ——
  `verify_admin_token` 的 `dev-admin-key` 放行分支
- **B**（字面量默认凭据）⇒ `encephalon/src/a2a_server.rs:53` ——
  `standalone_admin_token()` 默认凭据是公开字面量
- **C**（前端硬编码）⇒ `shadow-desktop/src/lib/telencephalonClient.ts:1112` ——
  前端默认凭据是公开字面量
- **C**（前端硬编码）⇒ `shadow-desktop/tests/api-contract/server-check.ts:22` ——
  **契约测试**里也硬编码了这把钥匙 ⇒ 它被当成「契约」在用

**反向验证**：把后门摘掉的**干净副本** ⇒ **0 条**（真实仓 ⇒ 1 条 [A]）
⇒ **闸门有分辨力，不是恒绿**。

### 二·补·三：门朝哪儿开 —— 「暴露面」是锁的**乘数**，不是可选项

锁与暴露面是**乘积关系**：**门锁上了但门对着局域网开着 = 没锁。**
⇒ ⇒ 这张表里的 A/B 类端点，**在局域网可达的面上**，等于「同网段任何设备
都能碰」。

**2026-10-31 实测到的**：独立端脑服务器（`encephalon-server`）把监听地址
**写死**成 `0.0.0.0`（`encephalon/src/a2a_server.rs:207` 的
`TcpListener::bind(("0.0.0.0", port))`）⇒ 「随手起一台端脑」= 把这约 30 张
**还没上锁**的 router 放到**局域网**上。

⚠️ **而端脑 YAML 里那句 `bind.http: "127.0.0.1:60080"` 对它完全无效**
⇒ ⇒ **「配置说了，没人听」** —— 这是本项目的老形状：**失败长得像成功**。

**已改成「暴露面必须显式」**：

| | 决定什么 | 默认 | 怎么改成宽绑定 |
|---|---|---|---|
| `--bind <ip>` | 独立宿主监听哪 | `127.0.0.1`（回环） | `--bind 0.0.0.0` |
| `TELENCEPHALON_BIND` | 同上（第二入口） | 回环 | `TELENCEPHALON_BIND=0.0.0.0` |
| `telencephalon.bind.http` | **端脑面在哪**（自调用打哪） | 回环 + 60080 | 配置文件里显式写 `0.0.0.0:60080` |

⚠️ **配置文件不决定独立宿主的暴露面** —— 端脑 YAML 说的是「端脑面在哪」，
不是「这台服务器暴露到哪」⇒ 混在一起的话，一份端脑配置就能悄悄把整台
agent 放到局域网上。⇒ ⇒ 两条线各管各的。

⚠️ **只接受 IP 地址**（不做 DNS 解析）⇒ 「绑哪儿」不会变成「解析到哪儿」；
认不出来 ⇒ **报错**，不猜。

**顺带挖出一个更老的洞**：`bind.http` 这个字段**三处都被静默忽略** ——
`api/prefrontal.rs` 与 `lobes/mod.rs` 把它当**端口号** `parse::<u16>()`
（而字段里写的是 `"0.0.0.0:60080"` ⇒ **永远解析失败** ⇒ 永远回落 60080），
`api/agents_registry.rs` 把它当 **URL 前缀**（⇒ 拼出
`"0.0.0.0:60080/hippocampus/api/memory"` ⇒ **连 scheme 都没有**）
⇒ ⇒ **「配置里的端口」从来没生效过，而且不报错**。
⇒ 现在统一走 `telencephalon::config::bind`（容错解析器：`host:port` /
裸端口 / `:端口` / 空 ⇒ **默认回环**）。

**静态闸**（同源级，和上面那道一样是「打一发抓不全」的补充）：

```bash
node scripts/check-bind-exposure.mjs
```

⚠️ **判据不是「出现过 `0.0.0.0`」而是「出现在绑定位置」** —— 第一版太粗，
把**比较**（`if bind_host == "0.0.0.0"`）、**提示文案**、**测试断言**
全抓成宽绑定 ⇒ 11 条误报 ⇒ 闸门会被当噪音关掉。
⇒ 收紧成三种：**在 `bind(` 的实参里** / **赋给一个像绑定目标的名字** /
**当兜底值**。⇒ 当前 **0 条**。
⇒ ⚠️ **探测器自己也有自检**（10 只样本）⇒ 探测器坏了 ⇒ **退出码 2**，
不是「没发现问题」。

**反向验证**：把独立宿主改回 `0.0.0.0` ⇒ **恰好 1 条红**（EXIT=1）；
还原 ⇒ 0 条（EXIT=0）⇒ **有分辨力，不是恒绿**。

## 三、「扩展到整张面」几乎免费 —— 两端都成立

- **移动端**：`TelencephalonClient._headers()`（`shadow-mobile/lib/services/telencephalon/
  telencephalon_client.dart:679-687`）在 `_apiKey` 非空时**给每一个请求**加 `X-Shadow-Key`
  ⇒ **锁一旦提到整张面，移动端不用改代码**就自动跟着锁上。
- **桌面端**（**这条修正了一个流行说法**）：`telencephalonClient.ts:578-585` 同样在
  `apiKey` 存在时给**每个**请求加 `X-Shadow-Key`；store 的 `setApiKey` 会同步给 client
  （`stores/telencephalonStore.ts:71-77`），rehydrate 时也会补设（`:155`）⇒
  **桌面端也不是「一加锁就全量 401」**。
  ⚠️ 桌面端的 key 来自**用户设置**（持久化在 `connection.apiKey`）⇒ 若端脑的配置文件有
  key 而 App 的 store 没有，**今天就已经坏了**（`telencephalonClient.ts:557` 那条注释
  警告的就是这件事）。

⇒ **所以真正要定的边界不是「哪个客户端会 401」，而是「**
**哪些*别的*进程合法地需要打这张面、而且不带 key**」** —— 例如 A2A 对端、
WebRTC 浏览器、桌面端自己起的 sidecar、外部端脑进程。⇒ 这是 D 类。

⚠️ **唯一一个已知地雷**（扩展到整张面时它会**第一个** 401）：
`PrefrontalClient` 内部**自己 new 了一个不带钥匙的 `TelencephalonClient`**
（`shadow-mobile/lib/services/prefrontal_client.dart:1621`）⇒ 它 `listFlows()` 打的是
`/api/telencephalon/flows` ⇒ **要顺手修掉它**（改成注入共享 client）。

---

## 四、分级结果

### A 类 —— 必须锁（写路径：改变大脑的行为）

| 端点 | 方法 | 模块 | 移动端在用 | 为什么必须锁 |
|---|---|---|---|---|
| `/telencephalon/lobes/{name}` | POST | lobe_register | — | **叶区注册** ⇒ 往模型面前塞一条自己写的路（比换身份更狠） |
| `/api/telencephalon/admin/agents/install` | POST | wasm_install | ✅ | **装 WASM agent** ⇒ 塞一条自己写的执行路径 |
| `/api/telencephalon/admin/agents/{name}/{version}` | DELETE | wasm_install | ✅ | 卸别人的 agent |
| `/api/telencephalon/admin/agents/create` | POST | agent_management | ✅ | 建 agent |
| `/api/telencephalon/admin/agents/register` | POST | agent_management | — | 注册 agent |
| `/api/telencephalon/admin/agents/generate-description` | POST | llm_description | ✅ | 改 agent 描述 ⇒ 影响模型看到的人设 |
| `/api/telencephalon/admin/mcp/servers` | POST | mcp_admin | ✅ | **引入外部进程**（MCP server） |
| `/api/telencephalon/admin/mcp/servers/{id}` | DELETE | mcp_admin | ✅ | 拔掉别人的 MCP server |
| `/api/telencephalon/admin/mcp/servers/{id}/start` \| `/stop` | POST | mcp_admin | ✅ | 启停外部进程 |
| `/api/telencephalon/admin/mcp/agents/{name}/servers/{id}` | POST \| DELETE | mcp_admin | ✅ | 给某个 agent 挂/摘 MCP server |
| `/api/telencephalon/admin/llm/configure` | POST | llm_configure | — | **改 LLM 上游** ⇒ 把流量引到别处 |
| `/api/telencephalon/admin/token` | POST | subsystem_token_admin | — | **签发子系统 token** ⇒ 提权 |
| `/api/telencephalon/admin/test/reset` | POST | test_reset | — | **抹掉状态** |
| `/api/telencephalon/admin/config` | GET,PUT | config_api | — | PUT 改全局配置；GET **可能带出凭据** |
| `/api/telencephalon/admin/visual-tasks` | POST | visual_task_admin | — | 改视觉任务 |
| `/api/telencephalon/admin/visual-tasks/{id}` | DELETE | visual_task_admin | — | 删视觉任务 |
| `/api/telencephalon/chat/completions` | POST | providers | — | 直接烧模型 / 拿模型输出 |
| `/api/telencephalon/agents/{name}/config` | PATCH | agents | ✅ | **改 agent 配置**（部署方用它设 `affect_policy` 那一类开关） |
| `/api/telencephalon/lobes/models` | POST | lobe_runtime | ✅ | **下发模型路由** ⇒ 注册远端引擎 + 给叶区定模型 |
| `/api/telencephalon/lobes/reconfigure/{name}` | POST | lobe_runtime | — | **改叶区的 OpenAI base_url** ⇒ 把某个叶区的模型流量引到别处 |
| `/api/telencephalon/thalamus/query` | POST | thalamus | — | **跑 SQL 查传感器数据**（⚠️ 它**已经**要求 admin token ⇒ 但路径**不在** `/admin/` 下 ⇒ 见第二节 ④） |
| `/api/telencephalon/prefrontal/dispatch` | POST | prefrontal | — | **执行路径** |
| `/api/telencephalon/devices/{id}/invoke` | POST | device | — | **控制别的设备** |
| `/api/telencephalon/devices/{id}/tools` | PUT | device | — | 改别的设备的工具 |
| `/api/telencephalon/devices/{id}` | DELETE | device | — | 删设备 |
| `/api/telencephalon/thalamus/manage/sensors` | POST | thalamus_public | — | 改传感器配置 |
| `/api/telencephalon/thalamus/manage/sensors/{name}` | DELETE | thalamus_public | — | 删传感器 |
| `/api/telencephalon/thalamus/manage/sensors/{name}/config` | PUT | thalamus_public | — | 改传感器配置 |
| `/api/telencephalon/thalamus/push` | POST | thalamus | — | 往大脑灌数据 |
| `/api/telencephalon/thalamus/video/push` | POST | thalamus_video | — | 往大脑灌视频帧 |
| `/api/telencephalon/neuron/admin/model` | POST | neuron_public | — | 换模型 |
| `/api/telencephalon/neuron/admin/model/{capability}/{name}` | DELETE | neuron_public | — | 删模型 |
| `/api/telencephalon/visual-qa/sources-broadcast` | POST | visual_qa_sources_broadcast | — | 广播视觉源 |
| `/api/telencephalon/tasks` | POST | tasks_admin | ✅ | 建任务 |
| `/api/telencephalon/tasks/{id}` | DELETE | tasks_admin | ✅ | 删任务 |
| `/api/telencephalon/tasks/{id}/confirm` | POST | tasks_admin | ✅ | 确认任务 ⇒ 触发执行 |
| `/api/telencephalon/tasks/{id}/status` | POST | tasks_admin | ✅ | 改任务状态 |
| `/api/telencephalon/video-sources` | PUT | video_source | — | 改视频源 |
| `/api/telencephalon/video-sources/{id}/probe` | POST | video_source | — | 探测视频源 |
| `/api/flows` | POST | flow | ✅ | 建工作流 |
| `/api/flows/{id}` | DELETE | flow | — | 删工作流 |
| `/api/flows/{id}/run` | POST | flow | ✅ | **执行一条工作流** ⇒ 移动端每天在用 |
| `/api/flows/traces/ingest` | POST | flow | — | 灌 trace |
| `/api/flows/draft/{id}/promote` | POST | flow | ✅ | 把草稿转正 ⇒ 进正式执行路径 |
| `/api/flows/draft/{id}/reject` | POST | flow | ✅ | 驳回草稿 |
| `/models/providers` | POST | providers | — | 加 provider |
| `/models/providers/{id}` | PUT,DELETE | providers | — | 改/删 provider（含 api_key） |
| `/models/providers/{id}/auto-match` | POST | providers | — | 自动匹配模型 |
| `/models/providers/{id}/fetch-models` | POST | providers | — | 拉模型列表（外连） |
| `/models/providers/{id}/test` | POST | providers | — | 测 provider（外连 + 带 key） |
| `/models/{provider_id}/{model_id}` | DELETE | providers | — | 删模型 |
| `/api/telencephalon/voice/synthesize` | POST | voice | — | 烧 TTS |
| `/api/telencephalon/voice/transcribe` | POST | voice | — | 烧 STT |
| `/api/telencephalon/agents/scan` | POST | agent_management | ✅ | 扫网段 ⇒ 探测内网 |
| `/api/telencephalon/agents/sync/{provider_id}` | POST | agent_management | ✅ | 从 provider 同步 agent |
| `/shadow/v1/identity` | POST | shadow | ✅ | **换掉「这台机器是谁」**（**已锁**） |
| `/shadow/v1/conversations/{id}/tool-results` | POST | shadow | ✅ | **伪造工具回执** ⇒ 模型以为工具跑过了（**已锁**） |
| `/shadow/v1/conversations/{id}/messages` \| `:stream` | POST | shadow | ✅ | 往会话里塞消息 ⇒ prompt injection（**已锁**） |
| `/shadow/v1/conversations/{id}/import` | POST | shadow | ✅ | 塞历史 ⇒ 改写上下文（**已锁**） |
| `/shadow/v1/conversations` | POST | shadow | ✅ | 建会话（**已锁**） |

### B 类 —— 建议锁（读为主：泄露状态 / 凭据 / 记忆）

| 端点 | 方法 | 模块 | 移动端在用 | 泄露什么 |
|---|---|---|---|---|
| `/api/telencephalon/admin/agents/installed` | GET | wasm_install | ✅ | 装了哪些 WASM agent |
| `/api/telencephalon/mcp/servers` \| `/{id}` | GET | mcp_admin | ✅ | **外部 MCP server 的端点（可能带凭据）** |
| `/api/telencephalon/mcp/servers/{id}/tools` \| `/mcp/agents/{name}/servers` \| `/tools` | GET | mcp_admin | ✅ | 外部 server 暴露的工具面 |
| `/api/telencephalon/logs` | GET | system_status | — | **日志里可能有敏感内容** |
| `/api/telencephalon/status` | GET | system_status | — | 运行态 |
| `/api/telencephalon/hippocampus/preview/*` | GET | hippocampus_public | — | **记忆预览**（隐私）；⚠️ 仅 host 版有（`hippocampus` feature） |
| `/api/telencephalon/thalamus/preview/*` | GET | thalamus_public | — | 传感器数据（隐私） |
| `/api/telencephalon/thalamus/sensors` | GET | thalamus | — | 传感器清单（⚠️ 已要求 admin token，但路径不在 `/admin/` 下 ⇒ 见第二节 ④） |
| `/api/telencephalon/thalamus/video/cameras` \| `/clips` \| `/clips/{camera}/{ts_ms}` | GET | thalamus_video | — | **摄像头清单与录像**（隐私） |
| `/api/telencephalon/hippocampus/admin/config` | GET | hippocampus_public | — | 海马体配置（⚠️ 仅 host 版有） |
| `/api/telencephalon/neuron/preview/*` | GET | neuron_public | — | 模型/引擎清单 |
| `/api/telencephalon/agents` \| `/list` \| `/registry` \| `/exposed` \| `/search` \| `/discover` \| `/mirror` | GET | agents_registry / agent_management / agent_search | ✅ | 叶区与 agent 清单 |
| `/api/telencephalon/lobes/capabilities` \| `/manifest` \| `/manifest/{name}` \| `/runtime/{name}` | GET | lobe_manifest / lobe_runtime | — | 叶区能力面 |
| `/api/telencephalon/lobes/list` | GET | lobe_runtime | ✅ | 叶区清单 |
| `/api/telencephalon/devices` \| `/{id}` | GET | device | — | 设备清单 |
| `/api/telencephalon/video-sources` \| `/{id}` | GET | video_source | — | 视频源清单 |
| `/api/telencephalon/visual-tasks` \| `/{id}` | GET | visual_task_admin | — | 视觉任务 |
| `/models/providers` | GET | providers | — | **provider 配置（含 api_key）** |
| `/api/telencephalon/prefrontal/agents` | GET | prefrontal | — | 前额叶 agent 清单 |
| `/api/flows` \| `/{id}` \| `/executions` \| `/traces` \| `/draft` | GET | flow | ✅ | 工作流定义与执行历史 |
| `/shadow/v1/agents` \| `/{name}` | GET | shadow | ✅ | 叶区元数据（**已锁**） |
| `/shadow/v1/conversations` \| `/{id}` | GET | shadow | ✅ | **会话历史**（隐私；**已锁**） |
| `/a2a` | POST | a2ui_gateway | — | **A2UI 产出面**（把**任务标题**、**agent 名字**渲染成界面吐出来 ⇒ 是一张**数据面**，不是静态面）；⚠️ **已锁**（2026-10-31 新增，与 `/shadow/v1/*` **同一道门** ⇒ `api::shadow_auth::require_shadow_key`）；⚠️ 它同时是 **A2A v0.3 的 JSON-RPC 入口** ⇒ 跨机对端最终要**每台一份凭据**（见 D 类） |

### C 类 —— 该开着（锁了会自锁 / 本机自用）

| 端点 | 方法 | 模块 | 为什么该开着 |
|---|---|---|---|
| `/api/trace/stream` | GET | trace | SSE 事件流（调试面板） |
| `/api/webrtc/{modality}/sessions/{session_id}/ws` | GET | webrtc_route | WebSocket —— **浏览器要连**（带不了自定义头） |
| `/.well-known/agent.json` | GET | well_known_router | 代理发现 |
| `/wasm/{name}/.well-known/agent.json` | GET | wasm_route | WASM agent 发现 |
| `/api/flows/{id}/validate` | POST | flow | **纯静态校验**（`flow::compiler::validate::validate`）⇒ 不执行、不改状态 ⇒ 锁它**没有安全收益** |

### D 类 —— 需要**另一种**机制（跨机 ⇒ 本机秘密锁不了）

| 端点 | 方法 | 模块 | 为什么不能靠本机 key |
|---|---|---|---|
| `/a2a/tasks/send` | POST | a2a_gateway | **跨机 A2A 协议** ⇒ 对端是别的设备/进程 ⇒ 要**每台对端一份凭据**（= 仍欠着的签发侧接线） |
| `/a2a/tasks/{id}` | GET | a2a_gateway | 同上（查任务状态） |
| `/a2a/tasks/{id}/cancel` | POST | a2a_gateway | 同上 |
| `/wasm/{name}/a2a/tasks/send` | POST | wasm_route | 同上（WASM agent 的 A2A 入口） |

⚠️ D 类现在**完全无鉴权** ⇒ 任何本地进程都能 `/a2a/tasks/send` ⇒ 这是**比 shadow key
更大的一档**，但它的修法**不是**同一把钥匙 ⇒ 别混在一起做。

### 不在移动端那张面上的（host 端才有）

`/api/sessions/*` 与 `/api/telencephalon/hippocampus/*` 只在 `hippocampus` feature 下 merge
⇒ **移动端的 agent surface 上根本不存在** ⇒ 不影响移动端那一档。

---

## 五、落地顺序（每一步都能独立验）

| 步 | 做什么 | 会不会自锁 | 独立验收 |
|---|---|---|---|
| **1** | **修 admin 面的空洞**（空头能过）+ **把 admin 鉴权提到 router 层**（加在**合并后**的那个 router 上 ⇒ 见第二节 ④，否则会漏 `thalamus/query` / `thalamus/sensors`）+ 移动端也递一把 admin token | 移动端的 admin 功能**今天就是坏的**（401）⇒ 修完才第一次能用 | 「不带 token ⇒ 401」「带对 token ⇒ 200」「空 token ⇒ 401」 |
| **2** | 修**地雷**：`PrefrontalClient` 内部自建的 client 改成注入共享 client | 会有一个 401 ⇒ 顺手修 | 移动端 `/api/flows` 仍然通 |
| **3** | 把锁**从 `/shadow/v1/*` 提到整张面**（A+B 类） | 两端客户端本来就带 key ⇒ 不自锁（⚠️ 但见「步 3 的规格已被修正」——**默认安装上那道门是空的**） | 「同机任意进程打 A 类 ⇒ 401」＋「App 全部功能照旧」 |
| **3a** | **先关带凭据的路由**：`/models/providers` 这类**吐出凭据**的路由挂进门里（并处理 CORS） | 桌面端本来就每请求带 `X-Shadow-Key` ⇒ 不自锁；⚠️ 但**桌面端读回来的 key 会再存回去**（`ProvidersPage.tsx:552`）⇒ **不能简单遮字段** | 「不拿凭据 ⇒ 401」＋「桌面端 provider 页照旧能保存」 |
| **4** | D 类另立：每台远端 agent 一份凭据（`src/acl/` + `credential_signer.rs`） | 跨机 ⇒ 不能用本机 key | 跨机 A2A 仍然通，且未授权对端被打回 |

⚠️ **步 3 之前必须先做完步 1**：否则「整张面都要 key」这个决定，会把 admin 那 19 条
**变成双重门**（shadow key + admin token）⇒ 而移动端没有 admin token ⇒ App 的
agent/WASM/MCP 管理功能会从「401」变成「401」（没变好，但排查会更难）。

### ⚠️⚠️ 步 3 的规格已被修正（2026-10-31 受控实测）

第二节·补·二那三条把「步 3 = 给 127 条路由加门」这个说法**改掉了**：

1. **步 3a 要排在步 3 前面** —— `/models/providers` **根本没有门** ⇒
   明文 LLM key 在**两道门都正确配好**的实例上照样漏（实测 200 + 明文）
   ⇒ ⇒ **步 3 上完它照样漏** ⇒ ⇒ 步 3a 不是「可选的加固」，是**步 3 的必要前置**。
2. **步 3 还要带一条新动作：保证默认安装上钥匙存在。**
   `require_shadow_key` 在 expected 为空时**放行一切**（`shadow_auth.rs:49`），
   而 `TELENCEPHALON_CONFIG` 没有默认路径兜底 ⇒ **不设它 ⇒ 整面敞开**
   ⇒ ⇒ 只加门不改钥匙 ⇒ **门在默认安装上是装饰**。
   ⇒ **要定的不是「哪些端点加门」，而是「默认安装上那把钥匙从哪来」**：
   - 桌面端 / 独立端脑服务器**自己生成一把随机 shadow key 并持久化**（像手机端那样，
     宿主生成 ⇒ 端脑不发明）；**或**
   - 端脑侧 shadow key 也改成 **fail-closed**（没配 ⇒ 全 401）——
     ⚠️ 那就**必须**同时让两个宿主都递一把进来，否则桌面端整片 401。
   ⇒ ⚠️ **这两条是互斥的工程选择，需要拍板**，不属于「照着做就行」的部分。
3. **admin 面的残留洞（`dev-admin-key` 认任何 token）也要一起解决** ——
   它**不在**步 1 的范围里（步 1 修的是「没配 ⇒ 空分支」），而在**宿主默认值**里
   ⇒ ⇒ 要改的是**两个宿主 + 端脑那一条后门 + 钉着它的那条测试**，跨三个仓。

## 六、不在本次范围内

- **neuron 面绑 `0.0.0.0`**（同网段可达）—— 那是**绑定地址**问题，不是鉴权问题 ⇒ 另一档。
- **桌面端的端脑（:60080）默认也绑 `0.0.0.0`**（`config.telencephalon.bind.http` 的默认值）
  ⇒ 同一类问题。
- **签发侧接线**（`src/acl/` + `credential_signer.rs`）—— 步 4 才需要。
