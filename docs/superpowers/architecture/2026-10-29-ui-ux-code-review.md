# UI/UX 代码审查 —— 桌面端 + 移动端（2026-10-29）

> **审查范围**：`shadow-desktop/src`（173 个 ts/tsx，25 个页面，91 个组件）与
> `shadow-mobile/lib`（146 个 dart，24 个 screen，26 个 widget）。
> **方法**：只读检索（read / grep / 统计），未修改任何 UI 代码；本文档中所有数字均来自
> grep 计数，关键结论已逐条复核。
>
> **与既有审计的关系**：[`2026-09-23-shadow-desktop-uiux-audit.md`](2026-09-23-shadow-desktop-uiux-audit.md)
> 查的是「**功能有没有**」（browser-use / computer-use / 4-lobe matrix 的能力覆盖），
> 其 P0 清单（`cu_*` 无 UI、previews 无入口、Feishu 发布 URL 不进聊天卡）**已全部落地**
> ——`pages/ComputerUsePage.tsx`、`pages/PreviewsPage.tsx` 现在都在。本文查的是
> 「**代码怎么组织的**」，视角不重叠，但结论互补。

---

## 0. 总评：最核心的问题是**两端不是同一个产品**

用户说「桌面客户端和移动端的 uiux 设计都很乱」。乱的根因不在某一页写丑了，而在三层：

| 层 | 桌面端 | 移动端 | 后果 |
|---|---|---|---|
| **视觉语言** | shadcn/ui **slate 灰阶**，`App.css:3` 自称 "default slate theme (black/white/gray)"；`--primary: 222.2 47.4% 11.2%` = 近黑 | **Deep Shadow 紫青霓虹**：`primary #A78BFA`、`secondary #22D3EE`、`primaryGlow`、glassmorphism | 同一产品两个长相 |
| **交互隐喻** | 纯色卡片 + Tailwind 语义色 | `BackdropFilter` 玻璃拟态 + neon glow | 移动端多一套渲染风险（见 §5） |
| **信息架构** | 侧边栏 **12 项平铺无分组**，25 条路由 | 底部 **6 tab**，其中「Manage」是收纳垃圾桶 | 用户找不到功能 |

具体到颜色，三处「紫」互不相同：

- 移动端品牌主色 `#A78BFA` = Tailwind `violet-400`
- 桌面端 `bg-purple-500` = `#a855f7`（`ConversationPage.tsx:897`、`badge.tsx:22`）
- 桌面端 `bg-violet-500` = `#8b5cf6`（`WorkflowStudioPage.tsx:59`、`SettingsPage.tsx:1151`）

**桌面端其实没有品牌色**：`src/` 里所有「紫」共 20 处、散在 8 个文件，全部是 Tailwind 语义色板的直接引用；
`--primary` 在暗色模式下是 `210 40% 98%`（**白底黑字的主按钮**），而移动端主按钮是淡紫底白字。

第二个根因是**设计 token 层缺失**：

- 移动端 `lib/theme/` 只有 2 个文件（`app_colors.dart` 2.8KB + `glass_theme.dart` 6.2KB）。
  `AppColors` 是**唯一被正确集中**的一项（`Color(0x…)` 字面量全库只出现在 `app_colors.dart` 一个文件里）。
  但**间距 / 圆角 / 字号 / 动效时长完全无 token**：
  **212 处 `EdgeInsets` 字面量**（48 个文件）、**82 处 `BorderRadius.circular`**（34 个文件，散出
  **2/4/7/8/10/12/14/16/20/24 共 10 种半径**）、**117 处 `fontSize` 硬编码**（theme 外）、
  13 处 `Duration`（5 种时长：100/200/300/500/1500）。
- 桌面端相反：**token 齐备但大面积绕开**。语义 token 用得很重
  （`text-muted-foreground` 384、`border-border` 204、`text-foreground` 178、`bg-muted` 132、
  `bg-card` 68），说明体系是被接受的 —— 但同时有 **351 处原始色阶 class** 绕过 token，
  以及 **119 处硬编码 hex**（`.tsx`）+ **44 处任意字号**（`text-[11px]` ×30、`text-[10px]` ×14）。
  token 层还**没有品牌槽位**：`tailwind.config.ts` 只有 shadcn 默认的 `--primary/--secondary/--muted/…`。

第三个根因是**组件库与代码库脱节**（两端同病，但形态不同）：

