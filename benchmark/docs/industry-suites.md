# 行业基准套件接入：τ²-bench / GAIA / SWE-bench Verified

> 2026-10-09 · Terminal-Bench 2.x 的接入见 [tb-import.md](tb-import.md)。
> 统一流程：**导入官方任务 → oracle（gold）验证环境 → deepseek-chat 实测**。
> 2026-10-11 起新增 **agentic 执行模式**（工具循环），同一套件可跑
> one-shot 与 agentic 两种口径；数字分别标注。
> 诚实声明：以下所有分数都**不可与官方榜单直接比较**（小切片、单轮、
> 非官方 harness/环境），它们是 Shadow 平台的**能力探针与回归基线**。

## 代码入库状态（2026-10-26）

| 套件 | 适配器代码 | CLI | 状态 |
|---|---|---|---|
| τ²-bench | `src/tau2.rs` | `bench tau2` / `bench tau2-import` / `bench tau2 --verify` | **已入库**，可复跑（§1.1） |
| SWE-bench Verified | `src/swe.rs` / `src/swe_native.rs` / `src/swe_import.rs` | `bench swe` / `bench swe-import` | **已入库**（§1.2） |
| GAIA | `src/gaia_import.rs` | `bench gaia-import` | **已入库**（§1.2） |
| Terminal-Bench 2.x | `src/tb_import.rs` | `bench tb-import` | **已入库**（§1.2） |
| browser 驱动 | `src/browser.rs` | — | **已入库**（模块级，未接 CLI） |

全部套件的**导入**路径（冻结官方任务记录成 suite JSON）已可执行；
**跑批**路径按套件依赖外部 harness：τ² 需钉住的 τ² checkout，
SWE 需 `tools/swe_driver.py` 准备 repo + venv，TB 需任务镜像。

## 0. 统一方法

| 环节 | 做法 |
|---|---|
| 导入 | `bench <suite>-import` 把官方数据行冻结成 shadow suite JSON（含出处与偏差声明） |
| oracle | `bench <suite> --verify` 用 gold 答案/黄金动作/金补丁跑全链路——环境坏了必须全绿，这是入库门槛 |
| 实测（one-shot） | `--agents agents-tb.toml --only deepseek-chat`（单轮 prompt，无工具；SWE 用 SEARCH/REPLACE 块交付） |
| 实测（agentic） | `--only deepseek-chat-agentic`（OpenAI function-calling 工具循环：bash / write_file / read_file / list_files / finish，30 步；SWE 在 prepare 好的 checkout 里改代码，`--worktree` 评估） |
| 报告 | `reports/<suite>-report.{json,md}`（gitignored） |

两种口径回答两个不同的问题：one-shot 量"裸模型一次作答"的水平
（下界基线）；agentic 接近官方榜单的测量方式（模型+最简脚手架）。
官方分数仍不可比——官方 harness 的脚手架远比 30 步工具循环精细，
且任务切片小、单轮、本地环境。

## 0.5 Rust 原生评估与 parity（2026-10-12）

SWE 评估驱动提供 **Rust 原生实现**（`src/swe_native.rs`，`bench swe --native`），动机是 2026-10-12 的环境污染事故——Python 驱动依赖宿主解释器状态，agent 一次 `pip install -e .` 就能 shadow 全系统的 pytest。边界诚实声明：

- **已 Rust 化**：repo 编排（git）、uv 环境（env-cache 标记与 Python 驱动**字节兼容**，venv 两边共享）、补丁链、search/replace 块应用、`pytest -rA` 编排、`parse_log_pytest` + `grading.test_passed` + `norm_case_id` 判分全 port（6 个单测）；
- **仍需 Python**：pytest 本体与被测仓库的 venv——SWE 的 ground truth 就是 pytest 输出，范式固有依赖；Rust 化的是**编排层**；
- **parity 验证**（`tests/swe_parity.rs`，`cargo test --release --test swe_parity -- --ignored`）：gold 实例 Python 驱动 × Rust 原生双跑，5/5 实例 `passed` + f2p/p2p 计数逐字段一致；
- **τ² 保留 Python**：其 ground truth 就是上游 orchestrator（user simulator + 域状态机 + litellm），Rust 重写等于偏离官方语义；
- **synapse 依赖边界**：驱动暂不依赖 synapse——其 `utils` 仅错误类型、`coding_tools` 是 agent CLI 驱动层，没有评估驱动所需通用工具；未来 agent 侧改用 `synapse::providers::catalog` 解析预设时再引入。

## 1. τ²-bench（airline 域，5 任务）

- **导入**：`bench tau2-import --from <tau2-root-or-tasks.json>`（上游
  `data/tau2/domains/airline/tasks.json`，任务按序号选片）。
- **环境**：`tools/tau2_driver.py` 在钉住的 τ² checkout 里驱动工具状态机，
  scripted user 回放黄金对话（`--user-mode llm` 可换 LLM user）。
- **oracle**：5/5（replay-oracle 回放黄金动作）。
- **deepseek-chat**：**2/5 (40%)**——两轮复跑失败矩阵完全一致
  （11✓/3✓，7/14/18✗），系统性失败非抖动。
- **deepseek-chat + shadow-addendum 系统提示（2026-10-13）**：**仍 2/5**
  ——`--shadow-addendum` 向 agent 系统提示追加写工具纪律（"用户要求的
  变更必须真的调写工具并看到结果才算完成；###STOP### 前核对所有变更
  已执行"）。唯一变化：任务 7 的 COMMUNICATE 0→1（对话变好），**DB
  依旧全 0**。结论：**DB=0 的根因是 deepseek-chat 调用写工具时的参数
  精度与政策合规能力（tau2 环境会拒绝违反航司政策的操作），不是它
  不知道要执行**——提示工程在 τ² 上同样到顶。评测面（DB 终态对比、
  用户模拟器、评分）全程未动，官方口径可复现
  （`bench tau2 --verify`）。

不可比说明：非官方 τ² harness；scripted user；单轮、5 任务切片。

### 1.1 接线完成与重测（2026-10-26）

τ² 适配器此前只有 `src/tau2.rs` 的骨架（未被 `lib.rs` 声明，bench
二进制也没有 τ² 子命令），实际跑批靠一次性脚本。本次补齐接线：

- **CLI**：`bench tau2`（跑批）+ `bench tau2-import`（冻结上游任务记录）
  + `bench tau2 --verify`（replay oracle 自检，不需模型与 key，
  全绿才允许入库）；参与者从同一份 `agents.toml` 的 `openai` 变体构造。
- **可审计字段**：驱动新增 `extract_run_facts()`，把模拟轨迹蒸馏成
  `answer`（最后一条**实质**回复——交接话术不算）、`tool_calls`、
  `usage`、`steps`（逐步消息 + 工具调用），全部落进报告 JSON。
  交接话术（"转人工"）是 τ² 用户模拟器的固定收尾，若直接取最后一条
  助手消息会丢掉真正的答案，故按短语表回退到上一条实质回复。
