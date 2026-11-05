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
   ✅ **已修（2026-10-31，admin 会话那档：端脑 `93121d1` / 独立宿主 `7a15359` /
   桌面端 `aa80e43`）** —— 复测（见「二·补·四」）⇒ **admin 类那几条已从
   「不拿凭据就能进」的清单里消失** ⇒ 下面的描述保留为**当时的现场**。
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

**已改成「暴露面必须显式」** —— 三条入口，**各管各的**：

- **`--bind <ip>`**（独立宿主监听哪）⇒ 默认 `127.0.0.1`（回环）；
  要暴露到局域网 ⇒ `--bind 0.0.0.0`；
- **`TELENCEPHALON_BIND`**（同上，环境变量这一入口）⇒ 默认回环；
  要暴露 ⇒ `TELENCEPHALON_BIND=0.0.0.0`；
- **`telencephalon.bind.http`**（**端脑面在哪** / 自调用打哪）⇒ 默认回环 +
  60080；要暴露 ⇒ 在配置文件里**显式**写 `0.0.0.0:60080`。

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

### 二·补·四：2026-10-31 复测 —— 数目没变，**成分**变了

admin 面收口那一档（端脑 `93121d1` / 独立宿主 `7a15359` / 桌面端 `aa80e43`）
落地之后，用**同一个探针**、**同一套配置**（shadow key 与 admin token
**都真配好**）重测那张面 ⇒ 量到三件事：

**① 数目没变，成分变了** —— 不拿凭据就能进的 A/B 类**仍然是 13 条**
⇒ ⚠️ **数字一模一样**；但 **admin 类那几条从清单里消失了**
⇒ ⇒ **换的是里面的人** ⇒ ⇒ ⇒ **光盯计数会把这次收口完全藏起来**
⇒ ⇒ ⇒ **报表必须带成分，不带计数**。

**② `/models/providers` 还在清单里，但泄的东西变了** —— 明文已被掩码取代
（读接口只给 `********`，客户端把掩码写回时**保留原 key**）
⇒ ⇒ 「明文泄露」这个洞**关了**；⚠️ **但这张面仍然零鉴权**
⇒ ⇒ **写侧**（增删改 provider / 改 LLM 上游指向 / 删模型）**任何本机进程都能做**
⇒ ⇒ ⇒ **步 3a 的理由从「明文泄露」变成了「谁能重配这台大脑的上游」**
（理由变了 ⇒ **验收标准也要跟着变**：不再是「读不到明文」，
而是「不拿凭据 ⇒ 401」）。

**③ ⚠️⚠️ 决定性的一测：现有两把钥匙都关不住这 13 条**

- 带**正确的** `X-Shadow-Key` 那一轮：这 13 条**一条都没被挡住**；
- 带**正确的** `X-Admin-Token` 那一轮：这 13 条**同样一条都没被挡住**。

⇒ ⇒ **这两张 router 上根本没有门**（那两把钥匙压根不被读）
⇒ ⇒ ⇒ **只有把锁提到 router 层（步 3）才能一次关掉这 13 条**
⇒ ⇒ ⇒ **步 3 的规格因此收窄成一格**：要定的**不再**是「哪些端点加门」
（答案：A+B 类全部）、**也不再**是「用哪把钥匙」（两把实测效果**完全一样**）
⇒ ⇒ **只剩一件**：「**默认安装上那把钥匙从哪来**」。

**④ 顺带第一次把「两个域是分开的」量出来**（以前只是设计文档里的声明）：

- 带 shadow key 才开：`/shadow/v1/agents`、`/shadow/v1/conversations`；
- 带 admin token 才开：`/api/telencephalon/admin/agents/installed`；
- 两个都开：`/.well-known/agent.json`（公开的 agent card，**按设计就该开着**）。

⇒ ⇒ ⇒ **这两把钥匙互不开对方的门** ⇒ ⇒ 这条支持「步 3 选**一把**即可，
不必两把都上」⇒ ⇒ 而「选哪一把」现在有了**运行时**依据，不只是语义。

**⑤ ⚠️⚠️ 实测推翻了 §五 里的一句假设** —— §五 步 3a 那行写着
「桌面端本来就每请求带 `X-Shadow-Key` ⇒ 不自锁」⇒ **不成立**：
桌面端调 `/models/providers` 走的是**裸 `fetch`** ——
`AddProviderModal.tsx:53`/`:72`/`:107`、`ModelsPage.tsx:246`/`:261`/`:281`、
`ModelOnboardingPage.tsx:24`、`AppInitializer.tsx:51`
⇒ ⇒ **一把钥匙都没有** ⇒ ⇒ **照那句假设去挂 shadow key 门，
桌面端的供应商页会当场 401** ⇒ ⇒ ⇒ **步 3a 必须用 admin token**
（桌面端 `telencephalonClient.request()` 已经统一带它），
**而且客户端那几处裸 fetch 要补头** ⇒ ⇒ **服务端与客户端必须同一次落地**。

⚠️ **探针自己也踩过一个读法陷阱**（额外轮把 200 标成 `REACHED` ⇒
「额外轮 OPEN: 0」是假象）⇒ **已修**：两轮现在共用同一套判据 ⇒
详见基线文档那一节。

### 二·补·五：「门不能掐断主人」—— 一道门罩整张表是**错的形状**（2026-10-31）

上一笔（`telencephalon a4d0692`）把 providers 面做成「**一张表 + 一道 admin 门**」
（`route_layer(require_admin_token)` 罩住**整张表**）⇒ 那个形状有个致命问题：

- 端脑**自己**经回环打 `POST /api/telencephalon/chat/completions`（**云端代理**
  —— 它花的是用户配在端脑里的云供应商额度）⇒ 整表罩 admin 门 ⇒
  **主人被自己的门挡住** ⇒ 401；
- 而那个 401 会被 `lobes::send_chat_completion` 映射成 **5031「检查云供应商的
  API key 是否有效」** ⇒ ⇒ **失败长得像成功**：用户跑去查自己的云 key，
  而真因在端脑这一侧 ⇒ 而且端脑的云端链路当场断掉。

⇒ 由此多出一条**判定原则**（它比「该不该锁」更靠前）：

> **门不能掐断主人** —— 主人（端脑自己）走的那条路，必须能在门下通过。
> 否则「加门」这个动作本身会把大脑的一部分功能**当场关掉**，
> 而且**报错还指向别人**。

⚠️ **实测把「主人会打自己」这件事分成了两种拓扑**（别以为它是假想）：

- **独立端脑服务器**（`telencephalon::server::serve`，绑 60080）⇒ 叶区的
  `openai_base_url` 默认就是 `http://localhost:60080` ⇒ ⇒ **打到自己**
  ⇒ ⇒ 主人被门挡住**真的会发生**；
- **桌面端 / 移动端**（宿主把叶区指向 **neuron 自己的 listener**，
  `encephalon::point_lobes_at_neuron`）⇒ 那条路径上**没有**这条路由
  ⇒ ⇒ 404 ⇒ 回落本地 neuron ⇒ **主人打不到自己那张面**（云端代理在那两个
  宿主上其实是**死的**——那是另一个洞，不是这条）。

⇒ ⇒ **门形必须同时对两种拓扑都成立** ⇒ 不能只看「客户端会不会 401」。

#### 现在的门形（三道门，**仍然一张表**）

| 组 | 路由 | 钥匙 | 为什么是这把 |
|---|---|---|---|
| **读** | `GET /models/providers` | shadow key **或** admin token | 读的是「这台大脑自己的配置」⇒ shadow 域；回吐的**只有掩码** ⇒ 不泄密；而 shadow key 在桌面端是**可选**的 ⇒ 没配时这个域本来就开着（既有语义）⇒ 「有没有配好模型」的探测**不会**因为门而误判成「没配好」 |
| **读** | `GET /models/providers/presets` | shadow key **或** admin token | 「这台大脑支持哪些上游」= **能力清单**（目录里**没有密钥**）⇒ 两个客户端都要读（桌面端选预设、移动端选预设）⇒ ⇒ 目录只有**一份**（`synapse::providers::catalog`）⇒ ⇒ 两端**不可能漂** |
| **写** | 其余 `/models/**` | admin token | 「**谁能重配这台大脑的上游**」⇒ admin 域；shadow key **开不了**它（两个域是分开的） |
| **主人** | `POST /api/telencephalon/chat/completions` | **进程内内部凭据**（`X-Brain-Internal`）或 admin token | 唯一的合法调用者是端脑自己（实测：桌面端/移动端**一条都不调它**）⇒ 主人必须能过；外人拿不到那把钥匙 |

