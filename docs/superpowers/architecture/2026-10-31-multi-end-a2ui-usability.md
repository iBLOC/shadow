# 多端 A2UI 可用性评估

> 2026-10-31 · 承接《三端功能清单对齐审计》（同日）
> 范围：桌面端（`shadow-desktop`）/ 移动端（`shadow-mobile`）/ 设备端（`shadow-esp32`）/ 服务端（`telencephalon` 及其叶区）
> 方法：不看文档宣称，只看**代码里真实存在的实现与连线**；所有结论带 `file:line` 证据。

---

## 0. 一句话结论

**A2UI 在这个项目里是「一根接好的水管，中间没有水源」——**
**⚠️ 这个结论有两半，本轮把下半句修掉了。**

- ✅ **上半句（客户端）本来就是真的**：协议栈、组件目录、界面、入口都齐。
- ❌ **下半句（服务端）是空的** —— **本轮已补**（§6.3）：
  端脑现在有一个 A2UI **产出面**（`POST /a2a`，A2A v0.3 JSON-RPC + SSE），
  能把**真实的内部状态**（任务、已注册叶区）渲染成 A2UI 组件树。
- ⚠️ **设备端仍然完全零 A2UI** —— **按设计**：ESP32 只是**输入设备**，不需要 A2UI（2026-11-01 用户定 ⇒ 不是欠账）。
- 🟡 **桌面端本轮也补上了**（§6.5）：在 TypeScript 里自写协议栈 + 渲染面
  + 面板 + 入口 ⇒ **两端现在都能显示同一批服务端画出来的界面**。
  ⚠️ 但**设备端**（ESP32）仍然是零 —— **按设计**：它只是**输入设备**（2026-11-01 用户定）。

⇒ **今天在移动端，A2UI 第一次能真的显示出东西了**（任务看板 / 叶区列表）。
⇒ **桌面端也接上了同一张产出面**（§6.5）⇒ 跨端契约的 fixture 现在有**三个**消费者。

⚠️ 另外：那个空态原先还硬写着「Agent2UI 就绪 / 问我任何事」（**假承诺**）——
**已修**（§6.2）：空态现在按真实连接状态说话，且不再承诺会生成界面。

⚠️ 而且**能进不能出的问题已经修好了**（入口是常驻按钮，不是下载框的逃生口）——
**这意味着一个进去就出不来、且里面永远空白的入口，现在是可达的**。

⚠️ **本轮自己引入的一个缺口也已经补上**（§6.4）：§6.3 新加的 `/a2a` 端点
**一开始没落在 shadow key 那道门后面** ⇒ 它是一张**会吐用户数据**
（任务标题、agent 名）、且**同设备任何别的 App 都能打**（手机上）/
**局域网可达**（桌面上）的面 ⇒ 现在与 `/shadow/v1/*` **共用同一道门**。


---

## 1. 结论速览

| 端 | 客户端实现 | 服务端产出 | 实际可用性 |
|---|---|---|---|
| **移动端** | ✅ 完整（协议栈 + 8 个组件 + 界面 + 入口） | ✅ **有**（§6.3：`POST /a2a`） | 🟡 **可用**（任务 / 叶区两个视图） |
| **桌面端** | 🟡 **有**（§6.5：TS 协议栈 + 4 种组件 + 面板 + 入口） | ✅ **有**（同一个 `POST /a2a`） | 🟡 **可用**（同一批视图，但**只对着录下来的字节验过**，见 §6.5） |
| **设备端（ESP32）** | ❌ **零**（**按设计**：它只是**输入设备**） | ❌ 无 | ⚪ **不需要**（2026-11-01 用户定 ⇒ 不是欠账） |
| **端脑（telencephalon）** | — | ✅ **产出**（`src/a2a/a2ui.rs`） | 🟢 **产出** |
| **synapse / temporal 等叶区** | — | ❌ 无 | 🔴 **不产出**（视图的**数据源**是端脑自己，不是叶区） |

⚠️ 移动端是 🟡 而不是 🟢：能用了，但**只有两个视图**、界面文案是服务端出的（英文）、
**还没有 LLM 驱动的「现场画界面」**（§6.3 §未做的事）。

---

## 2. 客户端侧：移动端是唯一有实现的

### 2.1 实现清单（全部实测）

| 文件 | 作用 |
|---|---|
| `shadow-mobile/lib/providers/genui_provider.dart` | 4 个 provider：service / 连接状态 / 模式开关 / surface 列表 |
| `shadow-mobile/lib/services/genui/gen_ui_agent_service.dart` | **核心**：封装 `A2uiMessageProcessor` + `A2uiContentGenerator` + `GenUiConversation` |
| `shadow-mobile/lib/services/genui/shadow_catalog.dart` | **8 个自定义组件**（见 §2.2） |
| `shadow-mobile/lib/widgets/chat/agent2ui_view.dart` | 界面：状态条 + surface 渲染区 |
| `shadow-mobile/lib/widgets/chat/../flutter_genui/chat_widget.dart` | 另一个 GenUI 聊天组件 |
| `shadow-mobile/lib/providers/mnn_agent_integration.dart` | 把 GenUI service 接到本地 MNN 引擎 |

依赖：`pubspec.yaml:55-56` → `genui: ^0.7.0` + `genui_a2ui: ^0.7.0`（**第三方官方包**）。

### 2.2 组件目录（`shadow_catalog.dart`）

在官方 `CoreCatalogItems` 基础上加了 8 个：

`TaskCard` / `MemoryCard` / `AgentStatusIndicator` / `ProgressStepper` / `NotificationToast` / `ToolCallCard` / `ConversationBubble` / `QuickActionButton`

⚠️ **每个都带完整 widgetBuilder**（卡片、图标、配色、状态分支）⇒
**组件这一层是真的做完了**，不是占位。

### 2.3 入口与出口

- **入口**：`chat_screen.dart:174-180` —— AppBar 上的 `Icons.widgets_outlined` 常驻按钮，
  置 `useAgent2UIModeProvider = true`。
  注释写得很清楚（`chat_screen.dart:169-173`）：
  > 以前唯一的入口是「本地模型没装好 → 弹下载框 → Use Agent2UI」那个逃生口 —— 下载框下线之后就没有入口了，
  > 所以补一个常驻按钮，不然这个形态会变成**只能进不能出**的死功能。

  ⇒ ⚠️ **注意措辞**：修的是「进不去」，**没修「进去了是空的」**。

- **出口**：`agent2ui_view.dart:92-97` —— 状态条上的「断开」按钮，置回 `false`。
  ⇒ 进得出**都通**（这块是真的修好了）。

- **界面**：`agent2ui_view.dart:102-168` —— `surfaceIds` 为空 ⇒ 显示空态（图标 + 一句**按真实连接状态**说的话 + 机制提示，见 §6.2）；
  非空 ⇒ `ListView.builder` 渲染 `GenUiSurface`。

### 2.4 测试覆盖

`shadow-mobile/test/widget/chat_screen_home_test.dart`：
- `:72` 「AppBar 右侧的入口都在（设置 / 语音 / Agent2UI）」
- `:85` 「Agent2UI 是能进能出的（不再是只能进不能出）」
- `:97` 注释明说 Agent2UI 视图里有 `CircularProgressIndicator`（无限动画）

⚠️ **测试只覆盖「入口在不在、能不能进出」** —— **没有任何测试覆盖「surface 里真的有东西」**。
⇒ 这正好是缺口所在。

---

## 3. 服务端侧：⚠️ **原来**全链路没有一处产出 A2UI（本轮已补，见 §6.3）

> ⚠️ 这一节记的是**评估当时**的状态。**本轮已经补上了服务端产出面**（§6.3）：
> 端脑新增 `src/a2a/a2ui.rs` + `src/api/a2ui_gateway.rs`，
> 能把真实的任务 / 叶区渲染成 A2UI 组件树。
> 下面这几条证据仍然成立 —— 它们记的是**「为什么当时是空的」**，
> 以及**「A2UI 真正的载体长什么样」**（协议事实不会因为补了产出面而变）。

这是本次评估**最关键的结论**。

### 3.1 协议要求（A2UI 客户端连什么）

`genui_a2ui` 0.7.0 包内（`pub-cache/.../genui_a2ui-0.7.0/src/a2ui_agent_connector.dart`）：

```dart
final Uri a2uiExtensionUri = Uri.parse('https://a2ui.org/a2a-extension/a2ui/v0.8');
...
authHeaders: {'X-A2A-Extensions': a2uiExtensionUri.toString()},
```

⇒ A2UI 走 **A2A 协议**，且客户端会带 `X-A2A-Extensions` 头声明 A2UI 扩展。

### 3.2 端脑的 A2A 面：**只做文本**

`telencephalon/src/api/a2a_gateway.rs`：
- `:13` `POST /a2a/tasks/send`、`:14` `GET /a2a/tasks/{id}`、`:15` `.../cancel`
- `:133-136` 函数注释（**决定性证据**）：
  > Translate a v0.1 protocol::Message to a v0.2 schema::Message.
  > **Extracts the text content from all text parts and joins them with a single space.
  > Non-text parts (file, data) are dropped.**

⇒ 端脑的 A2A 网关把消息**降维成纯文本**。
A2UI 的载体是 `data` part / `surface_update` artifact ⇒ **在这条路上会被直接丢掉**。

### 3.3 端脑的 agent card：**没声明 A2UI 扩展**

`telencephalon/src/api/well_known.rs:15-35` 的 `get_telencephalon_agent_card` 返回：

```json
{ "name", "description", "url", "version", "provider",
  "capabilities": { "streaming", "push_notifications", "state_transition_history" },
  "skills": [...], "metadata": {...} }
```

⚠️ **没有 `capabilities.extensions`**，没有任何 A2UI 声明
⇒ A2UI 客户端**无从判断对端支持 A2UI**（而它正是靠这个扩展声明来协商的）。

### 3.4 全部叶区：无 A2UI 产出

| 仓 | grep `a2ui\|genui\|surface_update\|dataModel` |
|---|---|
| `telencephalon/src/**` | **零命中** |
| `synapse/src/**` | **零命中** |
| `temporal/src/**` | **零命中**（只有 "surface" 的英文普通词，如 `speaker.rs` 的 "notification surface"） |

⇒ **没有任何一个叶区会生成 A2UI 的组件树。**

### 3.5 移动端连的地址：`localhost:60080`（在手机上是死端口）

`genui_provider.dart:11`：
```dart
const prefrontalUrl = 'http://localhost:60080';
```

⚠️ **这是桌面 sidecar 的端口**。在手机上：
- 端脑面端口**每次启动随机分配**（日志：`✅ Encephalon started on port <neuron> (agent surface: <端脑面>)`）；
- 手机上的 `localhost:60080` **没有任何进程监听**。

⇒ **移动端的 A2UI 服务端地址是写死的、且在真机上必然连不上。**
（这与本审计 A11 同源：移动端前额叶方言的 baseUrl 恒为 `localhost:60080`，
`task_board_screen.dart:16-20` 早就为此踩过坑并记录过原因。）

💡 **而且移动端「已经有」正确的那个 client** ——
`lib/services/telencephalon/telencephalon_client.dart:636-640`：
```dart
/// 移动端「改嵌大脑」之后，嵌入式大脑起来时这个地址会被换成 App
/// 进程内那份端脑的地址（见 `EncephalonMobileNotifier`）。
static const String defaultBaseUrl = 'http://127.0.0.1:60080';
```
⇒ **A2UI 是「另开了一条」写死的地址**，而不是复用这一个会跟随随机端口的 client。
⇒ 修 U4 **不需要新造轮子**：把 A2UI 接到 `telencephalonClient` 的 baseUrl 上即可。

### 3.6 ⚠️ 端脑 A2A 的 `get_task` / `cancel_task` 也是死的

`telencephalon/src/api/a2a_gateway.rs:109-119`、`:121-132`：
两个 handler 都直接 `Err((StatusCode::..., ...))` ⇒ **端脑的 A2A 任务查询与取消未实现**。

---

## 4. 桌面端 / 设备端：零

> ⚠️ **这一节记录的是「本轮之前」的状态**（评估当时的快照）。
> **桌面端那一格已经不成立**（§6.5）—— 现在桌面端有消费面了。
> **设备端（ESP32）仍然是零**，且**这一轮没动** —— **按设计**：它只是**输入设备**（2026-11-01 用户定 ⇒ 不是欠账）。

| 目标 | 结果 |
|---|---|
| `shadow-desktop/src/**` grep `genui\|a2ui\|agent2ui` | **零命中**（⚠️ 本轮之前；现在有 `a2uiProtocol.ts` / `a2uiClient.ts` / `A2uiSurface.tsx` / `A2uiPanel.tsx`） |
| `shadow-esp32/**`（C/C++/ino/md）grep `a2ui\|genui` | **零命中**（**仍然成立**） |
| `agent-surface.json`（能力清单）grep `a2ui\|agent2ui\|genui\|widgets` | **零命中**（⚠️ 本轮之前；现在已登记 `a2ui` 条目） |

⚠️ **A2UI 根本不在能力清单里** —— 它是**清单外的功能**。
（对照：A1–A11 的问题都是「清单内的能力两端不对等」，A2UI 是「能力清单里压根没有它」。）

⇒ 按本审计 §7 批次 D 的方向（D-2：清单补 `source` 字段、D-4：区分二级入口与无入口），
**A2UI 需要先被登记进清单**，否则它的存在与否对跨端一致性检查是**不可见的**。

---

## 5. 可用性判定

### 5.1 逐端判定

> ⚠️ 本表是**评估当时**的快照。§6.3（服务端产出）/ §6.4（上锁）/ §6.5（桌面端接入）
> 之后已经变了 —— **现在的判定见 §1 结论速览**。

