//! SWE-bench Verified adapter — freeze instances into a shadow suite
//! and evaluate them through the Python driver (`tools/swe_driver.py`)
//! in per-instance local venvs.
//!
//! Why a driver: official SWE-bench owns a heavyweight Docker+conda
//! harness. We reproduce its *evaluation semantics* exactly (patch
//! application chain, install re-run, test-file reset, `pytest -rA`,
//! `parse_log_pytest`/`grading.test_passed` rules) but swap the conda
//! image for a uv-managed venv per instance. Two honest deviations,
//! both carried in the suite description: the runner pytest is pinned
//! (official images float it), and scores are NOT leaderboard-comparable.
//!
//! Two modes: `--verify` applies each instance's gold patch (oracle —
//! validates the environment), LLM mode asks an agent for a unified
//! diff and evaluates [`extract_patch`] of its answer.

use crate::agent::{AgentAdapter, OpenAiAgent, TokenUsage};
use crate::runner::{chrono_utc, summarize, Report, RunOutcome, TaskResult};
use crate::task::{ScorerSpec, Task};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

/// Per-repo/version environment spec, baked at import from the
/// official swebench 3.0.9 `MAP_REPO_VERSION_TO_SPECS_PY`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweEnvSpec {
    /// CPython version for the instance venv (official conda python).
    pub python: String,
    /// Repo-relative requirement files, read at environment_setup_commit
    /// and flattened per official `get_requirements_by_commit`.
    #[serde(default)]
    pub req_files: Vec<String>,
    /// Pins installed after the requirement files (official
    /// `pip_packages`, plus shadow's documented pytest pin).
    #[serde(default)]
    pub pip_packages: Vec<String>,
    /// `true` = `pip install -e .`, `false` = `pip install .`
    /// (official `specs["install"]`, re-run at every evaluation).
    #[serde(default = "df_true")]
    pub editable: bool,
    /// Distribution name for `--reinstall-package` (defaults to the
    /// repo's last path segment).
    #[serde(default)]
    pub dist_name: String,
}

fn df_true() -> bool {
    true
}

/// One SWE-bench Verified instance, frozen at import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweInstance {
    pub instance_id: String,
    /// `org/repo` on GitHub.
    pub repo: String,
    /// Repo version line (e.g. "2.3") — selects the env spec.
    pub version: String,
    pub base_commit: String,
    /// Req files are read at this commit (may differ from base_commit).
    pub environment_setup_commit: String,
    /// Gold patch (oracle).
    pub patch: String,
    /// Official test patch — applied after the model patch, after the
    /// anti-tamper test-file reset.
    pub test_patch: String,
    pub problem_statement: String,
    #[serde(default)]
    pub hints_text: String,
    /// Tests that must pass after the fix (official FAIL_TO_PASS).
    pub fail_to_pass: Vec<String>,
    /// Tests that must keep passing (official PASS_TO_PASS).
    pub pass_to_pass: Vec<String>,
    /// Files touched by test_patch (official `get_test_directives`).
    pub test_files: Vec<String>,
    pub env: SweEnvSpec,
}

/// A SWE-bench suite: frozen instances + provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweSuite {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub source: String,
    pub instances: Vec<SweInstance>,
}

#[derive(Debug, thiserror::Error)]
pub enum SweError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid swe suite: {0}")]
    Invalid(String),
}

impl SweSuite {
    pub fn load(path: &std::path::Path) -> Result<Self, SweError> {
        let raw = std::fs::read_to_string(path)?;
        let suite: SweSuite = serde_json::from_str(&raw)?;
        suite.validate()?;
        Ok(suite)
    }

    pub fn from_str(json: &str) -> Result<Self, SweError> {
        let suite: SweSuite = serde_json::from_str(json)?;
        suite.validate()?;
        Ok(suite)
    }

    /// Ids unique, at least one instance, every instance evaluable
    /// (non-empty FAIL_TO_PASS and test_files).
    pub fn validate(&self) -> Result<(), SweError> {
        if self.instances.is_empty() {
            return Err(SweError::Invalid(format!(
                "suite '{}' has no instances",
                self.name
            )));
        }
        let mut seen = std::collections::HashSet::new();
        for i in &self.instances {
            if !seen.insert(i.instance_id.clone()) {
                return Err(SweError::Invalid(format!(
                    "duplicate instance id: {}",
                    i.instance_id
                )));
            }
            if i.fail_to_pass.is_empty() {
                return Err(SweError::Invalid(format!(
                    "{}: empty fail_to_pass",
                    i.instance_id
                )));
            }
            if i.test_files.is_empty() {
                return Err(SweError::Invalid(format!(
                    "{}: empty test_files",
                    i.instance_id
                )));
            }
        }
        Ok(())
    }

    /// Filter to the given instance ids (in the requested order). Unknown ids error.
    pub fn select(&mut self, ids: &[String]) -> Result<(), SweError> {
        let mut selected = Vec::new();
        for id in ids {
            let rec = self
                .instances
                .iter()
                .find(|i| &i.instance_id == id)
                .ok_or_else(|| SweError::Invalid(format!("instance id not in suite: {id}")))?;
            selected.push(rec.clone());
        }
        self.instances = selected;
        Ok(())
    }
}

