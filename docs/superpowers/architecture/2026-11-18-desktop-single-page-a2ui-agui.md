# 桌面端：把「对话」与「A2UI」合成**一个页面**，走 **AG-UI**（桌面端那一半）

> epoch: 2026-11-18 ｜ authority: measured ｜ scope: project
> 用户诉求（承移动端那一刀的同一句）：「现在移动端 对话也没按和agent2ui页面还是两个页面有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」
> 台账 U+37B3 条 ⑦❷：「桌面端同样的重复还在（它那块独立面板）⇒ ⇒ 用户这一刀只点了移动端 ⇒ ⇒ 桌面端另起一刀」—— **本篇就是那一刀**。

---

## 0. 先把一句话掰正（**A2UI 不是传输协议**）

与移动端那篇同口径：**A2UI ＝ 内容协议**（界面长什么样），**AG-UI ／ A2A ＝ 传输协议**（内容怎么走）。
官方口径：**面向用户的「面」归 AG-UI**、A2A 保留它自己的用途（Agent↔Agent ＋ 客户端工具取数）。
⇒ ⇒ 所以这一刀做的**不是**「把 A2A 端点删掉」，而是：
**把桌面端客户端这一侧的 A2A 承载收掉，让桌面端只走 AG-UI。**

---

## 1. 现状核实（三条承载，逐条有源码行号）

桌面端在 AG-UI 换线之后（兄弟会话 㞤 那刀的未提交工作，本刀在其上继续），**同一个页面里住着两条协议**：

| # | 形态 | 传输 | 长在哪 | 记会话吗 | 证据 |
|---|---|---|---|---|---|
| ① | **AG-UI 内联** | AG-UI（官方 `ACTIVITY_SNAPSHOT`） | **对话消息里**（画在它被点名的那句话下面） | 记 | `src/lib/agui/a2uiActivity.ts` → `driver.ts:143` 的 `ACTIVITY_SNAPSHOT` 档 → `conversationTurn.ts` 的 sink → `ConversationPage.tsx` 的 `onA2uiSurface` → `msg.a2ui_surface` → `A2uiOpsSurface` |
| ② | **独立面板** | **A2A**（`/a2a`） | 对话上方**另一块**（自带 tasks/agents 视图切换 ＋ 刷新 ＋ 关闭） | **不记** | `A2uiPanel.tsx` → `a2uiClient.ts` 的 `requestA2uiSurface`（`POST {baseUrl}/a2a`，每次请求新 `messageId`、无会话 id） |
| ③ | **客户端工具画的界面** | A2A（`/a2a`）取数、内联呈现 | **对话消息里**（工具卡下面） | 记 | 客户端工具 `show_a2ui_surface`（`clientTools.ts:525-600`）→ `requestA2uiSurface` → `A2uiToolSurface` |

⇒ ⇒ ①**已经是那个形状**；**真正重复的是 ②** —— 它是「顶部另一块」、**不记会话**
⇒ ⇒ 用户在同一屏看到「对话」与「另一个界面」⇒ ⇒ **这一刀摘的是它**。

---

## 2. 摘掉 ② **不丢能力**（三条依据，与移动端同构）

1. **面板能给的只有 `tasks`／`agents` 两个视图** —— 端脑的 `a2ui::resolve_view` 认的就是这两个；
2. **端脑在 AG-UI 路里对同样两个视图用同一套 `a2ui::render_view` 产出面**
   ⇒ ⇒ 两边**逐字同形**（父仓 `check-agui-a2ui-wire.mjs` 的 W6 判据钉着）；
3. **关键词兜底同样生效** —— `resolve_view` 的中英文关键词命中 ⇒ 用户在**对话框**里说一句「我的任务」就出面。

⇒ ⇒ 而且 ①**还记会话**（② 不记）⇒ ⇒ 摘掉的是**重复的第二条路**，不是能力。

---

## 3. 这一刀落了什么

### 桌面端（shadow-desktop）

