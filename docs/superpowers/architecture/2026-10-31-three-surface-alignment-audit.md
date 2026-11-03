# 三端功能清单对齐审计 —— 客户端 × 服务端重新审视

> 2026-10-31 · 承接《对话为主的两端 IA 评估》（2026-10-29）与《跨端视觉语言》《跨平台设计系统》
>
> **前提**：Shadow 是**同一个 agent 的两个终端**（桌面 / 移动）加**一个大脑**（端脑 telencephalon）。
> 目标不是「每个功能都做两遍」，而是**同一个能力在两端同名同语义、且与服务端真实能力对得上**。
>
> **方法**：不沿用旧审计结论，全部重新实测 ——
> ① 实跑 `node scripts/check-agent-surface.mjs`；② 直接 grep 两端路由表、导航生成物、服务端 `src/api/**` 路由；
> ③ 逐条比对「清单 ↔ 两端路由 ↔ 两端实际 HTTP 调用面 ↔ 服务端路由面」。
> 文中每条结论都带 `file:line` 证据。

---

## 0. 先说结论

**旧审计（10-29）的批次 1/2/3 已经落地，批次 4/5/6 仍待做。**
但重新实测后发现：真正的问题**不在导航层，而在数据层**。

| # | 结论 | 严重度 | 详见 |
|---|---|---|---|
| **A1** | **两端同名「任务看板」读写的是两份不同的存储** —— 桌面=hippocampus（持久化+租户隔离），移动=端脑进程内存（无租户、重启即失） | 🔴 严重 | §3 A1 |
| **A2** | **两端同名「技能 / MCP」读写的是两份不同的存储** —— 桌面走服务端，移动走本地 SQLite | 🔴 严重 | §3 A2 |
| **A3** | **「能力回到对话」（旧批次 4）两端都还没做** —— 对话里调不起任何能力 | 🔴 严重 | §3 A3 |
| **A4** | **能力清单已经名不副实** —— 33 条能力里 12 条两端导航都不出现；`requires` 字段 0 条使用；声明的两个 consumer 文件**都不存在** | 🟠 中 | §2.2 |
| **A5** | **桌面端设置仍是 9 个平铺 section**，移动端已改 4+1 组 —— 两端设置结构不对等 | 🟠 中 | §1 |
| **A6** | **桌面端三处硬编码 `localhost:60080`，绕过可配置的 baseUrl 通道** —— 用户在设置里改了端脑地址，这三页仍打老地址 | 🟠 中 | §7 A-3 |
| **A7** | **服务端能力面（manifest/capabilities）两端都没有消费者** ⇒ 清单里「运行时不可用要标灰」这条规则两端都做不到 | 🟠 中 | §5.1 |
| **A8** | 两端**客户端工具注册表**没有任何守卫，尽管源码注释要求「同名工具必须导出同样的内容」 | 🟡 低 | §6 缺口⑤ |
| **A9** | **同一个 `/shadow/v1/identity` 端点，两端的安全语义相反** —— 桌面端受 `X-Shadow-Key` 保护，手机端**完全敞开**（能改「这台机器是谁」的接口在手机上裸奔） | 🔴 严重 | §3 A9 |
| **A10** | **移动端整条「模型反问用户」链路缺失** —— `ask_user` 工具只有桌面端有；移动端 `ToolCallStatus` 连 `awaitingInput` 状态都没有 ⇒ 模型在手机上**根本调不出「反问用户」** | 🔴 严重 | §3 A10 |
| **A11** | **桌面端端脑连接配置「改了不生效」** —— 改完地址/填完 key，**重启后失效**；且 key 从来没同步给 client ⇒ 端脑一开 key 保护，桌面端**全量 401** | 🔴 严重 | §3 A11 |

> 📌 **编号约定**：**A1/A2/A3/A9/A10/A11 有独立章节**（在 §3），**A4–A8 是横切结论**（分散在各章，已给出指引）。
> 本轮**已修**：A-1 / A-2 / A-3 / A-4 / A-5 / A-6 / A-7 / A-8（见 §7 批次 A 的状态列）。


---

## 1. 旧审计的落地情况（实测复核）

| 批次 | 内容 | 状态 | 证据 |
|---|---|---|---|
| 1 | 桌面端默认落地页改对话 | ✅ **已落地** | `App.tsx:82` `<Route index element={<Navigate to="/conversation" replace />} />` |
| 2 | 导航分组 + 导航由 `agent-surface.json` 生成 | ✅ **已落地** | 侧栏 4 段：`Layout.tsx:66` 渲染 `desktopNav.sections`；生成物 `shadow-desktop/src/navigation/nav.g.ts` |
| 3 | 设置瘦身（桌面 9→3 / 移动 18→4） | 🟡 **一半** | 移动端已改 4+1 组（`settings_screen.dart:138,166,185,210,276,373`）；桌面端仍是 **9 个平铺**（`SettingsPage.tsx:36-49`） |
| 4 | 能力回到对话 | ❌ **未做** | 桌面 `ConversationPage.tsx:742-746` 只有 2 个预填按钮；两端 grep `slash`/`skill`/`mcp` 在对话组件内**零命中** |
| 5 | 能力对齐（两端补齐） | ❌ **未做** | 见 §4 差异表 |
| 6 | `setup` 接线 | ❌ **未做** | `setup_wizard_screen.dart` 有文件、**路由表零引用** |

> ⚠️ **口径更正**：旧审计 F1（默认落地页不是对话）说桌面端 `/` 是任务看板 —— **这句现在不成立**，
> 代码已改。引用旧结论时要注意这一点。

---

## 2. 当前的真实测绘

### 2.1 能力清单 `agent-surface.json`（仓根，唯一映射表）

- **32 条能力**，5 组：`converse` / `work` / `capability` / `tools` / `ops`
- 桌面导航 **19 项**（4 段：对话 1 + 工作 2 + 能力 8 + 更多 8，footer 1），移动 **4 tab**
- 校验脚本实跑：**阻断 0 / 提示 1 / 信息 3**
  ```
  桌面端路由 26 条，移动端路由 30 条，清单能力 32 条
  生成物同步：4 个目标，0 个过期
  导航生成物同步：2 个目标，0 个过期
  ! 移动端路由 "/settings/identity" 没有在 agent-surface.json 里登记
  ```

### 2.2 但清单已经名不副实（A4）

