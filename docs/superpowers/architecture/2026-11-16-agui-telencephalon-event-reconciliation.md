# AG-UI 1.0 ↔ 端脑 SSE 逐字段映射表(Reconciliation)

> 日期:2026-11-16 ｜ 性质:评估文档(立项前提,不改任何代码)
> 方法:仿 AG-UI 仓 `spec/RECONCILIATION.md` —— 两个协议面逐事件、逐字段对照,
> 每行给**判定**(直接对应 / 需拆分 / 需新造 / 无家可归),判定依据只认两边的权威源。

## 0. 权威源(本表只认这两处,不认客户端解析代码)

| 面 | 权威源 | 取证方式 |
|---|---|---|
| 端脑 wire | `telencephalon/src/api/shadow.rs`(SSE 发射处 :1044-1135;请求体 `SendMessageRequest` :294-347;端点注册 :90-110) | 逐字读源码 |
| AG-UI 1.0 | `spec/1.0/schema.json`(ag-ui-protocol/ag-ui @ main,94,359 B,98 个 \$defs;`EventType` 枚举 33 项) | GitHub raw 逐字拉取解析 |

端点(端脑侧):

- `POST /shadow/v1/conversations/{id}/messages:stream` —— SSE 流(本表主体)
- `POST /shadow/v1/conversations/{id}/tool-results` —— 客户端工具结果回传(独立 HTTP 请求)
- `POST /shadow/v1/conversations/{id}/messages` —— 非流式(无 tool_call 通道,shadow.rs:613 自己写明)

## 1. 结论摘要

1. **事件语义重叠度很高**:端脑 8 种 SSE 事件里,6 种能在 AG-UI 33 种事件里找到直接/拆分对应;
   没有一种端脑事件是 AG-UI 表达不了的(最坏的 route/handoff 也有 SUBAGENT_* 与 CUSTOM 兜底)。
2. **接入的大头不在事件,在会话哲学**(§4):端脑是"服务端持有对话史、客户端只发单条 text",
   AG-UI 是"客户端每次 run 带完整 messages[]"。适配器路线(§6 选项 A)可以绕开这个分歧。
3. **顺手钉出 4 个真实缺口(G1-G4,§5)**——其中 G1(tool_result 不带 tool_call_id)是端脑源码
   注释自己承认的歧义,**不接 AG-UI 也该修**。

## 2. 请求侧映射:SendMessageRequest ↔ RunAgentInput

