//! Runner — executes (task × agent × repeat) combinations with
//! timeouts, applies file patches, scores, and emits JSON + markdown
//! comparison reports including the τ-bench-style pass^k reliability
//! metric.

use crate::agent::{apply_fenced_patches, AgentAdapter, AgentError};
use crate::config::AgentsConfig;
use crate::scorer::{extract_gold, is_tool_action_task, score, Score};
use crate::suite::Suite;
use crate::task::Task;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RunnerConfig {
    /// Repetitions per (task, agent). pass^k = all k repeats pass
    /// (τ-bench reliability metric).
    pub repeat: usize,
    /// Default task timeout when the task doesn't set one.
    pub timeout_default: Duration,
    /// Workdir root for task sandboxes (kept for post-mortem).
    pub workdir_root: PathBuf,
}

impl Default for RunnerConfig {
    fn default() -> Self {
        Self {
            repeat: 1,
            timeout_default: Duration::from_secs(180),
            workdir_root: std::env::temp_dir().join("cerebellum-bench"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RunOutcome {
    pub repeat: usize,
    pub passed: bool,
    pub detail: String,
    pub duration_secs: f64,
    /// The full raw answer the agent emitted. Stored in the report so
    /// the hallucination guard (`detect_hallucinated_action` in
    /// `scorer`) is auditable after the run; before this field was
    /// added, only the truncated `detail` was kept and the guard's
    /// effectiveness on flagrant "I wrote X" narrations could not be
    /// re-verified. Capped at 32 KiB to keep reports bounded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
    /// Reasoning chain extracted from the raw answer (the content
    /// inside `<think>...</think>` blocks, concatenated). Most
    /// modern open-weight models (Qwen3, DeepSeek-R1, o-series)
    /// emit thinking tokens inline; keeping them in a separate
    /// field lets reviewers audit *why* the model reached its
    /// conclusion without scanning the full answer. `None` when
    /// the answer contains no think blocks.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskResult {
    pub agent: String,
    pub task_id: String,
    /// true when the agent binary is missing (comparison reports mark
    /// this as "skip", not "fail").
    pub skipped: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_reason: Option<String>,
    pub runs: Vec<RunOutcome>,
    /// pass^k: every repeat passed (false when skipped).
    pub pass_k: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSummary {
    pub agent: String,
    pub tasks_total: usize,
    pub tasks_passed: usize,
    pub tasks_failed: usize,
    pub tasks_skipped: usize,
    /// pass-rate over non-skipped tasks.
    pub pass_rate: f64,
    /// pass^k rate over non-skipped tasks (== pass_rate when repeat=1).
    pub pass_k_rate: f64,
    pub median_duration_secs: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub suite: String,
    pub agents: Vec<String>,
    pub repeat: usize,
    pub results: Vec<TaskResult>,
    pub summaries: Vec<AgentSummary>,
    pub generated_at: String,
}

pub struct Runner {
    pub cfg: RunnerConfig,
}

impl Default for Runner {
    fn default() -> Self {
        Self {
            cfg: RunnerConfig::default(),
        }
    }
}

impl Runner {
    /// Run every task against every adapter. Task workdirs are
    /// `workdir_root/<suite>/<agent>/<task>/<rep>` and kept for
    /// post-mortem inspection.
    pub async fn run(
        &self,
        suite: &Suite,
        adapters: &[Box<dyn AgentAdapter>],
        agents_cfg: &AgentsConfig,
        prior_traces: &std::collections::HashMap<(String, String), String>,
    ) -> Report {
        let judge = agents_cfg.judge_client();
        let mut results: Vec<TaskResult> = Vec::new();

        for adapter in adapters {
            for task in &suite.tasks {
                let prior = prior_traces
                    .get(&(adapter.name().to_string(), task.id.clone()))
                    .map(String::as_str)
                    .unwrap_or("");
                results.push(self.run_one(adapter, task, &judge, prior).await);
            }
        }

        Report {
            suite: suite.name.clone(),
            agents: adapters.iter().map(|a| a.name().to_string()).collect(),
            repeat: self.cfg.repeat,
            summaries: summarize(&results, self.cfg.repeat),
            results,
            generated_at: chrono_utc(),
        }
    }

    async fn run_one(
        &self,
        adapter: &Box<dyn AgentAdapter>,
        task: &Task,
        judge: &Option<crate::agent::OpenAiAgent>,
        prior_traces: &str,
    ) -> TaskResult {
        let timeout = task
            .timeout_secs
            .map(Duration::from_secs)
            .unwrap_or(self.cfg.timeout_default);

        let mut runs = Vec::new();
        let mut skipped = false;
        let mut skip_reason = None;
        let mut all_passed = true;

        for rep in 0..self.cfg.repeat.max(1) {
            let workdir = self
                .cfg
                .workdir_root
                .join(&suite_sanitize(&task.id))
                .join(sanitize(adapter.name()))
                .join(format!("rep{rep}"));
            let _ = std::fs::create_dir_all(&workdir);
            // Materialise the task files.
            for f in &task.files {
                let dest = workdir.join(&f.path);
                if let Some(parent) = dest.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&dest, &f.content);
            }

            // Drive the agent (per-repeat timeout).
            let started = std::time::Instant::now();
            let run = tokio::time::timeout(timeout, adapter.run(task, &workdir, prior_traces)).await;

            let outcome = match run {
                Err(_) => Err(AgentError::Failed {
                    agent: adapter.name().to_string(),
                    message: format!("task timed out after {}s", timeout.as_secs()),
                }),
                Ok(Err(AgentError::NotInstalled(bin))) => {
                    skipped = true;
                    skip_reason = Some(format!("not installed: {bin}"));
                    Err(AgentError::NotInstalled(bin))
                }
                Ok(Err(e)) => Err(e),
                Ok(Ok(r)) => Ok(r),
            };

            let outcome = match outcome {
                Ok(r) => {
                    // Apply the agent's fenced file edits before scoring.
                    apply_fenced_patches(&r.answer, &workdir, &task.files);
                    let mut score = score(&task.scorer, task, &workdir, &r.answer, judge.as_ref())
                        .await;
                    // Disk-side verification: when a tool-action task
                    // passes the textual scorer but no tool call
                    // materialised on disk, downgrade to fail. The
                    // "I wrote X" hallucination guard in `scorer`
                    // catches explicit narrations; this catches the
                    // "model just answers the test fixture directly"
                    // case (deepseek's "DELTA-042" leak on
                    // file-write-secret is the canonical example).
                    if score.passed && is_tool_action_task(&task.id) {
                        if let Err(why) = verify_action_on_disk(task, &workdir) {
                            score = Score {
                                passed: false,
                                detail: format!("{} (disk check: {})", score.detail, why),
                            };
                        }
                    }
                    all_passed &= score.passed;
                    // Reasoning extraction runs on the
                    // pre-strip raw answer (so auditors see the
                    // model's full thinking chain). The reasoning
                    // field is independent of the 32 KiB answer
                    // cap because thinking tokens are usually
                    // short and useful. Done before truncation so
                    // we don't accidentally drop a <think> block
                    // sitting near the 32 KiB boundary.
                    let reasoning = extract_reasoning(&r.answer);
                    let stored_answer = if r.answer.len() > 32 * 1024 {
                        // Truncate with a marker so reviewers know
                        // the original was longer.
                        let mut s = r.answer;
                        s.truncate(32 * 1024);
                        s.push_str("\n…[truncated; full answer exceeded 32 KiB]");
                        Some(s)
                    } else {
                        Some(r.answer)
                    };
                    RunOutcome {
                        repeat: rep,
                        passed: score.passed,
                        detail: score.detail,
                        duration_secs: started.elapsed().as_secs_f64(),
                        answer: stored_answer,
                        reasoning,
                        error: None,
                    }
                }
                Err(e) => {
                    all_passed = false;
                    RunOutcome {
                        repeat: rep,
                        passed: false,
                        detail: String::new(),
                        duration_secs: started.elapsed().as_secs_f64(),
                        answer: None,
                        reasoning: None,
                        error: Some(e.to_string()),
                    }
                }
            };
            runs.push(outcome);
        }

        TaskResult {
            agent: adapter.name().to_string(),
            task_id: task.id.clone(),
            skipped,
            skip_reason,
            pass_k: all_passed && !skipped,
            runs,
        }
    }
}

fn summarize(results: &[TaskResult], repeat: usize) -> Vec<AgentSummary> {
    let mut per_agent: BTreeMap<String, Vec<&TaskResult>> = BTreeMap::new();
    for r in results {
        per_agent.entry(r.agent.clone()).or_default().push(r);
    }
    per_agent
        .into_iter()
        .map(|(agent, rs)| {
            let total = rs.len();
            let skipped = rs.iter().filter(|r| r.skipped).count();
            let pass_k = rs.iter().filter(|r| !r.skipped && r.pass_k).count();
            let passed_any = rs
                .iter()
                .filter(|r| !r.skipped && r.runs.iter().any(|run| run.passed))
                .count();
            let effective = total - skipped;
            let mut durations: Vec<f64> = rs
                .iter()
                .flat_map(|r| r.runs.iter().map(|run| run.duration_secs))
                .filter(|d| *d > 0.0)
                .collect();
            durations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let median = if durations.is_empty() {
                0.0
            } else {
                durations[durations.len() / 2]
            };
            AgentSummary {
                agent,
                tasks_total: total,
                tasks_passed: passed_any,
                tasks_failed: effective - passed_any,
                tasks_skipped: skipped,
                pass_rate: rate(passed_any, effective),
                pass_k_rate: rate(pass_k, effective),
                median_duration_secs: median,
            }
        })
        .collect()
}

fn rate(n: usize, d: usize) -> f64 {
    if d == 0 {
        0.0
    } else {
        n as f64 / d as f64
    }
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
fn suite_sanitize(s: &str) -> String {
    sanitize(s)
}

fn chrono_utc() -> String {
    // No chrono dep — RFC3339-ish from the Unix epoch via std.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix-{now}")
}

/// Extract the content inside `<think>...</think>` blocks from an
/// LLM answer. Concatenates multiple blocks with blank-line
/// separators (preserves order). Unclosed `<think>` (no matching
/// `</think>`) is dropped — the answer might be truncated by the
/// upstream token limit, and we don't want a half-open tag to
/// surface as "reasoning" by mistake.
///
/// Returns `None` when the answer contains no complete think
/// blocks (so the `reasoning` field in `RunOutcome` is
/// `skip_serializing_if = "Option::is_none"` and absent in that
/// case, keeping reports tidy).
pub fn extract_reasoning(answer: &str) -> Option<String> {
    let mut out = String::new();
    let mut rest = answer;
    while let Some(open) = rest.find("<think>") {
        let after_open = &rest[open + "<think>".len()..];
        if let Some(close) = after_open.find("</think>") {
            if !out.is_empty() {
                out.push_str("\n\n");
            }
            out.push_str(after_open[..close].trim());
            rest = &after_open[close + "</think>".len()..];
        } else {
            // Unclosed tag — drop the rest. Same policy as
            // `scorer::strip_think`.
            break;
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

impl Report {
    /// JSON export (machine-readable, feeds dashboards).
    pub fn write_json(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self).unwrap_or_default())
    }

    /// Markdown comparison report (human-readable, commit-friendly).
    pub fn write_markdown(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut md = String::new();
        md.push_str(&format!("# Benchmark report — {}\n\n", self.suite));
        md.push_str(&format!(
            "generated: {} · repeat: {} (pass^k = all repeats pass)\n\n",
            self.generated_at, self.repeat
        ));

        md.push_str("## Summary\n\n| agent | passed | failed | skipped | pass-rate | pass^k | median s |\n|---|---|---|---|---|---|---|\n");
        for s in &self.summaries {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {:.0}% | {:.0}% | {:.2} |\n",
                s.agent,
                s.tasks_passed,
                s.tasks_failed,
                s.tasks_skipped,
                s.pass_rate * 100.0,
                s.pass_k_rate * 100.0,
                s.median_duration_secs
            ));
        }

        md.push_str("\n## Task matrix\n\n| task |");
        for a in &self.agents {
            md.push_str(&format!(" {} |", a));
        }
        md.push_str("\n|---|");
        for _ in &self.agents {
            md.push_str("---|");
        }
        md.push('\n');
        for task_id in self
            .results
            .iter()
            .map(|r| r.task_id.clone())
            .collect::<std::collections::BTreeSet<_>>()
        {
            md.push_str(&format!("| {task_id} |"));
            for a in &self.agents {
                let cell = match self.results.iter().find(|r| r.agent == *a && r.task_id == task_id)
                {
                    Some(r) if r.skipped => "skip".to_string(),
                    Some(r) => {
                        let marks: Vec<String> = r
                            .runs
                            .iter()
                            .map(|run| if run.passed { "✓".into() } else { "✗".into() })
                            .collect();
                        marks.join("")
                    }
                    None => "—".into(),
                };
                md.push_str(&format!(" {cell} |"));
            }
            md.push('\n');
        }

        md.push_str("\n## Failure details\n\n");
        for r in &self.results {
            for run in &r.runs {
                if !run.passed && !r.skipped {
                    md.push_str(&format!(
                        "- **{} / {}** (rep{}): {}\n",
                        r.agent,
                        r.task_id,
                        run.repeat,
                        run.error.clone().unwrap_or_else(|| run.detail.clone())
                    ));
                }
            }
        }

        std::fs::write(path, md)
    }
}

/// Disk-side post-score check for tool-action tasks.
///
/// Scorers (exact-match / contains / gaia-match) only look at the
/// model's final text. A prompt-only LLM agent that knows the gold
/// answer from training (e.g. deepseek's "DELTA-042" leak on
/// `file-write-secret`) can pass the textual scorer without ever
/// touching the workdir. The hallucination guard in `scorer` catches
/// explicit narrations ("I wrote X"); this catches the silent
/// answer-the-fixture case.
///
/// Heuristic: scan the task instruction for any relative path that
/// looks like a tool-action target (e.g. `pf-delta/secret.txt`,
/// `src/main.rs`); if the task's id signals a file/shell action,
/// at least one such path must exist on disk after the agent's
/// `apply_fenced_patches` materialization. Return `Ok(())` if
/// everything checks out (or no actionable path was detected), or
/// `Err(reason)` to downgrade the score.
pub fn verify_action_on_disk(task: &Task, workdir: &Path) -> Result<(), String> {
    let id = task.id.to_ascii_lowercase();
    // Only file-* tasks get a path-existence check; shell-* tasks
    // can produce any side effect (logs, processes) and the
    // instruction rarely names a stable path.
    if !id.starts_with("file-") {
        return Ok(());
    }
    // Extract candidate paths: backslash-or-slash delimited tokens
    // that look like "path/to/file.ext" (a real file path, not
    // a stray word ending in a period). The token must include a
    // `/` (or `\`), include a `.` that is **not** the last char,
    // and start with a letter / `.` / `~`. This avoids grabbing
    // URLs, version strings, or sentences like "...wrote.".
    let mut candidates: Vec<String> = Vec::new();
    for token in task.instruction.split(|c: char| {
        c.is_whitespace() || c == '"' || c == '\'' || c == '`' || c == '(' || c == ')'
    }) {
        if token.is_empty() {
            continue;
        }
        let t = token.trim_matches(|c: char| {
            c == ',' || c == ';' || c == '?' || c == '!' || c == '*' || c == ']' || c == '['
        });
        // Drop trailing sentence terminators (`.` is a sentence
        // boundary in prose, not part of a path).
        let t = t.trim_end_matches(|c: char| c == '.' || c == ':');
        if t.is_empty() {
            continue;
        }
        if t.contains('/') // require a slash — separates from
            // accidental look-alikes
            && t.contains('.')
            && !t.ends_with('.')
            && t.len() >= 4
            && t.len() <= 256
            && t.starts_with(|c: char| c.is_ascii_lowercase() || c == '.' || c == '~')
            && !t.starts_with("http")
        {
            candidates.push(t.to_string());
        }
    }
    if candidates.is_empty() {
        return Ok(());
    }
    let mut missing: Vec<&String> = Vec::new();
    for p in &candidates {
        let full = workdir.join(p);
        if !full.exists() {
            missing.push(p);
        }
    }
    if !missing.is_empty() {
        return Err(format!(
            "expected path(s) absent on disk after run: {:?}",
            missing
        ));
    }
    // L4 content check: at least one existing file must contain a
    // gold marker from the scorer. This catches the "agent wrote
    // the path but the body is junk" attack vector. Skipped when
    // the scorer variant carries no textual gold (UnitTests /
    // LlmJudge) — those have their own validation paths.
    let gold = extract_gold(&task.scorer);
    if gold.is_empty() {
        return Ok(());
    }
    for p in &candidates {
        let full = workdir.join(p);
        let body = match std::fs::read_to_string(&full) {
            Ok(s) => s,
            Err(_) => continue, // not a text file (binary? skip)
        };
        for marker in &gold {
            if body.contains(marker) {
                return Ok(());
            }
        }
    }
    Err(format!(
        "no candidate file contains any gold marker {:?}",
        gold
    ))
}

#[cfg(test)]
mod disk_check_tests {
    use super::{is_tool_action_task, verify_action_on_disk};
    use crate::task::{ScorerSpec, Task};
    use std::path::PathBuf;

    fn task(id: &str, instruction: &str) -> Task {
        Task {
            id: id.into(),
            instruction: instruction.into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer: ScorerSpec::Contains {
                all_of: vec!["DELTA-042".into()],
                any_of: vec![],
            },
            timeout_secs: None,
        }
    }

    #[test]
    fn file_write_path_present_passes() {
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("secret.txt"), "DELTA-042").unwrap();
        let t = task(
            "file-write-secret",
            "write DELTA-042 to pf-delta/secret.txt",
        );
        assert!(verify_action_on_disk(&t, &dir).is_ok());
    }

    #[test]
    fn file_write_path_missing_fails() {
        let dir = tempdir();
        // No file materialised
        let t = task(
            "file-write-secret",
            "write DELTA-042 to pf-delta/secret.txt",
        );
        let err = verify_action_on_disk(&t, &dir).unwrap_err();
        assert!(err.contains("pf-delta/secret.txt"), "got: {err}");
    }

    #[test]
    fn non_file_task_skips_disk_check() {
        // Even if no file exists, a non-file-* task id short-circuits.
        let dir = tempdir();
        let t = task("tool-time-today", "tell me today's date");
        assert!(verify_action_on_disk(&t, &dir).is_ok());
    }

    #[test]
    fn instructions_without_path_skip_check() {
        // No path-shaped token in the instruction — the check has
        // nothing to verify and passes.
        let dir = tempdir();
        let t = task("file-write-secret", "write the secret content");
        assert!(verify_action_on_disk(&t, &dir).is_ok());
    }

    #[test]
    fn predicate_consistency() {
        // The runner's disk check uses the same predicate as the
        // hallucination guard so a task is either in both checks or
        // neither.
        assert!(is_tool_action_task("file-write-secret"));
        assert!(is_tool_action_task("file-roundtrip-verified"));
        assert!(!is_tool_action_task("llm-arithmetic"));
    }

    fn file_write_task(expected: &str) -> Task {
        task_with_scorer(
            "file-write-secret",
            "write the secret to pf-delta/secret.txt",
            ScorerSpec::Contains {
                all_of: vec![expected.into()],
                any_of: vec![],
            },
        )
    }

    fn task_with_scorer(id: &str, instruction: &str, scorer: ScorerSpec) -> Task {
        Task {
            id: id.into(),
            instruction: instruction.into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer,
            timeout_secs: None,
        }
    }

    #[test]
    fn file_with_correct_content_passes() {
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("secret.txt"), "DELTA-042").unwrap();
        let t = file_write_task("DELTA-042");
        assert!(verify_action_on_disk(&t, &dir).is_ok());
    }

    #[test]
    fn file_with_wrong_content_fails() {
        // L4 content check: agent created the right path but the
        // body is junk. This is the attack vector the L4 layer
        // exists to catch.
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("secret.txt"), "lorem ipsum dolor").unwrap();
        let t = file_write_task("DELTA-042");
        let err = verify_action_on_disk(&t, &dir).unwrap_err();
        assert!(err.contains("no candidate file contains"), "got: {err}");
        assert!(err.contains("DELTA-042"), "got: {err}");
    }

    #[test]
    fn file_with_empty_content_fails() {
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("secret.txt"), "").unwrap();
        let t = file_write_task("DELTA-042");
        let err = verify_action_on_disk(&t, &dir).unwrap_err();
        assert!(err.contains("no candidate file contains"));
    }