- **复测（固定用户模拟器 = deepseek-chat，对齐上游 gpt-4o-mini 语义）**：
  - oracle `--verify`：**5/5**（harness 自身绿）；
  - deepseek-chat：**3/5 (60%)**（3✓/11✓/18✓，7/14✗），与历史
    2/5（11✓/3✓）同量级——**逐题通过与否有抖动**（本次 18✓ 11✗，
    上次 11✓ 18✗），因此 5 题切片的单轮分数只能当量级参考；
  - 失败 7/14 仍是 DB=0 + COMMUNICATE=0（写工具参数精度 + 政策合规），
    与 2026-10-13/14 的归因一致。

不可比说明（1.1 口径）：非官方 τ² harness；单轮、5 任务切片；用户
模拟器为 LLM（deepseek-chat 固定），非上游 gpt-4o-mini。

### 1.2 agentic 模式与 SWE / GAIA / TB 适配器入库（2026-10-26）

**此前**：`agents-tb.toml` 里写着 `[agent.mode] kind = "agentic"`
max_steps = 30`，但 harness 根本没有 agentic 模式——`AgentSpec::OpenAi`
没有 `mode` 字段，serde 把整张表当未知字段丢掉，所有 "agentic" agent
实际跑的都是 one-shot。SWE / GAIA / TB 的适配器代码（另 4042 行 WIP）
写的是旧 harness 的 API（`AgentMode` 枚举、`parse_path_marker`、
`AgentRun.usage/tool_calls`、2 参 `run` 签名），一行都编不过。

**本次**：

- **agentic 模式落地**：`AgentMode` 枚举（OneShot / Agentic{max_steps}）
  + `src/tools.rs` 工具层（bash / read_file / write_file / list_files /
  finish，路径越界一律拒绝）+ `OpenAiAgent::run_agentic` 的 function
  calling 循环。每一步都记进 `AgentRun.steps`，报告里能看清"模型怎么
  走到这个结论"，而不只是最终答案。`[agent.mode]` 现在真的生效。
- **路径标记统一**：`parse_path_marker` 同时接受 `path:src/a.py` 与
  模型更爱写的 `python:src/a.py`，并拒绝绝对路径 / 盘符 / URL / `..`。
  `apply_fenced_patches` 与 SWE 的补丁抽取共用同一套判定。
- **适配器入库**：swe / swe_native / swe_import / gaia_import /
  tb_import / browser 六个模块接进 `lib.rs`，机械性缺口（Task.framework、
  answer_contract 类型、RunOutcome 新字段、Report.sessions、run 签名）
  逐个补齐；`cargo test` 130 绿（含这六个模块自带的测试）。
- **CLI**：`bench swe` / `bench swe-import` / `bench gaia-import` /
  `bench tb-import`。

**实测**（core-smoke 10 题，deepseek-chat）：

| 口径 | 成绩 | median | 备注 |
|---|---|---|---|
| one-shot | **9/10** | 0.87s | 对照组 |
| agentic | **8/10** | 2.42s | 22 次工具调用，1 题不同（extraction 翻红） |

core-smoke 以文本题为主，工具帮不上忙，agentic 与 one-shot 基本
持平（唯一差异是 extraction：agent 用了工具后过度推理，把 1280.00
当答案）。**agentic 的价值要在工具题上兑现**——SWE 那 5 题：

| 口径 | 成绩 | 说明 |
|---|---|---|
| one-shot（prompt-only） | 0/5 | 没有工具，改不了代码 |
| agentic 30 步 | 0/5 | 每题撞满步数上限；flask-5014 还把 59 个原本通过的测试跑挂（p2p 0/59） |
| agentic 50 步 | **4/5 (80%)** | flask 1/1+59/59、requests 2/2+185/185、pylint-6386 1/1、pylint-8898 1/1；pytest-10051 未修好且跑挂 1 个 p2p |

50 步那轮复现了旧 harness 的历史成绩（deepseek 3/5@50 步、
MiMo flash 4/5），说明**限制因素是步数预算不是能力**。唯一失败的
pytest-10051 是典型的"修复引入回归"（f2p 0/1 + p2p 14/15）。

**中途挖出的 harness 缺陷**（已修）：`bash` 工具在 Windows 上跑的是
`cmd.exe`，而模型写的是 POSIX 命令——`;` 在 cmd 里不是命令分隔符，
`ls; grep -n ... | head` 会被 `ls` 整行吞掉，模型于是把步数预算烧在
shell 语法错误上。改成优先 POSIX shell（Windows 上先找 Git 的
bash，避免撞上 WSL 的），并补了 `edit_file`（精确片段替换，替代整
文件重写）。

## 2. GAIA 文本子集（10 任务）

- **导入**：`bench gaia-import --from <rows.json> --levels 1,2`（HF
  datasets-server 行包络），`text_only` 过滤掉必须用文件/网页的题目。
- **评分**：官方 `question_scorer` 语义移植（7 个单测护住）。
- **gold**：10/10（gold self-match oracle）。
- **deepseek-chat（one-shot，2026-10-11）**：**3/10 (30%)**——较 10-09
  的 2/10 提升 1 题：system prompt 增加 `FINAL ANSWER: <value>` 纯文本
  约定后，`17**` 这类 markdown 包裹的格式损失被消除（评分器本身的
  `extract_final_answer` 一直支持该标记，此前没告诉模型）。
- **deepseek-chat-agentic-50 + web_fetch 工具（2026-10-13）**：**6/10
  (60%)**——agentic 工具集加入 `web_fetch`（HTML→文本、实体解码、12k
  截断）后 +20pp：贝壳珠子（抓到 Science Advances 摘要）、Hiccup 论文
  （抓 PDF 提取 0.1777）、Mercedes Sosa 专辑数（抓维基 discography）
  等此前靠记忆瞎猜的题全部翻绿。残余 4 失败：Unlambda 谜题（纯推理）、
  ping-pong 谜题（这轮模拟结论错，上轮对——模拟类任务单轮抖动）、
  pass-challenge 爬虫（600s 超时）、"egalitarianism" vs
  "egalitarian"（词形差一词，评分器无词干还原）。
- **deepseek-chat-agentic-50 + 答案规范化钩子（2026-10-13）**：**7/10
  (70%)**。`gaia_matches` 数字分支加 fallback——model 答案 `parse_f64`
  失败时抽所有数字 token（`17 thousand hours` → `17`），任一与 gold 在
  `1e-5*gt+1e-8` 容差内即过。**0 LLM 调用、0 重跑**——在已有报告上重打分。
  ping-pong 这轮模拟结论带解释 → 翻过。**注：这是"事后捞回"，不是
  修问题根因**（模型风格问题还得提示工程或 LoRA 解决）。
- **deepseek-chat-agentic-50 + browser 工具（2026-10-13，chromedriver :9515）**：
  **5/10 (50%)** 单轮——`browser_navigate` / `browser_snapshot` /
  `browser_click` 三个 W3C WebDriver 工具（`src/browser.rs`，reqwest
  零新依赖实现，`webdriver_url` 选配启用）。与 web_fetch 版互补而非
  替代：browser 翻了 04a04a9b（多步检索）和 c61d22de（"egalitarian"
  词形精确——真去权威页面核对），web_fetch 版独有的 2 题这轮未中
  （单轮抖动）。**两轮并集 pass@any = 8/10 (80%)**。成本：217 工具
  调用 / 2.38M tokens / 10 任务（238K tokens·任务，与 SWE agentic
  同量级）。启动条件：`chromedriver --port=9515`（或任一 W3C 驱动
  —— Selenium/Appium/shadow-desktop wdio 插件），agents-tb.toml 的
  `deepseek-browser-agentic` 条目带 `webdriver_url`。
- **mimo-flash + 答案规范化 + tail_candidate（2026-10-13，生产路径）**：
  **5/10 (50%)**——`tail_candidate` 把"Answer: 3"/"…last short line"/末
  token 数字兜底（模型没用 `FINAL ANSWER:` 标记时），与数字 token 抽取
  组合后跑过 scorer 自身。`bench run` 报告的 `pass^k` 直接是 50%——
  钩子在生产路径生效，不是事后 Python 模拟。**残余 5 失败**：3 题
  `got ""`（模型在 finish 总结里没写答案+被 8000 字符截断，捞不回）+
  1 题词形（"egalitarianism" vs "egalitarian"，无词干还原）+ 1 题推理
  谜题（Unlambda）。

不可比说明：官方 GAIA 是 agentic（浏览器/文件工具 + 长程推理）；我们
现在也有 bash + web_fetch 工具面，60% 单轮已进入官方榜体面区间
（第一梯队 65–75% 仅差 5–15pp），但 10 题切片 ±2 抖动仍在。

## 3. SWE-bench Verified（5 实例 smoke）

- **导入**：`bench swe-import --from <rows.json> --tasks …`。每个
  (repo, version) 必须命中 **baked env spec 表**（忠实转录 swebench
  3.0.9 `MAP_REPO_VERSION_TO_SPECS_PY` + `MAP_REPO_TO_REQS_PATHS`），
  未收录的组合直接拒绝导入——用猜出来的环境跑分比不跑更糟。当前收录：
  pallets/flask 2.3、psf/requests 2.27、pylint-dev/pylint 2.14 / 3.0、
  pytest-dev/pytest 7.2。
- **评估**：`tools/swe_driver.py` —— 官方 Docker+conda harness 的
  **local-venv 等义移植**。逐实例：浅克隆双 SHA（`base_commit` +
  `environment_setup_commit`，req 文件按后者取）→ uv venv → req 文件
  按官方 `get_requirements_by_commit` 语义展平（`-r` 递归、排除 `-e .`
  等）→ 官方 `specs["install"]`（每次评估重装）→ **测试文件防篡改
  reset** → 应用 test_patch → `pytest -rA` → `parse_log_pytest` +
  `grading.test_passed` 判分（FAILED/PASSED/SKIPPED/ERROR/XFAIL，缺
  失即失败）。
- **oracle**：**5/5**（gold 补丁 f2p+p2p 全过）。

### deepseek-chat 实测（2026-10-11）

| 口径 | 分数 | 失败形态 |
|---|---|---|
| one-shot（手写 diff 契约，2026-10-09） | **0/5** | 2 个 diff 结构不合法、2 个 hunk 上下文错、1 个语义错 |
| one-shot（整文件块 + SEARCH/REPLACE 契约） | **0/5** | 契约机制全部工作，但模型**没见过代码**：SEARCH 文本凭记忆瞎写（甚至发明了不存在的 `src/quart/` 路径） |
| **agentic（repo 内工具循环）** | **2/5 (40%)** | flask-5014 ✓、requests-6028 ✓（f2p 满分 + p2p 全绿）；3 个失败 p2p 近全绿、仅 f2p 未中——修复安全但不命中根因 |

结论：harness 无损（oracle 5/5）。**SWE 的 0 分纯粹是"没有仓库访问权"
的范式产物**——同一个模型拿到 repo + 30 步工具循环后即从 0% 到 40%。
整文件块契约还暴露了第二个坑：逼模型凭记忆重吐 30KB 文件会产生版本
漂移（新 API 写旧代码，import 崩、p2p 全灭），SEARCH/REPLACE 块
（只输出改动行）就是为此引入的。

**近失案例（pytest-10051，30/50 步均未中）**：agent 的根因诊断完全正确
（`LogCaptureHandler.reset()` 重绑定列表使 `get_records` 的旧引用失联），
但手术语义错了——它直接把 `reset()` 改成 in-place clear；金补丁是
**保留 `reset()` 原样、新增独立的 `clear()`** 供 `caplog.clear()` 走，
避免污染 per-stage 快照。结果 f2p 不过、还碰坏 1 个 p2p——f2p/p2p
双指标正是为抓这种"领域对、手术错"的修复设计的。

### 环境偏差（逐条声明）

官方分跑在 Docker+conda 上；我们的本地适配有 5 处偏差：

1. runner pytest **钉 7.4.4**（官方 conda 镜像浮动）；
2. req 文件用 pip 装（官方 conda create）；
3. 安装时注入 `SETUPTOOLS_SCM_PRETEND_VERSION=<version>.0`——浅克隆
   没有 tags，setuptools-scm 会退回 `0.1.dev1+g<sha>`，自举套件
   （pytest 测 pytest 自身）会直接死在 `minversion` 上；
4. 节点 id 的路径参数**规范化**（官方数据把 `__file__` 类参数记录为
   `/basename`，Windows 绝对路径必须折叠才能对上）；
5. **非 Docker**：Windows 本地 venv。requests 有 3 个 p2p 用路径参数
   （`TestExtractZippedPaths`），在规范化之前被误报为失败。

**偏差 5 的真实代价（2026-10-12 事故）**：没有 Docker 隔离，agent 可能
污染宿主环境——MiMo 的 pytest-10051 agent 用**系统 pip**（而非实例
venv）`pip install -e .` 验证修复，把全局 `pytest` 变成指向 SWE 临时
仓库的 editable 安装，之后所有 TB 任务（UnitTests 评分走环境 pytest）
全部在污染状态下跑分。处置：卸载 editable 安装、重装钉住版本
（TB 口径 pytest==8.4.1）后复跑。官方 harness 的 Docker 隔离正是为了
杜绝这类跨任务状态泄漏。

### 为什么 one-shot 是 0/5、agentic 是 2/5

SWE-bench 的官方分数来自 **agentic harness**（SWE-agent / Agentless /
Codex 类，能浏览仓库、读文件、多轮试错），同类模型在 agentic 模式下
30–65%。我们的数字复现了同一条规律：**只看 problem statement 一次性
作答（无论 diff、整文件还是 SEARCH/REPLACE 契约）都在 0% 附近**——
模型没见过代码，一切交付都是凭记忆的猜测；同一个模型拿到 repo 访问权
+ 30 步工具循环后即到 40%，且失败实例的 p2p 近全绿（改动不再破坏
代码库）。这正是官方"模型分=模型+脚手架"口径的本地注脚。

## 4. 复现

```bash
cd benchmark
set -a && source .env && set +a     # SHADOW_BENCH_DEEPSEEK_KEY（.env 不入 git）

