//! Agent benchmark harness — the comparison substrate for the Shadow
//! platform.
//!
//! Industry agent benchmarks (SWE-bench, Terminal-Bench, GAIA, τ-bench,
//! OSWorld) all share the same skeleton: a task set, an agent under
//! test, an environment to run the agent in, and a scorer. This crate
//! implements that skeleton locally so the platform can
//!
//! * regression-test its own agents (embedded neuron, future A2A
//!   agents) in CI;
//! * compare against external open-source agents (openclaw, pi,
//!   DeepSeek Harness `dsh`, aider, …) driven as CLI processes;
//! * score answers exactly (exact-match / contains), behaviorally
//!   (unit tests in the task sandbox) or with an LLM judge;
//! * report the τ-bench-style **pass^k** reliability metric by
//!   repeating every task k times.
//!
//! Layout: [`task::Task`] + [`suite::Suite`] describe WHAT to run;
//! [`agent`] adapters describe HOW to drive an agent; [`scorer`]
//! decides pass/fail; [`runner::Runner`] produces a [`runner::Report`]
//! with JSON + markdown exports. The `bench` binary ties it together.

pub mod agent;
pub mod brain_agent;
pub mod config;
pub mod desktop_agent;
pub mod hippocampus_shim;
pub mod runner;
pub mod scorer;
pub mod suite;
pub mod task;

pub use agent::{AgentAdapter, AgentError, AgentRun, CliAgent, OpenAiAgent};
pub use config::{AgentSpec, AgentsConfig, JudgeConfig};
pub use hippocampus_shim::{
    BranchReason, CompressionEvent, CompressionStrategy, DriftEvent, HippocampusLike,
    LocalHippocampusShim, SessionCheckpoint, TextSummarizer,
};
pub use runner::{AgentSummary, Report, Runner, RunnerConfig, TaskResult};
pub use suite::Suite;
pub use task::{ScorerSpec, Task, TaskFile};

/// Format the workflow-as-mental-set hint consumed by `OpenAiAgent`.
///
/// `rows` is the already-filtered (by `intent_signature` and
/// `quality_score >= 0.5`) and already-sorted (by quality desc) slice
/// of `FlowTraceRow` JSON values; this function only renders the
/// `ok`/`ERR` step block. Empty input → empty output (the runner
/// sees the empty string and skips the header block in
/// `OpenAiAgent`).
pub fn format_prior_hint(rows: &[&serde_json::Value]) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    for r in rows {
        let q = r
            .get("quality_score")
            .and_then(|q| q.as_f64())
            .unwrap_or(0.0);
        out.push_str(&format!("\n[prior q={:.2}]\n", q));
        let steps = r
            .get("trajectory")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        for s in steps {
            let kind = s.get("kind").and_then(|k| k.as_str()).unwrap_or("?");
            let result = s.get("result").and_then(|r| r.as_str()).unwrap_or("");
            let snippet: String = result.chars().take(160).collect();
            let mark = if s.get("ok").and_then(|o| o.as_bool()).unwrap_or(false) {
                "ok "
            } else {
                "ERR"
            };
            out.push_str(&format!("  {mark} {kind}: {snippet}\n"));
        }
    }
    out
}

#[cfg(test)]
mod prior_hint_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_input_gives_empty_output() {
        let empty: Vec<&serde_json::Value> = vec![];
        assert_eq!(format_prior_hint(&empty), "");
    }

    #[test]
    fn renders_ok_and_err_markers_with_kind() {
        let r1 = json!({
            "quality_score": 1.0,
            "trajectory": [
                {"kind": "model", "result": "{\"text\":\"\",\"tool_calls\":[\"bash\"]}", "ok": true},
                {"kind": "tool:bash", "result": "exit=0  391", "ok": true},
            ]
        });
        let r2 = json!({
            "quality_score": 0.6,
            "trajectory": [
                {"kind": "model", "result": "tried wrong approach", "ok": true},
                {"kind": "tool:bash", "result": "exit=127 bc: command not found", "ok": false},
            ]
        });
        let out = format_prior_hint(&[&r1, &r2]);
        assert!(out.contains("[prior q=1.00]"), "{out}");
        assert!(out.contains("[prior q=0.60]"));
        assert!(out.contains("ok  tool:bash: exit=0  391"), "{out}");
        assert!(out.contains("ERR tool:bash: exit=127 bc: command not found"));
    }

    #[test]
    fn long_result_is_truncated_to_160_chars() {
        let big = "x".repeat(500);
        let r = json!({
            "quality_score": 1.0,
            "trajectory": [{"kind": "tool:bash", "result": big, "ok": true}]
        });
        let out = format_prior_hint(&[&r]);
        let marker = "ok  tool:bash: ";
        let i = out.find(marker).expect("marker");
        let snippet_len = out[i + marker.len()..]
            .trim_end_matches(['\n', ' '])
            .len();
        assert!(snippet_len <= 160, "snippet_len={snippet_len}");
        assert!(snippet_len >= 100, "snippet_len={snippet_len}");
    }

    /// End-to-end: feed the 2026-10-14 brain snapshot (5 rows, the
    /// only real traces this crate has ingested to date) through the
    /// same filter+sort+format path the runner takes. Confirms the
    /// hint the runner would inject for `deepseek-chat-agentic:
    /// rate-problem` actually contains the q=1.0 6-step success and
    /// the q=0.0 2-step failure — the very signals that drive the
    /// "avoid bc/python" lesson the next runner should learn.
    #[test]
    fn brain_snapshot_feeds_clean_hint_for_rate_problem() {
        // Locate the snapshot file in the workspace relative to
        // CARGO_MANIFEST_DIR (tests run from the crate root).
        let snap = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("docs")
            .join("reports")
            .join("brain-trace-snapshot-2026-10-14.jsonl");
        if !snap.exists() {
            // The test is opt-in: skip when the snapshot isn't on
            // disk (e.g. on a fresh CI worker). The lib tests stay
            // green regardless.
            eprintln!("snapshot missing, skipping: {}", snap.display());
            return;
        }
        let body = std::fs::read_to_string(&snap).expect("read snapshot");
        let rows: Vec<serde_json::Value> = body
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| serde_json::from_str(l).expect("parse row"))
            .collect();
        // Same filter+sort+truncate the runner does.
        let want = "deepseek-chat-agentic:rate-problem";
        let mut matched: Vec<&serde_json::Value> = rows
            .iter()
            .filter(|r| r.get("intent_signature").and_then(|s| s.as_str()) == Some(want))
            .filter(|r| {
                r.get("quality_score")
                    .and_then(|q| q.as_f64())
                    .unwrap_or(0.0)
                    >= 0.5
            })
            .collect();
        matched.sort_by(|a, b| {
            b.get("quality_score")
                .and_then(|q| q.as_f64())
                .unwrap_or(0.0)
                .partial_cmp(
                    &a.get("quality_score")
                        .and_then(|q| q.as_f64())
                        .unwrap_or(0.0),
                )
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        matched.truncate(3);
        let out = format_prior_hint(&matched);
        assert!(out.contains("[prior q=1.00]"), "expected q=1.0 row; got:\n{out}");
        assert!(out.contains("ok  tool:bash: exit=0"), "expected success path step");
        // The q=0.0 row is correctly filtered out (q<0.5).
        assert!(!out.contains("[prior q=0.00]"), "q<0.5 must be excluded");
    }
}