**主人那把钥匙**（`telencephalon/src/security/internal_token.rs`）：两枚 uuid v4
⇒ 256 位随机，**只活在端脑的内存里** —— 不落盘、不进环境变量、不给客户端
⇒ ⇒ 同机别的进程**拿不到**它（比 admin token 更强：admin token 在桌面端
是落盘的 `admin.key`）⇒ ⇒ 而它**只开这一条**路由 ⇒ 爆炸半径最小。

⚠️ **内部凭据只在回环目标上递** —— 递给远端 = 把钥匙寄给别人
（远端那台端脑本来也有它自己的一把）。

**门关着时必须说真话**：主人门关着 ⇒ 回包带标记
（`telencephalon_door_closed`）⇒ 端脑据此报 **5037（内部错误）**，
**不再**把「门挡住了我」说成「用户的云 key 坏了」（上游真的 401 仍然报 5031
—— 诊断不能一起改没）。

⚠️ **门与主人必须同一次落地** —— 客户端那几处**写**路由
（`AddProviderModal.tsx` 的三发）也必须同时补 `X-Admin-Token`，
否则「新增供应商」按钮当场失败。

## 二·补·六：CORS ——「谁都能读」改成「只有这几个 origin 能读」（2026-11-01）

⚠️ **这一节不是「该不该锁」那一类** —— 它是**另一根轴**：**门管「谁能进」，
CORS 管「谁能把响应读走」** ⇒ ⇒ 两根轴**相乘**，缺一根都不成立。

### ① 那个洞（比「明文 key」更宽）

`api::build_full_app`（**桌面 sidecar 与独立端脑服务器走的那张面**）挂着
`CorsLayer::permissive()` ⇒ `allow_origin(Any)` ⇒ ⇒ **浏览器里任意一个
网站**都能跨域 `fetch` 这台大脑**并且读到响应** ⇒ ⇒ 而它跑在**用户的机器上**
（`127.0.0.1:60080`）。

⇒ 2026-10-31 那笔把 `/models/providers` 的明文 LLM key 换成掩码
（**关掉了 ③**）⇒ 但 **① 还开着** ⇒ ⇒ 其它读接口（会话 / agent 清单 /
任务 / trace / `/api/telencephalon/logs`）**仍然是敞着的** ⇒ ⇒ 一个网站就能
把用户这台大脑的状态读走 ⇒ ⇒ 再叠上「本机端口」这条 ⇒ ⇒ 是一条完整的
**跨站读取链**。

### ② 现在是什么形状（**白名单**，不是 Any）

* 默认名单 = **宿主自己的 origin**，**每一行都有出处**：
  * `http://localhost:1420` / `http://127.0.0.1:1420` —— 桌面端 vite dev
    （`tauri.conf.json` 的 `devUrl`）
  * `http://localhost:5173` / `http://127.0.0.1:5173` —— **web 构建**的
    vite dev（`vite.config.web.ts`）⇒ ⇒ **也是 Playwright e2e 的家**
    （`playwright.config.ts`：`baseURL` + `webServer: pnpm dev:web`）
  * `http://localhost:4173` / `http://127.0.0.1:4173` —— web 构建的
    vite preview
  * `tauri://localhost` —— Tauri v2 自定义协议（macOS/Linux）
  * `http://tauri.localhost` —— Tauri v2 自定义协议（Windows）
* 配置 `telencephalon.cors.allowed_origins` + 环境变量
  `TELENCEPHALON_CORS_ALLOWED_ORIGINS` ⇒ **并集**，不是覆盖。
* 名单在 **boot 解析完快照进 `AppState`**（与 `admin_token` 同一套路：
  handler 不去抢进程级环境变量）。
* methods / headers / expose **仍是 Any** ⇒ 那只影响「能发什么 / 能读哪些
  响应头」⇒ ⇒ **能不能读这个响应**由 origin 白名单决定 ⇒ ⇒ 兼容性不变、
  暴露面变小。

⚠️ **漏了 5173/4173 会当场自锁 web 构建与 e2e** —— 这两条不是「顺手加的」，
是 `vite.config.web.ts` 里写着的端口。

### ③ 三种宿主，三种形状（**别把它们当成一种**）

* **桌面 sidecar**（`shadow-desktop/src-tauri/src/cortex_http.rs` ⇒
  `build_full_app`）⇒ ⇒ **白名单层就是最外层** ⇒ ⇒ 端脑面 + neuron 面 +
  海马体面**一起**被它管住。
* **独立端脑服务器**（`encephalon/src/a2a_server.rs` ⇒
  `telencephalon_router` + neuron + 海马体）⇒ ⇒ 原来那层
  `permissive()` 是**最外层** ⇒ ⇒ 现在换成同一张白名单。
* **手机 / 嵌入式宿主**（`boot::cortex_router`）⇒ ⇒ **根本没有 CORS 层**
  ⇒ ⇒ 它的请求来自 **Dart**（不是浏览器）⇒ ⇒ **不需要**任何 CORS 允许
  ⇒ ⇒ 不动它 = 不新增暴露。

⚠️ **外层会覆盖内层** —— tower-http 写响应头用的是 `extend`（后写的赢）
⇒ ⇒ 所以**最外层那一层才是闸** ⇒ ⇒ 内层留着 permissive 也不影响
⇒ ⇒ 但仍要收（少一颗地雷）。

### ④ 边界（**CORS 不是访问控制**）

⚠️ **CORS 挡的是「浏览器里的别的网站」这一类攻击者** —— 同机其它进程照样能
直接打端脑（**不带 Origin 头 ⇒ 根本不进 CORS 这条路**）⇒ ⇒ 那是**门**
（凭据）的事 ⇒ ⇒ **步 3** 不能因为 CORS 收了就当没那回事。

⚠️ **CORS 挡的是「读」，不是「打」** —— 请求**照样到达服务端**
⇒ ⇒ 所以 ③ 那道门（掩码）**不能省** ⇒ ⇒ 两条一起才是闭环。

