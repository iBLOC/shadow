# 对话为主的两端 IA 评估 —— 菜单 / 功能 / 设置是否合理

> 2026-10-29 · 承接《跨端视觉语言》（视觉已定，这轮评信息架构）
> 前提：**用户以对话为主**。Shadow 是个人助理，主干是对话，其余是「对话的产物」或「对话的能力」。

---

## 0. 判定标准

「对话为主」不是「首页放个聊天框」，而是下面这 5 条：

| # | 标准 | 反面 |
|---|---|---|
| C1 | **对话是默认落地页**，两端一致 | 打开 App 看到的是别的东西 |
| C2 | **能力不是并列目的地，是对话可调用的工具** | 为了用 MCP 要退出对话去另一个页面 |
| C3 | **表达形态是对话的模式，不是并列 tab** | 同一件事的 3 种形态占 3 个 tab |
| C4 | **设置少而浅**，配置面与使用面分离 | 18 个平铺 tile，运维和外观混在一起 |
| C5 | **两端能力集合对等** | 手机上有的功能电脑上没有 |

---

## 1. 现状测绘

| | 桌面端 | 移动端 |
|---|---|---|
| 路由总数 | 26 | 29 |
| 默认落地页 | **`/` → `TaskBoardPage`**（`App.tsx:52`） | **`/` → `ChatScreen`**（`app_router.dart:30,85`） |
| 一级导航 | 侧栏 **12 项平铺** + 设置（`Layout.tsx:30-43`） | 底 tab **6 个**（`main_shell.dart:21-40`） |
| 设置规模 | **9 个 section**（`SettingsPage.tsx:34`） | **18 个平铺 ListTile**（`settings_screen.dart`） |
| 对话界面能否调起能力 | **不能** —— 只有 3 个预填提示按钮（`ConversationPage.tsx:572-582`） | **不能** —— `chat_screen.dart` 352 行，0 处能力引用 |

**能力清单本身已经有分类**：`agent-surface.json` 的 `_meta.groups` 定义了 5 组 ——
`converse`（对话与表达）/ `work`（任务与产出）/ `capability`（能力与资源）/ `tools`（端侧工具）/ `ops`（运维与诊断），
32 条能力全部归组。

**但两端导航都没用它。**

---

## 2. 发现

### F1 · 桌面端默认落地页不是对话 —— 违背 C1（严重）

```
shadow-desktop/src/App.tsx:51-52
  <Route path="/" element={<AppInitializer><Layout /></AppInitializer>}>
    <Route index element={<TaskBoardPage />} />
```

移动端 `/` 是对话，桌面端 `/` 是任务看板。侧栏第 1 项也是 `tasks`，`conversation` 排在第 2。

**后果**：同一个 agent、同一个用户、两个终端，打开后看到的是**两个不同的产品**。
用户被迫先学「这个 App 进来先看任务板，另一个先看聊天」—— 这是「两端统一」最刺眼的一处违背，
而且它推翻的不是视觉，是**产品的主干**。

### F2 · 桌面端 12 项平铺 = 把 5 种性质的东西并列 —— 违背 C2（严重）

```
shadow-desktop/src/components/Layout.tsx:30-43
  /tasks  /conversation  /flows  /trace  /computer-use  /workflow-studio
  /mcp  /jdm-editor  /skills  /prompt-settings  /memory  /logs
```

这 12 项里混着 5 种不同性质：

| 性质 | 项 |
|---|---|
| 表达模式 | `conversation` |
| 工作产物 | `tasks` |
| 能力配置 | `flows` `mcp` `skills` `memory` `prompt-settings` |
| 端侧工具 | `computer-use` `workflow-studio` `jdm-editor` |
| 运维诊断 | `trace` `logs` |

全部**同权重、无分组、无「常用 / 高级」分层**。用户每次打开侧栏都要重新扫 12 行，
而其中 5 行是低频的、3 行是运维的。

顺带一个现成的 bug：`Layout.tsx:89` 的 `isInbox` 判断的是**不存在的** `/tasks/inbox`
⇒ 侧栏角标逻辑是死的。但它本来要显示的 `pendingTasks` 确实在 `TaskBoardPage` 里渲染
（`TaskBoardPage.tsx:344-348`）—— 也就是说角标本该挂在 `/tasks` 上，现在整个挂不上，
用户只能进页面才知道有任务在等。

### F3 · 移动端 6 个 tab 混合了「形态」与「配置面」—— 违背 C3（中）

