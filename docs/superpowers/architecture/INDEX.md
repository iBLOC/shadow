# 架构文档索引 —— 每一份的**现状状态**

> ⚠️ **这个目录里 28 份文档，只有 5 份还能当「现状」读。**
> 其余 23 份是**带日期的设计稿 / 审计 / 实测快照** —— 它们记录的是**当时**的决策与现场，
> 不是今天的代码。README 曾经把整个目录标成「现行架构文档」⇒ ⇒ 那会把人引向已被推翻的
> 结论（最典型：桌面端那个 `:8085` 端口早就不存在了，neuron 2026-11-03 起是 router-only）。
>
> **现状的唯一事实源**：[`AGENTS.md`](../../../AGENTS.md)（决策与坑）＋
> [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)（链路 / 端口 / 协议）。
>
> 状态判定时刻：**2026-11-15**（逐份对着代码核过一遍）。
> 图例：✅ 还能当现状读 · 🟡 结论可用、现状段已过期 · 🔵 冻结的历史快照

## ✅ 还能当现状读（5 份）

| 文档 | 主题 | 备注 |
|---|---|---|
| [`2026-10-29-shadow-logo.md`](2026-10-29-shadow-logo.md) | logo 几何与命名 | 与 `brand/geom.mjs` 逐字一致 |
| [`2026-10-29-shadow-visual-language.md`](2026-10-29-shadow-visual-language.md) | 视觉语言：中性阶与主题色派生 | 槽位值与 `design-tokens.json` 一致 |
| [`2026-11-05-preference-revocation.md`](2026-11-05-preference-revocation.md) | 偏好撤销通道 | 闸、判据、台账都在位 |
| [`2026-11-05-state-surface-governance.md`](2026-11-05-state-surface-governance.md) | 状态面治理 | 同上（只有「30 道闸」那个计数过期） |
| [`2026-11-07-harnesspro-vs-flow-learner.md`](2026-11-07-harnesspro-vs-flow-learner.md) | flow 子系统 / learner 对照 | 逐行可复核，几乎没漂 |

## 🟡 结论可用，但「现状」段已过期（16 份）

| 文档 | 还能用的部分 | **别照着做的部分**（已被代码推翻） |
|---|---|---|
| [`2026-10-29-brain-chain.md`](2026-10-29-brain-chain.md) | 链路改造的过程与取舍 | ❌ 桌面端 `hippocampus` feature「关掉」（**开着**）· ❌ 叶区指向 `:8085`（router-only ⇒ 没有独立口）· ❌ `cortex_http.rs`（已改名 `telencephalon_http.rs`）· ❌ `neuron 面 :40315`（今天没有这个口）· ⚠️ 守门员「6 条规则」（今天 9 条） |
| [`2026-10-31-agent-surface-endpoint-lock-matrix.md`](2026-10-31-agent-surface-endpoint-lock-matrix.md) | 门型表的设计与当时的探测方法 | ❌ **判定表已过期**：源码解析出 148 条路由，表里未覆盖 7 条（`/models/capability-overrides`、`/audio/speech`、`/audio/transcriptions`、`/api/telencephalon/images/generations`、`/api/telencephalon/lobes/routing`…）；表里另有 9 条源码已删（`/api/telencephalon/devices*` 等）· ❌ `CorsLayer::permissive()`（已改白名单）· ❌ `dev-admin-key` 后门（已删）· ❌ 独立服务器绑 `0.0.0.0`（已改回环 + `--bind`）· ⚠️ 它配的闸 `check-endpoint-matrix.mjs` **今天就是红的，且没接进 CI** |
| [`2026-10-31-agent-surface-probe-baseline.md`](2026-10-31-agent-surface-probe-baseline.md) | 探测方法 | ❌ 13 条「不拿凭据就能进」的清单里 `/api/telencephalon/devices` 端点**已删** · ❌ `CorsLayer::permissive()`（已改白名单）· ❌ api_key 明文序列化（已掩码）· ⚠️ 探针读上面那张表 ⇒ **表过期它就过期** |
| [`2026-10-29-shadow-persona-and-appearance.md`](2026-10-29-shadow-persona-and-appearance.md) | §0 的三条产品决定 | ❌ §1「现状测绘」是**改造前**的桌面端（`streamMessageNeuron` / `newLocalConversation` 已删）· ❌ `Embedded::boot()` 只起 `:8085`（router-only）· ❌ `call_llm` 请求体「没有 tools 字段」（已加） |
| [`2026-10-29-conversation-first-ia-audit.md`](2026-10-29-conversation-first-ia-audit.md) | IA 审计结论 | ❌ 落地页 `/` → `TaskBoardPage`（今天已是 `/conversation`）· ⚠️ 批次 1–3 已落地、4–6 未做（计数也要重采） |
| [`2026-10-29-cross-platform-design-system.md`](2026-10-29-cross-platform-design-system.md) | L1/L2/L3 共享物与端点 | ❌ §1「现状 ✗」那三列已被整改脚本取代（导航/token 现在是生成物） |
| [`2026-10-29-ui-ux-code-review.md`](2026-10-29-ui-ux-code-review.md) | 结构性问题清单 | ⚠️ 代码级证据的行号与「现状」都漂了（体积、目录结构都变了） |
| [`2026-10-31-multi-end-a2ui-usability.md`](2026-10-31-multi-end-a2ui-usability.md) | §6 的 A2UI 产出面（已落地） | ❌ 桌面默认 `bind.http = 0.0.0.0:60080`（已改回环）· ❌ `/a2a` 没有门（已挂 `require_shadow_key`）· ⚠️ 移动端还有几处写死 `60080` |
| [`2026-10-31-three-surface-alignment-audit.md`](2026-10-31-three-surface-alignment-audit.md) | 三端审计结论 | ❌ 桌面端 neuron 走 `VITE_NEURON_URL` / `localhost:8085`（`neuronUrl()` 2026-11-02 已删）· ⚠️ 端点与计数要重采 |
| [`2026-11-01-a2ui-failure-truth-on-device.md`](2026-11-01-a2ui-failure-truth-on-device.md) | 真机验证记录 | ❌ §三「那份修复还没入库」（已入库：`mobile-memory` profile 已在） |
| [`2026-11-02-brain-secret-store-keyring.md`](2026-11-02-brain-secret-store-keyring.md) | 方案与分期 | ⚠️ 行号全部漂了；头部「评估（未落地）」已被 §6/§7.5 推翻 |
| [`2026-11-02-tool-interception-seam.md`](2026-11-02-tool-interception-seam.md) | seam 的设计（P0/P1-a 已落地） | ❌ `api/device.rs` 与 `mcp/device_router.rs` **已删**（设备工具那一族端点今天不存在）· ❌ 头部「未落地」与 §9/§10 自相矛盾 · ⚠️ 门型表规模已变（210 行 ≈100 条规则） |
| [`2026-09-23-shadow-client-capabilities.md`](2026-09-23-shadow-client-capabilities.md) | 能力面清单 | ❌ §4「将来用 `SimpleMcpServer` 包成 MCP 工具」**至今未实现**（端脑 MCP 面只有管理路由） |
| [`2026-09-23-document-use-feishu-univer.md`](2026-09-23-document-use-feishu-univer.md) | 能力面（已实现） | ⚠️ 头部「Recommended for v1 · 待落地」过期（已落地） |
| [`2026-11-05-gate-discipline.md`](2026-11-05-gate-discipline.md) | 五条纪律与机制 | ❌ 全部计数读数过期（35 → **62** 道闸；15 → **26** 道接进 ci.yml）· ⚠️ 它点名的「端点矩阵过期、闸红了却没人跑」**至今没闭环** |
| [`2026-11-05-yaml-validity.md`](2026-11-05-yaml-validity.md) | 判据 Y1..Y13 与闸 | ❌ 覆盖面读数过期（本仓 3 → **32** 个 workflow）· ❌ CI job 名（`cortex-residue-stack` → `legacy-residue-stack`） |

