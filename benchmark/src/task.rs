//! Task model — one benchmark unit.

use serde::{Deserialize, Serialize};

/// A file materialised into the task workdir before the agent runs
/// (code-edit tasks).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFile {
    pub path: String,
    pub content: String,
}

/// How an agent's output is judged.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ScorerSpec {
    /// Normalised answer must equal `expected`.
    ExactMatch {
        expected: String,
        /// Default: case-insensitive, whitespace-collapsed comparison.
        #[serde(default)]
        case_sensitive: bool,
    },
    /// Normalised answer must contain all of `all_of` and, when
    /// `any_of` is non-empty, at least one of them.
    Contains {
        #[serde(default)]
        all_of: Vec<String>,
        #[serde(default)]
        any_of: Vec<String>,
    },
    /// Run `command` in the task workdir (after the agent's file
    /// edits are applied); exit status 0 passes. stdout/stderr tails
    /// are kept as the failure detail.
    UnitTests { command: Vec<String> },
    /// An LLM judge scores the answer against `rubric`. Requires a
    /// judge (an OpenAI-compatible endpoint) configured on the runner.
    LlmJudge { rubric: String },
}

/// A single benchmark task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub instruction: String,
    /// Files copied into a fresh workdir for this task.
    #[serde(default)]
    pub files: Vec<TaskFile>,
    pub scorer: ScorerSpec,
    /// Per-task override of the runner's default timeout.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}
