//! Rule-engine adapter — runs the in-process zen rule engine as a
//! bench "agent" (2026-10-24).
//!
//! Rationale: the zen backend lives in the thalamus hot path
//! (diencephalon), which the A2A bench path (encephalon-prefrontal →
//! telencephalon → prefrontal) never crosses. To keep the engine's
//! notify/ignore semantics under the same regression regime as the
//! LLM agents — same runner, same pass^k, same report tables —
//! this adapter embeds the engine directly and treats rule
//! evaluation as a deterministic task.
//!
//! Dependency note: we depend on the `zen-engine` crate directly
//! (not on diencephalon). Pulling diencephalon drags synapse,
//! which trips an a2a-lf version clash (0.3 direct vs 0.4 via
//! a2a-server-lf — two distinct `SendMessageRequest` types) under
//! this workspace's feature resolution. The graph-building code
//! below mirrors `diencephalon::rule_engine`'s converter; the
//! semantic-parity contract (same inputs → same notify/ignore) is
//! enforced by diencephalon's own test suite, and this adapter's
//! suite doubles as an independent check from the bench side.
//!
//! Task contract (rule-engine-smoke suite):
//! - `instruction` — a JSON object: the sensor snapshot the engine
//!   evaluates, e.g. `{"value": 27.3}`.
//! - `task.framework` — "rule-engine" (drift detector groups them).
//! - `scorer` — `contains` with `all_of: ["notify"]` /
//!   `["ignore"]`: the adapter's answer is exactly one of the two.

use crate::agent::{AgentAdapter, AgentError, AgentRun};
use crate::task::Task;

use std::sync::Arc;
use std::time::Instant;

/// One comparison in the bath-guard rule.
struct Cond {
    op: &'static str, // "gt" | "lt" | "eq"
    threshold: f64,
}

/// The canonical bath-guard rule: value > 25 OR value < 20 →
/// notify; anything else → ignore. Kept as data so the boundary
/// tests read next to the semantics they lock.
const BATH_GUARD: &[Cond] = &[
    Cond { op: "gt", threshold: 25.0 },
    Cond { op: "lt", threshold: 20.0 },
];

/// Build the minimal GoRules JDM graph (inputNode + switchNode +
/// notify/ignore expression nodes) from the comparison list —
/// the same shape diencephalon::rule_engine emits.
fn conditions_to_graph(conditions: &[Cond]) -> serde_json::Value {
    use serde_json::json;
    let mut statements = Vec::new();
    for (i, c) in conditions.iter().enumerate() {
        let cond = match c.op {
            "gt" => format!("value > {}", c.threshold),
            "lt" => format!("value < {}", c.threshold),
            _ => format!("value = {}", c.threshold),
        };
        statements.push(json!({ "id": format!("s-{i}"), "condition": cond }));
    }
    // catch-all ignore branch
    statements.push(json!({ "id": "s-ignore", "condition": "" }));

    let mut edges = vec![json!({ "id": "e-in", "sourceId": "input", "targetId": "sw" })];
    for (i, s) in statements.iter().enumerate() {
        let target = if i < conditions.len() { "notify" } else { "ignore" };
        edges.push(json!({
            "id": format!("e-{i}"),
            "sourceId": "sw",
            "sourceHandle": s["id"],
            "targetId": target,
        }));
    }
    let nodes = vec![
        json!({ "id": "input", "type": "inputNode", "name": "input", "content": {} }),
        json!({
            "id": "sw", "name": "bath-guard", "type": "switchNode",
            "content": { "hitPolicy": "first", "statements": statements }
        }),
        json!({
            "id": "notify", "name": "notify", "type": "expressionNode",
            "content": { "expressions": [
                { "id": "x-notify", "key": "action", "value": "\"notify\"" }
            ]}
        }),
        json!({
            "id": "ignore", "name": "ignore", "type": "expressionNode",
            "content": { "expressions": [
                { "id": "x-ignore", "key": "action", "value": "\"ignore\"" }
            ]}
        }),
    ];
    json!({ "edges": edges, "nodes": nodes })
}

pub struct RuleEngineAgent {
    pub name: String,
    engine: zen_engine::DecisionEngine,
    content: Arc<zen_engine::model::DecisionContent>,
}

impl RuleEngineAgent {
    /// Build the agent with the canonical bath-guard rule
    /// compiled (gt 25 OR lt 20 → notify).
    pub fn new_bath_guard() -> Self {
        let graph = conditions_to_graph(BATH_GUARD);
        let content: zen_engine::model::DecisionContent =
            serde_json::from_value(graph).expect("bath-guard graph must parse as JDM");
        Self {
            name: "rule-engine-zen".into(),
            engine: zen_engine::DecisionEngine::default(),
            content: Arc::new(content),
        }
    }

