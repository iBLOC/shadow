//! τ²-bench adapter — import upstream task records into a shadow suite
//! and run them through the Python driver (`tools/tau2_driver.py`) in
//! the pinned tau2 checkout's venv.
//!
//! Why a driver: τ²-bench owns its own orchestrator, user simulator and
//! DB-vs-gold evaluator. We do not re-implement that in Rust — we freeze
//! the task records into a suite JSON (reproducible slice), then run the
//! upstream harness per task and map its reward into the shadow report
//! shape (pass = reward 1.0, τ² rewards are products of 0/1 checks).

use crate::agent::TokenUsage;
use crate::runner::{chrono_utc, summarize, Report, RunOutcome, TaskResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// A τ² suite: raw tau2 task records + run defaults. Task content is
/// frozen at import; the pinned tau2 checkout supplies the environment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tau2Suite {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub domain: String,
    /// Provenance, e.g. `tau2-bench@4ce7c03`.
    #[serde(default)]
    pub source: String,
    #[serde(default = "df_max_steps")]
    pub max_steps: u32,
    /// Raw τ² task records (subset of `data/tau2/domains/<domain>/tasks.json`).
    pub tasks: Vec<serde_json::Value>,
}

fn df_max_steps() -> u32 {
    40
}

#[derive(Debug, thiserror::Error)]
pub enum Tau2Error {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid tau2 suite: {0}")]
    Invalid(String),
}

impl Tau2Suite {
    pub fn load(path: &Path) -> Result<Self, Tau2Error> {
        let raw = std::fs::read_to_string(path)?;
        let suite: Tau2Suite = serde_json::from_str(&raw)?;
        suite.validate()?;
        Ok(suite)
    }

    pub fn from_str(json: &str) -> Result<Self, Tau2Error> {
        let suite: Tau2Suite = serde_json::from_str(json)?;
        suite.validate()?;
        Ok(suite)
    }

    pub fn task_id(record: &serde_json::Value) -> Option<String> {
        record.get("id").and_then(|v| v.as_str()).map(str::to_string)
    }

    /// Task ids must be unique and present — the report indexes by id.
    pub fn validate(&self) -> Result<(), Tau2Error> {
        if self.tasks.is_empty() {
            return Err(Tau2Error::Invalid(format!(
                "suite '{}' has no tasks",
                self.name
            )));
        }
        let mut seen = std::collections::HashSet::new();
        for t in &self.tasks {
            let id = Self::task_id(t).ok_or_else(|| {
                Tau2Error::Invalid("task record without string `id`".into())
            })?;
            if !seen.insert(id.clone()) {
                return Err(Tau2Error::Invalid(format!("duplicate task id: {id}")));
            }
        }
        Ok(())
    }

    /// Filter to the given task ids (in the requested order). Unknown ids error.
    pub fn select_tasks(&mut self, ids: &[String]) -> Result<(), Tau2Error> {
        let mut selected = Vec::new();
        for id in ids {
            let rec = self
                .tasks
                .iter()
                .find(|t| Self::task_id(t).as_deref() == Some(id.as_str()))
                .ok_or_else(|| Tau2Error::Invalid(format!("task id not in suite: {id}")))?;
            selected.push(rec.clone());
        }
        self.tasks = selected;
        Ok(())
    }
}

/// Build a suite from an upstream `tasks.json` (τ²-bench
/// `data/tau2/domains/<domain>/tasks.json`). `ids` empty = take all.
pub fn import_tasks(
    upstream_tasks_json: &Path,
    name: &str,
    domain: &str,
    ids: &[String],
    source: &str,
    max_steps: u32,
) -> Result<Tau2Suite, Tau2Error> {
    let raw = std::fs::read_to_string(upstream_tasks_json)?;
    let all: Vec<serde_json::Value> = serde_json::from_str(&raw)?;
    let tasks: Vec<serde_json::Value> = if ids.is_empty() {
        all
    } else {
        let mut picked = Vec::new();
        for id in ids {
            let rec = all
                .iter()
                .find(|t| Tau2Suite::task_id(t).as_deref() == Some(id.as_str()))
                .ok_or_else(|| {
                    Tau2Error::Invalid(format!(
                        "task id {id} not found in {}",
                        upstream_tasks_json.display()
                    ))
                })?;
            picked.push(rec.clone());
        }
        picked
    };
    let suite = Tau2Suite {
        name: name.to_string(),
        description: String::new(),
        domain: domain.to_string(),
        source: source.to_string(),
        max_steps,
        tasks,
    };
    suite.validate()?;
    Ok(suite)
}

