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
    /// Provider token usage for this invocation. OpenAI-compatible
    /// endpoints report it in the response body; CLI adapters leave it
    /// zeroed.
    pub usage: TokenUsage,
    /// Number of tool calls the agent issued. Zero for prompt-only
    /// adapters.
    pub tool_calls: u32,
    /// Per-step trace. The agentic adapter records one entry per
    /// assistant turn / tool call; one-shot adapters leave it empty.
    pub steps: Vec<serde_json::Value>,
}

/// Token accounting for one agent invocation.
///
/// Adapters that talk to a provider that reports usage fill this
/// in; prompt-only or CLI adapters leave it zeroed. It is
/// serialized into the run report so cost per task can be compared
/// across agents without re-running them.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct TokenUsage {
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
    #[serde(default)]
    pub total_tokens: u32,
}

impl TokenUsage {
    /// Build a usage record from a provider's prompt/completion
    /// split, deriving the total when the provider omits it.
    pub fn new(prompt_tokens: u32, completion_tokens: u32, total_tokens: Option<u32>) -> Self {
        Self {
            prompt_tokens,
            completion_tokens,
            total_tokens: total_tokens.unwrap_or(prompt_tokens + completion_tokens),
        }
    }

    pub fn is_zero(&self) -> bool {
        self.total_tokens == 0 && self.prompt_tokens == 0 && self.completion_tokens == 0
    }
}

#[async_trait]
pub trait AgentAdapter: Send + Sync {
    fn name(&self) -> &str;
    /// Downcast hook. Adapters that implement
    /// `TextSummarizer` (e.g. `OpenAiAgent`) override this
    /// and return `Some(self)` when the downcast matches;
    /// default returns `None`. The runner uses this to pass
    /// a `&dyn TextSummarizer` to `HippocampusLike::maybe_compress`
    /// without making the bench harness aware of every concrete
    /// adapter type.
    fn as_text_summarizer(&self) -> Option<&dyn crate::hippocampus_shim::TextSummarizer> {
        None
    }
    /// Drive one task. `prior_traces` is the formatted workflow hint
    /// (empty string when no trace history); adapters that don't use
    /// hints ignore it.
    async fn run(
        &self,
        task: &Task,
        workdir: &Path,
        prior_traces: &str,
    ) -> Result<AgentRun, AgentError>;
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
    /// Name of an environment variable holding the API key. Resolved
    /// at request time — keys stay out of config files entirely.
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
    /// One-shot (single prompt → single answer) or the agentic
    /// tool-calling loop. Defaults to one-shot so existing configs
    /// keep their behaviour.
    #[serde(default)]
    pub mode: AgentMode,
}

/// How an agent is driven against a task.
///
/// `OneShot` is the original shape: one prompt, one answer, no tools.
/// `Agentic` runs a function-calling loop — the model explores the
/// workdir with `bash` / `read_file` / `write_file` / `list_files` and
/// ends the episode with `finish`.
///
/// The TOML shape is `[agent.mode] kind = "agentic" max_steps = 30`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AgentMode {
    /// One prompt, one answer. The default.
    #[serde(rename = "oneshot")]
    OneShot,
    /// Function-calling tool loop.
    #[serde(rename = "agentic")]
    Agentic {
        /// How many model turns the episode may take.
        #[serde(default = "default_max_steps")]
        max_steps: u32,
    },
}

fn default_max_steps() -> u32 {
    30
}

impl Default for AgentMode {
    fn default() -> Self {
        AgentMode::OneShot
    }
}