| 事实 | 证据 |
|---|---|
| **32 条能力里 12 条两端导航都不出现**：`conversations` `voice` `livestream` `customer-service` `document` `agents` `model-download` `model-onboarding` `model-settings` `provisioning` `setup` `prefrontal-embedded` | 清单 `navigation` 段（对话形态与二级入口本就不在导航里，但清单把它们混在同一张表里，**分不出「有意为之」与「忘了做」**） |
| **`requires` 字段 0 条使用** | 清单 `_meta.rules` 写着「requires 声明该能力依赖哪个 lobe/skill，运行时不可用时两端都要能标灰」，但 32 条能力**没有一条**填了它 |
| **清单声明的两个 consumer 文件都不存在** | `_meta.consumers` 写 `shadow-desktop: src/lib/agentSurface.ts`（← **不存在**）、`shadow-mobile: lib/services/agent_surface.dart`（← **不存在**） |
| **实际只有导航生成器在消费它** | `scripts/lib/nav.mjs` → `nav.g.ts` / `nav.g.dart`；运行时能力可用性**没有任何一处**读它 |

⇒ **清单目前只是一份「导航生成源」，不是「能力清单」。**
它挡住了路由漂移（这点做得对），但挡不住语义漂移、数据源漂移、命名漂移。

---

## 3. 三处必须优先修的「同名不同实现」

这三处是本次审计最实质的发现：**用户看到的名字一样，底下的东西完全不是一回事。**

### A1 · 任务看板 —— 两端两份存储 🔴

| | 桌面端 | 移动端 |
|---|---|---|
| 数据源 | `prefrontalClient.listTasks(tenant)` → `GET /hippocampus/api/tasks` | `GET /api/telencephalon/tasks` |
| 租户隔离 | ✅ 按 `useIdentityStore.resolve()` 的租户读写 | ❌ **不传租户** |
| 持久性 | hippocampus 落盘 | 端脑**进程内存**，重启即失 |
| 写入能力 | list/get/update/delete | list/create/status/confirm/delete |
| UI 结构 | 本地看板（`taskBoardStore`）+ **额外挂一段**「海马体任务」（`CortexTaskSection`） | 只有端脑任务 |

证据：`shadow-desktop/src/stores/taskBoardDataStore.ts:72-77`（先解析租户再 list）、`:134`（删除也带租户，「别删到别人的桶里去」）；
`shadow-mobile/lib/screens/task_board_screen.dart:11-23`（**注释明写**此前走 hippocampus 在手机上必然失败，已改走端脑方言）、`:195` `listTasks()` 无租户参数；
`shadow-mobile/lib/services/telencephalon/telencephalon_client.dart:1275` 注释：「任务存在端脑进程内存里 —— 进程重启就没了」。

⇒ **后果**：手机上建的任务，电脑上看不见；电脑上建的任务，手机上看不见。
用户在「同一个 agent 的两个终端」前提下会直接感知为 bug。**而且移动端那份是易失的**。

### A2 · 技能 / MCP —— 两端一份服务端、一份本地库 🔴

| | 桌面端 | 移动端 |
|---|---|---|
| 技能 | `GET /api/skills`（服务端） | **本地 SQLite**（`SqliteSkillRepository`） |
| MCP | `GET/POST/DELETE /api/telencephalon/admin/mcp/servers` | **本地 SQLite**（`SqliteMCPServerRepository`） |

证据：`shadow-mobile/lib/screens/skills_screen.dart:12-13` `RepositoryFactory.createSkillRepository()`；
`shadow-mobile/lib/screens/mcp_screen.dart:12-13` 同理；
`shadow-mobile/lib/services/database/repository_factory.dart:36` → `skill_repository.dart:8` `SqliteSkillRepository`（注释：「Used as temporary local storage before Neon migration」）。

⚠️ 注意：移动端**客户端类**里其实**已经有**完整的端脑 MCP CRUD
（`telencephalon_client.dart:1090-1192`：list/get/tools/create/delete/start/stop/bind），
**但 MCP 界面没调用它** —— 界面连的是本地库。⇒ 这不是「做不了」，是**接错了源**。

⚠️⚠️ **后果比「不一致」更重 —— 两端 MCP 配置互不可见**（本轮实测确认）：
- 移动端 `mcp_server.dart` / `skill_repository.dart` 两个仓储里**零 HTTP 调用、零同步逻辑**
  （对这两个文件 grep `http|client|telencephalon|api` ⇒ 零命中）⇒ **纯本地，永不上行**；
- 桌面端 `MCPPage.tsx:86` 只读 `telencephalonClient.listMcpServers()` ⇒ **只读服务端**。

⇒ **在手机上注册的 MCP server，电脑上根本不存在**；反之亦然。
对「同一个 agent 的两个终端」这个前提来说，这是**能力面完全分叉**，不是设置项不同。

### A3 · 能力回到对话 —— 两端都没做 🔴

| | 桌面端 | 移动端 |
|---|---|---|
| 对话内能力入口 | ❌ 空态只有 2 个预填按钮（`helpWithTask` / `whatCanYouDo`） | ❌ grep `slash`/`skill`/`mcp` 零命中 |
| 对话形态切换 | ✅ `ConversationModeSwitcher`（对话/语音） | ✅ `conversation_mode_switcher.dart`（对话/语音/直播/客服） |
| 工具卡片 | ✅ `ToolCallMessageCard` → `ToolPartRouter` → 审批/表单/输出 | ✅ `tool_call_card.dart` |

⇒ **形态切换做了，能力调用没做。**
MCP / skills / flows / memory 至今**只能**是「目的地」：要离开对话、去别的页、手动操作、再切回来。
这与「对话为主」的直接冲突，也是旧审计 F4 指出的根因 —— **它仍然是根因**。

### A9 · 同一个身份端点，两端安全语义相反 🔴

**这是本轮新增的一条轴**：前面 A1/A2/A3 说的都是「功能对不对等」，这条是「**同一个入口，两端的准入条件相反**」。

| | 桌面端 | 移动端（真机实测） |
|---|---|---|
| `/shadow/v1/*` 鉴权 | ✅ 走 `X-Shadow-Key` 中间件 | ❌ **完全敞开** |
| `POST /shadow/v1/identity`（= 导入账号 = **换掉「这台机器是谁」**） | 裸奔会 403 | **裸奔会 200，当场换人** |
| 配置来源 | 有配置文件、有 key | **Android 进程设不了环境变量 ⇒ 读不到配置文件** |