| 端 | 判定（评估当时） | 依据 |
|---|---|---|
| 移动端 | 🔴 **空壳** | 客户端齐、服务端空；且地址写死 `localhost:60080`（真机连不上） |
| 桌面端 | 🔴 **不存在** | 零实现　**⚠️ 本轮已补（§6.5）** |
| 设备端 | 🔴 **不存在** | 零实现　**⚠️ 仍然成立** |
| 端脑 | 🔴 **不产出** | A2A 只做文本；agent card 不声明扩展；无叶区产出　**⚠️ 本轮已补（§6.3）** |

### 5.2 实际用户能看到的

用户在移动端点那个「组件图标」⇒ 进入 Agent2UI 视图 ⇒
看到**状态条**（已断开 / 正在连接 / 已连接到 Shadow A2A 服务器）
+ **空态**（原先写死「Agent2UI 就绪 / 问我任何事」，**本轮已改成按真实状态说话**，见 §6.2）
+ 一个无限转圈的进度指示器 ⇒
**发任何消息都不会有任何 UI 出现**（因为服务端不产出）⇒
⇒ 退出按钮是唯一能做的事。

⚠️ 这**仍然**是「一个进去就出不来、且里面永远空白的入口」——
从用户视角，这比没有这个入口更糟：**它承诺了一个不存在的能力**。

✅ **但本轮至少不再「说谎」了**：空态不再自称「就绪」，
而是按连接状态分别说「连不上端脑」/「正在等待端脑推送界面」/「已连接，但服务端还没有生成任何界面」。
⇒ **「宣称就绪却永远空白」这个致命项（U0）已消**，
剩下的是「**诚实地说：这里确实还没有东西**」。

---

## 6. 问题清单（按「能不能让人不再失望」排序）

| # | 问题 | 严重度 | 证据 |
|---|---|---|---|
| **U0** | ~~**「Agent2UI 就绪 / 问我任何事」是硬编码的空态文案**~~ —— `ids.isEmpty` 时**无条件**显示，**与真实连接状态、服务端是否产出完全无关** ⇒ 用户被明确告知「就绪」，但永远等不到任何 UI　**✅ 本轮已修（§6.2）** | 🔴 ~~致命~~ → 已消 | `agent2ui_view.dart:105-168`（改前 `:117` `l10n.agent2uiReady`） |
| **U1** | ~~**端脑不产出 A2UI** —— 全链路零产出~~　**✅ 本轮已修**（§6.3）：端脑新增 A2UI 产出面，把**真实内部状态**渲染成组件树 | 🔴 ~~致命~~ → 已消 | `telencephalon/src/a2a/a2ui.rs`、`src/api/a2ui_gateway.rs` |
| **U2** | **端脑 A2A 只做文本**，`data` part 被丢弃 ⇒ A2UI 的载体根本传不过来　🟡 **部分修**：**A2UI 这条路不再降维**（新端点直接按 v0.3 解析）；**老的 skill 路由路径仍只做文本**（那是给叶区用的 v0.1 契约，动它要动叶区） | 🟠 → 部分 | `api/a2a_gateway.rs:136`（老路径）、`api/a2ui_gateway.rs`（新路径） |
| **U3** | ~~**agent card 不声明 A2UI 扩展** ⇒ 客户端无从协商~~　**✅ 本轮已修** | 🟠 ~~高~~ → 已消 | `src/api/well_known.rs`（`capabilities.extensions`） |
| **U4** | ~~**移动端 A2UI 地址写死 `localhost:60080`** ⇒ 真机上必然连不上~~　**✅ 本轮已修**：改成跟随嵌入式大脑的端脑面端口 | 🟠 ~~高~~ → 已消 | `shadow-mobile/lib/providers/genui_provider.dart` |
| **U5** | ~~**A2UI 不在能力清单里** ⇒ 跨端一致性检查看不见它~~　**✅ 本轮已修**：登记为第 34 条能力（两端 i18n/ARB 同步） | 🟠 ~~高~~ → 已消 | `agent-surface.json` |
| **U6** | **桌面端 / 设备端零实现** ⇒ 三端不对等　⚠️ **本轮未动**（桌面端已有等价机制，见 §7 方向 C） | 🟠 高 | §4 |
| **U7** | **端脑 A2A 的 `get_task` / `cancel_task` 未实现**（直接 Err）　⚠️ 本轮未动 | 🟡 中 | `api/a2a_gateway.rs:109-132` |
| **U8** | ~~**测试只覆盖入口/出口，不覆盖「surface 里真有东西」**~~　**✅ 本轮已修**：新增 3 类测试 —— 跨端契约 fixture 比对、客户端渲染断言、SSE 字节回放 | 🟡 ~~中~~ → 已消 | `telencephalon/tests/a2ui.rs`、`shadow-mobile/test/widget/a2ui_contract_test.dart`、`a2ui_sse_replay_test.dart` |

### 6.1 U0 为什么排第一

```dart
// shadow-mobile/lib/widgets/chat/agent2ui_view.dart:103-120
child: surfaceIds.when(
  data: (ids) {
    if (ids.isEmpty) {
      return Center(
        child: Column(
          children: [
            Icon(Icons.psychology, ...),
            Text(l10n.agent2uiReady, ...),   // ← 「Agent2UI 就绪」
            Text(l10n.askMeAnything, ...),  // ← 「问我任何事」
          ],
```

⚠️ **判定条件只有 `ids.isEmpty`** —— 它**不检查**：
- 连接状态（`a2uiConnectionStatusProvider` 的值在这段代码里根本没参与判断）；
- 服务端是否真的会产出 A2UI。

⇒ 断开时显示「就绪」，服务端不存在时也显示「就绪」。
⇒ **用户看到的不是「等待」，是「承诺」** —— 这是最伤的一种空态。

⇒ **修 U0 只需要一个条件**：`ids.isEmpty && 连接状态 == disconnected` ⇒ 显示「未连接 / 服务不可用」；
`连接中` ⇒ 显示 spinner；`connected && ids.isEmpty` ⇒ 才显示「就绪，但服务端没给内容」。

---

### 6.2 U0 的修法与验证（本轮已做）

**修的不是「有没有界面」，是「界面上的字对不对」。**
服务端产出（U1/U2）是另一件事、另一个量级 ⇒ 本轮只做**零风险、不碰协议**的那一件：
**让空态说实话**。

### 改了什么

| 文件 | 改动 |
|---|---|
| `shadow-mobile/lib/l10n/app_{zh,en}.arb` | 新增 3 条：`agent2uiNoConnection` / `agent2uiWaiting` / `agent2uiSurfaceHint` |
| `shadow-mobile/lib/widgets/chat/agent2ui_view.dart:105-168` | 空态文案按**真实连接状态**三选一；副标题从「我会为您生成界面」改成只描述机制 |
| `shadow-mobile/lib/generated/l10n/*.dart` | `flutter gen-l10n` 重新生成 |
| `shadow-mobile/test/widget/agent2ui_empty_state_test.dart` | **新增** 3 条 widget 测试（此前 0 条覆盖空态） |

### 三个设计决定

1. **空态不复读状态栏。**
   状态栏（`agent2ui_view.dart:64-100`）已经讲「连上了没」；
   空态要讲的是「**缺什么**」。
   ⚠️ 复读不只是啰嗦 —— 它会让**同一句话在屏幕上出现两次**，
   断言时根本分不清说的是哪一块（**本轮真踩了这个坑**：改完第一版后测试报
   `Found 2 widgets with text "Connecting to Shadow..."`）。
   ⇒ 顺带修掉了一个 UI 层面的冗余。

2. **副标题原来那句也是假承诺。**
   `askMeAnything` = 「问我任何问题，**我会为您生成界面**」——
   端脑从不产出 A2UI ⇒ 这句话**永远不会兑现** ⇒ 换成
   `agent2uiSurfaceHint` =「服务端推送的界面会显示在这里」（只描述机制，不承诺结果）。

3. **`agent2uiReady` / `askMeAnything` 两个 key 保留在 arb 里**，
   但生产代码里**不再引用** ⇒ 它们现在只作为**回归断言的负面目标**存在
   （测试断言它们**不得**出现在界面上）。

### 验证

| 检查 | 结果 |
|---|---|
| 新增 widget 测试 | `flutter test test/widget/agent2ui_empty_state_test.dart` ⇒ **3 passed** |
| **反向验证** | 把空态改回旧行为（无条件 `l10n.agent2uiReady` + `l10n.askMeAnything`）⇒ **恰好 3 条全红**（`Found 1 widget with text "Agent2UI Ready"` / `means one was found but none were expected`）⇒ 恢复后全绿 ⇒ **这 3 条真的承重**，不是摆设 |
| 移动端全量单测 | `flutter test --concurrency=1` ⇒ 见文末「验证结果」 |
| 移动端静态检查 | `flutter analyze --no-pub` ⇒ 见文末「验证结果」 |

⚠️ **§6.2 当时没碰的**（入口按钮、地址、服务端产出、能力清单）——
**其中四件在本轮（§6.3）做掉了**：
入口保留、**地址改成跟随真实端口（U4）**、**服务端产出面接上了（U1/U3）**、
**A2UI 登记进能力清单（U5）**。

---

### 6.3 方向 B 的落地：服务端产出面（本轮已做）

> 这一节记录「把水管接上水源」这件事**具体做了什么**、**按什么契约做的**、
> **怎么证明它真的通了**。

### 6.3.1 线缆契约（客户端定的，服务端照着做）

⚠️ **A2UI 的协议是第三方包定的**（`genui` / `genui_a2ui` 0.7.0），
不是本项目自己定的 ⇒ **所有形状都必须对着客户端源码核**，
否则失败全是**静默**的。

| 项 | 客户端的规矩 | 证据（pub-cache 里的源码） |
|---|---|---|
| 请求打哪儿 | JSON-RPC `message/stream` **POST 到给它的那个 URL 本身** | `genui_a2ui/lib/src/a2a/client/sse_transport.dart:52` |
| 请求头 | `X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8` | `genui_a2ui/lib/src/a2ui_agent_connector.dart:39` |
| 响应形态 | SSE，每事件 `data: {json}\n\n` | `genui_a2ui/lib/src/a2a/client/sse_parser.dart:29-67` |
| ⚠️ **必须有 `result`** | 没有 `result` 的 JSON **被静默丢弃** | `sse_parser.dart:45-49` |
| 事件判别 | `result.kind ∈ {status-update, task-status-update, artifact-update}` | `genui_a2ui/lib/src/a2a/core/events.dart:19-77` |
| ⚠️ **载荷位置** | A2UI 载荷在 `status.message.parts[]` 里 **`kind:"data"` 的 part** | `genui_a2ui/lib/src/a2ui_agent_connector.dart:182-186`、`:213-216` |
| A2UI 消息 | `surfaceUpdate` / `dataModelUpdate` / `beginRendering` / `deleteSurface` | `genui/lib/src/model/a2ui_message.dart:19-33` |
| 组件形状 | `{"id": "...", "component": {"<类型名>": {<属性>}}}` | `genui/lib/src/model/ui_models.dart:174-183` |
| ⚠️ **目录** | 客户端按 `definition.catalogId ?? standardCatalogId` 找目录 | `genui/lib/src/core/genui_surface.dart:165` |
| ⚠️ **消息顺序** | `surfaceUpdate` 在根还没设时只**缓存**；`beginRendering` 才触发 `SurfaceAdded` | `genui/lib/src/core/a2ui_message_processor.dart:160-197` |

⇒ **服务端 `beginRendering` 故意不写 `catalogId`** —— 让客户端用自己的默认值，
两端不必为一个字符串硬耦合。

### 6.3.2 服务端做了什么

| 文件 | 内容 |
|---|---|
| `telencephalon/src/a2a/a2ui.rs`（**新增**） | **产出逻辑**：视图解析（metadata / `a2ui:<view>` 文本指令 / 关键词三档）、任务视图渲染、叶区视图渲染、A2A 事件封装。纯函数 ⇒ 可单测。14 条单测 |
| `telencephalon/src/api/a2ui_gateway.rs`（**新增**） | **HTTP 层**：`POST /a2a` —— A2A v0.3 JSON-RPC 入口，响应是 SSE |
| `telencephalon/src/api/mod.rs` | 把新 router 挂上去（与 `/a2a/tasks/send` **并存**） |
| `telencephalon/src/api/well_known.rs` | agent card 加 `capabilities.extensions` 声明 A2UI 扩展（**U3**） |
| `telencephalon/tests/a2ui.rs`（**新增**） | 集成测试：契约 fixture 比对 + 真起服务器读 SSE |

**端点为什么不放根路径**：根上还有 `/api/telencephalon/*`、`/shadow/v1/*` 一堆路由，
把 JSON-RPC 塞到根上会让「谁是 A2A 入口」变浑。
`/a2a` 本来就是 A2A 的地盘（`/a2a/tasks/send` 在那儿），扩展成
「A2A 的 v0.3 JSON-RPC 入口」是最自然的一步。

**路由不冲突**：axum 0.8.9 / matchit 0.8.4 只在**同一路径重复注册**时报冲突；
`/a2a` 与 `/a2a/tasks/send` 是两个不同节点
（仓内同类先例：`src/api/neuron_public.rs:48-53`）。

**视图怎么选**（三档，从最明确到最兜底）：

1. `params.message.metadata.a2ui.view`（对象）或 `metadata.a2uiView`（字符串）——
   显式指定但**不认识** ⇒ **不猜**，回纯文本；
2. 文本以 `a2ui:<view>` 开头（便于手测）；
3. 关键词（中英都认：「任务」「待办」「task」「todo」⇒ 任务看板）。

**当前两个视图**：

- `tasks` —— 端脑 `task_store` 里的真实任务 ⇒ 移动端目录里的 `TaskCard`
- `agents` —— 端脑 `lobe_cache` 里已注册的叶区 ⇒ `AgentStatusIndicator`

⚠️ **任务要排序**：`TaskStore` 底层是 `HashMap` ⇒ `list_tasks` 的顺序**不确定**
⇒ 不排的话同一个状态每次渲染顺序都可能变，跨端契约也没法钉死。