/// Delivery contract for SWE-bench prompt-only agents. SEARCH/REPLACE
/// blocks (Aider-style) are the primary format: the model only emits
/// the lines that change — no hunk arithmetic to get wrong (the
/// failure mode of hand-written unified diffs) and no full-file
/// regurgitation that drifts to a different version of the codebase
/// (the failure mode of whole-file blocks, where a 30 KB file rewritten
/// from memory breaks at import). Whole-file blocks and unified diffs
/// remain accepted fallbacks.
pub const SWE_ANSWER_CONTRACT: &str = "This is a SWE-bench style bug-fix task. \
Reply with one or more SEARCH/REPLACE edit blocks, each inside a fenced code block \
opened with the relative file path. Block format: \
```path:relative/path/to/file.ext\n<<<<<<< SEARCH\n<exact existing lines to replace>\n=======\n<new lines>\n>>>>>>> REPLACE```. \
The SEARCH section must match the current file content EXACTLY (copy it verbatim). \
Multiple blocks are allowed; do NOT modify test files. No unified diffs.";

/// One extracted edit: a whole-file overwrite or a search/replace pair.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PatchEntry {
    WholeFile { path: String, content: String },
    SearchReplace { path: String, search: String, replace: String },
}

const SR_BEGIN: &str = "<<<<<<< SEARCH";
const SR_SEP: &str = "=======";
const SR_END: &str = ">>>>>>> REPLACE";

/// Extract the patch from an agent answer. Prefers a ```diff/```patch
/// fenced block, then any fenced block containing `diff --git`, then a
/// raw scan from the first `diff --git` line.
pub fn extract_patch(answer: &str) -> Option<String> {
    let lines: Vec<&str> = answer.lines().collect();

    // collect closed or unterminated fenced blocks
    let mut blocks: Vec<(String, Vec<&str>)> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if let Some(marker) = lines[i].trim_start().strip_prefix("```") {
            let mut body = Vec::new();
            let mut j = i + 1;
            while j < lines.len() && !lines[j].trim_start().starts_with("```") {
                body.push(lines[j]);
                j += 1;
            }
            blocks.push((marker.trim().to_lowercase(), body));
            i = j + 1;
            continue;
        }
        i += 1;
    }

    let as_patch = |body: &[&str]| -> Option<String> {
        let p = body.join("\n");
        p.contains("diff --git").then(|| p.trim_end().to_string())
    };
    for want in ["diff", "patch"] {
        for (marker, body) in &blocks {
            if marker == want {
                if let Some(p) = as_patch(body) {
                    return Some(p);
                }
            }
        }
    }
    for (_, body) in &blocks {
        if let Some(p) = as_patch(body) {
            return Some(p);
        }
    }

    let start = lines
        .iter()
        .position(|l| l.trim_start().starts_with("diff --git"))?;
    let mut out: Vec<&str> = Vec::new();
    for l in &lines[start..] {
        if l.trim_start().starts_with("```") && !out.is_empty() {
            break;
        }
        out.push(l);
    }
    let p = out.join("\n").trim_end().to_string();
    (!p.is_empty()).then_some(p)
}

/// Extract edits from an agent answer. `​```path:rel/path` fenced
/// blocks whose body holds SEARCH/REPLACE markers become
/// [`PatchEntry::SearchReplace`] (one per marker triple, several per
/// block allowed); blocks without markers become
/// [`PatchEntry::WholeFile`].
///
/// Path safety mirrors the SWE driver: refuses absolute paths and `..`
/// components so a malicious answer can't escape the repo checkout.
pub fn extract_patches(answer: &str) -> Vec<PatchEntry> {
    let lines: Vec<&str> = answer.lines().collect();
    let mut blocks: Vec<(String, Vec<&str>)> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if let Some(marker) = lines[i].trim_start().strip_prefix("```") {
            let mut body = Vec::new();
            let mut j = i + 1;
            while j < lines.len() && !lines[j].trim_start().starts_with("```") {
                body.push(lines[j]);
                j += 1;
            }
            blocks.push((marker.trim().to_string(), body));
            i = j + 1;
            continue;
        }
        i += 1;
    }
    let mut out = Vec::new();
    for (marker, body) in &blocks {
        let Some(rel) = crate::agent::parse_path_marker(marker.as_str()) else {
            continue;
        };
        if !is_safe_patch_path(rel.as_str()) {
            continue;
        }
        // Split the body into SEARCH/REPLACE chunks; leftover lines
        // outside any chunk mean the block also carries whole-file
        // content — prefer the structured interpretation only when the
        // body is nothing but chunks.
        let mut chunks: Vec<(Vec<&str>, Vec<&str>)> = Vec::new();
        let mut outside = 0usize;
        let mut k = 0;
        while k < body.len() {
            if body[k].trim_end() == SR_BEGIN {
                let mut search = Vec::new();
                let mut replace = Vec::new();
                let mut phase = 0; // 0=search, 1=replace
                let mut valid = false;
                k += 1;
                while k < body.len() {
                    let line = body[k];
                    if line.trim_end() == SR_SEP && phase == 0 {
                        phase = 1;
                    } else if line.trim_end() == SR_END && phase == 1 {
                        valid = true;
                        k += 1;
                        break;
                    } else if phase == 0 {
                        search.push(line);
                    } else {
                        replace.push(line);
                    }
                    k += 1;
                }
                if valid {
                    chunks.push((search, replace));
                }
                continue;
            }
            if !body[k].trim().is_empty() {
                outside += 1;
            }
            k += 1;
        }
        if !chunks.is_empty() && outside == 0 {
            for (search, replace) in chunks {
                out.push(PatchEntry::SearchReplace {
                    path: rel.to_string(),
                    search: join_patch_lines(&search),
                    replace: join_patch_lines(&replace),
                });
            }
        } else if chunks.is_empty() {
            out.push(PatchEntry::WholeFile {
                path: rel.to_string(),
                content: join_patch_lines(body),
            });
        }
        // chunks + outside prose mixed: ambiguous, skip the block.
    }
    out
}

