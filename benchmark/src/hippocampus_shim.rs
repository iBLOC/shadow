//! Hippocampus shim — in-process implementation of the persistent
//! session-memory subsystem that the iBLOC stack hands off to a
//! real hippocampus service. The shim mirrors the trait shape
//! shadow-bench needs so the bench harness can drive a long agent
//! session (many tasks, accumulating `prior_traces`) without
//! coupling to hippocampus internals.
//!
//! Architecture context (2026-10-17, multi-turn design):
//!
//! - **hippocampus** = persistent session memory (this file). Owns
//!   `append` / `cumulative_tokens` / `maybe_compress` /
//!   `branch` / `current_prior_traces`. Cross-session recall is
//!   out of scope for the shim — when the real hippocampus
//!   service is wired in, the trait surface is the swap point.
//!
//! - **temporal** = working memory. The current LLM call's
//!   messages array is owned by the agent adapter; the shim
//!   doesn't know about it.
//!
//! - **prefrontal** = LLM execution + **scheduled task runner**.
//!   The shim's `maybe_compress` accepts a `&dyn TextSummarizer`
//!   (a fixed-template LLM call: "compress this into N tokens")
//!   so summarization stays a prefrontal-shaped concern. The
//!   scheduled-task capability of prefrontal is a separate
//!   module (deferred) and does not touch the shim.

use crate::task::Task;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::SystemTime;

/// Why a session ended / branched.
///
/// `MaxTokens`: `cumulative_tokens` crossed `session.compress_at`
/// repeatedly and compression couldn't keep the size under the
/// hard ceiling. `MaxTasks`: ran the configured
/// `branch_at_tasks` limit. `TopicDrift`: task framework tag
/// changed (e.g. `prefrontal` → `zenoh`). `Manual`: explicit
/// `branch()` call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchReason {
    MaxTokens,
    MaxTasks,
    TopicDrift,
    Manual,
}

/// Result of a `maybe_compress` call — did the compressor fire?
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionEvent {
    pub from_tokens: usize,
    pub to_tokens: usize,
    pub strategy: CompressionStrategy,
}

/// Strategy the shim used (or would use) to compress accumulated
/// prior_traces. Mirrors what an actual hippocampus
/// summarization call would return; the shim can fall back to
/// a deterministic strategy when no `TextSummarizer` is wired.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionStrategy {
    /// Drop oldest messages until under the budget.
    SlidingWindow,
    /// Hand the buffer to a `TextSummarizer` (prefrontal-shaped
    /// fixed-template LLM call) and replace with the returned
    /// summary.
    LlmSummarize,
    /// Truncate each tool-result body to 200 chars; keep names.
    ToolResultPrune,
    /// Combine prune + sliding window when neither alone is
    /// enough.
    Composite,
}

/// Topic-drift signal — the new task's framework tag disagrees
/// with the previous one in the same session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftEvent {
    pub from_framework: Option<String>,
    pub to_framework: Option<String>,
    pub previous_task_id: String,
    pub current_task_id: String,
}

/// What the runner writes into the report when a session ends
/// (or is branched mid-suite). `summary_blob` is opaque to the
/// runner — the real hippocampus serializes its own memory
/// representation; the shim serializes a compact JSON of
/// cumulative stats.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCheckpoint {
    pub agent: String,
    pub suite: String,
    pub ran_task_ids: Vec<String>,
    pub cumulative_tokens_before_branch: usize,
    pub compressions_applied: usize,
    pub ended_reason: BranchReason,
    pub summary_blob: String,
    pub started_at: String,
    pub ended_at: String,
}

/// Fixed-template LLM call (prefrontal-shaped). Implementations
/// live in the agent layer — `OpenAiAgent` is the canonical impl
/// for bench, which hardcodes a summarization prompt and
/// caps the output at `max_tokens`. The shim only calls this;
/// it doesn't know what summarization is.
pub trait TextSummarizer: Send + Sync {
    /// Summarize `text` into ≤ `max_tokens` tokens. Return
    /// `Err` to signal compression failure (the shim will log
    /// and keep the un-summarized buffer — better than losing
    /// history).
    fn summarize(&self, text: &str, max_tokens: usize) -> Result<String, String>;
}

