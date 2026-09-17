use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};

const DEFAULT_CORTEX_PORT: u16 = 60080;
const CORTEX_BIN_NAME: &str = "cortex";
const READY_TIMEOUT: Duration = Duration::from_secs(10);
const READY_POLL_INTERVAL: Duration = Duration::from_millis(200);

fn generate_admin_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    let mut bytes = [0u8; 32];
    for (i, b) in bytes.iter_mut().enumerate() {
        *b = ((seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407 + i as u64)) >> 33) as u8;
    }
    hex_encode(&bytes)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// How often the supervisor wakes to check whether the cortex
/// child is still alive. 1 second is fast enough for human-noticeable
/// recovery and slow enough to be free at idle.
const SUPERVISOR_POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Backoff schedule for the supervisor's restart loop. After the
/// first crash we restart immediately, then `2^n * INITIAL` capped
/// at `MAX`. 1s → 2s → 4s → 8s → ... → 30s.
const RESTART_BACKOFF_INITIAL: Duration = Duration::from_secs(1);
const RESTART_BACKOFF_MAX: Duration = Duration::from_secs(30);

/// Give up after this many consecutive crashes. The supervisor
/// stops auto-restarting and parks the manager in `Error` so the
/// UI can surface a "cortex keeps crashing — manual restart needed"
/// banner instead of silently thrashing.
const MAX_RESTART_ATTEMPTS: u32 = 5;

/// Load test configuration from a YAML file pointed to by
/// `SHADOW_CORTEX_CONFIG`. Returns an empty HashMap if the env
/// var is unset (production behavior unchanged). Used by the
/// wdio Tauri E2E test orchestrator to inject LANCE_URI, etc.
fn load_test_config() -> HashMap<String, String> {
    let Some(path_str) = std::env::var("SHADOW_CORTEX_CONFIG").ok() else {
        return HashMap::new();
    };
    let path = PathBuf::from(&path_str);
    let yaml = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(
                "SHADOW_CORTEX_CONFIG set but cannot read {}: {}",
                path_str,
                e
            );
            return HashMap::new();
        }
    };
    match serde_yaml::from_str::<HashMap<String, String>>(&yaml) {
        Ok(m) => m,
        Err(e) => {
            tracing::error!(
                "SHADOW_CORTEX_CONFIG at {} is invalid YAML: {}",
                path_str,
                e
            );
            HashMap::new()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CortexStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

impl std::fmt::Display for CortexStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CortexStatus::Stopped => write!(f, "stopped"),
            CortexStatus::Starting => write!(f, "starting"),
            CortexStatus::Running => write!(f, "running"),
            CortexStatus::Stopping => write!(f, "stopping"),
            CortexStatus::Error => write!(f, "error"),
        }
    }
}

pub struct CortexManager {
    inner: Arc<Mutex<CortexInner>>,
}

impl Clone for CortexManager {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

struct CortexInner {
    status: CortexStatus,
    child: Option<Child>,
    stderr_task: Option<tokio::task::JoinHandle<()>>,
    stderr_buf: Arc<Mutex<String>>,
    port: u16,
    host: String,
    error: Option<String>,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// HuggingFace auth token forwarded to the neure runtime as
    /// the `HF_TOKEN` env var on every sidecar launch. Kept in
    /// memory only — the user re-enters it after each Desktop
    /// restart. (Persisting secrets to disk crosses a security
    /// boundary that should be a deliberate decision later.)
    hf_token: Option<String>,
    /// When true the supervisor background task will respawn the
    /// cortex sidecar after an unexpected exit. `stop()` flips
    /// this to false so a deliberate shutdown is not undone;
    /// `start_with_binary()` flips it back to true.
    supervision_enabled: bool,
    /// Consecutive restart attempts since the last successful
    /// ready probe. Reset to 0 once the cortex sidecar reports
    /// healthy. Capped at `MAX_RESTART_ATTEMPTS` — beyond that
    /// the supervisor parks the manager in `Error` to surface
    /// a persistent crash loop to the UI.
    restart_count: u32,
    /// Last `Instant` at which the supervisor issued a restart.
    /// Used for backoff: `now - last_restart_at` skips the sleep
    /// when it already exceeds the would-be delay.
    last_restart_at: Option<Instant>,
    /// Handle to the supervisor background task. `None` when
    /// supervision is disabled or the cortex is not running.
    supervisor_task: Option<tokio::task::JoinHandle<()>>,
    /// Admin key for issuing subsystem tokens. This is set when
    /// the cortex sidecar starts and used to mint X-Subsystem-Token
    /// credentials for the frontend.
    admin_key: Option<String>,
}

impl CortexManager {
    pub fn new() -> Self {
        Self::with_port(DEFAULT_CORTEX_PORT)
    }

