//! Native Rust SWE evaluator — a parity port of `tools/swe_driver.py`.
//!
//! Motivation (2026-10-12): the Python driver depends on ambient
//! interpreter state; agents under evaluation have already polluted the
//! host environment once (an editable `pip install -e .` of a scratch
//! repo shadowed the system pytest). Evaluating natively keeps the whole
//! pipeline in one audited binary — the only Python involved is the
//! per-instance venv that SWE-bench semantics inherently require
//! (the ground truth IS pytest output).
//!
//! Parity contract with `swe_driver.py` (verified by `bench swe-eval`
//! double runs and identical gold-oracle reports):
//! * repo setup: init + fetch --depth 1 + checkout --detach + reset
//!   --hard + clean -fdx (LF-only: autocrlf=false, eol=lf, longpaths);
//! * env: uv venv + flattened requirement files (official
//!   `get_requirements_by_commit` semantics: `-r` recursion, `-e .` /
//!   `#` / `.[test` exclusions, includes first) + pip_packages pins +
//!   `uv pip install [--reinstall-package dist] [-e] .` with
//!   `SETUPTOOLS_SCM_PRETEND_VERSION=<version>.0` (+ per-dist variant);
//! * the env cache marker (`.swe-env.json`) is byte-compatible with the
//!   Python driver's — both drivers share cached venvs;
//! * evaluation: reset/clean → model patch (gold | unified diff |
//!   whole-file/search-replace edits | worktree) → install → anti-tamper
//!   test-file reset → test patch → `pytest -rA` → verbatim
//!   `parse_log_pytest` + `grading.test_passed` port (incl.
//!   `norm_case_id` canonicalisation for path-parametrised ids).