⚠️ **残留**：**neuron 自己那个独立服务器**（`neuron/src/server/mod.rs`
的 `create_router`）**仍是 permissive**（照 ollama 的做法）⇒ ⇒ 那是
**另一个产品**（neuron 单跑）的设计 ⇒ ⇒ 要收得连 neuron 仓一起改
⇒ ⇒ **另开一笔**，别把它悄悄算进这一笔。

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
| `/api/telencephalon/lobes/placement/{name}` | POST | lobe_runtime | — | **改叶区摆放**（`local` \| `remote`）—— remote 需带对端 A2A url（2026-11-04 补录：`src/api/lobe_runtime.rs`） |
| `/api/telencephalon/thalamus/query` | POST | thalamus | — | **跑 SQL 查传感器数据**（⚠️ 它**已经**要求 admin token ⇒ 但路径**不在** `/admin/` 下 ⇒ 见第二节 ④） |
| `/api/telencephalon/prefrontal/dispatch` | POST | prefrontal | — | **执行路径** |
| ~~`/api/telencephalon/devices/{id}/invoke`~~ | POST | ~~device~~ | — | **已下线**（2026-11-03 随「设备 MCP server」整条下线；下线前它就是「每个入口都要自己记得加闸」的反面样本） |
| ~~`/api/telencephalon/devices/{id}/tools`~~ | PUT | ~~device~~ | — | **已下线**（同上） |
| ~~`/api/telencephalon/devices/{id}`~~ | DELETE | ~~device~~ | — | **已下线**（同上） |
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
| `/models/providers/{id}/reveal` | POST | providers | — | **只有 admin 能开**（`admin_door`）⇒ 回吐 provider 的**真实密钥** ⇒ ⇒ 「导出到另一个工具的凭据文件」这条路 ⇒ ⇒ **必须锁**（2026-11-05 补录：`src/api/providers.rs`） |
| `/models/providers/preview` | POST | providers | — | **无状态**预览模型列表（外连，**不落盘、不进列表**）⇒ 「测试并获取模型」按钮 |
| `/models/{provider_id}/{model_id}` | DELETE | providers | — | 删模型 |
| `/api/telencephalon/config/{section}/{key}` | PUT,DELETE | config_api | — | **改/删这台大脑的配置**（端脑 / 丘脑 / neuron / 云端供应商 / MCP 的运行数据与配置都在 Turso 里 ⇒ 不在海马体里）⇒ ⚠️ 回包里的秘密项是**掩码**；⚠️ 仅带 Turso 的构建有这张面 |
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
| ~~`/api/telencephalon/devices` \| `/{id}`~~ | GET | ~~device~~ | — | **已下线**（2026-11-03 端脑仓下线「设备 MCP server」整条路：`src/api/device.rs` 删除 ⇒ 这张面不复存在） |
| `/api/telencephalon/video-sources` \| `/{id}` | GET | video_source | — | 视频源清单 |
| `/api/telencephalon/visual-tasks` \| `/{id}` | GET | visual_task_admin | — | 视觉任务 |
| `/models/providers` | GET | providers | — | **provider 配置（含 api_key）** |
| `/api/telencephalon/config` \| `/{section}` \| `/{section}/{key}` | GET | config_api | — | **这台大脑的全部配置**（配置中心 = Turso）⇒ ⚠️ 秘密项回包是掩码 ***（不是明文）⇒ 读门拿到的是「配置长什么样」而不是「钥匙是什么」；⚠️ 仅带 Turso 的构建有这张面 |
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
| **3** | 把锁**从 `/shadow/v1/*` 提到整张面**（A+B 类） | ⚠️ **「两端客户端本来就带 key ⇒ 不自锁」这句已被实测推翻**：桌面端的 shadow key 是**可选**的（用户没配就**不带**）⇒ ⇒ 这正是「默认安装上那把钥匙从哪来」那条待拍板项的根因（⚠️ 见「步 3 的规格已被修正」） | 「同机任意进程打 A 类 ⇒ 401」＋「App 全部功能照旧」 |
| **3a** | **先关带凭据的路由**：`/models/providers` 这类**吐出凭据**的路由挂进门里（**用 admin token**，并处理 CORS） | ⚠️ **实测推翻了原来那句「桌面端每请求带 `X-Shadow-Key`」** —— 桌面端这几处走**裸 `fetch`**（`AddProviderModal.tsx:53`/`:72`/`:107`、`ModelsPage.tsx:246`/`:261`/`:281`、`ModelOnboardingPage.tsx:24`、`AppInitializer.tsx:51`）⇒ **一把钥匙都没有** ⇒ ⇒ **客户端必须同时补头**，否则桌面端当场 401；✅ 掩码那半**已经做完**（读只给 `********`，写回掩码保留原 key）⇒ **不能简单遮字段**这条已落地 | 「不拿凭据 ⇒ 401」＋「带对的 admin token ⇒ 200」＋「桌面端 provider 页照旧能保存」 |
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

## 五·补、「步 3」的代价 —— 机器算出来的（2026-11-01）

> 承 §五「步 3 的规格已被修正」—— 那条修的是**门形**（读门 = shadow ∪ admin，写门 = admin）。
> ⇒ ⇒ 这一节算的是**代价**：把这张表里**还没门**的 A/B 类面锁上，**客户端会不会被打断**。

### ① 尺子

`scripts/check-agent-surface-credentials.mjs` —— 读这张表 ⇒ 扫两端客户端代码 ⇒ 逐个调用点看它带不带凭据 ⇒ 报出「锁上之后谁会被 401 打断」。

⚠️⚠️ **判据要多问一句**：「这把钥匙，**用户拿得到吗**？」
—— 只问「这一发带没带凭据」是不够的：**「代码里写了 shadow」≠「这一发真的带了 shadow」**。
⇒ ⇒ 桌面端那把 shadow key **在 HEAD 上根本不存在**（client 无 setter、singleton 无实参 ⇒ `this.apiKey` 恒 `undefined` ⇒ 从来没发出过 `X-Shadow-Key`）
⇒ ⇒ 于是「只带 shadow」的那一处**不是条件红，是必红**（用户**配不出来** ⇒ 没有输入入口）。

### ② 三种形态（同一台端脑，客户端拿钥匙的条件不同）

- **桌面端 · Tauri**（本机 sidecar）：shadow key **拿不到**（无 setter、无输入入口）；admin token **恒有**（sidecar 生成并持久化，前端 `get_admin_token` 拿得到）。
- **桌面端 · web**（浏览器，**没有 sidecar**）：shadow key **拿不到**；admin token **用户自备**（`localStorage`）⇒ 没放就没有。
- **移动端 · 内嵌端脑**：shadow key **恒有**（宿主 `ShadowKey.getOrCreate` 自动生成）；admin token **恒有**（宿主 `AdminKey.getOrCreate`）。
  ⚠️ 旧 `.so` 时宿主拿不到钥匙 ⇒ 客户端不带 ⇒ **但那台端脑自己也没配 key** ⇒ 门是敞的 ⇒ 也通。

⚠️ **移动端 ⇄ 外部端脑不算形态** —— 那是**跨机**（D 类）⇒ 不在「本机面上锁」的提问范围里。

### ③ 读数（**补完客户端之后**：59 个调用点 ⇒ 20 个在提问范围内）

- **桌面端 · Tauri**：**红 0** —— 那 6 处裸 `fetch` 已补上凭据（`shadow` 仓 `3c4a993`）⇒ ⇒ **代价归零**。
- **桌面端 · web**：**6 处条件 401**（web 版**没有 sidecar** ⇒ admin token 要用户自备 `localStorage`）⇒ ⇒ ⚠️ 但那**不是新债**：web 版**本来**就是这个契约（`/models/providers` 那张面早就需要它了）⇒ ⇒ 要么接受，要么给 web 版一个「放钥匙」的入口。
- **移动端 · 内嵌端脑**：**红 0**（13 个调用点全通）。

⇒ ⇒ **代价 = 桌面端那 6 处裸 `fetch` 改成走带凭据的封装**（`adminHeaders()`）—— **已做完**（`3c4a993`）
⇒ ⇒ **移动端不是代价**
⇒ ⇒ ⚠️ **别把「先补 shadow key 输入入口」当阻塞项** —— 那 6 处要的是**拿得到**的凭据，而桌面端 Tauri 的 admin token **恒有** ⇒ ⇒ 改调用点就够了。
⇒ ⇒ ⚠️ **web 版**要不要给一个「放钥匙」的入口（现在只能手改 `localStorage`）⇒ ⇒ 另一个决定。

### ④ 桌面形态：那把钥匙**以前根本不存在** ⇒ ⇒ 门是装饰（2026-11-01 补）

承 §五·补 ③ —— ③ 算的是「**客户端**会不会被打断」⇒ ⇒ **没算「服务端那边钥匙在不在」**
⇒ ⇒ 而那正是桌面端的病根。

**⚠️ 桌面端那把 shadow key 从来不存在**（逐条核过活仓 HEAD，2026-11-01）：

* `shadow-desktop/src-tauri/src/cortex_http.rs` 传的是 `shadow_api_key: None`，
  旁边的注释写着「桌面端**有配置文件** ⇒ shadow key 从配置文件来（`config.toml`）」；
* **桌面端仓里没有任何 `config.toml`**（glob 零命中），**也没有任何代码**去设
  `TELENCEPHALON_CONFIG` / `CORTEX_CONFIG`；
* 而端脑**只**从那个环境变量读配置（`telencephalon/src/boot.rs:127` ⇒ 读不到就用
  默认配置）⇒ ⇒ `telencephalon.shadow.api_key` 取默认**空串**；