## 🔵 冻结的历史快照（7 份 —— 描述的是**当时**的决策，不是现状）

| 文档 | 为什么过时 |
|---|---|
| [`2026-09-25-e2e-coverage-assessment.md`](2026-09-25-e2e-coverage-assessment.md) | ❌ 整节「Shadow→neuron `:8085`」—— **那条路今天不存在**（router-only）· ❌ `CORTEX_BIN` 指向的 `cortex/` 目录已不存在 |
| [`2026-09-23-four-lobe-repo-split.md`](2026-09-23-four-lobe-repo-split.md) | ❌ 拟建 `-lobe` 后缀仓（实际是裸名仓）· ❌ 前额叶端口 8082（今天 18083）· ❌ 「顶叶仓不存在」（已存在，且工作流栈已并入 telencephalon workspace） |
| [`2026-09-23-iBLOC-progress-assessment.md`](2026-09-23-iBLOC-progress-assessment.md) | ❌ 自述的 session 快照：`iBLOC/encephalon` 当时还叫 `iBLOC/cortex`、两个仓还没彻底分离 |
| [`2026-09-23-shadow-desktop-uiux-audit.md`](2026-09-23-shadow-desktop-uiux-audit.md) | ❌ 审计里的缺失项几乎全补了；SSE 事件枚举名也变了 |
| [`2026-09-23-qiankun-evaluation.md`](2026-09-23-qiankun-evaluation.md) | ⚠️ **结论仍成立**（v1 不采用 qiankun），但整份是冻结的评估快照 |
| [`2026-09-25-doc-sync-changelog.md`](2026-09-25-doc-sync-changelog.md) | ❌ 一次性文档同步清单（`cerebellum/` 已退役，工作流栈迁进 telencephalon workspace） |
| [`2026-09-25-shadow-desktop-test-bugfix.md`](2026-09-25-shadow-desktop-test-bugfix.md) | ❌ 一次性读数型报告（测试规模、`prefrontalUrl` 端口都变了） |

## 其它三份「历史设计记录」目录

[`docs/superpowers/specs/`](../specs/) · [`plans/`](../plans/) · [`scenarios/`](../scenarios/) —— 44 份
（2026-03 ～ 2026-09），按日期存档，描述的是**当时**的决策。
