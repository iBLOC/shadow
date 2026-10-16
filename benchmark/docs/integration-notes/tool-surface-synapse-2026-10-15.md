# 通用工具沉淀到 synapse — 实施报告 (2026-10-15)

## 背景

用户 2026-10-15："可服用的工具可以沉淀到 synapse 中"——使工具定义与各 lobe 实现
解耦，synapse 作为共享工具池；lobe 通过 synapse::tools::* 获取（prefrontal 后续
改 re-export 即可）。

## 完成项

`telencephalon/crates/synapse/src/tools/mod.rs`（旧骨架 → 完整实现，~700 行）：

- 沉淀 `Tool` trait + 5 支撑类型（`ToolError` / `ToolOutput` / `ToolMetadata` /
  `ToolRateLimitConfig` / `ToolDomain` / `ApprovalRequirement` / `ApprovalContext`）
  — 从 prefrontal 迁来
- `ToolRegistry` 接口与 prefrontal 兼容（`registry.register(tool)` / `execute(call)` 等）
- 4 个**大脑层通用工具**（跨平台、无设备依赖）：
  - `EchoTool`（round-trip 自检）
  - `TimeTool`（iso / unix / human 格式，human 用 chrono 原生 `%Z` 替代 chrono-tz 依赖）
  - `JsonTool`（JSON pointer 提取 + pretty print）
  - `HttpTool`（get/post/put/delete，body 截 8192 字节）
- 16 个单测全绿（synapse lib 84 测总）

## 设计决策

1. **synapse 是工具的宿主**——所有 trait + 4 工具放在 `synapse::tools` 模块，
   prefrontal 复用同一份实现（避免反向依赖）
2. **不引 chrono-tz**——time 工具的 human 格式用 chrono 原生 `%Z` 输出，
   减少依赖体积（prefrontal v0.x 用了 chrono-tz 是历史依赖；synapse 不
   需要这个能力）→ **2026-10-16 修订**：为保持行为等价（bench 套件
   `tool-time-human-format` 需要 `timezone=Asia/Shanghai` → `CST`），迁入时
   补回 chrono-tz。理由：沉淀的目标是行为不变，依赖体积是次要考虑。
3. **设备层工具不在这**——shell/file/mobile_sensor 走 desktop 授权体系
   （与 2026-10-15 用户架构定调一致）

## prefrontal 端落地（2026-10-16 已执行）

实际采用比"直接 re-export"更薄的方案——**适配器 + 具名包装**（好处：调用面
零改动、错误类型显式桥接、本地工具与 synapse 工具可同 registry 共存）：

1. 删 `prefrontal/src/tools/builtin/{echo,time,json,http}.rs`（4 文件）
2. `builtin/mod.rs` 新增 `SynapseTool<T>` 适配器（`synapse::tools::Tool` →
   本地 `crate::tool::Tool`），并用 `synapse_tool!` 宏生成 4 个具名包装类型
   ——`EchoTool::new()` / `TimeTool::new()` 等调用点**保持不变**（`main.rs`、
   `src/mobile/mod.rs` 零改动）
3. `error.rs`：`impl From<synapse::tools::ToolError> for PrefrontalError`
   （原选项 B——消息原文透传，不丢分类信息）
4. `agent.rs` 无需改动（本地 `Tool` trait 保形；未走"signature 改
   synapse::tools::Tool"的路线）

行为等价补丁（迁移中发现，synapse 侧已同步）：
- **echo**：接受 `text`（旧 key，required）与 `message`（alias）双键
- **time**：补 `timezone`（IANA）参数 + human 格式 `%Y-%m-%d %H:%M:%S %Z`，
  并把 `details`（timezone/utc/unix）写入 output metadata（与旧实现一致）
- **json**：schema 保留旧 `{action, data}`（validate/format/minify/parse）
  与新增 `{value, pointer}` 双形态——旧 trace / 系统提示词里的 `action` 调用
  不会被破坏

## 验证（2026-10-16）

- synapse `cargo test --lib`：302 通过（其中 `tools::` 18 测）
- prefrontal `cargo test --lib`：311 通过，1 失败 = `sandbox::tests::
  test_wasm_sandbox_load_and_execute`（wasm sandbox，pre-existing，
  与本次工具迁移无关）
- v13 构建（target-acp release + acp feature）→ :18082 启动
- 直连 `/api/a2a`：`7*8` → `56` ✓（与 v12 一致）
- 端脑网关全链路（`POST :8082/a2a/tasks/send`，skill=task_execution）：
  - time + timezone=Asia/Shanghai → `2026-10-16 17:42:00 CST` ✓
  - today → `2026-10-16` ✓ / year → `2026` ✓
  - legacy json `action=format` → pretty JSON ✓
  - plain arithmetic → `56` ✓

## 影响

- 工具代码复用 100%（prefrontal 4 个 builtin 删，synapse 同款）
- 未来桌面 lobe（如 shell/file）也可注册到同一 `ToolRegistry`
- 测试覆盖加在 synapse 一次性，prefrontal 自动受益