* 空串 ⇒ `require_shadow_key` **放行一切**⇒ ⇒ **`/shadow/v1/*` 与 `POST /a2a`
  在桌面默认安装上一直是敞开的**（同机任意进程都能打 ⇒ 包括
  `POST /shadow/v1/identity` ⇒ **换掉「这台机器是谁」**）。

⇒ ⇒ **这条订正了账本上两处过期读数**：㊳ / ㊱ 条那句「这与桌面不一样：桌面端有
配置文件、有 key ⇒ 那张面受保护」—— 桌面端**没有** key ⇒ 那张面**一直开着**；
§五·补 ③ 里「桌面端 · Tauri：shadow key **拿不到**（无 setter、无输入入口）」——
前半句对（客户端确实递不出 shadow key），**但漏了「服务端那边也没有」** ⇒ ⇒
两端**都没有** ⇒ ⇒ 那道门在桌面上**从来不是门，是装饰**。

**✅ 修（两端一起，缺一半就是自锁）**：

* **端脑**：读门统一成 **shadow ∪ admin**（`security::api_key::verify_read_credential`
  —— **一条规则一处实现**；providers 与 shadow 两道门都走它）⇒ ⇒ admin 是**更强**的
  钥匙 ⇒ 不增加暴露面；admin 那一支**仍然 fail-closed**；shadow 那一支**保留**
  「空 expected ⇒ 放行」的开发模式（**不许**改成 fail-closed —— 桌面/web 的
  「有没有配好模型」探测没有钥匙 ⇒ fail-closed ⇒ 探测全 401 ⇒ 用户明明配好了
  却被踢回设置向导）。
* **桌面宿主**：把**自己那把 admin token** 同时当 shadow key 递进去 ⇒ ⇒
  `shadow.api_key` 非空 ⇒ 开发模式关掉 ⇒ **门是真的** ⇒ ⇒ **不为它另造一把
  没人递的钥匙**（那只是多一把秘密、多一处要配的地方，还要前端在第一次请求前
  就拿到它 ⇒ 竞态）。
* **桌面前端两处补 admin token**：`/a2a`（`a2uiClient.ts`）与**对话 SSE**
  （`telencephalonClient.ts` 的 `streamMessage`）—— ⚠️ 这两处**只**递
  `X-Shadow-Key`，而桌面端递不出 shadow key ⇒ ⇒ 不补 ⇒ 门一关就全 401
  ⇒ ⇒ **门掐断主人**（自己把自己的大脑锁在外面）。

⇒ ⇒ **代价 = 0**：桌面端 Tauri 的 admin token **恒有**（sidecar 生成并持久化）
⇒ ⇒ 读门认它 ⇒ ⇒ 客户端**不需要**新的凭据来源 ⇒ ⇒ 步 3 在桌面形态上的代价
**仍然是 0**，而且这次那道 shadow 门**不再是装饰**。

**✅ 证据**：端脑 `tests/shadow_key` **6 passed**（新增 3 条：宿主 admin token
也能开 / 错 token 不开 / 没配 admin token 不开 ⇒ 全是真 HTTP）；端脑 lib
`security::api_key` **19 passed**（含 5 条新断言）；桌面端 `tsc --noEmit`
**EXIT=0**、vitest **34 passed**；五道闸全绿；⚠️ **反向验证**（把 shadow 门退回
「shadow only」＝修复前的形状）⇒ ⇒ 「宿主 admin token 也能开」那条**当场变红**
⇒ ⇒ 断言钉在真东西上、不是恒绿。

## 六、不在本次范围内

- **neuron 面绑 `0.0.0.0`**（同网段可达）—— 那是**绑定地址**问题，不是鉴权问题 ⇒ 另一档。
- **桌面端的端脑（:60080）默认也绑 `0.0.0.0`**（`config.telencephalon.bind.http` 的默认值）
  ⇒ 同一类问题。
- **签发侧接线**（`src/acl/` + `credential_signer.rs`）—— 步 4 才需要。

## 七、客户端调用点 ↔ 端脑路由 —— 一张机器可判的对照表（2026-11-01 补）

**为什么补这一节**：上面那张表是「端点 × 该不该锁」，**没有回答**
「**客户端实际打的那个路径，端脑上到底有没有**」⇒ ⇒ 两边从来没人对过账
⇒ ⇒ 客户端打错路径 / 响应形状不对**不会报错** ⇒ ⇒ 用户看到的是「功能坏了」，
机器一声不吭。

### 7.1 桌面端 `prefrontalClient` 的 29 个调用点（实测分类）

活端脑实测（`127.0.0.1:60080`）：

| 客户端打的路径 | 端脑上的实况 | 实测 |
|---|---|---|
| `/api/tasks` | 端脑的任务面在 `/api/telencephalon/tasks` | **404** |
| `/api/telencephalon/tasks` | 有 | **200** |
| `/api/agents` | 端脑的 agent 面在 `/api/telencephalon/agents` | **404** |
| `/api/telencephalon/agents` | 有 | **200** |
| `/hippocampus/api/tasks?tenantId=…` | 海马体面 nest 在 `/hippocampus` ⇒ **路径对得上** | **200** |
| `/health` | neuron 根面（outer） | **200** |

⇒ ⇒ **29 个调用点 = 2 aligned + 5 outer + 18 differs + 4 missing**（机器分类见
`scripts/client-endpoint-map.txt`）。

⚠️ **订正（承 AGENTS.md 的㋟条 ⑦⑧）**：那条「其余 22 个端脑上根本没有这些路由
⇒ 404」**不准确** ⇒ ⇒ `/hippocampus/api/tasks*`（4 个）与 `/health`
**路径对得上** ⇒ ⇒ **通的** ⇒ ⇒ 「22 个 404」**多了 6 个** ⇒ ⇒ 任务板今天就能用。

⚠️ **订正「指错服务」这个说法本身**：端脑**确实**提供这些能力（tasks / agents /
mcp / conversations / sessions）⇒ ⇒ 问题是**路径前缀 + 响应形状**，不是「服务」。
⇒ 而「换调用面（指向 `prefrontal` 独立仓）」在桌面形态下**不可用** ——
桌面端 Tauri **只有端脑一个后端**（`cortex_http.rs` 在**进程内**起端脑 HTTP 面于
60080；旧 cortex sidecar 与 `state.prefrontal` 都已删）⇒ ⇒ `prefrontal` 独立仓的
默认端口已改成 **18083**（`a8fa54d`）⇒ ⇒ 本机 8082 / 8085 / 18083 **都没人在听**
⇒ ⇒ **方向已被证据收敛成单方向**：迁到端脑面（路径 + 形状 + 凭据三件事一起迁）。

⚠️ **形状那一层（今天就坏）**：端脑的 `/api/sessions*` 回**裸** JSON，而客户端
`createSession` / `listSessions` 期望 `{success,data}` **信封** ⇒ ⇒
`env.success` 是 `undefined` ⇒ ⇒ **必然抛** ⇒ ⇒ 光补凭据也**还是坏**。

### 7.2 闸：`scripts/check-client-endpoint-map.mjs`

**比什么**：客户端侧解析客户端文件里**真的在发**的请求（路径 + 方法）；
服务端侧 = 端脑**实际合并进 router** 的路由 ＋ 两张 outer 面（neuron 在根、
hippocampus nest 在 `/hippocampus`）；表侧 = `scripts/client-endpoint-map.txt`。

**判定**（退出码 1）：客户端有调用点、表里没登记 / 表里有客户端已不打的行（表不许过期）/
表里说服务端有但服务端实际没有 / 表标 `missing` 但服务端其实有同路径的路由（表说谎）。
标 `missing` 且服务端确实没有 ⇒ 只报告，不失败（需要产品决定，不是机器能判的）。
防假绿：客户端解析出 0 个调用点 ⇒ 退出码 2。

### 7.3 ⚠️ 顺带逮到：两把旧闸的「判不了」（本节最要紧的一条）

