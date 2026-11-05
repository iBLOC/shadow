# OpenZiti 真网验证手册（Shadow）

> 这份文档回答的是：**「openziti 已经部署好了，我该怎么验证它、以及验证到哪一步了？」**
>
> 最后更新：2026-11-04 ｜ 对应网络：OpenZiti **v2.0.8** @ 192.168.31.170

---

## 0. 一句话现状

**全通了 —— 网络侧通，我们的 Rust 客户端也通了（真网级证据）。**

| 层 | 状态 | 证据 |
|---|---|---|
| 控制器 API（认证 / 服务 / 策略 / 身份） | ✅ 通 | ```cargo run --example ziti_doctor``` ⇒ 200 OK，能看到 service 与 edge router |
| edge router 数据面（线路协议） | ✅ 通 | **自建的 v2 线路层**（```ziti-rust/crates/ziti-v2/src/```）⇒ 真网握手 ＋ Connect ＋ Bind ＋ 数据回环全通 |
| Shadow 的真网端到端测试（5 条 ```#[ignore]```） | ✅ **全绿** | ```cargo test --features ziti --lib transport::ziti::live_tests -- --ignored``` ⇒ **5 passed / 0 failed** |

⇒ ⇒ 2026-11-04 这一轮把线路层**从第三方 ziti-sdk（说的是 v1 协议）换成自建的 v2 实现**，
第三方 SDK 依赖**已彻底移除** ⇒ ⇒ **不是「网络没配好」，也不是「SDK 不支持」——
是我们之前拿 v1 的工具去敲 v2 的门。**

---

## 1. 这张网的客观事实（2026-11-04 实测）

| 项 | 值 |
|---|---|
| 控制器 | ```https://192.168.31.170:1280```（OpenZiti **v2.0.8**，revision ```8dce94600e8c```） |
| 边缘路由器 | ```quickstart-router```（id ```JejP-2NZky```，```isOnline=true```，```syncStatus=SYNC_DONE```） |
| 路由器**客户端面** | ```192.168.31.170:3022```（TLS）—— ⚠️ **10080 是 router↔router 的链路端口，不是客户端面** |
| 路由器**控制通道** | ```tls://192.168.31.170:3022``` |
| 管理面板 | ```https://192.168.31.170:1280/zac/dashboard``` |
| 认证方式 | **OIDC**（Basic 401；```/edge/client/v1/login``` 在 v2 已 404） |
| 管理 API 登录 | ```POST /edge/client/v1/authenticate?method=password``` → ```{data:{id,token}}```，之后带 ```zt-session``` 头 |

⚠️ **本机没有 ziti CLI**（```Get-Command ziti``` ⇒ NOT FOUND）⇒ ⇒ 所有注册动作都走 REST。

---

## 2. 第 0 步：供给（一条命令）

网络刚部署完时是**空的**：0 个 service、0 条策略、只有 1 个 router + admin 身份。
先用脚本把「服务 + 两个身份 + 两条策略 + 身份文件」备齐：

```
$env:ZITI_ADMIN_PASSWORD = '你的控制器口令'
pwsh -File scripts/openziti-provision.ps1 -Recreate
```

产出（落在 ```.ziti/```，已被 .gitignore 忽略）：

| 文件 | 是什么 |
|---|---|
| ```shadow-brain-host.identity.json``` | 宿主身份（Bind 侧）—— 私钥在同目录 ```*.key.pem``` |
| ```shadow-brain-client.identity.json``` | 客户端身份（Dial 侧） |
| ```*.ca.pem``` | CA bundle（**含自签根**，来自控制器的 EST 端点） |
| ```ziti.env``` | 给测试用的环境变量 |

幂等：再跑一次不会重复建实体；```-Recreate``` 才是彻底重来。

---

## 3. 第 1 步：体检（控制器 API 层）

```
$env:ZITI_IDENTITY = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-client.identity.json"
cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_doctor
```