| 端脑字段(shadow.rs:294-347) | AG-UI 字段(spec/1.0 #RunAgentInput) | 判定 |
|---|---|---|
| `text: String`(必填,单条用户消息) | `messages[]`(完整对话史) | **哲学差异**,见 §4 |
| `agent: Option<String>`(叶区覆盖) | 无直接对应 | 走 `forwardedProps` 或 URL 路径参数 |
| `tools: Option<Vec<Value>>`(OpenAI function-calling 形状,`[{type:'function',function:{name,description,parameters}}]`) | `tools[]`(AG-UI `Tool` = 平铺 `{name, description, parameters}`) | **需拆壳**:去掉 OpenAI 的 function 包装层即一一对应;JSON Schema 参数体两边同形 |
| `await_tool_result: bool` | 无对应 | **可丢**:AG-UI 的 TOOL_CALL_* 闭环天然在同一 run 内等待,这个 flag 是端脑为"同轮续说"自造的开关 |
| `capability_modes: Option<HashMap>`(设备能力授权档,fail-closed) | 无对应 | 走 `forwardedProps`;这是我们的授权面,AG-UI 不管 |
| (会话 id 在 URL 路径里) | `threadId` + `runId`(RunAgentInput 必填) | conversation_id ↔ threadId 直接对应;runId 端脑**没有**(需新造,见 G3) |
| (无) | `state` / `context` | 端脑无 UI 状态同步面 ⇒ 留空即可(A2UI 的 dataModelUpdate 在另一条协议里干这件事) |

工具结果回传:`POST .../tool-results` 的 `{name, tool_call_id?, result, ok?}`(shadow.rs:1212-1232)
↔ AG-UI 的 `TOOL_CALL_RESULT` 事件(同一条流内,`{messageId, toolCallId, content, role?}`)。
**判定:需改道** —— 端脑用"另开一条 HTTP 请求"回传(waiter 注册在 shadow.rs:1141-1160),
AG-UI 用同流事件。适配层需要把"独立回传请求"桥接成流内事件,或保留旁路(选项 A 下可保留)。

## 3. 事件侧映射:端脑 8+1 种 SSE ↔ AG-UI BaseEvent

端脑发射处逐字(shadow.rs:1044-1135,每行 SSE 同时带 `event:` 名与 JSON `type` 字段):

| # | 端脑事件(线上字段逐字) | AG-UI 对应 | 判定 |
|---|---|---|---|
| E1 | `delta` `{type, agent, delta}` | `TEXT_MESSAGE_CONTENT` `{messageId, delta}` | **需补 id**:delta 字段同形;但 AG-UI 必填 `messageId`,端脑没有(G2) |
| E2 | (无显式开始) | `RUN_STARTED` `{threadId, runId}` | **需新造**(G3):端脑的流没有开始事件,conversation_id 只在 done 里出现 |
| E3 | (无消息边界) | `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END` | **需新造**(G2):端脑靠"工具调用打断"隐式分段,客户端自己拼 |
| E4 | `tool_call` `{type, agent, name, args, tool_call_id}` | `TOOL_CALL_START` `{toolCallId, toolCallName, parentMessageId}` + `TOOL_CALL_ARGS` `{delta}` + `TOOL_CALL_END` | **需拆分(1→3)**:端脑 args 一次性给全(且线上是字符串,移动端 parseToolArgs 兼容 string/object 两形);AG-UI 是流式拼接。tool_call_id ↔ toolCallId **已经同形**(端脑生成 uuid,shadow.rs:881) |
| E5 | `tool_result` `{type, agent, name, result, latency_ms}` | `TOOL_CALL_RESULT` `{messageId, toolCallId, content, role?}` | **需补 id + 搬家**:⚠️ 端脑此事件**不带 tool_call_id**,只带 name(G1);latency_ms 在 AG-UI 无家 ⇒ 进事件 `metadata` |
| E6 | `step` `{type, agent, from, to, step}` | `STEP_STARTED` `{stepName}` + `STEP_FINISHED` | **需拆分(1→2)**:端脑把"从哪到哪"合并在一个事件;AG-UI 分开/合。from/to 进 metadata |
| E7 | `route` `{type, supervisor, target, reason}` | `SUBAGENT_STARTED` `{agentId, ...}` 或 `CUSTOM` | **语义近似**:supervisor 路由到 target ≈ 子代理启动;reason 进 metadata。若要保真(路由≠启动)用 CUSTOM |
| E8 | `handoff` `{type, from, to, context_size}` | `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` | **语义近似**:from 收尾 + to 开始 ⇒ 一对事件;context_size 进 metadata |
| E9 | `done` `{type, conversation_id, agent, state, timestamp}` | `RUN_FINISHED` `{threadId, runId, outcome?}` | **直接对应**:conversation_id↔threadId;state(`COMPLETED`)↔outcome=success;timestamp 是 BaseEvent 公共字段 |
| E10 | `error` `{type, agent, error}` | `RUN_ERROR` `{message, code?}` | **直接对应**:error↔message;code 端脑没有(可留空) |
| E11 | `clarification`(载荷在 `metadata.shadow.clarification`,visual_qa/clarify.rs,视觉 QA 多摄像头选源) | `RUN_FINISHED` + `RunFinishedInterruptOutcome`(内含 `Interrupt`,支持 responseSchema)或 `CUSTOM` | **需升舱**:AG-UI 1.0 把"要用户做选择"做成一等公民(Interrupt/ResumeEntry),端脑现在走的是 metadata 私有通道 |

AG-UI 有、端脑完全没有的事件族(接入即白拿,不接也不亏):
`STATE_SNAPSHOT`/`STATE_DELTA`(JSON Patch 增量状态)、`MESSAGES_SNAPSHOT`、
`REASONING_*`(6 种)、`ACTIVITY_*`、`RAW`、`TokenUsage`(⚠️ 端脑的流不回传 usage,
移动端现在靠 estimateTokens 估算 —— AG-UI 有这个类型但**要服务端发了才有**,客户端估算省不掉)。

## 4. 最大的架构分歧:会话史在谁手里

- **端脑**:conversation store 在服务端(shadow.rs 里 store.append 逐轮落库),客户端每次只发
  `text` 一条;`GET /conversations/{id}` 读历史。
- **AG-UI**:`RunAgentInput.messages[]` 客户端带全量对话史(或靠 `MESSAGES_SNAPSHOT` 事件重同步)。

两个选项:

- **A. 端脑适配器继续管会话**(推荐起步):AG-UI 端点只是 DriverEvent→BaseEvent 的翻译层,
  `messages[]` 里只取最后一条 user 消息当 `text`,threadId=conversation_id。
  客户端拿到 AG-UI 的全部事件语义,服务端会话模型一个字不动。
- **B. 全面客户端状态**:对话史搬到客户端,端脑退化成就事论事的 run 执行器。
  改动波及海马体/记忆面、桌面端、会话切换闸门(failedSwitchSessionId 那一族),**不建议在本期碰**。

## 5. 顺手钉出的缺口(不接 AG-UI 也该修的)

- **G1(最实,但比看上去深)`tool_result` 不带 `tool_call_id`** —— shadow.rs:874-880 的注释自己
  写着"同一个工具在一轮里调两次时,按名字匹配会分不清",tool_call 侧已经带 id(:881 由 driver
  层生成 uuid),但 tool_result 发射处(:1066-1075)没带。
  ⚠️ **取证修正(2026-11-16):这不是"一行字段"** —— 上游形状
  `TelencephalonStreamEvent::ToolResult { agent, name, result, latency_ms }`(a2a/client.rs:21-26)
  **根本没有 id 字段**,连 lobe 侧的 `ToolCall { agent, name, args }`(:16-20)也没有 ——
  wire 上的 `tool_call_id` 是 shadow.rs driver 层**自己生成**的(:881),而 ToolResult 从 lobe
  流经 `DriverEvent::Pass` 透传时 driver 没有把 id 关联回去。修法分两档:
  - **治标(端脑单仓)**:driver 层在 Pass(ToolResult) 透传时补挂"最近一次发出的 tool_call_id",
    并注释写清限制(同轮并发多工具调用时按序关联仍可能错位);
  - **治本(跨仓)**:synapse 的 AgentStreamEvent / lobe runtime 让 ToolResult 自带 tool_call_id,
    端脑透传即可 —— 波及 synapse + lobe + 端脑 + 双端客户端 + endpoint-matrix 登记,是一刀独立工作。
  AG-UI 的 TOOL_CALL_RESULT 把 toolCallId 定为必填 ⇒ 走适配层路线(§6 选项 A)时这个缺口**必须**先补,
  否则翻译层只能拿治标方案顶。
  - ✅ **治标档已落地(2026-11-16)**:端脑单仓,`shadow.rs` 新增 `ToolCallIdCorrelator`
    (按名 FIFO:announce 于 tool_call 发出时,resolve 于 ToolResult 透传时;**无候选 ⇒ wire 省略字段,
    绝不挂错 id**),`DriverEvent::ToolResult` 独立变体携带 `tool_call_id: Option<String>`;
    判据三条(correlator_pairs_same_name_calls_in_order / without_candidate_resolves_none /
    keeps_names_independent)。两端客户端**零改动**即受益(mobile `StreamEvent.fromJson` 与桌面
    `StreamEvent` 接口本就解析任意事件上的 `tool_call_id`)。无闸钉死 tool_result 线上形状
    (endpoint-map 只管路径;桌面临近测试自构输入)。治本档(synapse ToolEnd 带 id)**仍欠**。
  - ✅ **wire 层判据补齐(同日第二笔)**:payload 组装抽成纯函数 `tool_result_payload`,
    判据三条(有 id 带上 / 无候选**字段整个不存在**(不是 null 不是空串)/ 既有字段逐字透传);
    真变异(摘掉 if-let)当场红且只红目标判据。桌面端核实:`translateEvent` 的 tool_result
    分支**一直**透传 `toolCallId: event.tool_call_id`(既有测试 `call-2` 用例钉住)⇒
    服务端带上 id 后桌面自动受益,**零客户端改动**这句成立。移动面:tool_result 走 default
    分支仅记日志(卡片状态由本地执行驱动),采纳属新功能不属本刀。
- **G2 delta 无 messageId、无消息边界** —— 工具调用后续说的文本与前一段在客户端被拼成同一条气泡;
  AG-UI 的 TEXT_MESSAGE_START/CONTENT/END 三段式正是解这个。
  - ✅ **服务端半已落地(2026-11-16,端脑单仓纯新增)**:新事件 `message_start`/`message_end`
    (成对同 `message_id`)+ `delta` 带 `message_id` 字段;段边界=首个 delta 开段、
    tool_call/done/error 之前关段(6 个关段点全覆盖),工具卡片打断后续说的话开**新段**。
    对齐 TEXT_MESSAGE_START/CONTENT/END(§3 E1/E3 由「需新造」变「已存在」)。判据 2 条 +
    真变异(摘 delta 的 message_id)当场红且只红目标判据;裁剪档 **42 过 / 0 红**。
    老客户端零破坏(未知事件走 default 忽略、delta 新字段无人读)。
    **客户端采纳仍欠**:两端用 message_id 分气泡是后续小刀(等服务端形状在真流量上验过)。
- **G3 无显式 run 开始事件** —— 客户端分不清"连上了在排队"与"没人应答";done 带 conversation_id
  而开始侧什么都不带,首尾不对称。
  - ✅ **已落地(2026-11-16,端脑单仓纯新增)**:wire 新增 `run_started` 事件
    `{type, conversation_id, agent, run_id, timestamp}`(流的第一个事件);driver 生成 `run_id`(uuid)
    并由 `done`/`error` **原样带回** ⇒ 一次 run 首尾可配对(对齐 AG-UI RUN_STARTED/RUN_FINISHED,
    §3 E2/E9 由"需新造"变为"已存在")。payload 组装三个纯函数 + 判据 2 条;真变异(摘 done 的
    run_id)当场红且只红配对判据。老客户端零破坏(移动 default 分支只记日志 / 桌面
    translateEvent default 返回 [])。读数:全特征 worktree exit 0 + 特征裁剪档
    (关 hippocampus feature,绕开兄弟在飞面)**40 过 / 0 红**。
- **G4 clarification 走 metadata 私有通道** —— 类型安全为零(移动端 ClarificationPayload 手工解析),
  AG-UI 的 Interrupt 有 responseSchema(结构化选项)。

## 6. 路径判定

| 选项 | 内容 | 工作量分布(估) | 何时选 |
|---|---|---|---|
| **A. 适配层** | 端脑加一个 AG-UI 端点(如 `POST /shadow/v1/conversations/{id}/ag-ui:stream`),内部把 DriverEvent 翻译成 BaseEvent;现有 SSE 端点原样保留 | 端脑 Rust ~60% / 桌面 ~25% / 移动 ~15% | 想验证"AG-UI 客户端 + 统一事件流"能不能真治好 A2UI/对话割裂,又不赌上现有链路 |
| **B. 原生换轨** | messages:stream 直接改说 AG-UI,旧形状走弃用垫片 | 同上 + 双端所有消费方迁移 + 闸迁移 | A 验证通过、且愿意付迁移成本之后 |
| **C. 不接协议,只抄分类学** | 按 G1-G4 演进现有 SSE(tool_call_id 补进 tool_result、加 run_started、消息边界、interrupt 语义) | 端脑小改 + 双端客户端小改 | 短期止损;与 A 不冲突,C 修的每一格都是 A 的前置 |

**建议执行序:C(G1 先行——按 §5 取证修正,治标档端脑单仓可做,治本档跨 synapse 需独立立项)
→ A(适配层 + 移动端 ag_ui 客户端试点一条链)→ 用真机读数决定 B。**

### 6a. 选项 A 的翻译设计已定稿(2026-11-16,权威源 spec/1.0/schema.json 逐字段取证)

C 路线(G1/G2/G3)落地后,DriverEvent 已带齐 run_id / message_id / tool_call_id,翻译层无缺口:

| DriverEvent | AG-UI 事件(type 为 UPPER_SNAKE 枚举值) | 必填字段落法 |
|---|---|---|
| RunStarted{run_id,timestamp} | RUN_STARTED | threadId=conversation_id, runId, timestamp |
| MessageStart{message_id} | TEXT_MESSAGE_START | messageId, role="assistant" |
| Delta{text,message_id} | TEXT_MESSAGE_CONTENT | messageId, delta |
| MessageEnd{message_id} | TEXT_MESSAGE_END | messageId |
| ToolCall{name,args,tool_call_id} | TOOL_CALL_START + TOOL_CALL_ARGS + TOOL_CALL_END(1→3) | toolCallId, toolCallName;ARGS.delta=args 整串;parentMessageId=当前段 id(若有) |
| ToolResult(lobe 本地工具) | **CUSTOM**(name="telencephalon_tool_result") | ⚠️ 不用 TOOL_CALL_RESULT——那是**客户端回传**语义(messageId 必填、role=tool),lobe 自跑工具的结果硬套会说谎 |
| Step / Route / Handoff | **CUSTOM**(name 原样) | value 带全部字段——AG-UI 的 STEP_* 是"步骤开/关"语义,与 lobe 内部步进/路由不同形,不硬套 |
| Done{state,timestamp,run_id} | RUN_FINISHED | threadId, runId, timestamp;outcome 省略(可选字段,缺省即 success;state≠COMPLETED 时再映射) |
| Error{message,run_id} | RUN_ERROR | message;code 省略(端脑无错误码) |

公共字段:AG-UI BaseEvent 的 timestamp(integer)/metadata/rawEvent 均可选;字段名 **camelCase**
(端脑自有 wire 是 snake_case ⇒ 两套 wire 并存,互不改写)。请求侧:适配层端点接受
RunAgentInput(messages[] 取最后一条 user 当 text、tools[] 平铺形状包回 OpenAI function 壳、
threadId=conversation_id),也容忍现有 SendMessageRequest(§4 选项 A 的会话哲学不动)。
端点挂 router_with_store 的 require_shadow_key 门内;endpoint-map 闸按**客户端代码**扫描生成,
无客户端调用的新端点不进图、不触红(已核)。

### 6b. 选项 A 已实现(2026-11-16,端脑单仓)

- **手术**:driver 整块搬进 `build_turn_driver(TurnDriverInput) -> Pin<Box<dyn Stream<Item = DriverEvent>>>`,
  前半段(会话/叶区/身份)抽成 `prepare_turn` —— **行为零变化**,只是给 driver 开了第二扇门
  (原注释"driver owns the loop, the SSE layer owns the wire"的设计意图落地);
  `messages:stream` 的 wire 逐字不变。
- **新面**:\`src/api/shadow/agui.rs\` + 端点 \`POST /shadow/v1/conversations/{id}/ag-ui:stream\`
  (同一道 require_shadow_key 门、同一个 driver、wire 说 AG-UI:camelCase + UPPER_SNAKE type、SSE 只发 data:)。
- **请求面**:untagged 双形 —— AG-UI \`RunAgentInput\`(messages[] 只取**最后一条 user**、平铺 tools 包回
  OpenAI 壳、无 user 文本**响亮拒绝**)或现有 \`SendMessageRequest\`(容忍);RunAgent 体一律
  \`may_wait=false\` —— AG-UI 客户端不认识 \`/tool-results\` 旁路 ⇒ 大脑不能等一个永远不会应答的设备。
- **翻译层**:§6a 逐行落地,含两处"不硬套语义":lobe 工具结果 → \`CUSTOM(telencephalon_tool_result)\`
  (**不是** TOOL_CALL_RESULT —— 那是客户端回传语义,判据里有负控钉死);\`RUN_ERROR\` 的 runId 进
  \`metadata\`(schema 闭合,不塞不存在的字段);非 COMPLETED 收口如实进 metadata。
- **判据 9 条**:run 首尾配对 / 非 COMPLETED 如实 / 文本段三连 / 工具三连带 parentMessageId /
  工具结果负控 / 进度事件 CUSTOM 兜底静默 / 最后一条 user 消息 / tools 包壳 / 空输入响亮拒+双形解析。
- **读数**:\`cargo test --lib api::shadow\` **79 过 / 0 红**(42 影子模块 + 9 适配层新判据 + http_tests 全绿);
  真变异(CUSTOM→TOOL_CALL_RESULT)当场红(8 绿 1 红,只红负控那条)⇒ 还原后 sha256 与主树**逐字一致**、复跑绿。
- **闸**:state-surface / client-endpoint-map **绿**;六道红闸(endpoint-matrix / failure-masking /
  secret-plaintext / replacement-chars / gate-discipline / legacy-residue)**零命中本刀文件** ⇒ 存量基线,按纪律不代修、不销账。
- **承载级判据已落地(2026-11-16,端脑 `http_tests.rs`)** —— ⚠️ **这一格不需要假 lobe**:验的是
  「**装配之后的那张面**」,四件事全在**碰到叶区之前**就能验 —— ❶ 门(什么凭据都不带 ⇒
  **401**)/ ❷ 响亮地拒(只有 assistant 消息 ⇒ **400**,不是静默空转)/ ❸ 请求体被认(⇒ 落到
  「会话不存在」**404 + code 4040**,证明 ❷ 的 400 不是「根本没路由」的兜底)/ ❹ **负控**
  (不存在的路由 ⇒ 404 但**不是**我们那条的形状 ⇒ ⇒ 400/404 各有出处)。读数:**1 条绿**
  (真起 TCP 监听 ＋ 真 HTTP 客户端,`.no_proxy()` 直连)。
  ⚠️ **这一格也有真变异**:把路由改名(`ag-ui:stream` → `ag-ui:stream-MUTATED`)⇒ ⇒
  承载级判据**当场红**(❷ 拿到 404 而不是 400)⇒ ⇒ 证明它真的在盯那张路由、不是恒绿 ⇒ ⇒
  还原后 sha256 逐字核对、**推 mtime**(cargo 会复用变异期的旧二进制)⇒ ⇒ 复跑
  `cargo test --lib api::shadow` **80 过 / 0 红**(79 ＋ 承载级那条)。
- **台账**:端脑 U+332C(㌬)条已落库(commit `49dbc3b`,blob 只提交 HEAD ＋ 我这条 ⇒ ⇒
  兄弟在飞的 AGENTS.md 改写零卷入)。
- **仍欠**:「**跑通一次对话**」(过 A2A 那一跳)—— synapse A2A v1.0 升级在飞、wire 未定型 ⇒ ⇒ 暂缓;
  移动/桌面客户端接入 \`ag_ui\` Dart 包(§6 选项 A 的真正红利);AG-UI 工具闭环(客户端回传面)。

### 6d. 工具闭环已接上(2026-11-16,端脑单仓)

- **取证**:AG-UI 1.0 的 `ToolMessage` 形状 = `{ id, role:"tool", content, toolCallId, error? }`
  (`RunAgentInput.messages[]` 的元素就是 `Message`,按 role 区分的 oneOf,**含 `ToolMessage`**)
  ⇒ ⇒ 客户端回传是**协议规定**的动作;⚠ **它不带工具名**(规范原文:*it carries no name*)
  ⇒ ⇒ 名字只能由**服务端自己记**。
- **缺口(以前)**:适配层只取**最后一条 user 消息** ⇒ ⇒ `role=tool` 的消息被**静默丢掉**
  ⇒ ⇒ 设备工具的结果**永远进不了大脑** ⇒ ⇒ 闭环是断的(失败长得像成功:客户端明明回传了,
  服务端这边毫无反应)。
- **落点**:
  - **分段**:按「最后一条 user 消息」把工具回传分成 **尾部**(续轮)与**中段**(先落账)——
    AG-UI 客户端每轮重发**全量** `messages[]` ⇒ ⇒ 「新的」只能相对最后一条用户消息而言。
  - **名字**:driver 在 announce 客户端工具调用时记「`toolCallId` ⇒ 工具名」(`ToolCalls` 记忆表,
    上限 1024 条,满了丢最老的);查不到 ⇒ **用 `toolCallId` 当标签,绝不编一个工具名**
    (编了会让模型以为它叫过一个它没叫过的工具)。
  - **落账**:中段 ⇒ 写进会话历史,文本与 `/tool-results` 旁路**同一种**
    (`[tool_result] {name} → ok|failed: {payload}`)⇒ ⇒ 大脑下一轮看得见;落过的**不重复落**
    (`recorded` 标记 —— 客户端每轮重发全量 `messages[]`,不去重历史会涨成噪音)。
  - **续轮**:尾部 ⇒ 把结果**接着**喂回模型(driver 的 `tool_continuation`:turn_text 变成工具结果 ＋
    `continuation=true` ⇒ 叶区**不会重跑本体工具**)⇒ ⇒ 与设备回传续轮**同一条路**。
  - **失败不许长得像成功**:AG-UI 的 `error` 在场 ⇒ ⇒ 状态就是 `failed`。
- **判据 5 条**:工具回传被认且**按「最后一条 user 消息」分段** / 没有 `toolCallId` **不编** /
  **失败读成 failed** / 查不到名字**用 id 且不编造** / 记忆表**记住名字**且落过账的**记得落过**。
- **读数**:`cargo test --lib --no-default-features --features flow,dm-rules,turso api::shadow`
  **97 过 / 0 红**(隔离树裁剪档);**四道真变异当场红**(段位 / 编名字 / 失败读成 ok / 记忆表不记)
  ⇒ ⇒ 每次还原后 sha256 逐字一致 ＋ 推 mtime。
- ⚠️ **仍欠**:「**真模型真的读得到那份工具结果**」要过 A2A 那一跳 ⇒ ⇒ A2A v1.0 的 wire 正在迁移
  ⇒ ⇒ 现在跑**必假红** ⇒ ⇒ **driver 续轮那一段没有端到端读数** —— 本节只钉住**请求面**
  (分段/名字/失败/去重/记忆)。

### 6e. 承载级读数补上:整条链真的走了一遍(2026-11-16,端脑单仓)

- **缺口(以前)**:§6d 之后仍欠「**跑通一次对话**」那一格 ⇒ ⇒ 原计划用**假 lobe ＋ HTTP**
  ⇒ ⇒ 但那一跳要过 `LobeClient::Http`(JSON-RPC)⇒ ⇒ 而 lobe server(`build_a2a_router`)
  **只收 REST** ⇒ ⇒ 形状从**未对上** ⇒ ⇒ 现在钉它**必假红**。
- **这一刀改走原生叶区**:`NativeLobeRegistry::with_lobe`(`#[cfg(test)]` ⇒ ⇒ **只在测试编译期
  存在** ⇒ ⇒ 生产二进制里没有这条入口)⇒ ⇒ driver 对原生叶区是**同进程**派发
  ⇒ ⇒ **没有 wire** ⇒ ⇒ 验的是「请求面 → driver → 叶区 → 事件 → AG-UI 翻译 → SSE」**这一整条**,
  **不含** A2A。⚠️ 「原生叶区 ≠ 假 lobe ＋ HTTP」—— 前者绕过 wire,后者踩在 wire 上。
