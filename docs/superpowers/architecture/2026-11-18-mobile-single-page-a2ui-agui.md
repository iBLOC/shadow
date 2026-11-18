# 移动端：把「对话」与「A2UI」合成**一个页面**，走 **AG-UI**

> epoch: 2026-11-18 ｜ authority: measured ｜ scope: project
> 用户诉求逐字：「现在移动端 对话也没按和agent2ui页面还是两个页面有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」

---

## 0. 先把一句话掰正（**A2UI 不是传输协议**）

用户说的「使用 a2ui 传输协议使用 ag-ui」，在协议层面其实是**两层**：

- **A2UI ＝ 内容协议**（组件目录 ＋ 组件树 ＋ 数据模型 ＋ 那四种消息 op）—— 它说「界面长什么样」；
- **AG-UI ／ A2A ＝ 传输协议**（事件流）—— 它说「这些内容怎么从 agent 走到用户面前」。

⇒ ⇒ 官方口径：**面向用户的「面」归 AG-UI**（AG-UI 是 Agent↔User 的标准传输绑定，
A2A 是 Agent↔Agent 的）⇒ ⇒ A2A 那条路**该留着**（它有自己正式的 v1.0 Extension 规范，
旧客户端还在用 v0.8）⇒ ⇒ **两条承载并存，不是二选一**（父仓 `check-agui-a2ui-wire.mjs` 的 W7 判据就钉着这件事）。

⇒ ⇒ 所以这一刀做的**不是**「把 A2A 端点删掉」，而是：
**把移动端客户端这一侧的 A2A 承载收掉，让移动端只走 AG-UI。**

---

## 1. 现状核实（三条承载，逐条有源码行号）

移动端在 AG-UI 换线之后，**同一个页面里住着两条协议**：

| # | 形态 | 传输 | 长在哪 | 记会话吗 | 证据 |
|---|---|---|---|---|---|
| ① | **AG-UI 内联** | AG-UI（官方 `ACTIVITY_SNAPSHOT`） | **对话消息里** | 记 | `chat_provider.dart` 的 `case 'a2ui_surface':` → `service.ingestA2uiOps(ops)` → `msg.a2uiSurfaceIds` → `local_chat_view.dart` 的 `A2uiSurfacesBlock` |
| ② | **独立面板** | **A2A**（`/a2a`） | 顶部**另一块**（自带输入条 ＋ 连接状态栏） | **不记** | `a2ui_panel.dart` → `a2ui_view.dart` 的 `A2uiInputBar` → `service.sendMessage` → `a2ui_agent_service.dart` 的 `message/stream` |
| ③ | **客户端工具画的界面** | A2A（`/a2a`） | **对话消息里**（工具卡下面） | 记 | 客户端工具 `show_a2ui_surface` → `chat_provider.dart` 的 `fetchSurfaceEvents(view)` → `a2ui_inline_block.dart` |

⇒ ⇒ **①已经是你要的那个形状**（A2UI 的面在对话里，走 AG-UI）：

- 端脑侧：`telencephalon/src/api/shadow/agui.rs` 把面 paint 成官方形状的 activity
  （`{type:"ACTIVITY_SNAPSHOT", messageId:"a2ui-surface-<surfaceId>", activityType:"a2ui-surface", content:<ops 数组>, replace:true}`）；
- 移动端侧：`lib/agui/a2ui_activity.dart` 逐字照抄那五个字段，`lib/agui/agui_driver.dart` 的
  `ACTIVITY_SNAPSHOT` 分支把它变成 `a2ui_surface` 事件，`chat_provider.dart` 喂进官方 processor，
  `local_chat_view.dart` 画在那条消息下面。

⇒ ⇒ **真正让用户看到「两个」的是 ②**：它自带输入条、自带连接状态栏、**不记会话**
⇒ ⇒ 用户在同一屏看到「对话」与「另一个界面」⇒ ⇒ **这一刀摘的是它**。

---

## 2. 摘掉 ② **不丢能力**（三条依据）

1. **面板能给的只有 `tasks`／`agents` 两个视图** —— 端脑的 `a2ui::resolve_view` 认的就是这两个；
2. **端脑在 AG-UI 路里对同样两个视图用同一套 `a2ui::render_view` 产出面**
   ⇒ ⇒ 两边**逐字同形**（父仓 `check-agui-a2ui-wire.mjs` 的 W6 判据钉着）；
3. **关键词兜底同样生效** —— `resolve_view` 的第三档：中英文关键词命中「任务／待办／task／todo」⇒ tasks，
   「智能体／叶区／agent」⇒ agents ⇒ ⇒ 用户在**对话框**里说一句「我的任务」就出面。