它会依次打印：加载身份 → **mTLS 认证控制器** → 列出这张身份能看到的 edge router → 列出能看到的服务。

**它对比两种 TLS 校验器**（这一点很重要，见第 5 节阻塞 C）：

- 平台校验器（reqwest 默认 = rustls-platform-verifier，Windows 上查**系统证书库**）⇒ 私有 CA ⇒ **UnknownIssuer**
- 纯 rustls（```tls_certs_only()```，只用身份自带的 CA bundle）⇒ **200 OK** ✅

---

## 4. 第 2 步：线路探针（edge router 数据面）

⚠️ **v2 迁移后这个探针重写过** —— 旧版发的是 **v1** 的 ZitiMessage（没有 magic 的
WebSocket 帧）⇒ ⇒ 在 v2 路由器上**必然**失败 ⇒ ⇒ 现在它走
**控制器 → 服务会话 → 客户端面 → magicV2 Hello** 这条真路。

```
$env:ZITI_IDENTITY = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-client.identity.json"
$env:ZITI_SERVICE  = "shadow-brain"
cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_wire_probe
```

⚠️ **不需要 `ZITI_ROUTER`** ⇒ ⇒ 客户端面地址是从**服务会话**里拿的
（v2 的地址不在控制器的服务列表里，而在会话响应的 `edgeRouters[].urls.tls`）。

它逐段打印（2026-11-04 实测）：

```
  ✅ 身份文件读到了：ztAPI = https://192.168.31.170:1280/edge/client/v1
  ✅ 控制器 mTLS 认证成功
  ✅ 服务会话建好：service_id = 5eCfg7KsALqCc6X0z6d6f
     edge routers（客户端面）= ["192.168.31.170:3022"]
  ✅ TLS 握手成功（未报 ALPN）
  发出 Hello 帧：64 字节（magicV2 ＋ 头 1002）
    content_type = 2
    header 4 = v2.0.8|8dce94600e8c|2026-10-08T16:22:12Z|linux|amd64
==> 线路层通了（v2 magicV2 ＋ 头 1002 被路由器认出来）
```

⚠️ **头 4 里就是路由器自己的版本** ⇒ ⇒ 这一行是「对面确实是 v2.0.8」的第一手证据。

还有一个 **裸 TLS 探针**（`ziti_raw_probe`）—— 它把字节摊开（hex ＋ ascii），
顺带回答「ALPN 报不报」（路由器**只认不报 ALPN**）：

```
$env:ZITI_IDENTITY = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-client.identity.json"
$env:ZITI_ROUTER   = "192.168.31.170:3022"
cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_raw_probe
```

---

## 5. ✅ 三个阻塞点已全部解开（附最终规格）

2026-11-04：**三个阻塞全部解开** —— 办法是**把线路层自己写一遍**
（```ziti-rust/crates/ziti-v2/src/```，七个文件），第三方 ```ziti-sdk``` 依赖**已彻底移除**。

### 阻塞 A / B：v1 的工具 ＋ v1 的协议 ⇒ ⇒ 换成自建的 v2 实现

```ziti-sdk 0.3```（第三方 ```jaschadub/ziti-rust```）说的是 **OpenZiti v1**：
线路层是 WebSocket ＋ 自制 ZitiMessage（**没有 magic**），
控制面是 ```GET /services/{id}/terminators```、```current-identity/edge-routers```。

而这张网是 **v2.0.8** ⇒ ⇒ 四个候选 WS 路径全报
```httparse error: invalid HTTP version``` ⇒ ⇒ **根本不是 WebSocket**。

⇒ ⇒ 自建的 v2 线路层（规格来自官方源码：```openziti/sdk-golang``` 的 pb ＋ ```openziti/channel``` 的 message.go）：

