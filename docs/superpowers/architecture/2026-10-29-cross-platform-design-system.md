# 跨端统一设计系统 —— 桌面端与移动端（2026-10-29）

> **前提原则**（用户 2026-10-29 提出）：
> > 两端本质上是大脑 agent 的包裹客户端，应该尽量维持两端页面风格 / UI/UX 的统一。
> > 每端可能有一些特别的功能，那也是对功能的封装，本质上还是一个 agent。
>
> 本文把这条原则翻译成**可执行的结构**。配套产物已入库：
> [`design-tokens.json`](../../design-tokens.json)（设计数值的唯一真相源）、
> [`agent-surface.json`](../../agent-surface.json)（能力 → 两端入口的唯一映射表）。

---

## 1. 原则的三条推论

原则本身不指导编码，要先推出可检查的推论：

| 推论 | 含义 | 现状是否满足 |
|---|---|---|
| **P1 同一个能力，两端不能有两个名字、两套入口语义** | 能力标识（id）与文案 key 跨端唯一 | ✗ `chat` 在桌面是 `/conversation`、在移动是 `/`；`telencephalon` 在桌面是 `/cortex-status`、在移动是 `/settings/encephalon`；文案 key 两套体系（桌面 `nav.tasks` vs 移动 `navTasks`） |
| **P2 视觉数值是 agent 的一部分，不是端子的** | 颜色/间距/圆角/字阶/时长两端同源 | ✗ 同一个紫在三处是三个值（`#A78BFA` / `purple-500` / `violet-500`）；移动端 212 处 `EdgeInsets` 字面量、82 处圆角散出 10 种半径；桌面端 351 处原始色阶 class + 119 处硬编码 hex |
| **P3 导航是「能力」的投影，不是「页面」的列表** | 两端导航从同一份能力清单生成 | ✗ 桌面端侧边栏 12 项**平铺无分组**且硬编码；移动端 6 tab 硬编码，且 `_getSelectedIndex()` 又把路由路径重复列了一遍 |

**「乱」的三个层次，按修复顺序**：
1. **结构乱** —— 两端各自的 IA、命名、路由不一致（P1/P3）→ 这是用户最先感知到的
2. **视觉乱** —— 两套设计语言、两套 token（P2）→ 这是「看着不像一个产品」的来源
3. **代码乱** —— 巨型文件、死代码、原语失效 → 让上面两件事改不动

**因此整改顺序必须是：先立共享源（P1/P2/P3 的数据结构），再改两端投影，最后清理代码。**
否则就是「在两套不一致的底座上继续加功能」。

---

## 2. 统一什么 / 分叉什么

**「统一」不等于「两端长得一模一样」。** 端侧载体本来就不同（桌面宽屏高密度、移动窄屏触控友好）。
真正要统一的是**语言**，不是像素。

| 层 | 共享？ | 内容 | 理由 |
|---|---|---|---|
| **设计数值** | ✅ 完全共享 | 颜色 / 间距 / 圆角 / 字号 / 字重 / 时长 / 断点 | 「同一个 agent」最直接的可执行体现：改一处两端同时变 |
| **能力清单** | ✅ 完全共享 | 能力 id / 分组 / 文案 key / 两端入口 / 依赖的 lobe | 避免两端能力名与入口语义漂移 |
| **运行时能力状态** | ✅ 同源 | 哪些能力在线可用（端脑 `/shadow/v1/agents`） | 两端看到的是同一个 agent 的同一份状态 |
| **信息架构骨架** | ✅ 共享语义 | 能力分组（对话/任务/能力/端侧/运维）+ 排序 | 分组语义一致，容器形态不同 |
| **文案 key** | ✅ 共享语义 | 同一能力用同一 key（`surface.<id>.label`） | 两套 key 体系是命名漂移的温床 |
| **交互流程** | ✅ 共享语义 | 破坏性确认、空态、加载态、错误态的**模式** | 模式一致，实现可以不同 |
| **容器形态** | ❌ 分叉 | 桌面侧边栏分组 / 移动底部 tab + 管理台 | 屏幕形态决定 |
| **信息密度** | ❌ 分叉 | 桌面一屏多列 / 移动一屏一卡 | 桌面端已有 `max-lg` 折叠基线 |
| **端侧特有能力** | ❌ 分叉（但必须显式登记） | 电脑操作、直播、客服、配网 | 它们是 agent 能力在特定终端的**封装**，不是另一个产品 |
| **组件代码** | ❌ 分叉 | React vs Flutter | 强行共享是自欺欺人；共享的应该是**契约**（token 数值、能力清单、key 语义） |
| **玻璃拟态 / neon glow** | ❌ 分叉 | 移动端保留，桌面端不引入 | 桌面端信息密度高，模糊背景会降低可读性。统一的是**色彩与节奏**，不是效果强度 |