⇒ ⇒ 而且 ① **还记会话**（② 不记：端脑 `/a2a` 每次请求现造 `context_id`）
⇒ ⇒ 摘掉的是**重复的第二条路**，不是能力。

---

## 3. 这一刀落了什么

### 3.1 移动端

- `lib/screens/chat_screen.dart`：**摘掉** AppBar 上那个常驻 `widgets` 开关按钮 ＋ body 顶部那块面板；
- `lib/providers/a2ui_provider.dart`：**摘掉** `useA2uiModeProvider`（面板开关）＋ **四个只服务面板的观察面 provider**
  （`a2uiConnectionStatusProvider`／`surfaceIdsProvider`／`a2uiTextReplyProvider`／`a2uiErrorReasonProvider`）；
- **回收站（可恢复）**：`lib/widgets/chat/a2ui_panel.dart`、`a2ui_view.dart`、`a2ui_answer_state.dart`
  ＋ 两个只服务面板的测试（`a2ui_empty_state_test.dart`、`a2ui_answer_states_test.dart`）＋ `a2ui_coexist_test.dart`；
- **保留**：`lib/services/a2ui/a2ui_agent_service.dart`（AG-UI 内联**依赖**它的官方 processor）＋
  `lib/agui/` 那一整套 ＋ `a2ui_inline_block.dart`；
- 测试：**新** `test/widget/a2ui_single_carrier_test.dart`（三条：没有第二个界面的开关 ＋ 只有对话那一个输入框 ＋ 对话入口没被误伤）；
  **改** `chat_screen_home_test.dart`（断言从「有 widgets 按钮」翻成「**没有**」）＋ `chat_screen_test.dart`／`message_quote_test.dart`／`test_helper.dart`（去掉被删 provider 的引用）；
  **改** `conversation_screen.dart` 的注释（不许指向已删的文件）。

### 3.2 父仓

- **新** `scripts/check-mobile-single-a2ui-carrier.mjs`：**七条判据**（见下）；
- **新** 本文档。

---

## 4. 那道闸钉的是**形状**（八条）

| 判据 | 钉的是什么 |
|---|---|
| M1 | 对话页**不许**再 import／挂那块独立面板 —— **两代命名**都盯（`a2ui_panel` ＋ `agent2ui_panel`） |
| M2 | 面板那三个文件**必须不在** —— **两代命名各三份**（`a2ui_*` ＋ `agent2ui_*`，后者是**仓库 HEAD 里存的那一份**） |
| M3 | 面板开关 provider **零命中**（`useA2uiModeProvider` ＋ `useAgent2UIModeProvider`，扫 `lib/` ＋ `test/`） |
| M4 | 面板那个输入条**零命中**（`A2uiInputBar` ＋ `Agent2UIInputBar`）—— 同屏两个输入框 = 用户分不清在跟谁说话 |
| M5 | **正控**：AG-UI 内联**三跳**都在（`chat_provider` 的 `a2ui_surface` 分支 ＋ `local_chat_view` 的 `A2uiSurfacesBlock` ＋ `a2ui_activity.dart` 的常量） |
| M6 | 客户端**认得**那条官方事件（`agui_events.dart` 的已知事件类型里有 `ACTIVITY_SNAPSHOT`）—— 不认 ⇒ 端脑画的面**静默消失** |
| M7 | **内联面不许自己另说会话身份**（它继承的是对话那条 ⇒ 自己另说就是界面说谎） |
| M8 | 面板**那一族的类名／服务名**不许在任何 `.dart` 里复活（`Agent2UIView`／`Agent2UIAnswerState`／`genUIAgentService`）⇒ ⇒ **换个文件名复活也躲不过** |

⇒ ⇒ 「移动端只有一条 A2UI 承载」这句话**可判**，不是口号。

⚠️ **为什么 M6 落在客户端这一侧**：端脑「能不能出面」**不是**客户端的职责
⇒ ⇒ 那一格归 `check-agui-a2ui-wire.mjs`（W6／W8，**跨仓**、本机跑）
⇒ ⇒ 而本闸**单仓可判** ⇒ ⇒ **能进 CI** ⇒ ⇒ 「CI 里有分母的那一份」。
⚠️ **说准一点**：`check-agui-a2ui-wire.mjs` 那道闸**目前没接进 CI**（闸的治理闸把它记成
「有闸但没人跑」的存量缺口）⇒ ⇒ 端脑侧与 wire 形状那一格**在 CI 里没有分母**
⇒ ⇒ **本闸是这一族里 CI 里有分母的那一份**。