- **判据(1 条,承载级)**:`the_agui_endpoint_really_runs_a_turn_and_speaks_agui` —— **真起 TCP、
  真打 HTTP**:❶ 事件序列逐字 = `RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT ×2 →
  TEXT_MESSAGE_END → RUN_FINISHED`;❷ 首尾**同一个 runId**;❸ 一条消息**同一个 messageId**;
  ❹ 两段 delta **原文**;❺ 这一轮**真的落账**(盘上两条历史)。
- **读数**:`cargo test --lib --no-default-features --features flow,dm-rules,turso api::shadow`
  **98 过 / 0 红**(隔离树裁剪档)＋ **五道真变异当场红且只红那一条判据**(序列少一段 / Done 带另一个
  runId / 不落账 / 每个 delta 另开一段 / delta 发空串)⇒ ⇒ 每次还原后 sha256 逐字一致 ＋ 推 mtime。
- ⚠️ **仍欠**:「**真模型真的读得到那份工具结果**」**逐字仍然欠着** ⇒ ⇒ 真叶区(走 A2A)那一跳
  **仍未验** ⇒ ⇒ 「真模型那一格」没有读数。

### 6f. 1.0 合规补正:producer 必须声明版本 ＋ outcome 不许缺省成成功(2026-11-16,端脑单仓)