/// One comparison participant in a τ² run.
#[derive(Debug, Clone)]
pub struct Tau2Agent {
    pub name: String,
    /// litellm model id (`openai/deepseek-chat`, `deepseek/deepseek-chat`, …).
    pub model: String,
    pub api_base: Option<String>,
    /// Env var NAME holding the API key (values never enter argv).
    pub api_key_env: Option<String>,
    /// Literal key (from a local, gitignored agents.toml). Injected into
    /// the driver child's environment — never argv, never reports.
    pub api_key: Option<String>,
}

impl Tau2Agent {
    /// Map an OpenAI-compatible endpoint spec to a litellm id: models
    /// without a provider prefix get `openai/` (litellm's generic
    /// OpenAI-compatible route).
    pub fn from_openai(
        name: &str,
        model: &str,
        base_url: &str,
        api_key_env: Option<String>,
        api_key: Option<String>,
    ) -> Self {
        let llm_id = if model.contains('/') {
            model.to_string()
        } else {
            format!("openai/{model}")
        };
        Self {
            name: name.to_string(),
            model: llm_id,
            api_base: Some(base_url.to_string()),
            api_key_env,
            api_key,
        }
    }

    /// Variable name the driver reads the key from.
    fn key_var(&self) -> Option<String> {
        if self.api_key.is_some() {
            Some("SHADOW_TAU2_API_KEY".to_string())
        } else {
            self.api_key_env.clone()
        }
    }

