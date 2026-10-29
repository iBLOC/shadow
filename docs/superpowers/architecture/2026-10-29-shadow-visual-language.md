# Shadow 视觉语言推导 —— 从「每个人的影子」到一套可执行的数值

> 2026-10-29 · 阶段 1（token 接入 + 用户自定义外观）
> 配套文档：[跨端统一设计系统](./2026-10-29-cross-platform-design-system.md) · [UI/UX 代码审查](./2026-10-29-ui-ux-code-review.md)

---

## 0. 为什么需要这份文档

两端当前的视觉是**互相对立**的：

| | 桌面端 | 移动端 |
|---|---|---|
| 自称 | `App.css:3` "shadcn/ui default slate theme" | "Deep Shadow 紫青霓虹" |
| 主色 | `--primary: 222.2 47.4% 11.2%`（近黑，暗色模式下反而是近白） | `primary #A78BFA` + `secondary #22D3EE` |
| 品牌色 | **没有**（20 处「紫」全是 Tailwind 语义色板直接引用） | 两个霓虹色 |
| 同一个紫 | `#A78BFA` / `purple-500` / `violet-500` —— 三处三个值 | |

所以「两端统一」不能靠二选一（选 slate 还是选紫青），必须**重新推导**。

推导的起点是用户给的产品定位（2026-10-29）：

> 两端本质上是大脑 agent 的包裹客户端，应尽量维持两端页面风格 / UI/UX 统一；
> Shadow = 每个人的影子 / 个人助理。

---

## 1. 隐喻拆解：影子在物理上是什么

「影子」不是一个形容词，是一个有确定物理性质的东西。把它拆开：

| 影子的物理事实 | 视觉上的推论 |
|---|---|
| 影子 = **光的缺失**，不是发光体 | 品牌不该「会发光」。霓虹紫青在语义上与影子相反 —— 霓虹是光源。 |
| 影子**没有颜色**，它是光的缺失 | 基底是**中性黑白灰**。真实阴影因天光而偏冷，所以中性不是"没设计"，是"设计对了"。 |
| 影子边缘是**半影（penumbra）**，不是硬边 | 玻璃拟态 = 半影层的几何表达（模糊 + 半透明白 + 1px 边）。它不是装饰风格，是隐喻的直接翻译。 |
| 影子**有确定方向** —— 光源在哪，影子朝哪偏 | 全局**唯一光源方向**（光源固定在左上，阴影一律朝右下）。两端叠在一起不打架的前提。 |
| 影子 = **本体的忠实复本**，有实有虚 | 信息层级用**虚实**表达（实心 = 用户的数据，半透明 = agent 的推断），不靠颜色深浅堆层级。 |
| 影子**跟着你**，属于具体的人 | 主题色是**用户可覆盖的槽位**，不是产品强加的品牌。个人助理的影子有自己的色温。 |

---

## 2. 三层视觉语言：Umbra / Penumbra / Caustic

```
┌───────────────────────────────────────────────────────────┐
│ Caustic（焦散/光斑）—— 实时信号                            │
│   agent 在线 / 正在思考 / 正在拾音                          │
│   颜色来自状态色，不来自主题色                                │
├───────────────────────────────────────────────────────────┤
│ Penumbra（半影）—— 半透明层                                │
│   卡片 / 对话框 / 底栏 / 侧边栏                            │
│   模糊 + 半透明白 + 1px 边                                  │
├───────────────────────────────────────────────────────────┤
│ Umbra（本影）—— 实心层                                      │
│   页面底 / 输入框 / 用户自己的确定数据                       │
│   中性黑白灰                                                 │
└───────────────────────────────────────────────────────────┘
```

**发光（glow）从装饰降级为信号**。这是这套语言里最容易被违反、也最重要的一条：
满屏发光会让「agent 正在工作」这个信号失去意义。所以：

- 移动端 `GlassCard(glow: true)` 保留为**显式开关**，默认关；
- 辉光色用**状态色**（在线 / 思考 / 录音），不用主题色；
- 桌面端目前没有辉光，不需要新增。