**机制（本轮独立核实，非转述）**：

1. 端脑的配置只从环境变量 `TELENCEPHALON_CONFIG`（兼容 `CORTEX_CONFIG`）指向的文件读 ——
   `telencephalon/src/boot.rs:72-92`：读不到就用 `TelencephalonConfig::default`。
2. `shadow.api_key` 的默认值是**空串** ——
   `telencephalon/src/config/schema.rs:31-35`：「When empty (default), the shadow API is open (development mode)」。
3. 中间件 `require_shadow_key` 的判定：key 为空 ⇒ **直接放行** ——
   `telencephalon/src/api/shadow.rs:1471-1479`；该中间件挂在整个 shadow 面上（`shadow.rs:89-92`）。
4. Android 进程由 zygote 启动，宿主**注入不了环境变量** ⇒ 手机上的端脑**没有配置文件** ⇒ key 为空 ⇒ 开发模式。
5. 桌面端则是配了 key 并**主动带上**：`telencephalonClient.ts:561-562`、`:630`、`:764` 三个请求点都加 `X-Shadow-Key`；
   Tauri 侧 `identity_import` 也显式带（`src-tauri/src/lib.rs:605-617`，注释明写
   「身份端点挂在 shadow 面上，**跟着 `X-Shadow-Key` 一起受保护**（能改『这台机器是谁』的接口不能裸奔）」）。

⇒ **这正是「同名同语义」原则在安全维度上的失守**：
同一个 `/shadow/v1/identity`，桌面端是「受保护的写入口」，手机端是「**本机任意进程都能换掉这台机器是谁**」。
后果：手机上**别的 App** 能把影子换成另一个人格 ⇒ 记忆被改写进另一个人格、旧人格的记忆「看起来消失了」，
**且没有任何报错**（静默、可逆、但用户无感知）。
⚠️ 读不到账号密钥 —— 导出刻意不在 HTTP 面上（`shadow.rs` 注释「导出刻意不在这里」）⇒ **密钥这条不变量还在**。

⚠️ **修法不是一行**（已知的三仓原子改动）：
`telencephalon` 加 `BuildOptions.shadow_api_key` ⇒ `encephalon` 传下去 ⇒ 移动端 Dart 侧 `setApiKey` 并每次请求带上。
⚠️ **必须原子完成** —— 只改 Rust 侧而 Dart 侧没带上 key，手机上 App 的身份解析会**直接 401**
⇒ 静默退回 `default` 桶 ⇒ 手机与桌面**就不是同一个人了**。

### A10 · 「反问用户」这条路径，移动端整条缺失 🔴

**先分清三样东西**（本轮核实，它们**不是**同义词，只是目的重合）：

| | 是什么 | 谁决定「问什么」 | 答案形态 | 桌面 | 移动 |
|---|---|---|---|---|---|
| **`ask_user`**（客户端工具） | 模型自己调一个工具来问 | **模型** | 开放式自由文本 | ✅ **真正可用** | ❌ **零** |
| **`clarification` 事件**（视觉 QA） | 服务端事件：让用户从**枚举出的候选**里挑一个（摄像头源等） | **系统** | 从有限集合里点选 | ⚠️ **预留钩子**（端脑还没发这个事件） | ⚠️ **预留钩子**（同上） |
| **`AgentClarificationDialog`** | 多问题问卷（固定选项 + 自由作答 + 可跳过） | **系统** | 问卷 | ⚠️ **零引用死代码** | ❌ 无 |

**「反问用户」≠「需求澄清」**：`ask_user` 是**模型主导**（它想问什么它自己说），
`clarification` / 问卷是**系统主导**（系统知道有哪些选项）。
但产品目的重合 —— 都是「模型不确定 ⇒ 去问人」。

⚠️ **桌面端那两套「澄清」是死的**：
- `clarification` 分支的注释自己写着 ——「The telencephalon wire **does not yet emit 'clarification' events**; this branch is a desktop-side hook for a future flow」（`ConversationPage.tsx:413-416`）；
- `AgentClarificationDialog` **全仓零引用** —— 只有组件本身和它自己的单测
  （`src/lib/__tests__/AgentClarificationDialog.test.tsx`）。

⇒ **所以「真正活着的『问用户』路径，两端都只有 `ask_user` 这一条」** ——
桌面端有、移动端没有。移动端那个 `VisualQaClarificationChip` **不算**（依赖端脑发事件，而端脑还没发）。

**移动端缺的四环，一环都不在**：

| 环节 | 桌面端 | 移动端 |
|---|---|---|
| 工具注册 | ✅ `ask_user`（`clientTools.ts:212-233`） | ❌ **零命中**（全仓 grep `ask_user` 无结果） |
| 「要用户补输入」这个声明 | ✅ `collectsInput?: boolean`（`clientTools.ts:35`） | ❌ `ClientTool` **没有这个字段**（`client_tool_registry.dart:44-50`） |
| 工具状态机 | ✅ `awaiting-input`（`ConversationPage.tsx:499-502`） | ❌ `ToolCallStatus` **没有 `awaitingInput`**（只有 pending/running/awaitingApproval/succeeded/failed） |
| 卡片上的输入表单 | ✅ `ClientToolForm` | ❌ `tool_call_card.dart` 只有「同意 / 拒绝」两个按钮 |

证据：桌面 `src/lib/clientTools.ts:212`（注册）、`:35`（`collectsInput`）、`src/pages/ConversationPage.tsx:499-502`（转 `awaiting-input`）；
移动 `lib/services/client_tools/client_tool_registry.dart:44-50`（`ClientTool` 构造参数**没有** `collectsInput`）、
`:68-79`（`ToolCallStatus` 五个状态，**没有** `awaitingInput`）、
`lib/widgets/chat/tool_call_card.dart:107-136`（只渲染批准/拒绝按钮）。

⚠️ 服务端对 `ask_user` **没有任何特殊处理** —— 它只是普通客户端工具，端脑透传给模型，
由**模型自己**决定要不要调（`telencephalon/src/tools/agent_loop.rs:1452` 只在测试里出现过这个名字）。
⇒ 这条路径**不需要服务端配合**，移动端补齐是**纯客户端工作**。

⇒ **后果**：同一个模型，在电脑上可以反问用户「你要哪个方案？」然后拿答案接着说；
在手机上它**没有这个工具可调** ⇒ 只能自己瞎猜或直接放弃。
**这正是「同一个 agent 的两个终端」最核心的那个承诺被打破的地方。**

