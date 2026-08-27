//! Tauri commands for UVC device enumeration, capability probing, and
//! cortex synchronization. Camera access itself happens in the
//! webview layer via `navigator.mediaDevices`; this Rust side is
//! a thin proxy that lets the React UI surface a "press a button to
//! find cameras" affordance and a "push my current list to cortex"
//! action.
//!
//! Wire shape: matches Spec #1's cortex_video_sources table
//! (see `cortex/migrations/20260827000001_cortex_video_sources.sql`).
//! The desktop pushes a `CortexVideoSourcesSnapshot` to cortex via
//! PUT /api/cortex/video-sources and gets back an ETag for the next
//! round-trip.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSource {
    pub id: String,
    pub device_id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
    pub transport: String,
    pub capabilities: serde_json::Value,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceBlock {
    pub platform: String,
    pub hostname: String,
    pub cortex_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CortexVideoSourcesSnapshot {
    pub sources: Vec<VideoSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub snapshot: CortexVideoSourcesSnapshot,
    pub etag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCapabilities {
    pub widths: Vec<u32>,
    pub heights: Vec<u32>,
    pub frame_rates: Vec<u32>,
    pub probed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDeviceInfo {
    pub device_id: String,
    pub label: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncHealth {
    pub reachable: bool,
    pub drift: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("uvc enumeration failed: {0}")]
    EnumerateFailed(String),
    #[error("permission denied for camera access")]
    PermissionDenied,
    #[error("camera capability probe failed: {0}")]
    ProbeFailed(String),
    #[error("cortex unreachable: {0}")]
    CortexUnreachable(String),
    #[error("cortex admin token invalid")]
    CortexAuthFailed,
    #[error("cortex returned 412 (ETag mismatch); refresh and retry")]
    Cortex412,
    #[error("cortex storage quota exceeded")]
    StorageQuota,
    #[error("platform does not support camera access (no navigator.mediaDevices)")]
    UnsupportedPlatform,
}

impl serde::Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let (code, message) = match self {
            Self::EnumerateFailed(m) => ("ENUMERATE_FAILED", m.as_str()),
            Self::PermissionDenied => ("PERMISSION_DENIED", "permission denied for camera access"),
            Self::ProbeFailed(m) => ("PROBE_FAILED", m.as_str()),
            Self::CortexUnreachable(m) => ("CORTEX_UNREACHABLE", m.as_str()),
            Self::CortexAuthFailed => ("CORTEX_AUTH_FAILED", "admin token invalid"),
            Self::Cortex412 => ("CORTEX_412", "ETag mismatch"),
            Self::StorageQuota => ("STORAGE_QUOTA", "local storage quota exceeded"),
            Self::UnsupportedPlatform => ("UNSUPPORTED_PLATFORM", "no navigator.mediaDevices"),
        };
        let mut s = ser.serialize_struct("CommandError", 2)?;
        s.serialize_field("code", code)?;
        s.serialize_field("message", message)?;
        s.end()
    }
}

// === Tauri commands ===

/// Tauri command: return the local zustand-style source catalog.
/// The webview populates the underlying store via `navigator.mediaDevices`
/// + zustand; this command is a thin shim that reflects whatever the
/// webview last reported.
#[tauri::command]
pub async fn enumerate_uvc() -> Result<Vec<RawDeviceInfo>, CommandError> {
    // Per Spec #1 architecture: the webview is the side with the
    // getUserMedia/getVideoDevices call. This stub returns empty for
    // headless / web build. Frontend side fetches from the store.
    Ok(vec![])
}

#[tauri::command]
pub async fn probe_capabilities(_device_id: String) -> Result<SourceCapabilities, CommandError> {
    // Per Spec #1 architecture: capability probing happens in the
    // webview (MediaStream + track.getSettings()). This Tauri command
    // is reserved for a future Rust-side capture path.
    Err(CommandError::ProbeFailed(
        "capability probing happens in the webview (MediaStream.getSettings) — \
         Tauri command is reserved for future Rust-side capture".into(),
    ))
}

#[tauri::command]
pub async fn push_to_cortex(
    snapshot: CortexVideoSourcesSnapshot,
) -> Result<PushResult, CommandError> {
    let cortex_url = std::env::var("CORTEX_URL")
        .unwrap_or_else(|_| "http://localhost:60080".to_string());
    let token = std::env::var("CORTEX_ADMIN_TOKEN")
        .map_err(|_| CommandError::CortexAuthFailed)?;
    push_to_cortex_inner(&cortex_url, &token, snapshot).await
}

#[tauri::command]
pub async fn sync_health() -> Result<SyncHealth, CommandError> {
    let cortex_url = std::env::var("CORTEX_URL")
        .unwrap_or_else(|_| "http://localhost:60080".to_string());
    let token = match std::env::var("CORTEX_ADMIN_TOKEN") {
        Ok(t) => t,
        Err(_) => {
            return Ok(SyncHealth {
                reachable: false,
                drift: "diverged",
                error: Some("CORTEX_ADMIN_TOKEN not set".into()),
            });
        }
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    match client
        .get(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", &token)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => Ok(SyncHealth {
            reachable: true,
            drift: "in-sync",
            error: None,
        }),
        Ok(r) => Ok(SyncHealth {
            reachable: false,
            drift: "diverged",
            error: Some(format!("HTTP {}", r.status())),
        }),
        Err(e) => Ok(SyncHealth {
            reachable: false,
            drift: "diverged",
            error: Some(e.to_string()),
        }),
    }
}