- **取证**:AG-UI **1.0** 规范(`docs.ag-ui.com/spec/1.0/schema.md` 与 `basic/versioning.md`)
  逐字 —— ❶ `RunStartedEvent` 有 **`protocolVersion`**(optional),规范原文:*"A 1.0 producer MUST
  declare the protocol version it speaks on RUN_STARTED"* ⇒ ⇒ **缺它 = 被认成 pre-1.0 producer**。
  ❷ `RunFinishedEvent` 有 **`outcome`**(optional),成员只有 `success`/`interrupt`/`cancelled`;
  规范原文:*"an absent outcome means success"* ⇒ ⇒ **不带 outcome = 成功**。
  ❸ 版本化页原文:*"the run's outcome ... MUST travel in the fields the schema describes for them,
  never only in a new event type or a new property that an older consumer will drop."*
- **缺口(以前)**:❶ 我们的 `RUN_STARTED` **没有** `protocolVersion` ⇒ ⇒ 客户端把我们当 pre-1.0。
  ❷ 非 `COMPLETED` 的收口状态塞在 **`metadata.telencephalonState`** ⇒ ⇒ 1.0 客户端按
  「outcome 缺省即 success」⇒ ⇒ **把它读成成功** ⇒ ⇒ **失败长得像成功** ⇒ ⇒ 而且这**正是规范
  明文禁止**的那种做法(把已有位置的语义搬进新属性)。