```
shadow-mobile/lib/widgets/main_shell.dart:21-40
  Chat(对话) | Live(直播) | Service(客服) | Tasks(任务) | Manage(管理) | Settings(设置)
```

- **Chat / Live / Service 是同一个 agent 的三种表达形态**，却占了 6 个 tab 里的 3 个；
- **Tasks** 是工作产物；
- **Manage** 是**配置容器**（`/manage` 下 6 张卡：providers/models/mcp/skills/agents/memory）；
- **Settings** 是配置面。

⇒ 6 个 tab 里只有 2 个（Chat / Tasks）属于「使用面」，另外 4 个是配置与形态。
底 tab 是**最贵的位置**（每屏都在），现在有 2/3 的面积被配置与形态占着。

而且 **Live / Service 在桌面端根本不存在** —— 能力不对等（见 F5）。

### F4 · 对话界面里调不起任何能力 —— 违背 C2（严重，且是根因）

- 桌面端 `ConversationPage.tsx:572-582`：空态只有 3 个按钮，全是**预填输入文本**
  （`helpWithTask` / `whatCanYouDo` / `showMyAgents`），没有工具选择、没有 skill 列表、没有 flow 触发。
- 移动端 `chat_screen.dart` 352 行，**零处**能力引用。

**后果（最要命的一条）**：MCP / skills / flows / memory / agents **只能**是「目的地」。
用户想用能力，必须**离开对话**、去另一个页面、再手动操作、再切回对话。
这与「对话为主」是直接冲突的 —— 对话成了入口而不是主干。

### F5 · 两端能力集合不对等 —— 违背 C5（中）

| 只在桌面端 | 只在移动端 |
|---|---|
| `computer-use` 电脑操作 | `voice` 语音对话 |
| `workflow-studio` 编排 | `livestream` 直播 |
| `jdm-editor` 规则编辑器 | `customer-service` 客服 |
| `trace` 追踪 | `models` / `mcp` / `skills` / `memory` / `agents`（在 `/manage` 下） |
| `previews` / `document` 产出 | `discovery` / `resonance` |
| `model-download` / `onboarding` / `cortex-status` | |

⇒ 用户在手机上用的功能，在电脑上找不到入口；反之亦然。

### F6 · 设置是「平的」，且混了三类不该在一起的东西 —— 违背 C4（中）

**移动端 18 个平铺 ListTile**，其中：

| 类别 | tile | 问题 |
|---|---|---|
| TTS 内部 | `ttsSettings` `ttsStatus` `ttsEngine` `ttsTest` | **4 个 tile 给 1 个子系统** |
| 运维 | `logsTitle` `resonanceTitle` `telencephalonFlows` | 与外观并列 |
| 破坏性 | `resetEngine`（重置引擎） | 与外观并列，点错了不可逆 |
| 其它 | 模型信息 / 主题 / 内存占用 / 服务状态 / 设备发现 / 无障碍 / 模型仓库 | |

**桌面端 9 个 section**：`service` `models` `video` `ui` `shortcuts` `data` `system` `subsystem` `integrations`
—— `subsystem` / `integrations` / `service` 是运维面，与 `ui` / `shortcuts` 同级。

### F7 · 位置与命名漂移 —— 违背「同一能力同一入口语义」（低但可见）

| 能力 | 桌面端位置 | 移动端位置 |
|---|---|---|
| 对话历史 | `/conversation`（侧栏第 2） | `/conversations`（**复数**，底 tab 第 4 个 Tasks 下） |
| 流程 | `/flows`（侧栏**一级**） | `/flows`（**设置里**，`main_shell.dart:69` 映射到 Settings tab） |
| 群组 | `/group`（侧栏**一级**） | `/group`（`main_shell.dart:68` 映射到 **Manage** tab —— 但它是 work 不是 capability） |
| 记忆 | `/memory`（侧栏一级） | `/manage/memory` |
| 首次引导 | `/setup` 有路由 | **无路由**（用户已拍板要接线） |
| 配网 | 无路由 | 无路由（已拍板搁置） |

`/flows` 在桌面是一级入口、在移动藏设置；`/group` 在桌面是一级入口、在移动归到「管理」——
同一个能力两端位置不同，用户找不到。

---

## 3. 目标 IA

### 3.1 桌面端侧栏：12 平铺 → 4 段

```
┌─ 对话 ────────────────┐   ← 唯一主干，默认落地页（C1）
├─ 任务 ────────────────┤   ← 工作产物
├─ 能力 ────────────────┤   ← 抽屉：agents / models / providers / mcp / skills / memory / flows / prompts
└─ 更多 ▾ ──────────────┤   ← 电脑操作 / 编排 / 规则编辑器 / 产出（文档·预览）/ 追踪 / 日志
   ⚙ 设置               ←   设置内分：常用 / 设备 / 高级
```