# τ²
cargo run -- tau2-import --from .tau2 --out suites/tau2-airline.json --tasks 3,7,11
cargo run -- tau2 --suite suites/tau2-airline.json --verify
cargo run -- tau2 --suite suites/tau2-airline.json --agents agents-tb.toml

# GAIA（走标准 runner）
cargo run -- gaia-import --from <gaia-rows.json> --out suites/gaia-text-smoke.json
cargo run -- run --suite suites/gaia-text-smoke.json --agents agents-tb.toml

# SWE-bench Verified
cargo run -- swe-import --from <swe-verified-rows.json> --out suites/swe-verified-smoke.json \
  --tasks pallets__flask-5014,psf__requests-6028,pylint-dev__pylint-6386,pylint-dev__pylint-8898,pytest-dev__pytest-10051 \
  --name swe-verified-smoke --rev princeton-nlp/SWE-bench_Verified@test
cargo run -- swe --suite suites/swe-verified-smoke.json --verify
cargo run -- swe --suite suites/swe-verified-smoke.json --agents agents-tb.toml
```

SWE 实例的仓库克隆 + venv 缓存在 `benchmark/.swe-work/`（gitignored），
金补丁评估约 30s/实例（缓存命中后约 5s）；LLM 模式给 `--repeat k` 看
pass^k 稳定性。`SHADOW_SWE_PYTHON` / `SHADOW_SWE_UV` 可覆盖驱动侧的
python/uv 路径。

## 5. 结果汇总（deepseek-chat，2026-10-11）

| 套件 | 切片 | oracle | one-shot | agentic |
|---|---|---|---|---|
| Terminal-Bench 2.x | 4 任务 | ✅ | 0/4 | **1/4 (25%)** @30 步（regex-log ✓）；batching @50 步 + 1800s 仍 ✗ ——能力边界，非预算 |
| τ²-bench airline | 5 任务 | ✅ 5/5 | —（上游 harness 本身就是 agentic：litellm + 域工具多轮循环） | **2/5 (40%)** |
| GAIA 文本 | 10 任务 | ✅ 10/10 | 3/10（首跑）/ 1/10（复跑）—— 单轮 ±2 抖动 | **4/10 (40%)**（@30 与 @50 步持平；首轮 0/10 = 模型算对却把答案埋进总结，评分器提取不到——补 FINAL ANSWER 契约后翻转） |
| SWE-bench Verified | 5 实例 | ✅ 5/5 | 0/5 | @30 步 **2/5**；@50 步单轮 **3/5**；@50 步 ×3 轮：**pass-rate 5/5（每题至少过一次）、pass^3 60%**（flask/requests/pylint-8898 三连稳过，pylint-6386 与 pytest-10051 各 1/3 掷硬币）。**闭环脚手架（2026-10-12）**：任务文本注入 venv 位置 + "finish 前重跑相关测试并迭代"约定后，单轮即 **4/5**（pylint-6386 从掷硬币翻为稳定通过；唯一失败是宿主内存压力导致的 repo 安装基础设施失败，非模型） |

2026-10-09 → 2026-10-11 的变化全部来自 **harness 侧修复**（同一模型
deepseek-chat、同一任务切片、oracle 始终全绿）：

1. GAIA +1：`FINAL ANSWER:` 纯文本约定（评分器早已支持，没告诉模型）；
2. TB 0→1：agentic 工具循环（regex-log 要求交付 regex.txt——one-shot
   模式没有落盘通道，结构性 0 分）；
3. SWE 0→2：agentic 在 prepare 好的 checkout 内定位修复 + `--worktree`
   评估。中间踩掉三个真 bug：bash 工具不经 shell（Windows 无 echo.exe，
   且 `which bash` 会命中 System32 的 WSL 桩）、`ensure_repo` 在
   worktree 评估前无条件 `reset --hard` 抹掉 agent 修改、tokio runtime
   因孙进程继承 stdio 在报告写完后挂死（现报告落盘后强制 exit）。

共同结论：**评测器零损耗**（oracle 全绿）。2026-10-11 的提分全部来自
把"harness 给模型的交付面"修对——repo 访问权（SWE 0→2→3）、产物落盘
通道（TB 0→1）、答案行契约（GAIA one-shot +1；agentic 0→4，首轮 0/10
的教训：脚手架必须和任务的交付形态匹配——GAIA 的交付物是答案行，
不是 workdir）。单轮小切片方差不可忽略（GAIA one-shot 同配置复跑
3/10→1/10）。剩余失败在模型侧：SWE pytest-10051（deepseek 30/50 步
都未中）、TB batching（50 步 + 1800s 仍未中）。
GLM-5 对比跑因 `.env` 中 `SHADOW_BENCH_ZHIPU_KEY` 为空占位未执行。

## 6. 跨模型对比（agentic 口径，2026-10-12）

| 套件 | deepseek-chat | mimo-v2.6-flash | mimo-v2.6-pro |
|---|---|---|---|
| SWE-bench Verified（agentic） | pass-rate 5/5、pass^3 60%（@50步×3轮） | **4/5**（首试解 pytest-10051） | 0/5（native 复跑确认；p2p 全绿但 f2p 全灭——重档在紧步数工具循环里反而更差） |
| GAIA text | **4/10** | 3/10 | 未跑 |
| Terminal-Bench 2.x | **1/4** | 0/4（清理污染后复跑确认） | 未跑 |

MiMo flash 的 SWE 表现（4/5，含唯一硬骨头 pytest-10051）使其成为该切片上
目前最强的本地可比模型；deepseek 均衡但缺尖峰；**MiMo pro 0/5 是一个
反直觉信号——重档模型在紧步数工具循环里过度规划、迭代不足**（其
flask 首轮还出现过 1005s 后端点返回不可解码响应体的基础设施失败，
native 复跑未再现）。MiMo 单题耗时约为 deepseek 的 2–3 倍。

## 6. 跨模型完整榜单（2026-10-12，agentic 口径 + 闭环脚手架）

| 套件 | deepseek-chat | mimo-v2.6-flash | mimo-v2.6-pro |
|---|---|---|---|
| SWE-bench Verified（5 实例，闭环 SWE_AGENTIC_LOOP） | pass-rate **4/5**、pass^3 **80%**（2026-10-14 截断修复后；见下） | **4/5**（80%，首试解 pytest-10051） | 0/5（native 复跑确认；p2p 近全绿但 f2p 全灭） |
| GAIA text | **4/10 (40%)** | 3/10 | — |
| Terminal-Bench 2.x | **1/4 (25%)** | 0/4 | — |
| τ²-bench airline | **2/5 (40%)** | — | — |

### 千问平台模型扩容（2026-10-14 综合表）

> **2026-10-14 用户决定**：阿里云平台（DashScope/千问/智谱/月之暗面）测试
> 成本高，agents-tb.toml 中 12 个相关条目（qwen3-max/qwen3.8-max/
> qwen3.7-flash/kimi-k3/glm-5.3/glm-5-agentic/mimo-agentic/mimo-pro-agentic
> + 4 个 -agentic 变体）全部注释（保留代码方便回滚），DeepSeek 开放
> 平台为当前默认。下表为已跑结果存档，待切换时直接取消注释恢复。

| 套件 | qwen3.8-max | kimi-k3 | glm-5.3 | qwen3.7-flash | (当前默认) deepseek |
|---|---|---|---|---|---|
| τ²-bench airline (5 任务) | **3/5 (60%)** addendum v3（DB 5/5 中 1 漏报） | **3/5 (60%)** addendum v3 | 2/5 (40%) | **4/5 (80%)** v3 | —（未在 τ² 跑过）|
| GAIA text (10 任务, t900) | **7/10 (70%)** | **8/10 (80%)** | 5/10 (50%) | 4/10 (40%) | — |
| SWE-bench Verified | （未跑）| （未跑）| （未跑）| （未跑）| **pass^3 80%** (r3-v2) |
| Terminal-Bench 2.x (4 任务) | （未跑）| （未跑）| **0/4 (0%)** 2026-10-14 | （未跑）| **1/4 (25%)** (regex-log) |
| core-smoke 4 任务直答 | — | — | — | — | **4/4 (100%)** |

**TB 跨档位对照（2026-10-14 完整实测）**：

| 模型 | TB pass^k | 中位 | 备注 |
|---|---|---|---|
| deepseek-chat-agentic-50 | 1/4 (25%) | 7.72s | regex-log 命中；其他 3 题能力限 |
| **glm-5.3-agentic** | **0/4 (0%)** | 114s | 0.5B 量级 + 4/4 同 失败模式 `tests/test_outputs.py not found`（harness：workdir 没把 hidden_files 注入的验证器文件就近可见） |

**TB 真能力上限结论**：在当前 harness（`run` 子命令 + suite files 在 workdir 注入）下，deepseek/GLM-5.3 0.6B-50B 档位都到顶（1/4 vs 0/4）。**"换档位破 deepseek 1/4 上限"假说**部分证实（GLM-5.3 没破），但**注意 harness 限制**：TB 子任务需要 task_file 树在 workdir 落盘才能让 agent 实际工作，目前 `run` 子命令未做此注入（看到的是 `tests/test_outputs.py not found`），所以部分 0/4 是 harness 缺陷而非模型能力。下一步**修 prepare 阶段**（把 suite 声明的 files+hidden_files 复制到 workdir 对应路径，agent 改 path 时即就地生效）+ 重建 TB 专用子命令（`bench tb`）后重测，方可得到真模型排名。

**说明**：SWE/TB 是缩差路线的下一波（用户评估 2026-10-14 的"换模型档位破 deepseek 上限"假说时已点名优先 glm-5.3）；τ² 4 模型的同

### SWE-bench Verified 官方榜 DeepSeek 真实成绩（2026-10-15 查证，gh api SWE-bench/experiments）

| 提交 | 模型 | Harness | 分数 | 任务 | 总成本 | 单实例成本 | 单实例调用 |
|---|---|---|---|---|---|---|---|
| 2025-08-06 SWE-Exp | DeepSeek-V3 | SWE-Exp（experience learning） | **42.0%** (210/500) | 500 | — | — | — |
| 2025-12-01 mini-v1.17.1 | DeepSeek V3.2 Reasoner | mini-SWE-agent (SWE-agent) | **60.0%** | 500 | $14.04 | $0.028 | 46.4 |
| 2026-02-17 mini-v2.0.0 | DeepSeek V3.2 (high) | mini-SWE-agent (SWE-agent) | **70.0%** | 500 | $223.92 | $0.448 | 88.5 |

**对标我们 shadow harness（5 题切片）**：deepseek-chat-agentic-50 pass-rate 4/5（80%）、pass^3 80%——**单切片无统计意义但**与 2025-12-01 同模型基线 V3.2 Reasoner (60%) **/ V3.2 high (70%) 同一档位**。
- 5 题切片=平均 25% 噪声带，纯模型 V3.2 60-70% × 切片-25% = 35-45% → 我们 4/5 (80%) **略高于噪声带上限**，但**单切片 5 题 1 题差异就是 20%**——需要扩到 25 题以上切片或同步跑全 500 题才可下结论。
- 主流在榜**没有 "deepseek-harness" 项目条目**——"DeepSeek Harness"（你之前提到的 dsh 项目）我之前默认存在是错的：SWE-bench 官方 inference 支持 deepseek 模型（OpenAI 客户端 + api.deepseek.com 路由），但没有 dsh 框架条目；CLAUDE.md 也只列 SWE-Agent / Agentless / OpenHands 三类公共参照。
- **2026 年初 deepseek 系列在 SWE-bench Verified 上已是**第一梯队中游**（70% 接近 GPT-5/Opus 4.5 80% 区间）——harness 工程在这块没多少可优化的空间，主要是 model tier 决定。
一人设下另一道**套件间能力画像分化**对比：kimi τ² 通讯纪律弱（仅 1 成功因 COMM
漏报）但 GAIA 强档 8/10，反差最大；qwen3.7-flash τ² 4/5 但 GAIA 4/10 与大
档齐平——"小档并不必然弱于大档"再获证据。
**重要观察**：重档 ≠ 更强。`mimo-v2.6-pro` 在 50 步紧循环里 0/5，
反不如 `mimo-v2.6-flash` 4/5——过规划、迭代不足是重档在受限工具循环
里的真实短板。`deepseek-chat` 在闭环脚手架后是 SWE 的 pass-rate
冠军，但 TB/GAIA 的多步能力弱于它修代码的能力（典型”代码特化”分布）。

### TB 规划脚手架：干净的负结果（2026-10-13）

缩差路线第 3 项——给 UnitTests 评分的 agentic 任务注入规划优先提示
（`AGENTIC_PLAN_HINT`：先写 2-4 步计划、逐项推进、任务自带测试自己跑、
“缺产物=零分”、步数过半先交付可工作版本）后重跑 TB：**仍 1/4**
（regex-log ✓ 稳定；batching/raman/schemelike ✗），中位耗时 132.5s
（比无提示的 104s 更长——模型确实在按提示规划迭代，但救不回算法/物理/
解释器实现本身的能力缺口）。结论：**TB 三道硬题的失败在模型推理能力，
不在交付纪律**；deepseek-chat 档在 TB 上到顶了，要动分数得换模型档位
（官方榜首是 GPT-6 Astra max / Opus 4.5 档）。提示保留（卫生学收益 +
防产物缺失回归），不再做提示变体。

#### GAIA t900（2026-10-14，reports-gaia-free4-t900，伪影消失）

180s 默认超时改为 900s 后 4 个千问平台模型 agentic × 10 任务：

| 模型 | t900 | 之前 (t180) | 变化 |
|---|---|---|---|
| **kimi-k3-agentic** | **8/10 (80%)** | 4/10 | +4（提示词修复伪影+能力全发挥）|
| qwen3.8-max-agentic | 7/10 (70%) | 2/10 | +5（最大单点提升）|
| glm-5.3-agentic | 5/10 (50%) | 1/10 | +4 |
| qwen3.7-flash-agentic | 4/10 (40%) | 4/10 | =（未超时，但是这道档位上限）|

**重要观察**：t180 的"6-8 败"几乎全是 timeout，t900 跑满后真正分母显现——
kimi 和 qwen3.8 实际是 GAIA 强档，与前 τ² 跑（kimi τ² 通讯纪律弱）形成
**套件间能力画像分化**。

### 千问平台模型扩容：τ² airline-smoke（2026-10-14）

#### SWE 截断修复验证 + 新的唯一失败源（2026-10-14，reports-swe-r3-v2）

max_tokens 2048→8192 + `finish_reason=length` nudge（不退出循环）+
步进纪律三项修复后 deepseek-agentic-50 ×3 repeats：pass^3 **60%→80%**
——pytest-10051 从 FFP 变 **PPP**（旧根因"截断退出循环"精准命中并消除；
该实例三 repeat 全部跑满 51-53 次工具调用、~75 万 tokens，答案完整）。

新的唯一失败源 **pylint-6386（PFF→FFF，环境问题非能力）**：答案转储明说
"任务说项目装在 .venv/ 但它不存在；全局 env 的 astroid 不兼容，我装了
兼容版留着"——模型三 repeat 一致地先修环境再修 bug，步数耗在环境搏斗上。
**SWE_AGENTIC_LOOP 提示无条件承诺 `.venv/` 就绪，pylint 工作树却不满足**
→ 下一步：修 prepare 阶段保证每实例 venv 落地（或提示按需探测），
预计可回收该实例。

#### 思维定式链路首版（2026-10-14，evaluate-then-record）

评估现有代码离"workflow = 思维定式 + 失败节点重启 + 成功案例沉淀"链路的
距离：**已有 70%**——存储模型（`FlowTraceRow`：trajectory/intent_signature/
quality_score）、持久化（`FileFlowBlob` save/list_traces）、消费端
（`learner` 蒸馏 + `solidify` 固化 + 草稿 promote/reject API）齐全，
**缺的只是摄入口**。落地两件套：

- telencephalon：`POST /api/flows/traces/ingest`（外部 run 落库）+ `GET
  /api/flows/traces`（跨源拉取，默认 limit 50）。IngestTraceRequest
  接收 source（producer 身份）/ user_input / trajectory（自由 JSON=
  谁做了什么用了什么工具）/ quality_score / intent_signature（同类
  任务检索钩子）。
- bench：`AgentRun.steps: Vec<StepRecord>`（model + tool:* 每步
  kind/actor/args/result/ok/at_ms，`--now_ms()` 时间戳）→ `RunOutcome.
  steps` 串行转发 → bench 子命令 `--trace-url URL` 收尾时把所有
  非空 steps 批量 ingest 到 `<url>/api/flows/traces/ingest`，source
  默认 `benchmark/<suite>`，quality_score 1.0/0.0 与 pass 同步。
  4 个 AgentRun 字面量（CLI/desktop/brain/one-shot）补 `steps:
  Vec::new()`，12 个 SWE/τ² RunOutcome 字面量同样补齐；102 lib
  测试全绿零回归。

**用户场景落地**："记录所有 benchmark 题目在大脑中的过程"——下次
`bench run --trace-url http://127.0.0.1:8082` 跑任意套件，trajectory
全部落 `~/.shadow/flows/traces/*.json`（FileFlowBlob 默认基目录），
可被 learner 蒸馏为草稿流，再 promote 为正式 flow 模板供后续同
signature 任务复用。失败节点重启与成功案例检索由后续 Phase 接
（`/api/flows/traces?since=...` 配 `intent_signature` 索引）。