- **补正**:❶ `RUN_STARTED` 带 `protocolVersion`(值取自官方 TS SDK 的常量 —— `@ag-ui/core` 包里的
  `agui.protocolVersion` ⇒ `"1.0"` ⇒ ⇒ **不手打**);❷ 成功轮 ⇒ **整个 `outcome` 字段都不带**
  (缺省即 success ⇒ ⇒ 也不许塞 `{"type":"success"}`);❸ 非成功轮 ⇒ 带
  `outcome: {"type":"cancelled"}` ＋ 端脑原状态**仍留** `metadata` ⇒ ⇒ 我们**不产** AG-UI 的
  `interrupt`(那要 `interrupts` 数组,我们没有这个概念)⇒ ⇒ 只发 schema 描述过的值
  (规范:*MUST NOT* 发明别的 outcome 值)。
- **判据(改口径 ＋ 新增断言)**:旧判据「非 COMPLETED ⇒ 状态在 metadata」**口径变了** ⇒ ⇒ 改成
  「非 COMPLETED ⇒ **有** `outcome` 且 `type == "cancelled"` ＋ metadata 仍带原状态」;新增
  「`RUN_STARTED` 带 `protocolVersion`」与「成功轮**没有** `outcome` 字段」两条断言。
- **读数**:**98 过 / 0 红** ＋ **三道真变异当场红且只红目标判据**(outcome 改成 success ⇒ ⇒
  「失败长得像成功」那条当场红 / 去掉 `protocolVersion` ⇒ ⇒ 声明那条当场红 / 版本号手打成
  `"1.0.0"` ⇒ ⇒ 声明那条当场红)。