| | 桌面端 | 移动端 |
|---|---|---|
| 原语 | `components/ui/` 23 个文件 | `lib/widgets/` 26 个文件 |
| 实际情况 | 4 个死原语（`alert`/`skeleton`/`priority-badge` 0 用）；`business/` 下 **5 个组件 0 importer**（含 `LocalEnginePanel` **722 行 / 27.3KB**）；`lib/cloudProviders.ts` **0 importer** | `GlassAppBar` **1/23 页面**用；`GlassButton` **0**；`StatusIndicator`/`LoadingShimmer`/`SettingsSheet` **全库 0 import**；`features/` 下 **36.5KB 零引用**，含 2 个与 `model_management_screen.dart` **同名重复**的 Dialog |
| 同一概念多套实现 | `SettingsCard` **×3**、`ProviderCard` **×2**、`AgentCard` **×2**；provider 品牌表 **5 份副本** | 徽章 **6 份独立实现**、`AlertDialog` **28 处**各写各的、状态点 **8 处**手搓（而 `StatusIndicator` 存在却没人用） |

---

## 1. 跨端能力矩阵：功能覆盖不对齐

| 概念 | 桌面端 | 移动端 | 对齐 |
|---|---|---|---|
| 聊天 | `/conversation` | `/`（首页） | ✗ 路径与入口语义都不同 |
| 任务板 | `/tasks` | `/tasks` | ✓ |
| 会话列表 | 无独立页 | `/conversations` | ✗ 移动端多 |
| 模型 / Provider / MCP / Skills / Memory | `/models` `/providers` `/mcp` `/skills` `/memory` | `/manage/*` | ✓ |
| Agents | 无独立页 | `/manage/agents` | ✗ |
| 人设 / 提示词 | `/prompt-settings` | `/settings/prompt` | ✓ |
| 群组 | `/group` | `/group` | ✓ |
| 工作流 | `/flows` + `/workflow-studio` | `/flows` | ~ |
| 语音 | `/voice` | `/voice` + `/livestream` + `/customer-service` | ✗ 移动端多 2 种模式 |
| 端脑状态 | `/cortex-status` | `/settings/encephalon` | ✗ 名字与层级都不同 |
| 计算机操作 / 追踪 / 预览 / 文档 / JDM 编辑器 | `/computer-use` `/trace` `/previews` `/document/:taskId` `/jdm-editor` | **无** | ✗ 桌面端多 5 项 |
| 首次引导 | `/setup` `/onboarding` | `setup_wizard_screen.dart` **存在但无路由** | ✗ |

**同一个功能两端不同名不同层级**（`cortex-status` vs `settings/encephalon`、聊天在
`/conversation` vs `/`）——这是「乱」最直接的体感来源：用户在两端找不到对应的同一个东西。

---

## 2. 桌面端发现（按严重度 × 频次排序）

### [D1] 27 处 `t()` 的 key 在 **en 和 zh 两个 locale 里都不存在**，切英文后整页中文
- **位置**：`pages/TelencephalonStatusPage.tsx` 16 处（`:89,92,118,129,139,143,157,163,173,179,187,197,211,234,255,270`）；
  `components/ModelSetupDialog.tsx` 9 处（`:145,154,171,222,224,234,241,250,269`）+ `common.retry` 2 处
- **证据**：`en-US.json` 里 `"cortexStatus.` **0 命中**、`"modelSetup.` **0 命中**、`"common.retry"` **0 命中**；
  `zh-CN.json` 里 `cortexStatus.` / `modelSetup.` 同样 **0 命中**。
  写法是 `t('cortexStatus.title', 'Cortex 内部状态')` —— **第二参数的中文就是实际显示内容**。
- **影响**：切到 English 后「Cortex 内部状态」页与模型配置弹窗**整页仍是中文**，且这些 key 连中文 locale 都没有，
  属于「fallback 掩盖缺失」。
- **建议**：补齐 27 个 key（两个 locale）→ 删掉全部 62 处 `t()` 的中文第二参数 → 让 key 缺失变成硬错误。

### [D2] i18n 守门员**写好了但没插电** —— 这是 [D1] 的直接根因
- **位置**：`shadow-desktop/scripts/validate-i18n-keys.mjs:44`、`shadow-desktop/eslint.config.mjs:55-70`、
  `.github/workflows/ci.yml`
- **证据**：
  - `ci.yml` 里 `eslint|lint|validate-i18n` **0 命中** —— CI 从不跑 lint，也不跑这个校验脚本。
  - `eslint.config.mjs:55` 已配 `'i18next/no-literal-string': ['error', …]`，但没人跑 eslint → 形同虚设。
  - `validate-i18n-keys.mjs:44` 的正则是
    `/(?<=[\s({[=,\n])t\(['"]([a-zA-Z0-9._]+)['"]\)/g`
    —— **结尾的 `\)` 要求 `t()` 立即闭合**，所以 `t('key', '中文')` 与 `t('key', {defaultValue})` **全部不被匹配**。
    实测单参 `t('key')` 848 处能校验，多参 62 处**全部漏检**，[D1] 的 27 个坏 key **全在这 62 处里**。
  - 该脚本也没被任何 npm script 引用。