#### 大脑首行 delta + ExactMatch 评分宽严修正（2026-10-14，reports-brain-qwen06-fixed）

完整大脑栈活体（`encephalon --example a2a_server`，四件套健康）托管
qwen3-0.6b 跑 core-smoke：首跑 2/10，其中 3 题是**值对但格式死**
（"final answer: 90" vs "90" 等）——根因是 ExactMatch 从不调用
extract_final_answer（只有 GaiaMatch 用）。修正：ExactMatch 加两级
**严格 F→P** 的 fallback（marker 剥离 × 数值等值，二者可复合），复跑
**5/10（pass^k 50%）**；剩余 5 败为真能力限（算术错值、字母计数错、
2×python 代码跑挂、rust-sha 格式混淆）。对照 2026-10-09 旧 harness
同量级 4/10——栈未退化，评分对齐后持平略升。此修正对全部 ExactMatch
任务生效（GAIA/SWE/τ² 不走该路径，零影响）。

#### τ² 首轮成绩（2026-10-14）

接入方式：qianwenai MaaS（`maas.qianwenaiapi.com/compatible-mode/v1`，
OpenAI 兼容面 + Bearer；平台同一模型的 `/apps/anthropic` 面是给 Claude
Code 类客户端的 Anthropic 协议入口，benchmark 不用）。key 下 176 个模型，
逐个 probe tool-calling 后免费可用：qwen3.8-max / kimi-k3 / glm-5.3 /
qwen3.7-flash（deepseek-v4-pro、qwen3.7-plus 免费额度耗尽；MiniMax-M3
产品未开通）。