✅ **本轮已加守卫**（§6 缺口⑤已闭合）：`scripts/check-client-tools.mjs` 比对两端**发给模型的那份** tools。
当前把这条登记为 `known-gap`（**警告，不阻断**）⇒ 缺口留在视野里、不会被「加豁免」悄悄抹掉。

💡 **好消息**：补齐移动端**不必照搬桌面端的三套** —— 只要把 `ask_user` 这一条在两端做成同形即可。
（桌面端另外两套是预留/死代码，见批次 A-7。）

### A11 · 桌面端端脑连接配置「改了不生效」—— 两个独立的静默失效 🔴

**这一条是本轮改 A-3/A-4 时撞出来的**，不在原审计计划里 —— 但它比硬编码更隐蔽。

| # | 症状 | 根因 | 后果 |
|---|---|---|---|
| **①** | 用户在设置里改了端脑地址 ⇒ **重启 App 后又打回默认地址** | `persist` 只把 `connection` 灌回 **store**，**不会**调 `setBaseUrl` ⇒ client 停在构造时的默认值 | store 里看着是对的（最迷惑的坏法），但所有走 client 的请求打错地址 |
| **②** | 用户在设置里填了 shadow key ⇒ **客户端请求不带 `X-Shadow-Key`** ⇒ 端脑一旦开启 `shadow.api_key`（非开发模式），**全量 401** | `setApiKey` **只改 store，不同步给 client**（`setBaseUrl` 一直有同步，`setApiKey` 漏了）⇒ client 的 `apiKey` 永远是 `undefined` | 症状是「配了 key 反而全挂」，极难自查 |

证据（本轮修复前）：
- `src/stores/telencephalonStore.ts` 的 `persist` 只有 `name` + `partialize`，**没有 `onRehydrateStorage`**；
- `setApiKey` 只有 `set((state) => ({ connection: {...} }))`，**没有** `telencephalonClient.setApiKey(...)`；
- `src/lib/telencephalonClient.ts` 的 `TelencephalonClient` **压根没有 `setApiKey` 方法**（只有 `setBaseUrl`）。

⚠️ **为什么今天没炸**：桌面端默认 `shadow.api_key` 是空的（**开发模式放行**）⇒ 不带 key 也能过。
⇒ **一旦端脑按 A9 加上 key（或者部署方配了 key），这两个 bug 会同时爆** ——
而且症状是「401 / 打错地址」，看起来像服务端问题，不像客户端配置问题。
⇒ **A9 落地前必须先修这个**，否则「给手机加 key」的同一套改动会先把**桌面端**打死。

✅ **本轮已修**（批次 A-8）：
- `TelencephalonClient` 新增 `setApiKey()`；
- `setApiKey` 现在同步给 client；
- `persist` 新增 `onRehydrateStorage`，恢复时把 `baseUrl` / `apiKey` **都**推给 client。

💡 **顺带一个对照**：`prefrontalClient` **没有**这个缺口 —— 它每次请求都现读
`useTelencephalonStore.getState().connection.baseUrl`（`src/lib/prefrontalClient.ts:289-293`）。
⇒ 「每次现读」比「构造时固定 + 手工同步」更不容易出错。
`telencephalonClient` 的写法是两者里较脆的那种。



---

## 4. 两端能力差异表（重新实测）

> 已裁定的前提（`agent-surface.json` `_known_divergences`）：**承认端侧专属，只保证同名同语义。**
> 下表区分「**已裁定允许**」与「**未裁定的漂移**」。

### 4.1 已裁定允许（端侧专属）

| 能力 | 桌面 | 移动 | 依据 |
|---|---|---|---|
| 电脑操作 / 编排 / 规则编辑器 / 追踪 / 产出（预览·文档） | ✅ | ❌ | `_known_divergences` |
| 直播 / 客服 | ❌ | ✅ | 同上 |
| 设备发现 | ✅(HTTP mDNS) | ✅(MethodChannel) | 实现不同、语义相同 |

### 4.2 未裁定的漂移（本轮新发现）

| 能力 | 桌面 | 移动 | 证据 |
|---|---|---|---|
| **模型删除路径** | `DELETE /v1/models/{engine}/{id}` | `DELETE /v1/models/all/{id}` | 桌面 `ModelsPage.tsx:471` / 移动 `engine_models_provider.dart:232` |
| **供应商管理面板** | `/models/providers` 全套 CRUD + test + fetch-models + auto-match | **零命中** | 桌面 `ModelsPage.tsx:246-281`、`AddProviderModal.tsx:50,69,104` |
| **per-lobe 模型路由整份下发** | ❌ 只有 `PATCH /agents/{name}/config` 单点改 | ✅ `POST /lobes/models` | 桌面 `telencephalonClient.ts:849` / 移动 `telencephalon_client.dart:853` |
| **flow 运行路径** | `POST /api/flows/by-name/{name}/invoke` | `POST /api/flows/{id}/run`（需先换名） | 桌面 `:743` / 移动 `:1043` |
| **人格（soul）编辑** | ❌ 无 | ✅ `/api/soul/*` + `soul_screen.dart` | 移动 `prefrontal_client.dart:519-579` |
| **A2A 对端委派** | ✅ `/api/a2a/*` + `DelegateToPeerDialog` | ❌ 无 | 桌面 `prefrontalClient.ts:408-442` |
| **会话导入成对话** | ❌ 无 | ✅ `/shadow/v1/conversations/{id}/import` | 移动 `telencephalon_client.dart:910` |
| **设备群组** | ❌ 无 | ✅ `/api/group/*` | 移动 `group_service.dart:157-231` |
| **前端帧的服务端观测**（丘脑/海马/neuron 预览） | ✅ 客户端方法齐全 | ❌ 零命中 | 桌面 `telencephalonClient.ts:1022-1078` |
| **ASR 语音转写** | ✅ `/voice/transcribe` | ❌ 无 | 桌面 `:944`、`voice-button.tsx:91` |
| **前端帧的任务改状态/删除** | 只有 `/confirm` | ✅ `/status` + `DELETE` | 桌面 `:985` / 移动 `:1318,1357` |

⚠️ **两端同名但语义不同**的两处最危险：

1. **任务**：桌面带租户、移动不带（A1）—— 移动端那条**根本没有租户概念**。
2. **模型删除路径**：同一个「删除模型」，两端打的 URL 不同 ⇒ 一个能删另一个 404。