- **建议**：正则去掉结尾 `\)`；`package.json` 加 `i18n:check`；CI 的 `desktop-build` job 加
  `pnpm exec eslint . && pnpm run i18n:check`。eslint 先按 warn 上线提交基线再收紧。

### [D3] provider 品牌色/ID 表有 **5 份副本**，id 命名漂移已导致 logo 查表落空
- **位置**：`lib/cloudProviders.ts:3`（39 项，**0 importer**）、`pages/ModelsPage.tsx:24`（39 项，与 lib 逐行相同）、
  `pages/SetupPage.tsx:34`（42 项）、`pages/ModelsPage.tsx:346` `LOGOS`、
  `components/business/ProviderCard/ProviderCard.tsx:7` `PROVIDER_LOGOS`（14 项）
- **证据**：
  ```tsx
  // lib/cloudProviders.ts:11 —— 规范 id 用连字符
  { id: 'minimax-cn', name: 'MiniMax 中国', color: '#00d2d3' },
  // ProviderCard.tsx:15 —— logo 表用下划线
  minimax_cn: { bg: '#00d2d3', text: 'MM' },
  ```
  `ProviderCard.tsx:27` 是 `PROVIDER_LOGOS[provider.provider_type] || PROVIDER_LOGOS.custom`
  → `minimax-cn` / `moonshot-cn` / `github-copilot` 三个 key **在 logo 表里不存在**，静默落到灰色 `custom` 徽标。
  颜色还互相冲突：`custom` 在 `SetupPage:76` 是 `#7f8c8d`、在 `ProviderCard:22` 是 `#64748b`；
  **`ollama` 在 `SetupPage:49` 是 `#ffffff`（白底白字）**，而 lib 里是 `#6e5494`。
- **影响**：同一供应商在不同页面显示不同颜色 / 不同字母徽标；Ollama 在 Setup 页的徽标**在浅色卡片上完全不可见**。
- **建议**：以 `lib/cloudProviders.ts` 为唯一真相源，其余 4 处改为 import；id 统一连字符。

### [D4] 同一视觉概念 3-4 套并行实现：`SettingsCard` ×3、`ProviderCard` ×2、`AgentCard` ×2
- **位置**：`pages/SettingsPage.tsx:127`（13 处调用）/ `components/business/SettingsCard/SettingsCard.tsx:5`（1 个 importer）
  / `components/business/SubsystemPanel/SubsystemPanel.tsx:13`（第三份本地副本）；
  `pages/ModelsPage.tsx:334` vs `components/business/ProviderCard/ProviderCard.tsx:25`（0 importer）；
  `pages/SettingsPage.tsx:1033/1140` vs `components/business/AgentCard/AgentCard.tsx:30`（0 importer）
- **证据**：`SettingsPage.tsx:141` 与 `SubsystemPanel.tsx:15` 的外壳 class **逐字符相同**：
  ```tsx
  <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
  ```
  而库版 `business/SettingsCard` 用的是另一套：`Card variant="elevated" padding="none"` + `p-4` + `h-10 w-10 rounded-md bg-muted` 图标。
- **影响**：设置页视觉在「p-5 卡片」与「p-4 卡片 + 带底色图标」之间肉眼可辨地不一致。
- **建议**：库版定唯一实现并加 `size?: 'sm' | 'md'`；`ProviderCard`/`AgentCard` 同理让页面复用库版。

### [D5] 删除确认有 **4 种做法**，**13 处破坏性操作零确认**
- **位置（零确认）**：`ProvidersPage.tsx:776`、`ModelsPage.tsx:399/410`、`SettingsPage.tsx:618/907`、
  `GroupPage.tsx:170`、`MemoryPage.tsx:181`、`ModelDownloadPage.tsx:95`、`ResonancePage.tsx:601`、
  `SkillsPage.tsx:132`、`TaskBoardPage.tsx:268`、`JdmEditorPage.tsx:534`、`WorkflowStudioPage.tsx:516`
- **位置（`window.confirm`）**：`MCPPage.tsx:189`、`components/task/TaskDetailDialog.tsx:272`
- **证据**：
  ```tsx
  // ProvidersPage.tsx:776 —— 直接 invoke，无任何确认
  onClick={() => runAction(() => invoke('provider_remove', { id: provider.id }))}
  // TaskDetailDialog.tsx:272 —— 浏览器原生弹窗，中文硬编码
  if (!window.confirm(`确认删除任务 "${task.title ?? task.task_id}"?`)) return;
  ```
  `components/ui/alert-dialog.tsx` 定义的 `AlertDialog` **只被 `GlobalErrorDialog.tsx` 用过（错误弹窗）**，
  全项目 **0 处**用于删除确认。
- **影响**：误点即删除供应商 / 模型 / 任务 / 技能 / 设备；四种交互并存，肌肉记忆不可靠；
  `window.confirm` 在 Tauri WebView 里样式与桌面端割裂。