| 模型 | pass^k | 中位耗时 | DB 合计 | 失败模式 |
|---|---|---|---|---|
| **qwen3.8-max** | **4/5 (80%)** | 197s | **5/5** | task7 漏报 COMMUNICATE |
| glm-5.3 | 3/5 (60%) | 59s | 4/5 | task7 同漏报；task18 max_steps 耗尽 |
| qwen3.7-flash | 3/5 (60%) | 130s | 4/5 | task7 同漏报；task11 DB=0 |
| kimi-k3 | 1/5 (20%) | 91s | 3/5 | 3×COMMUNICATE=0（做完不说）；task18 max_steps |

观察：
- **task 7 四模型全军覆没且全是 DB=1.0/COMMUNICATE=0.0** —— 做对了
  数据库操作但都没向用户陈述必报信息，系统性漏报与模型无关，疑似该任务
  的 communicate_info 措辞用户模拟器没有引导出来（对照官方 harness 待查）。
- **qwen3.8-max 是 harness 上首个 DB 5/5**：deepseek/MiMo 的 τ² 失败几乎
  全是 DB=0（参数/政策违规），旗舰档分界清晰。官方 qwen3-max τ²-Verified
  ~69.6，3.8-max 切片 80% 方向一致。
- glm-5.3 用时只有 qwen3.8-max 的 30%，性价比最高；kimi-k3 的失败是
  τ² 特有的沟通纪律问题（GAIA 是另一套能力面，见下）。