**(a) `check-door-policy.mjs` 的自检从写出来那天起就是红的。** 它的夹具是
**手搓的字面量**（`method: '*'`），而真实门型表走 `parsePolicy`（把 `'*'`
归一成 `null` = 任何方法）⇒ ⇒ 两边**形状不同** ⇒ ⇒ 那条 `'*'` 门型在
`resolveDoor` 里**永远匹配不上**（拿 `'*'` 跟 `'POST'` 比）⇒ ⇒
`/api/flows/abc/validate` 落到族规则 ⇒ `admin ≠ open` ⇒ ⇒ **红**。
⇒ ⇒ **HEAD 原版实测 `--self-test` exit=1** ⇒ ⇒ **没人跑它** ⇒ ⇒ 它守的东西没被守。
⇒ ⇒ **已修**：夹具改成**一张门型表文本**、与真实表**同形**（都过 `parsePolicy`），
外加一条钉**真实表**的断言。

**(b) 端脑路由抽取的括号配对起点算错 ⇒ ⇒ 链式写法的第二个方法落在 span 之外。**
`.route(` 的配对若从路径字符串末尾开始数，则 `get(h).post(h2)` 的 `post`
在 span 外 ⇒ ⇒ 那条路由只被记成 GET ⇒ ⇒ **它的 POST 变体没人查** ⇒ ⇒
端脑路由数 **126 ⇒ 132**（6 条 POST 变体从前**隐形**）⇒ ⇒ 真表碰巧用族规则覆盖了
它们（closed 仍 0）⇒ ⇒ **今天没有洞，但闸从前看不见**。

⚠️ **反向验证（承重，合成树）**：门型表只覆盖 `GET /api/demo` 的合成端脑 ⇒
**新抽取器红**（2 条路由，POST 未覆盖 ⇒ closed 1）、**旧抽取器绿**（只 1 条）⇒ ⇒
**「从前判不了」被证明**。另：破坏 `moreSpecific` ⇒ **恰好 2 红**；破坏
`'*'` 归一化 ⇒ **恰好 5 红**；对照表删一行 ⇒ 报「没登记」红。

### 7.4 桌面端两处「说谎」已修

- `shadow-desktop/src/lib/platform.ts`：注释写着「Tauri 默认 8082 / web 用同源」
  —— 那是 2026-08-16（`7970925`）**之前**的旧契约 ⇒ ⇒ 改成说真话（端脑 60080）。
- `shadow-desktop/src/lib/__tests__/platform.test.ts`：那条 8082 断言原本是
  `it.skip` ⇒ ⇒ 没人发现 ⇒ ⇒ 现在钉**真实**契约 ⇒ ⇒ 反向验证（改回 8082）⇒
  **恰好 2 红**。

**证据**：门闸 self-test **10/10**、主流程 **132 条路由 / 51 条规则 / closed 0**
⇒ EXIT=0；客户端对照闸 self-test **6/6**、主流程 **29 条登记 ↔ 29 个调用点**
⇒ EXIT=0；桌面端 `tsc --noEmit` **EXIT=0**、`platform.test.ts` **30 passed**
（含原先被 `it.skip` 的那条）。

⚠️ **还欠的**：桌面端那 29 个调用点**迁到端脑面**（工作量在桌面端，不在端脑）；
`prefrontalClient` 这个**类名**与 `prefrontalUrl()` 这个**函数名**都在说谎 ⇒ ⇒
改名是另一个决定；本节只核了**桌面端**，移动端 `prefrontal_client.dart` 的
44 个调用点**仍需同样对账**。

## 八、客户端打错服务：从「源码推断」到「机器可判」＋ 口径防漂（2026-11-01）

### 8.1 ⚠️ 病：第七节那张表，只覆盖了**一个**客户端

第七节的对照表登记的是 `prefrontalClient.ts` 的 29 个调用点 ⇒ ⇒ 而
`telencephalonClient.ts` —— **桌面对端脑那个正经客户端** —— 的 **61 个**调用点
**一张都没登记** ⇒ ⇒ 那 61 个里要是有一个打错服务，**没有机器会报错**。

⚠️ **顺带订正一个读数**：上一轮口头说的「71 个调用点」是**高估** ⇒ ⇒ 实测 **61**
（`this.request` 56 + `fetch` 6 ⇒ 去重后 61）⇒ ⇒ **「数一数有多少条」必须让抽取器能自证**
⇒ ⇒ 本轮给对照闸加了 **`--dump`**（把某个客户端文件**真的在发**的请求逐条打出来）
⇒ ⇒ 任何人可以自己核，不必信我。

### 8.2 ✅ 修①：词法器认「裸标识符查询串」（标识符单独出现的那种形态）

桌面端有三处查询串**不写在模板字面量里**：

- `const qs = limit ? (问号 limit=…) : ` `;`
- `const qs = params.toString();`（`params` 是 `URLSearchParams`）

而模板处写的是**裸标识符**（既不是调用、也不是问号判断）⇒ ⇒ 老规则只看「动态段里有没有问号」
⇒ **认不出** ⇒ ⇒ 把它当成路径参数 ⇒ ⇒ 路径变成
`/api/telencephalon/thalamus/preview/sensors/{param}/tail/{param}` ⇒ ⇒ 与服务端路由对不上。

⇒ ⇒ **判据：把标识符解析回它的声明** ⇒ 声明里带问号 ⇒ 查询串；
声明是 `<URLSearchParams>.toString()` ⇒ 也是查询串；**解析不出来 ⇒ 保守当成路径参数**
（宁可假红，不要假绿）。

⚠️ **这一步的代价**：解析要回到**声明** ⇒ ⇒ 「名字在注释里先出现」也会被命中 ⇒ ⇒
判据必须**逐个出现**找那个**真声明**，不能 `indexOf` 一次就返回。
⚠️ 还有一处更阴的：找引号时**不能**在文件剩余部分里扫 ⇒ ⇒ 会撞上后面文档注释里
`conversation` 撇号的那个 `s` ⇒ ⇒ 必须取「= 之后的**第一个**引号」。
⇒ ⇒ 两条都写成了**自检夹具**（⇒ ⇒ 夹具必须与真实输入同形：真文件里声明后面还有一大堆文本）。

### 8.3 ✅ 修②：61 个调用点全部进表（60 aligned / 1 missing）

`scripts/client-endpoint-map.txt` 从 29 行扩到 **90 行** ⇒ ⇒ 桌面端两个客户端
**每个调用点都在表里** ⇒ ⇒ 闸会盯住「新增调用点没登记 / 表过期 / 映射失真 / 表说谎」。

- **60 条 aligned** ⇒ ⇒ `telencephalonClient.ts` 本来就是照着端脑写的 ⇒ ⇒ 路径基本全对得上。
- **1 条 missing**：`POST /api/flows/by-name/{param}/invoke` ⇒ ⇒ 端脑**没有**这条路由
  ⇒ ⇒ 「按名跑流程」今天就是 **404**（实测）⇒ ⇒ 归产品决定，不阻断。

### 8.4 ⚠️ 修③：桌面端接上端脑的会话内容口径（人设那条**不能**变成大脑发言）

端脑把会话的**人设**存成**第一条**轮次（`role=agent` + `[system] ` 前缀），工具结果存成
`[tool_result] ` 前缀 ⇒ ⇒ **前缀藏在 `text` 里** ⇒ ⇒ 客户端不认 ⇒
**用户自己的配置原文**会被当成大脑发言画出来。

⚠️ 移动端**早就认**（`kSystemTurnPrefix` / `kToolResultTurnPrefix` / `isSystemTurn` /
`isToolResultTurn` / `bodyText`）⇒ ⇒ 桌面端**一处都没有** ⇒ ⇒ 这一轮补上，两端**同一套判据**。

- `shadow-desktop/src/lib/telencephalonClient.ts`：加 `SYSTEM_TURN_PREFIX` /
  `TOOL_RESULT_TURN_PREFIX` 两个常量 + `ConversationTurn`（命名类型）+ `isSystemTurn` /
  `isToolResultTurn` / `bodyText` / `turnTimestamp` / `displayableTurns`。