### 6.3.3 客户端做了什么

| 文件 | 内容 |
|---|---|
| `shadow-mobile/lib/providers/genui_provider.dart` | **U4**：地址不再写死 `localhost:60080`，改成跟随**嵌入式大脑的端脑面端口**（`encephalonMobileProvider` 的 `agentPort`，每次启动随机）⇒ 真机上必然连得上 |
| `shadow-mobile/lib/services/genui/gen_ui_agent_service.dart` | **配套 bug 修复**：`_onSurfaceAdded` 以前是无条件 `append` ⇒ 同一个 surface 重新 `beginRendering` 会出现**两份一样的界面**；而且它发的是**同一个 List 对象**（`List == List` 是引用比较）⇒ Riverpod 可能判定「值没变」而**不通知** |
| `agent-surface.json` + 两端 i18n/ARB | **U5**：A2UI 登记进能力清单（33 → 34 条）。它是**清单外功能** ⇒ 对跨端一致性检查完全隐形 |
| `shadow-mobile/test/widget/a2ui_contract_test.dart`（**新增**） | 跨端契约测试（下面） |
| `shadow-mobile/test/widget/a2ui_sse_replay_test.dart`（**新增**） | SSE 字节回放测试（下面） |

⚠️ **U4 为什么不用「读 client 的 baseUrl」**：
`A2uiContentGenerator` 在**构造时**把 URL 焊死（`A2uiAgentConnector.url` 是 final），
而 `GenUiConversation.contentGenerator` 也是 final ⇒ 只能**整个换掉 service 实例**。
⇒ provider 用 `watch` 盯着端脑面端口，端口一变就重建 service。

### 6.3.4 怎么证明它真的通了（两道跨端契约）

⚠️ **光看「服务端返回 200」证明不了任何事** —— A2UI 的失败全是静默的：
没有 `result` ⇒ 静默丢弃；载荷放错位置 ⇒ 静默丢弃；
组件类型不在客户端目录 ⇒ **只打一条 severe 日志**然后渲染空 `Container`。

⇒ 所以用**一份跨仓 fixture** 把两端钉在一起：

```
shadow/fixtures/a2ui/tasks_surface.json   ← A2UI 载荷（两端读同一份）
shadow/fixtures/a2ui/tasks_sse.txt        ← 端脑的真实 SSE 字节
```

- **端脑侧**（`telencephalon/tests/a2ui.rs`）：断言自己的产出**逐字**等于 fixture；
  再真起一个服务器、POST 上去、**逐条按客户端的解析规则**读 SSE
  （`result` 包层 / `kind` / `parts[].kind == "data"` / `final`）。
- **客户端侧**（`a2ui_contract_test.dart`）：把 fixture 喂给**真的**
  `A2uiMessageProcessor` + `ShadowCatalog` ⇒ 断言
  ① surface 真的被加进来、② 每个组件类型**都在客户端目录里**、
  ③ **渲染出来**（屏幕上能看到任务标题与优先级）。
- **客户端侧**（`a2ui_sse_replay_test.dart`）：起一个**真的本地 HTTP 服务**
  把端脑的**原始 SSE 字节**回放出去，让**真的** `GenUIAgentService`
  （→ content generator → connector → SSE 解析器 → 消息处理器）去连它
  ⇒ 只要有一个字节不对，surface 就不会出现。

⚠️ 两个 Dart 测试踩过的坑（都记在这儿）：
① `A2uiMessageProcessor._surfaceUpdates` 是**普通 broadcast** controller
（没有 `sync: true`）⇒ 事件**异步投递** ⇒ 不 flush 就断言会看到空列表；
② `flutter test` 的测试框架默认把**所有** HTTP 请求打成 400
⇒ 真实 socket 测试必须先 `HttpOverrides.global = null`。

### 6.3.5 ⚠️ 这一轮**没做**的（别当成做完了）

| 没做的 | 为什么 | 后果 |
|---|---|---|
| **LLM 驱动的「现场画界面」** | 现在的视图是**服务端按固定规则渲染**的，不是模型现场画的 | A2UI 的核心卖点还没兑现；要兑现得让模型产出组件树（工作量最大的那一步） |
| **界面文案本地化** | 服务端不知道客户端语言 ⇒ 服务端出的 chrome 文案是英文 | 界面里模型/服务端写的字是英文（任务标题等**用户数据**不受影响） |
| **老的 `/a2a/tasks/send` 保留 data part** | 那是给叶区用的 v0.1 契约，改它要动叶区 | **U2 只在 A2UI 这条路上解决了**（新端点不降维）；老路径仍只做文本 |
| **桌面端接入** | 桌面端已有等价机制（§7 方向 C） | 桌面端仍然零 A2UI ⇒ 三端仍不对齐 |
| `tasks/get` / `tasks/cancel`（U7） | 与 A2UI 无关 | 端脑的 A2A 任务查询/取消仍未实现 |
| 视图数量 | 只做了 2 个 | 移动端目录里另外 6 个组件（MemoryCard / ProgressStepper / NotificationToast / ToolCallCard / ConversationBubble / QuickActionButton）**还没有对应的服务端视图** |

---

### 6.4 第二片：把 `/a2a` 锁进 shadow key 后面（本轮已做）

#### 为什么这是**必须**的，不是「顺手加的」

⚠️ **这是本轮自己引入的缺口**——§6.3 把 `/a2a` 这个端点**新加**出来的时候，
它**没有**落在 shadow key 那道门后面：

| | 位置 | 有钥匙吗 |
|---|---|---|
| `/shadow/v1/*` | `api::shadow::router_with_store` ⇒ `.layer(from_fn_with_state(..., require_shadow_key))`（`src/api/shadow.rs:89-92`） | ✅ 有 |
| `/a2a` | `api::a2ui_gateway::router` ⇒ **单独 merge**（`src/api/mod.rs:98`） | ❌ **没有** |

而 `/a2a` **不是一张无害的静态面**——它把**任务标题**、**agent 名字**
渲染成组件树吐出来 ⇒ 它是一张**数据面**。

它的可达范围还都不小：

- **手机上**：端脑面绑 `127.0.0.1`（`encephalon/src/mobile/mod.rs:418`），
  但 **loopback 不区分进程** ⇒ **同设备上任何别的 App 都能打这个端口**
  （与当初 `/shadow/v1/*` 上锁的理由**一模一样**）。
- **桌面上**：默认 `bind.http = "0.0.0.0:60080"`（`src/config/loader.rs:56`）
  ⇒ **局域网可达**。

⇒ 一张**新开的、会吐用户数据、局域网可达**的面，正是这个仓这几个月一直在
一道一道关的门。留着它 = 把刚补上的洞又开了。

#### 修法：一份实现，两处用

安全门**抄两份** ⇒ 迟早漂成「一张面锁了、另一张面忘了」，而且**不会报错**。
⇒ 把 `require_shadow_key` 从 `api::shadow` 抽到**共享模块**
`telencephalon/src/api/shadow_auth.rs`，`/shadow/v1/*` 与 `/a2a` 共用**同一份实现**：

| 文件 | 改动 |
|---|---|
| `telencephalon/src/api/shadow_auth.rs` | **新增** —— 门本体（`require_shadow_key` + `constant_time_eq`）与「为什么要有这道门 / 为什么共用一份」的说明 |
| `telencephalon/src/api/shadow.rs` | 删掉本地的门、改为 `use crate::api::shadow_auth::require_shadow_key`（`:49`） |
| `telencephalon/src/api/a2ui_gateway.rs` | `.layer(from_fn_with_state(state.clone(), require_shadow_key))`（`:53-56`） |
| `telencephalon/src/api/mod.rs` | `pub mod shadow_auth;`（`:31`） |

⚠️ **开发模式的行为一字不变**：`shadow.api_key` 为空 ⇒ 全放行
（`shadow_auth.rs` 里 `if expected.is_empty() { return Ok(next.run(req).await) }`）
⇒ 桌面上没配文件的老 setups 不会突然 401。**这一点专门写了测试**
（`dev_mode_without_a_key_still_serves_a2ui`）——否则「锁了」很容易变成
「行为变更」而不是「修漏洞」。

#### 客户端：自己造 transport + **钥匙在请求时现读**

⚠️ **默认的 connector 加不了头**：`A2uiAgentConnector` 把请求头**焊死**在
构造函数里（`genui_a2ui-0.7.0/lib/src/a2ui_agent_connector.dart:36-40`）
⇒ 外面没法塞 `X-Shadow-Key`。
⇒ 只能**自己造**：它接受注入（`A2uiAgentConnector({required this.url, A2AClient? client})`
+ `A2uiContentGenerator({required Uri serverUrl, A2uiAgentConnector? connector})`）
⇒ 新文件 `shadow-mobile/lib/services/genui/shadow_key_sse_transport.dart`。

⚠️ 但 `A2AClient` / `SseTransport` **不在 `genui_a2ui` 的公开 API 里**
（`lib/genui_a2ui.dart` 只导出 connector 与 content generator）
⇒ 只能**实现级导入**（`package:genui_a2ui/src/a2a/client/...`），
已在文件头 `// ignore_for_file: implementation_imports` 并写明理由。

**自己造 transport 最容易漏的两件事**（都有断言钉着）：

1. **`X-A2A-Extensions` 忘了带** ⇒ 服务端认不出这是 A2UI 请求。
   ⚠️ 它**不能**靠 per-call 头补：`A2AClient.messageStream` 只在
   `message.extensions != null` 时才加这个头（`a2a_client.dart:191-193`），
   而 A2UI 的发送路径**不带** extensions ⇒ 只能靠 `authHeaders`。
2. **`X-Shadow-Key` 忘了带** ⇒ 真机上是 401，而且**界面上什么都不显示**
   （`A2uiContentGenerator` 的错误只进 `errorStream`）。

**「钥匙在请求时现读」是刻意的设计**，不是偷懒：

> 真实时序是「**地址先到、钥匙后到**」——嵌入式大脑起来 ⇒ 状态里有了
> `agentPort` ⇒ A2UI 的地址确定了（`providers/genui_provider.dart` 的
> `a2uiServerUrlProvider`）；**之后**宿主才把钥匙交给端脑 client
> （`EncephalonMobileNotifier._pointClientsAtAgentSurface`）。
>
> 若在**构造时**把钥匙焊死 ⇒ 有一个窗口「指着新地址、却还没带钥匙」
> ⇒ 请求 401 ⇒ 而 **401 比 connection refused 难查得多**（前者是
> 「到了但被拒」，后者是「根本没人听」）。

⇒ 所以传下去的是**回调**（`String? Function()? shadowKeyProvider`），
发请求的那一刻才问「现在的钥匙是几号」。

**钥匙的真相来源**：`TelencephalonClient.apiKey`
（`shadow-mobile/lib/services/telencephalon/telencephalon_client.dart:674`）
—— 端脑 client 自己发 `/shadow/v1/*` 时用的就是同一个值（`_headers()` 里的
`X-Shadow-Key`）⇒ 两边**天然一致**，不会各持一份而漂移。

⚠️ **这把钥匙绝不能进日志**：它**不是**用户凭证、**不出设备**。
与账号密钥（`identity/account.key` = 身份本身）是两回事。

#### 这一片**没做**的

| 没做的 | 为什么 | 后果 |
|---|---|---|
| **移动端为「外部端脑」配 shadow key 的入口** | 移动端切回外部端脑时会把钥匙清成 `null`（`encephalon_mobile_provider.dart:475`）——因为嵌入式那把**只对嵌入式端脑有效** | 外部端脑**自己配了** shadow key 时，移动端 A2UI 会 401（**只影响 A2UI**，其它 `/shadow/v1/*` 调用同样受影响，与本片无关）⇒ 属**既有缺口**，不是本片引入 |
| **桌面端的 A2UI 客户端** | 桌面端还没有 A2UI 栈（§7 方向 C） | 桌面端不会去调 `/a2a` ⇒ 不受这道门影响 |
| **admin 面** | `/a2a` 用的是 **shadow key**，不是 admin token | 两把钥匙的域是分开的（见 `boot.rs:73-77` 的注释）——**一把钥匙不能开两把锁** |



---

## 6.5 第三片：桌面端接入（方向 C 第一片 · 本轮已做）

> ⚠️ 先说**这一片没有照着 §7 方向 C 的建议做** —— 能力清单里写的是
> 「更划算的是让现有那套渲染（`ToolPartRouter` / `ClientToolForm` /
> `ToolCallMessageCard`）接受 A2UI 的数据模型，而不是再实现一遍协议栈」。
> **本片没有这么做**，而是**在 TypeScript 里另写了一份协议栈**。
> 理由与代价都记在下面 —— 这是一个**偏离**，值得被复核，而不是被默认接受。

### 6.5.1 为什么必须自己写协议栈（这是硬约束，不是选择）

`genui` / `genui_a2ui` 是 **Flutter 包**（Dart），而桌面端是 React/TS + Tauri
⇒ **进程里没有 Dart 运行时** ⇒ 那套协议栈在桌面端**一行都跑不了**
（`shadow-desktop/package.json` 里也确实没有 `genui` 依赖）。

⇒ 「再实现一遍协议栈」不是偷懒，是**唯一可行解**。
清单里那条「更划算」的建议，在「桌面端要**消费** A2UI」这件事上**不成立**。

### 6.5.2 但「为什么不复用现有那套渲染」是**我的判断**，不是硬约束

现有的对话内组件渲染机制吃的是 **AI SDK 的 `UIMessage` part 形状**
（`ToolPartRouter` 的入参是 `ToolUIPart`），并且它长在**聊天消息列表**里。

而 A2UI 的 surface 是**另一条链路**：
它有**自己的 surface id**、**自己的组件树**、**自己的请求**
（`POST {baseUrl}/a2a`），**不是一条聊天消息**。

⇒ 要复用，就得让**聊天消息 store** 学会「有一类东西不是消息」——
那会把两套模型搅在一起，而搅在一起之后，**「这条消息带的是什么」**这个问题
会同时有两个答案。