---

## 3. 数值：黑白灰基底 + 主题色槽位

### 3.1 基底（中性阶）

两端统一到**同一套中性阶**（来自 shadcn 的 zinc 语义色板，桌面端原本就在这个体系里）：

| 槽位 | 暗色 | 亮色 |
|---|---|---|
| `surface.base`（页面底） | `#0A0A0B` | `#FFFFFF` |
| `surface.raised`（卡片） | `#111113` | `#FAFAFA` |
| `surface.overlay`（输入框/浮层） | `#18181B` | `#F4F4F5` |
| `surface.glass`（半影层底） | `#FFFFFF14` | `#FFFFFFB3` |
| `text.primary` | `#FAFAFA` | `#09090B` |
| `text.secondary` | `#A1A1AA` | `#52525B` |
| `border.default` | `#FFFFFF1F` | `#E4E4E7` |

### 3.2 主题色槽位（用户可覆盖）

**默认中性**（`#71717A`）—— 因为影子本身没有颜色。

主色永远是**反色**：暗色模式上是光（近白），亮色模式上是影（近黑）。
这既符合 shadcn 现有行为，也符合 Material 3「primary 随亮度换色调」的规则。

用户选了有彩色的 seed 后，由**同一套算法**在两端派生两端色调：

```
中性 seed（s < 0.04）  →  dark = L 0.97（光）   light = L 0.055（影）
彩色 seed              →  dark = L 0.80（亮色调） light = L 0.42（暗色调）
前景色                 →  按 WCAG 对比度在 #FFFFFF / #09090B 里挑，不写死
```

可选色板（两端同一份，在 `design-tokens.json` 的 `color.accent.userSelectable`）：
中性 / 石板 / 靛蓝 / 月青 / 竹青 / 琥珀 / 绛。

### 3.3 玻璃与阴影

- 玻璃：模糊 `20px` + `saturate(140%)`，两端同值。
- 阴影：**全局统一光源方向**（左上），暗色 `rgba(0,0,0,0.28)` 起，亮色 `rgba(0,0,0,0.05)` 起。
- **光源层**（`.shadow-ambient` / `--ambient-glow`）：页面顶部一片柔和的光，**跟着主题色走**。
  玻璃要有东西可模糊，才不是贴纸 —— 这一层是玻璃拟态能成立的前提。

---

## 4. 两端落点对照

| 语义 | 桌面端 | 移动端 |
|---|---|---|
| 设计数值源 | `shadow-desktop/src/styles/tokens.css`（生成） | `shadow-mobile/lib/theme/app_tokens.g.dart`（生成） |
| 主题色派生 | `src/styles/accent.g.ts` → `deriveAccentTones()` | `lib/theme/app_tokens.g.dart` → `deriveAccentTones()` |
| 半影层 | `.glass`（`src/index.css`） | `GlassCard`（`lib/widgets/glass_card.dart`） |
| 主题运行时覆盖 | `stores/themeStore.ts` → 写 `<html>` 内联 CSS 变量 | `providers/theme_provider.dart` → `ThemeAppearance` |
| 外观设置 UI | `SettingsPage` → UISection | `SettingsScreen` → `AppearanceSection` |
| 光源层 | `.shadow-ambient` | `AppColors.darkGradient` / `lightGradient`（暂未加径向光，属阶段 1.5） |

### 4.1 单一真相源的落地方式

```
design-tokens.json          ← 人改这个
      │
      ├─ scripts/gen_tokens.mjs ──► shadow-desktop/src/styles/tokens.css
      │                          └─► shadow-desktop/src/styles/accent.g.ts
      │                          └─► shadow-mobile/lib/theme/app_tokens.g.dart
      │
      └─ scripts/check-agent-surface.mjs ← 校验生成物没漂移 + 两端没各写各的
```

生成物是**从属**的：手改它们会被守门员拦下。

### 4.2 主题色派生算法只写一次

