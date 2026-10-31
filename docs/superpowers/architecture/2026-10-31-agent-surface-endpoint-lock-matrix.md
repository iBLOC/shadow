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
| `/api/telencephalon/neuron/preview/*` | GET | neuron_public | — | 模型/引擎清单 |
| `/api/telencephalon/agents/list` \| `/registry` \| `/exposed` \| `/search` \| `/discover` \| `/mirror` | GET | agents_registry / agent_management / agent_search | ✅ | 叶区与 agent 清单 |
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

### C 类 —— 该开着（锁了会自锁 / 本机自用）

| 端点 | 方法 | 模块 | 为什么该开着 |
|---|---|---|---|
| `/api/trace/stream` | GET | trace | SSE 事件流（调试面板） |
| `/api/webrtc/{modality}/sessions/{session_id}/ws` | GET | webrtc_route | WebSocket —— **浏览器要连**（带不了自定义头） |
| `/.well-known/agent.json` | GET | well_known_router | 代理发现 |
| `/wasm/{name}/.well-known/agent.json` | GET | wasm_route | WASM agent 发现 |

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
| **1** | **修 admin 面的空洞**（空头能过）+ **把 admin 鉴权提到 router 层**（19 条一层管住）+ 移动端也递一把 admin token | 移动端的 admin 功能**今天就是坏的**（401）⇒ 修完才第一次能用 | 「不带 token ⇒ 401」「带对 token ⇒ 200」「空 token ⇒ 401」 |
| **2** | 修**地雷**：`PrefrontalClient` 内部自建的 client 改成注入共享 client | 会有一个 401 ⇒ 顺手修 | 移动端 `/api/flows` 仍然通 |
| **3** | 把锁**从 `/shadow/v1/*` 提到整张面**（A+B 类） | 两端客户端本来就带 key ⇒ 不自锁 | 「同机任意进程打 A 类 ⇒ 401」＋「App 全部功能照旧」 |
| **4** | D 类另立：每台远端 agent 一份凭据（`src/acl/` + `credential_signer.rs`） | 跨机 ⇒ 不能用本机 key | 跨机 A2A 仍然通，且未授权对端被打回 |

⚠️ **步 3 之前必须先做完步 1**：否则「整张面都要 key」这个决定，会把 admin 那 19 条
**变成双重门**（shadow key + admin token）⇒ 而移动端没有 admin token ⇒ App 的
agent/WASM/MCP 管理功能会从「401」变成「401」（没变好，但排查会更难）。

## 六、不在本次范围内

- **neuron 面绑 `0.0.0.0`**（同网段可达）—— 那是**绑定地址**问题，不是鉴权问题 ⇒ 另一档。
- **桌面端的端脑（:60080）默认也绑 `0.0.0.0`**（`config.telencephalon.bind.http` 的默认值）
  ⇒ 同一类问题。
- **签发侧接线**（`src/acl/` + `credential_signer.rs`）—— 步 4 才需要。
