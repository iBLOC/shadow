# Shadow Benchmark

Shadow 平台的 agent benchmark 框架——在**同一套任务套件**上评估并对比
Shadow 的三种形态与外部开源 agent。

## 三种 Shadow 形态（可同台对比）

| 形态 | 接入方式 | 测的是什么 |
|---|---|---|
| **shadow-neuron** | OpenAI 兼容 :8085（shadow-desktop 内嵌 neuron） | 裸推理引擎基线 |
| **iBLOC-encephalon-server** | OpenAI 兼容 :8082（大脑独立二进制） | 大脑服务全栈（间脑+端脑+海马体+neuron + A2A 面） |
| **shadow-desktop** | wdio WebDriver 驱动真实 UI | 完整产品链路（守卫/桥/流式渲染/存储）——兼作功能测试 |
| 外部 agent（openclaw / pi / dsh / aider） | CLI argv 驱动 `{prompt}` | 开源生态对比；未安装自动报告 skip |

外部 agent 未安装时报告为 **skip**（不是 fail）——部分对比依然有效。

## 最新实测结果（core-smoke 4 任务 × 1 轮，qwen3-0.6B）

| agent | 通过 | pass^k | 中位延迟 |
|---|---|---|---|
| shadow-neuron | 2/4 | 50% | 159s |
| iBLOC-encephalon-server | 2/4 | 50% | 161s |
| shadow-desktop | 2/4 | 50% | 180s |

**关键结论：三个 Shadow 形态得分完全一致**——应用全栈与大脑服务在裸引擎
之上**零额外失败**，架构分层无回归。完整报告见
[docs/reports/three-way-example.md](docs/reports/three-way-example.md)。

失败项均为 0.6B 模型能力短板（算术答案带算式前缀、code-fix 整文件
回复超时）——正是 benchmark 要诚实暴露的。

## 行业基准的对应关系

SWE-bench、Terminal-Bench、GAIA、τ-bench、OSWorld 共享同一骨架：
**任务 → agent 适配器 → 环境 → 评分器 → 报告**。本框架在本地实现该
骨架，使平台既能回归测试自家 agent，也能在相同基准上对比开源生态。

## 运行

```bash
cd benchmark
cp agents.example.toml agents.toml     # 调整端点/命令
cargo run -- run \
  --suite suites/core-smoke.json \
  --agents agents.toml \
  [--only shadow-desktop,iBLOC-encephalon-server] \
  [--tasks format-following,json-output] \
  [--repeat 3] [--out reports]
```

报告输出 `reports/<suite>-report.{json,md}`；历史报告存
[docs/reports/](docs/reports/)。

## 架构

```
src/task.rs            Task + ScorerSpec（exact-match / contains / unit-tests / llm-judge）
src/suite.rs           Suite 加载与校验（JSON）
src/agent.rs           适配器：OpenAI 兼容端点、CLI（{prompt}/{workdir}）+ 围栏补丁应用
src/desktop_agent.rs   shadow-desktop 全栈功能测试适配器（WebDriver 驱动真实 UI）
src/scorer.rs          评分（归一化 / 单测执行 / 宽松 LLM-judge JSON）
src/runner.rs          Runner：超时、重复、pass^k、JSON+Markdown 报告
src/bin/bench.rs       CLI 入口
suites/                任务套件（core-smoke：推理/抽取/格式遵循/SQL/代码修复）
```

### 参赛目标

| agent | adapter | 说明 |
|---|---|---|
| iBLOC-encephalon-server | openai | 大脑独立二进制（:8082，间脑+端脑+海马体+单 neuron + A2A 面） |
| shadow-neuron | openai | shadow-desktop 内嵌引擎（:8085/v1）或独立 neuron_server |
| shadow-desktop | shadow-desktop | wdio WebDriver 驱动真实 UI——兼作功能测试 |
| deepseek-api | openai | DeepSeek API，纯模型对比 |
| openclaw / pi / deepseek-harness | cli | 开源 agent CLI（未安装自动 skip） |

## Metrics

- **pass-rate** — 至少一轮通过的任务占比
- **pass^k** — 全部 k 轮都通过的任务占比（τ-bench 可靠性指标）
- **median duration** — 每 (任务, agent) 的墙钟中位数

## License

Apache-2.0
