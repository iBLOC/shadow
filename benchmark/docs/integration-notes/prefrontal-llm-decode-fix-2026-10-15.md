# prefrontal 仓库 LLM decode fix — PR 草稿 (2026-10-15)

## 背景

shadow benchmark 的目标是测被测物（shadow-desktop / 大脑独立栈）。要让
大脑独立栈真跑分，需要至少一个 lobe 真服务（不是占位）通过端脑 A2A
gateway 路由到。

实测链路 2026-10-15 14:30 之前已 100% 通过：

1. lobe_cache 接受 `prefrontal-real` 真 lobe（external kind, 3 skills）
2. 端脑 client.rs method name `tasks/send`、message wire `parts[]`、`type: "Text"` 全部对齐 prefrontal a2a_handler.rs
3. 端脑 extract_skill 兼容 3 种 metadata 路径
4. prefrontal a2a_handler.rs:161 接受 `tasks/send` + 触发 `handle_task`（日志确认）

**最后阻塞**：prefrontal 内部 OpenAI provider 调 LLM 失败 ——
`Error: error decoding response body`，**`agent.process_with_tools` 抛错被 `unwrap_or_else` 转成字符串**（prefrontal/src/server/a2a_handler.rs:54）。

这意味着 prefrontal 调到了 deepseek（deepseek 直接 curl 验证 200 OK + 56 答案正常），但 provider 反序列化响应失败。猜测：deepseek 静默把 `deepseek-chat` alias 映射为 `deepseek-flash`（直接 curl 看到 `"model":"deepseek-flash"`），prefrontal OpenAI provider 的响应结构对 `logprobs=null` 或 `system_fingerprint` 字段可能未设置时报严格反序列化错。

**shadow 工作区**无 prefrontal-core_lib 源码（私有 git submodule）——无法在
shadow 端写 patch 直接编译验证。**本文件是给 prefrontal 仓库的 PR 草稿**。

## PR 标题

`fix(a2a_handler): gracefully handle LLM decode errors and tolerate deepseek response fields`

## 目标

1. 即使 LLM provider 反序列化失败，任务仍返回字符串化的错误而非整个
   服务 5021 + 抛错——bench 可观察"被测物内部 LLM 故障"而非误判
   A2A 协议错
2. 放宽 OpenAI provider 对 `logprobs: Option<…>` 为 `None` 的容错
3. 允许 `system_fingerprint` 字段缺失

## 建议修改点

### 修改 1 — a2a_handler.rs:54（最优先，必须做）

```rust
// 当前（prefrontal/src/server/a2a_handler.rs:54）:
let agent_response = if let Some(agent) = self.state.get_agent() {
    agent.process_with_tools(&session, &user_message).await.unwrap_or_else(|e| {
        format!("Error: {}", e)
    })
} else {
    "Agent not configured".to_string()
};
```

**问题**：unwrap_or_else 把 error 转成字符串是对的，但 provider 的
`error decoding response body` 是**单个错误被泛化为字符串**，丢了上下文
（是哪个字段解码失败、原始 payload 是什么）。

**建议改法**：

```rust
let agent_response = if let Some(agent) = self.state.get_agent() {
    match agent.process_with_tools(&session, &user_message).await {
        Ok(resp) => resp,
        Err(e) => {
            // Surface the error category + a one-line hint for the bench
            // telemetry — never abort the task itself.
            tracing::warn!(task_id = %task_id, error = %e, "agent.process_with_tools failed");
            format!("[agent_error] {}", short_err_chain(&e))
        }
    }
} else {
    "Agent not configured".to_string()
};
```

加 `short_err_chain` helper 把 `reqwest::Error → serde_json::Error → ...`
的 chain 第一帧提出来（避免序列化 `Display` 把整条 source code 倒出来）。

### 修改 2 — prefrontal-core_lib OpenAI provider 响应结构（次优先）

文件位置（prefrontal 仓内，shadow 不可见）：
`prefrontal-core_lib/src/llm/openai_provider.rs` 或类似

**响应结构示例**（deepseek 实际返回）：
```json
{
  "id": "c1870e96-...",
  "object": "chat.completion",
  "created": 1792044562,
  "model": "deepseek-flash",       // ← deepseek 静默重映射
  "choices": [{...}],
  "usage": {...},
  // 缺: logprobs (null)、system_fingerprint
}
```

**问题**：OpenAI provider 响应 struct 用 `Deserialize` 严格模式，缺字段时报
`missing field 'logprobs'` 或 `unknown variant`。

**建议改法**：

```rust
#[derive(Deserialize)]
struct OpenAiChatResponse {
    id: String,
    object: String,
    created: i64,
    model: String,
    choices: Vec<Choice>,
    usage: Option<Usage>,
    #[serde(default)]
    system_fingerprint: Option<String>,
}

#[derive(Deserialize)]
struct Choice {
    index: u32,
    message: ResponseMessage,
    finish_reason: Option<String>,
    #[serde(default)]
    logprobs: Option<serde_json::Value>,  // 不解析具体结构
}

#[derive(Deserialize)]
struct ResponseMessage {
    role: String,
    content: String,
    #[serde(default)]
    refusal: Option<String>,
}
```

关键点：
- 所有可选字段加 `#[serde(default)]` + `Option`
- `logprobs` 改为 `serde_json::Value`（不解析具体结构）
- `model` 字段不再 hard-code `gpt-4` 系列（deepseek 会返回 `deepseek-flash`）

## 验证步骤

1. 在 prefrontal 仓打 patch，重新 `cargo build --release --bin prefrontal`
2. 用之前 14:30 起的 prefrontal v2 命令（带 `--api-base https://api.deepseek.com/v1`）
3. curl 验证：

   ```bash
   curl -X POST http://127.0.0.1:18082/api/a2a \
     -H "content-type: application/json" \
     -d '{"jsonrpc":"2.0","id":"t1","method":"tasks/send",
          "params":{"id":"t1",
                    "message":{"role":"user",
                              "parts":[{"type":"Text","text":"7*8"}]}}}'
   ```

   期望：返回 `"result.history[1].parts[0].text": "56"`（不再是
   `"Error: Request error: error decoding response body"`）

4. 在端脑（已带 v0.2 wire）上跑 `bench run --only brain-a2a`：
   完整 A2A 链路从脑 → prefrontal → deepseek → 回答案

## 端到端联调笔记

- 端脑 8082 lobe_cache 现在接受任意名 external lobe（kind=external, endpoint, skills 数组）
- 端脑 client.rs 已修 v0.2 wire 全部一致
- 端脑 extract_skill 兼容 3 种 metadata 路径
- prefrontal 旧 `register_with_encephalon` 路径 404（synapse client 用的路径
  不存在）——直接用 `POST /api/telencephalon/admin/agents/register` curl
  注册即可
- deepseek 静默把 `deepseek-chat` → `deepseek-flash` 映射（`/v1/chat/completions`），prefrontal provider 必须用 `serde_json::Value` 而非结构体

## 相关

- shadow 端: docs/benchmark-positioning.md §3 "2026-10-15 真 lobe 注册 + 协议打通实验"
- shadow 端: docs/industry-suites.md（深度集成绩表）
- shadow 仓 cortex-store: bench suite ta2z2 入口`/api/flows/traces/ingest` 是
  trace 摄取入口，与此 lobe 链路独立
- prefrontal 仓: `prefrontal-core_lib/src/llm/openai_provider.rs`（具体文件
  路径可能需要 grep `OpenAiProvider` 实际位置）
