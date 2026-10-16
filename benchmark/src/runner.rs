//! Runner — executes (task × agent × repeat) combinations with
//! timeouts, applies file patches, scores, and emits JSON + markdown
//! comparison reports including the τ-bench-style pass^k reliability
//! metric.

use crate::agent::{apply_fenced_patches, AgentAdapter, AgentError};
use crate::config::AgentsConfig;
use crate::scorer::{score, Score};
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
                    let score = score(&task.scorer, task, &workdir, &r.answer, judge.as_ref())
                        .await;
                    all_passed &= score.passed;
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