### 4.1 尺子有牙（**真文件上的真变异**，不是合成夹具）

- ❶ 在**真** `shadow-mobile/lib/screens/chat_screen.dart` 里加回 `import '../widgets/chat/a2ui_panel.dart';`
  ⇒ ⇒ 闸**恰好 M1 一条红**（7/8）；
- ❷ 在**真** `shadow-mobile/lib/providers/chat_provider.dart` 里把 `case 'a2ui_surface':` 改成别的
  ⇒ ⇒ 闸**恰好 M5 一条红**（7/8）；
- ❸ 在**真** `shadow-mobile/lib/agui/agui_events.dart` 里把 `ACTIVITY_SNAPSHOT` 改名
  ⇒ ⇒ 闸**恰好 M6 一条红**（7/8）；
- ❹ **旧名那一族**（**加固之后**补做的）：在**真** `chat_screen.dart` 里加回
  `import '../widgets/chat/agent2ui_panel.dart';` ⇒ ⇒ **恰好 M1 一条红**；
  在**真** `a2ui_provider.dart` 里加回 `useAgent2UIModeProvider` ⇒ ⇒ **恰好 M3 一条红**；
  加回 `class Agent2UIInputBar` ⇒ ⇒ **恰好 M4 一条红**；
  加回 `class Agent2UIView` ⇒ ⇒ **恰好 M8 一条红**；
  把 **HEAD 那份真面板文件**（`agent2ui_panel.dart`）**原样恢复**回来
  ⇒ ⇒ **M2 ＋ M8 两条红**（两条都在「面板那一族」⇒ ⇒ 别的判据**一条没红**）；
- ❺ 八次还原后 **sha256 逐字一致** ⇒ ⇒ 闸面回到 8/8。

⚠️ 合成夹具自检也跑：**14/14**（一份合规 ＋ 一条「**尺子自己也要被量**」（名单里两代命名都在）
＋ 十二种坏法各一）。

⚠️ **这一节为什么从三道变成八道**：复核时发现**仓库 HEAD 里存的是旧名**
（`agent2ui_panel.dart`／`agent2ui_view.dart`／`agent2ui_answer_state.dart`）
⇒ ⇒ 而闸的 M1–M4 只盯**新名**（`a2ui_*`）⇒ ⇒ **把 HEAD 那份面板恢复回来，闸照样绿**
⇒ ⇒ **尺子自己骗自己**⇒ ⇒ 加固（两代命名都进名单 ＋ 新增 M8 盯那一族的类名与服务名）
⇒ ⇒ 八道真变异在**加固后的最终版闸**上**重跑** ⇒ ⇒ 读数对着**最终版**判据报。

---

## 5. 读数

| 项 | 读数 |
|---|---|
| 新闸 | **8/8**（自检 **14/14**） |
| 真变异 | **八道**（M1×2／M2×2／M3／M4／M5／M6／M8）：除「HEAD 真面板文件」那道红 **M2 ＋ M8 两条**（都在面板那一族）外，**其余各恰好一条红**；八次还原 sha256 **逐字一致** |
| 移动端 `flutter analyze --no-pub` | **61 issues**（0 error ／ 0 warning ／ 61 存量 info）—— 与基线**逐数相同** |
| 移动端 `flutter test --no-pub` | **1137 过 / 13 跳 / 0 红**（exit 0） |
| 移动端 A2UI 相关测试 | **23 过 / 0 红** |
| `check-agui-a2ui-wire.mjs`（wire 形状） | **8/8**（没被这一刀撞红） |
| `check-a2ui-session-identity.mjs` | 由**退出码 2（判不了）**转 **0 红**（自检 9/9）—— 顺带销了一笔存量债 |
| `check-agent-surface.mjs` ＋ `check-cross-client.mjs` | **0 红**（`agent-surface.json` 的移动端登记已同刀同步） |
| 父仓全闸 | **66 道 ｜ 51 绿 / 13 红 / 2 判不了 / 0 超时**（那一跑在**改号之前**、也在**加固之前**）⇒ ⇒ 其中 `check-ledger-codepoints` 的**工作树面已在改号后转零违规** ⇒ ⇒ 其余 12 红逐条是**存量**（admin token 格子 / cortex 残留 / 提交树面的回填号违例 / 在飞面的落点）⇒ ⇒ **零新增红**；⚠️ **加固之后**复跑：本闸 **8/8** ＋ 自检 **14/14** ＋ 治理闸仍 **4 条**（逐条存量）⇒ ⇒ **零新增红** |