---

## 5. 服务端能力面的孤儿

### 5.1 服务端有、两端都没有 UI 消费者的路由

| 服务端路由 | 语义 | 两端消费者 |
|---|---|---|
| `GET /api/telencephalon/lobes/manifest`、`/lobes/manifest/{name}` | 叶区清单（能力声明） | ❌ 无 |
| `GET /api/telencephalon/lobes/capabilities` | 能力表（llm/asr/… + 模态） | ❌ 无 |
| `GET /api/telencephalon/lobes/runtime/{name}` | 叶区运行时状态 | ❌ 无 |
| `POST /api/telencephalon/lobes/reconfigure/{name}` | 重配叶区 | ❌ 无 |
| `GET /api/telencephalon/agents/list`、`/agents/registry`、`/agents/exposed` | agent 注册表视图 | ❌ 无 |
| `GET /api/telencephalon/visual-tasks` | 视觉任务列表 | ❌ 无 |
| `POST /api/telencephalon/visual-qa/sources-broadcast` | 视觉源广播 | ❌ 无 |
| `POST /api/telencephalon/prefrontal/dispatch` | 派发给 agent | ❌ 无 |
| `GET/POST /api/telencephalon/thalamus/{sensors,push,query}` | 丘脑原始面 | ❌ 无 |
| `GET /api/telencephalon/thalamus/video/{cameras,clips,push}` | 丘脑视频面 | ❌ 无 |
| `GET /api/telencephalon/hippocampus/admin/config` | 海马体配置 | ❌ 无 |
| `GET /api/telencephalon/logs` | 端脑日志 | ❌ 无 |
| `POST /api/telencephalon/admin/test/reset` | 测试重置 | ❌ 无（合理） |

⇒ **A7**：服务端**已经**提供了「叶区能力清单 + 运行时状态」，但两端**都不读**。
所以清单里那条规则「运行时不可用时两端都要能标灰」**今天做不到** ——
不是没做 UI，是**没有数据源**。

### 5.2 桌面端有客户端方法、但 UI 只用了一半

`/api/telencephalon/thalamus/**` 全族（`listSensors` / `stats` / `tail` / `query` / `register` / `delete` / `config`）
在 `telencephalonClient.ts:1022-1054` 齐全，但 UI 只在设置页「子系统」里显示**传感器名字徽章**
（`SubsystemPanel.tsx:52-67`）⇒ **时序数据、注册、配置全无入口**。
海马体预览、neuron 预览同理（`:1059-1078`）。

⇒ **服务端给了「时间序列」，前端只画了「名字列表」。**

---

## 6. 清单守卫本身的缺口

`scripts/check-agent-surface.mjs` 现在守住的是：**路由存在性 + token 一致 + 导航生成物 + 文案 key**。
它**没有**守住的，恰好就是这轮审计发现的所有问题：

| 缺口 | 后果 | 本轮证据 | 本轮状态 |
|---|---|---|---|
| ① 不校验「同名能力两端是否同一数据源」 | A1 / A2 两处漂移都绿灯通过 | §3 | ❌ 未做（待批次 D-3） |
| ② 不校验「清单声明的 consumer 文件是否存在」 | `_meta.consumers` 指向两个**不存在**的文件 | §2.2 | ✅ **已修**（`_meta.consumers` 改指真实生成器） |
| ③ 不校验 `requires` 是否被使用 | 规则写了 32 条能力 0 条落实 | §2.2 | ❌ 未做（待批次 D-1） |
| ④ 不校验服务端路由 ↔ 客户端消费 | 服务端能力面 13 组无人消费 | §5.1 | ❌ 未做（待批次 D-1/D-4） |
| ⑤ 不校验两端客户端工具注册表内容一致 | 源码注释要求「同名工具必须导出同样的内容」，无守卫 | `clientTools.ts:143-145` / `client_tool_registry.dart:36` | ✅ **已加守卫**（见下） |
| ⑥ 未登记 `/settings/identity` | 唯一一条提示（10-31 新增身份页时漏登记） | §2.1 | ✅ **已修**（登记为 `identity` 能力） |

### 6.1 本轮新增的守卫：`scripts/check-client-tools.mjs`

**它守什么**：两端**发给模型的那份** `tools` 数组（`toOpenAiTools` 的输出形状）必须一样 ——
工具名 / description / parameters（JSON Schema）。

⚠️ **只比对「发给模型的部分」** —— `execute` 实现两端必然不同（桌面走 zustand、移动走 Riverpod），
那不是「发给模型的内容」，比了只会误报。

**怎么做到不误报**：
- 两端 key 写法不同（TS `type:` vs Dart `'type':`）⇒ 提取时**引号可选**；
- Dart 带类型参数（`<String, dynamic>{...}`）⇒ 提取时**吃掉 `<...>`**；
- key 顺序不同不算漂移（模型不关心）⇒ 比较前**规范化**；
- 提取失败会**报警告**（不是静默通过）—— 静默通过比失败更糟。

**豁免机制分两档**（关键设计）：
- `accepted` —— 产品决定的端侧专属差异 ⇒ 不报；
- `known-gap` —— **已知但还没补**的缺口 ⇒ **报警告、不阻断** ⇒
  缺口留在视野里，**不会被「加豁免」这个动作悄悄抹掉**。

**当前状态**：`ask_user` 移动端缺失登记为 `known-gap` ⇒ **阻断 0 / 提示 1**。

✅ **承重验证**（做过反向验证，不是只看它跑通）：
把移动端临时加一个 `ask_user` ⇒ 守卫**当场转绿**（阻断 0）；
撤销注入 ⇒ 守卫**当场恢复报错**（阻断 1）；文件 `git diff` 为空 ⇒ **完全还原**。
⇒ 这条提示是**真的**，不是提取逻辑的假阳性。


| ⑥ 未登记 `/settings/identity` | 唯一一条提示（10-31 新增身份页时漏登记） | §2.1 |

---

## 7. 落地方案（按「先止血、再对齐、后扩展」排序）

### 批次 A · 止血（低风险，先把静默漂移关掉）