/// Parse a fence marker into a relative path.
///
/// The code-edit instruction tells the model to answer with
/// ```` ```path:src/main.py ```` blocks — but models frequently emit
/// ```` ```python:src/main.py ```` instead, so the prefix is treated
/// as an opaque tag and only the part after the colon is used.
///
/// Absolute paths, drive letters, URLs and `..` traversal are
/// rejected: the model must not be able to write outside its sandbox.
pub fn parse_path_marker(marker: &str) -> Option<String> {
    let marker = marker.trim();
    let (prefix, rest) = marker.split_once(':')?;
    // The prefix is a tag: "path", a language name, … — never a path
    // fragment of its own.
    let prefix = prefix.trim();
    if prefix.is_empty()
        || !prefix
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '+')
    {
        return None;
    }
    let rest = rest.trim();
    if rest.is_empty() {
        return None;
    }
    // A second colon means a drive letter or a URL — both out of bounds.
    if rest.contains(':') {
        return None;
    }
    // Absolute on Windows ("\foo") and POSIX ("/foo").
    if rest.starts_with('/') || rest.starts_with('\\') {
        return None;
    }
    let p = std::path::Path::new(rest);
    if p.is_absolute() {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for comp in p.components() {
        match comp {
            std::path::Component::Normal(part) => {
                let s = part.to_str()?;
                if s.is_empty() {
                    return None;
                }
                parts.push(s);
            }
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => return None,
            std::path::Component::RootDir | std::path::Component::Prefix(_) => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

impl OpenAiAgent {
    /// Resolve the API key: inline value first, then the environment
    /// variable named by `api_key_env`.
    fn resolved_key(&self) -> Option<String> {
        self.api_key
            .clone()
            .filter(|k| !k.is_empty())
            .or_else(|| {
                self.api_key_env
                    .as_ref()
                    .and_then(|name| std::env::var(name).ok())
                    .filter(|k| !k.is_empty())
            })
    }
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

/// System prompt for the agentic (tool-calling) loop. It states the
/// discipline the bench measures: look before you write, keep the
/// change minimal, verify with the tools, and end the episode with
/// `finish` rather than stopping mid-way.
const OPENAI_AGENTIC_SYSTEM: &str = "You are an AI agent working in a real working directory. \
You have tools: bash (run a shell command), read_file, write_file, list_files, and finish. \
Rules: \
- Explore before you edit: read the relevant files first. \
- Make the smallest change that solves the task; do not rewrite unrelated code. \
- Verify your change with the tools (run the tests or the program) before finishing. \
- When the work is done, call finish with a short summary. Do not stop without calling it. \
Do not add commentary outside what is asked. /no_think";

/// Extra instructions appended only when the task ships files (code-edit
/// tasks). Included unconditionally in the past, models over-generalized
/// it and wrapped plain math answers in fake ```path:src/main.py blocks,
/// polluting exact-match scoring.
const OPENAI_CODE_INSTRUCTION: &str = "The task ships files in the working directory. \
When the instruction asks you to modify them, reply with the complete \
corrected file content in a fenced block opened with the file path, e.g. \
```path:src/main.py```.";

/// Hint header prepended to injected prior-trace history. The runner
/// populates `OpenAiAgent.prior_traces` from telencephalon's
/// `/api/flows/traces` filtered by `intent_signature`; this constant
/// is just the visible wrapper, the rest is computed at runtime.
const PRIOR_TRACES_HEADER: &str = "\n\nPrior experience for similar tasks (read carefully; reuse successful steps and avoid the known failures):\n";

#[async_trait]
impl AgentAdapter for OpenAiAgent {
    fn name(&self) -> &str {
        &self.name
    }

    fn as_text_summarizer(&self) -> Option<&dyn crate::hippocampus_shim::TextSummarizer> {
        // OpenAiAgent is itself a TextSummarizer; the runner
        // downcasts via this method to feed the hippocampus
        // shim's `maybe_compress`.
        Some(self)
    }

    async fn run(&self, task: &Task, workdir: &Path, prior_traces: &str) -> Result<AgentRun, AgentError> {
        // One-shot and agentic share the prompt assembly but not the
        // conversation shape: the agentic path keeps a message history
        // and hands the model tools.
        match &self.mode {
            AgentMode::OneShot => self.run_oneshot(task, prior_traces).await,
            AgentMode::Agentic { max_steps } => {
                self.run_agentic(task, workdir, prior_traces, *max_steps).await
            }
        }
    }
}

impl OpenAiAgent {
    /// Single prompt → single answer.
    async fn run_oneshot(&self, task: &Task, prior_traces: &str) -> Result<AgentRun, AgentError> {
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
        if !prior_traces.is_empty() {
            system.push_str(PRIOR_TRACES_HEADER);
            system.push_str(prior_traces);
            system.push_str("\n\nApply the lessons above. Reuse successful steps; do not repeat the same failing steps verbatim.\n");
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
        if let Some(key) = &self.resolved_key() {
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
        // Token accounting: every OpenAI-compatible endpoint reports
        // `usage` in the response body. Reading it here is what makes
        // per-task cost comparable across agents in the report.
        let usage = TokenUsage::new(
            json["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32,
            json["usage"]["completion_tokens"].as_u64().unwrap_or(0) as u32,
            json["usage"]["total_tokens"].as_u64().map(|v| v as u32),
        );
        let tool_calls = json["choices"][0]["message"]["tool_calls"]
            .as_array()
            .map(|a| a.len() as u32)
            .unwrap_or(0);
        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: None,
            usage,
            tool_calls,
            steps: Vec::new(),
        })
    }

    /// Function-calling tool loop.
    ///
    /// The model gets a fixed tool set over the task workdir and keeps
    /// turning until it calls `finish`, answers without a tool call,
    /// or the step budget runs out. Every turn is recorded in
    /// `AgentRun.steps` so the report can show *how* the agent got
    /// there, not just its final answer.
    async fn run_agentic(
        &self,
        task: &Task,
        workdir: &Path,
        prior_traces: &str,
        max_steps: u32,
    ) -> Result<AgentRun, AgentError> {
        let started = std::time::Instant::now();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(self.timeout_secs))
            .build()
            .map_err(|e| AgentError::Failed {
                agent: self.name.clone(),
                message: e.to_string(),
            })?;

        let mut system = OPENAI_AGENTIC_SYSTEM.to_string();
        // The task's answer contract (e.g. GAIA's "FINAL ANSWER: <x>"
        // line format) constrains how the episode must END, which is
        // orthogonal to having tools — drop it and the scorer reads a
        // prose answer and fails every task regardless of correctness.
        // Contracts are written tool-neutral so they hold here too.
        if !task.answer_contract.is_empty() {
            system.push('\n');
            system.push_str(&task.answer_contract);
        }
        if !prior_traces.is_empty() {
            system.push_str(PRIOR_TRACES_HEADER);
            system.push_str(prior_traces);
            system.push_str("\n\nApply the lessons above. Reuse successful steps; do not repeat the same failing steps verbatim.\n");
        }

        let mut messages: Vec<serde_json::Value> = vec![
            serde_json::json!({"role": "system", "content": system}),
            serde_json::json!({"role": "user", "content": task.instruction}),
        ];
        let mut usage = TokenUsage::default();
        let mut tool_call_count = 0u32;
        let mut steps: Vec<serde_json::Value> = Vec::new();
        let mut answer = String::new();
        let mut finished = false;

        for _ in 0..max_steps.max(1) {
            let body = serde_json::json!({
                "model": self.model,
                "max_tokens": self.max_tokens,
                "messages": messages,
                "tools": crate::tools::tool_schemas(),
                "tool_choice": "auto",
            });
            let mut req = client
                .post(format!("{}/chat/completions", self.base_url.trim_end_matches('/')))
                .json(&body);
            if let Some(key) = &self.resolved_key() {
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

            // Accumulate usage across turns — the episode is billed as
            // a whole, not per turn.
            let turn_usage = TokenUsage::new(
                json["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32,
                json["usage"]["completion_tokens"].as_u64().unwrap_or(0) as u32,
                json["usage"]["total_tokens"].as_u64().map(|v| v as u32),
            );
            usage = TokenUsage::new(
                usage.prompt_tokens + turn_usage.prompt_tokens,
                usage.completion_tokens + turn_usage.completion_tokens,
                Some(usage.total_tokens + turn_usage.total_tokens),
            );

            let message = json["choices"][0]["message"].clone();
            let content = message["content"].as_str().unwrap_or("").to_string();
            let raw_calls: Vec<serde_json::Value> = message["tool_calls"]
                .as_array()
                .cloned()
                .unwrap_or_default();

            if raw_calls.is_empty() {
                // A plain answer ends the episode: the model stopped
                // asking for tools.
                if !content.is_empty() {
                    answer = content.clone();
                    steps.push(serde_json::json!({
                        "type": "message", "role": "assistant", "text": content
                    }));
                }
                break;
            }

            // The assistant turn must be echoed back verbatim before
            // the tool results, or the provider rejects the history.
            messages.push(message.clone());

            for raw in raw_calls {
                let Some(call) = crate::tools::ToolCall::from_json(&raw) else {
                    continue;
                };
                tool_call_count += 1;
                let outcome = crate::tools::execute(&call, workdir).await;
                steps.push(serde_json::json!({
                    "type": "tool_call",
                    "name": call.name,
                    "args": call.args,
                    "result": outcome.content,
                }));
                if outcome.finished {
                    finished = true;
                    answer = call.arg_str("summary").unwrap_or(&outcome.content).to_string();
                    steps.push(serde_json::json!({
                        "type": "finish", "summary": answer
                    }));
                }
                messages.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": outcome.content,
                }));
                if finished {
                    break;
                }
            }
            if finished {
                break;
            }
        }

        if answer.is_empty() {
            // The model never produced text (it only ever called
            // tools). The transcript is the deliverable, but the
            // report still needs something to show.
            answer = format!(
                "(agentic episode ended after {tool_call_count} tool calls without a final message)"
            );
        }

        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: None,
            usage,
            tool_calls: tool_call_count,
            steps,
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

// ============================================================================
// TextSummarizer impl for OpenAiAgent
// ============================================================================

/// Hardcoded summarization prompt. The shim calls this with
/// `max_tokens` reflected in `max_tokens` of the chat completion
/// request — the LLM is told to keep its reply under that cap.
/// This is a "定式 task": fixed system prompt, fixed role
/// (compress), bounded output. The hippocampus shim doesn't
/// know or care what's in the prompt; it just hands a buffer
/// to `summarize` and gets shorter text back.
const SUMMARIZE_SYSTEM: &str = "\
You are a context compressor for an agent benchmark. You will be \
given prior task outputs (each prefixed with `[task_id] ...`). \
Produce a concise summary in PLAIN TEXT that preserves:
  - each task's id
  - the model's final answer or result (one short line per task)
  - any error or unexpected behaviour
Do not add commentary, headers, or code fences. Plain lines, one per task.";

impl crate::hippocampus_shim::TextSummarizer for OpenAiAgent {
    fn summarize(&self, text: &str, max_tokens: usize) -> Result<String, String> {
        // Synchronous wrapper around the async HTTP call.
        //
        // Two contexts call this:
        // - inside a tokio runtime (the runner): Handle::block_on
        //   panics there, so use block_in_place + Handle::block_on
        //   (legal on multi-thread runtimes);
        // - outside any runtime (plain tests): spawn a dedicated
        //   current-thread runtime and block on it.
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| {
                handle
                    .block_on(async { self.summarize_async(text, max_tokens).await })
                    .map_err(|e| e.to_string())
            })
        } else {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| format!("summarize runtime build: {e}"))?;
            rt.block_on(async { self.summarize_async(text, max_tokens).await })
                .map_err(|e| e.to_string())
        }
    }
}

impl OpenAiAgent {
    /// Async summarization call. Hardcoded prompt; `max_tokens`
    /// is both the cap on output and a hint to the LLM.
    async fn summarize_async(
        &self,
        text: &str,
        max_tokens: usize,
    ) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| format!("reqwest build: {e}"))?;
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": 0.0,
            "messages": [
                {"role": "system", "content": SUMMARIZE_SYSTEM},
                {"role": "user", "content": text},
            ],
        });
        let mut req = client
            .post(format!("{}/chat/completions", self.base_url.trim_end_matches('/')))
            .json(&body);
        if let Some(key) = &self.resolved_key() {
            req = req.bearer_auth(key);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("send: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("HTTP {status}"));
        }
        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("body: {e}"))?;
        Ok(json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}

