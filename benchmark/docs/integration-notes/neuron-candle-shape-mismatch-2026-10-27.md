# neuron candle 前向传播 shape mismatch — benchmark 现场捕获（未复现）

**日期**: 2026-10-27 晨
**严重度**: 中（间歇性，会把可答题变成错误输出，且错误文本直接进对话 UI）
**状态**: 未复现（现场 1 次，随后 3 次同题重跑全过）

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

## 关联

- 发现渠道：benchmark shadow-desktop 被测物首个完整跑分
  （benchmark-positioning.md §3，core-smoke 6/10）。
- 报告：`benchmark/reports-desktop-full/core-smoke-report.json`（sql
  条目 answer 字段保留了完整错误文本）。
- 顺带的第二个发现：letter-count 稳定答 '2'（正确 3）——0.6B 真实
  能力短板，非 bug。