| # | 内容 | 落点 | 验收 | 状态 |
|---|---|---|---|---|
| A-1 | 补登记 `/settings/identity` 到清单（登记为 `identity` 能力 + 两端 `surface.identity` 文案） | `agent-surface.json`、两端 i18n/ARB | 校验脚本提示归零 | ✅ **已完成** |
| A-2 | 修 `_meta.consumers` —— 改成实际的两个生成器（`nav.g.ts` / `nav.g.dart`） | 同上 | 清单不再指向不存在的文件 | ✅ **已完成** |
| A-3 | **桌面端三处硬编码 `localhost:60080`**，改走 `telencephalonStore` 的 `baseUrl` | `TelencephalonStatusPage.tsx`、`TracePage.tsx`（含 `http→ws` 转换）、`AddProviderModal.tsx` | 改过端脑地址后，这三页仍连的是老地址 | ✅ **已完成** |
| A-4 | `voice-button.tsx` 的相对路径 `/api/telencephalon/voice/transcribe` 改成走 `telencephalonClient.transcribeAudio()` | `src/components/ui/voice-button.tsx` | 与其它语音路径一致 | ✅ **已完成** |
| A-5 | **新增守卫** `scripts/check-client-tools.mjs`：两端发给模型的 tools 必须一致 | `scripts/check-client-tools.mjs` | 能抓住 A10（已做反向验证） | ✅ **已完成** |
| A-6 | **手机端脑面加 shadow key**（三仓原子改，见 §3 A9） | `telencephalon` / `encephalon` / `shadow-mobile` | 手机端 `POST /shadow/v1/identity` 不带 key ⇒ 403 | 🔄 **并行会话在做**（本审计不碰这三处） |
| A-7 | **桌面端两套「问用户」的死代码/预留钩子**：① `AgentClarificationDialog` 零引用（只有组件 + 自己的单测）② `clarification` 事件分支是「future flow」钩子（端脑 wire 还没发这个事件） | `src/components/chat/AgentClarificationDialog.tsx`、`src/pages/ConversationPage.tsx:413-416` | 要么删掉、要么接上 —— **不留「看起来有、其实没有」的能力** | ⬜ 待做 |
| A-8 | **端脑连接配置同步**（A11）：`TelencephalonClient.setApiKey()` + `setApiKey` 同步给 client + `persist.onRehydrateStorage` 恢复时推 baseUrl/apiKey | `src/lib/telencephalonClient.ts`、`src/stores/telencephalonStore.ts` | 改完地址/填完 key **重启后仍生效**；带 key 的端脑不再 401 | ✅ **已完成** |
| A-9 | **新增统一入口** `scripts/check-cross-client.mjs`（把两个守卫串起来） | `scripts/check-cross-client.mjs` | 两个守卫分开跑 ⇒ CI 容易只跑一个 ⇒ 另一个等于不存在 | ✅ **已完成** |



> ⚠️ **A-3 的准确说法（别照抄错的那版）**：桌面端端脑**默认端口就是 60080，这是设计如此** ——
> sidecar 与前端共享同一个端口，且有测试钉住（`src-tauri/src/cortex_http.rs:62-63` `DEFAULT_ADDR`，
> `:224-227` `default_addr_matches_the_frontend_base_url`）。
> **问题不在「端口会变」，而在「这三处绕过了 `telencephalonStore` 的 baseUrl 通道」** ——
> `telencephalonStore.ts` 的 `DEFAULT_BASE_URL` 是**可改**的（设置里能改、persist），
> 而这三处写死 ⇒ 用户改过地址后，它们与其它所有页面的行为**分叉**。
>
> ⚠️ **另一条容易混淆的事实**：`AGENTS.md` ㊱ 条 ⑦ 记的「端脑端口每次启动随机分配」
> 说的是**手机内嵌大脑**那条路（App 启动时分配随机端口，日志里 `Encephalon started on port <neuron> (agent surface: <telencephalon>)`），
> **与桌面端 sidecar 的固定 60080 是两回事**。别把两者混为一谈。
>
> ⚠️⚠️ **改这三处时撞出了更大的问题（A11）**：硬编码只是表象 ——
> 真正的问题是**端脑连接配置压根没同步给 client**（`setApiKey` 漏同步、`persist` 恢复时不推 baseUrl），
> ⇒ 用户改完设置**重启就失效**。已一并修掉（A-8）。
>
> ⚠️ **A3/A4 顺带查出的第二个问题**：`TelencephalonStatusPage` 打的 `/api/cortex/status`、
> `/api/cortex/logs` —— 服务端**早已没有 `/api/cortex/*` 路由**（只有 `/api/telencephalon/*`）
> ⇒ **这一页从来就 404**，只是页面把错误显示成一行灰字，没人注意。
> 字段名两边一致（`neuron_reachable` / `actual_models_count` / `available_models` / `info` / `hint`）
> ⇒ 只改路径前缀即可，已改。
>
> ⚠️ **依赖关系（重要）**：**A-6（给手机加 shadow key）必须等 A-8 修完再做** ——
> 否则「给端脑配 key」会先把**桌面端**打死（key 不带 ⇒ 全量 401，见 A11②）。


### 批次 B · 同名同源（治 A1 / A2，这批最要紧）

| # | 内容 | 决策点 |
|---|---|---|
| B-1 | **任务**：两端统一到 hippocampus（带租户），端脑任务改为 hippocampus 的视图/或明确区分「端脑任务」与「我的任务」两个产品概念 | ⚠️ **需拍板**：端脑 `TaskStore` 是进程内存，重启即失；把它做成持久化是另一件事 |
| B-2 | **技能 / MCP**：移动端界面改接已有的端脑 MCP 客户端类（`telencephalon_client.dart:1090-1192` 已齐全），本地 SQLite 降级为离线缓存 | 需确认：手机不编海马体时，MCP 注册面是否可达 |
| B-3 | **模型删除**：两端统一到 `/v1/models/{engine}/{id}` | 无需拍板 |
| B-4 | **移动端补齐「模型反问用户」整条链路**（A10）：注册 `ask_user` + `collectsInput` 字段 + `ToolCallStatus.awaitingInput` + 卡片上的输入表单 + 结果回传 | ⚠️ 需拍板：手机上的输入形态（对话内联输入框？弹层？语音回答？） |

### 批次 C · 能力回到对话（治 A3，旧批次 4）

| # | 内容 |
|---|---|
| C-1 | 输入框旁工具按钮 → 选 MCP server/tool → 结构化插入上下文（两端同形） |
| C-2 | `/` 唤起技能列表（两端同形） |
| C-3 | flow 触发结果作为**对话卡片**呈现，不跳页 |
| C-4 | agent 切换器放在对话头部（移动端已有 `soul`/`agents` 页面，可复用其数据源） |