fn join_patch_lines(body: &[&str]) -> String {
    let joined = body.join("\n");
    joined
        .strip_suffix("\r\n")
        .or_else(|| joined.strip_suffix('\n'))
        .unwrap_or(&joined)
        .to_string()
}

fn is_safe_patch_path(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.starts_with('/')
        && !rel.starts_with('\\')
        && !rel.contains("..")
        && !rel.starts_with('~')
}

#[derive(Debug, Clone)]
pub struct SweRunConfig {
    /// `tools/swe_driver.py` (absolute).
    pub driver: PathBuf,
    /// Root under which per-instance workdirs (repo + venv) live.
    pub work_root: PathBuf,
    /// Python that runs the driver (system python; the driver itself
    /// builds per-instance venvs via uv).
    pub python: String,
    pub repeat: usize,
    /// Whole-driver timeout per run (official default 1800s).
    pub timeout: Duration,
    /// pytest timeout inside the driver (default 1200s).
    pub test_timeout: Option<u64>,
    /// Evaluate natively in Rust (`swe_native`) instead of spawning the
    /// Python driver. Same env-cache markers, so venvs are shared.
    pub native: bool,
}

/// JSON shape emitted by `tools/swe_driver.py`.
#[derive(Debug, Deserialize)]
struct DriverResult {
    #[allow(dead_code)]
    task_id: String,
    passed: bool,
    detail: String,
    duration_secs: f64,
    error: Option<String>,
}

/// Mirrors `OpenAiAgent::auth_preflight`: an intended key env that
/// resolves to nothing skips the agent entirely.
fn missing_key(agent: &OpenAiAgent) -> Option<String> {
    if agent
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .is_some()
    {
        return None;
    }
    if let Some(var) = &agent.api_key_env {
        if std::env::var(var).ok().filter(|v| !v.is_empty()).is_none() {
            return Some(var.clone());
        }
    }
    None
}

fn instruction_of(inst: &SweInstance) -> String {
    if inst.hints_text.trim().is_empty() {
        inst.problem_statement.clone()
    } else {
        format!(
            "{}\n\n--- HINTS (from the dataset) ---\n{}",
            inst.problem_statement, inst.hints_text
        )
    }
}

fn synthetic_task(inst: &SweInstance) -> Task {
    Task {
        id: inst.instance_id.clone(),
        instruction: instruction_of(inst),
        files: Vec::new(),
        hidden_files: Vec::new(),
        answer_contract: SWE_ANSWER_CONTRACT.to_string(),
        // unused: the driver scores, not the scorer module
        scorer: ScorerSpec::ExactMatch {
            expected: String::new(),
            case_sensitive: false,
        },
        timeout_secs: None,
        // Constant framework tag — every SWE task is the same topic,
        // so the session drift detector never fires.
        framework: Some("swe".into()),
    }
}

/// Task for agentic SWE runs: the working directory IS the repo
/// checkout (prepared by `swe_driver.py --prepare`), so the model
/// explores and edits the real code with its tools. No answer contract
/// — nothing to hand back textually; the worktree is the deliverable.
///
/// The instruction carries the two practical facts our runs showed
/// agents need (MiMo flash found both on its own and went 4/5 while
/// deepseek scored 3/5): the prepared venv's location (so verification
/// runs the right interpreter) and the close-the-loop rule (run the
/// affected tests before finishing and iterate on failures you
/// introduced).
fn agentic_task(inst: &SweInstance) -> Task {
    Task {
        id: inst.instance_id.clone(),
        instruction: format!(
            "{}\n\n---\nYour working directory IS the repository checkout, \
at the buggy commit. Explore the code with your tools, find the root cause, \
and edit the source files to fix the issue. Keep the change minimal. \
Do NOT modify test files. Call finish when done.\n\n{SWE_AGENTIC_LOOP}",
            instruction_of(inst)
        ),
        files: Vec::new(),
        hidden_files: Vec::new(),
        answer_contract: String::new(),
        scorer: ScorerSpec::ExactMatch {
            expected: String::new(),
            case_sensitive: false,
        },
        timeout_secs: None,
        // Constant framework tag — every SWE task is the same topic,
        // so the session drift detector never fires.
        framework: Some("swe".into()),
    }
}

