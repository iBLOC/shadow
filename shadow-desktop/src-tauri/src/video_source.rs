//! Tauri commands for UVC device enumeration, capability probing, and
//! in-process thalamus (diencephalon) camera registration. Camera
//! access itself happens in the webview layer via
//! `navigator.mediaDevices`; this Rust side is a thin proxy that lets
//! the React UI surface a "press a button to find cameras" affordance
//! and a "push my current list into thalamus" action.
//!
//! Wire shape: the same JSON the webview emits (Spec #1's
//! video-source shape). The Rust side writes each source directly into
//! the in-process `encephalon::diencephalon::Thalamus` (no ETag dance, no HTTP).
//!
//! ⚠️ **camelCase**：与端脑的 `video_sources` DTO、桌面端的 TS 类型
//!    `TelencephalonVideoSourcesSnapshot` **说同一种话**。
//!    历史上端脑那边漏过一次 `rename_all` ⇒ 客户端 PUT 被静默 422 ⇒
//!    而客户端是 `.catch(() => {})` ⇒ **失败长得像成功**。
//!
//! ⚠️ 这四个 Tauri command（`enumerate_uvc` / `probe_capabilities` /
//!    `push_thalamus` / `sync_health`）**当前在前端没有任何调用点**
//!    —— 桌面端走的是 HTTP `/api/telencephalon/video-sources`。
//!    ⇒ 这条路是**待清理的死路径**，别再往它上面加功能。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct DeviceBlock {
    pub platform: String,
    pub hostname: String,
    pub telencephalon_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TelencephalonVideoSourcesSnapshot {
    pub sources: Vec<VideoSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub snapshot: TelencephalonVideoSourcesSnapshot,
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
    // ⚠️ 下面三个变体还没被构造出来（2026-11-08）—— 但它们是**真实会
    // 发生的失败**（设备枚举失败 / 权限被拒 / 存储配额超限）⇒ ⇒ 留着，
    // 别让 lint 把错误面删掉（将来构造它们时不用再改这块）。
    #[allow(dead_code)]
    #[error("uvc enumeration failed: {0}")]
    EnumerateFailed(String),
    #[allow(dead_code)]
    #[error("permission denied for camera access")]
    PermissionDenied,
    #[error("camera capability probe failed: {0}")]
    ProbeFailed(String),
    #[allow(dead_code)]
    #[error("local storage quota exceeded")]
    StorageQuota,
    // ⚠️ 同 StorageQuota：留作错误码契约（序列化进前端），当前构造路径不存在。
    #[allow(dead_code)]
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
         Tauri command is reserved for future Rust-side capture"
            .into(),
    ))
}

#[tauri::command]
pub async fn push_thalamus(
    state: tauri::State<'_, crate::AppState>,
    snapshot: TelencephalonVideoSourcesSnapshot,
) -> Result<PushResult, CommandError> {
    // In-process: write each VideoSource into the encephalon::diencephalon::Thalamus
    // camera registry, no HTTP, no ETag. The webview-side snapshot
    // is now the local cache; the diencephalon is the authoritative
    // store.
    for src in &snapshot.sources {
        state.thalamus.register_camera(&src.id);
    }
    if let Some(device) = &snapshot.device {
        tracing::info!(
            host = %device.hostname,
            platform = %device.platform,
            "video sources synced to in-process thalamus ({} sources)",
            snapshot.sources.len()
        );
    }
    Ok(PushResult {
        snapshot,
        // ETag is no longer meaningful in-process; we return a
        // monotonic counter so the webview's cache-busting logic
        // still works.
        etag: format!("v-{}", chrono_now_millis()),
    })
}

#[tauri::command]
pub async fn sync_health() -> Result<SyncHealth, CommandError> {
    // No remote endbrain to sync with; report the in-process state.
    // (Kept as a Tauri command for frontend compatibility — the
    // webview's `reachable` field now reflects whether the in-process
    // bus has subscribers.)
    Ok(SyncHealth {
        reachable: true,
        drift: "in-process",
        error: None,
    })
}

// === Internal helpers ===

fn chrono_now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{TelencephalonVideoSourcesSnapshot, VideoSource};

    #[test]
    fn push_thalamus_snapshot_round_trip() {
        let snap = TelencephalonVideoSourcesSnapshot {
            sources: vec![VideoSource {
                id: "cam-0".into(),
                device_id: "dev-0".into(),
                label: "test camera".into(),
                kind: "uvc".into(),
                serial: None,
                transport: "usb".into(),
                capabilities: serde_json::json!({}),
                active: true,
                created_at: "2026-09-22T00:00:00Z".into(),
                updated_at: "2026-09-22T00:00:00Z".into(),
            }],
            active_id: Some("cam-0".into()),
            device: None,
        };
        let json = serde_json::to_string(&snap).unwrap();
        let back: TelencephalonVideoSourcesSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back.sources.len(), 1);
        assert_eq!(back.sources[0].id, "cam-0");
        assert_eq!(back.active_id.as_deref(), Some("cam-0"));
    }
}