/// The session-memory interface. The bench runner holds an
/// `Arc<dyn HippocampusLike>` and calls into it per task;
/// swapping the local shim for a real hippocampus service is
/// mechanical (same trait).
pub trait HippocampusLike: Send + Sync {
    /// Append a task's output to the accumulating prior_traces.
    /// `task_id` is recorded for the session log; the actual
    /// body is what the next task's LLM call will see.
    fn append(
        &self,
        suite: &str,
        agent: &str,
        task_id: &str,
        body: &str,
    );

    /// Approximate token count of the accumulated buffer.
    /// The shim uses a simple chars/4 heuristic (English ~4
    /// chars/token); the real hippocampus would use its own
    /// tokenizer.
    fn cumulative_tokens(&self) -> usize;

    /// Trigger compression if the cumulative buffer is over
    /// the threshold. Returns `Some(event)` if compression
    /// ran, `None` if it was skipped (under threshold, or no
    /// summarizer wired).
    fn maybe_compress(
        &self,
        summarizer: Option<&dyn TextSummarizer>,
        threshold_tokens: usize,
        target_tokens: usize,
    ) -> Option<CompressionEvent>;

    /// Compare the new task's framework tag with the
    /// last-seen tag. Returns `Some(event)` when they differ
    /// AND both are `Some` (so e.g. the first task in a
    /// session doesn't trigger).
    fn detect_drift(&self, new_task: &Task) -> Option<DriftEvent>;

    /// Persist the current session's state and reset for a new
    /// session. Returns the checkpoint for the report.
    fn branch(&self, agent: &str, suite: &str, reason: BranchReason) -> SessionCheckpoint;

    /// Snapshot of the current accumulated buffer (what the
    /// next task's LLM call should see as `prior_traces`).
    fn current_prior_traces(&self) -> String;
}

/// Local in-process implementation of `HippocampusLike`. State is
/// `Mutex<Inner>` because `runner.rs` calls into the shim from
/// async contexts and a single bench run is single-writer per
/// (agent, suite) pair (the runner doesn't multiplex within a
/// session — a branch is a hard reset).
pub struct LocalHippocampusShim {
    inner: Mutex<Inner>,
}

struct Inner {
    /// Suite name (recorded for the checkpoint).
    suite: String,
    /// Agent name.
    agent: String,
    /// Running buffer; this is what the runner hands to the
    /// next task's LLM as `prior_traces`.
    buffer: String,
    /// Approximate token count of `buffer` (recomputed on
    /// append / compress; cached so `cumulative_tokens` is
    /// O(1)).
    tokens: usize,
    /// Order in which tasks appended to this session.
    ran_task_ids: Vec<String>,
    /// Number of compressions applied (running counter).
    compressions: usize,
    /// Last-seen `framework` tag, used by `detect_drift`.
    last_framework: Option<String>,
    /// Last task id, used by `detect_drift` (so the event
    /// has both ends of the transition).
    last_task_id: String,
    /// Wall-clock started_at.
    started_at: String,
}

impl LocalHippocampusShim {
    /// Start a fresh session for `(agent, suite)`. The runner
    /// calls this once at the start of a benchmark run (or
    /// after a `branch()`).
    /// Number of tasks that have appended to this session
    /// since the last `branch()` (or since `new`).
    pub fn tasks_in_session(&self) -> usize {
        self.inner.lock().expect("hippocampus shim mutex").ran_task_ids.len()
    }

