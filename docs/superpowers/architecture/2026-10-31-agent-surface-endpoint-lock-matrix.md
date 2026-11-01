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