| # | 落点 | 做了什么 |
|---|---|---|
| 1 | `src/components/chat/A2uiPanel.tsx` | **删除**（删除前工作树字节快照存 `.local/a2ui-panel-removed-backup/`，sha256 `7D7BAEABA63D48B6` —— 该文件有兄弟会话未提交的 v1.0 升级，快照不丢任何人的在飞面） |
| 2 | `src/components/chat/__tests__/a2ui.abort.test.tsx` | **删除**（纯面板套件；abort 机制本身有 `src/lib/__tests__/abort.test.ts` 独立覆盖） |
| 3 | `src/pages/ConversationPage.tsx` | 摘面板 import ＋ `showA2ui` 状态 ＋ toggle 行＋按钮 ＋ 条件渲染；**内联承载部分一字不动**（`A2uiOpsSurface` ＋ `onA2uiSurface` ＋ `msg.a2ui_surface` 渲染） |
| 4 | `src/components/chat/__tests__/a2ui.test.tsx` | 删面板 describe 的八条面板挂载用例；**两条「空/非空面可判」改挂共享渲染器保留**（覆盖不丢）＋ 协议层纯文本断言保留；401/不合规字节两条已有客户端/协议级覆盖，不重复 |
| 5 | `src/components/chat/__tests__/a2ui.live.test.tsx` | 删面板挂载那条活体用例（agents 视图与 401 两条是客户端级直调，**保留**——它们测的是客户端工具那条取数腿） |
| 6 | `src/lib/abort.ts` | 头注释摘掉面板那条 bullet（机制保留；模型下载取消 ＋ useEffect cleanup 两条仍在） |
| 7 | `src/i18n/{zh-CN,en-US}.json` | 删两个面板专属死键 `surface.a2ui` ＋ `surface.agents`（`surface.tasks` 留给导航路由；两端词表同步删 ⇒ i18n 完整性闸仍绿） |

### 父仓（闸＋CI＋会话身份闸）

| # | 落点 | 做了什么 |
|---|---|---|
| 8 | `scripts/check-desktop-single-a2ui-carrier.mjs`（**新**） | 八条判据 ＋ 纯函数自检 17/17 ＋ 退出码 2 那一档；与移动端那道同形状 |
| 9 | `.github/workflows/ci.yml`（`desktop-build` job） | 接两步：`run-gate-once --strict` ＋ 自检单独一行（与移动端那道同款） |
| 10 | `scripts/check-a2ui-session-identity.mjs` | **桌面腿退场**（`CLIENTS` 清空 ＋ 退场注释）——两端的独立 A2A 形态都没了 ⇒ 本闸对客户端无可判对象；「内联面不许自己另说会话身份」由两道 single-a2ui-carrier 闸的 M7 接手（纪律换主人，没消失）；自检 9/9 ⇒ 10/10（＋「两腿都退场」一格） |

---

## 4. 新闸的八条判据（可判，不是口号）

**五条负控**（摘掉的东西不许悄悄长回来）：
- **M1** 对话页不许 import/挂载面板（`A2uiPanel`/`showA2ui`/`a2ui-toggle` 零命中）；
- **M2** 面板文件必须不在（`PANEL_FILES`：现名 `A2uiPanel.tsx` ＋ 复活别名 `a2ui_panel.tsx`/`Agent2UIPanel.tsx`）；
- **M3** 面板模式 provider 零命中（桌面从未有过 ⇒ 谁复活面板顺手加 provider ⇒ 当场逮住）；
- **M4** 面板开关按钮那一族全仓零命中（M1 盯页面，这条盯「挪去别的组件复活」）；
- **M8** 面板族标识符（`A2uiPanel`/`A2uiPanelProps`/`Agent2UIPanel`）跨全仓 .ts/.tsx 零命中（换文件名复活也躲不过）。