依据：
- 「能力」收成抽屉 —— 一类东西一个入口，C2 的导航侧解法；
- 「更多」默认折叠 —— 运维与端侧工具是低频，不该占常驻位置（F2）；
- 「对话」提到第一位且成为默认落地页 —— C1。

### 3.2 移动端底 tab：6 → 4

```
对话 | 任务 | 能力 | 我
```

| tab | 内容 | 变化 |
|---|---|---|
| **对话** | ChatScreen；**Live / Service / Voice 降级为对话顶部的「模式切换」** | C3：形态 ≠ 目的地 |
| **任务** | 任务看板 + 产出 | |
| **能力** | 现在的 `/manage` 6 张卡 + flows / skills / prompts | 沿用已有的能力化原型 |
| **我** | 外观 · 模型与提供商 · TTS · 设备与运行时 · **高级（折叠）** | C4 |

「我」这个标签对应「这是**你的**影子」的定位 —— 外观与设置属于用户本人。

### 3.3 设置瘦身

**桌面端 9 section → 3 组**
- 常用：外观 / 模型与提供商 / 语音 / 快捷键
- 设备：电脑操作 / 视频源 / 服务连接
- 高级（默认折叠）：子系统 / 集成 / 日志 / 追踪 / 重置

**移动端 18 tile → 4 组**
- 外观：主题色 / 玻璃强度 / 明暗（已落地）
- 智能体：模型 / 提供商 / TTS（**4 个 tile → 1 组 2 项**，测试按钮并入 TTS 组）
- 设备与运行时：端脑 / 前额叶 / 服务状态 / 设备发现 / 无障碍
- 高级（折叠）：日志 / Resonance / 内存 / 流程 / **重置引擎**（破坏性操作隔离）

### 3.4 能力回到对话里（治 F4，这是根因）

在对话界面加**能力入口**，而不是只改导航：

| 能力 | 在对话里的形态 |
|---|---|
| MCP 工具 | 输入框旁的工具按钮 → 选 server/tool → 以结构化方式插入上下文 |
| skills | 输入框 `/` 唤起技能列表 |
| flows | 触发的流程作为**对话卡片**呈现（结果留在对话里，不跳页） |
| agents | 「换个 agent 回答」= 对话头部的切换器 |
| memory | 「回忆 X」→ 结果作为对话里的引用块 |

原则：**配置页是次要入口，对话里是主入口**。用户 95% 的时间不需要进 `/manage/mcp`。

---

## 4. 落地分批

| 批次 | 内容 | 风险 | 收益 | 状态 |
|---|---|---|---|---|
| **1** | 桌面端默认落地页改对话（`App.tsx` index route + 侧栏顺序） | 低（可见行为变更） | 立刻兑现 C1 | 待做 |
| **2** | 导航分组（桌面 4 段 / 移动 4 tab）+ 导航由 `agent-surface.json` 生成 | 中 | C2/C3 + 兑现「阶段 2 能力驱动导航」 | 待做 |
| **3** | 设置瘦身（桌面 9→3 组 / 移动 18→4 组） | 中 | C4 | 待做 |
| **4** | 能力回到对话（工具选择器 / skill 唤起 / flow 卡片 / agent 切换） | 高（要动对话主界面） | C2 根治 | 待做 |
| **5** | 能力对齐（桌面补 live/service/voice；移动补 computer-use/trace/编排） | 中 | C5 | 待做 |
| **6** | `setup` 接线（移动端补路由 + 修 20+ 处 ARB 裸 key）；`provisioning` 保持搁置 | 低 | 一致性 | 待做 |

> 批次 2 与阶段 2（能力驱动导航）是同一件事，可以合并做。

---

## 5. 需要拍板的地方

1. **桌面端默认落地页从任务看板改成对话** —— 对话为主的产品应该如此，但会改变现有桌面用户的肌肉记忆。
2. **移动端 Live / Service 降级为对话模式** —— 会从底 tab 移除两个入口。
   如果它们是**独立场景**（直播台、客服台）而非对话形态，就该留在 tab 上，
   但那就需要重新论证「对话为主」到底覆盖多少场景。
3. **两端能力是否要强行对齐** —— 还是承认「电脑操作 / 编排」是桌面专属、
   「直播 / 客服 / 配网」是移动与设备专属，只保证**同一能力同名同语义**。