| 层 | 规格 |
|---|---|
| 线路格式 | **openziti/channel v4.3.13 的 magicV2 二进制帧**（v2.0.8 的 go.mod 里写死的就是 v4）：帧头 20 字节 ＝ ```magic(4)=03 06 09 0c ｜ contentType(4) ｜ sequence(4) ｜ headersLen(4) ｜ bodyLen(4)```，后接 headers ＋ body |
| edge 内容类型 | ```Connect=60783``` / ```StateConnected=60784``` / ```StateClosed=60785``` / ```Data=60786``` / ```Dial=60787``` / ```DialSuccess=60788``` / ```Bind=60790``` / ```BindSuccess=60800``` |
| edge 头 | ```ConnId=1000``` / ```SessionToken=1002``` / ```Flags=1010``` / ```RouterProvidedConnId=1012``` / ```CircuitId=1026``` |
| channel 头 | ```ReplyFor=1``` / ```ResultSuccess=2``` |

⚠️ **JVM SDK 那套 60000+ 是老代编号，不能用。**

### ⚠️⚠️ 三条协议不变量 —— 少一条就「长得像别的问题」

| 不变量 | 少了会怎样 |
|---|---|
| **Hello 必须带头 1002** ＝ api-session token | 路由器**直接关连接**（连 StateClosed 都没有） |
| **回 DialSuccess 必须带 ```ReplyFor```（channel 头 1）** | 路由器把它当普通消息丢掉 ⇒ 5 秒后 ```timeout waiting for message reply``` ⇒ **客户端收到 StateClosed** |
| **TLS 不许报 ALPN** | 路由器回 **TLS fatal InternalError** ⇒ 握手直接失败 |

⚠️ 另外三条实测细节：**Dial 的 body 是宿主自己的 bind token**（不是 newConnId）；
**newConnId 由宿主自己分配**（legacy 路径路由器不填 ```RouterProvidedConnId```）；
**客户端面是 3022**（10080 是 router↔router 的链路端口）。

### 阻塞 C：私有 CA 与 TLS 校验器

私有 CA **不在系统证书库**里 ⇒ ⇒ 用「查系统根证书」那套（rustls-platform-verifier）会报 **UnknownIssuer**。
⇒ ⇒ **两侧都只能用 ```tls_certs_only()```**（纯 webpki，只用身份自带的 CA bundle）。

### terminator：不用手建

路由器的 ```processBind``` 会**自己建** terminator
（```create_terminator_v2.go:138``` 恒用 ```Binding: common.EdgeBinding```）⇒ ⇒ **不需要**管理面去建。
⚠️ 反过来：**手建 binding=```tls``` 的 terminator 是有害的**
（路由器会报 ```xgress factory [tls] not found```）
⇒ ⇒ ```scripts/openziti-terminator.ps1``` 现在只做**巡检**（列出并点名用不了的）。

---

## 6. 第 3 步：真网端到端测试（线路层通了之后）

⚠️ **那 5 条分成两类，跑法不一样** —— 4 条**只拨号**（需要**对面有个大脑面**在跑），
1 条**整链**（**同进程**里既当宿主又当客户端）⇒ ⇒ **别让它们同时跑**
（两个宿主抢同一个 service ⇒ ⇒ 路由器的 Dial 会随机落到其中一个）。

### 6.1 先起一个「真的大脑面」当对面

```
$env:ZITI_HOST_IDENTITY = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-host.identity.json"
$env:ZITI_SERVICE       = "shadow-brain"
cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_v2_brain
```

它跑的是**生产**那条 serve 入口（synapse::transport::ziti::serve），不是另写一份
⇒ ⇒ 起成功会打印 [brain] 起大脑面：service=shadow-brain。

### 6.2 跑那 4 条（大脑面**保持开着**）

```
$env:ZITI_IDENTITY          = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-client.identity.json"
$env:ZITI_SERVICE           = "shadow-brain"
$env:ZITI_TEST_CONVERSATION = "e2e-real"   # ⚠️ 不给这条，SSE 会**自己跳过**（不是失败）
cargo test --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --lib transport::ziti::live_tests -- --ignored --nocapture --skip live_overlay_end_to_end
```