⚠️ **代价要说清楚**：这一片因此多了一份协议栈（~250 行 TS）。
如果将来 A2UI surface 要**内联进对话流**（像一条消息那样出现在历史里），
那清单里那条建议就**更划算**了 —— 到那时应该合并，而不是继续维护两份。
**现在**这两件事的形态差别足够大，分开是更小的风险。

### 6.5.3 这一片做了什么

| 文件 | 作用 |
|---|---|
| `shadow-desktop/src/lib/a2uiProtocol.ts`（新） | **纯协议**：SSE 分帧、A2UI 载荷抽取、surface 模型。不碰网络、不碰 React |
| `shadow-desktop/src/lib/a2uiClient.ts`（新） | `POST {baseUrl}/a2a` + `X-Shadow-Key` + `X-A2A-Extensions` + 流式 SSE 读取 |
| `shadow-desktop/src/components/chat/A2uiSurface.tsx`（新） | 渲染面：`Column` / `Text` / `TaskCard` / `AgentStatusIndicator` |
| `shadow-desktop/src/components/chat/A2uiPanel.tsx`（新） | 入口面板：加载 / 空 / 错误 / 就绪 四态 + 视图切换 |
| `shadow-desktop/src/components/chat/__tests__/a2ui.test.tsx`（新） | **13** 条测试 |
| `shadow-desktop/src/pages/ConversationPage.tsx`（改） | 一个按钮 + 面板挂载（**只改这一个文件**） |
| `shadow-desktop/src/i18n/{en-US,zh-CN}.json`（改） | 新增 `a2ui.*` 4 个 key（**放在文件末尾**，避开并行会话正在改的 `surface` 段） |
| `agent-surface.json`（改） | `a2ui.desktop` 从「零实现」改写成「已落地 + 入口在哪」 |

### 6.5.4 ⚠️ 四个「照抄协议，不自作主张」的地方

1. **两段式语义**：`surfaceUpdate` 只**缓存**组件，`beginRendering` 才**开始渲染**
   （`genui-0.7.0/lib/src/core/a2ui_message_processor.dart:160-197`）
   ⇒ 桌面端的 `A2uiSurfaceModel.renderableSurfaces` **只收**收到过
   `beginRendering` 的 surface ⇒ 不会画出「组件还没到齐」的半成品。
2. **载荷位置**：`result.status.message.parts[]` 里 `kind === "data"` 的 part
   ⇒ 与 Dart 那边的解析器**同一套路径**（`sse_parser.dart:45-49`、
   `a2ui_agent_connector.dart:182-186`）。
3. **扩展声明走请求头**：`X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8`
   ⇒ 与移动端自造 transport 时的 `authHeaders` **同一个常量**。
4. **状态 / 优先级显示**协议原值（`in_progress`、`HIGH`）而**不翻译**
   ⇒ 移动端也是这么做的（`shadow_catalog.dart:90` 渲染 `priority.toUpperCase()`）
   ⇒ 两端对**同一个 surface** 的读法不会分叉。

### 6.5.5 ⚠️ 四个「我自己的判断」

1. **视图用 `metadata.a2ui.view` 显式指定**，不靠关键词。
   端脑认三档（显式 metadata / 文本前缀 / 关键词），
   而关键词匹配会**被用户文案带偏**（用户说「我的日程」就不命中「任务」）
   ⇒ 桌面端用最明确的那一档（`telencephalon/src/a2a/a2ui.rs` 的 `resolve_view`）。
2. **「空」与「失败」分开**。端脑对「这次没有可渲染的视图」的回答是**一段纯文本**
   （`a2ui_gateway.rs` 的 `text_reply`），**不是错误**
   ⇒ 面板把它渲染成自己的一个状态（把大脑的原话显示出来），
   而不是笼统的「无数据」—— 那样会把**大脑说了什么**藏起来。
3. **未知组件类型降级成占位**，不抛异常
   ⇒ 新版大脑不能把旧版桌面端**白屏**。
4. **判环守卫问的是「你是不是我的**祖先**」，不是「我见过你没有」**
   ⇒ 第一版用的是「全树已见集合」⇒ **同一个组件被引用两次时，第二次会整个消失**
   （用户会莫名少一块界面）。**已改成祖先路径**（每层一份拷贝）
   ⇒ 重复引用**照画两次**，自引用仍然被截断（不会爆栈）。
   ⇒ 这一条是**写测试时才发现的**（`renders a component that is referenced twice, twice`），
   **不是**读代码时想到的。

### 6.5.6 钥匙：桌面端**没有**新开一条通道

面板的钥匙来自 `telencephalonClient.getApiKey()`
⇒ **与桌面端现有的 `/shadow/v1/*` 请求用的是同一个值、同一个真相来源**
⇒ **不会**出现「A2UI 带了钥匙、其它请求没带」这种分叉。

⚠️ **已知的既有缺口（不是这一片引入的）**：桌面端**没有**输入 shadow key 的界面
（`telencephalonStore` 里有 `connection.apiKey` 且会持久化、rehydrate 时会补设，
`IdentityPanel.tsx:43` 也在读它，但**没有设置入口**）
⇒ 若用户只在端脑的 `config.toml` 里配了 `telencephalon.shadow.api_key`、
而桌面客户端手里没有 ⇒ 面板会 **401**（面板会**明说**「缺少或错误的 shadow key」）。
⚠️ **这与桌面端其它所有请求的处境完全一样** —— 那一格是**早就欠着的**，不是这一片欠的。

### 6.5.7 跨端契约：桌面端成了**第三个消费者**

`shadow/fixtures/a2ui/tasks_sse.txt`（端脑的**真** SSE 字节）与
`tasks_surface.json`（规范组件树）现在有**三个**消费者：

- **服务端**（Rust）：产出**逐字**等于 `tasks_surface.json`；
- **移动端**（Dart）：把同一份字节喂给**真的** `genui` 处理器 + 目录；
- **桌面端**（TS，本片）：把同一份字节喂给**真的** TS 协议栈，
  并断言「解析出来的组件树 == 规范 fixture 的组件树」。

⇒ **协议漂移会在这里现形**：任何一端改了线缆，三端至少有一处会红。

### 6.5.8 活体联调（另一台会话补上，2026-10-31 21:55）

`a2ui.live.test.tsx`（4 条）+ `scripts/start-a2ui-live-brain.ps1`（起一台端脑来复跑，带 `-Stop`）
⇒ **桌面端第一次真的对着活的端脑跑完整条链路**。

它带出四条**只有活体才验得到**的发现 —— 每一条都是「录下来的字节永远验不到」的那类：

1. **门真的在** —— 不带 shadow key ⇒ **401**（fixture 是带钥匙的请求录的，验不到这条）。
2. ⚠️ **jsdom 的 `AbortSignal` 与 undici 的不是同一个类** ⇒ 面板内部自建的
   `AbortController` 一交上去，undici 直接拒收（`Expected signal ("AbortSignal {}")
   to be an instance of AbortSignal`）⇒ **在 jsdom 下**，面板对真端脑的每一次请求
   都会当场失败 ⇒ 解法是注入一个**丢掉 signal** 的 fetch 适配器。
   ⚠️ **这个坑仓库里早就记过**（`vitest.config.ts` 的注释写着 `tests/api-contract/**`
   那个真实 HTTP 探测套件在 jsdom 下「静默退化成空跑」）⇒ **同一块石头**。
   ⚠️ **生产环境不受影响**：Tauri 的 webview 里 `window.fetch` 与
   `window.AbortController` **同属一个 realm** ⇒ 不会有这个不匹配。
3. **端脑的任务排序是（状态 → 优先级 → 标题字典序）** ⇒ **第一张卡不是最新的那条**
   ⇒ 断言必须**按标题找**，不能按下标找。
4. **`/a2a` 在任务库为空时也会吐 surface**（`Tasks (0)`）⇒ 纯文本那条分支只在
   「**视图不认识**」时走 ⇒ ⇒ **「空 / 失败」在协议层其实是三种状态**
   （有内容 / 有 surface 但空 / 纯文本），桌面端面板目前把它们并成两种
   ⇒ **值得下一片拆开**。

### 6.6 真机实测（2026-11-01）：**手机真的把界面画出来了**

> ⚠️ 承 ㊼ 条 ⑦ 说的那句「**还差的是『桌面客户端真的把界面画出来』那段运行时证据**」
> —— 桌面端那段在 §6.5.8 补上了（另一台会话），**手机那段本轮补上**。

#### 6.6.1 为什么这一片是**必需**的：证据链中间那截一直是空的

到本轮为止，A2UI 这条链的证据是**三段拼起来**的：

| 段 | 证据 | 它证明什么 |
|---|---|---|
| 端脑侧 | Rust 单测 + JNI 宿主直测（真 `.so`、真嵌入式端脑） | `/a2a` 真的在吐 surface |
| 桌面侧 | `a2ui.live.test.tsx`（§6.5.8） | 桌面客户端真的对着**活的**端脑画出了 DOM |
| 移动侧 | `test/widget/a2ui_*_test.dart` | ⚠️ **喂的是录下来的字节** |

⇒ **中间那截是空的**：没有任何一份证据说明「**手机**真的把界面画出来」。
录下来的字节证明不了它 —— 真机上还多出三件录下来的字节里没有的东西：

1. **地址**：端脑面端口**每次启动随机分配**
   （logcat：`✅ Encephalon started on port 42157 (agent surface: 40103)`）；
2. **钥匙**：`X-Shadow-Key`（手机那把是 Kotlin 侧生成、同时递给端脑的）；
3. **真机渲染**：Flutter 的 widget 树、目录校验、SSE 逐块解码。

#### 6.6.2 怎么复跑：`scripts/prove-a2ui-on-device.ps1`

**设备**：`ee6b4832`（小米 2106118C / Android 13），装的是 `com.ibloc.shadow`
（`lastUpdateTime = 2026-11-01 00:06:35`，**晚于** A2UI 那笔 Dart 提交
`6462ede`（23:49:36）⇒ 装上去的那份**含** A2UI 客户端）。

脚本干的事（**7 条机器可判** + 1 张截图）：

```
设备：ee6b4832
端脑面端口：40587
映射：http://127.0.0.1:40539 ⇒ 设备上的 40587
钥匙已取到（长度 shadow=43 / admin=43，**不打印**）
任务已建：A2UI-device-proof-1793464479
探针 A（无钥匙）⇒ HTTP 401
探针 B（对钥匙）⇒ HTTP 200  content-type=text/event-stream
  ✓ 无钥匙 ⇒ 401
  ✓ 对钥匙 ⇒ 200
  ✓ 响应是 SSE
  ✓ 载荷里有 surfaceUpdate
  ✓ 载荷里有 beginRendering
  ✓ surface id 是 shadow.tasks
  ✓ 载荷里有刚建的那条任务
✓ 探针全过
驱动界面：进 A2UI → 发 a2ui:tasks
截图：artifacts/a2ui-device/a2ui-device-proof.png
⇒ 真机 A2UI 链路成立。
```

⚠️ **它凭什么能拿到钥匙**：`com.ibloc.shadow` 是 **debuggable** 的
（`dumpsys package` ⇒ `flags=[ DEBUGGABLE HAS_CODE … ]`）
⇒ `adb shell run-as com.ibloc.shadow cat files/shadow.key` 可读（43 字符）
⇒ **钥匙只进 HTTP 头，绝不打印**（与「两把钥匙都只写文件、不打印」那条纪律一致）。

⚠️ **判据为什么是「机器可判」**：断言里带的是**本次运行独有**的任务标题
（`A2UI-device-proof-<unix秒>`）⇒ 「载荷里有刚建的那条任务」这条断言
**不可能**被录下来的字节满足 ⇒ 它验的是**活的数据**，不是形状。

#### 6.6.3 真机上的读数：四种组件**全部**验到

截图里能看到（`artifacts/a2ui-device/a2ui-device-proof.png`）：

- 状态栏：**「已连接到 Shadow A2A 服务器」**（绿灯）⇒ 客户端带对了钥匙；
- `Tasks (1)` ⇒ `Text` 组件（服务端给的标题，**英文**）；
- 任务卡 `A2UI-device-proof-1793464479` + 描述 + **HIGH** 徽标 ⇒ `TaskCard` 组件；
- `Agents (4)` 四行 ⇒ `AgentStatusIndicator` 组件（parietal / occipital / prefrontal / temporal）；
- 整棵树的根 ⇒ `Column` 组件。

⇒ **四种组件在真机上第一次全部验到**（桌面端那侧只画前两种是常态，因为它的
两个视图分别只用到 `Text` + `TaskCard` / `Text` + `AgentStatusIndicator`）。

⚠️ **另一个只在真机上才看得见的语义**：**同一个 surface 是「就地更新」，不是「再开一个」**。
第一次请求 `a2ui:tasks` 得到 `Tasks (0)`，第二次请求**没有**开出第二个 `Tasks`，
而是**同一个位置**换成了 `Tasks (1)` ⇒ A2UI 的「界面被更新」语义在真机上成立
（端脑给的 surface id 是**按视图稳定**的：`shadow.tasks` / `shadow.agents`）。

#### 6.6.4 ⚠️⚠️ 真机才暴露的两个坑（脚本第一版就卡在这）

1. **App 已经在跑时 `am start` 不会重启它** ⇒ 实测回的是
   `Warning: Activity not started, intent has been delivered to currently running top-most instance.`
   ⇒ **不会**有新的「Encephalon started」那行 ⇒ 而 logcat 又被 `-c` 清过
   ⇒ ⇒ **端口永远读不到** ⇒ 脚本第一版直接卡死在这儿
   ⇒ ⇒ **必须先 `am force-stop` 再起**（⇒ 端脑重启 ⇒ 端口换新的 ⇒ 必须起完再读）。
