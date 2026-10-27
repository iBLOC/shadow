# Shadow Benchmark

Shadow 平台的 agent benchmark——**同一套原生 harness** 测三类对象：
跨模型对照（API 直连）、跨被测物对照（shadow-desktop / 大脑独立栈）、
以及行业套件切片（τ² / SWE-bench Verified / GAIA / Terminal-Bench 2.x）。

> 定位声明：项目测的是 **shadow-desktop / 大脑两个被测物自身的能力**，
> 基础模型只是被测物内部的权重资源；同模型跨被测物的 delta 才是
> harness 工程的真产出。详见
> [docs/benchmark-positioning.md](docs/benchmark-positioning.md)。

## 总成绩单（2026-10-27 收口）

### 跨模型矩阵（deepseek-chat vs MiMo flash，同一原生 harness）

| 套件 | deepseek-chat | MiMo flash | 备注 |
|---|---|---|---|
| τ² airline (5) | 3/5（r3 pass@1 40%） | **4/5** | MiMo 需 ≥900s 超时 |
| SWE-bench Verified (5) | 4/5 @50步 | **5/5** | 新 harness 首个全绿切片 |
| GAIA 文本 (10) | **4/10** | 3/10 | 原生工具口径（历史 7/10 含一次性钩子） |
| Terminal-Bench 2.x (4) | 1/4 | **2/4** | MiMo 过了 batching-scheduler |

分化模式：MiMo 强在长程工具循环，deepseek 强在事实检索 + 格式纪律；
四套件各拿两条强项，无全能选手。所有分数都**不可与官方榜单直接比较**
（小切片、单轮、非官方 harness）——它们是能力探针与回归基线。

### 跨被测物（同套件三方对照）

| 套件 | shadow-desktop（嵌入 0.6B 完整产品栈） | 大脑独立栈（gateway→真 lobe） | API 直连 |
|---|---|---|---|
| core-smoke (10) | **6/10** @600s | — | deepseek one-shot 9/10 |
| behavior-smoke (5) | **0/5**（读得出数值，无动作面） | **5/5** | 0/5（对照组预期） |

behavior-smoke 的 delta 就是产品边界：**"鱼缸低于 20 度通知我"在
desktop 对话路径现在通不了**——notify/alert 动作面住在大脑栈。要通，
需 desktop 接 Resonance 派发或给 conversation 挂行为动作面。

## 套件与 CLI

| 套件 | CLI | 依赖 |
|---|---|---|
| core-smoke / behavior-smoke / rule-engine-smoke / long-context-smoke | `bench run` | 无（纯本地） |
| τ²-bench | `bench tau2` / `bench tau2-import` / `bench tau2 --verify` | 钉住的 τ² checkout（`.tau2/`） |
| SWE-bench Verified | `bench swe` / `bench swe-import` | `tools/swe_driver.py` 准备 repo+venv |
| GAIA 文本 | `bench gaia-import` + `bench run` | 冻结的 suite JSON |
| Terminal-Bench 2.x | `bench tb-import` + `bench run` | 冻结的 suite JSON |

每个套件的入库门槛：**oracle（gold）全绿**——环境坏了必须先红。
各套件的详细实测记录、失败归因与"不可比声明"见
[docs/industry-suites.md](docs/industry-suites.md)；
Terminal-Bench 见 [docs/tb-import.md](docs/tb-import.md)。

## 运行

```bash
cd benchmark
cp .env.example .env            # 设置 API key（gitignored）
set -a && source .env && set +a
cargo run --bin bench -- run \
  --suite suites/core-smoke.json \
  --agents agents-tb.toml \
  [--only deepseek-chat,mimo-flash] [--repeat 3] [--out reports]
```

- `agents.example.toml` 是配置模板（`agents-tb.toml` 是实际在用的，
  gitignored——含 `task_timeout_secs` 每被测物超时、`[agent.mode]`
  agentic 工具循环等）。
- 报告输出 `reports/<suite>-report.{json,md}`（gitignored），含
  answer / usage / tool_calls / steps 可审计字段。

## 参赛对象

| adapter | 接入 | 说明 |
|---|---|---|
| `openai` | OpenAI 兼容端点 | one-shot 或 `[agent.mode] kind="agentic"` 工具循环（bash/read/write/edit/list/web_fetch/finish，路径越界拒绝） |
| `shadow-desktop` | wdio WebDriver :4445 | 真实 Tauri 应用全栈——兼作功能测试；需 `pnpm tauri dev` |
| `brain` | A2A :8082 | 大脑独立栈（gateway → 真 lobe） |
| `cli` | argv `{prompt}/{workdir}` | 开源 agent CLI；未安装自动 skip |
| `rule-engine` | 进程内 zen-engine | 确定性对照（diencephalon 同一后端） |

## 架构

```
src/task.rs            Task + ScorerSpec（exact-match/contains/unit-tests/llm-judge/gaia-match）
src/suite.rs           Suite 加载与校验
src/agent.rs           OpenAI 适配器 + AgentMode（OneShot/Agentic）+ TokenUsage
src/tools.rs           agentic 工具面（bash 300s 上限 / 路径沙箱 / web_fetch SSRF 防护）
src/desktop_agent.rs   shadow-desktop 全栈适配器（WebDriver）
src/brain_agent.rs     大脑 A2A 适配器
src/tau2.rs            τ² 适配器（驱动上游 harness，answer/tool_calls/usage/steps 进报告）
src/swe*.rs            SWE 适配器 + Rust 原生评估器（swe_parity 与 Python 驱动逐字段一致）
src/gaia_import.rs     GAIA 导入（官方 question_scorer 语义移植）
src/tb_import.rs       Terminal-Bench 导入（hidden_files = verify 时挂载语义）
src/runner.rs          Runner：超时（task > agent > 默认）、pass^k、会话检查点、报告
suites/                冻结的官方任务套件
docs/                  industry-suites / benchmark-positioning / tb-import / integration-notes
```

## Metrics

- **pass-rate / pass@1** — 至少一轮通过的任务占比（5 题切片建议 repeat≥3）
- **pass^k** — 全部 k 轮都通过的任务占比（τ-bench 可靠性指标）
- **median duration / tokens / tool_calls** — 成本面，报告 JSON 逐 run 记录

## License

Apache-2.0