### 6.3 再跑整链那一条（**先停掉大脑面**）

```
cargo test --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --lib transport::ziti::live_tests::live_overlay_end_to_end -- --ignored --nocapture
```

### 6.4 五条各自证明什么 ＋ 读数（2026-11-04 实测）

| 测试 | 证明什么 | 读数 |
|---|---|---|
| ```live_http_request_response``` | 普通请求/响应能过覆盖网 | ✅ ok |
| ```live_websocket_upgrade``` | WebSocket **升级**握手能过 | ✅ ok（101 Switching Protocols） |
| ```live_sse_stream``` | 流式响应能过（且是**分块**到达，不是整体缓冲） | ✅ ok |
| ```live_proxy_end_to_end``` | 前端真正走的那条路（本地代理 ⇒ ziti ⇒ 远端大脑） | ✅ ok |
| ```live_overlay_end_to_end``` | **同进程**里既当宿主又当客户端 ⇒ 整条链一次跑完（HTTP / WS / SSE / 本地代理） | ✅ **1 passed / 0 failed** |

整链那一条的完整输出（读数即真数）：

```
[e2e] HTTP 状态码 = 200 OK
[e2e] 响应体 = {"ok":true,"surface":"shadow-brain"}
[e2e] WS 握手状态码 = 101 Switching Protocols
[e2e] 收到一帧 = Text(Utf8Bytes(b"ping"))
[e2e] SSE 状态码 = 200 OK
[e2e] SSE content-type = text/event-stream
[e2e] 第一块 = data: tick-0 / 第二块 = data: tick-1
[e2e] 本地代理 = http://127.0.0.1:62315
[e2e] 经代理的状态码 = 200 OK
```

⚠️ 第一块 = data: tick-0 / 第二块 = data: tick-1 —— **是两块**，不是整体缓冲
⇒ ⇒ 「流式」这件事在**真网**上是真的（loopback 上的承载级证据只能说明「代码路径对」）。

### 6.5 顺便跑一下生产路径体检

```
$env:ZITI_CLIENT_IDENTITY = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-client.identity.json"
$env:ZITI_HOST_IDENTITY   = "C:\Projects\iBLOC\shadow\.ziti\shadow-brain-host.identity.json"
$env:ZITI_SERVICE         = "shadow-brain"
cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_v2_prod
```

⇒ ⇒ 逐段体检 listen → dial → accept → 数据回环（**生产 API**：ZitiGateway::listen/dial）：

```
[3] ✅ 宿主已 listen
[H1] ✅ 宿主已 accept（conn=1001）
[6] ✅ 客户端已 dial（conn=1）
[H2] ✅ 宿主收到 [112, 105, 110, 103]（4 字节）
[H3] ✅ 宿主已回 pong
[8] ✅ 客户端收到 [112, 111, 110, 103]（4 字节）
✅ 全链路通（生产 API：listen/dial/accept/数据回环）
```

⚠️ **时序要点** —— 路由器的 Dial 只等 **5 秒** ⇒ ⇒ 宿主必须**并发**地跑 accept 循环
⇒ ⇒ **不能**「先拨号再 accept」。


---

## 7. v2 API 配方速查（都是实测出来的）