2. **`adb shell input tap` 要 x y 两个坐标**，不是一个 ⇒ 第一版写成单值
   ⇒ 设备回 `IllegalArgumentException: Argument expected after "480"`。
   ⇒ ⇒ 脚本的参数改成 `"x,y"` 坐标对。

⇒ **教训**（㋉ 条那条纪律的又一次兑现）：**「跑通了」不等于「脚本能复跑」** ——
手动点的每一步都可能藏着一个「当时恰好成立」的前提。

#### 6.6.5 ⚠️⚠️ 顺手逮到：「失败长得像成功」的**第二处复发**

真机截图上，`Agents (4)` 那四行是**绿点**。而那四条是端脑启动时**自己种下**的
**占位**叶区（prefrontal / temporal / parietal / occipital）⇒ 它们
**从来没被联系过** ⇒ 端脑在**另一张面**说的是实话：

```
GET /api/telencephalon/agents
  ⇒ {"name":"parietal", …, "health_status":"unknown", …}
```

⇒ ⇒ **两张面互相矛盾**：一张说「我们没联系过它」，另一张画**绿灯**
（绿灯在那套目录里是 `idle` = 「就绪」）。

**根因**：`render_agents` 拿 `enabled` 当「它活着」——
`enabled` 是**配置**（用户把它开着了没），**不是事实**（它到底活着没）。
占位记录 `enabled = true`（默认）⇒ 于是报 `idle` ⇒ **绿灯**。

⇒ 这正是 ㋂ 条那条教训（「端脑知道自己有哪些叶区、它们是否健康这件事，
**有一半是编的**」）在**新面**上的复发 —— 那一档修的是
`/api/telencephalon/agents` 那张面（`health_status` ⇒ `Unknown`），
**A2UI 这张面没跟着改**。

⚠️ **手机上尤其糟**：`AgentStatusIndicator` 在手机上**只显示颜色、不显示 status 文本**
⇒ **颜色就是全部的话** ⇒ 落绿 = 撒谎。

**修（三端一起，单一真相源在服务端）**：

| 位置 | 改动 |
|---|---|
| `telencephalon/src/a2a/a2ui.rs:303` | 新增 `agent_status()`：`Healthy` ⇒ `idle`、**`Unknown` ⇒ `unknown`**、`Degraded`/`Failed` ⇒ `error`、`!enabled` ⇒ `error` |
| 同上 `:319` | 新增 `agent_message()`：`Unknown` ⇒ `"not probed"`（技能列表不该冒充状态） |
| `shadow-mobile/lib/services/genui/shadow_catalog.dart:208` | 目录加 `unknown` 档（灰 + 问号）；⚠️ **`default` 也落灰**（端脑多说一个词 ⇒ 同样不许落绿） |
| 同上 `:187` | ⚠️ **缺 `status` 声明 ⇒ 缺省落 `unknown`**，不落 `idle`（「没说」和「没事」是两件事） |
| `shadow-desktop/src/components/chat/A2uiSurface.tsx:96` | `AGENT_STATUS_STYLE` 加 `unknown`（虚线框，形状上与 `idle` 分得开）；`:255` 的**兜底从 `idle` 改成 `unknown`**；缺省同样落 `unknown` |

⚠️ **「兜底不许落回 `idle`」这一条最要紧** —— 端脑哪天多说一个词，
客户端**不认识** ⇒ 旧代码会把它画成 `idle` ⇒ 又一次「失败长得像成功」。

**证据（三端各一条 + 反向验证三连）**：

- 端脑侧 `telencephalon/tests/a2ui.rs`：
  `agents_view_does_not_claim_health_it_never_measured` —— 它**同时**读
  `/api/telencephalon/agents`（端脑自己那张面）与 `/a2a`（A2UI 那张面）
  ⇒ 断言「两张面说同一句话」⇒ **10 passed / 0 failed**；
  ⚠️ **反向验证**：把 `Unknown` 改回 `idle` ⇒ **恰好 1 红**，其余 9 条仍绿，
  失败信息是人话：「⚠️ 从没被探活过的叶区不许报 idle（绿灯 = 就绪）：["idle","idle","idle","idle"]」；
- 移动端 `test/widget/a2ui_agent_status_honesty_test.dart`：断言**颜色**（手机只显示颜色）
  ⇒ ⚠️ **反向验证**：把 `default` 改回绿色 ⇒ 红；把缺省改回 `idle` ⇒ 红（line 130）；
- 桌面端 `a2ui.test.tsx`：断言**形状**（虚线框）与 `data-status`
  ⇒ ⚠️ **反向验证**：把兜底改回 `idle` ⇒ **恰好 1 红**，其余 15 条仍绿。

#### 6.6.6 还欠的（本轮没做，已记）

1. ⚠️ **服务端出的界面文案仍是英文**（`Tasks (1)` / `HIGH` / `not probed`）
   ⇒ ⇒ **已在 §6.7 落地**（文案随用户的语言走；**协议值** `HIGH` 仍留英文）
   ⇒ 桌面端与手机端的界面是**中英混排** ⇒ 国际化只做在**客户端诊断文案**上，
   **没做在服务端产出的界面内容**上。
2. ⚠️ **「空 / 失败」三态**（§6.5.8 ④）仍然并成两种（`Tasks (0)` 现在被当「成功」）
   ⇒ ⇒ **已在 §6.8 落地**（三种回答分开显示；纯文本不再被说成「没数据」；失败显示真实原因）。
3. ⚠️ **设备端（ESP32）零 A2UI** ⇒ ⇒ **已定：不是欠账**（ESP32 只是**输入设备**，2026-11-01 用户定）。
4. ⚠️ **桌面端没有 shadow key 输入入口**（既有缺口，§6.5.6）⇒ 端脑配了 key 而桌面端没有 ⇒ 面板 401（面板会明说）。

### 6.7 界面文案随用户的语言走（2026-11-01）：**端脑说的那句话，改成用户的话**

> 承 §6.6.6 第 1 条（「服务端出的界面文案仍是英文 ⇒ 两端界面中英混排」）
> ⇒ **本片已把它做掉**（证据见 §6.7.5）。

#### 6.7.1 为什么这一片是**必需**的：界面上的**字**也是端脑产的

A2UI 的设计前提是「**大脑决定屏幕长什么样**」
（`telencephalon/src/a2a/a2ui.rs` 的模块注释）⇒ 屏幕上的**字**也是大脑产的
⇒ 那些字理应跟用户说的话是**同一种语言**。

而本片之前，端脑产的字**永远是英文**：

- `Tasks (1)` / `Agents (4)`（标题）
- `No tasks yet.` / `No agents registered.`（空态那句话）
- `not probed` / `disabled`（叶区状态旁边那句人话 —— 承 ㉝ 条「诚实性」）

⇒ ⇒ 桌面端（中文 UI）与手机端（中文 UI）**都**是**中英混排**：
**用户看到的是「任务看板」旁边一个英文的 `Tasks (1)`。**

#### 6.7.2 门形：`Accept-Language`（为什么不是请求体里的 `metadata`）

**走 HTTP 标准头 `Accept-Language`** ⇒ 客户端报「我要哪种语言」，端脑据此产出。

⚠️ **为什么不用请求体里的 `metadata.a2ui.locale`**（那本来更「显式」）：
**移动端那条路不归客户端管** —— 请求体是 `genui_a2ui` 的 `A2AClient` 造的
（`genui_a2ui-0.7.0/lib/src/a2a/client/a2a_client.dart`），
App 只能在 **transport** 这一层插手 ⇒ **能稳定插手的只有请求头**
⇒ 两端用**同一个机制**，不必「桌面端走 metadata、手机端走头」。

⚠️ **缺省必须是英文**：没有这个头 ⇒ 英文 ⇒ 与本片之前**逐字相同**
⇒ 跨端契约 fixture（`fixtures/a2ui/tasks_surface.json`）**继续有效**
⇒ **旧客户端完全不受影响**。

#### 6.7.3 端脑这一侧：新增 `src/a2a/a2ui_i18n.rs`

- `UiLocale { En, Zh }` + `from_accept_language()`
  （按 `q` 降序挑、`q=0` 丢弃、**不认识的语言落英文 —— 不猜、不机翻**）。
- 文案目录：标题 / 空态 / **诚实性说明** / 「这里能看什么」的提示。
- ⚠️ **只翻自由文案**：`status` / `priority` 是 **A2UI 目录里的枚举**
  （`shadow-mobile/lib/services/genui/shadow_catalog.dart:23-28`）
  ⇒ 翻了它客户端就**解析不出来** ⇒ **协议值必须留在英文**（详见 §6.7.6）。
- 接线：`a2ui.rs` 的 `render_tasks` / `render_agents` / `agent_message` /
  `available_views_hint` 多带一个 `locale`；
  `api/a2ui_gateway.rs` 从 `HeaderMap` 里读那个头。

#### 6.7.4 两端那一侧：各自报出自己的语言

| 端 | 报什么 | 在哪儿 |
|---|---|---|
| 桌面端 | i18next 的 `i18n.language`（`zh-CN` / `en-US`） | `A2uiPanel.tsx` → `a2uiClient.ts` 的 `buildA2uiHeaders` |
| 移动端 | App 的语言（= 系统语言：`main.dart` 用 `AppLocalizations.supportedLocales` + `basicLocaleListResolution`，**没有 App 内语言开关**） | `ShadowKeySseTransport` 的 `sendStream` |

⚠️ **两端都是「请求时现读」**（与那把钥匙同一个套路）：
用户换语言 ⇒ 下一次请求就该换语言 ⇒ **构造时取值 ⇒ 界面停在旧语言**。

#### 6.7.5 证据

- **端脑**：`cargo test -p telencephalon --test a2ui` ⇒ **12 passed / 0 failed**
  （新增 2 条：`the_brain_speaks_the_language_the_client_asked_for` ——
  **真 HTTP** + **桌面端逐字相同的请求体**；
  `the_honesty_note_also_follows_the_language` —— 「尚未探活」那一句也跟着语言走）；
  a2ui 相关内联单测 **25 passed**（新增 8 条头解析 + 1 条渲染）；
  全量 lib **670 passed / 0 failed**。
- ⚠️ **反向验证**：把网关那行「读 `Accept-Language`」打断（`from_accept_language(None)`）
  ⇒ **恰好 2 条红**（那两条新集成测试），其余 10 条仍绿
  ⇒ **断言有分辨力，不是恒绿**。
- **桌面端**：`a2ui.test.tsx` ⇒ **19 passed**（新增 3 条：客户端带语言 /
  没语言时**不带** / 面板把 i18n 的语言交下去）；
  全量 **124 文件 / 1233 通过 / 0 失败**；`tsc --noEmit` EXIT=0；`eslint` EXIT=0。
- **移动端**：新增 `test/widget/a2ui_locale_test.dart`
  （**起真的本地 HTTP 服务**、回放端脑**真实** SSE 字节 ⇒ 断言请求头里的
  `accept-language`，且**两次请求分别是 en / zh** ⇒ 证明「请求时现读」）；
  全量 **390 passed**；`flutter analyze` **76 issues（基线持平）**，
  我改的那 4 个文件**零 issue**。

#### 6.7.6 ⚠️ **不翻协议值**（为什么 `HIGH` / `in_progress` 还在英文）

`TaskCard.status` / `TaskCard.priority` / `AgentStatusIndicator.status`
是 **A2UI 目录里的枚举取值** ⇒ 客户端按枚举解析
⇒ **翻了它们界面会解析不出来**
⇒ ⇒ **协议值留在英文**（两端一致，承 §6.5.5 ④）。

⚠️ 所以中文界面里仍会看到 `HIGH` / `in_progress` —— 那是**协议值**，不是文案。
⇒ 真要连它们一起翻，得先改 A2UI 目录（两端 + 协议）⇒ **不在本片范围**。

#### 6.7.7 还欠的（本片没做，已记）

1. ⚠️ **协议值仍是英文**（见 §6.7.6）。
2. ⚠️ **服务端只有中英两种**；其它语言一律落英文（**不猜、不机翻**）。
3. ⚠️ **移动端真机还没验过这一条** —— 设备上那份 APK 与内嵌端脑都是**旧的**
   ⇒ 要看到中文界面，必须**重编 `libencephalon.so` + 重打正牌 APK + 安装**
   （已交棒给设备那条会话）⇒ 端脑侧与客户端侧都已验，**真机那一截还欠**。
4. ⚠️ **「空 / 失败」三态**（§6.6.6 第 2 条）⇒ ⇒ **已在 §6.8 落地**（三种回答分开显示；纯文本不再被说成「没数据」；失败显示真实原因）。
5. ⚠️ **桌面端没有 shadow key 输入入口**（§6.6.6 第 4 条）仍未补。
6. ⚠️ **设备端（ESP32）零 A2UI** ⇒ ⇒ **已定：不是欠账**（ESP32 只是**输入设备**，2026-11-01 用户定）。

### 6.8 「空 / 失败」三态（2026-11-01）：**端脑说的每一句，都得如实显示**

> 承 §6.6.6 第 2 条（「空 / 失败」三态仍然并成两种」）
> ⇒ **本片已把它做掉**（证据见 §6.8.5）。

#### 6.8.1 为什么这一片是**必需**的：协议层本来就有三种结果，客户端并成了两种

端脑对一次 A2UI 请求只有三种回答（`telencephalon/src/api/a2ui_gateway.rs`）：

| # | 端脑的回答 | 线上是什么 |
|---|---|---|
| 1 | 画一个**有内容**的 surface | `surfaceUpdate` + `beginRendering` |
| 2 | 画一个**空的** surface | 同上，但里面**只有文字**（`Tasks (0)` / 「还没有任务」） |
| 3 | **不画**，回一段**纯文本** | 一个 `kind: "text"` 的 part（「这里能看什么」） |

⚠️ 第 3 种在**移动端是真实可达**的：手机把用户的**自由输入**发给端脑
⇒ 视图没命中 ⇒ 端脑回 `views_hint`（`a2ui_gateway.rs:116`）。

