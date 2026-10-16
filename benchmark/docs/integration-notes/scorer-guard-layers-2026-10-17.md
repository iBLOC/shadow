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
[4] (deferred) 工作树检查 — 检查 pf-delta/secret.txt 内容是否真含 expected
    — 不在 bench harness, 走 git2 或 worktree 层面, deferred
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

## 测覆盖

- scorer::gaia_match_tests — 7 测
- scorer::hallucination_tests — 4 测
- runner::disk_check_tests — 5 测
- scorer::tests (exact-match / contains) — 16 测
- 总 36 测，0 fail

## 留作 deferred (未做)

- **L4 工作树验证**：检查 `pf-delta/secret.txt` 内容真的含 expected 字符串
  —— 需 runner 装 git2 或 worktree 抽象；当前守门只检查"文件存在"，
  未检查"内容正确"。攻击向量：模型写任意内容也通过 disk check。
- **Expanded hallucination patterns**：目前的 24 个短语是英文 + 简单中文，
  多语种 / 隐喻说法 / JSON 工具调用未覆盖。
- **bench 端 log trace**：RunOutcome.answer 字段是 32 KiB 截断，
  不含 reasoning token（<think>...</think>），完整审计需扩字段。
