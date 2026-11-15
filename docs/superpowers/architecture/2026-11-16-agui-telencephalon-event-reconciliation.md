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

## 7. 未核实清单(据实)

- AG-UI 官方 a2ui-middleware / a2ui-toolkit 的桥接实现未逐行读(A2UI 载荷最终走 TOOL_CALL_RESULT
  还是 CUSTOM 事件,以读码为准)。
- ag_ui Dart 包(pub,^0.3.0)未实际引入编译验证;其 defaultHeaders 能否做"请求时现读钥匙"
  (我们 ShadowKeySseTransport 的时序要求)未验。
- 端脑 `messages:stream` 在"工具等待超时"(wait_for_device,None 分支)时发的 tool_result 形状
  未逐字取证(推断同 E5)。
- route/handoff 事件在真机流量里的实际出现频率未测(E7/E8 的映射优先级取决于此)。
- clarification 事件是否也出现在 messages:stream(还是只在视觉 QA 自己的通道)未逐字确认,
  移动端注释称其为 "telencephalon stream event of type clarification"。