    pub fn new(agent: impl Into<String>, suite: impl Into<String>) -> Self {
        let started_at = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| format!("unix-{}", d.as_secs()))
            .unwrap_or_else(|_| "unknown".into());
        Self {
            inner: Mutex::new(Inner {
                suite: suite.into(),
                agent: agent.into(),
                buffer: String::new(),
                tokens: 0,
                ran_task_ids: Vec::new(),
                compressions: 0,
                last_framework: None,
                last_task_id: String::new(),
                started_at,
            }),
        }
    }
}

impl HippocampusLike for LocalHippocampusShim {
    fn append(
        &self,
        suite: &str,
        agent: &str,
        task_id: &str,
        body: &str,
    ) {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        // Defensive: assert the caller's keys match our session
        // identity. A mismatch means the runner is mixing two
        // sessions into one shim — bug, surface loudly.
        debug_assert_eq!(g.suite, suite, "shim session suite mismatch");
        debug_assert_eq!(g.agent, agent, "shim session agent mismatch");
        // Append with a header so the next task's prompt
        // structure is recoverable ("[task_id] ...body...\n\n").
        if !g.buffer.is_empty() {
            g.buffer.push_str("\n\n");
        }
        g.buffer.push_str(&format!("[{}] {}", task_id, body));
        g.tokens = approx_tokens(&g.buffer);
        g.ran_task_ids.push(task_id.to_string());
    }

    fn cumulative_tokens(&self) -> usize {
        self.inner.lock().expect("hippocampus shim mutex").tokens
    }

    fn maybe_compress(
        &self,
        summarizer: Option<&dyn TextSummarizer>,
        threshold_tokens: usize,
        target_tokens: usize,
    ) -> Option<CompressionEvent> {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        if g.tokens < threshold_tokens {
            return None;
        }
        // Pick a strategy: summarizer is the highest-quality
        // (LLM summary); fall back to sliding window when the
        // caller didn't wire one.
        let strategy = if summarizer.is_some() {
            CompressionStrategy::LlmSummarize
        } else {
            CompressionStrategy::SlidingWindow
        };
        let before = g.tokens;
        match strategy {
            CompressionStrategy::LlmSummarize => {
                let summarizer = summarizer.expect("checked above");
                match summarizer.summarize(&g.buffer, target_tokens) {
                    Ok(summary) => {
                        g.buffer = summary;
                        g.tokens = approx_tokens(&g.buffer);
                        g.compressions += 1;
                    }
                    Err(e) => {
                        // Compression failed — keep the buffer,
                        // log, and signal that we tried. The
                        // runner should consider branching
                        // instead of pushing past the limit.
                        eprintln!(
                            "[hippocampus_shim] summary failed: {e} (tokens={}, buffer preserved)",
                            g.tokens
                        );
                        return None;
                    }
                }
            }
            CompressionStrategy::SlidingWindow => {
                // Cut oldest half (in characters; cheap
                // approximation) plus a one-line marker.
                let keep_from = g.buffer.len() / 2;
                let mut buf = String::from("[... prior_traces compressed ...]\n");
                buf.push_str(&g.buffer[keep_from..]);
                g.buffer = buf;
                g.tokens = approx_tokens(&g.buffer);
                g.compressions += 1;
            }
            _ => unreachable!("only the two strategies are reachable"),
        };
        Some(CompressionEvent {
            from_tokens: before,
            to_tokens: g.tokens,
            strategy,
        })
    }

    fn detect_drift(&self, new_task: &Task) -> Option<DriftEvent> {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        let new_fw = new_task.framework.as_ref().filter(|s| !s.is_empty()).cloned();
        let prev_fw = g.last_framework.clone();
        // Trigger only when (a) both sides are Some (avoids
        // first-task false positive) and (b) they differ.
        match (&new_fw, &prev_fw) {
            (Some(n), Some(p)) if n != p => Some(DriftEvent {
                from_framework: Some(p.clone()),
                to_framework: Some(n.clone()),
                previous_task_id: g.last_task_id.clone(),
                current_task_id: new_task.id.clone(),
            }),
            _ => None,
        }
    }