- **建议**：把 `ui/alert-dialog.tsx` 定为唯一破坏性确认原语，加 Promise 化的 `useConfirm()` hook，替换上述 15 处。

### [D6] 37 处原生 `<input>` **全部没有焦点环**；37 个 `<label>` 只有 16 个有 `htmlFor`
- **位置**：原生 `<input>` 分布在 16 个文件（`ResonancePage` 8、`SettingsPage` 7、`JdmEditorPage` 5、
  `SetupPage` 3、`ConversationPage` 2、`TaskBoardPage` 2 …）
- **证据**：这 16 个文件里 `focus-visible` / `focus:ring` 计数**全为 0**；全 `src/` 的 `focus-visible`
  只出现在 4 个文件（`ui/input.tsx:22`、`ui/button.tsx:9`、`ui/textarea.tsx`、`TaskEditDialog.tsx`）。
  而 `ui/input.tsx` 里**本来就有** `focus-visible:ring-2 focus-visible:ring-ring` + `useId()` 关联的 `Label htmlFor`。
  全项目 46 处 `<Input>` 中**只有 14 处用了 `label` 属性**。
  ```tsx
  // ResonancePage.tsx:386-393 —— 手写 label + 原生 input，label 与 input 无关联
  <label className="block text-sm font-medium mb-1">{t('resonance.instanceName')}</label>
  <input type="text" … className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
  ```
- **影响**：纯键盘用户 Tab 到输入框**看不到焦点位置**；读屏软件读不出输入框名称。
  可测量的 WCAG 2.4.7 / 3.3.2 失败。
- **建议**：37 处原生 `<input>` 全部换成 `ui/input.tsx` 的 `Input`（传 `label`）；补齐其余 21 处 `Input` 的 `label`。

### [D7] `Loading` / `EmptyState` / `Alert` 原语形同虚设，加载态 34 处各写各的
- **证据**：内联 `<Loader2 className="… animate-spin" />` **34 处 / 21 个文件**（`ProvidersPage` 一个文件 7 处，
  4 种尺寸写法）；`ui/loading.tsx` 已封装 `size: 'sm'|'md'|'lg'` 三档，**只用了 3 次**；
  `<Alert>` 在全部 25 个页面出现 **0 次**；`<EmptyState>` 只覆盖 6/25 页。
- **建议**：34 处内联 spinner → `<Loading size=… />`；`Alert` 要么启用要么删。

### [D8] `components/business/` 下 5 个组件 **0 引用**，含 722 行死代码
- **证据**：`ProviderCard` / `AgentCard` / `EntityCard` / `ServiceStatus` / `LocalEnginePanel`
  的 importer 计数**全为 0**；`LocalEnginePanel.tsx` 全文只出现在自身 `index.ts` 与自身定义处。
  `ModelsPage.tsx:423` 的 `LocalEngineTab` 是它的一份本地重写。
  `components/ui/` 里 `skeleton.tsx` / `alert.tsx` / `priority-badge.tsx` 同样是死代码。
  `components/business/component-reuse-guide.md`（2026-04-08，状态「已批准实施」）描述的 8 个组件里 4 个是死的。
- **建议**：优先「让页面 import 库组件」（能直接省掉一个 727 行的 `LocalEngineTab`），
  实在不接的目录删掉（≈38KB / 1000 行）；同时更新 `component-reuse-guide.md` 的文件清单。

### [D9] 四大巨型页面把「取数 + 业务规则 + 呈现」全揽在一个文件
- **位置**：`SettingsPage.tsx`（**1852 行 / 68.3KB / 20 个顶层组件 / 43 个 `useState`**）、
  `ModelsPage.tsx`（1129 行）、`ProvidersPage.tsx`（1118 行）、`ConversationPage.tsx`（932 行）
- **证据**：`SettingsPage.tsx` 里 `ServiceAndAgentsSection:215` 一个函数 **602 行**；
  一个文件里有 **4 套卡片原语并存**（`SettingsCard:127` / `SectionCard:185` / `business/SettingsCard` / `Card`）；
  `src/` 内 >30KB 的文件共 7 个，其中 4 个是页面。
- **建议**：按 `SECTIONS:37` 切成 9 个 `components/settings/<section>/`；
  `ModelsPage` 按已有的 `CloudProvidersTab:235` / `LocalEngineTab:423` 边界拆开。

### [D10] 页面直接 `fetch()` 拼 URL、直接裸 `localStorage`，绕过已有的 client / store 层
- **位置**：`fetch(` —— `ModelsPage.tsx` **9 处**、`LocalEnginePanel` 5、`AppInitializer` 3、
  `AddProviderModal` 3、`TelencephalonStatusPage` 2、`ModelOnboardingPage` 2；
  裸 `localStorage` —— `SettingsPage.tsx:820,827,870,877`、`WorkflowStudioPage.tsx:110,125`、
  `AppInitializer.tsx:69`、`SetupPage.tsx:267`、`PWAInstallPrompt.tsx:29,64`
