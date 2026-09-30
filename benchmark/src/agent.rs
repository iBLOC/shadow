//! Agent adapters — how the harness drives an agent under evaluation.
//!
//! Two adapter families cover the comparison targets:
//!
//! * [`OpenAiAgent`] — any OpenAI-compatible chat endpoint. This is how
//!   shadow's embedded neuron is evaluated, and it also covers
//!   API-only agents (DeepSeek API, vLLM serving any open model…).
//!   For file-edit tasks the agent answers with fenced whole-file
//!   blocks (` ```path:rel/path `) which the harness applies to the
//!   workdir before scoring.
//! * [`CliAgent`] — spawns a local agent CLI in the task workdir with
//!   the instruction on argv (`{prompt}` placeholder). This is how
//!   openclaw / pi / dsh (DeepSeek Harness) are driven; a missing
//!   binary is reported as "not installed" instead of failing the run.

use crate::task::Task;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("agent binary not installed: {0}")]
    NotInstalled(String),
    #[error("agent '{agent}' failed: {message}")]
    Failed { agent: String, message: String },
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP: {0}")]
    Http(#[from] reqwest::Error),
}

/// What one adapter invocation produced.
#[derive(Debug, Clone)]
pub struct AgentRun {
    /// The agent's final text answer (CLI: stdout tail; OpenAI: the
    /// assistant message).
    pub answer: String,
    pub duration: Duration,
    pub exit_code: Option<i32>,
}

#[async_trait]
pub trait AgentAdapter: Send + Sync {
    fn name(&self) -> &str;
    async fn run(&self, task: &Task, workdir: &Path) -> Result<AgentRun, AgentError>;
}

/// Owned adapter handle used by the runner and the config layer.
pub type AgentAdapterBox = Box<dyn AgentAdapter>;

// ---------------------------------------------------------------------------
// OpenAI-compatible agent
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiAgent {
    pub name: String,
    /// Base URL **including** `/v1` (e.g. `http://127.0.0.1:8085/v1`).
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

fn default_max_tokens() -> u32 {
    512
}
fn default_timeout_secs() -> u64 {
    300
}

const OPENAI_SYSTEM: &str = "You are an AI agent under benchmark evaluation. \
Follow the instruction exactly and answer concisely. \
Do not add commentary outside what is asked. /no_think";

/// Extra instructions appended only when the task ships files (code-edit
/// tasks). Included unconditionally in the past, models over-generalized
/// it and wrapped plain math answers in fake ```path:src/main.py blocks,
/// polluting exact-match scoring.
const OPENAI_CODE_INSTRUCTION: &str = "The task ships files in the working directory. \
When the instruction asks you to modify them, reply with the complete \
corrected file content in a fenced block opened with the file path, e.g. \
```path:src/main.py```.";

#[async_trait]
impl AgentAdapter for OpenAiAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, task: &Task, _workdir: &Path) -> Result<AgentRun, AgentError> {
        let started = std::time::Instant::now();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(self.timeout_secs))
            .build()
            .map_err(|e| AgentError::Failed {
                agent: self.name.clone(),
                message: e.to_string(),
            })?;

        let mut system = OPENAI_SYSTEM.to_string();
        if !task.files.is_empty() {
            system.push('\n');
            system.push_str(OPENAI_CODE_INSTRUCTION);
        }
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": task.instruction},
            ],
        });

        let mut req = client
            .post(format!("{}/chat/completions", self.base_url.trim_end_matches('/')))
            .json(&body);
        if let Some(key) = &self.api_key {
            req = req.bearer_auth(key);
        }
        let resp = req.send().await.map_err(|e| AgentError::Failed {
            agent: self.name.clone(),
            message: format!("request: {e}"),
        })?;
        let status = resp.status();
        let json: serde_json::Value = resp.json().await.map_err(|e| AgentError::Failed {
            agent: self.name.clone(),
            message: format!("body at {status}: {e}"),
        })?;
        if !status.is_success() {
            let msg = json["error"]["message"]
                .as_str()
                .unwrap_or("unknown error")
                .to_string();
            return Err(AgentError::Failed {
                agent: self.name.clone(),
                message: format!("HTTP {status}: {msg}"),
            });
        }

        let answer = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: None,
        })
    }
}

// ---------------------------------------------------------------------------
// CLI agent (openclaw / pi / dsh / aider / claude / …)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAgent {
    pub name: String,
    /// argv template; `{prompt}` is replaced with the task instruction,
    /// `{workdir}` with the task workdir. No shell involved — argv is
    /// passed directly, so prompts with spaces/quotes are safe.
    pub command: Vec<String>,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

#[async_trait]
impl AgentAdapter for CliAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, task: &Task, workdir: &Path) -> Result<AgentRun, AgentError> {
        let started = std::time::Instant::now();
        let argv: Vec<String> = self
            .command
            .iter()
            .map(|a| {
                a.replace("{prompt}", &task.instruction)
                    .replace("{workdir}", &workdir.to_string_lossy())
            })
            .collect();
        let (program, rest) = argv.split_first().ok_or_else(|| AgentError::Failed {
            agent: self.name.clone(),
            message: "empty command".into(),
        })?;

