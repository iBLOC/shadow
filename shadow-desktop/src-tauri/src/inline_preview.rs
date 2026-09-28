//! Inline preview — child `Webview` attached to the main window for the
//! right-side preview pane in `ConversationPage`. Complements the OS-level
//! `WebviewWindow` opened by `preview_window::open_preview`; the user can
//! promote (detach) an inline preview into an OS window via the tab strip.
//!
//! Position/size are logical pixels relative to the parent window's content
//! area. The React side re-syncs these bounds on every container resize via
//! `inline_preview_set_bounds`, so splitter drags and window resizes keep
//! the embedded webview aligned with its visual container.
//!
//! Label scheme: `inline-<sanitised-task-id>`, mirroring the
//! `preview_window::preview_label` helper but with a different prefix so
//! the two never collide in `app.webview_windows()`.
//!
//! # `unstable` feature
//!
//! This module relies on `tauri::Window::add_child`, which is gated behind
//! the `unstable` Tauri feature flag (enabled in this crate's Cargo.toml).
//! Without `unstable` there is no public stable API in Tauri 2 for placing
//! a child webview inside an existing window — only separate top-level
//! `WebviewWindow`s, which is what `preview_window.rs` uses for OS windows.

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl, Window,
};

const INLINE_LABEL_PREFIX: &str = "inline-";
const DEFAULT_PARENT_WINDOW: &str = "main";

#[derive(Debug, thiserror::Error)]
pub enum InlinePreviewError {
    #[error("invalid url: {0}")]
    InvalidUrl(#[from] url::ParseError),
    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("invalid task_id (must be non-empty after sanitisation)")]
    InvalidTaskId,
    #[error("parent window '{0}' not found")]
    ParentWindowNotFound(String),
    #[error("markdown url scheme '{0}' is not http/https")]
    UnsupportedScheme(String),
    #[error("markdown fetch failed: {0}")]
    Fetch(String),
    #[error("markdown response too large (>{0} bytes)")]
    TooLarge(usize),
    #[error("markdown response not utf-8: {0}")]
    NotUtf8(#[from] std::string::FromUtf8Error),
}

pub fn inline_label(task_id: &str) -> Result<String, InlinePreviewError> {
    let sanitised: String = task_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitised.is_empty() {
        return Err(InlinePreviewError::InvalidTaskId);
    }
    Ok(format!("{INLINE_LABEL_PREFIX}{sanitised}"))
}

fn parent_window(app: &AppHandle, parent_label: Option<&str>) -> Result<Window, InlinePreviewError> {
    let label = parent_label.unwrap_or(DEFAULT_PARENT_WINDOW);
    app.get_window(label)
        .ok_or_else(|| InlinePreviewError::ParentWindowNotFound(label.to_string()))
}

/// Create (or reposition, if already open) an inline preview attached to
/// the parent window. If the same `task_id` already has a child webview,
/// it is repositioned/resized in place — the URL is not re-applied (callers
/// wanting a URL change must `close_inline_preview` first).
pub fn open_inline_preview(
    app: &AppHandle,
    task_id: &str,
    url: &str,
    parent_label: Option<&str>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), InlinePreviewError> {
    let label = inline_label(task_id)?;
    let parsed = url::Url::parse(url)?;

    if app.get_webview(&label).is_some() {
        return set_inline_preview_bounds(app, task_id, x, y, width, height);
    }

    let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(parsed));
    let window = parent_window(app, parent_label)?;
    window.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    )?;
    Ok(())
}

pub fn set_inline_preview_bounds(
    app: &AppHandle,
    task_id: &str,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), InlinePreviewError> {
    let label = inline_label(task_id)?;
    let wv = app
        .get_webview(&label)
        .ok_or(InlinePreviewError::InvalidTaskId)?;
    wv.set_position(LogicalPosition::new(x, y))?;
    wv.set_size(LogicalSize::new(width, height))?;
    Ok(())
}

pub fn close_inline_preview(app: &AppHandle, task_id: &str) -> Result<bool, InlinePreviewError> {
    let label = inline_label(task_id)?;
    Ok(match app.get_webview(&label) {
        Some(wv) => {
            wv.close()?;
            true
        }
        None => false,
    })
}

// -- Tauri commands ----------------------------------------------------