- **证据**：仓库里**已有** `lib/prefrontalClient.ts`（19KB）、`lib/telencephalonClient.ts`（35KB）、
  `lib/storage.ts`（`shadow:` 前缀 + 配额驱逐）、`lib/settingsStore.ts`，但页面自己拼 base URL：
  ```tsx
  // ModelsPage.tsx:246
  const response = await fetch(`${API_BASE}/models/providers`);
  ```
  **两套 localStorage key 命名空间并存**：`lib/storage.ts:10` 用 `shadow:`（冒号），
  `SettingsPage.tsx:820` 用 `shadow_agent_name`（下划线）。`WorkflowStudioPage.tsx:126` 的配额异常 catch 是**空的**。
- **建议**：fetch 收进 client 层；裸 `localStorage` 统一走 `lib/storage.ts`；`settingsStore.ts` 与 `storage.ts` 二选一。

### [D11] 硬编码颜色 119 处 + 任意字号 44 处，集中在 5 个文件
- **证据**：hex Top：`#7c3aed` ×16、`#f97316` ×15、`#10a37f` ×11、`#8b5cf6` ×10、`#00d2d3` ×7；
  任意字号 `text-[11px]` **30**、`text-[10px]` **14**。
  这些 hex **不参与 dark mode**（`index.css:39-68` 的 `.dark` 只覆盖语义变量），
  `SetupPage.tsx:49` 的 `#ffffff` 与 `ProviderCard.tsx:13` 的 `#000000` 徽标在暗色模式下失控。

### [D12] 组件库自身不一致：变体别名成对、3 套导入风格、barrel 不完整
- **证据**：`ui/button.tsx:13-17` 里 `default` 与 `primary` 是**逐字符相同**的两条 class，
  `destructive` 与 `danger` 也是；`ui/badge.tsx:15-17` 同样有 `destructive`/`danger` 别名对。
  导入风格 3 套：`@/components/ui/…`（39 处）、`../components/ui/xxx`（24 处）、barrel（11 处）——
  因为 `ui/index.ts` 只导出 19 个，`questionnaire` / `tabs` / `voice-button` / `icon-placeholder` 不在其中。

---

## 3. 移动端发现（按严重度 × 频次排序）

### [M1] 没有任何间距 / 圆角 / 字号 / 时长 token，212 处 `EdgeInsets` 与 82 处圆角全是字面量
- **证据**：`EdgeInsets.*` **212 处 / 48 文件**；`BorderRadius.circular(数字)` **82 处 / 34 文件**，
  半径散出 **2/4/7/8/10/12/14/16/20/24 共 10 种**；`fontSize:` **135 处**（theme 占 18，**页面硬编码 117**）；
  `Duration(milliseconds:)` 13 处 / 5 种时长。
- **影响**：同一个「卡片内边距」在不同页是 8/12/16 三种，用户看不出差别却觉得「有的卡胖有的卡瘦」。
- **建议**：新建 `lib/theme/spacing.dart` / `radii.dart` / `motion.dart`，
  收敛到半径 4/8/12/16、间距 4/8/12/16/24、时长 100/200/300 三档。

### [M2] glass 组件族形同虚设：`GlassAppBar` **1/23**，`GlassButton` **0**，3 个 widget 从未被 import
- **证据**：`appBar: AppBar(` 命中 **22 个文件**，而 `GlassAppBar` 只在
  `screens/manage/management_hub_screen.dart:20` 出现一次 → **复用率 4.3%**；
  `GlassButton` 全库只出现在 `widgets/empty_state.dart:82` 内部 → **页面侧 0%**；
  `status_indicator` / `loading_shimmer` / `settings_sheet` 的 import 计数**全为 0**（含 test/）。
  反过来 `GlassCard` 是唯一被真正复用的（29 处调用点）——但它的 `borderRadius` / `glow` 两个参数
  **从未被任何调用方覆盖**（`glow:` 零命中）。
- **影响**：玻璃拟态是 Shadow 的品牌视觉，但 22/23 页面的顶部是 Material 默认 `AppBar`（无模糊、无玻璃底），
  **品牌一致性在页面级就已经断裂**。

### [M3] 21 个 Riverpod provider 声明在 `lib/screens/*.dart` 里，而不是 `lib/providers/`
- **证据**：分布在 14 个 screen 文件（`agents_screen.dart:14,19`、`conversation_screen.dart:13`、
  `group_screen.dart:313`、`discovery_screen.dart:127`、`logs_screen.dart:162`、`mcp_screen.dart:12,16`、
  `model_management_screen.dart:13,17`、`memory_screen.dart:7`、`providers_screen.dart:174`、
  `resonance_screen.dart:169`、`settings_screen.dart:17`、`soul_screen.dart:9,14,23`、
  `task_board_screen.dart:10`、`skills_screen.dart:12,16`）。
  而 `lib/providers/` 有 17 个文件，实际只放 `chat` / `theme` / `service` / `telencephalon` 等。