#[async_trait]
impl AgentAdapter for CliAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, task: &Task, workdir: &Path, _prior_traces: &str) -> Result<AgentRun, AgentError> {
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
        let child = match cmd.spawn() {
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
            usage: TokenUsage::default(),
            tool_calls: 0,
            steps: Vec::new(),
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
        // `parse_path_marker` accepts both `path:rel` and the
        // language-prefixed `python:rel` form, and rejects anything
        // that would escape the workdir.
        let Some(rel) = parse_path_marker(marker) else {
            continue;
        };
        let dest = workdir.join(&rel);
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

#[cfg(test)]
mod key_env_tests {
    use super::*;

    #[test]
    fn api_key_env_resolves_at_runtime() {
        let var = format!("BENCH_KEY_TEST_{}", std::process::id());
        // SAFETY: test-only; serial tests, unique var name per process.
        unsafe { std::env::set_var(&var, "sk-from-env") };
        let agent = OpenAiAgent {
            name: "t".into(),
            base_url: "http://127.0.0.1:1/v1".into(),
            model: "m".into(),
            api_key: None,
            api_key_env: Some(var),
            max_tokens: 16,
            timeout_secs: 5,
            mode: AgentMode::OneShot,
        };
        assert_eq!(agent.resolved_key().as_deref(), Some("sk-from-env"));
    }

    #[test]
    fn inline_key_wins_over_env() {
        let var = format!("BENCH_KEY_TEST2_{}", std::process::id());
        // SAFETY: test-only; serial tests, unique var name per process.
        unsafe { std::env::set_var(&var, "env-key") };
        let agent = OpenAiAgent {
            name: "t".into(),
            base_url: "http://127.0.0.1:1/v1".into(),
            model: "m".into(),
            api_key: Some("inline-key".into()),
            api_key_env: Some(var),
            max_tokens: 16,
            timeout_secs: 5,
            mode: AgentMode::OneShot,
        };
        assert_eq!(agent.resolved_key().as_deref(), Some("inline-key"));
    }

    #[test]
    fn missing_env_yields_none() {
        let agent = OpenAiAgent {
            name: "t".into(),
            base_url: "http://127.0.0.1:1/v1".into(),
            model: "m".into(),
            api_key: None,
            api_key_env: Some(format!("BENCH_KEY_MISSING_{}", std::process::id())),
            max_tokens: 16,
            timeout_secs: 5,
            mode: AgentMode::OneShot,
        };
        assert!(agent.resolved_key().is_none());
    }

    #[test]
    fn path_marker_accepts_both_prefix_forms() {
        assert_eq!(
            parse_path_marker("path:src/main.py").as_deref(),
            Some("src/main.py")
        );
        // Models frequently emit the language instead of "path".
        assert_eq!(
            parse_path_marker("python:src/a.py").as_deref(),
            Some("src/a.py")
        );
        assert_eq!(parse_path_marker("  path : a/b.txt ").as_deref(), Some("a/b.txt"));
    }

    #[test]
    fn path_marker_rejects_escapes_and_non_paths() {
        // No colon at all — a plain language fence.
        assert!(parse_path_marker("python").is_none());
        assert!(parse_path_marker("rust").is_none());
        // Traversal.
        assert!(parse_path_marker("path:../etc/passwd").is_none());
        assert!(parse_path_marker("path:a/../../b").is_none());
        // Absolute / drive letter / URL.
        assert!(parse_path_marker("path:/etc/passwd").is_none());
        assert!(parse_path_marker("path:C:\\Windows\\system32").is_none());
        assert!(parse_path_marker("https://example.com/x").is_none());
        // Empty path.
        assert!(parse_path_marker("path:").is_none());
    }
}
