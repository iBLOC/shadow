//! agents.toml — which agents participate in a comparison run.

use crate::agent::{CliAgent, OpenAiAgent};
use serde::{Deserialize, Serialize};

/// Optional judge (LLM-as-judge for `llm-judge` scorers). Any
/// OpenAI-compatible endpoint works; a strong model is recommended —
/// judging with the same small model under test defeats the purpose.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JudgeConfig {
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsConfig {
    #[serde(default)]
    pub judge: Option<JudgeConfig>,
    #[serde(default, rename = "agent")]
    pub agents: Vec<AgentSpec>,
}

/// One comparison participant.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "adapter", rename_all = "lowercase")]
pub enum AgentSpec {
    /// The real Shadow-Desktop app, driven through its wdio WebDriver
    /// surface — benchmark doubles as full-stack functional test.
    #[serde(rename = "shadow-desktop")]
    ShadowDesktop {
        name: String,
        #[serde(default = "df_webdriver")]
        webdriver_url: String,
        #[serde(default = "df_app_url")]
        app_url: String,
        #[serde(default = "df_reply_timeout")]
        reply_timeout_secs: u64,
    },
    /// OpenAI-compatible chat endpoint (shadow embedded neuron, DeepSeek
    /// API, vLLM-hosted open models…).
    OpenAi {
        name: String,
        base_url: String,
        model: String,
        #[serde(default)]
        api_key: Option<String>,
        /// Env var holding the API key (keys stay out of config files).
        #[serde(default)]
        api_key_env: Option<String>,
        #[serde(default = "df_max_tokens")]
        max_tokens: u32,
        #[serde(default = "df_timeout")]
        timeout_secs: u64,
        /// Session-memory tuning. `None` falls back to
        /// `SessionConfig::default()` (no auto-compression,
        /// unlimited tasks, drift detection on).
        #[serde(default)]
        session: Option<SessionConfig>,
    },
    /// Local agent CLI driven on argv (`{prompt}` / `{workdir}`
    /// placeholders): openclaw, pi, dsh (DeepSeek Harness), aider…
    Cli {
        name: String,
        command: Vec<String>,
        #[serde(default = "df_timeout")]
        timeout_secs: u64,
    },
    /// 大脑独立栈 A2A endpoint (subject #1 of 2, see
    /// docs/benchmark-positioning.md §0) — POST /a2a/tasks/send with
    /// skill routing. `skill` selects the target lobe.
    Brain {
        name: String,
        a2a_base_url: String,
        skill: String,
        #[serde(default = "df_timeout")]
        timeout_secs: u64,
        #[serde(default)]
        session: Option<SessionConfig>,
    },
    /// In-process zen rule engine (diencephalon) — the deterministic
    /// subject for the rule-engine-smoke suite. Not an LLM: answers
    /// are "notify" / "ignore" from the engine's FEEL evaluation.
    /// Takes no config; the bath-guard rule is registered in code.
    #[serde(rename = "rule-engine")]
    RuleEngine {
        name: String,
    },
}

fn df_max_tokens() -> u32 {
    512
}
fn df_timeout() -> u64 {
    300
}

fn df_webdriver() -> String {
    "http://127.0.0.1:4445".into()
}
fn df_app_url() -> String {
    "http://localhost:1420".into()
}
fn df_reply_timeout() -> u64 {
    600
}

/// Session-memory configuration for an agent. The bench runner
/// holds one `LocalHippocampusShim` per (agent, suite) pair and
/// uses these thresholds to decide when to compress accumulated
/// `prior_traces` (prefrontal-shaped fixed-template LLM
/// summarization) and when to branch the session (drop the
/// buffer, write a checkpoint, start fresh).
///
/// Defaults are deliberately generous: a typical long-suite run
/// (10–20 tasks, each < 2k tokens of answer) stays well under
/// the compress threshold. Operators tune these in agents-tb.toml
/// per agent if they want to test the threshold behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// When `cumulative_tokens` exceeds this, run a compression
    /// pass (sliding window if no `TextSummarizer` is wired, LLM
    /// summarize otherwise). Default 0 = never auto-compress.
    #[serde(default)]
    pub compress_at_tokens: usize,
    /// Target token count for the compressed buffer. The summarizer
    /// is told to keep its reply under this cap. Default 0 = no
    /// target (sliding window halves regardless).
    #[serde(default)]
    pub target_tokens: usize,
    /// After this many tasks in the same session, force a
    /// branch. Default 0 = no max (session runs the full suite).
    #[serde(default)]
    pub branch_at_tasks: usize,
    /// Enable framework-tag-based topic-drift detection. Default
    /// true; off skips drift events entirely.
    #[serde(default = "df_true")]
    pub detect_drift: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            compress_at_tokens: 0,    // off by default (back-compat)
            target_tokens: 0,
            branch_at_tasks: 0,       // unlimited by default
            detect_drift: true,
        }
    }
}