- **影响**：两个 screen 想用同一个 provider 只能 `import '../screens/xxx.dart'`，
  形成 screen → screen 的横向依赖（`agents_screen.dart:12` 已经 `import 'soul_screen.dart'` 拉进整个 Soul 页面）。
- **附带缺陷**：`providers_screen.dart:197` 调 `ref.read(providersNotifierProvider.notifier)._loadProviders()`
  —— 调的是 **notifier 的私有方法**，只因 screen 与 notifier 同文件才编译得过。
  （**本轮已修为公开 `loadProviders()`**）

### [M4] `features/` 下 36.5KB 零引用，其中 2 个 Dialog 与 `model_management_screen.dart` 同名重复实现
- **证据**：`import cloud_model_widgets` **0**、`import model_widgets` **0**、`ModelListScreen(` **0**；
  `LocalModelConfigDialog` 在 `cloud_model_widgets.dart:419` **与** `model_management_screen.dart:629`；
  `CloudModelConfigDialog` 在 `cloud_model_widgets.dart:93` **与** `model_management_screen.dart:708`。
  两套字段已经漂移（features 版有 `CloudModelSettingsSheet`，screen 版有 `_EngineStatusBar`）。

### [M5] 深色模式下不可读的硬编码灰：theme 之外 30 处 `Colors.grey.shade*` / `Colors.black*`
- **证据**：`logs_screen.dart:265` `Colors.grey.shade100`（筛选条背景，暗色下是一条刺眼白带）、
  `logs_screen.dart:300` `Colors.grey.shade600`（正文，dark bg 上不可读）；
  `resonance_screen.dart:211`、`discovery_screen.dart:232` 同款 `shade600`；
  `settings_screen.dart:957` `const TextStyle(fontSize: 12, color: Colors.black54)`。
  对照正确写法：`task_board_screen.dart:561-563` 用 `isDark ? AppColors.darkTextSecondary : …`。

### [M6] 零 `Semantics`、54 个 `IconButton` 只有 18 个有 tooltip、存在 16dp 触摸热区
- **证据**：`Semantics(|ExcludeSemantics|MergeSemantics|semanticLabel` 在 `lib/` **零命中**；
  `IconButton(` **54 处 / 29 文件**，`tooltip:` 只有 **18 处**（`settings_screen.dart` 单文件 11 个 `IconButton`
  只 1 个有 tooltip）；`logs_screen.dart:275-278` 是 16×16dp 的 `GestureDetector` +
  `Icon(Icons.close, size: 16)` —— 既无 tooltip 也无 Material 默认语义，热区远低于 48dp。
  （**本轮已修为 `IconButton` + tooltip**）

### [M7] 路由信息架构断裂：4 条路由无入口、3 个页面无路由、`/flows` 路由空转
- **证据**：全库 `context.push|go|replace` 的目标只有 **20 处**，因此
  `/conversations`（`app_router.dart:103`）、`/settings/model`（`:170`）、`/settings/prompt`（`:177`）、
  `/group`（`:211`）**没有任何入口**；`/flows`（`:218`）有路由，但实际入口是
  `settings_screen.dart:239` 的 `Navigator.push(=> FlowsScreen())` → **路由定义空转**。
  3 个页面没有路由：`setup_wizard_screen.dart`（12.9KB，全库无 import）、
  `provisioning_screen.dart`（8.2KB，全库无 import）、`features/models/screens/model_list_screen.dart`（8.7KB）。
  导航方式混用：**46 处 `Navigator.push` vs 20 处 `context.push/go`**。

### [M8] 底部导航：6 个 label 硬编码英文，**7 条路由高亮错误的 tab**
- **证据**：`main_shell.dart:17-24` 的 6 个 label 全是字面英文
  （`'Chat' / 'Live' / 'Service' / 'Tasks' / 'Manage' / 'Settings'`），而 ARB 已有 460 个中英齐备的 key。
  `_getSelectedIndex()` 用**精确相等**匹配 → `/settings/model`、`/settings/prompt`、`/settings/prefrontal`、
  `/settings/encephalon`、`/voice`、`/group`、`/flows` 全部落到 `return 0`（高亮 "Chat"）。
  （**本轮已修**：label 走 l10n + 改前缀匹配）

