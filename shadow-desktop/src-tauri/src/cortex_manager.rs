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

/// Load test configuration from a YAML file pointed to by
/// `SHADOW_CORTEX_CONFIG`. Returns an empty HashMap if the env
/// var is unset (production behavior unchanged). Used by the
/// wdio Tauri E2E test orchestrator to inject DATABASE_URL,
/// LANCE_URI, etc. without code changes.
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
            .env("DATABASE_URL", "")
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
            Ok(()) => Ok(()),
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
        tracing::info!("cortex sidecar stopped");
        Ok(())
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
        let path = with_test_config_path("DATABASE_URL: \"\"\nLANCE_URI: \"file:///tmp/lance\"\n");
        std::env::set_var("SHADOW_CORTEX_CONFIG", &path);
        let config = load_test_config();
        assert_eq!(config.get("DATABASE_URL").map(|s| s.as_str()), Some(""));
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
}