而客户端把三种**并成了两种**，还**丢了两样东西**：

- **桌面端**：纯文本与「什么都没有」并成 `empty` ⇒ 界面上先压一句
  **「暂无数据」**，**再**显示端脑的原话
  ⇒ ⇒ **「端脑明明说了话」被说成「没有数据」**（旧 `A2uiPanel.tsx` 的 `empty` 分支）。
- **移动端**：端脑的原话**只进了日志**（`gen_ui_agent_service.dart` 的
  `_logger.info`）⇒ **在手机上彻底消失**；
  而 `service.lastError` **存了但从不显示** ⇒
  401 / 网络错在界面上显示成**「未连接到端脑」**
  ⇒ ⇒ **失败长得像「没连上」**（「失败长得像成功」的又一例变体）。

#### 6.8.2 三态的判据（真相源在服务端，客户端**不猜**）

| 档 | 判据 | 谁在说 |
|---|---|---|
| 有内容 | surface 里**有**内容 | 端脑画的 |
| 空 surface | surface 里**除 `Column` / `Text` 之外没有别的组件** | 端脑画的（它自己在空板子上写了实话） |
| 纯文本 | 这次**没有** surface，但**有**一句话 | 端脑说的 |
| 什么都没有 | 这次**没有** surface，也**没有**一句话 | —— 只有这一档，客户端才说「暂无数据」 |
| 失败 | 请求失败 | 端脑 / 网络给了原因 |

⚠️ **「空 surface」为什么用结构规则，而不是「认识哪些组件名」的白名单**：
白名单版本在端脑**加一种新组件**时（`Timeline` / `Chart` / …）
会把新组件当成「不认识 ⇒ 当作空」⇒ **把有内容的界面说成空的**。
⇒ 规则**反过来写**：**除布局与文字之外的东西，都是内容**
（`shadow-desktop/src/lib/a2uiProtocol.ts` 的 `isStructurallyEmptySurface`）。

⚠️ 这**不是**端脑显式声明的状态（端脑还没那个字段）⇒ 是客户端的**结构推断**
⇒ 端脑哪天自己声明了，以端脑为准（见 §6.8.6）。

#### 6.8.3 两端各做了什么

**移动端（主战场）**：

- `services/genui/gen_ui_agent_service.dart`：新增两条广播流 ——
  `textReplyStream`（端脑的原话）/ `errorReasonStream`（失败的原因）；
  `sendMessage` 开头把上一轮的结果**清掉**
  （否则上一轮的话会留在界面上 ⇒ 让人以为这一轮端脑又说了那句话）。
- `providers/genui_provider.dart`：新增 `a2uiTextReplyProvider` / `a2uiErrorReasonProvider`。
  ⚠️ **广播流不重放** ⇒ 视图兜底读 `service.lastTextReply` / `service.lastError`
  （回复先到、provider 后订阅时会漏掉那一句）。
- **新文件** `widgets/chat/agent2ui_answer_state.dart`：三态的**判定**住在这里
  （失败 **优先于** 原话：一次请求可能先吐了半句话再失败）。
- `widgets/chat/agent2ui_view.dart`：空态那一块**整个委托**给上面那个组件。

**桌面端**：

- `a2uiProtocol.ts`：新增 `isStructurallyEmptySurface`（结构规则，纯协议层，不碰 React）。
- `A2uiSurface.tsx`：把「空」标到 DOM 上（`data-surface-empty`）⇒ **机器可判**。
- `A2uiPanel.tsx`：`PanelState` 增 `text` 档 ⇒
  **纯文本时只显示端脑的原话，不再压「暂无数据」**；
  `empty` 档**只**留给「端脑什么都没说」。

⚠️ **一个刻意的决定：空 surface 与「有内容」的 surface，界面上长得一样** ——
因为**端脑自己已经在空 surface 里说了实话**（「任务（0）」「还没有任务」）
⇒ 客户端**不再补一句**自己的概括 ⇒ 两处文案不会打架。
⇒ 但**状态是可判的**（`data-surface-empty`）⇒ 端脑哪天显式声明状态时有落点。

#### 6.8.4 ⚠️ 没有新增任何 i18n key（为什么）

桌面 `src/i18n/*.json` 与移动 `lib/l10n/*.arb` **都有并行会话的在飞改动**
⇒ 本片**一行都不动**它们 ⇒ 零共享文件冲突、零生成物变更。

⇒ 于是：**纯文本态用端脑自己的话当主文案**（端脑已按 `Accept-Language` 本地化）
⇒ **失败态复用已有的 `l10n.errorGeneric(detail)`**（「错误：{detail}」）
⇒ **「暂无数据」只在端脑什么都没说时出现**
（桌面 `common.noData` / 移动 `agent2uiNoSurface`）。

#### 6.8.5 证据

- **桌面端**：`a2ui.test.tsx` ⇒ **24 passed**（原 19 + 新 5）：
  纯文本**不许**出现「暂无数据」/ 「什么都没有」才出现「暂无数据」/
  空 surface 与有内容的 surface 分得开（`data-surface-empty`）/
  结构规则**不把新组件当空**。
  全量 **124 文件 / 1238 通过 / 0 失败**；`tsc --noEmit` EXIT=0；`eslint` EXIT=0。
- ⚠️ **反向验证（桌面）**：把「暂无数据」放回纯文本分支（＝**修复前的形状**）
  ⇒ **恰好 1 条红**（那一条断言「不许出现暂无数据」），其余 23 条仍绿
  ⇒ ⇒ **断言有分辨力，不是恒绿**；还原后 **24 全绿**。
- **移动端**：新增 `test/widget/a2ui_answer_states_test.dart`（**8 条**：四档 widget 判定
  + **真 HTTP 回放**端脑的纯文本 / 任务状态失败 / **HTTP 401** / **连接被拒**
  ⇒ 端脑的原话与失败原因**真的**进了界面能拿得到的流）。
  全量 **415 passed / 0 failed**（工作树当前读数；基线 401 ⇒ 本片 +6 ⇒ 407，
  另有并行会话的日志面板批次 +6 ⇒ 413，本片再 +2 ⇒ **415**）；
  `flutter analyze` **76 issues（基线持平）**，
  我改的那几个文件**零 issue**。
- ⚠️ **反向验证（移动端）**：把「原话进流」与「显示失败原因」这两处**掐断**
  ⇒ **恰好那两条红**，其余仍绿 ⇒ ⇒ **断言钉在「用户真的看得见」上**。
  ⚠️ 另一条：把「HTTP 层失败的上报」退回「只打日志」⇒ **恰好那 2 条红**（见 §6.8.6）。

#### 6.8.6 ⚠️ 补一刀：**HTTP 层**的失败也是失败（上一片自己漏掉的另一半）

§6.8.1 说的「失败被说成『未连接到端脑』」，**只发生在一种失败上** ——
A2A 的**任务状态**失败（`failed` / `canceled` / `rejected`）。
**HTTP 层**的失败（**401** / 404 / 500 / **连接被拒**）走的是**另一条路**，而那一路上：

- `genui_a2ui` 的 connector **只** catch `FormatException`
  （`a2ui_agent_connector.dart:228`）⇒ **401 抛出来的 `A2AException` 一路冒上去**；
- ⇒ 它**不会**进 `contentGenerator.errorStream`（那条流**只**报任务状态失败，
  `:164-173`）⇒ ⇒ **`_lastError` 从没被填过，状态也没被置成 `error`**；
- ⇒ 唯一的出口是 `sendMessage` 里那个 `.catchError` ⇒ ⇒ 而它**只打一行 warning**
  ⇒ ⇒ 界面停在 `connecting` ⇒ ⇒ **失败长得像「还在连」**。

⇒ **红灯先行**：新增两条 service 级测试（真起一个本地 HTTP 服务回放 401 /
回放一个**没人听**的端口）⇒ 修复前**两条都超时**（等 10 秒等不到那条流）
⇒ **这不是推测，是读数**。

✅ **修（一个方法，两处用）**：`GenUIAgentService._reportFailure()` ——
把**任何来源**的失败都变成「真实原因 + 状态置 `error`」⇒
`sendMessage` 的 `.catchError` 改成调它（不再只打日志）；
`_describeFailure()` 把异常翻成一句能给人看的话：
`A2AHttpException` ⇒ **`HTTP 401`**（**状态码是协议值 ⇒ 不翻译**，承 §6.7.6），
`A2ANetworkException` ⇒ 那句网络错误原文，其余 ⇒ `toString()`。

⚠️ **为什么不能只抄 `errorStream`**：那条流覆盖不到 HTTP 层 ⇒
「失败说真话」这个承诺**上一片只兑现了一半** ⇒ ⇒ **断言必须覆盖两条路**
（任务状态失败 / HTTP 层失败），否则绿灯只是「一半绿」。

⚠️ **实现级导入**：异常类型**上游不导出**（`lib/genui_a2ui.dart` 只导出
connector 与 content generator）⇒ 要**按类型**读出状态码，只能走
`package:genui_a2ui/src/a2a/client/a2a_exception.dart`
（与 `shadow_key_sse_transport.dart` 同一个套路）。

✅ **证据**：移动端该测试文件 **6 ⇒ 8 passed**；
⚠️ **反向验证**：把 `.catchError` 退回「只打日志」⇒ **恰好那 2 条红**
（其余 6 条纹丝不动）⇒ ⇒ 断言钉在「用户真的看得见失败原因」上、不是恒绿。

⚠️ **桌面端同一件事本来是对的**（不是它的债）：`requestA2uiSurface` 对非 2xx
抛 `A2uiHttpError` ⇒ 面板的 `.catch` 直接进 `phase: 'error'`
⇒ ⇒ **这个洞只在移动端**（因为只有移动端走 `errorStream` 那条路）。
⚠️ 顺带记一条：桌面端那条错误文案是**硬编码中文**
（`a2uiClient.ts` 的 `A2uiHttpError`）⇒ **英文界面里也是中文**
⇒ 既有小瑕疵（本轮 i18n 文件在飞 ⇒ 没动）。

#### 6.8.7 ⚠️⚠️ **真机那一截**：端脑说的那句话，在手机上**上不了屏**（上一片自己没兑现的那一半）

§6.8.1 承诺的是「端脑说的每一句，都得如实显示」。这句话在**录下来的字节**里
成立、在**单元测试**里成立 —— 但在**真机**上是**假的**。

**真机读数（不是推测）**：手机上的 A2UI 面板，状态栏已经是绿色的
「已连接到 Shadow A2A 服务器」（⇒ 端脑**确实回话了**），
可内容区**只有一个永远转圈的圈** —— 端脑那句纯文本**一个字都没显示**。

⚠️ **根因（代码级，可复现）**：`surfaceIdsProvider` 订阅的 `surfaceIdsStream`
是**广播流** ⇒ 它只在**有 surface 增删**时才发事件 ⇒ 而端脑**回纯文本**
（它这次不画界面，只是说话）时**一个 surface 都不会有**
⇒ ⇒ provider **永远停在 `loading`** ⇒ ⇒ 视图里那条 `loading:` 分支
只剩一个圈 ⇒ ⇒ 端脑的原话 / 失败原因**永远轮不到渲染**。

⚠️⚠️ **为什么会漏**：§6.8.1~§6.8.5 的 widget 测试只测了
`Agent2UIAnswerState` **这个零件** ⇒ **从来没走过「provider → 视图」那条真路**
⇒ ⇒ mock 回什么都测不出来 ⇒ ⇒ **「零件对了」不等于「这条路通了」**。

✅ **修（两处）**：
- `surfaceIdsProvider`：**先给一次「现在的列表」**（还没画界面时就是空）
  ⇒ provider 立刻进 `data` ⇒ 视图走到答案块 ⇒ 原话上屏；
- `sendMessage`：**上一轮的 surface 一起清掉**（**一次请求 = 一次回答**）
  ⇒ 否则端脑这次回纯文本时，原话又被上一轮的界面**盖住**（同一个病）。

✅ **证据**：
- 新增两条**视图级**测试（`test/widget/a2ui_answer_states_test.dart`）：
  **只覆盖 service、绝不覆盖 `surfaceIdsProvider`**（覆盖掉它就等于把 bug 盖起来）
  ⇒ ⇒ 这一条才钉得住「provider 卡在 loading」；
  另一条钉「上一轮的界面不许盖住这句话」；
  ⇒ 该文件 **8 ⇒ 10 passed**；
- ⚠️ **反向验证**：把两处修复退回修复前的形状 ⇒ **恰好那 2 条红**、其余 8 条纹丝不动；
- **真机**：新脚本 `scripts/prove-a2ui-text-reply-on-device.ps1` ⇒ **8 条机器可判全过**
  （无钥匙 401 / 对钥匙 200 / SSE 是 SSE / 端脑回的是纯文本 / 提到 A2UI /
  没被画成 surface / **屏幕上有端脑那句话** / **屏幕没在转圈**）；
- **修复前 / 修复后**两张截图存档：
  `artifacts/before-fix/b2-after-send.png`（绿「已连接」+ **永远转圈的圈**）
  vs `artifacts/a2ui-text-reply-after-fix/a2ui-text-reply.png`
  （绿「已连接」+ **端脑的原话**「这个端点把端脑的状态画成 A2UI 界面…」）。

⚠️ **三条只有真机才知道的坑**：
1. **Flutter 的语义树默认不暴露给 `uiautomator`** ⇒ dump 回来是一棵**全空**的树
   ⇒ ⇒ 拿它判「屏幕上有没有那句话」**一定判不出**（它只会一直说「没有」）
   ⇒ ⇒ 改判**像素**（深色正文 vs 绿色弧线）；
2. **输入框 y=2050 才能聚焦**（2076 / 2136 点了输入法**不弹** ⇒ 灌不进去字
   ⇒ 后面全白搭）⇒ ⇒ 而且**发送键的位置是「键盘弹起之后」的**；