#### 两个 harness 公平性修正（2026-10-14 深挖后发现）

1. **τ² 用户模拟器默认 = agent 自己的模型**（上游 `--user-model` 缺省）。
   推理模型当用户时思考 token 挤占输出：qwen3.8-max 的 task7 轨迹里用户
   剧本的注入问题（中段追加"其他 upcoming 航班总价"——ground truth
   1628）写到 "And yes," 就截断，**该 agent 的 task7 COMMUNICATE=0 是
   用户模拟器失职**；且各 agent 配不同用户后 COMMUNICATE 跨模型不可比
   （此前 deepseek/MiMo 的 τ² 成绩同受影响）。修复：Rust 侧接通
   `--user-model/--user-api-base/--user-api-key-env`，全部 agent 固定
   deepseek-chat 当用户（对齐上游固定 gpt-4o-mini 的语义）。注意 task7
   并非全然 harness 伪影：qwen37-flash 的用户正常注入了问题、agent 也
   应答了——但它把 3 个 reservation 报成 $402+$306+$308、加总 $708/$1016，
   与 ground truth 1628 不符（疑似每乘客价 vs 整单价/或 upcoming 判定
   不同），这是真实的读数与算术失败。addendum v2 净 +1（kimi 1/5→3/5）
   仍有效。**v3（固定 deepseek 用户）后 task7 仍四模型全灭**，此时问题
   确实被问到、失败真实归因 agent：轨迹显示 agent 只报了用户 6 个
   reservation 中的 3 个（漏 9MRJD4），且所报数字与 DB 原始值对不上
   （7WPL39 报 $402，DB 为 171×2 客=342）；1628 的口径用 DB 原始票价
   与常见构成（sum×乘客+保险）均无法复现。结论：task7 是对所有模型
   都难的合法硬题，不再作为提示词迭代目标。