    fn branch(&self, agent: &str, suite: &str, reason: BranchReason) -> SessionCheckpoint {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        // Compact summary blob — the real hippocampus would
        // serialize its own memory record; the shim uses
        // serde_json of the buffer + stats.
        let summary_blob = serde_json::json!({
            "buffer_preview": preview(&g.buffer, 256),
            "buffer_tokens_at_branch": g.tokens,
            "ran_task_count": g.ran_task_ids.len(),
            "compressions": g.compressions,
        })
        .to_string();
        let checkpoint = SessionCheckpoint {
            agent: agent.to_string(),
            suite: suite.to_string(),
            ran_task_ids: g.ran_task_ids.clone(),
            cumulative_tokens_before_branch: g.tokens,
            compressions_applied: g.compressions,
            ended_reason: reason,
            summary_blob,
            started_at: g.started_at.clone(),
            ended_at: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| format!("unix-{}", d.as_secs()))
                .unwrap_or_else(|_| "unknown".into()),
        };
        // Reset for the next session. The runner typically
        // creates a fresh shim after a branch, but we support
        // in-place reset too in case the same shim is reused.
        g.buffer.clear();
        g.tokens = 0;
        g.ran_task_ids.clear();
        g.compressions = 0;
        g.last_framework = None;
        g.last_task_id.clear();
        g.started_at = checkpoint.ended_at.clone();
        checkpoint
    }

    fn current_prior_traces(&self) -> String {
        self.inner.lock().expect("hippocampus shim mutex").buffer.clone()
    }
}

impl LocalHippocampusShim {
    /// Update the last-seen framework tag. The runner calls
    /// this after each task so the next `detect_drift` call
    /// has the right baseline.
    pub fn record_framework(&self, framework: Option<&str>) {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        g.last_framework = framework.filter(|s| !s.is_empty()).map(str::to_string);
    }

    /// Update the last-seen task id (used in drift events).
    pub fn record_task_id(&self, task_id: &str) {
        let mut g = self.inner.lock().expect("hippocampus shim mutex");
        g.last_task_id = task_id.to_string();
    }
}

fn approx_tokens(s: &str) -> usize {
    // Cheap English-biased heuristic: ~4 chars/token. Good
    // enough for trigger thresholds; the real hippocampus
    // would use its own BPE/tokenizer.
    (s.len() + 3) / 4
}