`scripts/lib/tokens.mjs` 里的 `deriveAccentTones()` 是**唯一实现**，生成进两端。
所以两端不可能"算法不一样但看不出来"。

但光靠"生成进两端"还不够 —— 两端的 HSL→sRGB 取整仍可能差 1。
于是加了**契约快照** `scripts/accent-tones.fixture.json`：

- 桌面端 `tests/styles/accentTones.test.ts` 精确断言；
- 移动端 `test/theme/accent_tones_test.dart` 逐通道 ±2 容差断言。

算法要改 = 必须同时改两端实现 **并且** 有意识地更新快照。

---

## 5. 用户可定制能力（个人助理的落点）

这是用户明确提的需求：「后续也需要向用户提供自定义的能力，比如主题色、对话框背景等等」。

当前已落地三个槽位（两端对称）：

| 槽位 | 桌面端 | 移动端 | 持久化 |
|---|---|---|---|
| 主题色 | `appearance.accentSeed` | `ThemeAppearance.accentSeed` | localStorage / `app_config.json` |
| 玻璃强度 | `appearance.glassIntensity` | `ThemeAppearance.glassIntensity` | 同上 |
| 对话框背景 | `appearance.surfaceOverride` | `ThemeAppearance.surfaceOverride` | 同上 |

- 玻璃强度 0 = **关掉玻璃**（落回实心表面，不是变透明 —— 玻璃关了应该是实心的）。
- 对话框背景可选值是同一份清单（墨 / 深 / 中性 / 浅），`null` = 跟随主题。
- 换色后**整个 App 跟着变**：移动端靠 `AppColors.applyAccent()`（63 处 `AppColors.primary` 引用无需逐个改造），桌面端靠写 `<html>` 内联 CSS 变量。

---

## 6. 可验证性

这一轮的每条主张都有对应检查：

| 主张 | 谁在验 |
|---|---|
| 两端数值同源 | `scripts/check-agent-surface.mjs` 的「生成物同步」段（0 过期才通过） |
| 两端不许各写各的颜色 | 同上，检查 `app_colors.dart` / `glass_theme.dart` / `glass_card.dart` 里的手写 `Color(0x…)`，以及 `index.css` 里的裸 hex |
| 两端玻璃语义对等 | 同上，检查桌面端有 `.glass`、移动端有 `BackdropFilter` |
| 两端主题色算法一致 | `scripts/accent-tones.fixture.json` + 两端各自的契约测试 |
| 改 token 两端同时变 | CI 的 `Cross-client consistency check` 步骤 |

---

## 7. 已知风险与本轮未做

**风险**

1. **`BackdropFilter` 在 Android Impeller 上可能不 paint** —— 真机设置页空白问题尚未定性。
   桌面端是 Chromium WebView，路径不同，风险**不等价**。
   ⇒ 两端玻璃要**分别**在真机/真浏览器上验证，不能假定同一个结论。
2. **移动端的 `AppColors.primary` 变成了可变全局**。这是为了让 63 处既有引用
   跟着主题走，代价是不能再进 `const` 上下文（已修 3 处）。
   ⇒ 长期看应该让这些地方改读 `Theme.of(context).colorScheme.primary`，
   属于阶段 1.5 的清理。
3. **桌面端 `--card` / `--popover` 被用户覆盖时，明暗两套不再区分** —— 这是
   用户显式指定背景的预期行为，但用户切明暗时不会自动变。

**未做（阶段 1.5 及以后）**

- 移动端**光源层**还没加径向光（桌面端已有 `.shadow-ambient`）。
- 移动端 212 处 `EdgeInsets` 字面量、117 处硬编码 `fontSize`、30 处
  `Colors.grey.shade*` 尚未接 token —— 纯机械迁移。
- 桌面端 351 处原始色阶 class、119 处硬编码 hex 尚未 token 化。
- 两端 `surface.*` 统一文案 key（能力清单阶段 2）。
- `setup` 首次进入引导接线、`provisioning` 搁置（另见跨端设计系统文档）。