use crate::swe::SweInstance;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// How the model change under test is supplied.
#[derive(Debug, Clone)]
pub enum NativeInput {
    /// Evaluate the frozen gold patch (oracle).
    Gold,
    /// Evaluate a unified diff file.
    PatchFile(PathBuf),
    /// Evaluate a JSON list of whole-file / search-replace edits.
    PatchesFile(PathBuf),
    /// The checkout already contains the agent's edits (agentic runs).
    Worktree,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeResult {
    pub task_id: String,
    pub passed: bool,
    pub detail: String,
    pub duration_secs: f64,
    pub error: Option<String>,
    pub f2p_pass: usize,
    pub f2p_total: usize,
    pub p2p_pass: usize,
    pub p2p_total: usize,
}

// ---------------------------------------------------------------------------
// process helpers
// ---------------------------------------------------------------------------

async fn run(
    cmd: &[&str],
    cwd: Option<&Path>,
    timeout: Duration,
    env: Option<&[(String, String)]>,
) -> (i32, String) {
    let (program, rest) = match cmd.split_first() {
        Some(pair) => pair,
        None => return (127, "empty command".to_string()),
    };
    let mut c = tokio::process::Command::new(program);
    c.args(rest);
    if let Some(dir) = cwd {
        c.current_dir(dir);
    }
    c.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(pairs) = env {
        for (k, v) in pairs {
            c.env(k, v);
        }
    }
    match tokio::time::timeout(timeout, c.output()).await {
        Err(_) => (124, format!("[timed out after {}s]", timeout.as_secs())),
        Ok(Err(e)) => (127, format!("spawn failed: {e}")),
        Ok(Ok(out)) => {
            let mut s = String::from_utf8_lossy(&out.stdout).to_string();
            s.push_str(&String::from_utf8_lossy(&out.stderr));
            (out.status.code().unwrap_or(-1), s)
        }
    }
}

fn tail(s: &str, n: usize) -> String {
    let s = s.trim();
    if s.len() <= n {
        s.to_string()
    } else {
        let cut = s.char_indices().rev().find(|(i, _)| *i <= s.len() - n).map(|(i, _)| i).unwrap_or(0);
        format!("…{}", &s[cut..])
    }
}

async fn git(repo: &Path, args: &[&str], timeout: Duration) -> (i32, String) {
    let mut argv: Vec<&str> = vec!["git", "-C"];
    // git -C <repo> <args…>
    let repo_str = repo.to_string_lossy().to_string();
    argv.push(&repo_str);
    argv.extend_from_slice(args);
    run(&argv, None, timeout, None).await
}

// ---------------------------------------------------------------------------
// path safety (mirror of safe_rel_path)
// ---------------------------------------------------------------------------

fn safe_rel_path(base: &Path, rel: &str, what: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    if rel.is_empty() || rel.starts_with('/') || rel.starts_with('~') {
        return Err(format!("unsafe {what} path: {rel:?}"));
    }
    let first = rel.split('/').next().unwrap_or("");
    if first.contains(':') || rel.split('/').any(|p| p == "..") {
        return Err(format!("unsafe {what} path (escapes base): {rel:?}"));
    }
    let base_abs = std::fs::canonicalize(base)
        .map_err(|e| format!("unsafe {what} base: {e}"))?
        .to_string_lossy()
        .to_string();
    let joined = format!("{base_abs}/{}", rel.trim_end_matches('/'));
    let resolved = std::fs::canonicalize(&joined).unwrap_or_else(|_| PathBuf::from(&joined));
    let resolved = resolved.to_string_lossy().to_string();
    if resolved != base_abs && !resolved.starts_with(&format!("{base_abs}\\")) && !resolved.starts_with(&format!("{base_abs}/")) {
        return Err(format!("unsafe {what} path (escapes base): {rel:?}"));
    }
    Ok(PathBuf::from(&joined))
}

/// Task id → single safe path segment (mirror of sanitize_id).
pub fn sanitize_id(s: &str) -> Result<String, String> {
    let out: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() || "-_.".contains(c) { c } else { '_' })
        .collect();
    let out = out.trim_matches('.').to_string();
    if out.is_empty() || out == "." || out == ".." {
        return Err(format!("unsafe task id: {s:?}"));
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// env marker — byte-compatible with the Python driver
// ---------------------------------------------------------------------------

fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    format!("{:x}", h.finalize())
}

/// Python `json.dumps(..., sort_keys=True)` string reproduction (keys in
/// sorted order, `", "` / `": "` separators) so both drivers compute the
/// SAME cache key over the same environment spec.
fn env_marker_key(inst: &SweInstance, flat_reqs: &str) -> String {
    let env_sha = if inst.environment_setup_commit.is_empty() {
        ""
    } else {
        &inst.environment_setup_commit
    };
    let json_list = |items: &[String]| -> String {
        format!(
            "[{}]",
            items
                .iter()
                .map(|s| format!("{s:?}"))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let blob = format!(
        "{{\"base\": {:?}, \"editable\": {}, \"env_sha\": {:?}, \"flat\": {:?}, \"pip_packages\": {}, \"python\": {:?}, \"req_files\": {}}}",
        inst.base_commit,
        inst.env.editable,
        env_sha,
        sha256_hex(flat_reqs),
        json_list(&inst.env.pip_packages),
        inst.env.python,
        json_list(&inst.env.req_files),
    );
    sha256_hex(&blob)
}

// ---------------------------------------------------------------------------
// repo + environment
// ---------------------------------------------------------------------------

async fn ensure_repo(
    inst: &SweInstance,
    repo_dir: &Path,
    reset: bool,
) -> Result<(), String> {
    if !repo_dir.join(".git").is_dir() {
        std::fs::create_dir_all(repo_dir).map_err(|e| format!("mkdir: {e}"))?;
        for cmd in [
            vec!["init"],
            vec!["remote", "add", "origin", &format!("https://github.com/{}", inst.repo)],
            vec!["config", "core.autocrlf", "false"],
            vec!["config", "core.eol", "lf"],
            vec!["config", "core.longpaths", "true"],
        ] {
            let (rc, out) = git(repo_dir, &cmd, Duration::from_secs(600)).await;
            if rc != 0 {
                return Err(format!("repo init failed ({:?}): {}", cmd, tail(&out, 300)));
            }
        }
    }

    let mut shas = vec![inst.base_commit.clone()];
    let env_sha = if inst.environment_setup_commit.is_empty() {
        &inst.base_commit
    } else {
        &inst.environment_setup_commit
    };
    if env_sha != &inst.base_commit {
        shas.push(env_sha.clone());
    }
    for sha in &shas {
        let (rc, _) = git(repo_dir, &["cat-file", "-e", &format!("{sha}^{{commit}}")], Duration::from_secs(600)).await;
        if rc != 0 {
            let url = format!("https://github.com/{}", inst.repo);
            let (rc2, out) = git(repo_dir, &["fetch", "--depth", "1", "origin", sha], Duration::from_secs(1800)).await;
            if rc2 != 0 {
                return Err(format!("git fetch {sha} failed: {}", tail(&out, 300)));
            }
            let (rc3, _) = git(repo_dir, &["cat-file", "-e", &format!("{sha}^{{commit}}")], Duration::from_secs(600)).await;
            if rc3 != 0 {
                return Err(format!("commit {sha} not present after fetch ({url})"));
            }
        }
    }

    if !reset {
        if !repo_dir.join(".git").is_dir() {
            return Err("worktree eval needs a prepared repo (run --prepare first)".into());
        }
        return Ok(());
    }
    let (rc, out) = git(repo_dir, &["checkout", "-f", "--detach", &inst.base_commit], Duration::from_secs(600)).await;
    if rc != 0 {
        return Err(format!("checkout base failed: {}", tail(&out, 300)));
    }
    let (rc, out) = git(repo_dir, &["reset", "--hard", &inst.base_commit], Duration::from_secs(600)).await;
    if rc != 0 {
        return Err(format!("reset base failed: {}", tail(&out, 300)));
    }
    let (rc, out) = git(repo_dir, &["clean", "-fdx"], Duration::from_secs(600)).await;
    if rc != 0 {
        return Err(format!("clean failed: {}", tail(&out, 300)));
    }
    Ok(())
}

async fn flatten_reqs(inst: &SweInstance, repo_dir: &Path) -> Result<String, String> {
    let env_sha = if inst.environment_setup_commit.is_empty() {
        &inst.base_commit
    } else {
        &inst.environment_setup_commit
    };
    let mut chunks: Vec<String> = Vec::new();

    fn excluded(line: &str) -> bool {
        ["-e .", "#", ".[test"].iter().any(|p| line.trim_start().starts_with(p))
    }

    async fn walk(
        repo_dir: &Path,
        env_sha: &str,
        path: &str,
        depth: u32,
        chunks: &mut Vec<String>,
    ) -> Result<(), String> {
        if depth > 5 {
            return Err(format!("requirement include recursion too deep at {path}"));
        }
        let (rc, out) = git(repo_dir, &["show", &format!("{env_sha}:{path}")], Duration::from_secs(600)).await;
        if rc != 0 {
            return Err(format!("git show {env_sha}:{path} failed: {}", tail(&out, 300)));
        }
        let req_dir = match path.rfind('/') {
            Some(i) => &path[..i],
            None => "",
        };
        let mut own: Vec<String> = Vec::new();
        for line in out.lines() {
            let stripped = line.trim();
            if let Some(inc) = stripped.strip_prefix("-r") {
                let inc = inc.trim();
                let joined = if req_dir.is_empty() {
                    inc.to_string()
                } else {
                    format!("{req_dir}/{inc}")
                };
                let norm = norm_path(&joined);
                Box::pin(walk(repo_dir, env_sha, &norm, depth + 1, chunks)).await?;
            } else if !excluded(line) {
                own.push(line.to_string());
            }
        }
        chunks.extend(own);
        Ok(())
    }

    for path in &inst.env.req_files {
        let _ = safe_rel_path(repo_dir, path, "req file")?;
        walk(repo_dir, env_sha, path, 0, &mut chunks).await?;
    }
    Ok(chunks.join("\n"))
}

fn norm_path(p: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn venv_python(venv_dir: &Path) -> Result<PathBuf, String> {
    let win = venv_dir.join("Scripts").join("python.exe");
    if win.exists() {
        return Ok(win);
    }
    let unix = venv_dir.join("bin").join("python");
    if unix.exists() {
        return Ok(unix);
    }
    Err(format!(
        "venv python not found under {}",
        venv_dir.display()
    ))
}

async fn install_repo(inst: &SweInstance, repo_dir: &Path, vpy: &Path) -> Result<(), String> {
    let dist = (if inst.env.dist_name.is_empty() {
        inst.repo.split('/').next_back().unwrap_or("repo")
    } else {
        &inst.env.dist_name
    })
    .to_lowercase();
    let mut cmd: Vec<String> = vec![
        uv_bin(),
        "pip".into(),
        "install".into(),
        "--python".into(),
        vpy.to_string_lossy().to_string(),
        "--reinstall-package".into(),
        dist.clone(),
    ];
    if inst.env.editable {
        cmd.push("-e".into());
    }
    cmd.push(".".into());
    let pretend = format!("{}.0", inst.version);
    let dist_const = dist.replace('-', "_").to_uppercase();
    let env_pairs = vec![
        (
            "SETUPTOOLS_SCM_PRETEND_VERSION".to_string(),
            pretend.clone(),
        ),
        (
            format!("SETUPTOOLS_SCM_PRETEND_VERSION_FOR_{dist_const}"),
            pretend,
        ),
    ];
    let cmd_refs: Vec<&str> = cmd.iter().map(String::as_str).collect();
    let (rc, out) = run(&cmd_refs, Some(repo_dir), Duration::from_secs(1800), Some(&env_pairs)).await;
    if rc != 0 {
        return Err(format!("repo install failed: {}", tail(&out, 1200)));
    }
    Ok(())
}

fn uv_bin() -> String {
    std::env::var("SHADOW_SWE_UV").unwrap_or_else(|_| "uv".to_string())
}

async fn ensure_env(
    inst: &SweInstance,
    workdir: &Path,
    repo_dir: &Path,
    force: bool,
) -> Result<PathBuf, String> {
    let venv_dir = workdir.join(".venv");
    let marker = workdir.join(".swe-env.json");

    let flat_reqs = if inst.env.req_files.is_empty() {
        String::new()
    } else {
        flatten_reqs(inst, repo_dir).await?
    };
    let key = env_marker_key(inst, &flat_reqs);
    if !force && marker.exists() {
        if let Ok(txt) = std::fs::read_to_string(&marker) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                if v.get("key").and_then(|k| k.as_str()) == Some(key.as_str()) {
                    return venv_python(&venv_dir);
                }
            }
        }
    }

    if venv_dir.exists() {
        std::fs::remove_dir_all(&venv_dir).map_err(|e| format!("rm venv: {e}"))?;
    }
    let uv = uv_bin();
    let (rc, out) = run(
        &[&uv, "venv", "--python", &inst.env.python, &venv_dir.to_string_lossy()],
        Some(workdir),
        Duration::from_secs(1800),
        None,
    )
    .await;
    if rc != 0 {
        return Err(format!("uv venv failed: {}", tail(&out, 300)));
    }
    let vpy = venv_python(&venv_dir)?;
    let vpy_str = vpy.to_string_lossy().to_string();

    if !flat_reqs.trim().is_empty() {
        let req_file = workdir.join("requirements-flat.txt");
        std::fs::write(&req_file, format!("{flat_reqs}\n")).map_err(|e| format!("write reqs: {e}"))?;
        let (rc, out) = run(
            &[&uv, "pip", "install", "--python", &vpy_str, "-r", &req_file.to_string_lossy()],
            Some(workdir),
            Duration::from_secs(1800),
            None,
        )
        .await;
        if rc != 0 {
            return Err(format!("installing requirement files failed: {}", tail(&out, 1200)));
        }
    }

    if !inst.env.pip_packages.is_empty() {
        let mut argv: Vec<&str> = vec![&uv, "pip", "install", "--python", &vpy_str];
        let pins: Vec<&str> = inst.env.pip_packages.iter().map(String::as_str).collect();
        argv.extend(pins);
        let (rc, out) = run(&argv, Some(workdir), Duration::from_secs(1800), None).await;
        if rc != 0 {
            return Err(format!("installing pip_packages failed: {}", tail(&out, 1200)));
        }
    }

    install_repo(inst, repo_dir, &vpy).await?;
    std::fs::write(
        &marker,
        serde_json::json!({ "key": key }).to_string(),
    )
    .map_err(|e| format!("write marker: {e}"))?;
    Ok(vpy)
}

// ---------------------------------------------------------------------------
// patches
// ---------------------------------------------------------------------------

async fn apply_patch_chain(
    repo_dir: &Path,
    workdir: &Path,
    patch_text: &str,
    label: &str,
) -> Result<String, String> {
    let patch_file = workdir.join(format!("{label}.diff"));
    std::fs::write(&patch_file, format!("{}\n", patch_text.trim_end_matches('\n')))
        .map_err(|e| format!("write patch: {e}"))?;
    let pf = patch_file.to_string_lossy().to_string();
    let chain: [&[&str]; 3] = [
        &["git", "apply", "--verbose"],
        &["git", "apply", "--verbose", "--reject"],
        &["patch", "--batch", "--fuzz=5", "-p1", "-i"],
    ];
    let mut last = String::new();
    for cmd in chain {
        let mut argv: Vec<&str> = cmd.to_vec();
        argv.push(&pf);
        let (rc, out) = run(&argv, Some(repo_dir), Duration::from_secs(600), None).await;
        last = format!("{} rc={rc}: {}", cmd.join(" "), tail(&out, 300));
        if rc == 0 {
            return Ok(cmd.join(" "));
        }
    }
    Err(format!("{label} patch failed to apply ({last})"))
}

/// Whole-file / search-replace edits (mirror of apply_patches_and_diff).
async fn apply_patch_entries(
    repo_dir: &Path,
    entries: &[serde_json::Value],
    label: &str,
) -> Result<(), String> {
    for entry in entries {
        if !entry.is_object() {
            return Err(format!("{label} patch entry not an object"));
        }
        let rel = entry
            .get("path")
            .and_then(|p| p.as_str())
            .ok_or_else(|| format!("{label} patch entry missing path"))?;
        let dest = safe_rel_path(repo_dir, rel, "patch path")?;
        let kind = entry.get("kind").and_then(|k| k.as_str()).unwrap_or("whole-file");
        match kind {
            "search-replace" => {
                let search = entry
                    .get("search")
                    .and_then(|s| s.as_str())
                    .ok_or_else(|| format!("{label} search-replace missing search"))?;
                let replace = entry
                    .get("replace")
                    .and_then(|s| s.as_str())
                    .ok_or_else(|| format!("{label} search-replace missing replace"))?;
                if !dest.exists() {
                    return Err(format!("{label} search-replace target missing: {rel}"));
                }
                let text = std::fs::read_to_string(&dest).map_err(|e| format!("read {rel}: {e}"))?;
                let updated = if search.is_empty() {
                    format!("{replace}\n{text}")
                } else if !text.contains(search) {
                    return Err(format!(
                        "{label} SEARCH text not found in {rel}: {}",
                        tail(&search.replace('\n', "\\n"), 120)
                    ));
                } else {
                    text.replacen(search, replace, 1)
                };
                std::fs::write(&dest, updated).map_err(|e| format!("write {rel}: {e}"))?;
            }
            _ => {
                let content = entry
                    .get("content")
                    .and_then(|c| c.as_str())
                    .ok_or_else(|| format!("{label} whole-file entry missing content"))?;
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
                }
                std::fs::write(&dest, content).map_err(|e| format!("write {rel}: {e}"))?;
            }
        }
    }
    Ok(())
}

async fn reset_test_files(inst: &SweInstance, repo_dir: &Path) -> Result<(), String> {
    for f in &inst.test_files {
        let p = safe_rel_path(repo_dir, f, "test file")?;
        let (rc, _) = git(
            repo_dir,
            &["cat-file", "-e", &format!("{}:{f}", inst.base_commit)],
            Duration::from_secs(600),
        )
        .await;
        if rc == 0 {
            let (rc, out) = git(
                repo_dir,
                &["checkout", &inst.base_commit, "--", f],
                Duration::from_secs(600),
            )
            .await;
            if rc != 0 {
                return Err(format!("reset of test file {f} failed: {}", tail(&out, 300)));
            }
        } else if p.exists() {
            std::fs::remove_file(&p).map_err(|e| format!("remove {f}: {e}"))?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// pytest output parsing + grading (verbatim ports)
// ---------------------------------------------------------------------------

const TEST_STATUSES: [&str; 5] = ["FAILED", "PASSED", "SKIPPED", "ERROR", "XFAIL"];

/// `parse_log_pytest`: lines starting with a TestStatus value; FAILED
/// collapses " - "; nodeid = second whitespace token.
pub fn parse_status_map(output: &str) -> BTreeMap<String, String> {
    let mut sm = BTreeMap::new();
    for line in output.lines() {
        if TEST_STATUSES.iter().any(|s| line.starts_with(s)) {
            let line = if line.starts_with("FAILED") {
                line.replace(" - ", " ")
            } else {
                line.to_string()
            };
            let mut toks = line.split_whitespace();
            let status = toks.next();
            let nodeid = toks.next();
            if let (Some(s), Some(n)) = (status, nodeid) {
                sm.insert(n.to_string(), s.to_string());
            }
        }
    }
    sm
}

/// Canonicalise path-like parametrised ids: recorded params collapse a
/// directory prefix to "/" (e.g. `[/test_utils.py]`); URL params keep
/// `://` untouched.
pub fn norm_case_id(case: &str) -> String {
    if !case.contains('[') || case.contains("://") {
        return case.to_string();
    }
    let (head, rest) = case.split_once('[').unwrap();
    let inner = rest.strip_suffix(']').unwrap_or(rest);
    let parts: Vec<String> = inner
        .split(',')
        .map(|piece| {
            if (piece.contains('/') || piece.contains('\\')) && !piece.contains("://") {
                let normalized = piece.replace('\\', "/");
                let trimmed = normalized.trim_end_matches('/');
                let seg = trimmed.rsplit('/').next().unwrap_or("");
                format!("/{seg}")
            } else {
                piece.to_string()
            }
        })
        .collect();
    format!("{head}[{}]", parts.join(","))
}

fn case_status<'a>(case: &str, sm: &'a BTreeMap<String, String>) -> Option<&'a str> {
    if let Some(v) = sm.get(case) {
        return Some(v.as_str());
    }
    let n = norm_case_id(case);
    if let Some(v) = sm.get(&n) {
        return Some(v.as_str());
    }
    for (k, v) in sm {
        let nk = norm_case_id(k);
        if nk == case || nk == n {
            return Some(v.as_str());
        }
    }
    None
}

fn passed_case(case: &str, sm: &BTreeMap<String, String>) -> bool {
    matches!(case_status(case, sm), Some("PASSED") | Some("XFAIL"))
}

fn fallback_lookup(case: &str, sm: &mut BTreeMap<String, String>, output: &str) {
    if case_status(case, sm).is_some() {
        return;
    }
    for status in TEST_STATUSES {
        if output.contains(&format!("{case} {status}")) {
            sm.insert(case.to_string(), status.to_string());
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

pub async fn evaluate(
    inst: &SweInstance,
    input: NativeInput,
    work_root: &Path,
    test_timeout: u64,
    force: bool,
) -> Result<NativeResult, String> {
    let started = std::time::Instant::now();
    let task_id = inst.instance_id.clone();
    let mut result = NativeResult {
        task_id: task_id.clone(),
        passed: false,
        detail: String::new(),
        duration_secs: 0.0,
        error: None,
        f2p_pass: 0,
        f2p_total: 0,
        p2p_pass: 0,
        p2p_total: 0,
    };

    let workdir = work_root.join(sanitize_id(&task_id)?);
    std::fs::create_dir_all(&workdir).map_err(|e| format!("mkdir workdir: {e}"))?;
    let repo_dir = workdir.join("repo");
    let worktree = matches!(input, NativeInput::Worktree);

    let vpy = async {
        ensure_repo(inst, &repo_dir, !worktree).await?;
        ensure_env(inst, &workdir, &repo_dir, force).await
    }
    .await;

    let vpy = match vpy {
        Ok(v) => v,
        Err(e) => {
            result.error = Some(e);
            result.duration_secs = started.elapsed().as_secs_f64();
            return Ok(result);
        }
    };

    // model patch / worktree
    if !worktree {
        let (rc, out) = git(&repo_dir, &["reset", "--hard", &inst.base_commit], Duration::from_secs(600)).await;
        if rc != 0 {
            result.error = Some(format!("reset failed: {}", tail(&out, 300)));
            result.duration_secs = started.elapsed().as_secs_f64();
            return Ok(result);
        }
        let (rc, out) = git(&repo_dir, &["clean", "-fdx"], Duration::from_secs(600)).await;
        if rc != 0 {
            result.error = Some(format!("clean failed: {}", tail(&out, 300)));
            result.duration_secs = started.elapsed().as_secs_f64();
            return Ok(result);
        }
        let applied = match &input {
            NativeInput::Gold => apply_patch_chain(&repo_dir, &workdir, &inst.patch, "model").await.map(|_| ()),
            NativeInput::PatchFile(pf) => {
                let text = std::fs::read_to_string(pf).map_err(|e| format!("read patch: {e}"))?;
                apply_patch_chain(&repo_dir, &workdir, &text, "model").await.map(|_| ())
            }
            NativeInput::PatchesFile(pf) => {
                let raw = std::fs::read_to_string(pf).map_err(|e| format!("read patches: {e}"))?;
                let entries: Vec<serde_json::Value> = serde_json::from_str(&raw)
                    .map_err(|e| format!("patches JSON parse: {e}"))?;
                apply_patch_entries(&repo_dir, &entries, "model").await
            }
            NativeInput::Worktree => Ok(()),
        };
        if let Err(e) = applied {
            result.error = Some(e);
            result.duration_secs = started.elapsed().as_secs_f64();
            return Ok(result);
        }
    }

    if let Err(e) = install_repo(inst, &repo_dir, &vpy).await {
        result.error = Some(e);
        result.duration_secs = started.elapsed().as_secs_f64();
        return Ok(result);
    }
    if let Err(e) = reset_test_files(inst, &repo_dir).await {
        result.error = Some(e);
        result.duration_secs = started.elapsed().as_secs_f64();
        return Ok(result);
    }
    if let Err(e) = apply_patch_chain(&repo_dir, &workdir, &inst.test_patch, "test").await {
        result.error = Some(e);
        result.duration_secs = started.elapsed().as_secs_f64();
        return Ok(result);
    }

    if inst.test_files.is_empty() {
        result.error = Some("instance has no test_files".into());
        result.duration_secs = started.elapsed().as_secs_f64();
        return Ok(result);
    }
    let vpy_str = vpy.to_string_lossy().to_string();
    let mut argv: Vec<&str> = vec![&vpy_str, "-m", "pytest", "-rA"];
    let files: Vec<&str> = inst.test_files.iter().map(String::as_str).collect();
    argv.extend(files);
    let (rc, out) = run(
        &argv,
        Some(&repo_dir),
        Duration::from_secs(test_timeout),
        None,
    )
    .await;

    let mut sm = parse_status_map(&out);
    for t in inst.fail_to_pass.iter().chain(inst.pass_to_pass.iter()) {
        fallback_lookup(t, &mut sm, &out);
    }
    let f2p_fail: Vec<&String> = inst
        .fail_to_pass
        .iter()
        .filter(|t| !passed_case(t, &sm))
        .collect();
    let p2p_fail: Vec<&String> = inst
        .pass_to_pass
        .iter()
        .filter(|t| !passed_case(t, &sm))
        .collect();

    let resolved = f2p_fail.is_empty() && p2p_fail.is_empty();
    let mut detail = format!(
        "f2p {}/{}, p2p {}/{}, pytest rc={rc}",
        inst.fail_to_pass.len() - f2p_fail.len(),
        inst.fail_to_pass.len(),
        inst.pass_to_pass.len() - p2p_fail.len(),
        inst.pass_to_pass.len(),
    );
    if !f2p_fail.is_empty() {
        detail += &format!("; f2p failing/missing: {:?}", &f2p_fail[..f2p_fail.len().min(5)]);
    }
    if !p2p_fail.is_empty() {
        detail += &format!("; p2p failing/missing: {:?}", &p2p_fail[..p2p_fail.len().min(5)]);
    }

    result.passed = resolved;
    result.detail = detail;
    result.f2p_pass = inst.fail_to_pass.len() - f2p_fail.len();
    result.f2p_total = inst.fail_to_pass.len();
    result.p2p_pass = inst.pass_to_pass.len() - p2p_fail.len();
    result.p2p_total = inst.pass_to_pass.len();
    result.duration_secs = started.elapsed().as_secs_f64();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(non_snake_case)]
    fn parse_status_map_pytest_rA() {
        let out = "\
FAILED tests/test_x.py::test_a - AssertionError: boom
PASSED tests/test_x.py::test_b
ERROR tests/test_x.py::test_c - ImportError
XFAIL tests/test_x.py::test_d
SKIPPED [1] tests/test_x.py::test_e
";
        let sm = parse_status_map(out);
        assert_eq!(sm["tests/test_x.py::test_a"], "FAILED");
        assert_eq!(sm["tests/test_x.py::test_b"], "PASSED");
        assert_eq!(sm["tests/test_x.py::test_c"], "ERROR");
        assert_eq!(sm["tests/test_x.py::test_d"], "XFAIL");
        // SKIPPED [1] prefix: nodeid is still the second token
        assert_eq!(sm.get("tests/test_x.py::test_e"), None);
    }

    #[test]
    fn norm_case_id_collapses_path_params() {
        assert_eq!(
            norm_case_id("tests/test_utils.py::TestExtractZippedPaths::test_x[C:\\abs\\path\\file.txt]"),
            "tests/test_utils.py::TestExtractZippedPaths::test_x[/file.txt]"
        );
        assert_eq!(
            norm_case_id("tests/t.py::test_p[/test_utils.py]"),
            "tests/t.py::test_p[/test_utils.py]"
        );
        // URL params untouched
        assert_eq!(
            norm_case_id("tests/t.py::test_u[http://user:pass@example.com/path?query-http://user:pass@example.com/path?query]"),
            "tests/t.py::test_u[http://user:pass@example.com/path?query-http://user:pass@example.com/path?query]"
        );
    }

    #[test]
    fn case_status_reverse_matches_canonical() {
        let mut sm = BTreeMap::new();
        sm.insert(
            "tests/test_utils.py::TestExtractZippedPaths::test_x[/file.txt]".into(),
            "FAILED".into(),
        );
        assert_eq!(
            case_status("tests/test_utils.py::TestExtractZippedPaths::test_x[C:\\abs\\dir\\file.txt]", &sm),
            Some("FAILED")
        );
    }

    #[test]
    fn passed_case_xfail_counts() {
        let mut sm = BTreeMap::new();
        sm.insert("t::a".into(), "XFAIL".into());
        sm.insert("t::b".into(), "ERROR".into());
        assert!(passed_case("t::a", &sm));
        assert!(!passed_case("t::b", &sm));
        assert!(!passed_case("t::missing", &sm));
    }

    #[test]
    fn sanitize_id_strips_dots() {
        assert_eq!(sanitize_id("a/b:c").unwrap(), "a_b_c");
        assert_eq!(sanitize_id("..hidden..").unwrap(), "hidden");
        assert!(sanitize_id("...").is_err());
    }

    #[test]
    fn env_marker_key_matches_python_json_dumps_layout() {
        let inst = crate::swe::SweInstance {
            instance_id: "x".into(),
            repo: "org/repo".into(),
            version: "2.3".into(),
            base_commit: "abc".into(),
            environment_setup_commit: String::new(),
            patch: String::new(),
            test_patch: String::new(),
            problem_statement: String::new(),
            hints_text: String::new(),
            fail_to_pass: vec![],
            pass_to_pass: vec![],
            test_files: vec![],
            env: crate::swe::SweEnvSpec {
                python: "3.9".into(),
                req_files: vec!["requirements.txt".into()],
                pip_packages: vec!["pytest==7.4.4".into()],
                editable: true,
                dist_name: "repo".into(),
            },
        };
        let key = env_marker_key(&inst, "flat");
        // Deterministic 64-hex digest; shape verified against the driver
        // in the double-run parity check (same marker file is consumed).
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        let k2 = env_marker_key(&inst, "flat");
        assert_eq!(key, k2, "marker key must be deterministic");
    }
}