3. **设备是共享的** ⇒ 别的会话同时在驱动它 ⇒ 截图会拍到**别的页面**
   ⇒ ⇒ 真机脚本每一步都要**重新起 App + 截图核对**。

#### 6.8.9 ⚠️ 「这一轮消费完了」这个信号，被**我自己上一片**拆成了两义 ⇒ 移动端那条偶发红的根因终于钉住（顺带逮到「dispose 之后的迟到失败会炸」）

§6.8.7 修完之后，移动端全量测试**一直偶发一条红**，而且**轮换着**落在
`a2ui_locale_test` / `a2ui_shadow_key_test` 头上（单跑绿、全量不稳定复现）。
⇒ 此前只被记成「与本轮改动零交集、归属别条线」⇒ ⇒ **根因从未被钉住**。

⚠️ **真根因（是我自己 §6.8.7 那一笔埋的）**：
那一笔让 `sendMessage` 在**发请求之前**把上一轮的 surface 清掉
（`_surfaceIds.clear()` + 广播一个**空列表**）⇒ ⇒ `surfaceIdsStream`
多了一种事件：**空列表**。
⇒ 而那两条测试拿「**列表变了**」当「响应已被消费完」的信号
⇒ ⇒ 那个代理信号**变了两义**：

| 事件 | 本来的意思 | 加了「清空上一轮」之后 |
|---|---|---|
| 非空列表 | 端脑这次真的画了界面 | 不变 ✔ |
| **空列表** | （本来不存在） | **「这一轮开始了，上一轮清干净了」** |

⇒ ⇒ 第二轮**提前 dispose** ⇒ `dispose()` 关掉 transport 的 `http.Client`
⇒ ⇒ **还在飞的响应流当场报错** ⇒ 变成测试区里的**未处理异常** ⇒ ⇒ 偶发红。

⚠️ **与 ㊻ 条那个老坑同族**：当时记的是「在客户端读完 SSE 之前就 `dispose()`
⇒ 多文件并行时偶发失败」⇒ 当时的绕法是「**等 surface 出现**」⇒
⇒ 而「清空上一轮」这个新事件，把那条绕法**又拆了**。

⚠️⚠️ **顺带逮到服务的真缺陷（真机上像崩溃）**：
`dispose()` 会关掉 `http.Client` ⇒ **在飞的请求当场断** ⇒
⇒ 那次失败**在 dispose 之后**才回来 ⇒ ⇒ 它要往**已经关掉**的流里写
⇒ ⇒ 「**Bad state: Cannot add new events after calling close**」
⇒ ⇒ **未处理异常** ⇒ ⇒ 真机上就是「App 崩了」—— 而它崩在一条
**已经在收尾**的链路上（用户只是发完消息后立刻离开了 A2UI 面板）。
⚠️ 而四个广播流里**只有 `_reportFailure` 一处**带了 `isClosed` 判断。

✅ **修（`ba564e0`）**：
- `GenUIAgentService._emit`：把「**已关了就当作没这回事**」收成
  **一条规则、一处实现**，四个广播流统一走它；
- 两条同族测试的「消费完了」信号改成「**非空**更新」
  （空列表只是「这一轮开始了」）。

✅ **证据 + 反向验证**：
- 新 `test/widget/a2ui_surface_reset_test.dart` **2 条**：
  让服务端把 SSE **分两半发、中间停 400ms** ⇒ 「提前 dispose」从**竞态**
  变成**确定** ⇒ 断言钉得住；
- ⚠️ **反向验证**：退回旧信号 ⇒ **恰好**第 1 条红（「第二轮响应还没发完
  就 dispose 了」）；去掉关闭守卫 ⇒ **恰好**第 2 条红（报错正是
  「Cannot add new events after calling close」）⇒ 恢复 ⇒ 全绿；
- A2UI 组 **15 passed**；全量 **423 passed**（⚠️ 那 3 条红在
  `build_phase_guard_test.dart` —— **并行会话在飞的新测试**，不属本线）；
- `flutter analyze` **76 issues（基线持平）**。

⚠️ **一条可复用的纪律**：**代理信号在「事件集合变大」时会静默变两义**。
「surface 列表变了」原本唯一地表示「端脑画了界面」；加进「空列表」之后，
它**同时**表示「这一轮开始了」⇒ ⇒ 与「判据要覆盖会增长的集合 ⇒ 别写
白名单，反过来写」同族：**别拿「列表变了」代理「消费完了」，要拿「**非空**
更新」**。

#### 6.8.10 还欠的（本片没做，已记）

1. ⚠️ **「状态」仍是客户端的结构推断，不是端脑显式声明的**
   ⇒ 端脑哪天加一个「这次是空 / 纯文本」的字段 ⇒ 以端脑为准。
2. ⚠️ **移动端真机的「失败」那一档仍未验** —— 「端脑的原话上屏」**已验**
   （§6.8.7：真机 8 条判据全过，含**修复前 / 修复后**两张截图）；
   但**真机上的失败态**（401 / 连不上）**难以在真机上触发**
   ⇒ 那两档目前只有 **widget / service 级**的证据（真起本地 HTTP 服务回放 401 /
   回放一个**没人听**的端口）⇒ ⇒ 「失败说真话」在**真机**上还没被看见过。
   ⚠️ **但触发它的办法已经找到了**（§6.8.9 的副产品）：
   「**停掉内嵌大脑**」⇒ A2UI 地址**退回外部端脑** ⇒ 外部端脑用宿主侧的
   「有门的端脑」桩（`scripts/a2ui-door-stub.mjs`，**已实测** 401 空体 / 200 + SSE）
   ⇒ ⇒ 真机脚本 `scripts/prove-a2ui-failure-on-device.ps1` **已写好但还没跑**
   （设备被并行会话占用 ⇒ 坐标待校准）⇒ ⇒ **这一格还欠着，但债已经能还了**。
3. ⚠️ **「空 surface」在移动端没有对应的结构判定** —— 手机靠 `genui` 目录自己画，
   客户端**看不到**组件树 ⇒ 手机上「空板子」与「有内容的板子」只能靠**端脑自己的文字**分辨。
4. ⚠️ **桌面端没有 shadow key 输入入口**（§6.6.6 第 4 条）仍未补。
5. ⚠️ **协议值仍是英文**（§6.7.6）。
   ⇒ ⇒ **设备端（ESP32）零 A2UI 不是欠账**（ESP32 只是**输入设备**，2026-11-01 用户定）。

---

## 7. 三个可选方向（需要拍板）

> ⚠️ **本轮状态**：**方向 B 的第一片已经落地**（§6.3）——
> 服务端产出面、agent card 扩展声明、移动端地址、跨端契约都有了。
> **方向 A 因此不再必要**（入口不再通向空白，而是通向真界面）。
> **第二片也落地了**（§6.4）：`/a2a` 已锁进 shadow key 后面 ⇒ 新开的那张
> 数据面不再敞开（客户端用**请求时现读**的方式带钥匙，绕开「地址先到、
> 钥匙后到」的时序窗口）。
> **第三片落地了方向 C 的第一片**（§6.5）：桌面端有了自己的 A2UI 消费面
> （TypeScript 协议栈 + 4 种组件的渲染面 + 面板 + 入口按钮）。
> ⚠️ 但**这一片偏离了方向 C 原本的建议**（没复用现有那套渲染，
> 而是自己写了协议栈）—— 理由与代价见 §6.5.2，**值得被复核**。
> 下面保留原文，因为**「为什么是这三片」**仍然是决策记录。

### 方向 A · **先把入口藏起来**（最小、诚实、今天就能做）

把移动端那个常驻按钮**藏起来**（或标成「实验性 · 不可用」），直到服务端能产出。

- ✅ 成本最低（几行）
- ✅ 立刻消除「宣称就绪却永远空白」的坏体验
- ⚠️ 但**功能等于没有** ⇒ 已经写好的 8 个组件与协议栈全部闲置

⚠️ **本轮没做方向 A**，因为 §6.3 把服务端产出面接上了 ⇒ 入口现在通向真东西。
（方向 A 只在「服务端产出面又被拆掉」时才需要重新考虑。）

### 方向 B · **补服务端产出**（把这条链真正接通）

最小可行路径（**注意顺序**）：

1. **端脑 A2A 保留 `data` part**（别再丢）—— `api/a2a_gateway.rs:136` 改掉降维逻辑；
2. **端脑 agent card 声明 A2UI 扩展** —— `capabilities.extensions` 加
   `https://a2ui.org/a2a-extension/a2ui/v0.8`；
3. **某个叶区能产出 A2UI 组件树** —— ⚠️ 这是工作量最大的一步：
   要么让端脑自己有一个「渲染指令 → A2UI message」的翻译器，要么把 A2UI 消息
   当成一种 skill 的产物（现有 `skill_router.rs` 那条路）。
4. **移动端地址改成端脑真实端口** —— 别再写死 `localhost:60080`
   （对照 A11 修的 `baseUrl` 通道：移动端有 `telencephalonClient`，它的 baseUrl
   已经会跟随内嵌大脑的随机端口 ⇒ **复用它，不要另开一条**）。

⇒ 顺带把 **U3、U4、U7** 一并解决。

⚠️ **本轮做完的**：第 2、4 步，以及第 1 步的**等价物**（新端点**不经过**那段降维逻辑
—— 它直接按 A2A v0.3 解析消息，所以 `data` part 天然保留）。
❌ **第 3 步只做了「规则式」的一小块**：两个视图（任务 / 叶区），
**还没到「模型现场画界面」**（§6.3 §没做的）。

### 方向 C · **桌面端补齐，做成真正的「多端 A2UI」**

在 B 的基础上，让桌面端也实现 A2UI 消费面（React 侧对应 `genui` 的 Web 版）。

⚠️ **但先问一句**：A2UI 的价值是「**agent 现场画界面**」。
本项目桌面端已经有 `ToolPartRouter` / `ClientToolForm` / `ToolCallMessageCard`
这套**对话内组件渲染**机制 ⇒ **它其实已经是 A2UI 的等价物**（只是数据模型不同）。

⇒ **如果要选 C，更划算的路线可能不是「再实现一遍 A2UI」，
而是「让现有那套渲染机制接受 A2UI 的数据模型」** ——
这样桌面端立刻就能用，不必等协议栈对齐。

⚠️ **本轮实际走的是另一条路**（§6.5）：**在 TypeScript 里另写了一份协议栈**。
⚠️ 但这里那句「更划算」的前提要拆开看：
**「再实现一遍协议栈」在桌面端是硬约束**（`genui_a2ui` 是 Flutter 包，Tauri 没有
Dart 运行时 ⇒ 不是选择）；
**「不复用现有那套渲染」才是我的判断**（A2UI surface 不是聊天消息，
它有自己的 surface id 与组件树）⇒ **代价是多维护一份协议栈**，
**收益是两种模型不搅在一起**。若将来 A2UI surface 要内联进对话流，
就该合并而不是继续维护两份。

---

## 8. 需要拍板的问题

> ⚠️ 下面三问里，**第 2、3 问已经不用问了**（本轮做掉了）。留在这里是为了记录
> 「当时的决策点」与「现在的答案」。

1. **A2UI 这条线还要继续吗？**
   桌面端已有等价的对话内渲染机制 ⇒ A2UI 在桌面端的增量价值存疑。
   如果只服务移动端，那它更像是「移动端的 UI 表达能力补齐」，而不是「多端 A2UI」。

   ✅ **本轮已继续**（用户拍板「继续 a2ui」），并且做完了方向 B 的第一片。
   ⇒ **现在真正开放的问题变成：**
   - **下一片做哪个？**
     ① **让模型现场画界面**（A2UI 的核心卖点，工作量最大）；
     ② **把视图补全**（移动端目录里另外 6 个组件还没有对应的服务端视图）；
     ③ ~~**桌面端接入**~~ —— ✅ **本轮已做**（§6.5：TS 协议栈 + 渲染面 + 面板 + 入口）；
     ④ **先上真机验一次**（§附「仍未验证」里的第 ① 条：端脑面在手机上是随机端口，
     本轮只验了地址**跟随**逻辑，没上真机跑过）。
   - ⚠️ **我的建议：先 ④** —— 本轮已经把链子接通了，但**一次真机都没有**。
     真机跑通一次（能看见任务看板）比再写两个视图更能确认这条路是对的；
     而且真机会暴露「地址跟随」这条逻辑在**实际启动时序**下的问题
     （嵌入式大脑起来之前，端脑面端口根本不存在）。
   - 再之后建议 ①（模型现场画界面）—— 但**前提是模型调用链先能为
     「产出结构化 UI」做约束**，否则它只会画出一堆不合法的组件树。

2. ~~**若继续，先做哪个？** 方向 A（藏入口）还是方向 B（接服务端）？~~
   ✅ **已定**：方向 B 的第一片（§6.3）。方向 A 不再需要 —— 入口现在通向真界面。

3. ~~**A2UI 要不要进能力清单？**（U5）~~
   ✅ **已定并已做**：进（清单第 34 条）。
   ⚠️ **当时的写法是**「桌面端显式声明为**端侧专属**（桌面端零实现，但已有等价机制）」
   ⇒ **本轮 §6.5 之后已改写**：`a2ui.desktop` 现在写的是
   「**已落地 + 入口在哪 + 协议栈为什么是 TS 的 + 为什么没复用现有那套渲染**」。

---

## 附：本次评估的证据与方法

- 直接读：`genui_provider.dart` / `gen_ui_agent_service.dart` / `shadow_catalog.dart` /
  `agent2ui_view.dart` / `chat_screen.dart`（入口段）/ `mnn_agent_integration.dart`
- 直接读（第三方包）：`pub-cache/.../genui_a2ui-0.7.0/src/a2ui_agent_connector.dart`
  （A2UI 扩展 URI、`X-A2A-Extensions` 头）、`main.dart:59`（示例服务器 `localhost:10002`）
- 直接读（服务端）：`telencephalon/src/api/a2a_gateway.rs`、`well_known.rs`、`well_known_router.rs`、
  `telencephalon/src/a2a/gateway.rs`