fn preview(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        let mut out = s[..n].to_string();
        out.push_str("…[truncated]");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{ScorerSpec, Task};

    fn task(id: &str, framework: Option<&str>) -> Task {
        Task {
            id: id.into(),
            instruction: format!("do {id}"),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            framework: framework.map(str::to_string),
            scorer: ScorerSpec::Contains {
                all_of: vec!["x".into()],
                any_of: vec![],
            },
            timeout_secs: None,
        }
    }


    /// Stub summarizer that just halves the input length and
    /// reports the cap. Lets the compression tests be
    /// deterministic without an LLM call.
    struct HalveSummarizer;
    impl TextSummarizer for HalveSummarizer {
        fn summarize(&self, text: &str, _max_tokens: usize) -> Result<String, String> {
            let keep = text.len() / 2;
            Ok(format!("[summary:{} chars] {}", keep, &text[..keep]))
        }
    }

    #[test]
    fn append_and_cumulative() {
        let shim = LocalHippocampusShim::new("deepseek-chat", "gaia");
        shim.append("gaia", "deepseek-chat", "t1", "answer one");
        shim.append("gaia", "deepseek-chat", "t2", "answer two");
        let s = shim.current_prior_traces();
        assert!(s.contains("[t1] answer one"));
        assert!(s.contains("[t2] answer two"));
        assert!(shim.cumulative_tokens() > 0);
    }

    #[test]
    fn maybe_compress_skips_under_threshold() {
        let shim = LocalHippocampusShim::new("a", "s");
        shim.append("s", "a", "t1", "short");
        let evt = shim.maybe_compress(Some(&HalveSummarizer), 1000, 100);
        assert!(evt.is_none(), "should not compress under threshold");
    }

    #[test]
    fn maybe_compress_fires_under_threshold_with_summarizer() {
        let shim = LocalHippocampusShim::new("a", "s");
        // ~500 chars => ~125 tokens; threshold 100 => fires.
        shim.append("s", "a", "t1", &"x".repeat(500));
        let before = shim.cumulative_tokens();
        let evt = shim
            .maybe_compress(Some(&HalveSummarizer), 100, 30)
            .expect("should compress");
        assert!(evt.to_tokens < before, "got: {evt:?}");
        assert_eq!(evt.strategy, CompressionStrategy::LlmSummarize);
    }

    #[test]
    fn maybe_compress_falls_back_to_sliding_window_without_summarizer() {
        let shim = LocalHippocampusShim::new("a", "s");
        shim.append("s", "a", "t1", &"y".repeat(500));
        let evt = shim
            .maybe_compress(None, 100, 30)
            .expect("should compress");
        assert_eq!(evt.strategy, CompressionStrategy::SlidingWindow);
        assert!(shim.current_prior_traces().contains("compressed"));
    }

    #[test]
    fn maybe_compress_failure_preserves_buffer() {
        struct FailingSummarizer;
        impl TextSummarizer for FailingSummarizer {
            fn summarize(&self, _: &str, _: usize) -> Result<String, String> {
                Err("synth LLM down".into())
            }
        }
        let shim = LocalHippocampusShim::new("a", "s");
        shim.append("s", "a", "t1", &"z".repeat(500));
        let before = shim.current_prior_traces();
        let evt = shim.maybe_compress(Some(&FailingSummarizer), 100, 30);
        assert!(evt.is_none(), "failed compression returns None");
        assert_eq!(shim.current_prior_traces(), before, "buffer must be preserved on failure");
    }

    #[test]
    fn detect_drift_fires_only_when_frameworks_differ() {
        let shim = LocalHippocampusShim::new("a", "s");
        shim.append("s", "a", "t1", "first");
        shim.record_task_id("t1");
        shim.record_framework(Some("prefrontal"));
        // Same framework -> no drift.
        let t_same = task("t2", Some("prefrontal"));
        assert!(shim.detect_drift(&t_same).is_none());
        // Different framework -> drift.
        let t_diff = task("t3", Some("zenoh"));
        let evt = shim
            .detect_drift(&t_diff)
            .expect("framework change should signal drift");
        assert_eq!(evt.from_framework.as_deref(), Some("prefrontal"));
        assert_eq!(evt.to_framework.as_deref(), Some("zenoh"));
        assert_eq!(evt.previous_task_id, "t1");
        assert_eq!(evt.current_task_id, "t3");
        // First task in a session: no prior framework -> no drift
        // (recorded_framework is None).
        let fresh = LocalHippocampusShim::new("a", "s");
        let t0 = task("t0", Some("prefrontal"));
        assert!(fresh.detect_drift(&t0).is_none());
    }

    #[test]
    fn branch_returns_checkpoint_and_resets() {
        let shim = LocalHippocampusShim::new("a", "s");
        shim.append("s", "a", "t1", "first");
        shim.append("s", "a", "t2", "second");
        shim.record_framework(Some("prefrontal"));
        let cp = shim.branch("a", "s", BranchReason::MaxTasks);
        assert_eq!(cp.agent, "a");
        assert_eq!(cp.suite, "s");
        assert_eq!(cp.ran_task_ids, vec!["t1", "t2"]);
        assert_eq!(cp.ended_reason, BranchReason::MaxTasks);
        assert!(cp.cumulative_tokens_before_branch > 0);
        // After branch the shim is reset.
        assert!(shim.current_prior_traces().is_empty());
        assert_eq!(shim.cumulative_tokens(), 0);
        assert!(cp.summary_blob.contains("ran_task_count"));
    }
}
