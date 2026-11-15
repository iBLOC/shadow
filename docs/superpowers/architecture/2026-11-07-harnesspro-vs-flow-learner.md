# HarnessPro 与 flow::learner：workflow 自学习的差距分析

> 2026-11-07 · iBLOC/shadow · 「同为 trace 驱动的自学习：本项目的 flow::learner 停在『从成功里泛化＋人工 promote』，HarnessPro 是『失败/浪费定向修＋行为判据自动筛选』」

## 0. 读数来源

| 面 | 来源 | 读数时间 |
|---|---|---|
| 论文 | [arXiv 2610.26770 (v2)](https://arxiv.org/abs/2610.26770) 摘要页实测抓取；代码 [pzs19/HarnessPro](https://github.com/pzs19/HarnessPro) | 2026-11-06 |
| 本项目 | telencephalon flow 子系统源码静态读数（learner / tracer / api / registry / Cargo.toml，锚点见 §2） | 2026-11-07 |
| 度量哲学 | 本仓 `benchmark/docs/benchmark-positioning.md`（同模型跨被测物 delta ＝ harness 工程产出） | 2026-10-15 定位 |

⚠️ 论文正文（重复次数／消融／路由器评测）未读；learner 部分配置字段的运行时执行未核——局限声明见 §7。

## 1. HarnessPro 一页摘要

**定位**：把 harness 工程（提示词／工具额度／上下文／钩子／验证规则）从手工调优变成**双目标（通过率 × 执行费用）自动化搜索**；基础模型冻结，被进化的是执行层。谱系：Meta-Harness（外部搜索模型）→ AHE（组件可观察/可修改/可回滚）→ HarnessPro（费用进目标函数）。与 Agent REINFORCE 分工：那条选「谁上场」（模型组合），本篇改「怎么上场」（执行规则）。

**方法五件套**：

1. **轨迹分析器**：从重复运行定位失败点与浪费点（多余工具调用、重复日志、冗长输出）——费用能被优化的前提是先看见浪费；
2. **规划器三档提议**：同一缺陷按成本/均衡/性能三种优先级各出一版——帕累托思想放进「提议端」而不只是「筛选端」；
3. **编辑器独立工作区**：修改隔离实现，父子版本共同评估，改坏不污染主线；
4. **无标签评估**：合成测试 Agent 依据任务说明＋初始轨迹生成固定测试，全程不碰官方答案——进化循环能大规模转的前提，也是全系统最脆的一环；
5. **两级筛选**：先砍「验证通过率低于初始 harness」的候选（基线地板），再按 normalized weighted squared-distance 选出 **lite / medium / heavy** 三个版本（策略族而非单点）；入选版本进入下一轮（递归闭环）。

**读数口径**：Terminal-Bench 2 / SWE-Bench Pro / ProgramBench；GPT-5.5+Codex 与 GLM-5.2+Claude Code。heavy 模式对 RHO 平均 **+2.0pt 通过率、−26.1% 单任务费用**（GPT 组）；分项：终端任务 heavy 80.8% vs 76.3%（费用 −33.9%）；SWE-Bench Pro medium 79% vs 80% 但费用 $2.68→$1.26（−53%）。⚠️ 所有单任务费用**不含离线进化开销**（轨迹收集/改码/评估候选），摊销取决于调用量。

**已知风险**：① 合成测试是软肋且系统性放大（筛选发生在合成测试上，漏掉的要求会被进化「优化掉」）；② 元过拟合（三基准两模型组合，换分布要重进化）；③ 评测方差未在摘要层覆盖（+2pt 级差异是否显著取决于重复次数）；④ 任务→版本的路由器本身是新失败模式。

## 2. 当前项目的 workflow 自学习：flow::learner 链路

flow 子系统＝Coze-Studio 式 DAG 工作流运行时（schema → compiler → adapter → executor，tracer 观测打分，learner 蒸馏草稿），**在默认 feature 里**（`telencephalon/Cargo.toml:254`，default 特征表含 flow）⇒ 产品构建默认带。工作区另有 workflow-schema / workflow-runtime / workflow-engine / workflow-trace / feedback-loop / decision-stub / behavior-stub 等 crate。

**链路七环**（全部静态核实）：

1. **执行**：executor 跑 flow，事件走 observer channel；
2. **观测打分**：tracer 逐节点记 success / latency / output，质量分＝`score_from(success, latency_ms, 60_000)`（成功＋时延，60s 预算；**无 token 成本维度**）；trace 落 FlowBlob，同时投影 ThoughtGraph / ReAct 给 UI；
3. **聚合**：LearnerDaemon 周期 tick，`fetch_grouped_recent` 按 intent 聚合近窗 trace，门槛＝`min_avg_quality` / `window_hours` / `min_similar_traces`——**只喂高质量 trace（success-only mining）**；
4. **去重**：与已有草稿按 `source_trace_ids` 重叠判「已覆盖」，覆盖则跳过；
5. **蒸馏**：`build_summary_prompt` 渲染 trace → POST 端脑自家的 `/v1/chat/completions`（admin key）→ 模型产出草稿 flow；
6. **校验＋落库**：`try_parse` + `try_validate` **结构校验**（不合法直接跳过）→ 存 DraftFlow（provenance：source_trace_ids / avg_quality / derived_at / mixed_sources）→ 同时 best-effort 发布海马体 `/api/mental-models`（「思维定式」，跨 agent 复用面）；
7. **人工 promote/reject**：`telencephalon/src/flow/api/mod.rs:48` 的 `/api/flows/draft/{id}/promote`（`api/drafts.rs:21`）——promote 后才是 active flow。

人工编排侧另有桌面端 Workflow Studio v1（`shadow-desktop/src/pages/WorkflowStudioPage.tsx`，source→transform→agent→sink 四类节点＋自研画布），与 learner 互补：一个手工产 flow，一个从 trace 产草稿。

## 3. 差距对照表（7 维度）

| 维度 | flow::learner | HarnessPro | 差距性质 |
|---|---|---|---|
| 学习对象 | flow 定义（DAG 编排、参数） | harness（提示词/工具额度/钩子/验证规则） | **层级不同**，互补而非替代 |
| 反馈方向 | 只喂高质量 trace（success-only mining） | 失败与浪费都是一等信号 | **最大差距**，见 §4① |
| 接受判据 | schema 校验＋人工 promote | 行为级：真执行＋通过率地板＋帕累托 | 见 §4② |
| 目标函数 | quality ＝ 成功＋时延 | 通过率 × 执行费用（提议端＋筛选端都吃费用） | 见 §4③ |
| 产物形态 | 单草稿、单点 promote | lite/medium/heavy 版本族＋按任务路由 | 部署形态差一代 |
| 递归性 | 周期批处理，不改学习者自己 | 选中版本进入下一轮，迭代复合 | 质变 vs 量变 |
| 自动化 | 人工终审（保守、可审计） | 全自动（判据代人工） | 信任面设计不同 |

## 4. 三个要害差距展开

**① 反馈方向是单向的「成功挖掘」。** 聚合入口带 `min_avg_quality` 过滤——失败 trace 只被记成行，从不被消费；FlowError 落库后就到头了。HarnessPro 的整条循环恰恰建立在「失败归因 → 定向修复 → 重跑验证」上。用本仓的教训语言：learner 现在只会**从绿里学**，不会**从红里修**。

**② 接受判据停在结构层。** 草稿的 `try_validate` 是 schema 合法性检查——**结构合法 ≠ 行为更好**。这正是本仓反复踩过的「闸判结构不判运行时」「schema 绿 ≠ 行为绿」那一格：learner 的 validate 闸恰好停在这里，后面全靠人工 promote 兜底。人工门安全但不可扩展，且**不构成选择压力**——没有任何机制比较「新草稿 vs 现役 flow」的通过率与费用。

**③ 费用目标完全缺席。** tracer 质量分只有成功＋时延；HarnessPro 把费用同时放进提议端（轨迹分析器专门定位浪费）与筛选端（支配比较含费用项）。当前 learner 即便产出「行为一样好」的草稿，也没有任何机制知道它是不是更贵。

## 5. 项目已有而 HarnessPro 没有的（公平对比）

- **海马体思维定式发布**：草稿跨 agent 复用面——HarnessPro 的产物只服务同一 harness 栈；
- **trace 投影 UI**（ThoughtGraph / ReAct）：可观测性更产品化；
- **人工审计面**＋本仓的门/钥匙纪律：比全自动接受更可控、可审计；
- **度量哲学已就位**：benchmark 定位文档已写明「同模型跨被测物 delta ＝ harness 工程产出」——**测量面已有，缺的只是把测量升级成进化选择压力**。

## 6. 可搬清单（按最小刀排序）

1. **tracer 记费用**：FlowTraceRow 加 token/cost 字段，quality 旁立独立 avg_cost——最小刀，是后面一切费用判据的地基；
2. **learner 加失败组消费**：低质量 trace 组也聚合蒸馏，provenance 区分 `pattern` / `repair` 两类——把「从红里修」补上；
3. **promote 前行为 A/B**：草稿 vs 现役 flow 在回放 trace 的固定子集（或 benchmark 套件）上各跑一遍，「通过率不降＋费用不升」才允许 promote——人工门从唯一门降级为**行为判据之上的终审**；
4. **长期**：「基线地板＋支配筛选」搬进 promote API 做自动预筛，再考虑版本族＋按任务路由。

## 7. 局限声明

- 本文 learner 侧全部为**源码静态读数**（tick 逻辑、评分调用、promote 链路逐字核实）；`max_drafts_per_day` / `max_retries_on_invalid_json` 等配置字段的运行时执行情况、`crates/feedback-loop` 实现未深读，相关结论以「结构存在、运行时未核」为准；
- 论文侧基于摘要页＋二手 10 条摘要级信息，正文未读：方差与路由两条风险属方法论推断，置信度以正文核读为准；
- telencephalon 为独立仓，本文不改动该仓任何文件；可搬清单落地时另开工作刀。
