# Spec #1: shadow-desktop 视频源配置 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 shadow-desktop 用户能配置本机的 UVC 摄像头作为视觉问答输入源，并把这些配置同步到本机 sidecar cortex。

**Architecture:** Tauri webview `navigator.mediaDevices` 列举 UVC 设备 → React zustand store 持有 catalog → Tauri command 通过 `reqwest` + `X-Cortex-Admin-Token` PUT 到 cortex `/api/cortex/video-sources`；cortex 新增 `cortex_video_sources` 表 + GET/PUT 路由 + ETag 乐观并发。SettingsPage 插入新 `VideoSourcesCard`（shadcn/ui）。

**Tech Stack:**
- Frontend: React 19 + TypeScript + Zustand 5 + shadcn/ui (Card/Table/Badge/Tooltip/Button) + Tailwind
- Backend: Tauri 2 + Rust (axum 0.8 + sqlx 0.8 + reqwest + tokio)
- Cortex: axum 0.8 + sqlx + serde_json
- Schema: Postgres (cortex database, 已有 `DATABASE_URL`)

**Spec:** `/home/ibloc/Projects/shadow/docs/superpowers/specs/2026-08-26-shadow-desktop-video-source-config-design.md`

---

## File Structure

### New files (cortex)

- `cortex/migrations/<timestamp>_cortex_video_sources.sql` — Postgres table + partial unique index
- `cortex/src/api/video_source.rs` — `GET /api/cortex/video-sources` + `PUT /api/cortex/video-sources`
- `cortex/src/video_sources/repo.rs` — `VideoSourcesRepo` (sqlx-backed read/write)
- `cortex/src/video_sources/types.rs` — `VideoSource`, `CortexVideoSourcesSnapshot`, `DeviceCapability` structs
- `cortex/tests/video_sources_e2e.rs` — integration tests (boot ephemeral Postgres)

### Modified files (cortex)

- `cortex/src/state.rs` — `AppState` adds `Arc<VideoSourcesRepo>`
- `cortex/src/server.rs` — `routes()` adds `GET/PUT /api/cortex/video-sources`
- `cortex/Cargo.toml` — no new deps (serde, sqlx, axum already present)

### New files (shadow-desktop frontend)

- `shadow-desktop/src/lib/cortexClient.ts` — add `listVideoSources(snapshot, ifMatch)` + `putVideoSources(snapshot, ifMatch)` (or extend existing `cortexClient` class)
- `shadow-desktop/src/stores/videoSourceStore.ts` — Zustand store: `catalog`, `activeId`, `available`, `sync` state, localStorage mirror
- `shadow-desktop/src/components/business/VideoSourcesCard/VideoSourcesCard.tsx` — main React component
- `shadow-desktop/src/components/business/VideoSourcesCard/SourceRow.tsx` — single source row
- `shadow-desktop/src/components/business/VideoSourcesCard/AvailableDeviceRow.tsx` — available-but-not-added row
- `shadow-desktop/src/components/business/VideoSourcesCard/index.ts` — barrel export
- `shadow-desktop/src/components/business/VideoSourcesCard/VideoSourcesCard.test.tsx` — vitest

### New files (shadow-desktop Tauri)

- `shadow-desktop/src-tauri/src/video_source.rs` — `enumerate_uvc`, `probe_capabilities`, `push_to_cortex`, `sync_health` Tauri commands
- `shadow-desktop/src-tauri/src/video_source.test.rs` — minimal unit tests with mocked reqwest

### Modified files (shadow-desktop)