### [M9] l10n 有三处穿透：`setup_wizard` 把 ARB key 名当文案渲染
- **证据**：`setup_wizard_screen.dart:162-164`：
  ```dart
  title: 'Setupwelcometitle',
  subtitle: 'Setupwelcomedesc',
  actions: [FilledButton(onPressed: onNext, child: Text('Commoncontinue'))],
  ```
  同类共 **20+ 处**（`:168-170,216,217,219,221,229,239,290-295,303,322,323,332,333,343,344,370,371,376`）。
  而 `app_en.arb` / `app_zh.arb` 里 `Setup*` 命中 **0** —— **这些 key 根本不存在**，
  页面一旦接上路由，用户看到的就是字面的 `Setupwelcometitle`。
  另有 `task_board_screen.dart:386` 的 `'To Do'`（其余 5 列都走 l10n）。
  硬编码英文串 60+ 处：`settings_screen.dart:237,318,931,949,956,963,973,985`、
  `flows_screen.dart` 7 处、`group_screen.dart` 10 处、`provisioning_screen.dart` 13 处。

### [M10] `settings_screen.dart` 992 行、40 个 UI 块、8 个私有组件、3 层业务逻辑混在一个文件
- **证据**：内联私有组件 8 个（`_ServiceStatusSection:332`、`_ServiceStatusTile:361`、
  `_AccessibilityTile:413`、`_ModelStoreConfig:470`、`_TtsSettingsSection:625`、`_MemoryUsageBar:819`、
  `_BackendSettingsCard:882`）；`:17` provider 定义在 screen 里；
  `:21-86` 的 `SystemMemoryInfo` **读 `/proc/meminfo` 并解析** —— 平台 IO 在 UI 文件里。
  `:232` 的 `GlassCard(` 顶格，而同级兄弟缩进 14 空格 —— 这段大概率没被格式化过。

### [M11] 三个真实缺陷：`TextEditingController` 泄漏、`build()` 里挂副作用、UI 调 notifier 私有方法
- **证据**：
  ```dart
  // resonance_screen.dart:248-251 —— 每次开弹窗泄漏 3 个 controller
  void _showAddDialog(BuildContext context) {
    final nameController = TextEditingController();
    final hostController = TextEditingController();
    final apiKeyController = TextEditingController();
  ```
  （`discovery_screen.dart:297,299` 同理泄漏 2 个；这两个 screen 在 `.dispose()` 计数中缺席，其余 12 个都有）
  ```dart
  // settings_screen.dart:937-939 —— build 里挂副作用
  if (!_loaded) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _hydrate());
  }
  ```
  `_hydrate()` 里的 `setState` 若抛异常，`_loaded` 永远是 `false` → **每次 rebuild 都再排一个
  post-frame callback → 无限重排循环**。

### [M12] 重复 UI 片段四处成灾：`AlertDialog` 28 处、徽章 6 处、状态点 8 处、设置行 13 处
- **证据**：`AlertDialog(` **28 处 / 17 文件**，每处各自手写 `TextButton(cancel) + ElevatedButton(confirm)`；
  徽章（`Container` + `EdgeInsets.symmetric` + `BoxDecoration` + `borderRadius`）**6 处独立实现**；
  `BoxShape.circle` 状态点 **8 处**（而 `StatusIndicator` 零引用）；
  `GlassCard(padding: EdgeInsets.zero, child: ListTile(leading: Icon(...)))` 在 `settings_screen.dart`
  出现 **13 次**，`leading: Icon(` 全库 19 处中 **15 处在 settings_screen.dart 一个文件**。

---

## 4. 整改顺序（跨端）

### 第 1 批 · 低风险（纯新增 / 替换，不动数据流，可独立 PR）
| # | 动作 | 消掉 |
|---|---|---|
| 1 | **把守门员插上电**：修 `validate-i18n-keys.mjs:44` 的正则；`package.json` 加 `i18n:check`；CI 加 `eslint` + `i18n:check`（eslint 先 warn 提交基线） | D2 |
| 2 | 补齐桌面端 27 个 i18n key → 删掉 62 处 `t()` 的中文第二参数 | D1 |
| 3 | 补齐移动端 `setup_wizard` 的 20+ 个 l10n key（当前显示的是字面 key 名） | M9 |
| 4 | 移动端底部导航 label 走 l10n + `_getSelectedIndex` 改前缀匹配 | M8 ✅ 本轮已做 |
| 5 | 移动端 `logs_screen` 的 16dp `GestureDetector` → `IconButton`（自动获得 48dp 热区 + tooltip） | M6 ✅ 本轮已做 |
| 6 | 移动端 `providers_screen` 调 notifier 私有方法 → 公开 `loadProviders()` | M3 ✅ 本轮已做 |
| 7 | 移动端 `task_board` 的 `'To Do'` → l10n；backlog 列补 `taskStatusBacklog`（原来两列都叫「待办」） | M9 ✅ 本轮已做 |
| 8 | 桌面端删死代码：`components/business/` 5 个 0 引用组件、`ui/{alert,skeleton,priority-badge}.tsx`、`lib/settingsStore.ts` | D8 |
| 9 | 移动端删死代码：`lib/features/`（36.5KB，2 个 Dialog 同名重复） | M4 |