> 换句话说：**两端应当像同一个品牌的两种尺寸，而不是像两个品牌各自缩小。**
> 差异应该体现在**容器与密度**，不该体现在**颜色、间距、命名与能力语义**。

---

## 3. 三层共享物

### L1 · 设计数值 —— `design-tokens.json`（已入库）

单一真相源，JSON 格式，两端各自生成：

```
design-tokens.json
  ├─ shadow-desktop/tailwind.config.ts   → 读取 → Tailwind extend + CSS 变量
  └─ shadow-mobile/lib/theme/app_tokens.g.dart → scripts/gen_tokens.dart 生成
```

当前内容取自移动端 `AppColors`（它已经是两端里唯一被正确集中的东西 —— 全库唯一的 `Color(0x…)` 就在那个文件里），
外加桌面端已有的 shadcn 语义变量作为其投影。

**桌面端接入后的效果**：`--primary` 从近黑（`222.2 47.4% 11.2%`）变成品牌紫，
暗色模式的主按钮从「白底黑字」变成「紫底白字」—— 这正是现在两端主按钮不一致的根因。

**移动端接入后的效果**：212 处 `EdgeInsets` 字面量、82 处圆角、117 处 `fontSize` 逐步换成 token，
收敛到 4/8/12/16 四档圆角、4/8/12/16/24 五档间距、100/200/300 三档时长。

### L2 · 能力清单 —— `agent-surface.json`（已入库）

每条能力声明 `id` / `group` / `labelKey` / `icon`（语义名，两端各自映射到自己的图标集）/
`desktop.route` / `mobile.route` / `nav`。两端导航从它生成。

**一份清单，两种投影**：

```
                    agent-surface.json
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
  桌面端侧边栏（分组）                    移动端底部 tab（≤6）
  converse / work / capability            + 管理台卡片（capability 组）
  / tools / ops
```

一端为 `null` = 该端暂时不做，但**必须显式写出来**——不能悄悄消失（这正是今天 `/conversations`
注册了却没入口、`setup_wizard` 有页面却没路由的根因）。

### L3 · 运行时能力状态 —— 端脑（已具备，数据需规整）

| 端点 | 提供 |
|---|---|
| `GET /shadow/v1/agents` | lobe 列表：`name` / `kind` / `enabled` / `skills[]` / `agent_card` / `health_status` |
| `GET /.well-known/agent.json` | 端脑自身的 AgentCard |

**待规整的一处**（实测）：native lobe 的 `skills[]` 是**空数组**，
能力标识实际落在 `agent_card.metadata.capabilities[]`（形如 `"lobe:native - <描述>"`）
和 `config.required_capabilities`。两个字段语义重叠且都不标准，
接运行时状态前应先统一（建议：`skills[]` 放**可路由的技能标识**，
`metadata.capabilities[]` 放**自然语言能力描述**）。

---

## 4. 能力缺口表（从 `agent-surface.json` 直接读出）

| 能力 | 桌面 | 移动 | 状态 |
|---|---|---|---|
| chat | `/conversation` | `/` | ⚠️ 入口语义不同 |
| conversations | — | `/conversations` | ⚠️ 桌面缺 |
| voice | `/voice` | `/voice` | ✓ |
| livestream | — | `/livestream` | 移动特有 |
| customer-service | — | `/customer-service` | 移动特有 |
| tasks | `/tasks` | `/tasks` | ✓ |
| group | `/group` | `/group` | ✓ |
| document / previews | 有 | — | 桌面特有 |
| agents | — | `/manage/agents` | ⚠️ 桌面缺 |
| models / providers / mcp / skills / memory | 有 | 有 | ✓ |
| model-download | `/models/download` | — | 桌面特有 |
| model-settings | — | `/settings/model` | ⚠️ 桌面缺 |
| prompt-settings | `/prompt-settings` | `/settings/prompt` | ✓（路径形态不同） |
| flows | `/flows` | `/flows` | ✓ |
| workflow-studio | `/workflow-studio` | — | 桌面特有 |
| computer-use / jdm-editor | 有 | — | 桌面特有 |
| **provisioning** | — | — | ⚠️ **两端都没有**：页面存在但无路由无入口 |
| discovery / logs / resonance / settings | 有 | 有 | ✓ |
| trace | `/trace` | — | 桌面特有 |
| telencephalon | `/cortex-status` | `/settings/encephalon` | ⚠️ 名字与层级都不同 |
| **setup** | `/setup` | — | ⚠️ 移动端 `setup_wizard_screen.dart` 有页面无路由 |