- grep 全仓：`telencephalon/src/**`、`synapse/src/**`、`temporal/src/**` 找 `a2ui|genui|surface_update|dataModel`
  ⇒ **全部零命中**（这是「服务端不产出」的依据）
- grep：`shadow-desktop/src/**`、`shadow-esp32/**`、`agent-surface.json` 找 A2UI ⇒ 零命中
- 查测试：`shadow-mobile/test/**` 找 A2UI ⇒ 只有入口/出口两条 widget 测试

> ⚠️ **本轮未验证**：**没有真的起过 A2UI 会话**（没有 A2UI 服务端可起）——
> 「可用性」判定基于**代码里链路各段的存在与否**（协议、地址、产出面、扩展声明）。
> 若选方向 B，验收标准必须是**真机跑通一次 surface 渲染**，
> 而不是「客户端能连上」。

---

## 附：本轮实测的验证结果（2026-10-31）

### A2UI 空态（§6.2）

| 检查 | 命令 | 结果 |
|---|---|---|
| A2UI 空态（新增） | `flutter test test/widget/agent2ui_empty_state_test.dart` | **3 passed** |
| **反向验证** | 空态还原成旧行为后重跑 | **恰好 3 条全红** ⇒ 恢复后全绿 ⇒ 断言承重 |
| 移动端全量单测 | `flutter test --concurrency=1` | **370 全绿**（基线 361，+9 = 空态 3 + 契约 2 + SSE 回放 1 + 并行会话的 3） |
| 移动端静态检查 | `flutter analyze --no-pub` | **0 error / 76 issues**（基线 75，**多出的 1 条是并行会话新文件 `admin_token_test.dart` 的**；本轮改动的文件**零新增**） |

### A2UI 服务端产出面 + 跨端契约（§6.3）

| 检查 | 命令 | 结果 |
|---|---|---|
| 端脑模块内单测 | `cargo test --lib a2ui::` | **14 passed** |
| 端脑集成测试 | `cargo test --test a2ui` | **6 passed** |
| 跨端契约（载荷） | 端脑产出 **逐字**等于 `fixtures/a2ui/tasks_surface.json` | ✅ 一致 |
| 跨端契约（渲染） | 客户端把同一份 fixture 喂给**真的**处理器 + 目录 ⇒ **渲染出来** | ✅ **2 passed** |
| 跨端契约（信封） | 客户端用**真的** A2UI 客户端栈解端脑的**真 SSE 字节** | ✅ **1 passed** |
| **反向验证**（信封） | 端脑拆掉 `result` 包层（客户端会**静默丢弃**的那种改法） | **Rust 侧恰好 3 条红 + Dart 侧 1 条红** ⇒ 恢复后全绿 ⇒ **两个测试都承重** |

⚠️ **Rust 侧的构建参数**：`cargo test --test a2ui --no-default-features --features "flow"`。
⚠️ **为什么不用默认 feature**：默认 feature 里含 `hippocampus`（Lance/Arrow/DataFusion，
几百 MB、编很久），而这个测试根本不需要它。
⚠️ **测试本身不依赖任何 feature**（用仓里自带的 `build_test_state()`）⇒
换 feature 组合也能编过（⚠️ 注意：`LobeStore::new()` 这类存储构造函数的签名
**随 postgres feature 变** ⇒ 自己拼 `AppState::new` 会编不过）。

### 本仓守卫

| 检查 | 结果 |
|---|---|
| `node scripts/check-agent-surface.mjs` | **阻断 0 / 提示 0**（能力 33 → **34** 条，A2UI 登记在内） |
| `node scripts/check-client-tools.mjs` | 阻断 0 / 提示 1（`ask_user` known-gap，与 A2UI 无关） |
| ⚠️ `scripts/check-jni-surface.mjs` | **阻断 1** —— 但**不是本轮的东西**：那是并行会话新加的守卫，它在报「APK 里那份 `.so` 缺 `nativeSetAdminToken`」（他们改了 Kotlin/Java 侧还没重编 `.so`）。**本轮没碰那条链路。** |

⚠️ **仍未验证**：
① **真机上**的 A2UI 会话（端脑面在手机上是随机端口）—— ⚠️ 但**端脑那一侧已经验到位了**：`a2ui_is_served_on_the_agent_surface_router_with_the_shadow_key` 用的是 **`telencephalon::boot::cortex_router`** ⇒ **就是**嵌入式端脑起的那张 router（`encephalon/src/mobile/mod.rs:416` 调它）⇒ 「手机上那台大脑真的提供 `/a2a`、而且那道门也在」已在**端脑侧**被证明；**还差的是 App 那一侧**（App 真的把界面画出来）；
② **LLM 驱动的「现场画界面」**（§6.3 §未做的事）；
③ 界面文案本地化（服务端出的 chrome 是英文）；
④ **JNI 宿主直测跑不了**（`encephalon` 仓当前编译不过 ⇒ 并行会话的在飞 WIP）⇒ 断言已写好、Java 单独编译通过 ⇒ 等那个仓编得过就能跑。

### `/a2a` 上锁（§6.4）

| 检查 | 命令 | 结果 |
|---|---|---|
| 端脑集成测试 | `cargo test --test a2ui --no-default-features --features "flow"` | **9 passed**（原 6 + 新 3：`a2ui_surface_is_locked_behind_the_shadow_key` / `dev_mode_without_a_key_still_serves_a2ui` / `a2ui_is_served_on_the_agent_surface_router_with_the_shadow_key`） |
| 移动端新断言 | `flutter test test/widget/a2ui_shadow_key_test.dart` | **1 passed**（钥匙真的带出去了，且是**请求时现读**） |
| A2UI 全部 Dart 测试 | 空态 3 + 契约 2 + SSE 回放 1 + 钥匙 1 | **7 全绿**（连跑 3 次稳定） |
| **反向验证（服务端）** | 把 `/a2a` 的 `.layer(require_shadow_key)` 整层拆掉 | **恰好 2 条红** —— `a2ui_surface_is_locked_behind_the_shadow_key`（挂在 `tests/a2ui.rs:408`「不带钥匙必须 401」）与 `a2ui_is_served_on_the_agent_surface_router_with_the_shadow_key` ⇒ **其余 7 条仍绿** ⇒ 有分辨力 |
| **反向验证（客户端）** | 把 `X-Shadow-Key` 的注入注释掉 | **恰好 1 条红** —— `Expected: 'the-real-key' / Actual: <null>` ⇒ 其余断言仍绿 |
| **JNI 宿主直测** | `pwsh -File scripts/jni-host-test/run.ps1` | ⚠️ **断言已写好、Java 单独编译通过（EXIT=0），但运行时被阻断** —— `encephalon` 仓当前**编译不过**（`src/mobile/jni.rs:299` 调的 `encephalon_mobile_set_admin_token` 在 `src/mobile/mod.rs` 里**已**定义，但 `jni.rs:20-25` 的 `use super::{…}` **漏了它** ⇒ **并行会话的在飞 WIP**）。**我没动那个文件**（若对方同时补同一行 ⇒ 重复导入 ⇒ 编译错误 ⇒ 反而砸掉他们的构建）⇒ 改用下面那条当证据 |
| **端脑面 router**（替代证据） | `cargo test --test a2ui` 里的 `a2ui_is_served_on_the_agent_surface_router_with_the_shadow_key` | 用 **`telencephalon::boot::cortex_router`** —— **就是**嵌入式端脑起的那张 router（`encephalon/src/mobile/mod.rs:416` 调它）⇒ ⇒ 「手机上那台大脑真的提供 `/a2a`、而且那道门也在」在**端脑这一侧**被验到，**不需要真机、不需要装 APK** |

⚠️ **为什么「端脑面 router」这条比「只测 `api::build`」更强**：
`api::build` 与 `cortex_router` 是**两个入口**（后者包着前者、再加会话面）
⇒ 只测前者，**不能证明端脑面上真的有 `/a2a`、而且那道门也在**。

⚠️ **JNI 宿主直测为什么重要**：它是**唯一**能在**不抢真机**的前提下
验到「**嵌入式端脑真的提供 `/a2a`**」的地方——它加载**真的** cdylib、
起**真的**端脑面（`cortex_router`）、打**真的** HTTP。
（真机那条路本轮**没走**：并行会话正在用设备 + Gradle 会抢锁。）

⚠️ **客户端那条测试踩过的坑**：`flutter test` 多文件并行时曾偶发失败——
症状是 `A2uiContentGenerator.sendRequest` 抛网络异常。
根因是**我在客户端读完 SSE 之前就 `dispose()` 了**（transport 的
http.Client 一关，还在飞的流就报错 ⇒ 变成测试区里的未处理异常）。
⇒ 改成**回放端脑的真实 SSE 字节**，并用「surface 出现」当
「这份响应已被消费完」的信号 ⇒ 消费完才 dispose ⇒ 连跑 3 次稳定。

### 桌面端接入（§6.5）

| 检查 | 命令 | 结果 |
|---|---|---|
| 桌面端 A2UI 测试 | `pnpm exec vitest run src/components/chat/__tests__/a2ui.test.tsx` | **15 passed**（协议 5 + 客户端 3 + 渲染 4 + 面板 3） |
| **反向验证 A（两段式语义）** | 让 `surfaceUpdate` 也把 surface 标成可渲染 | **恰好 1 条红** —— `keeps a surface unrenderable until beginRendering arrives`（`expected [ { surfaceId: 'shadow.tasks', …(3) } ] to have a length of +0 but got 1`）⇒ 其余 12 条仍绿 |
| **反向验证 B（shadow key）** | 客户端不再注入 `X-Shadow-Key` | **恰好 1 条红** —— `expected undefined to be 'the-real-key'` ⇒ 其余 12 条仍绿 |
| **反向验证 C（载荷抽取路径）** | 把 `result.status.message.parts` 改成 `result.message.parts` | **恰好 6 条红**（依赖抽取的：解析 / 契约比对 / 客户端 / 渲染 / 面板端到端 / 纯文本答案）⇒ **4 条不依赖抽取的仍绿**（两段式语义、deleteSurface、未知组件、401） |
| **反向验证 D（判环语义）** | 把判环退回「全树已见集合」（**忠实复刻旧写法**） | **恰好 1 条红** —— `renders a component that is referenced twice, twice` ⇒ 其余 14 条仍绿 |
| 桌面端**全量**单测 | `pnpm exec vitest run` | **1209 passed / 2 skipped / 0 failed**（120 个文件） |
| 类型检查 | `pnpm exec tsc --noEmit -p tsconfig.json` | **EXIT=0** |
| ESLint（改动文件） | `pnpm exec eslint <6 个文件>` | **EXIT=0**（`i18next/no-literal-string` 是 error ⇒ 诊断文案必须进 i18n ⇒ 新增 `a2ui.*` 4 个 key） |
| i18n key 校验 | `node scripts/validate-i18n-keys.mjs` | ⚠️ **EXIT=1**，但**缺的不是本轮的 key**：260 条缺失全部落在 `identity` / `computerUse` / `subsystem` / `preview` / `voice` / `questionnaire` 等**既有缺口**上 ⇒ 本轮用到的 **11 个 key 逐个核对，全部在两份 i18n 里存在** |
| 生产打包 | `pnpm exec vite build --outDir dist-a2ui-verify --emptyOutDir` | **EXIT=0**（`✓ built in 19.95s`；警告是既有的 chunk 体积与 `tauriSafe` 动静态混用噪声）⇒ 打完已用可恢复删除清掉 |
| 本仓守卫 | `node scripts/check-agent-surface.mjs` | **阻断 0 / 提示 2**（能力 34 条；`a2ui.desktop` 已改写成「已落地 + 入口在哪」）。⚠️ 那两条提示是**并行会话**新登记的 `a2ui` / `identity` 两个能力的 `labelKey` 在**移动端 ARB** 里还没有 ⇒ 守门员自己写的「阶段 2 接入能力清单时补」⇒ **不是本片引入**（本片**没新增能力、没动任何 labelKey**） |

⚠️ **仍然未验证（这一片欠着的）**：
① **桌面端从未对着一个活的端脑跑过** —— 测试喂的是**录下来的**端脑字节
（`fixtures/a2ui/tasks_sse.txt`）。
⚠️ 但「桌面的端脑真的提供 `/a2a`」这件事**可以静态证明**：
桌面 sidecar 起的是 `telencephalon::api::build_full_app`（`cortex_http.rs:212`）
⇒ 它包着 `build_with_conversation_store` ⇒ 而 `api/mod.rs:99` 在那张 router 上
merge 了 `a2ui_gateway::router` ⇒ **`/a2a` 与那道 shadow key 门都在**。
⚠️ **还差的是「桌面客户端真的把界面画出来」这一段运行时证据**；
② 设备端（ESP32）**零 A2UI** ⇒ ⇒ **已定：不是欠账**（它只是**输入设备**，2026-11-01 用户定）；
③ 界面文案本地化（服务端出的 chrome 仍是英文）—— 桌面端这侧**本地化只覆盖了
诊断文案**（`a2ui.*` 4 个 key），组件内容是服务端给的原文；
④ ⚠️ **桌面端没有 shadow key 的输入入口**（既有缺口，§6.5.6）——
若端脑配了 key 而客户端手里没有 ⇒ 面板 401（**面板会明说**）。

> ✅ **① 已由另一台会话补上（2026-10-31 21:55，入库 `556b7db`）**：
> 新增 `shadow-desktop/src/components/chat/__tests__/a2ui.live.test.tsx`
> （**4 条**：真 fetch / 真端脑 / 真 React 渲染）
> + `scripts/start-a2ui-live-brain.ps1`（起一台端脑来复跑，带 `-Stop`）。
> ⇒ **上面第 ① 条的缺口已闭合**；桌面端现在**真的**对着活的端脑跑过完整条链路。
> 它还带出四条**只有活体才验得到**的发现（详见 §6.5.8）。