### 第 2 批 · 中风险（单端改造，行为不变）
| # | 动作 | 消掉 |
|---|---|---|
| 10 | 桌面端 provider 表合并到 `lib/cloudProviders.ts`（修连字符 id、合并 4 份 logo、统一颜色） | D3 |
| 11 | 桌面端 `useConfirm()` 统一破坏性确认，替换 13 处零确认 + 2 处 `window.confirm` | D5 |
| 12 | 桌面端 37 处原生 `<input>` → `Input`；补 `label` | D6 |
| 13 | 桌面端 34 处内联 spinner → `<Loading>`；`<Alert>` 启用或删 | D7 |
| 14 | 移动端新建 `GlassListTile` / `AppBadge` / `confirm_dialog`，替换 13 处设置行 / 6 处徽章 / 28 处 `AlertDialog` | M12 |
| 15 | 移动端 22 处裸 `AppBar` → `GlassAppBar`（需先给 `GlassAppBar` 加 `bottom` 参数承接 TabBar） | M2 |
| 16 | 移动端 30 处 `Colors.grey.shade*` → 语义色（`AppColors` 补 `mutedText` / `surfaceRaised`） | M5 |
| 17 | 移动端 `resonance_screen` / `discovery_screen` 的弹窗 controller 改由 `StatefulWidget` 持有并 dispose | M11 |
| 18 | 桌面端 `ModelsPage` 9 处 fetch 收进 client 层；4 处裸 `localStorage` 统一到 `lib/storage.ts` | D10 |

### 第 3 批 · 结构性（跨文件，需分阶段）
| # | 动作 | 消掉 |
|---|---|---|
| 19 | **定一套跨端品牌色**：桌面端 `tailwind.config.ts` 加品牌槽位、移动端 `AppColors` 与之对齐；两端统一到一个紫 | §0 |
| 20 | 移动端新建 `lib/theme/{spacing,radii,motion}.dart`，212 处 `EdgeInsets` / 82 处圆角 / 117 处 `fontSize` / 5 种时长逐步收敛 | M1 |
| 21 | 桌面端 `SettingsPage` 按 9 个 section 拆文件；`ModelsPage` 按 tab 边界拆开 | D9 |
| 22 | 移动端 `settings_screen` 按 7 个 section 拆到 `lib/features/settings/sections/`；`SystemMemoryInfo` 移出 | M10 |
| 23 | 移动端 21 个 screen 内 provider 迁到 `lib/providers/`；`lib/providers/` 成为唯一状态层 | M3 |
| 24 | **两端信息架构对齐**：确定聊天 / 会话列表 / 端脑状态 等核心概念的统一命名与层级；移动端补齐或明确不做桌面端的 5 项能力 | §1 |
| 25 | 移动端路由补齐（`/conversations` `/group` `/settings/model` `/settings/prompt` 的入口）；46 处 `Navigator.push` 统一到 GoRouter；`setup_wizard` / `provisioning` 接路由或删 | M7 |

---

## 5. 一个已知待验假设（与本审查独立）

设置页在真机上**正文整片不绘制**（AppBar 与底部导航正常）。静态审查结论：**不是代码 bug** ——
设置页正文**每一块都在 `GlassCard` 里**（`ClipRRect` + `BackdropFilter` + `Material(transparent)` +
`AnimatedContainer`），而 AppBar 不在，与症状完全吻合；且 `AppErrorBoundary` 是整树替换
（出错时整个 App 变 "Something went wrong"），真机 AppBar 正常说明**没有 build 异常**。
嫌疑落在 `BackdropFilter` 与 Impeller 的交互。

**零重建 A/B 方案**（已验证 Flutter 3.41.4 上仍可用）：

```powershell
adb shell am force-stop com.ibloc.shadow
adb shell am start -n com.ibloc.shadow/.MainActivity --ez enable-impeller false
```

> `FlutterShellArgs.fromIntent` 读 intent extra `enable-impeller`（`FlutterShellArgs.java:51,125-131`）；
> `flutter_main.cc:127` 的 `warn_on_impeller_opt_out` + `SelectedRenderingAPI` 的 `kSkiaOpenGLES`
> 分支说明 `--enable-impeller=false` 在 3.41.4 上仍能落到 Skia。

**这条假设与 [M2] 直接相关**：如果 `BackdropFilter` 确实在部分 GPU 上不可靠，
那么「把 22 处裸 `AppBar` 换成 `GlassAppBar`（玻璃拟态）」这条整改**必须先解决
`BackdropFilter` 的降级策略**，否则会把问题从 1 个页面扩散到 22 个。
**建议顺序：先定 `BackdropFilter` 的降级方案（能否按能力开关 / 提供无模糊变体），再动 [M2]。**