### 批次 D · 清单升级为真正的「能力清单」

| # | 内容 |
|---|---|
| D-1 | 给 33 条能力补 `requires`（依赖哪个 lobe/skill），并**接上服务端能力面**（`/lobes/manifest`、`/lobes/capabilities`） |
| D-2 | 清单补 `source` 字段 —— 声明每条能力的数据源（`server` / `local` / `embedded`），**两端必须同源或显式声明分叉** |
| D-3 | 校验脚本加一条：**同名能力两端数据源必须一致**（❌ 待做）<br>（✅ 已由 `check-client-tools.mjs` 覆盖「客户端工具」这一类） |
| D-4 | 清单区分「二级入口」与「无入口」—— 12 条不出现在导航里的能力要显式标 `entry: 'secondary' \| 'none'` |

---

## 8. 需要拍板的地方

1. **任务到底有几个？** 现在桌面看 hippocampus、移动看端脑内存。
   选项：(a) 两端都统一到 hippocampus（端脑任务降级为「agent 内部任务」，不是用户任务）；
   (b) 承认是两个概念，界面上明确分开（用户的任务 / agent 的任务）；
   (c) 把端脑 `TaskStore` 改成持久化 + 带租户 ⇒ 两端都看它（工作量最大，但最符合「同一个 agent」）。

2. **移动端的技能 / MCP 是本地库这件事，是「离线优先」的有意设计，还是接错了？**
   源码注释写的是「Neon 迁移前的临时本地存储」⇒ 看起来是**临时态**，但移动端客户端类已经能连服务端了 ⇒ 建议改成服务端为主 + 本地兜底（批次 B-2）。

3. **「能力回到对话」是下一轮的重点吗？** 旧批次 4 至今未做，且它是「对话为主」的产品主张的核心兑现点。
   本轮审计确认它**仍然是根因**，没有别的捷径。

4. **服务端那 13 组无人消费的路由面**（§5.1）—— 是「还没打算给 UI」，还是「UI 忘了接」？
   其中 `lobes/manifest` + `lobes/capabilities` 是**清单升级的必需品**（批次 D-1），建议优先。

5. **手机上的端脑面要不要加 shadow key？**（A9）
   事实已经清楚：手机端脑面现在是**开发模式放行**，任何本机进程都能换掉「这台机器是谁」。
   ⚠️ 修法要**三个仓原子改**（`telencephalon` 加 `BuildOptions.shadow_api_key` ⇒ `encephalon` 传下去 ⇒
   移动端 Dart 侧 `setApiKey` + 每次请求带上），**只改一边会让手机上 App 的身份解析直接 401**
   ⇒ 静默退回 `default` 桶 ⇒ 手机与桌面不是同一个人。
   ⇒ **这不是本轮能顺手做掉的事**，但它决定「手机上的影子是不是只有用户自己能指挥」——
   在修好之前，**任何涉及「谁能操作这个影子」的对外承诺都不成立**。
   ✅ **前置条件已满足**：A11/A-8 已修好「桌面端配置同步」——
   否则给端脑配 key 会先把**桌面端**打死（key 不带 ⇒ 全量 401）。
   📌 **状态（2026-10-31 晚）**：并行会话**正在实施**这条（三个仓都有未提交改动：
   `telencephalon/src/boot.rs` 加 `BuildOptions.shadow_api_key`、`encephalon/src/mobile/*`、
   `shadow-mobile/android/.../ShadowKey.kt`）。⇒ **本审计不再碰这三处**，避免两边各改一半。


6. **移动端的「模型反问用户」要用什么形态？**（A10）
   桌面端是「对话流里一张卡 + 输入框」（`ClientToolForm`）。
   手机上空间小，可能的选择：① 对话流内联输入框（与桌面同形）② 底部弹层 ③ 复用现有输入栏直接发答案。
   ⚠️ 无论选哪个，**语义必须与桌面端一致**（同一个模型、同一套参数、同样能接着说），
   否则又变成「同名不同语义」。
   ⇒ **这一条不拍板，B-4 就没法动手**。

---

## 附：本次审计的证据与方法

- 实跑：`node scripts/check-agent-surface.mjs` ⇒ **阻断 0 / 提示 0 / 信息 3**（本轮修复后）
- 实跑：`node scripts/check-client-tools.mjs`（**本轮新增**）⇒ 阻断 0 / 提示 1（`ask_user` known-gap）
- 实跑：`node .verify-wt/surface-drift-check.mjs`（本次临时核对脚本）⇒ 唯一漂移 `/settings/identity`（**已修**）
- 直接 grep：`telencephalon/src/api/**/*.rs` 全量 `.route(...)` ⇒ 服务端路由面完整清单（§5.1 的依据）
- 直接读：两端 `App.tsx` / `app_router.dart` / `Layout.tsx` / `main_shell.dart` / `SettingsPage.tsx` / `settings_screen.dart`
- 直接读：`agent-surface.json`、`scripts/check-agent-surface.mjs`、`scripts/lib/nav.mjs`、`nav.g.ts`
- 交叉比对：两端全部 HTTP 调用点 ⇒ 桌面 ~70 处、移动 ~60 处，按前缀逐条对齐服务端路由

> ⚠️ **本轮未验证**：所有 HTTP 路径**只核对了客户端发出的与端脑 `src/api/**` 声明的**，没有实际起服务跑通。
> 端脑的 `flow` / `neuron` / `hippocampus` 嵌套路由（`/api/flows/**` 挂在 `src/flow/api/`）不在 `src/api/**` 内，
> 本轮按客户端调用面记录，**其服务端定义未逐条复核**。

### 本轮实际改了什么（可复核）