- `shadow-desktop/src-tauri/src/lib.rs` — `.invoke_handler` registers new commands; bootstrap calls `push_to_cortex` on boot when sources exist
- `shadow-desktop/src/AGENTS.md` — note `VideoSourcesCard` lives in `components/business/`
- `shadow-desktop/src/pages/SettingsPage.tsx` — insert `VideoSourcesCard` as new section between 'models' and 'ui'
- `shadow-desktop/src/lib/cortexClient.ts` — add `putVideoSources(snap, ifMatch)`, `listVideoSources()` methods
- `shadow-desktop/src/lib/i18n/locales/zh-CN.ts` + `en-US.ts` — add 22 videoSources keys
- `shadow-desktop/e2e-tests/video-sources.spec.ts` — Playwright e2e
- `shadow-desktop/Cargo.toml` — add `cortex_admin_token` config reader (or env-only)
- `shadow-desktop/src/components/AppInitializer.tsx` — `MODEL_SETUP_PATHS` unchanged (this isn't a model setup card)

---

## Chunk 1.1: Cortex data model + REST surface

**Files:**
- Create: `cortex/migrations/<timestamp>_cortex_video_sources.sql`
- Create: `cortex/src/video_sources/types.rs`
- Create: `cortex/src/video_sources/repo.rs`
- Create: `cortex/src/api/video_source.rs`
- Modify: `cortex/src/state.rs`
- Modify: `cortex/src/server.rs`
- Test: `cortex/tests/video_sources_e2e.rs`

- [ ] **Step 1: Write the failing test (repo + REST round-trip)**

Create `cortex/tests/video_sources_e2e.rs`:

```rust
//! Integration tests for the video-sources REST surface.
//! Boots cortex with an ephemeral Postgres database; exercises
//! the GET/PUT ETag round-trip plus concurrent-active invariant.

use cortex::api::video_source::*;
use cortex::test_harness::boot_cortex_test;   // existing helper in cortex/src/test_harness.rs
use reqwest::Client;

#[tokio::test]
async fn get_returns_empty_snapshot_on_fresh_db() {
    let (app, _cleanup) = boot_cortex_test().await;
    let resp = Client::new().get(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["sources"], serde_json::json!([]));
    assert_eq!(body["activeId"], serde_json::Value::Null);
}

#[tokio::test]
async fn put_then_get_roundtrip_preserves_snapshot() {
    let (app, _cleanup) = boot_cortex_test().await;
    let snapshot = serde_json::json!({
        "sources": [{
            "id": "vsrc_abc",
            "deviceId": "abcd",
            "label": "Logitech BRIO",
            "kind": "uvc",
            "transport": "browser",
            "capabilities": { "widths": [1920], "frameRates": [60] },
            "active": true,
            "createdAt": "2026-08-26T11:00:00Z",
            "updatedAt": "2026-08-26T11:00:00Z"
        }],
        "activeId": "vsrc_abc",
        "device": {
            "platform": "linux",
            "hostname": "ibloc-desktop",
            "cortexVersion": "0.5.0"
        }
    });
    // PUT
    let resp = Client::new().put(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .header("If-Match", "*")
        .json(&snapshot)
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let etag = resp.headers().get("ETag").unwrap().to_str().unwrap().to_string();
    // GET
    let resp = Client::new().get(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .send().await.unwrap();
    let got: serde_json::Value = resp.json().await.unwrap();
    let first = &got["sources"][0];
    assert_eq!(first["id"], "vsrc_abc");
    assert_eq!(first["label"], "Logitech BRIO");
    assert_eq!(first["active"], true);
    assert_eq!(got["activeId"], "vsrc_abc");
    assert!(!etag.is_empty());
}

#[tokio::test]
async fn put_with_stale_etag_returns_412() {
    let (app, _) = boot_cortex_test().await;
    let snapshot = serde_json::json!({"sources": [], "activeId": null, "device": {}});
    Client::new().put(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .json(&snapshot).send().await.unwrap();   // first PUT, gets ETag v1
    // Second PUT with stale If-Match
    let resp = Client::new().put(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .header("If-Match", "v0-stale")
        .json(&snapshot).send().await.unwrap();
    assert_eq!(resp.status(), 412);
}

#[tokio::test]
async fn putting_two_active_rows_returns_500() {
    let (app, _) = boot_cortex_test().await;
    let snapshot = serde_json::json!({
        "sources": [
            { "id": "vsrc_a", "deviceId": "a", "label": "A", "kind": "uvc",
              "transport": "browser", "capabilities": {}, "active": true,
              "createdAt": "2026-08-26T11:00:00Z", "updatedAt": "2026-08-26T11:00:00Z" },
            { "id": "vsrc_b", "deviceId": "b", "label": "B", "kind": "uvc",
              "transport": "browser", "capabilities": {}, "active": true,
              "createdAt": "2026-08-26T11:00:00Z", "updatedAt": "2026-08-26T11:00:00Z" }
        ],
        "activeId": "vsrc_a",
        "device": {}
    });
    let resp = Client::new().put(format!("{app}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", _admin_token())
        .json(&snapshot).send().await.unwrap();
    // Partial unique index on active=true rejects this
    assert_eq!(resp.status(), 500);
}

fn _admin_token() -> String {
    std::env::var("CORTEX_TEST_ADMIN_TOKEN").unwrap_or_else(|_| "test-token".into())
}
```

Run: `cd cortex && cargo test --test video_sources_e2e -- --nocapture`
Expected: compile error (`boot_cortex_test`, `cortex::api::video_source`, etc. don't exist yet).

- [ ] **Step 2: Create the SQL migration**

Create `cortex/migrations/<timestamp>_cortex_video_sources.sql` (use today's date in the filename). Find the existing migration filenames via `ls cortex/migrations/` and bump the timestamp.

```sql
CREATE TABLE cortex_video_sources (
    id              TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    label           TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'uvc',
    serial          TEXT,
    transport       TEXT NOT NULL DEFAULT 'browser',
    capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cortex_video_sources_one_active
    ON cortex_video_sources (active)
    WHERE active;
```

Wire it into the migration loader (find where existing migrations are scanned in `cortex/src/lib.rs` or `cortex/src/state.rs`).

- [ ] **Step 3: Create types and repo skeleton**

Create `cortex/src/video_sources/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSource {
    pub id: String,
    pub device_id: String,
    pub label: String,
    pub kind: String,           // "uvc" only for Spec #1
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
    pub transport: String,      // "browser" only for Spec #1
    pub capabilities: serde_json::Value,
    pub active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceBlock {
    pub platform: String,
    pub hostname: String,
    pub cortex_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CortexVideoSourcesSnapshot {
    pub sources: Vec<VideoSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceBlock>,
}
```

Create `cortex/src/video_sources/repo.rs`:

```rust
use sqlx::PgPool;
use crate::video_sources::types::{CortexVideoSourcesSnapshot, VideoSource};
use chrono::Utc;

#[derive(Clone)]
pub struct VideoSourcesRepo {
    pool: PgPool,
}

impl VideoSourcesRepo {
    pub fn new(pool: PgPool) -> Self { Self { pool } }

    pub async fn read(&self) -> Result<CortexVideoSourcesSnapshot, sqlx::Error> {
        let rows = sqlx::query!(
            "SELECT id, device_id, label, kind, serial, transport, capabilities, active, created_at, updated_at
             FROM cortex_video_sources
             ORDER BY created_at"
        )
        .fetch_all(&self.pool).await?;
        let active_id = rows.iter().find(|r| r.active).map(|r| r.id.clone());
        let sources = rows.into_iter().map(|r| VideoSource {
            id: r.id, device_id: r.device_id, label: r.label, kind: r.kind,
            serial: r.serial, transport: r.transport, capabilities: r.capabilities,
            active: r.active, created_at: r.created_at, updated_at: r.updated_at,
        }).collect();
        Ok(CortexVideoSourcesSnapshot { sources, active_id, device: None })
    }

    pub async fn replace_all(&self, snapshot: &CortexVideoSourcesSnapshot)
        -> Result<(), sqlx::Error>
    {
        let mut tx = self.pool.begin().await?;
        sqlx::query!("DELETE FROM cortex_video_sources").execute(&mut *tx).await?;
        for s in &snapshot.sources {
            sqlx::query!(
                "INSERT INTO cortex_video_sources
                 (id, device_id, label, kind, serial, transport, capabilities, active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                s.id, s.device_id, s.label, s.kind, s.serial, s.transport, s.capabilities,
                s.active, s.created_at, Utc::now(),
            ).execute(&mut *tx).await?;
        }
        // Partial unique index on `WHERE active` rejects any 2nd active row,
        // so duplicate-active payloads error out cleanly at the DB layer.
        tx.commit().await?;
        Ok(())
    }
}
```

Wire `VideoSourcesRepo` into `AppState` (`cortex/src/state.rs`). Use the existing `state.pool` (PgPool) — pass it via `VideoSourcesRepo::new(pool.clone())`.

- [ ] **Step 4: Create the REST surface**

Create `cortex/src/api/video_source.rs`:

```rust
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use crate::security::admin_auth;   // existing helper — wrap in same X-Admin-Token check
use crate::state::AppState;
use crate::video_sources::repo::VideoSourcesRepo;
use crate::video_sources::types::CortexVideoSourcesSnapshot;
use serde_json::json;
use sha2::{Digest, Sha256};   // already in cortex's Cargo.toml

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cortex/video-sources", get(get_handler).put(put_handler))
        .route(
            "/api/cortex/video-sources/{id}",
            get(single_get_handler).delete(delete_handler),
        )
        .route(
            "/api/cortex/video-sources/{id}/probe",
            axum::routing::post(probe_handler),
        )
}

async fn get_handler(State(state): State<AppState>, headers: HeaderMap)
    -> Result<Json<CortexVideoSourcesSnapshot>, StatusCode>
{
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let repo = VideoSourcesRepo::new(state.pool.clone());
    let snap = repo.read().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut resp = snap;
    // Compute ETag from JSON content hash for client optimistic concurrency
    let body_json = serde_json::to_string(&resp).unwrap();
    let etag = format!("{:x}", Sha256::digest(body_json.as_bytes()));
    resp.device = Some(crate::video_sources::types::DeviceBlock {
        platform: std::env::consts::OS.to_string(),
        hostname: hostname().unwrap_or_default(),
        cortex_version: env!("CARGO_PKG_VERSION").to_string(),
    });
    Ok(([(axum::http::header::ETAG, etag.parse().unwrap())], Json(resp)).into_response())
}

async fn put_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(snapshot): Json<CortexVideoSourcesSnapshot>,
) -> Result<(StatusCode, [(axum::http::header::HeaderName, String); 1]), StatusCode> {
    if !admin_auth(&headers, &state.config) { return Err(StatusCode::UNAUTHORIZED); }
    let etag = headers.get("If-Match").and_then(|v| v.to_str().ok()).unwrap_or("");
    let repo = VideoSourcesRepo::new(state.pool.clone());

    // ETag check: compute expected ETag of current snapshot, compare
    if etag != "*" && etag != current_etag(&state).await {
        return Err(StatusCode::PRECONDITION_FAILED);
    }

    repo.replace_all(&snapshot).await.map_err(|e| {
        tracing::error!("video-sources PUT failed: {e}");
        // Partial-unique-index violation returns unique-violation sqlx error
        if let sqlx::Error::Database(db_err) = &e {
            if db_err.code().as_deref() == Some("23505") {
                return StatusCode::INTERNAL_SERVER_ERROR;
            }
        }
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let new_etag = compute_etag(&snapshot);
    Ok((StatusCode::OK, [(axum::http::header::ETAG, new_etag)]))
}

async fn single_get_handler(...) -> StatusCode { StatusCode::NOT_IMPLEMENTED }
async fn delete_handler(...) -> StatusCode { StatusCode::NOT_IMPLEMENTED }
async fn probe_handler(...) -> StatusCode { StatusCode::NOT_IMPLEMENTED }

async fn current_etag(state: &AppState) -> String {
    // Read + hash; for tests it's enough to read fresh each time
    let repo = VideoSourcesRepo::new(state.pool.clone());
    let snap = repo.read().await.unwrap_or_default();
    compute_etag(&snap)
}

fn compute_etag(snap: &CortexVideoSourcesSnapshot) -> String {
    let body = serde_json::to_string(snap).unwrap();
    format!("{:x}", Sha256::digest(body.as_bytes()))
}
```

Use `cortex/src/security/admin_auth` — the existing admin token check (X-Admin-Token). Look up its exact signature in `cortex/src/security/admin_auth.rs`.

- [ ] **Step 5: Wire routes into server**

Modify `cortex/src/server.rs`:

```rust
pub fn routes() -> Router<AppState> {
    Router::new()
        // ... existing routes ...
        .nest(crate::api::video_source::router())
}
```

Or merge into the existing Router construction. Find the spot.

- [ ] **Step 6: Run the e2e tests**

Run: `cd cortex && cargo test --test video_sources_e2e -- --nocapture`
Expected: ALL PASS (1 passed; 0 failed; 4 ignored for stuff depending on real mage_vl)

- [ ] **Step 7: Commit**

```bash
cd cortex
git add migrations/ src/video_sources/ src/api/video_source.rs src/state.rs src/server.rs tests/video_sources_e2e.rs
git commit -m "feat(cortex): video-sources GET/PUT + storage layer (Spec #1 backend)"
```

---

## Chunk 1.2: shadow-desktop Tauri commands

**Files:**
- Create: `shadow-desktop/src-tauri/src/video_source.rs`
- Modify: `shadow-desktop/src-tauri/src/lib.rs`
- Modify: `shadow-desktop/Cargo.toml` (only if `hostname` crate is needed)
- Test: `shadow-desktop/src-tauri/src/video_source.test.rs`

- [ ] **Step 1: Write the failing test for push_to_cortex ETag round-trip**

Create `shadow-desktop/src-tauri/src/video_source.test.rs`:

```rust
//! Unit tests for video_source Tauri commands. Uses mockito-style
//! HTTP mocking via the `wiremock` dev-dependency (already in
//! shadow-desktop/src-tauri/Cargo.toml for tauri-plugin-store tests).

use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, header};

#[tokio::test]
async fn push_to_cortex_sends_correct_body_and_parses_etag() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/cortex/video-sources"))
        .and(header("X-Cortex-Admin-Token", "test"))
        .respond_with(ResponseTemplate::new(200)
            .insert_header("ETag", "v1")
            .set_body_string(r#"{"sources":[],"activeId":null,"device":null}"#))
        .mount(&server)
        .await;
    Mock::given(method("PUT"))
        .and(path("/api/cortex/video-sources"))
        .and(header("If-Match", "v1"))
        .respond_with(ResponseTemplate::new(200)
            .insert_header("ETag", "v2"))
            .set_body_string(r#"{"sources":[],"activeId":null,"device":null}"#))
        .mount(&server)
        .await;

    let result = push_to_cortex_inner(server.uri().as_str(), "test", CortexVideoSourcesSnapshot {
        sources: vec![], active_id: None, device: None,
    }).await;
    assert!(result.is_ok());
    let snap = result.unwrap();
    assert_eq!(snap.etag, "v2");
}

#[tokio::test]
async fn push_to_cortex_returns_412_error_on_etag_mismatch() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/cortex/video-sources"))
        .respond_with(ResponseTemplate::new(200)
            .insert_header("ETag", "v3"))   // different from what push sends
        .mount(&server).await;
    // No PUT mock registered → 404 → not 412, so this case will fail.
    // Adjust: register PUT to return 412 instead.
    Mock::given(method("PUT"))
        .respond_with(ResponseTemplate::new(412))
        .mount(&server).await;

    let result = push_to_cortex_inner(server.uri().as_str(), "test", CortexVideoSourcesSnapshot {
        sources: vec![], active_id: None, device: None,
    }).await;
    assert!(matches!(result, Err(CommandError::Cortex412)));
}
```

(Note: this requires `push_to_cortex_inner` to be a `pub(crate)` helper that the test can call directly. Refactor `push_to_cortex` Tauri command to delegate.)

Run: `cd shadow-desktop && cargo test --lib video_source`
Expected: compile error (`push_to_cortex_inner`, `CommandError`, etc. don't exist yet).

- [ ] **Step 2: Add CommandError enum**

Add to `shadow-desktop/src-tauri/src/error.rs` (or wherever CommandError lives):

```rust
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
    #[error("local storage quota exceeded")]
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
```

- [ ] **Step 3: Implement the Tauri commands**

Create `shadow-desktop/src-tauri/src/video_source.rs`:

```rust
//! Tauri commands for UVC device enumeration, capability probing, and
//! cortex synchronization. Camera access itself happens in the
//! React/webview layer via `navigator.mediaDevices`; this Rust side
//! proxies the enumeration JSON across the Tauri boundary and pushes
//! it to the local cortex sidecar.

use crate::error::CommandError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDeviceInfo {
    pub device_id: String,
    pub label: String,
    pub kind: &'static str,   // "uvc"
    pub serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCapabilities {
    pub widths: Vec<u32>,
    pub heights: Vec<u32>,
    pub frame_rates: Vec<u32>,
    pub probed_at: i64,        // epoch seconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CortexVideoSourcesSnapshot {
    pub sources: Vec<serde_json::Value>,
    pub active_id: Option<String>,
    pub device: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncHealth {
    pub reachable: bool,
    pub drift: &'static str,  // "in-sync" | "pending" | "diverged"
    pub error: Option<String>,
}

// === Commands ===

#[tauri::command]
pub async fn enumerate_uvc() -> Result<Vec<RawDeviceInfo>, CommandError> {
    // The webview is the one that can see UVC devices. The Tauri
    // command is a thin shim that just reflects whatever the webview
    // already cached via navigator.mediaDevices. The webview's
    // VideoSourcesCard populates a Tauri-side zustand store with the
    // enumerated devices, which is what this command returns.
    //
    // For tests (no webview), this returns a hardcoded empty list.
    Ok(vec![])
}

#[tauri::command]
pub async fn probe_capabilities(_device_id: String) -> Result<SourceCapabilities, CommandError> {
    // Out of scope for Spec #1: capability probing happens in the
    // webview (MediaStream + track.getSettings()). Spec #1 only needs
    // the type to exist so the frontend can reference it.
    Err(CommandError::ProbeFailed(
        "capability probing happens in the webview (MediaStream.getSettings) — \
         Tauri command is reserved for future Rust-side capture".into()
    ))
}

#[tauri::command]
pub async fn push_to_cortex(
    app: tauri::AppHandle,
    snapshot: CortexVideoSourcesSnapshot,
) -> Result<CortexVideoSourcesSnapshot, CommandError> {
    let cortex_url = std::env::var("CORTEX_URL")
        .unwrap_or_else(|_| "http://localhost:60080".to_string());
    let token = read_cortex_admin_token(&app)?;
    push_to_cortex_inner(&cortex_url, &token, snapshot).await
}

pub(crate) async fn push_to_cortex_inner(
    cortex_url: &str, token: &str, snapshot: CortexVideoSourcesSnapshot,
) -> Result<CortexVideoSourcesSnapshot, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build().map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;

    // Step 1: GET to fetch current ETag
    let get_resp = client.get(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", token)
        .send().await
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    if get_resp.status() == 401 { return Err(CommandError::CortexAuthFailed); }
    if !get_resp.status().is_success() {
        return Err(CommandError::CortexUnreachable(format!("GET returned {}", get_resp.status())));
    }
    let etag = get_resp.headers().get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_else(|| "*".to_string());

    // Step 2: PUT with If-Match
    let put_resp = client.put(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", token)
        .header("If-Match", &etag)
        .json(&snapshot)
        .send().await
        .map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    if put_resp.status() == 401 { return Err(CommandError::CortexAuthFailed); }
    if put_resp.status() == 412 { return Err(CommandError::Cortex412); }
    if !put_resp.status().is_success() {
        return Err(CommandError::CortexUnreachable(format!("PUT returned {}", put_resp.status())));
    }
    let new_etag = put_resp.headers().get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_default();
    let mut out = snapshot;
    // Annotate returned snapshot with new etag for caller
    out.device = Some(serde_json::json!({ "etag": new_etag }));
    Ok(out)
}

#[tauri::command]
pub async fn sync_health(app: tauri::AppHandle) -> Result<SyncHealth, CommandError> {
    let cortex_url = std::env::var("CORTEX_URL")
        .unwrap_or_else(|_| "http://localhost:60080".to_string());
    let token = read_cortex_admin_token(&app)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build().map_err(|e| CommandError::CortexUnreachable(e.to_string()))?;
    match client.get(format!("{cortex_url}/api/cortex/video-sources"))
        .header("X-Cortex-Admin-Token", token)
        .send().await
    {
        Ok(r) if r.status().is_success() => Ok(SyncHealth { reachable: true, drift: "in-sync", error: None }),
        Ok(r) => Ok(SyncHealth { reachable: false, drift: "diverged", error: Some(format!("HTTP {}", r.status())) }),
        Err(e) => Ok(SyncHealth { reachable: false, drift: "diverged", error: Some(e.to_string()) }),
    }
}

fn read_cortex_admin_token(app: &tauri::AppHandle) -> Result<String, CommandError> {
    std::env::var("CORTEX_ADMIN_TOKEN")
        .or_else(|_| app.state::<crate::CortexAdminToken>().0.clone().ok_or(()))
        .map_err(|_| CommandError::CortexAuthFailed)
}
```

Add `CortexAdminToken` state struct in `lib.rs`:

```rust
#[derive(Default)]
pub struct CortexAdminToken(pub Option<String>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let admin_token = std::env::var("CORTEX_ADMIN_TOKEN").ok();
    tauri::Builder::default()
        .manage(CortexAdminToken(admin_token))
        .invoke_handler(tauri::generate_handler![
            // ... existing ...
            video_source::enumerate_uvc,
            video_source::probe_capabilities,
            video_source::push_to_cortex,
            video_source::sync_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Run the unit tests**

Run: `cd shadow-desktop && cargo test --lib video_source`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd shadow-desktop
git add src-tauri/src/video_source.rs src-tauri/src/video_source.test.rs \
        src-tauri/src/error.rs src-tauri/src/lib.rs Cargo.toml
git commit -m "feat(desktop/tauri): video_source commands + ETag push (Spec #1 Tauri layer)"
```

---

## Chunk 1.3: shadow-desktop frontend — store + card + i18n

**Files:**
- Create: `shadow-desktop/src/stores/videoSourceStore.ts`
- Create: `shadow-desktop/src/lib/cortexClient.ts` (extend — add `listVideoSources`, `putVideoSources`)
- Create: `shadow-desktop/src/components/business/VideoSourcesCard/VideoSourcesCard.tsx`
- Create: `shadow-desktop/src/components/business/VideoSourcesCard/SourceRow.tsx`
- Create: `shadow-desktop/src/components/business/VideoSourcesCard/AvailableDeviceRow.tsx`
- Create: `shadow-desktop/src/components/business/VideoSourcesCard/index.ts`
- Create: `shadow-desktop/src/components/business/VideoSourcesCard/VideoSourcesCard.test.tsx`
- Modify: `shadow-desktop/src/pages/SettingsPage.tsx`
- Modify: `shadow-desktop/src/i18n/locales/zh-CN.ts` + `en-US.ts`
- Modify: `shadow-desktop/src/components/AppInitializer.tsx` (no MODEL_SETUP_PATHS change; this isn't a model setup card)

- [ ] **Step 1: Extend cortexClient.ts**

Edit `shadow-desktop/src/lib/cortexClient.ts` — add two new methods to the existing `cortexClient` class:

```typescript
async listVideoSources(etag?: string): Promise<{ snapshot: CortexVideoSourcesSnapshot; etag: string }> {
  const res = await fetch(`${this.baseUrl}/api/cortex/video-sources`, {
    headers: { 'X-Cortex-Admin-Token': this.adminToken, ...(etag ? { 'If-None-Match': etag } : {}) },
  });
  if (res.status === 304) {
    return { snapshot: this.cachedSnapshot!, etag: etag! };
  }
  if (!res.ok) throw new Error(`listVideoSources failed: ${res.status}`);
  const newEtag = res.headers.get('ETag') || '';
  const snapshot = await res.json();
  this.cachedSnapshot = snapshot;
  return { snapshot, etag: newEtag };
}

async putVideoSources(snapshot: CortexVideoSourcesSnapshot, ifMatch: string): Promise<string> {
  const res = await fetch(`${this.baseUrl}/api/cortex/video-sources`, {
    method: 'PUT',
    headers: {
      'X-Cortex-Admin-Token': this.adminToken,
      'If-Match': ifMatch,
      'content-type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });
  if (res.status === 412) throw new Cortex412Error('video-sources ETag mismatch');
  if (!res.ok) throw new Error(`putVideoSources failed: ${res.status}`);
  return res.headers.get('ETag') || '';
}

export class Cortex412Error extends Error {
  constructor(public reason: string) { super(reason); }
}
```

Add the `CortexVideoSourcesSnapshot` type in the same file (or in `src/types/cortex.ts` if it exists).

- [ ] **Step 2: Write the failing test for VideoSourcesCard**

Create `shadow-desktop/src/components/business/VideoSourcesCard/VideoSourcesCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VideoSourcesCard } from './VideoSourcesCard';
import { useVideoSourceStore } from '../../../stores/videoSourceStore';

vi.mock('@tauri-apps/api', () => ({ invoke: vi.fn() }));
vi.mock('../../../lib/cortexClient', () => ({
  cortexClient: {
    listVideoSources: vi.fn().mockResolvedValue({
      snapshot: { sources: [], activeId: null, device: null },
      etag: 'v1',
    }),
    putVideoSources: vi.fn().mockResolvedValue('v2'),
  },
}));

describe('VideoSourcesCard', () => {
  beforeEach(() => {
    useVideoSourceStore.setState({
      catalog: new Map(), activeId: null, available: new Map(),
      sync: 'idle', lastCortexSnapshot: undefined, lastSyncAt: undefined,
    });
  });

  it('renders empty state when no devices', async () => {
    render(<VideoSourcesCard />);
    expect(await screen.findByText(/no UVC devices found/i)).toBeInTheDocument();
  });

  it('lists active and inactive sources correctly', async () => {
    useVideoSourceStore.setState({
      catalog: new Map([
        ['dev1', { id: 'vsrc_a', deviceId: 'dev1', label: 'BRIO', kind: 'uvc',
                   capabilities: { widths: [1920], frameRates: [60] }, active: true,
                   createdAt: 0, updatedAt: 0 }],
        ['dev2', { id: 'vsrc_b', deviceId: 'dev2', label: 'FaceTime', kind: 'uvc',
                   capabilities: {}, active: false,
                   createdAt: 0, updatedAt: 0 }],
      ]),
      activeId: 'vsrc_a',
      available: new Map(),
      sync: 'idle',
    });
    render(<VideoSourcesCard />);
    expect(await screen.findByText('BRIO')).toBeInTheDocument();
    expect(screen.getByText('FaceTime')).toBeInTheDocument();
    expect(screen.getByText(/1920/)).toBeInTheDocument();
  });

  it('shows sync status banner when cortex unreachable', async () => {
    useVideoSourceStore.setState({
      catalog: new Map(), activeId: null, available: new Map(),
      sync: 'stale', lastSyncAt: Date.now() - 12 * 60 * 1000,
      lastCortexSnapshot: undefined,
    });
    render(<VideoSourcesCard />);
    expect(await screen.findByText(/12 min ago/i)).toBeInTheDocument();
  });
});
```

Run: `pnpm test -- VideoSourcesCard`
Expected: FAIL with "Cannot find module 'VideoSourcesCard'".

- [ ] **Step 3: Create the zustand store**

Create `shadow-desktop/src/stores/videoSourceStore.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VideoSource {
  id: string;
  deviceId: string;
  label: string;
  kind: 'uvc';
  serial?: string;
  capabilities: SourceCapabilities;
  createdAt: number;
  updatedAt: number;
}

export interface SourceCapabilities {
  widths: number[];
  heights: number[];
  frameRates: number[];
}

export interface RawDevice {
  deviceId: string;
  label: string;
  serial?: string;
}

export type SyncState = 'idle' | 'pushing' | 'stale';

export interface VideoSourceState {
  catalog: Map<string /* deviceId */, VideoSource>;
  activeId: string | null;
  available: Map<string /* deviceId */, RawDevice>;
  sync: SyncState;
  lastCortexSnapshot?: unknown;
  lastSyncAt?: number;

  hydrate(): Promise<void>;
  refreshFromCortex(): Promise<void>;
  refreshAvailable(devices: RawDevice[]): void;
  addFromAvailable(deviceId: string): Promise<void>;
  setActive(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  rescan(): Promise<void>;
}

const STORAGE_KEY = 'shadow.videoSources.v1';

export const useVideoSourceStore = create<VideoSourceState>()(
  persist(
    (set, get) => ({
      catalog: new Map(),
      activeId: null,
      available: new Map(),
      sync: 'idle',

      hydrate: async () => {
        const { cortexClient } = await import('../lib/cortexClient');
        try {
          const { snapshot, etag } = await cortexClient.listVideoSources();
          set({ lastCortexSnapshot: snapshot, sync: 'idle', lastSyncAt: Date.now() });
        } catch (e) {
          set({ sync: 'stale' });
        }
      },

      refreshFromCortex: async () => {
        const { cortexClient } = await import('../lib/cortexClient');
        const { snapshot } = await cortexClient.listVideoSources();
        // Merge: local catalog keys not in cortex → mark as stale (UI shows missing badge)
        const localIds = new Set(get().catalog.keys());
        const remoteIds = new Set(snapshot.sources.map(s => s.deviceId));
        // Apply remote snapshot to local catalog
        const newCatalog = new Map<string, VideoSource>();
        for (const s of snapshot.sources) {
          newCatalog.set(s.deviceId, { ...s });
        }
        // Stale entries: local-only
        for (const localId of localIds) {
          if (!remoteIds.has(localId)) {
            // keep the local entry but the UI will show it as missing
            const local = get().catalog.get(localId);
            if (local) newCatalog.set(localId, local);
          }
        }
        set({
          catalog: newCatalog,
          activeId: snapshot.activeId,
          sync: 'idle',
          lastCortexSnapshot: snapshot,
          lastSyncAt: Date.now(),
        });
      },

      refreshAvailable: (devices) => {
        const m = new Map<string, RawDevice>();
        for (const d of devices) m.set(d.deviceId, d);
        set({ available: m });
      },

      addFromAvailable: async (deviceId) => {
        const dev = get().available.get(deviceId);
        if (!dev) throw new Error(`device not in available: ${deviceId}`);
        const id = generateUlid();   // or use crypto.randomUUID
        const now = Date.now();
        const newSource: VideoSource = {
          id, deviceId, label: dev.label, kind: 'uvc',
          serial: dev.serial,
          capabilities: { widths: [], heights: [], frameRates: [] },
          createdAt: now, updatedAt: now,
        };
        const nextCatalog = new Map(get().catalog);
        nextCatalog.set(deviceId, newSource);
        const activeId = get().activeId ?? id;   // first added becomes active
        set({ catalog: nextCatalog, activeId });
        await get().setActive(activeId);
      },

      setActive: async (id) => {
        set({ activeId: id });
        await pushToCortexFromState();
      },

      remove: async (id) => {
        const nextCatalog = new Map(get().catalog);
        const toRemove = [...nextCatalog.values()].find(s => s.id === id);
        if (toRemove) nextCatalog.delete(toRemove.deviceId);
        const activeId = get().activeId === id ? null : get().activeId;
        set({ catalog: nextCatalog, activeId });
        await pushToCortexFromState();
      },

      rescan: async () => {
        // Stub: webview enumerates via navigator.mediaDevices
        // In real usage, this is called from React with the enumerated list.
        // For headless test, this is a no-op.
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        catalog: Array.from(s.catalog.entries()),
        activeId: s.activeId,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        catalog: new Map(persisted.catalog || []),
        activeId: persisted.activeId ?? null,
      }),
    }
  )
);

async function pushToCortexFromState() {
  const state = useVideoSourceStore.getState();
  const { cortexClient } = await import('../lib/cortexClient');
  const snap = {
    sources: Array.from(state.catalog.values()),
    activeId: state.activeId,
    device: { platform: navigator?.platform ?? 'web', hostname: location?.hostname ?? 'browser', cortexVersion: 'unknown' },
  };
  try {
    state.sync = 'pushing';
    const newEtag = await cortexClient.putVideoSources(snap as any, '*');
    state.sync = 'idle';
    state.lastSyncAt = Date.now();
    state.lastCortexSnapshot = snap;
  } catch (e: any) {
    if (e instanceof (await import('../lib/cortexClient')).Cortex412Error) {
      // Diff modal — set drift flag, store current snapshot for the UI
      state.sync = 'stale';
      // Re-GET and compare; UI shows the diff modal
      const { snapshot } = await cortexClient.listVideoSources();
      state.lastCortexSnapshot = snapshot;
    } else {
      state.sync = 'stale';
    }
  }
}

function generateUlid(): string {
  // Subset of ULID — 16 bytes base32-ish, prefixed "vsrc_"
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  return 'vsrc_' + Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}
```

- [ ] **Step 4: Create the VideoSourcesCard + sub-components**

Create `shadow-desktop/src/components/business/VideoSourcesCard/index.ts`:

```typescript
export { VideoSourcesCard } from './VideoSourcesCard';
```

Create `SourceRow.tsx`, `AvailableDeviceRow.tsx`, `VideoSourcesCard.tsx`. All using shadcn/ui (Card, Table, Badge, Button, Tooltip). See Spec #1 Section 4 for the wireframe.

Skeleton of `VideoSourcesCard.tsx`:

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { useVideoSourceStore } from '../../../stores/videoSourceStore';
import { SourceRow } from './SourceRow';
import { AvailableDeviceRow } from './AvailableDeviceRow';

export function VideoSourcesCard() {
  const { t } = useTranslation();
  const state = useVideoSourceStore();

  useEffect(() => {
    state.hydrate();
    state.refreshFromCortex();
  }, []);

  // ... renders header + sync badge + table of catalog + available + rescan button
}
```

Implementations of `SourceRow` and `AvailableDeviceRow` follow the wireframe in Spec #1 Section 4.

- [ ] **Step 5: Wire VideoSourcesCard into SettingsPage**

Edit `shadow-desktop/src/pages/SettingsPage.tsx`:

```tsx
import { VideoSourcesCard } from '../components/business/VideoSourcesCard';

type SettingsSection = 'service' | 'models' | 'video' | 'ui' | 'data' | 'system';
// add 'video' to SECTIONS array with icon and labelKey
const SECTIONS: { id: SettingsSection; ... }[] = [
  { id: 'service', icon: Server, labelKey: 'settings.section.service' },
  { id: 'models', icon: Cpu, labelKey: 'settings.section.models' },
  { id: 'video', icon: Camera, labelKey: 'settings.section.video' },   // NEW
  { id: 'ui', icon: Monitor, labelKey: 'settings.section.ui' },
  { id: 'data', icon: Database, labelKey: 'settings.section.data' },
  { id: 'system', icon: Shield, labelKey: 'settings.section.system' },
];

// in the main render:
{activeSection === 'video' && <VideoSourcesCard />}
```

Also update `ModelsSection` (or surrounding layout) so the new section sits between Models and UI.

- [ ] **Step 6: Add i18n keys**

Edit `shadow-desktop/src/i18n/locales/zh-CN.ts` and `en-US.ts`. Add under `settings.videoSources.*`:

```typescript
videoSources: {
  title: '视频源',
  description: '本设备的视觉问答输入。其他设备可通过 A2A 路由视觉问答到这里。',
  statusInSync: '已同步到 cortex',
  statusStale: 'cortex 不可达 — 最后同步 {ago}',
  emptyNoDevices: '未发现 UVC 设备。插入摄像头后点击重新扫描。',
  permissionDenied: '需要相机权限。点击授权后重试。',
  grantAccess: '授权',
  retrySync: '重试同步',
  rescan: '重新扫描',
  addSource: '添加',
  makeActive: '设为活动',
  remove: '移除',
  activeBadge: '活动',
  missingBadge: '本地有但 cortex 没有',
  capabilities: '能力: {widths}×@ {fps}fps',
  serialUnknown: '序列号未知',
  availableHeader: '可用 (未添加)',
  sourcesHeader: '已配置源',
  errorNoActive: '没有活动视频源。请先添加并设置一台。',
  errorHint: '可在另一台设备上的对话里点名这台设备名。',
  driftInSync: '已同步',
  driftPending: '同步中…',
  driftDiverged: '本地与 cortex 不一致 — 重新加载？',
  etagMismatch: 'cortex 已变更 — 重新加载并重试？',
  reload: '重新加载',
}
```

- [ ] **Step 7: Run all tests + lint**

```bash
cd shadow-desktop
pnpm test -- VideoSourcesCard
pnpm lint
```

Expected: ALL PASS; lint clean.

- [ ] **Step 8: Commit**

```bash
cd shadow-desktop
git add src/lib/cortexClient.ts src/stores/videoSourceStore.ts \
        src/components/business/VideoSourcesCard/ \
        src/pages/SettingsPage.tsx \
        src/i18n/locales/zh-CN.ts src/i18n/locales/en-US.ts
git commit -m "feat(desktop/web): VideoSourcesCard + store + i18n (Spec #1 frontend)"
```

---

## Chunk 1.4: Playwright e2e + cross-platform manual checks

**Files:**
- Create: `shadow-desktop/e2e-tests/video-sources.spec.ts`

- [ ] **Step 1: Write the e2e test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('VideoSourcesCard', () => {
  test.use({
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  });

  test('full happy path: enumerate → add → activate → remove', async ({ page }) => {
    // Mock cortex GET/PUT
    await page.route('**/api/cortex/video-sources', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'ETag': 'v1' },
          contentType: 'application/json',
          body: JSON.stringify({ sources: [], activeId: null, device: null }),
        });
      } else {
        await route.fulfill({ status: 200, headers: { 'ETag': 'v2' } });
      }
    });

    await page.goto('/settings');
    await page.getByText(/Video Sources|视频源/).click();
    await expect(page.getByText(/no UVC devices found|未发现 UVC/)).toBeVisible();

    // Click "Re-scan" (with fake device, will enumerate 1 fake device)
    await page.getByRole('button', { name: /re-scan|重新扫描/ }).click();

    // Click "Add" on the available device
    await page.getByRole('button', { name: /add|添加/ }).first().click();

    // Assert active badge
    await expect(page.getByText(/active|活动/)).toBeVisible();

    // Remove
    await page.getByRole('button', { name: /remove|移除/ }).click();
    await expect(page.getByText(/no UVC devices found|未发现 UVC/)).toBeVisible();
  });

  test('412 from cortex opens diff modal', async ({ page }) => {
    let putCount = 0;
    await page.route('**/api/cortex/video-sources', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, headers: { 'ETag': 'v5' } });
      } else {
        putCount += 1;
        if (putCount === 1) {
          await route.fulfill({ status: 412 });
        } else {
          await route.fulfill({ status: 200, headers: { 'ETag': 'v6' } });
        }
      }
    });

    await page.goto('/settings');
    // ... trigger a put (e.g. via rescan) ...
    await page.getByRole('button', { name: /re-scan|重新扫描/ }).click();
    await expect(page.getByText(/reload|重新加载/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e test**

```bash
cd shadow-desktop
pnpm exec playwright install chromium    # one-time
pnpm exec playwright test e2e-tests/video-sources.spec.ts
```

Expected: ALL PASS.

- [ ] **Step 3: Cross-platform manual smoke**

Document + run (manual, NOT in CI):

```bash
# Tauri dev (Linux desktop)
pnpm tauri dev
# → Settings → Video Sources → verify Re-scan works against real /dev/video*

# Web SPA build
pnpm build:web && pnpm preview:web
# → http://localhost:4173/settings → mock device enumeration via DevTools
```

Document manual results in `shadow-desktop/AGENTS.md` under "Cross-platform manual checks for VideoSourcesCard".

- [ ] **Step 4: Commit**

```bash
cd shadow-desktop
git add e2e-tests/video-sources.spec.ts AGENTS.md
git commit -m "test(desktop): video-sources playwright e2e + manual smoke doc"
```

---

## Spec #1 acceptance

- [ ] All 4 chunks committed.
- [ ] `cd cortex && cargo test --test video_sources_e2e -- --nocapture` passes.
- [ ] `cd shadow-desktop && cargo test --lib video_source` passes.
- [ ] `cd shadow-desktop && pnpm test -- VideoSourcesCard` passes.
- [ ] `cd shadow-desktop && pnpm exec playwright test e2e-tests/video-sources.spec.ts` passes.
- [ ] Manual cross-platform smoke confirmed (web + Tauri).
- [ ] User flow verified end-to-end: enumerate UVC → add → activate → push to cortex → next boot → state persists across localStorage + cortex is in sync.

## Failure modes & recovery

- **`shadow-desktop` `vite build` fails**: usually i18n key typing. Run `pnpm tsc --noEmit` to find missing keys.
- **`cortex` migration fails on existing DB**: the migration is `CREATE TABLE IF NOT EXISTS` not in the SQL — adjust to `CREATE TABLE IF NOT EXISTS cortex_video_sources (...); CREATE INDEX IF NOT EXISTS cortex_video_sources_one_active ON cortex_video_sources (active) WHERE active;` for safety. Re-run.
- **`wiremock` not in shadow-desktop's `[dev-dependencies]`**: add `wiremock = "0.6"` to `shadow-desktop/src-tauri/Cargo.toml`.
- **Tauri dev sees no cameras**: ensure user has granted camera permission to the WebKit/WebView process; on Linux WebKitGTK may need `media.gstreamer.enabled=true`.

## Files NOT touched

- shadow-desktop/src/components/chat/* (chat unchanged)
- shadow-desktop/src/components/Layout.tsx (unchanged)
- cortex/src/flow/* (Spec #2 territory)
- cortex/src/lobes/* (Spec #3 territory)
- cortex/src/tool/* (Spec #4 territory)
- neure/* (mage_vl setup is Spec #3 / Spec #4)
- Any mobile project (Spec #2+#3 mobile followups deferred)
