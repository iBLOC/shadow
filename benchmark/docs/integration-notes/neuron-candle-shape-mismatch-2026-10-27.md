# neuron candle 前向传播 shape mismatch — benchmark 现场捕获（未复现）

**日期**: 2026-10-27 晨
**严重度**: 中（间歇性，会把可答题变成错误输出，且错误文本直接进对话 UI）
**状态**: ✅ **已根因 + 已修复 + 端到端验证**（neuron `2bce199`；
桌面应用侧还差一步"锁文件更新"，见文末"验证"）

## 现场

shadow-desktop 被测物（`pnpm tauri dev` 真应用 + 嵌入 neuron :8085 +
candle 后端 + qwen3-0.6B）跑 core-smoke 的 `sql` 任务时，对话 UI 直接
渲染出引擎错误（desktop_agent 从 DOM 读回，成为"答案"）：

```
错误: engine execution error: not_implemented: forward pass 1: shape
mismatch in broadcast_add, lhs: [1, 14, 77, 135], rhs: [1, 1, 77, 77]
```

- 任务 prompt：`Given the table users(id, name, age), write a SQL
  query to select all users older than 18.`（77 token 左右，与形状里
  的 77 吻合——是 prompt 序列长度）
- **lhs [1, 14, 77, 135]**：14 ≈ qwen3-0.6B 注意力头数相关，135 异常
  （77 + 58？疑似 KV cache 或 position 插值张量）
- **rhs [1, 1, 77, 77]**：标准因果注意力 mask 形状
- 判定：qwen 前向 `broadcast_add(lhs, mask)` 走到了 candle 未实现的
  广播组合上。candle 的 `broadcast_add` 只支持逐维 1-扩展；[135] 对
  [77] 的尾维不匹配需要显式 slice/pad，运行时走了 not_implemented。

## 复现尝试

同任务 × 3（reports-desktop-sql-repro，2026-10-27 11:40）：
**3/3 通过**，答案逐字节一致（```sql SELECT * FROM users WHERE age >
18;```），耗时 149~165s。shape mismatch 未再出现。

## 推断（供 neuron 排查方向）

1. **非确定性** → 更像并发/缓存状态问题而非纯形状推导 bug：可能的
   触发条件是长会话后的 KV cache 复用（该任务是前 5 题跑完后的第
   6 题；复跑时是全新进程状态——不完全对齐，3 次重跑也在同一进程
   里，所以更可能是线程调度/内存布局相关的竞态）。
2. lhs 末维 135 的来源是关键线索：77(prompt) + 58 = 135，58 无明显
   含义；或 135 = 5×27。建议在 neuron 侧给
   `candle_nn::ops::broadcast_add` 调用点加形状日志后挂机复跑。
3. 影响面：错误文本被 conversation UI 当普通回复渲染。**建议应用侧
   把 `engine execution error` 前缀的消息走错误样式**，避免用户把
   引擎错误当模型回答。

## 根因（2026-10-27 晚些确认，已修复；并发假设已修正）

**先纠正本笔记早先的推断**：压测脚本（`tools/neuron_kv_race_stress.sh`
的并发模式）从未复现——模型锁把生成本来就串行化了，"reset→forward
空窗被并发请求插队"这个窗口实际不存在。真正的复现条件是**纯顺序
请求**：一条长生成之后紧跟 sql prompt，第二个请求的 prompt 前向
撞上第一个请求留下的缓存（`lhs: [1,14,24,43]` = 24 新 + 19 残留，
掩码按 24 建——同一 bug 的另一组数字）。

回到源码：`chat()` 的 reset 与 generate 是两段独立加锁，而
candle 上游 CPU 路径的注意力掩码由调用方的 `offset` 推导、契约是
"forward 时缓存必须为空"——顺序场景下 reset 与下一次 forward 之间
隔着上一请求**未走完**的解码循环（KV 条目 19 = 上一次的 prompt 17 +
生成 2，不是生成总数），残留被继承。`chat_stream` 全程持锁所以
幸免，只有非流式 `chat()` 中招。

**修复**：neuron `2bce199`（main）——reset 移进 generate 的同一
临界区，与 chat_stream 模式对齐；cargo test --lib 701 全绿。
压测脚本保留为回归探针（预期 0 mismatch）。

## 验证（2026-10-27 深夜）

修复合入 neuron `2bce199`（origin/main）后，**桌面应用并未自动拿到
修复**——shadow-desktop 的 `src-tauri/Cargo.lock` 把 neuron 钉在
`401f86c`（修复前），cargo 只在 lock 更新时才换 git rev。第一轮
"重建桌面应用"因此仍然复现（同样的 135=77+58）。

`cargo update -p neuron` → lock 指向 `311127d`（含修复）→ 重建 →

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 顺序请求 A（长生成）→ B（sql） | B 崩：135=77+58 | B **通过**（3/3 次） |
| desktop 被测物 core-smoke 的 sql 题 | 引擎错误（引擎 bug 伪装成模型答错） | **通过**（149.4s，正确 SQL） |
| desktop 被测物 core-smoke 总分 | 6/10（构成：3 题基础设施失败 + 3 题超时误杀） | 6/10（构成：1 题能力短板 + 3 题代码题能力上限） |

**分数没变，构成变了**：修复前那 6 分里混着"基础设施失败"（引擎错误 +
180s 超时误杀），修复后剩下的全是真实能力边界（0.6B 跑不动多步编辑）。
这正是 benchmark 要的东西——**分数必须只反映被测物的真实能力**。

**教训**：跨仓的依赖修复，落地前必须确认下游的 lock 是否指向新 rev；
"我推了 commit" ≠ "依赖方用上了"。

## 关联

- 发现渠道：benchmark shadow-desktop 被测物首个完整跑分
  （benchmark-positioning.md §3，core-smoke 6/10）。
- 报告：`benchmark/reports-desktop-full/core-smoke-report.json`（sql
  条目 answer 字段保留了完整错误文本）。
- 顺带的第二个发现：letter-count 稳定答 '2'（正确 3）——0.6B 真实
  能力短板，非 bug。