| 文件 | 改动 | 为什么 |
|---|---|---|
| `agent-surface.json` | 新增 `identity` 能力；`_meta.consumers` 改指真实生成器 | 批次 A-1 / A-2 |
| `shadow-desktop/src/i18n/{zh-CN,en-US}.json` | 新增 `surface.identity` | 让清单的 labelKey 两端都有 |
| `shadow-mobile/lib/l10n/app_{zh,en}.arb` | 新增 `surfaceIdentity` | 同上 |
| `shadow-mobile/lib/generated/l10n/*.dart` | l10n 生成物 | `flutter gen-l10n` 重生成 |
| `shadow-mobile/lib/navigation/nav.g.dart` | 导航生成物 | `node scripts/gen_nav.mjs` 重生成 |
| `scripts/check-client-tools.mjs` | **新增守卫** | 批次 A-5，闭合 §6 缺口⑤ |
| `scripts/check-cross-client.mjs` | **新增统一入口** | 两个守卫分开跑 ⇒ CI 容易只跑一个 ⇒ 另一个等于不存在 |
| `shadow-desktop/src/pages/TelencephalonStatusPage.tsx` | 硬编码 `localhost:60080` → store 的 `baseUrl`；**`/api/cortex/*` → `/api/telencephalon/*`**（旧路径服务端已不存在 ⇒ 这一页一直 404）；提示文案引用当前 baseUrl | 批次 A-3 |
| `shadow-desktop/src/pages/TracePage.tsx` | 硬编码 `ws://localhost:60080` → 由 `baseUrl` 推 `ws://`/`wss://` | 批次 A-3 |
| `shadow-desktop/src/components/business/AddProviderModal/AddProviderModal.tsx` | 硬编码 `localhost:60080` → store 的 `baseUrl` | 批次 A-3 |
| `shadow-desktop/src/components/ui/voice-button.tsx` | 裸 `fetch('/api/telencephalon/voice/transcribe')`（相对路径 = 同源，不是端脑）→ `telencephalonClient.transcribeAudio()` | 批次 A-4 |
| `shadow-desktop/src/lib/telencephalonClient.ts` | 新增 `setApiKey()` / `getApiKey()` | 批次 A-8（A11①） |
| `shadow-desktop/src/stores/telencephalonStore.ts` | `setApiKey` 同步给 client；`persist` 新增 `onRehydrateStorage` 恢复时推 baseUrl/apiKey | 批次 A-8（A11①②） |
| `shadow-desktop/src/stores/__tests__/telencephalonStore.test.ts` | **新增回归测试**（5 条） | 钉住 A11 的三条不变量 |
| `docs/.../2026-10-31-three-surface-alignment-audit.md` | 本文档 | 审计产出 |

**验证结果**：
- `node scripts/check-cross-client.mjs`（**统一入口**）⇒ **EXIT=0**（2 个守卫全过）
- `node scripts/check-agent-surface.mjs` ⇒ **阻断 0 / 提示 0 / 信息 3**
- `node scripts/check-client-tools.mjs` ⇒ **阻断 0 / 提示 1**（`ask_user` known-gap）
- 桌面端 `pnpm exec tsc --noEmit` ⇒ **EXIT=0**
- 桌面端 `pnpm exec vitest run` ⇒ **119 文件 / 1194 passed / 2 skipped / 0 failed**
  （基线 118 文件 / 1189 passed；本轮 **+1 文件 +5 条** = 新增的 store 回归测试）
- 移动端 `flutter analyze --no-pub` ⇒ **0 error / 75 issues**（与基线一致、**零新增**；
  13 个 warning 全在 `agents_screen` / `setup_wizard_screen` / `model_repository`，与本次改动无关）
- 移动端 `flutter test --concurrency=1` ⇒ **361 全绿**

✅ **反向验证（本轮新测试做过，不是只看它跑通）**：
- 撤掉 `setApiKey` 同步 ⇒ **恰好 2 条**变红（「设了 key 要同步」「清空 key 要同步」）；
- 撤掉 `onRehydrateStorage` ⇒ **恰好 2 条**变红（「恢复时推给 client」「恢复为空不乱推」）；
- 两组修复都恢复后 ⇒ 5 条全绿。
⇒ 这 5 条**真的承重**，不是摆设。

⚠️ **本轮改动的性质**：除了新增守卫与清单登记，本轮还修了**产品行为代码**
（桌面端端脑连接配置 + 四处路径）。这些改动**都是「本来就不生效」或「打错地址」的路径**，
不涉及产品语义变更；每一条都有对应的回归测试。



---

## 附二：真机复验的方法学教训（2026-10-31 并行会话同步，本轮独立复核）

这一节记录**怎么验证**，不是结论 —— 但它直接决定了 A9 这类结论的可信度。

### ⚠️ 教训 1 · 真机复验里凡是靠端口定位的，先读 logcat，别猜也别扫

手机上的端脑**端口每次启动都变**（实测：这轮 45139、之前 34527；neuron 面同样在变）。
真机复验的**第一步**是从 logcat 读：

```
✅ Encephalon started on port <neuron> (agent surface: <端脑面>)
```

⚠️ **`/proc/net/tcp` 里还躺着别的监听** —— `0xA61D`(=42525) 是 App 里**另一个**服务，**不是端脑面**。

> 🔴 **由此推翻了一条旧结论**：此前记录的「从开发机直查手机端脑的 `/shadow/v1/identity` 拿到 **403**」
> —— 那次是**打错了端口**（打到了那个要鉴权的**另一个**服务），**不是**「shadow key 拦住了」。
> ⇒ 「手机端脑面没有 shadow key」这个结论**不能**从那次 403 得出 ——
> 正确依据是 A9 里的机制链（Android 无环境变量 ⇒ 无配置文件 ⇒ `api_key` 为空 ⇒ 中间件放行），
> 且已由**不带 key 直接 200、端脑当场换人、再发回原码可原样恢复**这一演示证实。

### ⚠️ 教训 2 · 桌面端 60080 与手机端脑面随机端口，是**两回事**

| | 桌面端 sidecar | 手机内嵌大脑 |
|---|---|---|
| 端口 | **固定 60080**（`src-tauri/src/cortex_http.rs:62-63` `DEFAULT_ADDR`，有测试钉住 `:224-227`） | **每次启动随机分配** |
| 读配置 | 有配置文件 ⇒ 有 shadow key ⇒ 受保护 | 无配置文件 ⇒ 无 key ⇒ 放行 |

⇒ **做清单时别按桌面那条写手机那条**；也别拿「端脑端口会变」去解释桌面端的硬编码（那是另一码事，见 §7 批次 A-3）。

### ⚠️ 教训 3 · 手机上的 neuron 面绑 `0.0.0.0`（不是 loopback）

⇒ 手机上那台「大脑」的推理入口**同网段可达**。
⚠️ 这条与 A9 叠加后值得单独看一眼：**推理面 + 身份写入面**在手机上都比桌面端暴露得多。
（桌面端 neuron 走 `VITE_NEURON_URL` / `localhost:8085`，见 `src/lib/platform.ts:74-79`。）