- ⚠️ **仍欠**:Dart 侧 `ag_ui` 0.3.0 认不认 1.0 的事件名(`TEXT_MESSAGE_START/CONTENT/END`)
  **未验** ⇒ ⇒ 那是**客户端**那一格 ⇒ ⇒ 属客户端接入那一刀。

## 7. 未核实清单(据实)

- AG-UI 官方 a2ui-middleware / a2ui-toolkit 的桥接实现未逐行读(A2UI 载荷最终走 TOOL_CALL_RESULT
  还是 CUSTOM 事件,以读码为准)。
- ag_ui Dart 包(pub,^0.3.0)未实际引入编译验证;其 defaultHeaders 能否做"请求时现读钥匙"
  (我们 ShadowKeySseTransport 的时序要求)未验。
- ✅ **已核实(2026-11-16,端脑源码逐字)**:工具等待超时(`wait_for_device` ⇒ `None`)时
  **SSE 面上根本不发 `tool_result` 事件** ⇒ ⇒ driver 合成一个**失败**的
  `ToolOutcome`(`{"error":"the device did not report back within N seconds"}`)⇒ ⇒ 走
  **带内续轮**(再喂回叶区)⇒ ⇒ 原先"推断同 E5"的猜测**是错的** ⇒ ⇒ AG-UI 适配层
  **不需要**为它做映射(它根本不是一个事件)。