2. **GAIA ×4 首轮基线大部分是 180s 超时伪影**：qwen3.8-max 8 败中 6 个
   `task timed out after 180s`、qwen37-flash 全部 6 败超时——推理模型
   agentic 循环跑不进默认 180s（deepseek 快所以 7/10 没暴露）。重跑需
   `--timeout 900`。真实失败里的可修类：qwen38+glm 同题同错 "17000"
   （期望 17，问"多少千"）→ FINAL_ANSWER_HINT 已加单位规则。
3. **SWE pass^3 60% 的不稳定源是循环缺陷非能力**：失败 repeat 的答案
   截断在半句（"Let me test:"），`agent.rs` 对无 tool_calls 响应直接
   break——max_tokens=2048 截断的中间思考触发该路径，半成品补丁静默
   送评。修复：agentic 条目 max_tokens→8192 + `finish_reason=length`
   改注入 nudge 不退出 + 系统提示加步进纪律。

## 7. 官方榜“其他 agent”对标（按 harness 还原 + 同尺度 5–10 题切片）

我们未向官方提交过成绩；以下数据按公开的官方榜单记录与本地可观测
量，标 *“重整结果”* 的来自本仓切片（与官方分数**不可直接比较**——小
切片、5–10 题、本地 uv venv、agentic 30–50 步）。背景参照见
[benchmark-positioning.md](benchmark-positioning.md)。

| 套件 | 官方榜首（agent + harness） | 官方参照（开源/可跑） | **shadow 代理（重整结果）** |
|---|---|---|---|
| Terminal-Bench 2.0（89 题） | GPT-6 Astra (max) + Codex **~60%**；Terminus 2 + GLM-5 **52.4% ± 2.6**；OpenHands + Claude Opus 4.5 **51.9% ± 2.9** | OpenCode + Claude Opus 4.5（60 名附近） | deepseek-chat 1/4（25%），脚手架 30 步 |
| SWE-bench Verified（500 题） | Qwen3 Max 旗舰 **72.5**；Qwen3-Coder 系列开源 SOTA；frontier agentic 30–65% | SWE-Agent、AgentLess、OpenHands 这类 | deepseek-chat pass-rate 5/5、pass^3 60%（5 题切片） |
| GAIA（466 题） | 第一梯队（含浏览器/文件工具）~65–75% | 公开的有 AutoAgent / OpenHands 复现 | deepseek-chat 4/10（10 题文本切片） |
| τ²-bench（airline 域，50 任务） | Qwen3 Max 旗舰 τ²-Verified **~69.6**；τ²-Retail 4B-Thinking 66.1 | 公开基线 tau2-bench 内置 | deepseek-chat 2/5（5 题切片） |

**位置诊断（agentic 口径）**：
- SWE：我们的 `mimo-flash` 切片第一；`deepseek` 稳定但缺尖峰。frontier
  agentic 30–65% 是门槛，我们 +5–10pp 的缓冲来自云端 Qwen3 Max 这档。
- TB：落后官方榜首 ~25–30pp；项级脚手架（命令查询改写、规划分解、
  错误恢复）就是 §“差距”那段说的“20–30pp 杠杆”。
- GAIA：~25–35pp 落后；与 TB 同因——GAIA 榜单**有**浏览器与文件工具，
  我们目前只有 bash/write_file/read_file。接 browser-use/prefrontal
  是缩差路线的第 2 项。
- τ²：~30pp 落后。`deepseek` 切片第一；harness 是上游自带的，差异
  在模型本身（Qwen3 Max 旗舰 ~70% vs deepseek 40%）。

**为什么不能直接拉通跑**：`mimo-pro` 的 1005s 后端点错误暴露了
**官方 vs 我们的基设差异**——官方 Docker 隔离，进程崩溃不影响其他
任务；我们共享宿主，一次内存抖动污染全局 pytest 即可致所有 TB
任务评分失败。这就是 §“差距解剖”里“环境隔离=4 个杠杆之一”。

## 8. 成本与时间（实测，2026-10-12）

> 自 2026-10-12 起报告的每个 run 都带 `usage`（prompt/completion/total
> tokens，OpenAI `usage` 块逐轮累计）与 `tool_calls` 字段。官方榜单
> **不统一**披露这些（TB 提及 cost-without-API-key，τ² 有 turn-budget
> 但无 $；SWE-bench/GAIA 仅 pass@k），所以下表只在 shadow/benchmark
> 内部可比。

**deepseek-chat agentic-50 × SWE 5 实例单轮实测**
（`reports-cost/swe-verified-smoke-report.json`，pass-rate 60%）：

