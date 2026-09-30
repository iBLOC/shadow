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
        #[serde(default = "df_max_tokens")]
        max_tokens: u32,
        #[serde(default = "df_timeout")]
        timeout_secs: u64,
    },
    /// Local agent CLI driven on argv (`{prompt}` / `{workdir}`
    /// placeholders): openclaw, pi, dsh (DeepSeek Harness), aider…
    Cli {
        name: String,
        command: Vec<String>,
        #[serde(default = "df_timeout")]
        timeout_secs: u64,
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

impl AgentSpec {
    pub fn name(&self) -> &str {
        match self {
            AgentSpec::ShadowDesktop { name, .. } => name,
            AgentSpec::OpenAi { name, .. } => name,
            AgentSpec::Cli { name, .. } => name,
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
                max_tokens,
                timeout_secs,
            } => Box::new(OpenAiAgent {
                name,
                base_url,
                model,
                api_key,
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
            max_tokens: 256,
            timeout_secs: 120,
        })
    }
}
