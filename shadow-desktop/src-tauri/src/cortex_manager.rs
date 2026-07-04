use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};

const DEFAULT_CORTEX_PORT: u16 = 8443;
const CORTEX_BIN_NAME: &str = "cortex";

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
    port: u16,
    host: String,
    error: Option<String>,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl CortexManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CortexInner {
                status: CortexStatus::Stopped,
                child: None,
                port: DEFAULT_CORTEX_PORT,
                host: "127.0.0.1".to_string(),
                error: None,
                started_at: None,
            })),
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
        Ok(serde_json::json!({
            "status": inner.status.to_string(),
            "addr": addr,
            "port": inner.port,
            "error": inner.error,
            "started_at": inner.started_at,
        }))
    }

    pub async fn start(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if inner.status == CortexStatus::Running || inner.status == CortexStatus::Starting {
            return Ok(());
        }

        inner.status = CortexStatus::Starting;
        inner.error = None;

        let port = inner.port;
        let host = inner.host.clone();
        let bin = resolve_cortex_binary();

        let mut cmd = Command::new(&bin);
        cmd.env("CORTEX_PORT", port.to_string())
            .env("CORTEX_BIND", &host)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);

        match cmd.spawn() {
            Ok(child) => {
                inner.child = Some(child);
                inner.status = CortexStatus::Running;
                inner.started_at = Some(chrono::Utc::now());
                tracing::info!(addr = %format!("{}:{}", host, port), "cortex sidecar started");
                Ok(())
            }
            Err(e) => {
                inner.status = CortexStatus::Error;
                inner.error = Some(format!("failed to spawn cortex: {}", e));
                inner.child = None;
                Err(format!("cortex spawn failed: {}", e))
            }
        }
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
        }
    }
}

fn resolve_cortex_binary() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("CORTEX_BIN") {
        return std::path::PathBuf::from(p);
    }
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    if let Some(dir) = exe_dir {
        let candidate = dir.join(CORTEX_BIN_NAME);
        if candidate.exists() {
            return candidate;
        }
    }
    std::path::PathBuf::from(CORTEX_BIN_NAME)
}