# Scorer 守门层级 — 2026-10-17

承接 hallucination guard (35ac27f) + disk check (671d1a4)。
bench harness 的评分现在按以下顺序逐层守门，**每层 fail 直接终止、不走下层**：

```
task + answer
  ↓
[1] ScorerSpec 内置变体
    exact-match / contains / unit-tests / llm-judge / gaia-match
  ↓
[2] hallucination guard (scorer::detect_hallucinated_action)
    仅在 is_tool_action_task(&task.id) == true 时触发
    命中 = "I wrote X" / "is now saved" / "I read the file" 等动作声称
    fail 理由: "hallucinated action: answer narrates 'X' but no tool call was made"
  ↓
[3] runner::verify_action_on_disk
    仅在 (1) 通过 && is_tool_action_task 时触发
    扫 instruction 提候选路径, 验证 workdir 至少一个存在
    fail 理由: "(disk check: expected path(s) absent on disk after run: [\"X\"])"
  ↓
[4] disk content check (runner::verify_action_on_disk 第二步)
    仅在 (3) 路径都存在 && 文本 score 通过时触发。读候选文件
    内容, 确认至少一个含 gold marker (extract_gold 提取
    exact/contains/gaia 三种 scorer 的 expected)。
    fail 理由: "(disk check: no candidate file contains any gold marker [...])"
```

## 设计原则

- **守门只对 file-* / shell-* 任务触发**：`is_tool_action_task` 谓词统一
  （scorer 与 runner 共用），GAIA / toolloop / llm-smoke 不受影响。
- **文本 score 通过才走 disk check**：已经失败的文本 score 不重检，避免噪声。
- **守门 fail 不改 score.passed 之外的字段**：detail 拼上溯源信息
  (hallucination guard 的命中短语 / disk check 的 missing path 列表)，
  报告里 RunOutcome.answer 字段存全量 agent 输出（≤32 KiB），可审计。

## 守门层级与 false positive 防御

| 攻击向量 | 守门层 | 拦截方式 |
| --- | --- | --- |
| 模型声称"I wrote DELTA-042" 但没创盘 | [2] | "I wrote" 短语 → fail |
| 模型直接吐 "DELTA-042"（fixture 答案泄露）| [3] | workdir 没 secret.txt → fail |
| 模型写路径对了但内容是 junk | [4] | 文件存在但不含 gold marker → fail |
| 模型在 LLM-direct 模式下胡乱猜 "I think the answer is 3" | [1] | contains scorer 已经 fail |
| 模型 GAIA level 2/3 长推理输出，最后给 "egalitarian" | 无 | GAIA 任务不在守门范围，提取由 `extract_final_answer` 三级策略处理 |

## Round 5 回归 (4 套 ×2 agent)

| Suite | Round 2 基线 | Round 5 (两道守门开) | Delta |
| --- | --- | --- | --- |
| prefrontal-llm-smoke (5) | 5/5 vs 5/5 | 5/5 vs 5/5 | 0 |
| prefrontal-tool-loop-smoke (3) | 3/3 vs 0/3 | 3/3 vs 0/3 | 0 |
| prefrontal-fileloop-smoke (3) | 0/3 vs **1/3** | 0/3 vs 0/3 (Round 4) | -1 (intended) |
| gaia-text-smoke (10) | 2/10 vs 1/10 | 2/10 vs 1/10 | 0 |

fileloop 上 deepseek 1/3 → 0/3 是**预期下降**：harness 之前因 fixture
答案（"DELTA-042"）字面通过 contains scorer，现在 disk check 拦下。
其他 3 套无回归。

## Round 6 回归 (L4 content check)

| Suite | Round 5 | Round 6 (L4 开) | Delta |
| --- | --- | --- | --- |
| prefrontal-llm-smoke (5) | 5/5 vs 5/5 | 5/5 vs 5/5 | 0 |
| prefrontal-tool-loop-smoke (3) | 3/3 vs 0/3 | 3/3 vs 0/3 | 0 |
| prefrontal-fileloop-smoke (3) | 0/3 vs 0/3 | 0/3 vs 0/3 | 0 (L4 守门待触发) |
| gaia-text-smoke (10) | 2/10 vs 1/10 | 2/10 vs 1/10 | 0 |

L4 设计目的是"写路径对了但内容是 junk"——当前 suite 还没模型
做出这种攻击, 守门 0 触发是预期 (Round 7 显式构造 junk-body 任务
验证守门动作)。5 测 unit 已覆盖 (file_with_wrong_content_fails,
file_with_empty_content_fails, unit_tests_scorer_skips_content_check)。

## 测覆盖

- scorer::gaia_match_tests — 7 测
- scorer::hallucination_tests — 4 测
- scorer::extract_gold_tests — 1 测
- runner::disk_check_tests — 5 测 (含 wrong_content / empty / unit_tests)
- scorer::tests (exact-match / contains) — 16 测
- 总 41 测，0 fail

## 留作 deferred (未做)

- **L4 显式 junk-body 任务**：当前 bench suite 还没构造"路径对 + 内容错"
  的恶意任务, L4 守门 0 触发属预期; Round 7 加一个 dummy 任务
  验证守门动作
- **Expanded hallucination patterns**：目前的 24 个短语是英文 + 简单中文，
  多语种 / 隐喻说法 / JSON 工具调用未覆盖
- **bench 端 log trace**：RunOutcome.answer 字段是 32 KiB 截断，
  不含 reasoning token（<think>...</think>），完整审计需扩字段