fn df_true() -> bool {
    true
}

impl AgentSpec {
    pub fn name(&self) -> &str {
        match self {
            AgentSpec::ShadowDesktop { name, .. } => name,
            AgentSpec::OpenAi { name, .. } => name,
            AgentSpec::Cli { name, .. } => name,
            AgentSpec::Brain { name, .. } => name,
            AgentSpec::RuleEngine { name } => name,
        }
    }

    /// Returns the agent's session-memory configuration, falling
    /// back to `SessionConfig::default()` (no auto-compression,
    /// unlimited tasks, drift detection on) for variants that
    /// don't carry a `session` field.
    pub fn session_config(&self) -> SessionConfig {
        match self {
            AgentSpec::OpenAi { session, .. } => session.clone().unwrap_or_default(),
            AgentSpec::Brain { session, .. } => session.clone().unwrap_or_default(),
            // CLI / ShadowDesktop don't carry session today —
            // the runner reads prior_traces from the previous
            // task's stdout / wdio DOM dump respectively, so
            // hippocampus-shaped shim doesn't apply yet. Default
            // values still let the runner work without crashing.
            AgentSpec::Cli { .. } | AgentSpec::ShadowDesktop { .. } => SessionConfig::default(),
            // Deterministic engine — no memory, no drift, no LLM.
            AgentSpec::RuleEngine { .. } => SessionConfig {
                compress_at_tokens: 0,
                target_tokens: 0,
                branch_at_tasks: 0,
                detect_drift: false,
            },
        }
    }

    pub fn into_adapter(self) -> crate::agent::AgentAdapterBox {
        match self {
            AgentSpec::ShadowDesktop {
                name,
                webdriver_url,
                app_url,
                reply_timeout_secs,
            } => Box::new(crate::desktop_agent::ShadowDesktopAgent::new(
                name,
                webdriver_url,
                app_url,
                reply_timeout_secs,
            )),
            AgentSpec::OpenAi {
                name,
                base_url,
                model,
                api_key,
                api_key_env,
                max_tokens,
                timeout_secs,
                // `session` lives on the runner side, not the
                // adapter — the adapter is stateless. The
                // runner reads `AgentSpec::session_config()`
                // and constructs the hippocampus shim from it.
                ..
            } => Box::new(OpenAiAgent {
                name,
                base_url,
                model,
                api_key,
                api_key_env,
                max_tokens,
                timeout_secs,
            }),
            AgentSpec::Cli {
                name,
                command,
                timeout_secs,
            } => Box::new(CliAgent {
                name,
                command,
                timeout_secs,
            }),
            AgentSpec::Brain {
                name,
                a2a_base_url,
                skill,
                timeout_secs,
                ..
            } => Box::new(crate::brain_agent::BrainAgent {
                name,
                a2a_base_url,
                skill,
                timeout_secs,
            }),
            AgentSpec::RuleEngine { .. } => {
                Box::new(crate::rule_engine_agent::RuleEngineAgent::new_bath_guard())
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("TOML: {0}")]
    Toml(#[from] toml::de::Error),
}

impl AgentsConfig {
    pub fn load(path: &std::path::Path) -> Result<Self, ConfigError> {
        let raw = std::fs::read_to_string(path)?;
        Ok(toml::from_str(&raw)?)
    }

    pub fn into_adapters(
        self,
        only: Option<&[String]>,
    ) -> Vec<Box<dyn crate::agent::AgentAdapter>> {
        self.agents
            .into_iter()
            .filter(|a| only.map(|names| names.iter().any(|n| n == a.name())).unwrap_or(true))
            .map(|a| a.into_adapter())
            .collect()
    }

    /// Build the judge client (for `llm-judge` scorers).
    pub fn judge_client(&self) -> Option<OpenAiAgent> {
        self.judge.as_ref().map(|j| OpenAiAgent {
            name: "judge".into(),
            base_url: j.base_url.clone(),
            model: j.model.clone(),
            api_key: j.api_key.clone(),
            api_key_env: j.api_key_env.clone(),
            max_tokens: 256,
            timeout_secs: 120,
        })
    }
}