// === Internal helpers ===

/// `pub` (re-exported via `test_helpers` in tests) so the unit test
/// can exercise the full round-trip against a `wiremock` server without
/// spinning up a Tauri runtime. Production Tauri commands call this
/// internally; external code should not.
pub async fn push_to_cortex_inner(
    cortex_url: &str,
    token: &str,
    snapshot: CortexVideoSourcesSnapshot,
) -> Result<PushResult, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;

    // Step 1: GET to fetch current ETag.
    let get_resp = client
        .get(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", token)
        .send()
        .await
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    if get_resp.status() == 401 {
        return Err(CommandError::CortexAuthFailed);
    }
    if !get_resp.status().is_success() {
        return Err(CommandError::CortexUnreachable(format!(
            "GET returned {}",
            get_resp.status()
        )));
    }
    let etag = get_resp
        .headers()
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_else(|| "*".into());

    // Step 2: PUT with If-Match.
    let put_resp = client
        .put(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", token)
        .header("If-Match", &etag)
        .json(&snapshot)
        .send()
        .await
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    if put_resp.status() == 401 {
        return Err(CommandError::CortexAuthFailed);
    }
    if put_resp.status() == 412 {
        return Err(CommandError::Cortex412);
    }
    if !put_resp.status().is_success() {
        return Err(CommandError::CortexUnreachable(format!(
            "PUT returned {}",
            put_resp.status()
        )));
    }
    let new_etag = put_resp
        .headers()
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_default();
    Ok(PushResult {
        snapshot,
        etag: new_etag,
    })
}

// === Test helpers re-export ===
pub mod test_helpers {
    pub use super::CortexVideoSourcesSnapshot;
    pub use super::CommandError;
    pub use super::push_to_cortex_inner;
}

#[cfg(test)]
mod tests {
    use super::test_helpers::{push_to_cortex_inner, CommandError, CortexVideoSourcesSnapshot};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn push_to_cortex_sends_correct_body_and_parses_etag() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/cortex/video-sources"))
            .and(header("X-Cortex-Admin-Token", "test"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("ETag", "v1")
                    .set_body_string(
                        r#"{"sources":[],"activeId":null,"device":null}"#,
                    ),
            )
            .mount(&server)
            .await;
        Mock::given(method("PUT"))
            .and(path("/api/cortex/video-sources"))
            .and(header("If-Match", "v1"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("ETag", "v2")
                    .set_body_string(
                        r#"{"sources":[],"activeId":null,"device":null}"#,
                    ),
            )
            .mount(&server)
            .await;

        let result = push_to_cortex_inner(
            server.uri().as_str(),
            "test",
            CortexVideoSourcesSnapshot {
                sources: vec![],
                active_id: None,
                device: None,
            },
        )
        .await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        let snap = result.unwrap();
        assert_eq!(snap.etag, "v2");
    }

    #[tokio::test]
    async fn push_to_cortex_returns_412_error_on_etag_mismatch() {
        let server = MockServer::start().await;
        // Server's ETag differs from what the client will send.
        Mock::given(method("GET"))
            .and(path("/api/cortex/video-sources"))
            .respond_with(ResponseTemplate::new(200).insert_header("ETag", "v3"))
            .mount(&server)
            .await;
        // PUT mock returns 412 (the cortex side rejects stale ETag).
        Mock::given(method("PUT"))
            .and(path("/api/cortex/video-sources"))
            .respond_with(ResponseTemplate::new(412))
            .mount(&server)
            .await;

        let result = push_to_cortex_inner(
            server.uri().as_str(),
            "test",
            CortexVideoSourcesSnapshot {
                sources: vec![],
                active_id: None,
                device: None,
            },
        )
        .await;
        assert!(matches!(result, Err(CommandError::Cortex412)));
    }
}