- ⚠️ **半闭**:route/handoff 的**形状**已逐字确认(route: supervisor/target/reason;
  handoff: from/to/context_size)⇒ 但在真机流量里的**实际出现频率**仍未测
  (E7/E8 的映射优先级取决于此)⇒ ⇒ 仍欠一次真流量读数。
- ✅ **已核实(2026-11-16,端脑源码逐字)**:clarification **不在端脑 `messages:stream` 面上**
  —— 端脑全仓只有 `src/visual_qa/clarify.rs`(类型)与 `src/visual_qa/router.rs`(`Clarify`
  变体)两处 ⇒ ⇒ 都是 **visual_qa 的内部类型**,不是 SSE 事件变体 ⇒ ⇒ 它挂在 **cortex
  侧** chat reply 的 `metadata.shadow.clarification` 上(影仓 spec
  `2026-08-26-cortex-visual-qa-router-design.md:190`)⇒ ⇒ **AG-UI 适配层不需要为它做映射**
  ⇒ ⇒ **G4「clarification 升舱」的前提不成立** —— 那是**另一条面**(cortex visual-qa)的
  形状问题,不是端脑 SSE 面的缺口。
- ✅ **已核实(2026-11-16,AG-UI **1.0** 规范原文)**:`TEXT_MESSAGE_CHUNK` 在 1.0 里**不是**退休形状
  —— 它是「紧凑写法」,规范原文:*"A consumer MUST expand chunks into the three events above"*
  ⇒ ⇒ 我们发 `TEXT_MESSAGE_START`/`CONTENT`/`END` 三连**正是规范主形** ⇒ ⇒ 不用改。