**三条正控**（唯一合法承载必须完好）：
- **M5** AG-UI 内联三跳（`a2uiActivity.ts` 官方字面量 ＋ `driver.ts` 的 `ACTIVITY_SNAPSHOT` 档 ＋ 对话页画 `A2uiOpsSurface`）；
- **M6** `types.ts` 的 `AGUI_KNOWN_EVENT_TYPES` **块内**认得 `ACTIVITY_SNAPSHOT`（块判定不是裸词 ⇒ 类型别名那行喂不饱它）；
- **M7** 内联面不许自己另说会话身份（继承对话那条）。

**与移动端那道闸的分工**：本闸**单仓可判**（只读桌面端自己）⇒ 能进 CI；`check-agui-a2ui-wire.mjs` 钉端脑侧与 wire 形状、跨仓不进 CI。

---

## 5. 真文件上的真变异（五道，各恰好面板族红 ＋ 还原逐字一致）

| # | 变异 | 闸的判决 |
|---|---|---|
| ❶ | 真 `ConversationPage.tsx` 加回面板 import | **M1 ＋ M8**（都在面板族，其余一条没红） |
| ❷ | 从快照恢复面板文件本体（sha256 `7D7BAEAB…`） | **M2 ＋ M8×2**（全在面板族） |
| ❸ | 真 `types.ts` 已知事件块内删 `ACTIVITY_SNAPSHOT` | **恰好 M6 一条红** |
| ❹ | 真 `a2uiActivity.ts` 官方字面量改名 | **恰好 M5 一条红** |
| ❺ | 真 `A2uiToolSurface.tsx` 塞面板族标识符 | **恰好 M8 一条红** |

⇒ 五次还原后 **sha256 逐字一致**（`8771EB2C…`／`AC7E02D1…`／`67A2288C…`／`E8023649…`）⇒ 闸面回 **8/8**。

---

## 6. 读数

- 新闸 **8/8**（自检 **17/17**）；
- 会话身份闸：主跑 **0 红**、自检 **10/10**（桌面腿退场后「两腿都退场」新增一格）；
- 移动端闸 **8/8**（不回归）＋ wire 闸 **8/8**（`a2uiClient.ts` 保留 ⇒ W7「桌面 /a2a 仍在」继续成立）；
- 桌面 `tsc --noEmit` **0 error** ＋ `eslint`（触及 5 文件）**0**；
- 桌面全量 vitest **1790 过 / 1 红 / 24 跳** —— 那 1 红是**已知存量**（跨端措辞漂移：「端脑这次没有画界面。」vs 移动端 arbiter 期望「大脑…」；台账已有记录，不代修、零命中本刀改动）；
- YAML 闸 **34 文件零违规**（ci.yml 接线后复跑）＋ 台账圈码闸**工作树面零违规**（620 条条目）＋ 状态面闸 **0 违规**；
- 闸治理闸 **4 条违规逐条是存量**（`agui-a2ui-wire` 没接进 CI ＋ `external-tools` 自检坏）⇒ ⇒ **本刀新闸不在违规名单里** ⇒ 闸纪律五项逐条过。

---

## 7. 边界与不做清单

- **客户端工具取数仍走 A2A**（`show_a2ui_surface` → `requestA2uiSurface`）—— 与移动端 `fetchSurfaceEvents` 同一笔债：**端脑给工具结果挂 `a2ui_operations`** 是端脑侧下一刀（两端共用），本刀不碰 ⇒ `a2uiClient.ts` 保留 ⇒ wire 闸 W7 继续成立；
- **端脑侧一行没动**（AG-UI ／ A2A 两张面都是既有的）；
- **不新增客户端工具**、不改端点矩阵、不动 `agent-surface.json`（面板不是工具，摘它不涉工具面）。

## 8. 仍然欠着的

- **真桌面那一格未验**（本刀证据是测试级＋闸级 ⇒ 不许说「桌面真机已验证」）；
- **活体 DOM 证据随面板退场**：原「面板把活的字节画成 DOM」那条 live 用例删了 ⇒ 内联承载的活体画格证据欠着（`a2ui.inline.test.tsx` 用的是录制字节）；
- 客户端工具取数归位（端脑侧下一刀，两端共用）。