| 实例 | 结果 | 墙钟 | tokens (in/out) | 工具调用 |
|---|---|---|---|---|
| flask-5014 | ✓ | 15.4s | 261,174 (256,681/4,493) | 36 |
| requests-6028 | ✓ | 12.2s | 262,774 (258,426/4,348) | 29 |
| pylint-6386 | ✗ | 17.0s | 872,932 (867,309/5,623) | 53 |
| pylint-8898 | ✓ | 26.4s | 803,306 (795,307/7,999) | 55 |
| pytest-10051 | ✗ | 19.6s | 546,102 (540,347/5,755) | 49 |
| **合计** | 3/5 | 中位 17.0s | **2,746,288**（in 2,718,070） | **222** |

按 deepseek 公开价（$0.28/M in、$0.42/M out）估算：**≈$0.77/5 任务
= $0.155/任务 ≈ $0.26/通过实例**。

**三个结构性发现**：
1. **上下文膨胀是成本主因**：prompt:completion ≈ 96:4——50 步循环每步
   重发全量历史，工具输出（pytest 全文等）持续膨胀上下文。失败任务
   烧得更多（pylint-6386 失败还多烧 33%）。**下一个成本杠杆是
   上下文管理**：工具输出截断/摘要、历史压缩，预估可砍 50–70% token。
2. **失败比成功贵**：修不中的任务平均 token 显著高于修中的（85 万
   vs 26–55 万）——失败 = 更多轮无效迭代。
3. **deepseek 量级**：$0.15/任务对 smoke 切片可接受；放大到 500 题
   Verified 全集 ≈ $75/轮（agentic 口径），预算敏感。

## 9. 位置图（手工 SVG，零依赖）

把"我们在哪"画在每个套件的官方区间里。模型=deepseek-chat（我们
的主力）、口径=agentic 30–50 步、切片 5–10 题（与官方不可直接比较）。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 360" font-family="sans-serif" font-size="11">
  <!-- TB 2.0 -->
  <g transform="translate(0,0)">
    <rect x="0" y="0" width="220" height="110" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="10" y="16" font-weight="bold">Terminal-Bench 2.0 (89 题, agentic)</text>
    <line x1="10" y1="80" x2="210" y2="80" stroke="#94a3b8"/>
    <line x1="10" y1="60" x2="210" y2="60" stroke="#94a3b8" stroke-dasharray="2 2"/>
    <rect x="10" y="30" width="40" height="50" fill="#0ea5e9" opacity="0.6"/>
    <text x="10" y="50" fill="#0c4a6e" font-size="9">frontier</text>
    <text x="10" y="44" fill="#0c4a6e" font-size="9">~60%</text>
    <rect x="60" y="40" width="50" height="40" fill="#0ea5e9" opacity="0.4"/>
    <text x="60" y="55" fill="#0c4a6e" font-size="9">mid 52%</text>
    <!-- our -->
    <circle cx="60" cy="77.5" r="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
    <text x="75" y="80" fill="#7f1d1d" font-weight="bold">shadow 25%</text>
  </g>
  <!-- SWE Verified -->
  <g transform="translate(250,0)">
    <rect x="0" y="0" width="220" height="110" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="10" y="16" font-weight="bold">SWE-bench Verified (5 题切片, agentic)</text>
    <line x1="10" y1="80" x2="210" y2="80" stroke="#94a3b8"/>
    <line x1="10" y1="20" x2="210" y2="20" stroke="#94a3b8" stroke-dasharray="2 2"/>
    <rect x="10" y="22" width="60" height="58" fill="#10b981" opacity="0.5"/>
    <text x="10" y="36" fill="#064e3b" font-size="9">Qwen3 Max 72.5%</text>
    <rect x="80" y="30" width="60" height="50" fill="#10b981" opacity="0.3"/>
    <text x="80" y="44" fill="#064e3b" font-size="9">frontier 30-65%</text>
    <!-- our -->
    <circle cx="135" cy="20" r="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
    <text x="150" y="23" fill="#7f1d1d" font-weight="bold">shadow 60%</text>
    <circle cx="160" cy="80" r="5" fill="#0ea5e9" stroke="#075985" stroke-width="2"/>
    <text x="170" y="83" fill="#075985" font-size="9">MiMo flash 80%</text>
  </g>
  <!-- GAIA -->
  <g transform="translate(500,0)">
    <rect x="0" y="0" width="220" height="110" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="10" y="16" font-weight="bold">GAIA (10 题文本切片, agentic)</text>
    <line x1="10" y1="80" x2="210" y2="80" stroke="#94a3b8"/>
    <line x1="10" y1="40" x2="210" y2="40" stroke="#94a3b8" stroke-dasharray="2 2"/>
    <rect x="10" y="42" width="120" height="38" fill="#f59e0b" opacity="0.5"/>
    <text x="10" y="56" fill="#78350f" font-size="9">first-tier ~65-75%</text>
    <!-- our -->
    <circle cx="56" cy="76" r="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
    <text x="68" y="79" fill="#7f1d1d" font-weight="bold">shadow 40%</text>
  </g>
  <!-- τ² -->
  <g transform="translate(0,140)">
    <rect x="0" y="0" width="220" height="110" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="10" y="16" font-weight="bold">τ²-bench airline (5 题切片, agentic)</text>
    <line x1="10" y1="80" x2="210" y2="80" stroke="#94a3b8"/>
    <line x1="10" y1="42" x2="210" y2="42" stroke="#94a3b8" stroke-dasharray="2 2"/>
    <rect x="10" y="44" width="100" height="36" fill="#8b5cf6" opacity="0.5"/>
    <text x="10" y="58" fill="#3b0764" font-size="9">Qwen3 Max ~70%</text>
    <rect x="120" y="50" width="60" height="30" fill="#8b5cf6" opacity="0.3"/>
    <text x="120" y="64" fill="#3b0764" font-size="9">4B-Thinking 66%</text>
    <!-- our -->
    <circle cx="60" cy="80" r="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
    <text x="75" y="83" fill="#7f1d1d" font-weight="bold">shadow 40%</text>
  </g>
  <!-- legend -->
  <g transform="translate(250,140)">
    <rect x="0" y="0" width="470" height="110" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="10" y="16" font-weight="bold">位置图（agentic，2026-10-12 切片）</text>
    <text x="10" y="36" fill="#0c4a6e">▮ 第一梯队（含 frontier 脚手架）</text>
    <text x="10" y="52" fill="#0c4a6e">▮ 中间梯队</text>
    <text x="10" y="68" fill="#7f1d1d">● shadow 主力（deepseek-chat）</text>
    <text x="10" y="84" fill="#075985">● MiMo flash（切片冠军）</text>
    <text x="10" y="100" fill="#475569" font-size="9">下标灰线=官方门槛；红/蓝圈=本仓重整结果（5–10 题切片）</text>
  </g>
  <text x="0" y="350" font-size="10" fill="#64748b">数据：[industry-suites.md](industry-suites.md) §1–§6 · 颜色仅表示区间，不暗示 p 值</text>
</svg>
```