- ✅ **已核实(2026-11-16,npm 逐包 HEAD ＋ 官方文档 SDK 目录)**:AG-UI **官方没有** React 组件包
  —— `@ag-ui/react` / `@ag-ui/react-hooks` / `ag-ui` / `@ag-ui/agent` 全部 **404**;官方 JS 只有
  `@ag-ui/core` / `@ag-ui/client`(latest 1.0.4)/ `@ag-ui/encoder` / `@ag-ui/proto` ⇒ ⇒ 官方文档的
  SDK 目录里 JS **没有 React 页** ⇒ ⇒ **桌面端的 React 绑定要自己写**(几十行 hooks)。
- ✅ **已核实(2026-11-16)**:React 组件库**是 CopilotKit 那套**(`@copilotkit/react-ui` ＋
  `@copilotkit/react-core`)⇒ ⇒ AG-UI 本就是 CopilotKit 牵头、和 LangGraph 一起做的协议 ⇒ ⇒ 一家的;
  但它绑自己的 `CopilotKitProvider` ＋ runtimeUrl ＋ agent 抽象 ⇒ ⇒ 与影仓「会话史在服务端、
  自己写 driver」的架构**正面冲突**,且组件文案**英文硬编码**(影仓桌面端是 en-US/zh-CN 双语)
  ⇒ ⇒ **结论:不整体搬** —— 协议层用 `@ag-ui/client`,组件用影仓**自己的** shadcn/ui
  (`shadow-desktop/components.json` 已在:tailwind ＋ cssVariables ＋ `@/components/ui` 别名)。
- ✅ **已核实(2026-11-16)**:**Dojo 不是组件库** —— 它是仓库里的 `apps/dojo`(Next.js ＋ CopilotKit)
  ⇒ ⇒ 官方文档对它的定位是「一组 hello-world 尺寸的演示」,用法是当**实施清单**
  (*"Using the Dojo as an Implementation Checklist"*)⇒ ⇒ **当对照测试集用,不当组件包 import**。
- ⚠️ **仍欠**:`ag_ui` Dart **0.3.0**(社区 SDK;官方 SDK 目录只有 python/dotnet/js)认不认协议 **1.0**
  的事件名与形状 ⇒ ⇒ **未验** ⇒ ⇒ 那属**客户端**那一刀 ⇒ ⇒ 也是移动端「自己实现」那一刀的前置。