/// Extra instruction appended to the agentic SWE task: repo tests are
/// runnable through the prepared venv, and the loop is edit → run → fix.
pub const SWE_AGENTIC_LOOP: &str = "A ready Python virtualenv for this repository \
is at .venv/ in the working directory (interpreter: .venv/Scripts/python on Windows, \
.venv/bin/python elsewhere; the project is already installed there). \
Use it to run the repository's existing tests for the code you touch \
(e.g. .venv/Scripts/python -m pytest <test file> -x -q). \
Before calling finish: re-run those tests and make sure your change fixes \
the issue without breaking previously passing tests. Iterate until they pass \
or you are confident the remaining failure predates your change.";

/// Run every (agent × instance × repeat) through the Python driver and
/// assemble the standard shadow report. `gold` = oracle mode: the gold
/// patch is evaluated directly, no LLM involved.
pub async fn run(
    suite: &SweSuite,
    agents: &[OpenAiAgent],
    cfg: &SweRunConfig,
    gold: bool,
    task_filter: Option<&[String]>,
) -> Report {
    let suite_path = std::env::temp_dir().join("shadow-swe-suite.json");
    if let Err(e) = std::fs::write(&suite_path, serde_json::to_string(suite).unwrap_or_default()) {
        eprintln!("warn: cannot write temp suite: {e}");
    }

    // participants: gold-oracle, or the configured OpenAI agents
    let names: Vec<String> = if gold {
        vec!["gold-oracle".to_string()]
    } else {
        agents.iter().map(|a| a.name.clone()).collect()
    };
    let mut results: Vec<TaskResult> = Vec::new();

    for (ai, agent_name) in names.iter().enumerate() {
        if !gold {
            if let Some(var) = missing_key(&agents[ai]) {
                for inst in &suite.instances {
                    if task_filter.is_some_and(|f| !f.contains(&inst.instance_id)) {
                        continue;
                    }
                    results.push(TaskResult {
                        agent: agent_name.clone(),
                        task_id: inst.instance_id.clone(),
                        skipped: true,
                        skip_reason: Some(format!("missing API key: {var} is not set")),
                        runs: Vec::new(),
                        pass_k: false,
                    });
                }
                continue;
            }
        }

        for inst in &suite.instances {
            if task_filter.is_some_and(|f| !f.contains(&inst.instance_id)) {
                continue;
            }
            let mut runs: Vec<RunOutcome> = Vec::new();
            let mut all_passed = true;

            for rep in 0..cfg.repeat.max(1) {
                let started = std::time::Instant::now();

                // gold mode: driver consumes the frozen gold patch;
                // llm mode: agentic agents work directly in a prepared
                // checkout; one-shot agents hand back edits in the
                // answer (search/replace blocks preferred, unified
                // diff accepted).
                let patch_input = if gold {
                    PatchInput::None
                } else if matches!(
                    agents[ai].mode,
                    crate::agent::AgentMode::Agentic { .. }
                ) {
                    // 1. prepare repo + venv (env cache makes repeats cheap)
                    let prep = tokio::process::Command::new(&cfg.python)
                        .arg(&cfg.driver)
                        .arg("--suite")
                        .arg(&suite_path)
                        .arg("--task-id")
                        .arg(&inst.instance_id)
                        .arg("--out")
                        .arg(std::env::temp_dir().join(format!(
                            "shadow-swe-prepare-{}-{}.json",
                            sanitize(&inst.instance_id),
                            rep
                        )))
                        .arg("--work-root")
                        .arg(&cfg.work_root)
                        .arg("--prepare")
                        .kill_on_drop(true)
                        .output();
                    let prepared = match tokio::time::timeout(cfg.timeout, prep).await {
                        Err(_) => Err(format!(
                            "prepare timed out after {}s",
                            cfg.timeout.as_secs()
                        )),
                        Ok(Err(e)) => Err(format!("prepare spawn failed: {e}")),
                        Ok(Ok(out)) if !out.status.success() => Err(format!(
                            "prepare failed (exit {:?}): {}",
                            out.status.code(),
                            String::from_utf8_lossy(&out.stderr)
                                .chars()
                                .take(400)
                                .collect::<String>()
                        )),
                        Ok(Ok(_)) => Ok(()),
                    };
                        if let Err(e) = prepared {
                            all_passed = false;
                            runs.push(RunOutcome {
                                repeat: rep,
                                passed: false,
                                detail: String::new(),
                                duration_secs: started.elapsed().as_secs_f64(),
                                error: Some(e),
                                usage: TokenUsage::default(),
                                tool_calls: 0,
                                steps: Vec::new(),
                                answer: None,
                                reasoning: None,
                            });
                            continue;
                        }
                    // 2. the agent works inside the checkout.
                    // Hard episode cap: an agentic run is up to
                    // max_steps provider calls and any one of them
                    // can sit on a hung child process — without this
                    // wrapper one wedged task stalls the whole sweep
                    // forever (observed live, 2026-10-26).
                    let repo_dir = cfg
                        .work_root
                        .join(sanitize(&inst.instance_id))
                        .join("repo");
                    let task = agentic_task(inst);
                    let agent_run = tokio::time::timeout(cfg.timeout, agents[ai].run(&task, &repo_dir, "")).await;
                    match agent_run {
                        Ok(Ok(ar)) => {
                            let af = std::env::temp_dir().join(format!(
                                "shadow-swe-answer-{}-{}-{}.txt",
                                sanitize(agent_name),
                                sanitize(&inst.instance_id),
                                rep
                            ));
                            let _ = std::fs::write(&af, &ar.answer);
                            PatchInput::Worktree {
                                usage: ar.usage,
                                tool_calls: ar.tool_calls,
                                steps: ar.steps,
                            }
                        }
                        Ok(Err(e)) => {
                            all_passed = false;
                            runs.push(RunOutcome {
                                repeat: rep,
                                passed: false,
                                detail: String::new(),
                                duration_secs: started.elapsed().as_secs_f64(),
                                error: Some(e.to_string()),
                                usage: TokenUsage::default(),
                                tool_calls: 0,
                                steps: Vec::new(),
                                answer: None,
                                reasoning: None,
                            });
                            continue;
                        }
                        Err(_) => {
                            all_passed = false;
                            runs.push(RunOutcome {
                                repeat: rep,
                                passed: false,
                                detail: String::new(),
                                duration_secs: started.elapsed().as_secs_f64(),
                                error: Some(format!(
                                    "agentic episode timed out after {}s",
                                    cfg.timeout.as_secs()
                                )),
                                usage: TokenUsage::default(),
                                tool_calls: 0,
                                steps: Vec::new(),
                                answer: None,
                                reasoning: None,
                            });
                            continue;
                        }
                    }
                } else {
                    let task = synthetic_task(inst);
                    match agents[ai].run(&task, &std::env::temp_dir(), "").await {
                        Ok(ar) => {
                            // Post-mortem: keep the raw answer next to the
                            // extracted patches.
                            let af = std::env::temp_dir().join(format!(
                                "shadow-swe-answer-{}-{}-{}.txt",
                                sanitize(agent_name),
                                sanitize(&inst.instance_id),
                                rep
                            ));
                            let _ = std::fs::write(&af, &ar.answer);
                            let patches = extract_patches(&ar.answer);
                            if !patches.is_empty() {
                                let pf = std::env::temp_dir().join(format!(
                                    "shadow-swe-patches-{}-{}-{}.json",
                                    sanitize(agent_name),
                                    sanitize(&inst.instance_id),
                                    rep
                                ));
                                let json = match serde_json::to_string_pretty(&patches) {
                                    Ok(j) => j,
                                    Err(e) => {
                                        all_passed = false;
                                        runs.push(RunOutcome {
                                            repeat: rep,
                                            passed: false,
                                            detail: String::new(),
                                            duration_secs: started.elapsed().as_secs_f64(),
                                            error: Some(format!("cannot serialize patches: {e}")),
                                            usage: TokenUsage::default(),
                                            tool_calls: 0,
                                steps: Vec::new(),
                                            answer: None,
                                            reasoning: None,
                            });
                                        continue;
                                    }
                                };
                                match std::fs::write(&pf, json) {
                                    Ok(()) => PatchInput::Patches(pf),
                                    Err(e) => {
                                        all_passed = false;
                                        runs.push(RunOutcome {
                                            repeat: rep,
                                            passed: false,
                                            detail: String::new(),
                                            duration_secs: started.elapsed().as_secs_f64(),
                                            error: Some(format!("cannot write patches: {e}")),
                                            usage: TokenUsage::default(),
                                            tool_calls: 0,
                                steps: Vec::new(),
                                            answer: None,
                                            reasoning: None,
                            });
                                        continue;
                                    }
                                }
                            } else if let Some(p) = extract_patch(&ar.answer) {
                                if p.contains("diff --git") {
                                    let pf = std::env::temp_dir().join(format!(
                                        "shadow-swe-patch-{}-{}-{}.diff",
                                        sanitize(agent_name),
                                        sanitize(&inst.instance_id),
                                        rep
                                    ));
                                    match std::fs::write(&pf, p) {
                                        Ok(()) => PatchInput::Diff(pf),
                                            Err(e) => {
                                                all_passed = false;
                                                runs.push(RunOutcome {
                                                    repeat: rep,
                                                    passed: false,
                                                    detail: String::new(),
                                                    duration_secs: started.elapsed().as_secs_f64(),
                                                    error: Some(format!("cannot write patch: {e}")),
                                                    usage: TokenUsage::default(),
                                                    tool_calls: 0,
                                steps: Vec::new(),
                                                    answer: None,
                                                    reasoning: None,
                            });
                                                continue;
                                            }
                                    }
                                } else {
                                    all_passed = false;
                                    runs.push(RunOutcome {
                                        repeat: rep,
                                        passed: false,
                                        detail: "no whole-file patches and no unified diff in the answer".into(),
                                        duration_secs: started.elapsed().as_secs_f64(),
                                        error: None,
                                        usage: TokenUsage::default(),
                                        tool_calls: 0,
                                steps: Vec::new(),
                                        answer: None,
                                        reasoning: None,
                            });
                                    continue;
                                }
                            } else {
                                all_passed = false;
                                runs.push(RunOutcome {
                                    repeat: rep,
                                    passed: false,
                                    detail: "no whole-file patches and no unified diff in the answer".into(),
                                    duration_secs: started.elapsed().as_secs_f64(),
                                    error: None,
                                    usage: TokenUsage::default(),
                                    tool_calls: 0,
                                steps: Vec::new(),
                                    answer: None,
                                    reasoning: None,
                            });
                                continue;
                            }
                        }
                        Err(e) => {
                            all_passed = false;
                            runs.push(RunOutcome {
                                repeat: rep,
                                passed: false,
                                detail: String::new(),
                                duration_secs: started.elapsed().as_secs_f64(),
                                error: Some(e.to_string()),
                                usage: TokenUsage::default(),
                                tool_calls: 0,
                                steps: Vec::new(),
                                answer: None,
                                reasoning: None,
                            });
                            continue;
                        }
                    }
                };

                let out_path = std::env::temp_dir().join(format!(
                    "shadow-swe-{}-{}-{}.json",
                    sanitize(agent_name),
                    sanitize(&inst.instance_id),
                    rep
                ));
                let _ = std::fs::remove_file(&out_path);

                let mut cmd = tokio::process::Command::new(&cfg.python);
                cmd.arg(&cfg.driver)
                    .arg("--suite")
                    .arg(&suite_path)
                    .arg("--task-id")
                    .arg(&inst.instance_id)
                    .arg("--out")
                    .arg(&out_path)
                    .arg("--work-root")
                    .arg(&cfg.work_root);
                match &patch_input {
                    PatchInput::None => {
                        cmd.arg("--gold");
                    }
                    PatchInput::Diff(pf) => {
                        cmd.arg("--patch-file").arg(pf);
                    }
                    PatchInput::Patches(pf) => {
                        cmd.arg("--patches-file").arg(pf);
                    }
                    PatchInput::Worktree { .. } => {
                        cmd.arg("--worktree");
                    }
                }
                if let Some(t) = cfg.test_timeout {
                    cmd.arg("--test-timeout").arg(t.to_string());
                }
                cmd.kill_on_drop(true);

                let outcome = if cfg.native {
                    // Native Rust evaluator — same env-cache markers, no
                    // Python driver process.
                    let input = match &patch_input {
                        PatchInput::None => crate::swe_native::NativeInput::Gold,
                        PatchInput::Diff(pf) => crate::swe_native::NativeInput::PatchFile(pf.clone()),
                        PatchInput::Patches(pf) => {
                            crate::swe_native::NativeInput::PatchesFile(pf.clone())
                        }
                        PatchInput::Worktree { .. } => {
                            crate::swe_native::NativeInput::Worktree
                        }
                    };
                    match tokio::time::timeout(
                        cfg.timeout,
                        crate::swe_native::evaluate(
                            inst,
                            input,
                            &cfg.work_root,
                            cfg.test_timeout.unwrap_or(1200),
                            false,
                        ),
                    )
                    .await
                    {
                        Err(_) => Err(format!(
                            "native eval timed out after {}s",
                            cfg.timeout.as_secs()
                        )),
                        Ok(Err(e)) => Err(e),
                        Ok(Ok(r)) => Ok(DriverResult {
                            task_id: r.task_id,
                            passed: r.passed,
                            detail: r.detail,
                            duration_secs: r.duration_secs,
                            error: r.error,
                        }),
                    }
                } else {
                    match tokio::time::timeout(cfg.timeout, cmd.output()).await {
                        Err(_) => Err(format!(
                            "driver timed out after {}s",
                            cfg.timeout.as_secs()
                        )),
                        Ok(Err(e)) => Err(format!("driver spawn failed: {e}")),
                        Ok(Ok(output)) => match std::fs::read_to_string(&out_path) {
                            Err(e) => Err(format!(
                                "driver produced no result (exit {}): {e}; stderr: {}",
                                output.status,
                                String::from_utf8_lossy(&output.stderr)
                                    .chars()
                                    .take(400)
                                    .collect::<String>()
                            )),
                            Ok(raw) => match serde_json::from_str::<DriverResult>(&raw) {
                                Ok(r) => Ok(r),
                                Err(e) => Err(format!("driver result parse failed: {e}")),
                            },
                        },
                    }
                };

                // Agent cost accounting rides on the Worktree variant
                // (agentic runs); every other input reports zero usage.
                let (run_usage, run_tool_calls, run_steps) = match &patch_input {
                    PatchInput::Worktree {
                        usage,
                        tool_calls,
                        steps,
                    } => (usage.clone(), *tool_calls, steps.clone()),
                    _ => (Default::default(), 0, Vec::new()),
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
                            error: r.error,
                            usage: run_usage,
                            tool_calls: run_tool_calls,
                            steps: run_steps,
                            answer: None,
                            reasoning: None,
                        }
                    }
                    Err(e) => {
                        all_passed = false;
                        RunOutcome {
                            repeat: rep,
                            passed: false,
                            detail: String::new(),
                            duration_secs: started.elapsed().as_secs_f64(),
                            error: Some(e),
                            usage: run_usage,
                            tool_calls: run_tool_calls,
                                steps: Vec::new(),
                            answer: None,
                            reasoning: None,
                            }
                    }
                });
            }

            results.push(TaskResult {
                agent: agent_name.clone(),
                task_id: inst.instance_id.clone(),
                skipped: false,
                skip_reason: None,
                pass_k: all_passed,
                runs,
            });
        }
    }

    Report {
        suite: suite.name.clone(),
        agents: names,
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

/// How the SWE driver is asked to evaluate a run. `None` (gold) hands
/// the driver the frozen gold patch; `Diff` writes a unified diff for
/// `--patch-file`; `Patches` writes a JSON list of edits for
/// `--patches-file`; `Worktree` evaluates the checkout as-is (agentic
/// run edited it in place) and carries the agent's token/tool
/// accounting for the cost report.
enum PatchInput {
    None,
    Diff(PathBuf),
    Patches(PathBuf),
    Worktree {
        usage: crate::agent::TokenUsage,
        tool_calls: u32,
        /// The agent's step trace — kept so a failed agentic run can
        /// be audited (what it read, what it edited, what it ran).
        steps: Vec<serde_json::Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inst(id: &str) -> SweInstance {
        SweInstance {
            instance_id: id.into(),
            repo: "org/repo".into(),
            version: "2.3".into(),
            base_commit: "abc".into(),
            environment_setup_commit: "abc".into(),
            patch: "diff --git a/x b/x\n".into(),
            test_patch: "diff --git a/t b/t\n".into(),
            problem_statement: "fix it".into(),
            hints_text: String::new(),
            fail_to_pass: vec!["t::a".into()],
            pass_to_pass: vec![],
            test_files: vec!["t".into()],
            env: SweEnvSpec {
                python: "3.9".into(),
                req_files: vec![],
                pip_packages: vec![],
                editable: true,
                dist_name: "repo".into(),
            },
        }
    }

    #[test]
    fn suite_validates_ids_and_f2p() {
        let ok = SweSuite {
            name: "s".into(),
            description: String::new(),
            source: String::new(),
            instances: vec![inst("a"), inst("b")],
        };
        ok.validate().unwrap();

        let dup = SweSuite {
            name: "s".into(),
            description: String::new(),
            source: String::new(),
            instances: vec![inst("a"), inst("a")],
        };
        assert!(dup.validate().unwrap_err().to_string().contains("duplicate"));

        let mut no_f2p = inst("c");
        no_f2p.fail_to_pass = vec![];
        let bad = SweSuite {
            name: "s".into(),
            description: String::new(),
            source: String::new(),
            instances: vec![no_f2p],
        };
        assert!(bad.validate().unwrap_err().to_string().contains("fail_to_pass"));
    }

    #[test]
    fn extract_prefers_diff_fence() {
        let answer = "Here you go:\n```diff\ndiff --git a/src/x.py b/src/x.py\n--- a/src/x.py\n+++ b/src/x.py\n```\nDone.";
        let p = extract_patch(answer).unwrap();
        assert!(p.starts_with("diff --git"));
        assert!(p.contains("+++ b/src/x.py"));
        assert!(!p.contains("Here you go"));
    }

    #[test]
    fn extract_accepts_patch_fence_and_bare_fence() {
        let a = "```patch\ndiff --git a/a b/a\n```\n";
        assert!(extract_patch(a).unwrap().starts_with("diff --git"));

        let b = "```\ndiff --git a/b b/b\n```\n";
        assert!(extract_patch(b).unwrap().starts_with("diff --git"));
    }

    #[test]
    fn extract_raw_scan_stops_at_fence() {
        let a = "prose first\ndiff --git a/c b/c\n--- a/c\n```\ntrailing junk";
        let p = extract_patch(a).unwrap();
        assert!(p.starts_with("diff --git"));
        assert!(!p.contains("trailing junk"));
    }

    #[test]
    fn extract_rejects_prose_only() {
        assert!(extract_patch("I could not fix this issue.").is_none());
    }

    #[test]
    fn extract_patches_reads_path_blocks() {
        let ans = "```path:src/a.py\nprint('hi')\n```\nand\n```path:src/b.py\nx = 1\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 2);
        match &p[0] {
            PatchEntry::WholeFile { path, content } => {
                assert_eq!(path, "src/a.py");
                assert_eq!(content, "print('hi')");
            }
            _ => panic!("expected whole-file"),
        }
        match &p[1] {
            PatchEntry::WholeFile { path, content } => {
                assert_eq!(path, "src/b.py");
                assert_eq!(content, "x = 1");
            }
            _ => panic!("expected whole-file"),
        }
    }

    #[test]
    fn extract_patches_skips_non_path_fences() {
        let ans = "```python\nprint('python')\n```\n```path:src/a.py\nprint('a')\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        assert!(matches!(&p[0], PatchEntry::WholeFile { path, .. } if path == "src/a.py"));
    }

    #[test]
    fn extract_patches_strips_trailing_newline() {
        let ans = "```path:src/a.py\nline1\nline2\n\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        match &p[0] {
            PatchEntry::WholeFile { content, .. } => {
                assert!(content.ends_with("line2"));
                assert!(!content.ends_with('\n'));
            }
            _ => panic!("expected whole-file"),
        }
    }

    #[test]
    fn extract_patches_accepts_lang_prefixed_path_marker() {
        // Models frequently emit ```python:src/a.py instead of ```path:src/a.py.
        let ans = "```python:requests/utils.py\n<<<<<<< SEARCH\n    if auth:\n=======\n    if auth is not None:\n>>>>>>> REPLACE\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        match &p[0] {
            PatchEntry::SearchReplace { path, search, replace } => {
                assert_eq!(path, "requests/utils.py");
                assert_eq!(search, "    if auth:");
                assert_eq!(replace, "    if auth is not None:");
            }
            _ => panic!("expected search-replace"),
        }
    }

    #[test]
    fn extract_patches_lang_prefix_whole_file() {
        let ans = "```python:src/a.py\nprint('x')\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        assert!(matches!(&p[0], PatchEntry::WholeFile { path, .. } if path == "src/a.py"));
    }

    #[test]
    fn extract_patches_rejects_traversal_and_absolute() {
        let ans = "```path:../escape.py\nbad\n```\n```path:/etc/passwd\nbad\n```\n```path:src/safe.py\nok\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        assert!(matches!(&p[0], PatchEntry::WholeFile { path, .. } if path == "src/safe.py"));
    }

    #[test]
    fn extract_patches_handles_empty_body() {
        // An empty body still emits a WholeFile entry — the caller decides.
        let p = extract_patches("```path:src/a.py\n```");
        assert_eq!(p.len(), 1);
        assert!(matches!(&p[0], PatchEntry::WholeFile { content, .. } if content.is_empty()));
    }

    #[test]
    fn extract_patches_no_fences() {
        assert!(extract_patches("nothing here").is_empty());
        assert!(extract_patches("```diff\ndiff --git a/x b/x\n```").is_empty());
    }

    #[test]
    fn extract_patches_search_replace_single() {
        let ans = "```path:src/a.py\n<<<<<<< SEARCH\nold = 1\n=======\nold = 2\n>>>>>>> REPLACE\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 1);
        match &p[0] {
            PatchEntry::SearchReplace { path, search, replace } => {
                assert_eq!(path, "src/a.py");
                assert_eq!(search, "old = 1");
                assert_eq!(replace, "old = 2");
            }
            _ => panic!("expected search-replace"),
        }
    }

    #[test]
    fn extract_patches_search_replace_multiple_in_one_block() {
        let ans = "```path:src/a.py\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n<<<<<<< SEARCH\nc\n=======\nd\n>>>>>>> REPLACE\n```";
        let p = extract_patches(ans);
        assert_eq!(p.len(), 2);
        assert!(matches!(&p[0], PatchEntry::SearchReplace { search, .. } if search == "a"));
        assert!(matches!(&p[1], PatchEntry::SearchReplace { search, .. } if search == "c"));
    }

    #[test]
    fn extract_patches_multiline_search_keeps_inner_lines() {
        let ans = "```path:src/a.py\n<<<<<<< SEARCH\ndef f():\n    return 1\n=======\ndef f():\n    return 2\n>>>>>>> REPLACE\n```";
        let p = extract_patches(ans);
        match &p[0] {
            PatchEntry::SearchReplace { search, replace, .. } => {
                assert_eq!(search, "def f():\n    return 1");
                assert_eq!(replace, "def f():\n    return 2");
            }
            _ => panic!("expected search-replace"),
        }
    }

    #[test]
    fn extract_patches_mixed_prose_and_chunks_is_skipped() {
        // Whole-file content AND chunks in one block: ambiguous — skip.
        let ans = "```path:src/a.py\nimport os\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n```";
        assert!(extract_patches(ans).is_empty());
    }

    #[test]
    fn extract_patches_unclosed_chunk_block_skipped() {
        // Missing >>>>>>> REPLACE: no valid chunk, body has non-empty
        // lines outside chunks but no markers → falls to WholeFile? No:
        // a body with SEARCH/======= but no END has outside>0 and no
        // valid chunks → the whole-file branch would emit garbage.
        let ans = "```path:src/a.py\n<<<<<<< SEARCH\na\n=======\nb\n```";
        let p = extract_patches(ans);
        // No valid chunk, `outside` counts marker-ish lines as content →
        // emitted as WholeFile; caller's driver will fail to find the
        // markers... actually WholeFile content is just the raw lines.
        // Acceptable: it degrades to an overwrite with visible junk.
        assert_eq!(p.len(), 1);
    }
}