    /// Build a τ² participant from the shared `agents.toml` spec, so
    /// one agents file drives both the regular bench and the τ² bench.
    /// Only the `openai` adapter variant maps cleanly (it carries a
    /// base URL + model + key); other variants are rejected.
    pub fn from_spec(spec: &crate::config::AgentSpec) -> Result<Self, Tau2Error> {
        match spec {
            crate::config::AgentSpec::OpenAi {
                name,
                base_url,
                model,
                api_key,
                api_key_env,
                ..
            } => Ok(Self::from_openai(
                name,
                model,
                base_url,
                api_key_env.clone(),
                api_key.clone(),
            )),
            other => Err(Tau2Error::Invalid(format!(
                "agent '{}' uses the '{}' adapter, which tau2 cannot drive; use adapter = \"openai\"",
                other.name(),
                match other {
                    crate::config::AgentSpec::ShadowDesktop { .. } => "shadow-desktop",
                    crate::config::AgentSpec::Cli { .. } => "cli",
                    crate::config::AgentSpec::Brain { .. } => "brain",
                    crate::config::AgentSpec::RuleEngine { .. } => "rule-engine",
                    crate::config::AgentSpec::OpenAi { .. } => "openai",
                }
            ))),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Tau2RunConfig {
    /// Pinned tau2 checkout (contains `.venv` after `uv sync`).
    pub tau2_root: PathBuf,
    /// `tools/tau2_driver.py` (absolute).
    pub driver: PathBuf,
    /// "replay" (oracle) or "llm".
    pub agent_mode: String,
    /// "scripted" (oracle) or "llm".
    pub user_mode: String,
    pub repeat: usize,
    pub timeout: Duration,
    /// Where to dump full trajectories (one JSON per task).
    pub save_dir: Option<PathBuf>,
    /// Append the shadow operational-discipline addendum to the agent
    /// system prompt (`--shadow-addendum` in the driver). Targets the
    /// COMMUNICATE=1/DB=0 failure mode; off by default so
    /// official-semantics runs stay verbatim.
    pub shadow_addendum: bool,
    /// Fixed user-simulator model (litellm id). Defaults to the agent's
    /// own model upstream — which made COMMUNICATE incomparable across
    /// agents and let reasoning models truncate their scenario script
    /// mid-sentence (task 7's injected price question never got asked).
    /// Pin one cheap non-reasoning model (deepseek-chat) for all agents,
    /// mirroring upstream's fixed gpt-4o-mini user.
    pub user_model: Option<String>,
    pub user_api_base: Option<String>,
    pub user_api_key_env: Option<String>,
}

/// JSON shape emitted by `tools/tau2_driver.py`.
#[derive(Debug, Deserialize)]
struct DriverResult {
    #[allow(dead_code)]
    task_id: String,
    passed: bool,
    #[allow(dead_code)]
    reward: f64,
    detail: String,
    duration_secs: f64,
    error: Option<String>,
    /// The last assistant text message — the agent's own answer. Kept
    /// so the report's hallucination guard can audit a τ² run the same
    /// way it audits an OpenAI run.
    #[serde(default)]
    answer: Option<String>,
    /// How many tool calls the agent issued in the simulation.
    #[serde(default)]
    tool_calls: Option<u32>,
    /// Provider token usage, when the provider reports it.
    #[serde(default)]
    usage: Option<DriverUsage>,
    /// Per-turn trace (assistant messages + tool calls).
    #[serde(default)]
    steps: Vec<serde_json::Value>,
}

/// Token usage as the Python driver reports it.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
struct DriverUsage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
    #[serde(default)]
    total_tokens: u32,
}

impl From<DriverUsage> for TokenUsage {
    fn from(u: DriverUsage) -> Self {
        TokenUsage::new(u.prompt_tokens, u.completion_tokens, Some(u.total_tokens))
    }
}

fn python_program(tau2_root: &Path) -> (String, Vec<String>) {
    if let Ok(p) = std::env::var("TAU2_PYTHON") {
        return (p, Vec::new());
    }
    let win = tau2_root.join(".venv").join("Scripts").join("python.exe");
    if win.exists() {
        return (win.to_string_lossy().into_owned(), Vec::new());
    }
    let unix = tau2_root.join(".venv").join("bin").join("python");
    if unix.exists() {
        return (unix.to_string_lossy().into_owned(), Vec::new());
    }
    // Fall back to uv-managed execution.
    (
        "uv".into(),
        vec![
            "run".into(),
            "--project".into(),
            tau2_root.to_string_lossy().into_owned(),
            "python".into(),
        ],
    )
}

/// Run every (agent × task × repeat) through the Python driver and
/// assemble the standard shadow report.
pub async fn run(
    suite: &Tau2Suite,
    agents: &[Tau2Agent],
    cfg: &Tau2RunConfig,
    max_steps: u32,
    task_filter: Option<&[String]>,
) -> Report {
    let (program, pre_args) = python_program(&cfg.tau2_root);
    // Materialise the suite once so the Python driver reads exactly the
    // records we selected (same shape as on-disk suites/tau2-*.json).
    let suite_path = std::env::temp_dir().join("shadow-tau2-suite.json");
    if let Err(e) = std::fs::write(&suite_path, serde_json::to_string(suite).unwrap_or_default()) {
        eprintln!("warn: cannot write temp suite: {e}");
    }
    let mut results: Vec<TaskResult> = Vec::new();

    for agent in agents {
        // Key resolution mirrors OpenAiAgent: a key that resolves to
        // nothing skips the whole agent, it does not run.
        let key_var = agent.key_var();
        if agent.api_key.is_none() {
            if let Some(var) = &key_var {
                if std::env::var(var).ok().filter(|v| !v.is_empty()).is_none() {
                    for task in &suite.tasks {
                        let id = Tau2Suite::task_id(task).unwrap_or_default();
                        if task_filter.is_some_and(|f| !f.iter().any(|x| x == &id)) {
                            continue;
                        }
                        results.push(TaskResult {
                            agent: agent.name.clone(),
                            task_id: id,
                            skipped: true,
                            skip_reason: Some(format!("missing API key: {var} is not set")),
                            runs: Vec::new(),
                            pass_k: false,
                        });
                    }
                    continue;
                }
            }
        }

        for task in &suite.tasks {
            let Some(task_id) = Tau2Suite::task_id(task) else {
                continue;
            };
            if task_filter.is_some_and(|f| !f.iter().any(|x| x == &task_id)) {
                continue;
            }

            let mut runs: Vec<RunOutcome> = Vec::new();
            let mut all_passed = true;
            for rep in 0..cfg.repeat.max(1) {
                let out_path = std::env::temp_dir().join(format!(
                    "shadow-tau2-{}-{}-{}.json",
                    sanitize(&agent.name),
                    sanitize(&task_id),
                    rep
                ));
                let _ = std::fs::remove_file(&out_path);

                let mut cmd = tokio::process::Command::new(&program);
                cmd.args(&pre_args)
                    .arg(&cfg.driver)
                    .arg("--suite")
                    .arg(&suite_path)
                    .arg("--task-id")
                    .arg(&task_id)
                    .arg("--domain")
                    .arg(&suite.domain)
                    .arg("--agent-mode")
                    .arg(&cfg.agent_mode)
                    .arg("--user-mode")
                    .arg(&cfg.user_mode)
                    .arg("--max-steps")
                    .arg(max_steps.to_string())
                    .arg("--out")
                    .arg(&out_path);
                if cfg.shadow_addendum {
                    cmd.arg("--shadow-addendum");
                }
                if cfg.agent_mode == "llm" {
                    cmd.arg("--model").arg(&agent.model);
                    if let Some(base) = &agent.api_base {
                        cmd.arg("--api-base").arg(base);
                    }
                    if let Some(var) = &key_var {
                        cmd.arg("--api-key-env").arg(var);
                    }
                    if let (Some(key), Some(var)) = (&agent.api_key, &key_var) {
                        // Literal key travels via child env, never argv.
                        cmd.env(var, key);
                    }
                }
                if let Some(um) = &cfg.user_model {
                    cmd.arg("--user-model").arg(um);
                }
                if let Some(ub) = &cfg.user_api_base {
                    cmd.arg("--user-api-base").arg(ub);
                }
                if let Some(uk) = &cfg.user_api_key_env {
                    cmd.arg("--user-api-key-env").arg(uk);
                    if let Some(key) = std::env::var(uk).ok() {
                        cmd.env(uk, key);
                    }
                }
                if let Some(dir) = &cfg.save_dir {
                    cmd.arg("--save-dir").arg(dir);
                }
                cmd.kill_on_drop(true);

                let started = std::time::Instant::now();
                let outcome = match tokio::time::timeout(cfg.timeout, cmd.output()).await {
                    Err(_) => Err(format!("task timed out after {}s", cfg.timeout.as_secs())),
                    Ok(Err(e)) => Err(format!("driver spawn failed: {e}")),
                    Ok(Ok(output)) => match std::fs::read_to_string(&out_path) {
                        Err(e) => Err(format!(
                            "driver produced no result (exit {}): {e}; stderr: {}",
                            output.status,
                            String::from_utf8_lossy(&output.stderr).chars().take(400).collect::<String>()
                        )),
                        Ok(raw) => match serde_json::from_str::<DriverResult>(&raw) {
                            Ok(r) => Ok(r),
                            Err(e) => Err(format!("driver result parse failed: {e}")),
                        },
                    },
                };

                runs.push(match outcome {
                    Ok(r) => {
                        all_passed &= r.passed;
                        RunOutcome {
                            repeat: rep,
                            passed: r.passed,
                            detail: r.detail,
                            duration_secs: if r.duration_secs > 0.0 {
                                r.duration_secs
                            } else {
                                started.elapsed().as_secs_f64()
                            },
                            answer: r.answer,
                            reasoning: None,
                            usage: r.usage.map(TokenUsage::from).unwrap_or_default(),
                            tool_calls: r.tool_calls.unwrap_or(0),
                            steps: r.steps,
                            error: r.error,
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
                            usage: TokenUsage::default(),
                            tool_calls: 0,
                            steps: Vec::new(),
                            error: Some(e),
                        }
                    }
                });
            }

            results.push(TaskResult {
                agent: agent.name.clone(),
                task_id,
                skipped: false,
                skip_reason: None,
                pass_k: all_passed,
                runs,
            });
        }
    }

    Report {
        suite: suite.name.clone(),
        agents: agents.iter().map(|a| a.name.clone()).collect(),
        repeat: cfg.repeat,
        summaries: summarize(&results, cfg.repeat),
        results,
        sessions: Vec::new(),
        generated_at: chrono_utc(),
    }
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: &str) -> serde_json::Value {
        serde_json::json!({"id": id, "user_scenario": {}, "evaluation_criteria": {"actions": []}})    }

    #[test]
    fn suite_validates_unique_ids() {
        let s = Tau2Suite::from_str(&serde_json::json!({
            "name": "t", "domain": "airline", "tasks": [rec("1"), rec("2")]
        }).to_string())
        .unwrap();
        assert_eq!(s.tasks.len(), 2);
        assert_eq!(s.max_steps, 40);

        let err = Tau2Suite::from_str(&serde_json::json!({
            "name": "t", "domain": "airline", "tasks": [rec("1"), rec("1")]
        }).to_string())
        .unwrap_err();
        assert!(err.to_string().contains("duplicate"));
    }

    #[test]
    fn import_filters_and_rejects_unknown_ids() {
        let dir = std::env::temp_dir().join("shadow-tau2-import-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.json");
        std::fs::write(
            &path,
            serde_json::json!([rec("a"), rec("b"), rec("c")]).to_string(),
        )
        .unwrap();

        let suite = import_tasks(
            &path,
            "smoke",
            "airline",
            &["c".into(), "a".into()],
            "tau2@test",
            30,
        )
        .unwrap();
        let ids: Vec<String> = suite
            .tasks
            .iter()
            .map(|t| Tau2Suite::task_id(t).unwrap())
            .collect();
        assert_eq!(ids, vec!["c".to_string(), "a".to_string()]);
        assert_eq!(suite.max_steps, 30);

        let err = import_tasks(&path, "smoke", "airline", &["zz".into()], "s", 30).unwrap_err();
        assert!(err.to_string().contains("zz"));
    }

    #[test]
    fn openai_spec_maps_to_litellm_id() {
        let a = Tau2Agent::from_openai(
            "deepseek-chat",
            "deepseek-chat",
            "https://api.deepseek.com/v1",
            Some("KEY".into()),
            None,
        );
        assert_eq!(a.model, "openai/deepseek-chat");
        assert_eq!(a.api_base.as_deref(), Some("https://api.deepseek.com/v1"));

        let b = Tau2Agent::from_openai("x", "anthropic/claude", "http://o", None, None);
        assert_eq!(b.model, "anthropic/claude");
    }

    /// The bench CLI builds τ² participants straight from the shared
    /// agents.toml, so the OpenAI variant must map through.
    #[test]
    fn from_spec_maps_openai_variant() {
        let spec = crate::config::AgentSpec::OpenAi {
            name: "ds".into(),
            base_url: "https://api.deepseek.com/v1".into(),
            model: "deepseek-chat".into(),
            api_key: None,
            api_key_env: Some("DEEPSEEK_API_KEY".into()),
            max_tokens: 512,
            timeout_secs: 300,
            session: None,
            mode: crate::agent::AgentMode::OneShot,
            task_timeout_secs: None,
        };
        let a = Tau2Agent::from_spec(&spec).unwrap();
        assert_eq!(a.name, "ds");
        assert_eq!(a.model, "openai/deepseek-chat");
        assert_eq!(a.api_key_env.as_deref(), Some("DEEPSEEK_API_KEY"));
    }

    /// Non-OpenAI adapters cannot be driven by the τ² driver — the
    /// error must say so instead of silently producing an empty run.
    #[test]
    fn from_spec_rejects_non_openai_variants() {
        let spec = crate::config::AgentSpec::RuleEngine {
            name: "zen".into(),
            task_timeout_secs: None,
        };
        let err = Tau2Agent::from_spec(&spec).unwrap_err();
        assert!(err.to_string().contains("rule-engine"));
    }

    /// The driver's result JSON carries the auditable facts the report
    /// stores. Older driver builds (no answer/usage/steps) must still
    /// parse — the fields are optional.
    #[test]
    fn driver_result_parses_with_and_without_optional_facts() {
        let full: DriverResult = serde_json::from_str(
            r#"{"task_id":"3","passed":true,"reward":1.0,"detail":"ok",
                "duration_secs":1.5,"error":null,"answer":"your flight is booked",
                "tool_calls":2,"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15},
                "steps":[{"type":"tool_call","name":"book_reservation"}]}"#,
        )
        .expect("parse full");
        assert_eq!(full.tool_calls, Some(2));
        assert_eq!(full.answer.as_deref(), Some("your flight is booked"));
        assert_eq!(full.steps.len(), 1);
        let usage: TokenUsage = full.usage.expect("usage").into();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 15);

        let minimal: DriverResult = serde_json::from_str(
            r#"{"task_id":"3","passed":false,"reward":0.0,"detail":"d",
                "duration_secs":0.0,"error":null}"#,
        )
        .expect("parse minimal");
        assert!(minimal.answer.is_none());
        assert!(minimal.usage.is_none());
        assert!(minimal.steps.is_empty());
    }
}