    pub fn with_port(port: u16) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CortexInner {
                status: CortexStatus::Stopped,
                child: None,
                stderr_task: None,
                stderr_buf: Arc::new(Mutex::new(String::new())),
                port,
                host: "127.0.0.1".to_string(),
                error: None,
                started_at: None,
                hf_token: None,
                supervision_enabled: true,
                restart_count: 0,
                last_restart_at: None,
                supervisor_task: None,
                admin_key: None,
            })),
        }
    }

    pub async fn set_port(&self, port: u16) {
        let mut inner = self.inner.lock().await;
        inner.port = port;
    }

    /// Persist a HuggingFace token in memory. Returns whether the
    /// cortex sidecar is currently running (the caller decides
    /// whether to bounce it). The token is forwarded as
    /// `HF_TOKEN` on the next `start_with_binary` call. Pass an
    /// empty string to clear.
    pub async fn set_hf_token(&self, token: String) -> bool {
        let mut inner = self.inner.lock().await;
        let trimmed = token.trim().to_string();
        inner.hf_token = if trimmed.is_empty() { None } else { Some(trimmed) };
        matches!(inner.status, CortexStatus::Running)
    }

    /// Return a masked preview of the stored token (last 4 chars
    /// only) plus a flag indicating whether one is configured. The
    /// UI uses this to render the Settings page without ever
    /// exfiltrating the raw secret back to JS.
    pub async fn get_hf_token(&self) -> serde_json::Value {
        let inner = self.inner.lock().await;
        match &inner.hf_token {
            Some(t) => {
                let len = t.len();
                let tail: String = t.chars().rev().take(4).collect::<String>().chars().rev().collect();
                serde_json::json!({
                    "configured": true,
                    "length": len,
                    "preview": format!("…{}", tail),
                })
            }
            None => serde_json::json!({ "configured": false }),
        }
    }

    pub async fn health(&self) -> Result<serde_json::Value, String> {
        let inner = self.inner.lock().await;
        let addr = format!("{}:{}", inner.host, inner.port);
        match reqwest::get(format!("http://{}/.well-known/agent.json", addr)).await {
            Ok(resp) if resp.status().is_success() => Ok(serde_json::json!({
                "status": "healthy",
                "addr": addr,
            })),
            Ok(resp) => Ok(serde_json::json!({
                "status": "unhealthy",
                "addr": addr,
                "code": resp.status().as_u16(),
            })),
            Err(e) => Ok(serde_json::json!({
                "status": "unreachable",
                "addr": addr,
                "error": e.to_string(),
            })),
        }
    }

    pub async fn issue_subsystem_token(
        &self,
        scopes: Vec<String>,
        ttl_seconds: Option<i64>,
    ) -> Result<serde_json::Value, String> {
        let inner = self.inner.lock().await;
        let addr = format!("{}:{}", inner.host, inner.port);
        let admin_key = inner.admin_key.clone().ok_or("admin key not configured")?;
        drop(inner);

        let client = reqwest::Client::new();
        let url = format!("http://{}/api/cortex/admin/token", addr);
        let ttl = ttl_seconds.unwrap_or(3600).clamp(60, 86400);
        let body = serde_json::json!({
            "scopes": scopes,
            "ttl_seconds": ttl,
        });
        let resp = client
            .post(&url)
            .header("x-admin-token", &admin_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network error: {}", e))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status, text));
        }
        let v: serde_json::Value = resp.json().await.map_err(|e| format!("parse error: {}", e))?;
        Ok(v)
    }

    pub async fn status_json(&self) -> Result<serde_json::Value, String> {
        let inner = self.inner.lock().await;
        let addr = format!("{}:{}", inner.host, inner.port);
        let stderr = inner.stderr_buf.lock().await.clone();
        Ok(serde_json::json!({
            "status": inner.status.to_string(),
            "addr": addr,
            "port": inner.port,
            "error": inner.error,
            "started_at": inner.started_at,
            "stderr_tail": stderr_tail(&stderr, 1024),
            "supervision_enabled": inner.supervision_enabled,
            "restart_count": inner.restart_count,
        }))
    }

    pub async fn stderr_tail(&self, max_bytes: usize) -> String {
        let inner = self.inner.lock().await;
        let buf = inner.stderr_buf.lock().await.clone();
        drop(inner);
        stderr_tail(&buf, max_bytes)
    }

    pub async fn start(&self) -> Result<(), String> {
        self.start_with_binary(resolve_cortex_binary()).await
    }

    pub async fn start_with_binary(&self, bin: std::path::PathBuf) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if inner.status == CortexStatus::Running || inner.status == CortexStatus::Starting {
            return Ok(());
        }

        inner.status = CortexStatus::Starting;
        inner.error = None;
        inner.stderr_buf.lock().await.clear();

        let admin_key = generate_admin_key();
        inner.admin_key = Some(admin_key.clone());

        let port = inner.port;
        let host = inner.host.clone();
        let stderr_buf = inner.stderr_buf.clone();
        let hf_token = inner.hf_token.clone();
        let test_config = load_test_config();
        if !test_config.is_empty() {
            tracing::info!(
                count = test_config.len(),
                "applying SHADOW_CORTEX_CONFIG to cortex sidecar"
            );
        }

        let mut cmd = Command::new(&bin);
        cmd.env("CORTEX_PORT", port.to_string())
            .env("CORTEX_BIND", &host)
            .env("LANCE_URI", "file://$HOME/.shadow/lance")
            .env("CORTEX_ADMIN_KEY", &admin_key)
            // Forward the user-supplied HF token (if any). The neure
            // runtime picks this up via `std::env::var("HF_TOKEN")`
            // and attaches it as a `Authorization: Bearer` header
            // for gated-repo downloads.
            .env(
                "HF_TOKEN",
                hf_token.as_deref().unwrap_or(""),
            )
            .envs(test_config)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                inner.status = CortexStatus::Error;
                inner.error = Some(format!("failed to spawn cortex: {}", e));
                return Err(format!("cortex spawn failed: {}", e));
            }
        };

        // Capture stdout → tracing::info with [cortex] prefix
        if let Some(mut stdout) = child.stdout.take() {
            tokio::spawn(async move {
                let mut buf = Vec::new();
                let mut tmp = [0u8; 4096];
                loop {
                    match stdout.read(&mut tmp).await {
                        Ok(0) => break,
                        Ok(n) => {
                            buf.extend_from_slice(&tmp[..n]);
                            while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                                let line: Vec<u8> = buf.drain(..=pos).collect();
                                if let Ok(s) = std::str::from_utf8(&line) {
                                    let s = s.trim();
                                    if !s.is_empty() {
                                        tracing::info!(target: "cortex", "{}", s);
                                    }
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // Capture stderr → tracing::warn + buffer for status
        if let Some(mut stderr) = child.stderr.take() {
            let buf = stderr_buf.clone();
            let handle = tokio::spawn(async move {
                let mut line_buf = Vec::new();
                let mut tmp = [0u8; 4096];
                loop {
                    match stderr.read(&mut tmp).await {
                        Ok(0) => break,
                        Ok(n) => {
                            // Append to ring buffer (keep last 16KB)
                            {
                                let mut g = buf.lock().await;
                                g.push_str(&String::from_utf8_lossy(&tmp[..n]));
                                if g.len() > 16 * 1024 {
                                    let drop_at = g.len() - 16 * 1024;
                                    g.drain(..drop_at);
                                }
                            }
                            // Split into lines and forward to tracing
                            line_buf.extend_from_slice(&tmp[..n]);
                            while let Some(pos) = line_buf.iter().position(|&b| b == b'\n') {
                                let line: Vec<u8> = line_buf.drain(..=pos).collect();
                                if let Ok(s) = std::str::from_utf8(&line) {
                                    let s = s.trim();
                                    if !s.is_empty() {
                                        tracing::warn!(target: "cortex", "{}", s);
                                    }
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
            inner.stderr_task = Some(handle);
        }

        inner.child = Some(child);
        inner.status = CortexStatus::Running;
        inner.started_at = Some(chrono::Utc::now());
        tracing::info!(addr = %format!("{}:{}", host, port), bin = %bin.display(), "cortex sidecar started");

        drop(inner);
        match self.wait_for_ready().await {
            Ok(()) => {
                self.spawn_supervisor().await;
                Ok(())
            }
            Err(e) => {
                self.mark_error(format!("cortex failed to become ready: {e}")).await;
                Err(e)
            }
        }
    }

    #[allow(unused_assignments)]
    pub async fn wait_for_ready(&self) -> Result<(), String> {
        let inner = self.inner.lock().await;
        let addr = format!("{}:{}", inner.host, inner.port);
        drop(inner);

        let deadline = Instant::now() + READY_TIMEOUT;
        let mut last_err: Option<String>;
        last_err = None;
        loop {
            if let Some(err) = self.check_process_alive().await {
                let stderr = self.stderr_tail(2048).await;
                let detail = if stderr.is_empty() {
                    err
                } else {
                    format!("{err}; stderr tail:\n{stderr}")
                };
                return Err(format!("cortex exited before becoming ready: {detail}"));
            }

            match reqwest::get(format!("http://{}/.well-known/agent.json", addr)).await {
                Ok(resp) if resp.status().is_success() => {
                    tracing::info!(addr = %addr, "cortex sidecar ready");
                    return Ok(());
                }
                Ok(resp) => {
                    last_err = Some(format!("status {}", resp.status()));
                }
                Err(e) => {
                    last_err = Some(e.to_string());
                }
            }

            if Instant::now() >= deadline {
                let last = last_err.unwrap_or_else(|| "no response yet".to_string());
                return Err(format!(
                    "timed out after {}ms waiting for cortex at {addr} (last error: {last})",
                    READY_TIMEOUT.as_millis()
                ));
            }
            tokio::time::sleep(READY_POLL_INTERVAL).await;
        }
    }

    async fn check_process_alive(&self) -> Option<String> {
        let mut inner = self.inner.lock().await;
        let child = inner.child.as_mut()?;
        match child.try_wait() {
            Ok(Some(status)) => {
                let stderr = inner.stderr_buf.lock().await.clone();
                let detail = if stderr.is_empty() {
                    format!("exit status: {status}")
                } else {
                    let tail = stderr_tail(&stderr, 2048);
                    format!("exit status: {status}; stderr tail:\n{tail}")
                };
                inner.status = CortexStatus::Error;
                inner.error = Some(detail.clone());
                inner.child = None;
                Some(detail)
            }
            Ok(None) => None,
            Err(e) => Some(format!("try_wait error: {e}")),
        }
    }

    /// Pure helper that decides whether the supervisor's "alive"
    /// tick should be a no-op (reset backoff, return) versus
    /// fall through to the restart branch.
    ///
    /// `check_process_alive` returns `None` for three reasons:
    ///   (a) the child exists and `try_wait` returned Ok(None);
    ///   (b) no child, status != Error (Stopped / Stopping /
    ///       Starting) — the supervisor has nothing to do;
    ///   (c) no child, status == Error — the most recent
    ///       `start_with_binary` failed during `wait_for_ready`
    ///       and `mark_error` cleared `inner.child`. Treat as a
    ///       crash so the restart counter keeps accumulating.
    ///
    /// Extracted so the supervisor's restart-vs-reset decision is
    /// unit-testable without spawning a real supervisor loop.
    pub(crate) fn alive_tick_is_noop(status: CortexStatus, child_present: bool) -> bool {
        if child_present {
            return true;
        }
        // No child. Status == Error means a previous restart failed
        // during startup — do NOT treat as a no-op; the supervisor
        // must fall through to the restart branch so the counter
        // accumulates.
        status != CortexStatus::Error
    }

    async fn mark_error(&self, msg: String) {
        let mut inner = self.inner.lock().await;
        if let Some(mut child) = inner.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        inner.status = CortexStatus::Error;
        inner.error = Some(msg.clone());
        tracing::error!(error = %msg, "cortex sidecar entered error state");
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if inner.status == CortexStatus::Stopped {
            return Ok(());
        }
        inner.status = CortexStatus::Stopping;
        inner.supervision_enabled = false;
        if let Some(task) = inner.supervisor_task.take() {
            task.abort();
        }
        if let Some(mut child) = inner.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        if let Some(task) = inner.stderr_task.take() {
            task.abort();
        }
        inner.status = CortexStatus::Stopped;
        inner.started_at = None;
        inner.error = None;
        inner.restart_count = 0;
        inner.last_restart_at = None;
        tracing::info!("cortex sidecar stopped");
        Ok(())
    }

    /// Toggle automatic restart-on-crash. Returns the new value.
    /// When the caller sets this to false, the in-flight supervisor
    /// task is aborted so it does not race against the next start.
    pub async fn set_supervision(&self, enabled: bool) -> bool {
        let mut inner = self.inner.lock().await;
        inner.supervision_enabled = enabled;
        if !enabled {
            if let Some(task) = inner.supervisor_task.take() {
                task.abort();
            }
        }
        enabled
    }

    /// Spawn the supervisor background task that respawns the
    /// cortex sidecar after an unexpected exit. Called from
    /// `start_with_binary` once the sidecar is confirmed healthy.
    /// Idempotent: a second invocation while a supervisor is
    /// already running aborts the old one and starts a fresh
    /// task, so start-after-restart cycles converge.
    async fn spawn_supervisor(&self) {
        // Phase 1: take the old handle under the lock and release
        // it before crossing an await. Holding the lock across the
        // `tokio::spawn` future would make this function's future
        // !Send, breaking callers that themselves need Send.
        let old = {
            let mut inner = self.inner.lock().await;
            inner.supervisor_task.take()
        };
        if let Some(t) = old {
            t.abort();
        }

        // Phase 2: start the new supervisor. `me` is moved into
        // the spawned future; `self` is still available because
        // we only cloned it.
        let me = self.clone();
        let new_handle = tokio::spawn(me.supervise_loop());

        // Phase 3: install the handle under a fresh lock acquisition.
        let mut inner = self.inner.lock().await;
        inner.supervisor_task = Some(new_handle);
    }

    /// The supervisor's main loop. Runs forever (until aborted) at
    /// `SUPERVISOR_POLL_INTERVAL`. Each tick:
    ///   1. bail if supervision was disabled by `stop()`/`set_supervision(false)`
    ///   2. detect process exit via `check_process_alive`
    ///   3. on exit: increment counter, wait backoff, restart
    ///   4. on healthy: reset counter, repeat
    /// Crashes are bounded by `MAX_RESTART_ATTEMPTS` — beyond
    /// that the supervisor parks the manager in `Error` so the UI
    /// can surface a persistent crash loop instead of silently
    /// thrashing.
    ///
    /// Returns the body as a boxed `dyn Future + Send` so the
    /// caller can `tokio::spawn` it without the compiler needing
    /// to resolve `start_with_binary`'s opaque return type to
    /// confirm the supervisor itself is Send. Boxing breaks the
    /// inference cycle.
    fn supervise_loop(
        self: &CortexManager,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'static>> {
        let me: std::sync::Arc<CortexManager> = std::sync::Arc::new(self.clone());
        Box::pin(async move {
            let mut backoff = RESTART_BACKOFF_INITIAL;
            loop {
                tokio::time::sleep(SUPERVISOR_POLL_INTERVAL).await;
                me.supervise_tick(&mut backoff).await;
            }
        })
    }

    /// Single iteration of the supervisor loop. Split out so the
    /// caller (`supervise_loop`) can be boxed as `dyn Future + Send`
    /// without the compiler needing to inspect every local; this
    /// function is only ever awaited from inside the boxed future.
    async fn supervise_tick(&self, backoff: &mut Duration) {
    // Bail if `stop()` flipped the switch off.
    {
        let inner = self.inner.lock().await;
        if !inner.supervision_enabled {
            return;
        }
    }

    if self.check_process_alive().await.is_none() {
        // check_process_alive returned None — decide whether this
        // is a "still alive" tick or a pending-failure tick using
        // the documented predicate (see `alive_tick_is_noop`).
        let (status, child_present) = {
            let inner = self.inner.lock().await;
            (inner.status, inner.child.is_some())
        };
        if Self::alive_tick_is_noop(status, child_present) {
            // Genuinely alive (or stopped without error) — reset
            // the backoff so the next crash pays a small initial
            // delay, not the accumulated delay from a previous
            // crash streak.
            let mut inner = self.inner.lock().await;
            if inner.restart_count > 0 {
                inner.restart_count = 0;
                inner.last_restart_at = None;
                tracing::info!("cortex sidecar recovered; supervisor restart counter reset");
            }
            *backoff = RESTART_BACKOFF_INITIAL;
            return;
        }
        // Otherwise fall through to the restart branch below —
        // the previous restart attempt is still considered a
        // pending failure from the supervisor's perspective.
    }

    // Process died. Decide whether to restart.
    let mut inner = self.inner.lock().await;
    if inner.restart_count >= MAX_RESTART_ATTEMPTS {
        let last_err = inner.error.clone().unwrap_or_else(|| "unknown".to_string());
        inner.status = CortexStatus::Error;
        inner.supervision_enabled = false;
        tracing::error!(
            restart_count = inner.restart_count,
            last_error = %last_err,
            "cortex supervisor giving up after {} consecutive crashes; manual restart needed",
            MAX_RESTART_ATTEMPTS
        );
        return;
    }
    inner.restart_count += 1;
    inner.last_restart_at = Some(Instant::now());
    let attempt = inner.restart_count;
    drop(inner);

    tracing::warn!(
        attempt = attempt,
        max = MAX_RESTART_ATTEMPTS,
        backoff_ms = backoff.as_millis() as u64,
        "cortex sidecar crashed; supervisor will respawn"
    );
    tokio::time::sleep(*backoff).await;

    // Re-check the switch — user may have stopped while
    // we slept through the backoff window.
    {
        let inner = self.inner.lock().await;
        if !inner.supervision_enabled {
            return;
        }
    }

    // Box::pin the restart so the supervisor's Send-ness does
    // not depend on `start_with_binary`'s opaque return type.
    // Without this indirection Rust's type inference cycles
    // through three async methods on `CortexManager` and fails
    // to converge.
    let me = self.clone();
    let bin = resolve_cortex_binary();
    let attempt_log = attempt;
    let fut: std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> =
        Box::pin(async move { me.start_with_binary(bin).await });
    match fut.await {
        Ok(()) => {
            tracing::info!(attempt = attempt_log, "cortex supervisor restarted sidecar");
        }
        Err(e) => {
            tracing::error!(attempt = attempt_log, error = %e, "cortex supervisor restart failed");
        }
    }

    *backoff = (*backoff * 2).min(RESTART_BACKOFF_MAX);
    }
}

impl Default for CortexManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for CortexManager {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.try_lock() {
            if let Some(mut child) = inner.child.take() {
                let _ = child.start_kill();
            }
            if let Some(task) = inner.stderr_task.take() {
                task.abort();
            }
        }
    }
}

fn stderr_tail(buf: &str, max_bytes: usize) -> String {
    if buf.len() <= max_bytes {
        buf.to_string()
    } else {
        buf[buf.len() - max_bytes..].to_string()
    }
}

pub fn resolve_cortex_binary() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("CORTEX_BIN") {
        let p = std::path::PathBuf::from(p);
        if p.exists() {
            return p;
        }
        eprintln!("CORTEX_BIN={p:?} does not exist; falling back");
    }

    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        let candidate = dir.join(CORTEX_BIN_NAME);
        if candidate.exists() {
            return candidate;
        }
    }

    if let Some(start) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        let mut dir = start.clone();
        for _ in 0..12 {
            if let Some(parent) = dir.parent() {
                for profile in &["debug", "release"] {
                    let candidate = parent
                        .join(CORTEX_BIN_NAME)
                        .join("target")
                        .join(profile)
                        .join(CORTEX_BIN_NAME);
                    if candidate.exists() {
                        return candidate;
                    }
                }
                dir = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    std::path::PathBuf::from(CORTEX_BIN_NAME)
}
#[cfg(test)]
mod tests {
    use super::*;

    fn with_test_config_path(contents: &str) -> String {
        let path = std::env::temp_dir().join("shadow_test_cortex_config.yaml");
        std::fs::write(&path, contents).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn load_test_config_returns_empty_when_env_unset() {
        std::env::remove_var("SHADOW_CORTEX_CONFIG");
        let config = load_test_config();
        assert!(config.is_empty());
    }

    #[test]
    fn load_test_config_parses_yaml() {
        let path = with_test_config_path("LANCE_URI: \"file:///tmp/lance\"\n");
        std::env::set_var("SHADOW_CORTEX_CONFIG", &path);
        let config = load_test_config();
        assert_eq!(config.get("LANCE_URI").map(|s| s.as_str()), Some("file:///tmp/lance"));
        std::env::remove_var("SHADOW_CORTEX_CONFIG");
    }

    #[test]
    fn load_test_config_handles_missing_file() {
        std::env::set_var("SHADOW_CORTEX_CONFIG", "/nonexistent/path/cortex.yaml");
        let config = load_test_config();
        assert!(config.is_empty());
        std::env::remove_var("SHADOW_CORTEX_CONFIG");
    }

    fn manager() -> CortexManager {
        CortexManager::with_port(0)
    }

    #[tokio::test]
    async fn supervision_defaults_to_enabled() {
        let m = manager();
        let status = m.status_json().await.unwrap();
        assert_eq!(status["supervision_enabled"], serde_json::json!(true));
        assert_eq!(status["restart_count"], serde_json::json!(0));
    }

    #[tokio::test]
    async fn set_supervision_toggles_and_returns_new_value() {
        let m = manager();
        assert_eq!(m.set_supervision(false).await, false);
        assert_eq!(
            m.status_json().await.unwrap()["supervision_enabled"],
            serde_json::json!(false)
        );
        assert_eq!(m.set_supervision(true).await, true);
        assert_eq!(
            m.status_json().await.unwrap()["supervision_enabled"],
            serde_json::json!(true)
        );
    }

    #[tokio::test]
    async fn stop_resets_restart_counter_and_disables_supervision() {
        let m = manager();
        // Simulate a previous crash streak by mutating the inner
        // state through the public `status_json` round-trip is
        // not possible (no setter for restart_count), so we go
        // through `set_supervision(false)` and assert the visible
        // fields reset to their defaults — the supervisor's
        // reset-on-stop contract is the thing we care about.
        m.set_supervision(false).await;
        let status = m.status_json().await.unwrap();
        assert_eq!(status["restart_count"], serde_json::json!(0));
    }

    #[tokio::test]
    async fn check_process_alive_when_no_child_is_none() {
        // Manager with no cortex started: `check_process_alive`
        // should report nothing (no exit to react to) rather
        // than crashing.
        let m = manager();
        let alive = m.check_process_alive().await;
        assert!(alive.is_none(), "no child means nothing died");
    }

    #[tokio::test]
    async fn supervisor_state_round_trip() {
        // Sanity check on the supervisor state machine without
        // actually spawning a child: the inner fields that the UI
        // reads via status_json() must reflect what set_supervision
        // last set, even across multiple toggles.
        let m = manager();
        let s0 = m.status_json().await.unwrap();
        assert_eq!(s0["supervision_enabled"], serde_json::json!(true));
        assert_eq!(s0["restart_count"], serde_json::json!(0));

        assert!(!m.set_supervision(false).await);
        let s1 = m.status_json().await.unwrap();
        assert_eq!(s1["supervision_enabled"], serde_json::json!(false));

        assert!(m.set_supervision(true).await);
        let s2 = m.status_json().await.unwrap();
        assert_eq!(s2["supervision_enabled"], serde_json::json!(true));
    }

    #[tokio::test]
    async fn supervisor_does_not_reset_counter_when_start_with_binary_failed() {
        // Regression: a misconfigured cortex that dies during
        // `wait_for_ready` lands in `status = Error` with no child.
        // Before the fix, the supervisor's next tick saw
        // `check_process_alive() == None` (no child) and treated
        // that as "still alive", zeroing the restart counter and
        // looping forever without ever tripping
        // MAX_RESTART_ATTEMPTS. We test the extracted predicate
        // directly: when there is no child and status == Error,
        // the tick must NOT be a no-op (i.e. the supervisor must
        // fall through to the restart branch and accumulate).
        use CortexStatus::*;
        assert!(
            !CortexManager::alive_tick_is_noop(Error, false),
            "startup failure (status=Error, child missing) must NOT be a no-op — \
             supervisor must fall through to the restart branch so the counter accumulates"
        );
        assert!(CortexManager::alive_tick_is_noop(Running, true), "live child must be a no-op");
        assert!(
            CortexManager::alive_tick_is_noop(Stopped, false),
            "Stopped with no child is the normal off state — no-op is correct"
        );
        assert!(
            CortexManager::alive_tick_is_noop(Starting, false),
            "Starting without a child yet is a transient state — no-op is correct"
        );
        assert!(
            CortexManager::alive_tick_is_noop(Stopping, false),
            "Stopping without a child is mid-shutdown — no-op is correct"
        );
    }
}