---

## 6. 仍然欠着的

❶ **③ 那条承载的数据源还是 A2A** —— 客户端工具 `show_a2ui_surface` 仍然去 `/a2a` 取 surface 事件
（`chat_provider.dart` 的 `fetchSurfaceEvents(view)`）⇒ ⇒ **呈现**已经内联，**取数**还走 A2A
⇒ ⇒ 要彻底归位，得端脑补一格：「客户端工具回传的结果里带 `a2ui_operations` ⇒ paint 成 activity」
（官方 fixed schema，端脑侧 `a2ui_activity_from_tool_result` 已有这个函数，但只用在**端脑自己**的工具结果上）
⇒ ⇒ **下一刀**。

❷ **桌面端那一侧**形状还没收 —— 桌面端也有 `A2uiPanel`（`ConversationPage.tsx` 的消息列表上方）
＋ AG-UI 内联 ⇒ ⇒ **同样的重复**还在 ⇒ ⇒ 用户这一刀只点了移动端 ⇒ ⇒ 桌面端另起一刀。

❸ **端脑 `resolve_view` 的关键词兜底会过度触发** —— 用户随口说「这个任务的进度」也会画一个任务看板
（「任务」命中 ⇒ tasks）⇒ ⇒ 这是**既有行为**，这一刀没碰 ⇒ ⇒ 要收得另设计（更严格的意图判定）。

❹ **真机那一格仍空** ⇒ ⇒ 「手机上真的一个页面、真的能画出这块面」**未在真机验过**。

❺ **那四把 i18n 键**（`a2ui`／`askA2ui`／`a2uiReady`／`a2uiNoConnection` 等）现在**没有读者**
⇒ ⇒ i18n 闸只查「键完整性」不查「未使用」⇒ ⇒ 不红 ⇒ ⇒ 但它们是**死键**，将来清理时一并清。

---

## 6.5 ⚠️ 这一刀真撞上了「取号 → 落笔之间的窗口」

落笔时**官方口径**给的候选是 U+37AF ⇒ ⇒ 但**逐字扫八本账本**发现它**已被端脑那本占了**
⇒ ⇒ 官方候选表看不见「在飞面」的占用 ⇒ ⇒ 往后取 ⇒ ⇒ 落笔 ⇒ ⇒ **圈码闸当场红**
（`dup-codepoint`：U+37B2 被两条占用）⇒ ⇒ 查出来是**兄弟会话在我落笔之后**又占了一枚
⇒ ⇒ **改号重落**（父仓 U+37B3 ＋ 移动端 U+37B4）⇒ ⇒ 立刻复跑 ⇒ ⇒ **工作树面零违规**。

⚠️ 还有一格**闸看不见**：跨账本**同码位**（我的父仓那枚 ＋ 端脑那枚都落在 37B1）
⇒ ⇒ 父仓的圈码闸**只扫三本账本**（父仓／移动端／桌面端）⇒ ⇒ 它**扫不到兄弟仓的账本**
⇒ ⇒ 那种撞号**只能自己逐字扫** ⇒ ⇒ 这一刀靠那一步避开了。

---

## 7. 恢复那块面板要**三件一起**（缺一件就退回「两条承载并存」）

1. `chat_screen.dart`：AppBar 加回一个开关按钮 ＋ body 顶部加回面板；
2. `a2ui_provider.dart`：把四个观察面 provider 加回来 —— **连同「先给一次现在的列表」那一手**
   （广播流不重放 ⇒ 「回复先到、provider 后订阅」会漏掉那一句端脑原话，真机踩过）；
3. `lib/widgets/chat/a2ui_{panel,view,answer_state}.dart` 三个文件（走回收站，可恢复）；

⚠️ **还要同刀改父仓那道闸**（`check-mobile-single-a2ui-carrier.mjs` 的 M1／M2／M3／M4）
⇒ ⇒ 不许偷偷加回一条「第二条承载」。

---

## 8. 附：为什么这一刀值得存在

**「两个页面」不是 UI 细节，是**协议事实**：②那条路走 A2A ⇒ ⇒ 端脑那边是 `context_id` 每次现造
⇒ ⇒ **不记会话** ⇒ ⇒ 用户在面板里看到的界面**回不到那条对话里**。
⇒ ⇒ 把两条收成一条，用户要的那句话（「合并为一个页面」）才**真的**成立：
同一个页面、同一条会话、同一种传输。
