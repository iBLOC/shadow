# workflow-trace JDM dual representation (2026-10-15)

## 背景

用户引用 gorules/zen 决策引擎作为 flow/workflow 实现参考。
评估后**不集成** zen（见 `gorules-zen-eval-2026-10-15.md`）：
- zen 是决策引擎（业务规则），我们是工作流引擎（agent 调度），不同问题
- GoRules 治理不接受代码贡献，集成即锁定
- 我们的 flow 已经够用（4 crate 17 测试通过 + solidify 链路）

但 zen 的**JDM 双表达设计思路值得借鉴**——同一个 Workflow 同时支持
graph 和 prose 两种表达供不同读者使用。

## 实现

在 `telencephalon/crates/workflow-trace/src/lib.rs` 加 2 个方法（纯 shadow 工作区
闭环，不引外部依赖）：

- `ExecutionTrace::to_jdm_prose()` — 人类可读 markdown narrative
  ```
  # 部署流程
  _outcome: success_ — _started 2026-10-15T..._

  ## Step 1 — agent:a2a:tiangong
  天工生成官网原型
  _(duration: 12 ms, status: ok)_

  ## Step 2 — vision:mage_vl
  截图检查首页渲染
  _(duration: 8 ms, status: ok)_
  ```

- `ExecutionTrace::to_jdm_graph()` — 节点/边列表，可被 `solidify()` 流程消费
  重建 `workflow_schema::Workflow`
  ```
  # graph for 部署流程
  nodes:
    {"id":"step-0","kind":"agent:a2a:tiangong","action":"..."}
  edges:
    {"from":"step-0","to":"step-1"}
  ```

## 测试

`workflow-trace` 现在 9/9 测试绿（5 原 + 4 新）：
- `jdm_prose_renders_title_status_and_steps` — 3 步 trace prose 完整字段
- `jdm_prose_marks_failure_and_handles_empty_steps` — 失败 + 空 trace 边界
- `jdm_graph_emits_nodes_and_sequential_edges` — 3 步 → 3 节点 + 2 顺序边
- `jdm_graph_handles_empty_trace` — 空 trace 不会产生 step- 行

## 验证

```bash
cd telencephalon
RUST_MIN_STACK=16777216 cargo test -p workflow-trace
# 9 passed; 0 failed
```

`cargo check -p telencephalon --features flow` 也 0 error。

注意：完整 `cargo test` 整 workspace 有 2 个 pre-existing 错（`reqsign_aliyun_oss`
+ `opendal_service_s3` rlib 找不到）——与本会话 JDM 改动**无关**，是 feature gating
配错的历史问题，不修。