        let mut cmd = tokio::process::Command::new(program);
        cmd.args(rest).current_dir(workdir);
        cmd.stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        // A missing binary is a skipped agent, not a failed task.
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(AgentError::NotInstalled(program.clone()));
            }
            Err(e) => return Err(e.into()),
        };

        let deadline = Duration::from_secs(self.timeout_secs);
        let output = tokio::time::timeout(deadline, child.wait_with_output())
            .await
            .map_err(|_| AgentError::Failed {
                agent: self.name.clone(),
                message: format!("timed out after {}s", self.timeout_secs),
            })?
            .map_err(AgentError::Io)?;

        let mut answer = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr);
        if answer.trim().is_empty() && !stderr.trim().is_empty() {
            answer = format!("[stderr]\n{stderr}");
        }
        // Keep the report readable.
        let answer = tail(&answer, 8000);

        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: output.status.code(),
        })
    }
}

fn tail(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let cut = s
        .char_indices()
        .rev()
        .find(|(i, _)| *i <= s.len() - max)
        .map(|(i, _)| i)
        .unwrap_or(0);
    format!("…[truncated]\n{}", &s[cut..])
}

// ---------------------------------------------------------------------------
// Fenced whole-file patch application (OpenAI adapter on code tasks)
// ---------------------------------------------------------------------------

/// Apply fenced whole-file blocks from `answer` into `workdir`.
///
/// Two-phase parsing so mixed answers behave predictably:
/// 1. every ` ```path:rel/path ` block is written to that path;
/// 2. when NO path-marked block exists and the task ships exactly one
///    file, the first fenced block (any language) is applied to it —
///    models frequently answer to a single-file edit task without the
///    path marker.
///
/// Language-marked blocks are never applied when a path-marked block
/// exists — a stray ```python block in the prose must not clobber the
/// real patch.
pub fn apply_fenced_patches(
    answer: &str,
    workdir: &Path,
    default_files: &[crate::task::TaskFile],
) -> Vec<PathBuf> {
    let lines: Vec<&str> = answer.lines().collect();
    let blocks = collect_fenced_blocks(&lines);

    let mut written = Vec::new();
    let mut wrote_path_block = false;
    for (marker, body) in &blocks {
        let Some(rel) = marker.strip_prefix("path:").map(str::trim) else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        let dest = workdir.join(rel);
        let dir_ok = dest.parent().map(|p| std::fs::create_dir_all(p)).unwrap_or(Ok(()));
        if dir_ok.is_ok() && std::fs::write(&dest, body.join("
")).is_ok() {
            written.push(dest);
            wrote_path_block = true;
        }
    }

    if !wrote_path_block && default_files.len() == 1 && !blocks.is_empty() {
        let (_, body) = &blocks[0];
        let dest = workdir.join(&default_files[0].path);
        let dir_ok = dest
            .parent()
            .map(|p| std::fs::create_dir_all(p))
            .unwrap_or(Ok(()));
        if dir_ok.is_ok() && std::fs::write(&dest, body.join("
")).is_ok() {
            written.push(dest);
        }
    }
    written
}

/// Split `lines` into (fence-marker, body) pairs. Fence openers are
/// lines starting with ``` ; bodies run until the next ``` line.
fn collect_fenced_blocks(lines: &[&str]) -> Vec<(String, Vec<String>)> {
    let mut blocks = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if let Some(marker) = trimmed.strip_prefix("```") {
            let mut body = Vec::new();
            let mut j = i + 1;
            let mut closed = false;
            while j < lines.len() {
                if lines[j].trim_start().starts_with("```") {
                    closed = true;
                    break;
                }
                body.push(lines[j].to_string());
                j += 1;
            }
            if closed {
                blocks.push((marker.trim().to_string(), body));
                i = j + 1;
                continue;
            }
        }
        i += 1;
    }
    blocks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fenced_path_blocks_are_written() {
        let dir = std::env::temp_dir().join(format!("bench-patch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let answer = "Sure.\n```path:src/a.py\ndef a():\n    return 1\n```\nand\n```python\ngarbage\n```";
        let files = vec![crate::task::TaskFile {
            path: "src/a.py".into(),
            content: "old".into(),
        }];
        let written = apply_fenced_patches(answer, &dir, &files);
        assert_eq!(written.len(), 1, "language-only block must not clobber");
        let got = std::fs::read_to_string(dir.join("src/a.py")).unwrap();
        assert!(got.contains("return 1"), "path-block wins: {got}");
        assert!(!got.contains("garbage"), "language-only block must not clobber");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bare_block_falls_back_to_single_task_file() {
        let dir = std::env::temp_dir().join(format!("bench-patch2-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let files = vec![crate::task::TaskFile {
            path: "task.py".into(),
            content: "old".into(),
        }];
        let answer = "```python\nprint('new')\n```";
        apply_fenced_patches(answer, &dir, &files);
        assert!(std::fs::read_to_string(dir.join("task.py")).unwrap().contains("new"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