- `Conversation.history` 的内联类型换成 `ConversationTurn[]`。
- ⚠️ `turnTimestamp` 两种方言都认（`at` 是 RFC3339、旧的前额叶方言是 `timestamp` 毫秒）
  ⇒ ⇒ 只认一个的话另一边是 `undefined` ⇒ ⇒ 界面出「Invalid Date」。

⚠️ **桌面端今天还没有渲染会话历史的消费方**（`getConversation` / `listConversations`
**零调用方**）⇒ ⇒ 这一条是**潜伏**缺陷 ⇒ ⇒ 补的是「口径」不是「眼前的 bug」⇒ ⇒
正因为潜伏，**必须有闸钉住**，否则将来谁一接 UI 就会踩。

### 8.5 ✅ 修④：新闸 `check-conversation-prefix.mjs`（口径漂移的唯一机器判据）

- **服务端**（真相源）：从 `telencephalon` 源码读出两个前缀的**字面量**。
- **客户端**：读出它声明的前缀字面量 + 它有没有「判别 + 剥壳」这三个动作。
- 服务端有的前缀、客户端**没声明** ⇒ 红；两边**不一致** ⇒ 红（协议漂了）；
  客户端声明了常量但**没有处理动作** ⇒ 红（有常量 ≠ 处理了）。
- 服务端前缀**读不出来** ⇒ **exit 2（判不了）** ⇒ ⇒ 不许当成「一致」。

### 8.6 证据 + 反向验证

**闸**：门闸 self-test **10/10**；客户端对照闸 self-test **6/6**、主流程
**90 条登记 ↔ 90 个调用点** ⇒ EXIT=0；**新口径闸** self-test **10/10**、主流程
「桌面端 一致 / 移动端 一致」⇒ EXIT=0；判定表闸 / 凭据闸 / 绑定暴露闸 **全 EXIT=0**。

**桌面端**：`tsc --noEmit` **EXIT=0**；全量 vitest **1281 ⇒ 1288 passed / 0 failed**
（新增 7 条会话口径用例，其中一条**走真客户端** `getConversation` ⇒ ⇒ mock 里用**服务端的字面量**
而不是本仓的常量 ⇒ ⇒ 有人把常量改错了它照样红）。

⚠️ **反向验证（恰好该红的红）**：

- 改坏桌面端的**前缀字面量** ⇒ ⇒ **恰好 1 红**（「协议漂了」）；
- 让桌面端**没有 `bodyText` 这个动作** ⇒ ⇒ **恰好 1 红**（「有常量 ≠ 处理了」）；
- 两条都验完**按字节还原**（sha 一致）。

⚠️ **闸的自检抓到了闸自己瞎了**（两次，都是真教训）：

- 生成代码时把「空串」写成了「一个空格」⇒ ⇒ 判据把正常声明全判成 null ⇒ ⇒
  **自检立刻红 3 条**（⇒ 这就是自检的第一职责：抓住闸自己瞎了）；
- 「声明后面还有一大堆文本」的夹具**缺了** ⇒ ⇒ 判据撞上文档注释里的撇号 ⇒ ⇒
  **主流程红了才发现** ⇒ ⇒ 补了夹具 ⇒ ⇒ 这就是「夹具必须与真实输入同形」。

### 8.7 ⚠️ 还欠的

- **桌面端那 29 个 `prefrontalClient` 调用点迁到端脑面**（路径 + 形状 + 凭据三件事一起迁）；
- **移动端 `prefrontal_client.dart` 的 44 个调用点**仍未逐条对账；
- **`POST /api/flows/by-name/{param}/invoke`** ⇒ 端脑要么补路由、要么产品改口径（现在 404）；
- 桌面端一旦有人接会话历史 UI ⇒ 必须走 `displayableTurns` ⇒ ⇒ 否则人设又会被画出来；
- **真机复验**仍欠（要重编 `.so` + 重打 APK + 装机）。
## 九、凭据闸的「该不该红」也要机器判（2026-11-01）

### 9.1 ⚠️ 病：一把**恒红**的闸 = 没有闸

`scripts/check-agent-surface-credentials.mjs` 判的是「上锁之后谁会被 401 打断」，
按**形态**分别定案（① 桌面·Tauri / ② 桌面·web / ③ 移动·内嵌）。

⚠️ 上一轮把它从「假红」修好之后（红 3 ⇒ 红 0），读数变成「**6 处条件 401**」
⇒ ⇒ 而闸对「条件 401」也是 **exit 1** ⇒ ⇒ **它恒红**。

⇒ ⇒ 而用户 2026-11-01 11:00 已拍板：**web 版暂不做「放钥匙入口」，接受现契约**
⇒ ⇒ 那 6 条**不是新缺口**，是**已接受契约**的体现 ⇒ ⇒ 闸不该为它们红
⇒ ⇒ **恒红的闸等于没有闸**（没人看 ⇒ 回归抓不到 ⇒ 它守的东西没被守）。

### 9.2 ✅ 修：把「该不该红」收成**一处判据**

- **必 401** ⇒ 永远红。
- **条件 401**，落在**钥匙恒有**的形态（① / ③）⇒ 红（那里不该有条件 401）。
- **条件 401**，落在**已接受契约**的形态（② 桌面·web）⇒ **只报告**。

⚠️ 为什么可以按**形态**分家（而不是登记一张「已接受清单」）：web 没有 sidecar ⇒
shadow key **无处可配** ⇒ ⇒ **web 上任何需要 shadow 的读面必然是条件 401**
⇒ ⇒ 那是**形态的固有属性**，不是某个调用点新冒出来的缺口 ⇒ ⇒ 按形态判即可
⇒ ⇒ **不需要一张会腐烂的清单**。

### 9.3 证据 + 反向验证

- 自检 **33 ⇒ 38 只全绿**（新增 5 只钉住退出判定：必 401 ⇒ 红 / 条件 401 落在未接受形态 ⇒ 红 /
  只落在已接受形态 ⇒ 只报告 / 全绿 ⇒ 绿 / 必 401 优先于已接受契约）。
- 主流程 EXIT **1 ⇒ 0**，且那 6 条**仍逐条报告**（形态② 那行还标了「已接受契约 ⇒ 只报告，不阻断」）。

⚠️ **反向验证（两头都验）**：

- 撤掉「已接受契约」那一刀 ⇒ ⇒ **exit=1**（那 6 条重新阻断）⇒ ⇒ 变绿确实是这一刀造成的，
  且闸**没有把那 6 条藏起来**；
- 把 `health()` 那一发的凭据**摘掉**（真缺陷）⇒ ⇒ **2 处必 401**、路线图 🔴🔴🟢 ⇒ ⇒ **exit=1**
  ⇒ ⇒ 「已接受契约」**不掩盖真缺陷**；
- 两次验完都**按字节还原**（sha 一致）。

⚠️ **顺带订正一个归属**：这一笔之前闸在 HEAD 上是红的，但**不是这一笔带来的**
⇒ ⇒ 用 worktree 在这一笔**之前**的提交上跑过：那时是「红 1 / 绿 6」×2 形态（**2 处必 401**）
⇒ ⇒ 那 2 处是**别人工作树里的在飞改动**修掉的 ⇒ ⇒ 与本轮无关。
## 十、移动端也进表：机器证实「两者没有交集」（2026-11-01）

### 10.1 ⚠️ 病：那张表只覆盖了**桌面端**

第八节把表从 29 行扩到 90 行 ⇒ ⇒ 但那 90 行**全是桌面端**的两个客户端
⇒ ⇒ **移动端那 78 个调用点一张都没登记** ⇒ ⇒ 移动端打错服务**没有机器会报错**。

⚠️ 顺带订正一个读数：早先口头说的「移动端 44 个」也是**高估** ⇒ ⇒ 实测
**42**（`prefrontal_client.dart`）＋ **36**（`telencephalon_client.dart`）= **78**。

### 10.2 ✅ 修①：闸加一个 **Dart 抽取器**（不各写一份）

移动端两个客户端说的是**两种形状**：