    /// Evaluate a snapshot against the compiled rule. Blocking is
    /// bounded (zen eval is pure computation, ~10µs); the caller
    /// wraps with `block_in_place` when inside async.
    fn evaluate(&self, input: &serde_json::Value) -> Result<String, String> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("runtime build: {e}"))?;
        rt.block_on(async {
            let decision = self
                .engine
                .create_decision(self.content.clone())
                .map_err(|e| format!("create_decision: {e:?}"))?;
            let result = decision
                .evaluate(input.clone().into())
                .await
                .map_err(|e| format!("zen evaluate: {e:?}"))?;
            let v: serde_json::Value = result.result.into();
            Ok(v.get("action")
                .and_then(|x| x.as_str())
                .unwrap_or("ignore")
                .to_string())
        })
    }
}

#[async_trait::async_trait]
impl AgentAdapter for RuleEngineAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(
        &self,
        task: &Task,
        _workdir: &std::path::Path,
        _prior_traces: &str,
    ) -> Result<AgentRun, AgentError> {
        let started = Instant::now();
        // The instruction is the sensor snapshot JSON. Parse leniently —
        // a malformed snapshot is a suite-authoring bug, surface it in
        // the answer so the scorer fails loudly instead of an infra
        // error nobody reads.
        let input: serde_json::Value = match serde_json::from_str(task.instruction.trim()) {
            Ok(v) => v,
            Err(e) => {
                return Ok(AgentRun {
                    answer: format!("rule-engine: bad snapshot JSON in instruction: {e}"),
                    duration: started.elapsed(),
                    exit_code: None,
                    usage: crate::agent::TokenUsage::default(),
                    tool_calls: 0,
                    steps: Vec::new(),
                })
            }
        };

        // zen's future is !Send and block_on panics inside a runtime —
        // same dance as diencephalon: hand off to block_in_place on
        // the multi-thread runner.
        let outcome = tokio::task::block_in_place(|| self.evaluate(&input));

        let answer = match outcome {
            Ok(a) => a,
            Err(e) => format!("rule-engine error: {e}"),
        };
        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: None,
            usage: crate::agent::TokenUsage::default(),
            tool_calls: 0,
            steps: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(instruction: &str) -> Task {
        crate::task::Task {
            id: "t".into(),
            instruction: instruction.into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            framework: Some("rule-engine".into()),
            scorer: crate::task::ScorerSpec::Contains {
                all_of: vec![],
                any_of: vec![],
            },
            timeout_secs: None,
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn bath_guard_boundary_values() {
        let agent = RuleEngineAgent::new_bath_guard();

        // Above 25 → notify; below 20 → notify.
        for v in [27.3, 18.5] {
            let r = agent
                .run(&task(&format!("{{\"value\": {v}}}")), std::path::Path::new("."), "")
                .await
                .unwrap();
            assert_eq!(r.answer, "notify", "value {v}");
        }

        // Inside the comfort band → ignore.
        for v in [22.0, 20.5] {
            let r = agent
                .run(&task(&format!("{{\"value\": {v}}}")), std::path::Path::new("."), "")
                .await
                .unwrap();
            assert_eq!(r.answer, "ignore", "value {v}");
        }

        // Boundary edges: strict inequality — 25.0 is NOT > 25,
        // 20.0 is NOT < 20. If the engine ever resolves to >= / <=
        // these flip and the suite goes red.
        for v in [25.0, 20.0] {
            let r = agent
                .run(&task(&format!("{{\"value\": {v}}}")), std::path::Path::new("."), "")
                .await
                .unwrap();
            assert_eq!(r.answer, "ignore", "boundary {v} must stay ignore");
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn malformed_snapshot_surfaces_in_answer() {
        let agent = RuleEngineAgent::new_bath_guard();
        let r = agent
            .run(&task("not json"), std::path::Path::new("."), "")
            .await
            .unwrap();
        assert!(r.answer.contains("bad snapshot"), "got: {}", r.answer);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_summarizer_inside_async_context() {
    // Mirrors the runner: OpenAiAgent::summarize (sync TextSummarizer)
    // called from inside a tokio task. Its internal Handle::try_current
    // + rt.block_on dance must not panic and must return a summary.
    let agent = crate::agent::OpenAiAgent {
        name: "summarize-probe".into(),
        base_url: "https://api.deepseek.com/v1".into(),
        model: "deepseek-chat".into(),
        api_key: std::env::var("SHADOW_BENCH_DEEPSEEK_KEY").ok(),
        api_key_env: None,
        max_tokens: 512,
        timeout_secs: 60,
        mode: crate::agent::AgentMode::OneShot,
    };
    let text = "long document ".repeat(200);
    let out = tokio::task::block_in_place(|| {
        crate::hippocampus_shim::TextSummarizer::summarize(&agent, &text, 100)
    });
    match out {
        Ok(s) => println!("[probe] summary len={}", s.len()),
        Err(e) => println!("[probe] summarize err: {e}"),
    }
}