#[tauri::command]
pub async fn inline_preview_open(
    app: AppHandle,
    task_id: String,
    url: String,
    parent_label: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    open_inline_preview(
        &app,
        &task_id,
        &url,
        parent_label.as_deref(),
        x,
        y,
        width,
        height,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inline_preview_set_bounds(
    app: AppHandle,
    task_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    set_inline_preview_bounds(&app, &task_id, x, y, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inline_preview_close(
    app: AppHandle,
    task_id: String,
) -> Result<bool, String> {
    close_inline_preview(&app, &task_id).map_err(|e| e.to_string())
}

// -- markdown fetch ----------------------------------------------------

/// Maximum body size we'll accept for a markdown fetch (5 MiB). Anything
/// bigger is almost certainly not a README/notes file and would slow the
/// renderer down. Enforced while streaming bytes, not from the
/// `Content-Length` header (which can lie).
const MARKDOWN_MAX_BYTES: usize = 5 * 1024 * 1024;
/// HTTP request timeout for a markdown fetch.
const MARKDOWN_FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// Scheme allowlist for markdown fetch. `file://`, `data:`, `javascript:`,
/// etc. would let a mis-typed URL escape the HTTP realm and load local
/// files or run inline scripts — refuse them at the door.
pub fn validate_markdown_url(raw: &str) -> Result<url::Url, InlinePreviewError> {
    let parsed = url::Url::parse(raw)?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(InlinePreviewError::UnsupportedScheme(scheme.to_string()));
    }
    Ok(parsed)
}

pub async fn fetch_markdown_text(url: &str) -> Result<String, InlinePreviewError> {
    let parsed = validate_markdown_url(url)?;
    let client = reqwest::Client::builder()
        .timeout(MARKDOWN_FETCH_TIMEOUT)
        .build()
        .map_err(|e| InlinePreviewError::Fetch(e.to_string()))?;
    let response = client
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|e| InlinePreviewError::Fetch(e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(InlinePreviewError::Fetch(format!("HTTP {}", status.as_u16())));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| InlinePreviewError::Fetch(e.to_string()))?;
    if bytes.len() > MARKDOWN_MAX_BYTES {
        return Err(InlinePreviewError::TooLarge(MARKDOWN_MAX_BYTES));
    }
    // FromUtf8Error would surface if a binary file slipped past the
    // scheme check; refuse rather than lossy-decode so the user sees
    // the actual reason instead of a corrupted preview.
    String::from_utf8(bytes.to_vec()).map_err(InlinePreviewError::NotUtf8)
}

#[tauri::command]
pub async fn inline_preview_fetch_markdown(url: String) -> Result<String, String> {
    fetch_markdown_text(&url)
        .await
        .map_err(|e| e.to_string())
}

// -- tests -------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_label_accepts_alphanumeric() {
        assert_eq!(inline_label("task-001").unwrap(), "inline-task-001");
        assert_eq!(inline_label("ABC_123").unwrap(), "inline-ABC_123");
    }

    #[test]
    fn inline_label_strips_unsafe_chars() {
        assert_eq!(
            inline_label("task.001/sub:A").unwrap(),
            "inline-task001subA"
        );
        assert_eq!(
            inline_label("hello world!").unwrap(),
            "inline-helloworld"
        );
    }

    #[test]
    fn inline_label_rejects_empty_after_sanitisation() {
        assert!(matches!(
            inline_label("").unwrap_err(),
            InlinePreviewError::InvalidTaskId
        ));
        assert!(matches!(
            inline_label("...").unwrap_err(),
            InlinePreviewError::InvalidTaskId
        ));
        assert!(matches!(
            inline_label("!!!").unwrap_err(),
            InlinePreviewError::InvalidTaskId
        ));
    }

    #[test]
    fn inline_label_preserves_dashes_and_underscores() {
        assert_eq!(inline_label("a-b_c").unwrap(), "inline-a-b_c");
    }

    #[test]
    fn validate_markdown_url_accepts_http_and_https() {
        assert!(validate_markdown_url("http://example.com/README.md").is_ok());
        assert!(validate_markdown_url("https://example.com/README.md").is_ok());
        assert!(validate_markdown_url("http://localhost:8000/notes.md").is_ok());
    }

    #[test]
    fn validate_markdown_url_rejects_non_http_schemes() {
        assert!(validate_markdown_url("file:///etc/passwd").is_err());
        assert!(validate_markdown_url("data:text/plain,hi").is_err());
        assert!(validate_markdown_url("javascript:alert(1)").is_err());
        assert!(validate_markdown_url("ftp://example.com/x").is_err());
        assert!(validate_markdown_url("chrome-extension://abc/x").is_err());
    }

    #[test]
    fn validate_markdown_url_rejects_garbage() {
        assert!(validate_markdown_url("not a url").is_err());
        assert!(validate_markdown_url("").is_err());
    }
}