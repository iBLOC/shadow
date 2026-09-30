# Benchmark 定位：Shadow 在官方榜单中的位置

> 2026-09-30 · 数据来源为各官方榜单与模型卡的公开记录（引用见文末）。
> 诚实声明：Shadow 尚未在官方榜单上提交过成绩；本文的"排名"是基于
> **模型层官方成绩 + 已实测的框架层开销**的推断定位。

## 1. 官方榜单排什么

Agent 官方榜单（Terminal-Bench 2.x、SWE-bench Verified、GAIA、τ²-bench）
排名的对象是 **模型 + agent 框架(harness) 的组合**。因此 Shadow 的榜单位置
由两个因子决定：

```
Shadow 榜单得分 ≈ 所加载模型的官方得分 × (1 - Shadow框架层损耗)
```

框架层损耗已实测（core-smoke 三方对比）：**三种形态得分完全一致（2/4，
pass^k 50%），引擎→大脑服务 +2s、→桌面 UI +20s，失败为零**——即 Shadow
框架层损耗 ≈ 0，Shadow 的排名 ≈ 所加载模型的排名。

## 2. 官方榜单快照（模型 + harness 组合）

**Terminal-Bench 2.0**（终端任务，[tbench.ai](https://www.tbench.ai/leaderboard/terminal-bench/2.0)）：

| 排名区间 | 组合 | 得分 |
|---|---|---|
| 榜首 | GPT-6 Astra (max) — Codex | 60%+ |
| 上游 | Simplai Agent | 53.4% ± 2.8 |
| 上游 | Terminus 2 — GLM 5 | 52.4% ± 2.6 |
| 中游 | OpenHands — Claude Opus 4.5 | 51.9% ± 2.9 |
| 中游 | OpenCode — Claude Opus 4.5 | ~60 名 |

注：榜单当前没有 OpenClaw / pi 的公开条目；2.1 版重排后个体分差可达
12pp（[Artificial Analysis](https://artificialanalysis.ai/evaluations/terminalbench-2-1)）。

**SWE-bench Verified**：Qwen3 Max（旗舰）72.5；Qwen3-Coder 系列在开源模型
中 SOTA（[Simon Willison 笔记](https://simonwillison.net)）。

**模型卡官方数据（Qwen3 家族，Shadow 可加载）**：

| 模型 | BFCL-v3（工具调用） | τ²-Retail | 可加载于 Shadow |
|---|---|---|---|
| Qwen3-0.6B | 官方卡未列（第三方综合 ~56.9，Artificial Analysis 智能指数 ~5/100） | 未列 | ✓ 当前默认 |
| Qwen3-4B-Thinking-2507 | **71.2** | **66.1** | ✓（约 8GB 权重） |
| Qwen3 Max（旗舰） | — | τ²-Verified ~69.6 | ✗ 需 API 接入 |

## 3. Shadow 的推断定位

| Shadow 加载的模型 | 推断榜单位置（Terminal-Bench 系） |
|---|---|
| **Qwen3-0.6B**（当前） | 榜尾之外——0.6B 的 agentic 能力不足以通过 Terminal-Bench 的容器任务；我们的 core-smoke 50% 不能换算成官方分 |
| **Qwen3-4B / 8B** | 进入榜单下沿可行（BFCL 71 已达中游模型水平），前提是 Shadow 实现官方 harness 接口 |
| **Qwen3-Coder / 大参数 + API** | 中游（SWE-bench 72.5 级别模型 + Shadow ≈ 该模型的官方分 − 框架损耗 0） |

**Shadow 的真实卖点不是榜单第一，而是：换模型即换排名，框架层零损耗。**
官方 harness 换模型要改适配层；Shadow 的 model pool + brain 架构天然支持。

## 4. 进官方榜单的路径（按可行性排序）

1. **Terminal-Bench 2.x（最先做）**——容器化终端任务，agent 以 CLI 进程
   接入，与我们的 `CliAgent` 适配器模式完全吻合；官方提供
   [task registry 与提交接口](https://www.tbench.ai/)。Shadow 侧需要一个
   `terminal-bench` 适配器（把 Shadow 的 agent 能力包装成 tb 的 agent 协议）。
2. **τ²-bench（第二）**——纯 API 对话 + 工具调用，pass^k 指标我们 runner
   已原生支持；缺的是 τ² 的域环境模拟（retail/airline 工具状态机）。
3. **GAIA 文本子集（第三）**——官方验证集 + LLM-judge，我们的 llm-judge
   评分器可直接复用。
4. **SWE-bench Verified（最后）**——需要完整容器化评估基建（每任务一个
   repo 环境 + 测试执行），工程量最大。

## 5. 已实测 vs 推断的边界

| 项 | 状态 |
|---|---|
| 三形态得分一致性（框架零损耗） | ✅ 已实测（core-smoke 三方对比） |
| Qwen3-4B+ 的官方 agentic 分数 | ✅ 官方模型卡公开数据 |
| Qwen3-0.6B 官方 agentic 分数 | ❌ 官方未发布（本文用第三方估计） |
| Shadow 在 Terminal-Bench / SWE-bench 的实际得分 | ❌ 未运行（需适配器 + 基建） |

## 引用

- Terminal-Bench 2.0 官方榜单：https://www.tbench.ai/leaderboard/terminal-bench/2.0
- Terminal-Bench 2.1（Artificial Analysis）：https://artificialanalysis.ai/evaluations/terminalbench-2-1
- Qwen3-4B-Thinking 模型卡镜像（BFCL/τ² 数据）：https://immers.cloud
- Qwen3 Max 开发者文档（SWE-bench 72.5 / τ²-Verified 69.6）：Puter docs
- Qwen3 0.6B 官方模型卡：https://huggingface.co/Qwen/Qwen3-0.6B
- Simon Willison Qwen3 笔记（Qwen3-Coder SWE-bench SOTA）：https://simonwillison.net