| 动作 | 调用 |
|---|---|
| 登录 | ```POST /edge/client/v1/authenticate?method=password```，体 ```{"username","password"}``` |
| 建服务 | ```POST /edge/management/v1/services``` ```{"name","encryptionRequired":false}``` |
| 建身份 | ```POST /edge/management/v1/identities``` ```{"name","type":"Default","isAdmin":false,"roleAttributes":[]}``` |
| 建 enrollment | ```POST /edge/management/v1/enrollments``` ```{"identityId","method":"ott","expiresAt"}``` |
| 取 enrollment JWT | ```GET /edge/management/v1/enrollments/{id}``` ⇒ ```data.jwt``` + ```data.token```(uuid) |
| 换身份文件 | ```POST /edge/client/v1/enroll?method=ott&token=<uuid>```，头 ```Authorization: Bearer <jwt>```，体 = **PEM CSR** ⇒ ```data.cert``` |
| CA bundle | ```GET /.well-known/est/cacerts``` ⇒ **PKCS#7**（含自签根） |
| 建策略 | ```POST /edge/management/v1/service-policies```，角色**必须**带前缀：```@<id>```（名称/id）或 ```#<role>```（角色属性） |
| 建 terminator | ```POST /edge/management/v1/terminators``` ```{"service","router","binding","address"}``` |

⚠️ **三个 v2 的反直觉点**：

1. **建身份时不吃 ```enrollmentMethod```** ⇒ 身份建出来是空的，要**另建 enrollment**。
2. **enroll 的响应里没有 ```ca```** ⇒ CA bundle 得去 EST 端点拿。
3. **```encryptionRequired``` 不可 PATCH**（报 ```"no fields updated"```）⇒ 只能删了重建。

---

## 8. 排障速查

| 症状 | 根因 | 怎么办 |
|---|---|---|
| ```invalid peer certificate: UnknownIssuer``` | 私有 CA 不在系统证书库 | 用 ```tls_certs_only()```（见阻塞 C） |
| ```error sending request for url (...)``` | SDK 把根因吞了 | 先跑 ```ziti_doctor```，它会打印完整错误链 |
| ```httparse error: invalid HTTP version``` | 服务器不是 HTTP/1.x（v2 线路协议） | 见阻塞 B |
| ```401 / INVALID_ENROLLMENT_TOKEN``` | enrollment token 传错了 | query 传 **uuid**（```data.token```），JWT 走 ```Authorization: Bearer``` |
| ```"role entries must prefixed with # or @"``` | 策略角色没带前缀 | ```@<id>``` 或 ```#<role>``` |
| 服务在客户端视角里看不到 | 身份没有 Dial 策略 | 策略的 ```type``` 要是 ```Dial```，角色要挂到**身份 id** 上 |

---

## 9. 相关的仓内文件

| 文件 | 作用 |
|---|---|
| ```scripts/openziti-provision.ps1``` | 供给（服务 / 身份 / 策略 / 身份文件） |
| ```synapse/examples/ziti_doctor.rs``` | 体检：控制器 API 层 |
| ```synapse/examples/ziti_wire_probe.rs``` | 线路探针：控制器 → 服务会话 → 客户端面 → magicV2 Hello |
| ```synapse/examples/ziti_raw_probe.rs``` | 裸 TLS 探针：把字节摊开 ＋ ALPN 候选对照 |
| ```synapse/src/transport/ziti/live_tests.rs``` | 5 条真网测试（4 条原有 + 1 条整链 e2e） |
| ```synapse/src/transport/ziti/mod.rs``` | 传输层总入口（**v2 自建实现**，第三方 ziti-sdk 已彻底移除） |
| ```ziti-rust/crates/ziti-v2/src/``` | **v2 线路层**（七个文件：帧 / 常量 / 身份 / 控制器 / 通道 / 流 / 上下文） |
| ```synapse/examples/ziti_v2_prod.rs``` | 生产路径逐段体检（listen → dial → accept → 数据回环） |
| ```synapse/examples/ziti_v2_brain.rs``` | 起「真的大脑面」当那 4 条测试的对面 |
| ```scripts/check-ziti-v2-wire.mjs``` | **v2 线路规格守门员**（六条规则：常量 / 三条不变量 / 背压对称 / 真网入口 / ziti-sdk 不许回来） |
| ```scripts/openziti-terminator.ps1``` | terminator **巡检器**（默认只列；`-RemoveNonEdge` 才删） |