- `prefrontal_client.dart`：`_request<List<dynamic>>('GET', '/api/providers')`
  ⇒ ⇒ 方法是**第一个参数**，路径是第二个 ⇒ ⇒ 还有**变量形态**
  （先 `final path = …` 再 `_request('GET', path)`）⇒ ⇒ 还有 **Dart 插值**
  （`/api/providers/$name` / `${…}`）⇒ ⇒ 与 TS 的 `${…}` **不是一种东西**。
- `telencephalon_client.dart`：`_get('/shadow/v1/agents')` ⇒ ⇒ **方法由调用名决定**。

⇒ ⇒ 判据做成一张**调用名 ⇒ 方法**的形状表 ＋ 一个 Dart 路径归一化器
⇒ ⇒ **字面量扫描复用 TS 那一份**（Dart 的注释与字符串规则和 TS 同形）⇒ ⇒ 不各写一份。

### 10.3 ✅ 读数：两个客户端，一好一坏

- **移动端端脑方言客户端**：36 个调用点 ⇒ ⇒ **36/36 全 aligned** ⇒ ⇒ 这条线已经迁干净了。
- **移动端前额叶方言客户端**：42 个调用点 ⇒ ⇒ **0 aligned / 9 outer / 7 differs / 26 missing**
  ⇒ ⇒ **端脑压根没有的占 26/42** ⇒ ⇒ 机器**证实了它自己注释里那句「两者没有交集」**。

⚠️ 而它**不是死代码** ⇒ ⇒ `agents_screen` / `providers_screen` / `soul_screen` /
`memory_screen` / `group_screen` / `identity_provider` / `conversation_mode_provider`
七处**还在用它** ⇒ ⇒ 那 26 条是**活缺口**，不是「没人调的老代码」。

### 10.4 ⚠️ 修②：生成器必须对**三张面**都查（闸当场抓到了我的错）

我第一版生成器**只查端脑那一张面** ⇒ ⇒ 于是 hippocampus 那张 outer 面上的 4 条
（`POST /hippocampus/api/search` / `POST /hippocampus/api/memory` /
`POST /hippocampus/api/sessions` / `GET /hippocampus/api/sessions`）被误判成 `missing`
⇒ ⇒ **闸当场报「表说谎了」** ⇒ ⇒ 改生成器（三张面都查）⇒ ⇒ 重新生成 ⇒ ⇒ 闸绿。

⚠️ 这正是「表不许过期 / 表不许说谎」这条判据**在审我自己的产出** ⇒ ⇒ 不是装饰。

### 10.5 ✅ 修③：抽取器改成吃**文本**（可单测）

⇒ ⇒ 自检 **6 ⇒ 10 只**（新增 4 条 Dart 夹具：直接字面量 / `$name` 插值 /
**变量形态** / 查询串去掉）⇒ ⇒ 夹具**与真实输入同形**（三支都写进去）。

### 10.6 ⚠️ 途中踩到：一个被写坏的分支，**文件还能跑**

用编辑器改那一行时，条件表达式被写成了一行 `NaN` ⇒ ⇒ `NaN` 是**合法的表达式语句**
⇒ ⇒ 文件**照样能跑**、自检**照样绿** ⇒ ⇒ 只靠「跑一下」**抓不到** ⇒ ⇒
是靠 **grep 核对「文件真的被改到了」** 抓到的 ⇒ ⇒ 又一次证明那条纪律。

### 10.7 证据 + 反向验证

- 对照闸自检 **10/10**；主流程 **168 条登记 ↔ 168 个调用点** ⇒ EXIT=0
  （98 aligned / 14 outer / 25 differs / 31 missing）。
- ⚠️ **反向验证**：删掉一条移动端登记行 ⇒ ⇒ **exit=1**（报「没登记」）；
  拆掉 Dart 的 `$name` 归一化 ⇒ ⇒ **exit=1**（报「没登记」+「表过期」）
  ⇒ ⇒ 闸**有分辨力**、不是恒绿 ⇒ ⇒ 两次都**按字节还原**（sha 一致）。

### 10.8 ⚠️ 还欠的

- **移动端那 26 条「端脑压根没有」的调用点** ⇒ ⇒ 归产品决定（是迁到端脑面、
  还是这块功能在移动端**就不该有**）⇒ ⇒ 表里只报告，不阻断。
- **桌面端那 29 个 `prefrontalClient` 调用点迁到端脑面**（路径＋形状＋凭据三件事一起迁）。
- **`POST /api/flows/by-name/{param}/invoke`** ⇒ 端脑补路由 or 产品改口径（现在 404）。
- **真机复验**仍欠（要重编 `.so` ＋ 重打 APK ＋ 装机）。
## 十一、端脑的会话面**没有删除、也没有标题**（2026-11-01 实测）

### 11.1 判据源（端脑活仓，2026-11-01 复核）

- 会话路由只有四条（`telencephalon/src/api/shadow.rs:74-77`）：
  `GET/POST /shadow/v1/conversations` ＋ `GET /shadow/v1/conversations/{id}`
  ＋ `POST /shadow/v1/conversations/{id}/messages` ⇒ ⇒ **没有 DELETE**。
- `Conversation`（`telencephalon/src/api/shadow/conversations.rs:148`）只有
  `id` / `agent` / `created_at` / `updated_at` / `history` ⇒ ⇒ **没有 `title`**
  （标题只能由客户端从 history 派生）⇒ ⇒ **也没有「废弃」标记**。

⇒ ⇒ 客户端一旦**换一条会话重试**，旧那条就被**永久遗弃**（端脑侧没有删除路径）。

### 11.2 ⚠️ 它是**看得见**的：会跑到移动端的会话列表里

- 桌面端 `shadow-desktop/src/pages/ConversationPage.tsx` 的发送处理器：
  `if (!conversationId || attempt > 0)` ⇒ ⇒ **重试时新建一条会话**并覆盖 `conversationId`
  ⇒ ⇒ 上一条被遗弃。
  ⚠️ 而失败分支自己就会 `conversationId = undefined; continue;` ⇒ ⇒ 那条路已被
  `!conversationId` 覆盖 ⇒ ⇒ **`attempt > 0` 这一项其实是冗余的**（它从不改变结果）；
  真正的漏点是「**换新会话重试 ⇒ 旧的被遗弃**」这件事本身。
- 移动端 `shadow-mobile/lib/screens/conversation_screen.dart` 真的调 `listConversations()`
  ⇒ ⇒ **桌面端遗弃的会话会出现在移动端的会话列表里** ⇒ ⇒ 用户看得见。
- ⚠️ 而**全仓没有任何删除路径**（移动端 grep `deleteConversation` ⇒ **0 命中**）⇒ ⇒ **删不掉**。

### 11.3 ✅ 移动端已修（兄弟会话这轮做的）：「第一条消息才建会话」

⚠️ 它改的是**时机**、不是端点 ⇒ ⇒ **端点集合没变** ⇒ ⇒ 对照表不受影响
⇒ ⇒ **实测**：他们的改动之后，对照闸仍 **168 条登记 ↔ 168 个调用点** ⇒ EXIT=0 ✓。

### 11.4 ⚠️ 这条缺口归**产品决定**（已发问卷；决定之前**不动行为**）

候选：① 端脑加「废弃」软删标记（列表不显示、数据不丢）；② 桌面端重试改为复用同一会话
（代价：会话真坏时那次重试也会失败）；③ 只记台账 ＋ 上闸，行为不动。

⚠️ **为什么先问而不自己选**：① 要改**端脑的公开接口**（跨仓）；② 是**拿一次回复机会**
换「不漏会话」；③ 什么都不改但垃圾继续堆 ⇒ ⇒ 三条路的代价不同 ⇒ ⇒ 归产品。

### 11.5 ⚠️ 顺带记一个**全局事件**：共享 master 被 force 过

`origin/master` 被 force-update 回 `6dbacc3` ⇒ ⇒ 十几笔提交（含本会话的）
**从 origin 上消失过** ⇒ ⇒ **本地 master 全都还在** ⇒ ⇒ 一次普通快进推送全补回。