    #[test]
    fn unit_tests_scorer_skips_content_check() {
        // UnitTests has no textual gold — disk content check is
        // skipped even if the file is empty (the unit test command
        // is the validation).
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("secret.txt"), "").unwrap();
        let t = task_with_scorer(
            "file-write-secret",
            "write the secret to pf-delta/secret.txt",
            ScorerSpec::UnitTests {
                command: vec!["true".into()],
            },
        );
        assert!(verify_action_on_disk(&t, &dir).is_ok());
    }

    /// Positive control: simulates the `l4-junk-body-smoke.json`
    /// fixture. The runner materializes `pf-delta/junk.txt` (via
    /// `task.files`) with content that intentionally does NOT
    /// contain the gold marker. The textual scorer (exact-match)
    /// fails (the agent has no tool to fix it), but more
    /// importantly the L4 disk content check would also fail if
    /// the textual score somehow passed — locking in the failure
    /// contract on both layers.
    #[test]
    fn l4_junk_body_fixture_locked() {
        let dir = tempdir();
        let nested = dir.join("pf-delta");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(
            nested.join("junk.txt"),
            "lorem ipsum dolor sit amet\n",
        )
        .unwrap();
        let t = task_with_scorer(
            // l4- prefix mirrors the real suite; the L4 check
            // is gated on the file- / shell- prefix, so this
            // synthetic test uses file- to exercise the path
            // without needing to update `is_tool_action_task`.
            "file-l4-junk-body-validation",
            "read pf-delta/junk.txt and answer with its content",
            ScorerSpec::ExactMatch {
                expected: "EXPECTED-MARKER-DELTA-042".into(),
                case_sensitive: false,
            },
        );
        let err = verify_action_on_disk(&t, &dir).unwrap_err();
        assert!(
            err.contains("no candidate file contains"),
            "expected L4 content-check failure, got: {err}"
        );
        assert!(err.contains("EXPECTED-MARKER-DELTA-042"), "got: {err}");
    }

    #[test]
    fn extract_reasoning_pulls_think_blocks() {
        use super::extract_reasoning;
        // Single block.
        assert_eq!(
            extract_reasoning("<think> I should write 7*8=56. </think>56"),
            Some("I should write 7*8=56.".to_string())
        );
        // Multiple blocks concatenated.
        let ans = "<think> step 1: recall. </think>first answer. \
                    <think> step 2: check. </think>final answer.";
        let r = extract_reasoning(ans).unwrap();
        assert!(r.contains("step 1: recall"), "got: {r}");
        assert!(r.contains("step 2: check"), "got: {r}");
        // No think blocks — None.
        assert_eq!(extract_reasoning("just a plain answer"), None);
        // Unclosed think drops the rest (no half-open tag leaks).
        assert_eq!(extract_reasoning("<think> rambling forever"), None);
        // Answer is just a tag closer.
        assert_eq!(extract_reasoning("only </think> here"), None);
    }

    fn tempdir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("bench-disk-{}", uuid_like()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn uuid_like() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64
    }
}