**读出来的三件事**：
1. 桌面端有 5 项移动端完全没有的能力，移动端有 3 项桌面端没有的 —— 这些是**端侧封装**，允许分叉，但要在清单里登记（已登记）。
2. **`setup` 与 `provisioning` 是真正的孤儿**：两端都没入口。要么接线，要么删（用户决定）。
3. **`telencephalon` 与 `chat` 的入口必须统一** —— 它们是同一个 agent 的**自我认知**入口，
   两端叫不同名字、放不同层级，是「两个产品」观感的主要来源。

---

## 5. 落地路径

| 阶段 | 内容 | 风险 | 消掉的 |
|---|---|---|---|
| **0. 共享源（本次已做）** | `design-tokens.json` + `agent-surface.json` 入库；两端各接一个读取/生成脚本；CI 加一步「两端 token 没漂移」校验 | 无（纯新增，不动现有视觉） | 立好 P1/P2/P3 的数据结构 |
| **1. token 接入** | 桌面端 `tailwind.config.ts` 读 tokens（`--primary` 变品牌紫）；移动端生成 `app_tokens.g.dart` 并替换高价值字面量 | 中（桌面端视觉会变） | P2 |
| **2. 能力驱动导航** | 桌面端侧边栏改**分组**并由清单生成；移动端 tab / 管理台由清单生成；统一 `surface.*` 文案 key | 中 | P1 P3 |
| **3. 运行时状态** | 两端都拉端脑 `/shadow/v1/agents`，不可用的能力标灰；移动端管理台从前额叶方言**迁到端脑方言**（与「改嵌大脑」同一方向） | 中 | P3 的动态部分 |
| **4. 入口语义统一** | `chat` 与 `telencephalon` 两端统一命名与层级；`setup` / `provisioning` 接线或删除 | 中 | P1 |
| **5. 代码清理** | 执行 [`2026-10-29-ui-ux-code-review.md`](2026-10-29-ui-ux-code-review.md) 的第 1/2/3 批（死代码、巨型页面拆分、原语统一） | 中高 | 代码乱 |

**阶段 0 刻意不动两端现有视觉** —— 让 token 文件先存在并可被 review，
下一次改动（阶段 1）才让两端同时变色。这样任何一个阶段出问题都能单独回滚。

---

## 6. 需要拍板的三件事

1. **品牌色取哪个？**
   - 推荐：**`#A78BFA`（移动端现有的 Deep Shadow 紫）**作为跨端唯一品牌色。
     理由：它是唯一已经有完整两端表达（移动端 `AppColors` + `glass_theme`）的那个；
     桌面端的 `purple-500`/`violet-500` 只是零散引用，没有品牌地位。
   - 代价：桌面端主按钮从近黑变紫，`--primary` 语义要连带改（shadcn 的 `primary` 是「强调色」不是「品牌色」，
     换色会影响 35 处 `bg-primary` + 31 处 `text-primary`）。

2. **桌面端要不要也上玻璃拟态？**
   - 推荐：**不要**。桌面端 25 个页面里 `SettingsPage` 单页就有 43 个 `useState`，
     信息密度高；玻璃模糊会直接降低可读性，而且 `BackdropFilter` 在真机上的可靠性问题**尚未定性**
     （见 UI/UX 审查报告 §5）。统一的是色彩与节奏，不是效果强度。

3. **`setup` 与 `provisioning` 接线还是删？**
   - 这两端都进不去的页面合计 21KB。接线 = 让「首次引导」和「ESP32 配网」真正上线；
     删 = 承认这轮不做。**这是产品决定，不该由代码审查替用户做。**

---

## 7. 与其它文档的关系

- [`2026-10-29-ui-ux-code-review.md`](2026-10-29-ui-ux-code-review.md) —— 代码结构层审查（24 条发现）。
  本文是**方向层**：把那 24 条按「先立共享源」的顺序重排，并指出第 3 批的「玻璃组件统一」
  必须等 `BackdropFilter` 降级方案定了再做（否则把问题从 1 个页面扩散到 22 个）。
- [`2026-09-23-shadow-desktop-uiux-audit.md`](2026-09-23-shadow-desktop-uiux-audit.md) —— 能力覆盖审计
  （功能有没有）。其 P0 清单已全部落地。