⇒ ⇒ **实测本会话**：四笔提交（`2897569` / `9ab3561` / `a0a9a0b` / `24f1fe6`）**都在 origin 上**，
未推送提交为空 ⇒ ⇒ **不用重推、也不用重做**。
⇒ ⇒ 纪律：**本地 master 是真相**；推之前先 `git merge-base --is-ancestor origin/master HEAD`
⇒ 是祖先 ⇒ ⇒ 普通 push 就够；不是祖先 ⇒ ⇒ **别硬推** ⇒ ⇒ 先查是谁 force 的、丢了什么。
---

## 十二、端脑这一面**没有信封** —— 而桌面端有个 client 还在说「旧方言」（2026-11-01 实测）

### 12.1 病：桌面端**两个 client 打同一台端脑**，其中一个说的是**别的服务器**的方言

- `shadow-desktop/src/lib/platform.ts:51` 自己写着：「⚠️ 这个函数叫 prefrontalUrl，
  但它**不是**「前额叶服务」的地址 —— 端脑把前额叶**内嵌**成自己的一张面
  （/api/telencephalon/prefrontal/*），而 lib/prefrontalClient.ts 说的是
  **prefrontal 独立仓**时代的方言（裸 /api/* ＋ {success,data} 信封）
  ⇒ ⇒ 它今天打的是端脑，但**路径与响应形状都对不上**」。
- ⇒ ⇒ 于是**同一台端脑**上并存两套方言：
  `telencephalonClient.ts`（**端脑方言**：裸体）＋ `prefrontalClient.ts`（**旧方言**：信封）。
- ⇒ ⇒ 「**路径对得上、方法对得上**」**不等于**「**响应形状**对得上」
  ⇒ ⇒ 而对照表（路径 / 方法两维）**看不见**这一维 ⇒ ⇒ 补机器判据。

### 12.2 ✅ 机器可判的前提：**端脑这一面压根没有 `{success,data}` 信封**

- 探针实测（端脑 **132 条路由**全扫）：src 下**没有任何 struct 同时带 `success` 与 `data`**
  ⇒ ⇒ 3 个带 `success` 的结构体里，`success` 都是**业务字段**
  （`LlmConfigureResponse{success,requires_restart,env_vars_set,message}` / `TraceEvent` /
  `FlowTraceEvent`）⇒ ⇒ 也没有手写的 `json!({ "success": …, "data": … })`
  ⇒ ⇒ **端脑一律返裸体**。
- ⇒ ⇒ 这个前提本身**进机器**：`scripts/lib/response-shape.mjs` 的
  `envelopePremiseInTexts()`。
  ⚠️ **判错时的方向是保守的**：判成「有信封」⇒ ⇒ 少红（漏报）⇒ ⇒ 可接受；
  判成「无信封」而其实有 ⇒ ⇒ **假红** ⇒ ⇒ 会让人去改已经改对的代码 ⇒ ⇒ **更坑**。

### 12.3 ✅ 修：桌面端 `prefrontalClient` 认两种形状 ＋ 按门形递钥匙

- **形状**：新 `unwrapEnvelope()` ⇒ ⇒ 裸体与信封**两种都认** ⇒ ⇒ 迁移期换哪边都不炸。
  三处改用它：`createSession`（`POST /api/sessions`）/ `listSessions`（`GET /api/sessions`）/
  `listAgents`（`GET /api/agents`）。
- ⚠️ **顺带修了一条更大的洞**：这个 client 之前**一把钥匙都不带**
  （`request()` 只带 `Content-Type`）⇒ ⇒ 而 `POST /api/sessions` 是 **admin 门**
  （`/api/sessions/*` = `auto` ⇒ POST ⇒ admin）⇒ ⇒ **必然 401**
  ⇒ ⇒ 伴侣模式（`stores/companionModeStore.ts:37` 真的调 `createSession()`）**起不来**。
- ⇒ ⇒ 现在**按门形递钥匙**：读面递**影子锁 ∪ admin**、写面递 **admin**
  ⇒ ⇒ 复用共享实现（`lib/readDoorHeaders.ts` / `lib/adminToken.ts`）⇒ ⇒ **不另抄一份**，
  也**拿不到就不带那个头**（绝不塞空串 —— 空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开）。

### 12.4 ✅ 新闸 `scripts/check-client-dialect.mjs`（形状这一维）

- 判据（**单向**：客户端 → 端脑）：客户端**硬要信封** ＋ 打的**确实是端脑面上真实存在**的
  那条路由 ＋ 端脑面无信封 ⇒ ⇒ **红**（客户端解析必炸：`env.success` 是 `undefined`）。
- **路径先于形状**：路径对不上 ⇒ ⇒ **先 404** ⇒ ⇒ 形状轮不到 ⇒ ⇒ 那些只**报告**
  （归对照表管：missing / outer）。
- **「两种都认」不算硬要信封** ⇒ ⇒ 用统一解包 helper 的 ⇒ ⇒ 绿。
- 读数：客户端调用点 **177 个**（桌面 ＋ 移动端**全部源码树**，测试文件不算）
  ⇒ ⇒ 修完 **红 0 / 报告 5**；修之前是 **红 2**
  ⇒ ⇒ `prefrontalClient.ts:362`（`POST /api/sessions`）＋ `:371`（`GET /api/sessions`）
  ⇒ ⇒ 与手工推导**逐条对上**。
- 自检 **13 条**（含「前提判错时的方向」「两种都认不算」「404 先发生」「裸体不红」）。
- ⚠️ **顺带收掉一处「各写一份」**：路径归一化（`normalizeClientPath` / `normalizeDartPath` /
  `isIdentChar`）合并到 `scripts/lib/response-shape.mjs` 一处 ⇒ ⇒ 对照闸读数**逐字未变**
  （168 条登记 · 98 aligned / 14 outer / 25 differs / 31 missing）⇒ ⇒ 语义等价、零行为变化。

### 12.5 ✅ 反向验证（判据有分辨力 ⇒ 且两把判据**互不耦合**）

- **退回「只认信封」**（缺陷形状）⇒ ⇒ 方言闸**恰好红 2** ＋ 单测**恰好红 2**
  ⇒ ⇒ 而**凭据那两条保持绿** ⇒ ⇒ 形状与钥匙两把判据**不耦合**（否则一处坏 ⇒ 全红）。
- **摘掉钥匙** ⇒ ⇒ 单测**恰好红 2**（写面 / 读面）＋ 形状那两条**保持绿**
  ⇒ ⇒ 方言闸**红 0**（形状与钥匙互不干扰）。
- 两次都**按字节复原**（`prefrontalClient.ts` 的 sha256 一致：`5B865C58…`）。

### 12.6 ⚠️ 还欠的（**不归本闸**，别拿「闸绿了」当「全好了」）

- ① **伴侣模式仍然断**：WS 地址是 `http://localhost:8082/api/sessions/{id}/ws`
  （`stores/companionModeStore.ts` 的 `DEFAULT_HOST`）⇒ ⇒ 端脑的 WS 路由是
  `/api/webrtc/{modality}/sessions/{session_id}/ws` ⇒ ⇒ **主机与路径两处都不对**
  ⇒ ⇒ 形状与钥匙修好之后它**仍然起不来** ⇒ ⇒ 归**产品决定**（端脑 webrtc 面的用法）。
- ② `prefrontalClient` 还有 **25 发**打在端脑**压根没有**的路径上（对照表 `differs` /
  `missing`）⇒ ⇒ 归「迁到端脑面」那笔（路径 ＋ 形状 ＋ 凭据**三件事一起迁**）⇒ ⇒ 未动。
- ③ **凭据闸的覆盖面**：它只看 `telencephalonClient`（它的读数「客户端调用点 57 个」
  **不含**这个 client 的 28 发）⇒ ⇒ 本轮给 `prefrontalClient` 递了钥匙，但**没有闸盯它**
  ⇒ ⇒ 下一笔：把「门形 ⇒ 客户端递哪几把」扩到**每个 client**
  （共享判据 `scripts/lib/credentials.mjs` 加 `doorHeaders` 这个构建器）。
- ④ 端脑代理转发时要不要**剥掉** admin 头（下游是 hippocampus / neuron）⇒ ⇒ 端脑侧的事，
  本轮没动。