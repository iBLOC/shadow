//! Preview window — dedicated `WebviewWindow` per task (replaces the
//! earlier iframe-only design).
//!
//! Implements the "独立 Webviewwindow" half of WS-01..WS-05 in
//! [`external-agent-website-development-scenario.md`](../../docs/superpowers/scenarios/2026-09-23-external-agent-website-development-scenario.md).
//!
//! Each preview is an **OS-level** WebView (one per `task_id`), spawned
//! via `tauri::WebviewWindowBuilder` with `WebviewUrl::External(url)`.
//! The main shadow window keeps its own state; preview reloads /
//! navigation never affect it. This is deliberately **not** an HTML
//! `<iframe>` inside the main window — the iframe approach was
//! rejected because:
//!
//! - it shares DOM context with the main window (XSS / state-leak risk)
//! - preview navigation can reload / replace the main chat surface
//! - devtools / CSP / zoom settings can't be tuned per-preview
//!
//! # Window identity
//!
//! WebView window labels must be unique per Tauri app. We derive the
//! label from the task id: `preview-<sanitised-task-id>`. Sanitisation
//! strips anything that isn't `[A-Za-z0-9_-]`, since Tauri rejects
//! labels with `.` / `/` / `:` etc. A second `preview_open` for the
//! same task reuses (and re-focuses) the existing window instead of
//! opening a duplicate.
//!
//! # Tauri capability
//!
//! `WebviewUrl::External` requires the destination scheme / host to
//! appear in the Tauri capabilities config (`src-tauri/capabilities/*.json`,
//! `identifier: "webview"`). Production deployments should restrict
//! the allowlist to dev-server origins (e.g. `http://localhost:*`,
//! `https://*.shadow.local`).

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, thiserror::Error)]
pub enum PreviewWindowError {
    #[error("invalid url: {0}")]
    InvalidUrl(#[from] url::ParseError),
    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("invalid task_id (must be non-empty after sanitisation)")]
    InvalidTaskId,
}

const PREVIEW_LABEL_PREFIX: &str = "preview-";

/// Build the WebviewWindow label for a task id. Sanitises the input so
/// it satisfies Tauri's label charset (`[A-Za-z0-9_-]`).
pub fn preview_label(task_id: &str) -> Result<String, PreviewWindowError> {
    let sanitised: String = task_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitised.is_empty() {
        return Err(PreviewWindowError::InvalidTaskId);
    }
    Ok(format!("{PREVIEW_LABEL_PREFIX}{sanitised}"))
}

/// Open a dedicated WebView window for the given task URL.
///
/// - If a window for this task already exists, it's focused and its
///   URL is replaced via `navigate`.
/// - Otherwise a new `WebviewWindow` is created.
pub fn open_preview(
    app: &AppHandle,
    task_id: &str,
    url: &str,
) -> Result<(), PreviewWindowError> {
    let label = preview_label(task_id)?;
    let parsed = url::Url::parse(url)?;

    if let Some(existing) = app.get_webview_window(&label) {
        // Re-focus + navigate to the new URL rather than spawning a
        // duplicate window.
        existing.navigate(parsed)?;
        let _ = existing.set_focus();
        return Ok(());
    }

    let title = format!("Shadow preview · {task_id}");
    // Counter is appended only when the base title would collide with
    // an existing OS window title — Tauri's label is the canonical
    // handle for `get_webview_window`.
    let mut attempt = 0u32;
    loop {
        let t = if attempt == 0 {
            title.clone()
        } else {
            format!("{title} #{attempt}")
        };
        let builder = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::External(parsed.clone()),
        )
        .title(&t)
        .inner_size(1024.0, 768.0)
        .min_inner_size(640.0, 480.0)
        .resizable(true);
        match builder.build() {
            Ok(_) => break,
            Err(e) => {
                // Tauri can refuse duplicate window titles on some
                // platforms; bump the suffix and retry once.
                if attempt >= 3 {
                    return Err(PreviewWindowError::Tauri(e));
                }
                attempt += 1;
                let _ = e;
            }
        }
    }
    Ok(())
}

/// Close the preview window for the given task, if any.
pub fn close_preview(app: &AppHandle, task_id: &str) -> Result<bool, PreviewWindowError> {
    let label = preview_label(task_id)?;
    match app.get_webview_window(&label) {
        Some(w) => {
            w.close().map_err(PreviewWindowError::Tauri)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// List the labels of currently-open preview windows. Used by tests
/// + the (future) React panel overview.
pub fn list_open_previews(app: &AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|l| l.starts_with(PREVIEW_LABEL_PREFIX))
        .cloned()
        .collect()
}

// -- Tauri commands ----------------------------------------------------

#[tauri::command]
async fn preview_open(
    app: AppHandle,
    task_id: String,
    url: String,
) -> Result<(), String> {
    open_preview(&app, &task_id, &url).map_err(|e| e.to_string())
}

#[tauri::command]
async fn preview_close(
    app: AppHandle,
    task_id: String,
) -> Result<bool, String> {
    close_preview(&app, &task_id).map_err(|e| e.to_string())
}

// -- tests -------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_label_accepts_alphanumeric() {
        assert_eq!(preview_label("task-001").unwrap(), "preview-task-001");
        assert_eq!(preview_label("ABC_123").unwrap(), "preview-ABC_123");
    }

    #[test]
    fn preview_label_strips_unsafe_chars() {
        // Tauri labels must be `[A-Za-z0-9_-]`. Dots, slashes, colons,
        // spaces, etc. are removed.
        assert_eq!(
            preview_label("task.001/sub:A").unwrap(),
            "preview-task001subA"
        );
        assert_eq!(
            preview_label("hello world!").unwrap(),
            "preview-helloworld"
        );
    }

    #[test]
    fn preview_label_rejects_empty_after_sanitisation() {
        assert!(matches!(
            preview_label("...").unwrap_err(),
            PreviewWindowError::InvalidTaskId
        ));
        assert!(matches!(
            preview_label("").unwrap_err(),
            PreviewWindowError::InvalidTaskId
        ));
        assert!(matches!(
            preview_label("!!!").unwrap_err(),
            PreviewWindowError::InvalidTaskId
        ));
    }

    #[test]
    fn preview_label_preserves_dashes_and_underscores() {
        assert_eq!(
            preview_label("a-b_c").unwrap(),
            "preview-a-b_c"
        );
    }

    // NOTE: opening a real Tauri WebviewWindow requires a running Tauri
    // runtime + a GUI event loop, which `cargo test --lib` cannot
    // provide. The label sanitisation + the Tauri command surface are
    // the testable units; end-to-end preview-open verification needs
    // either `cargo tauri dev` or a wdio-webdriver E2E harness.
}