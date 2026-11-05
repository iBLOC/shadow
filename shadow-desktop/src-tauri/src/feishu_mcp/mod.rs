//! Feishu / Lark MCP bridge — wraps the Feishu Open Platform so the
//! document-use surface (DOC-01..DOC-05 in
//! [`document-productization-scenario.md`](../../../../docs/superpowers/scenarios/2026-09-23-document-productization-scenario.md))
//! can publish a sheet to a shareable Feishu URL.
//!
//! Built on `open-lark = "0.14"` (enterprise-grade Rust SDK, Apache-2.0).
//! v1 uses a minimal slice: auth + sheets.v3 (spreadsheet CRUD +
//! value write + permission grant) + drive.v1 (folder metadata).
//! Docs / Slides / Bitable / Wiki / IM are out of scope.
//!
//! # Auth model
//!
//! App-level only for v1 (`FEISHU_APP_ID` + `FEISHU_APP_SECRET`
//! exchanged once for a `tenant_access_token` cached until expiry).
//! User-level OAuth via `FEISHU_OAUTH_*` env vars is documented as a
//! follow-up.
//!
//! # MCP wire
//!
//! `FeishuMcp::mcp_server()` returns a
//! `synapse::mcp::SimpleMcpServer` with the tools registered below.
//! Any host (the Tauri backend, a stand-alone `diencephalon::MCP`
//! server, or a peer `telencephalon` instance over A2A) can mount
//! it.
//!
//! # Tests
//!
//! See the bottom of the file: a `MockFeishu` impl of the `FeishuOps`
//! trait lets us verify config + tool wiring + the DOC-04 rollback
//! path without a real Feishu tenant. The real open-lark backend is
//! also behind the same trait so production swaps in by changing one
//! constructor argument.

mod client;

pub use client::OpenLarkFeishu;

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FeishuError {
    #[error("feishu disabled (set FEISHU_ENABLED=1 to allow)")]
    Disabled,
    #[error("feishu config missing: {0}")]
    ConfigMissing(&'static str),
    #[error("feishu auth: {0}")]
    Auth(String),
    #[error("feishu api: {0}")]
    Api(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// What the v1 cut exposes. Each method maps 1:1 to a Lark Open
/// API call; the open-lark implementation lives in `client.rs`. The
/// `MockFeishu` impl in `tests` lets us test the MCP surface + DOC-04
/// rollback without a real tenant.
#[async_trait]
pub trait FeishuOps: Send + Sync {
    async fn create_sheet(
        &self,
        title: &str,
        folder_token: Option<&str>,
    ) -> Result<FeishuSheet, FeishuError>;
    async fn write_sheet_values(
        &self,
        spreadsheet_token: &str,
        sheet_id: &str,
        range: &str,
        values: &[Vec<String>],
    ) -> Result<(), FeishuError>;
    async fn share_sheet(
        &self,
        spreadsheet_token: &str,
        member_type: &str, // "email" | "openid" | "userid"
        member_id: &str,
        perm: &str, // "view" | "edit" | "full_access"
    ) -> Result<(), FeishuError>;
    async fn delete_sheet(&self, spreadsheet_token: &str) -> Result<(), FeishuError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeishuSheet {
    pub spreadsheet_token: String,
    pub url: String,
    #[serde(default)]
    pub sheets: Vec<FeishuSheetMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeishuSheetMeta {
    pub sheet_id: String,
    pub title: String,
    pub row_count: i64,
    pub column_count: i64,
}

#[derive(Clone)]
pub struct FeishuMcp {
    ops: Arc<dyn FeishuOps>,
    enabled: Arc<std::sync::atomic::AtomicBool>,
}

impl FeishuMcp {
    pub fn new(ops: Arc<dyn FeishuOps>) -> Self {
        let enabled = std::env::var("FEISHU_ENABLED")
            .ok()
            .map(|v| v != "0" && v.to_ascii_lowercase() != "false")
            .unwrap_or(false);
        Self {
            ops,
            enabled: Arc::new(std::sync::atomic::AtomicBool::new(enabled)),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn set_enabled(&self, on: bool) {
        self.enabled.store(on, std::sync::atomic::Ordering::SeqCst);
    }

    pub async fn create_sheet(
        &self,
        title: &str,
        folder_token: Option<&str>,
    ) -> Result<FeishuSheet, FeishuError> {
        self.check_enabled()?;
        self.ops.create_sheet(title, folder_token).await
    }

    pub async fn write_sheet_values(
        &self,
        spreadsheet_token: &str,
        sheet_id: &str,
        range: &str,
        values: &[Vec<String>],
    ) -> Result<(), FeishuError> {
        self.check_enabled()?;
        self.ops
            .write_sheet_values(spreadsheet_token, sheet_id, range, values)
            .await
    }

    pub async fn share_sheet(
        &self,
        spreadsheet_token: &str,
        member_type: &str,
        member_id: &str,
        perm: &str,
    ) -> Result<(), FeishuError> {
        self.check_enabled()?;
        self.ops
            .share_sheet(spreadsheet_token, member_type, member_id, perm)
            .await
    }

    pub async fn delete_sheet(&self, spreadsheet_token: &str) -> Result<(), FeishuError> {
        // delete_sheet is intentionally NOT gated by check_enabled —
        // DOC-04 rollback must be able to clean up a partial publish
        // even when the user has toggled Feishu off mid-flight.
        self.ops.delete_sheet(spreadsheet_token).await
    }

    fn check_enabled(&self) -> Result<(), FeishuError> {
        if self.is_enabled() {
            Ok(())
        } else {
            Err(FeishuError::Disabled)
        }
    }

    /// Build the `synapse::mcp::SimpleMcpServer` exposing the v1 tool
    /// set. The wire-format follows the same MCP substrate used by
    /// diencephalon (P1) and hippocampus, so any peer can mount this
    /// server without bespoke glue.
    pub fn mcp_server(self: &Arc<Self>) -> synapse::mcp::SimpleMcpServer {
        use serde_json::json;
        use synapse::mcp::{McpServer, ToolHandler};
        use std::sync::Arc as StdArc;

        struct OneShotHandler<F>(StdArc<F>);
        #[async_trait::async_trait]
        impl<F, Fut> ToolHandler for OneShotHandler<F>
        where
            F: Fn(serde_json::Value) -> Fut + Send + Sync + 'static,
            Fut: std::future::Future<Output = Result<synapse::mcp::McpCallToolResult, synapse::mcp::McpError>> + Send + 'static,
        {
            async fn execute(
                &self,
                args: serde_json::Value,
            ) -> Result<synapse::mcp::McpCallToolResult, synapse::mcp::McpError> {
                (self.0)(args).await
            }
        }

        let me = self.clone();
        let mk_text = |s: String| {
            Ok(synapse::mcp::McpCallToolResult {
                content: vec![synapse::mcp::McpContent::Text(synapse::mcp::McpTextContent { text: s })],
                is_error: false,
            })
        };
        let mk_err = |msg: String| {
            Err(synapse::mcp::McpError::Rpc { code: -32000, message: msg })
        };

        let mut server = synapse::mcp::SimpleMcpServer::new("shadow-feishu", env!("CARGO_PKG_VERSION"));

        // feishu_sheet_create(title, folder_token?)
        {
            let me = me.clone();
            server = server.with_tool(
                "feishu_sheet_create",
                "Create a new Feishu spreadsheet and return its token + URL.",
                Some(json!({
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "folder_token": {"type": "string"}
                    },
                    "required": ["title"],
                })),
                OneShotHandler(StdArc::new(move |args: serde_json::Value| {
                    let me = me.clone();
                    async move {
                        let title = args.get("title").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing title".into() })?;
                        let folder = args.get("folder_token").and_then(|v| v.as_str());
                        match me.create_sheet(title, folder).await {
                            Ok(s) => mk_text(serde_json::to_string(&s).unwrap_or_default()),
                            Err(e) => mk_err(format!("feishu_sheet_create: {e}")),
                        }
                    }
                })),
            );
        }

        // feishu_sheet_write(spreadsheet_token, sheet_id, range, values)
        {
            let me = me.clone();
            server = server.with_tool(
                "feishu_sheet_write",
                "Write a 2D array of strings into a Feishu spreadsheet range.",
                Some(json!({
                    "type": "object",
                    "properties": {
                        "spreadsheet_token": {"type": "string"},
                        "sheet_id": {"type": "string"},
                        "range": {"type": "string", "description": "A1:C10 etc."},
                        "values": {
                            "type": "array",
                            "items": {"type": "array", "items": {"type": "string"}}
                        }
                    },
                    "required": ["spreadsheet_token", "sheet_id", "range", "values"],
                })),
                OneShotHandler(StdArc::new(move |args: serde_json::Value| {
                    let me = me.clone();
                    async move {
                        let tok = args.get("spreadsheet_token").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing spreadsheet_token".into() })?;
                        let sheet = args.get("sheet_id").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing sheet_id".into() })?;
                        let range = args.get("range").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing range".into() })?;
                        let values: Vec<Vec<String>> = match args.get("values") {
                            Some(v) => serde_json::from_value(v.clone())
                                .map_err(|e| synapse::mcp::McpError::Rpc { code: -32602, message: format!("values: {e}") })?,
                            None => return Err(synapse::mcp::McpError::Rpc { code: -32602, message: "missing values".into() }),
                        };
                        match me.write_sheet_values(tok, sheet, range, &values).await {
                            Ok(()) => mk_text("ok".into()),
                            Err(e) => mk_err(format!("feishu_sheet_write: {e}")),
                        }
                    }
                })),
            );
        }

        // feishu_sheet_share(spreadsheet_token, member_type, member_id, perm)
        {
            let me = me.clone();
            server = server.with_tool(
                "feishu_sheet_share",
                "Grant a permission on a Feishu spreadsheet.",
                Some(json!({
                    "type": "object",
                    "properties": {
                        "spreadsheet_token": {"type": "string"},
                        "member_type": {"type": "string", "enum": ["email", "openid", "userid"]},
                        "member_id": {"type": "string"},
                        "perm": {"type": "string", "enum": ["view", "edit", "full_access"]}
                    },
                    "required": ["spreadsheet_token", "member_type", "member_id", "perm"],
                })),
                OneShotHandler(StdArc::new(move |args: serde_json::Value| {
                    let me = me.clone();
                    async move {
                        let tok = args.get("spreadsheet_token").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing spreadsheet_token".into() })?;
                        let mt = args.get("member_type").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing member_type".into() })?;
                        let mid = args.get("member_id").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing member_id".into() })?;
                        let perm = args.get("perm").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing perm".into() })?;
                        match me.share_sheet(tok, mt, mid, perm).await {
                            Ok(()) => mk_text("ok".into()),
                            Err(e) => mk_err(format!("feishu_sheet_share: {e}")),
                        }
                    }
                })),
            );
        }

        // feishu_sheet_delete(spreadsheet_token) — used by DOC-04 rollback.
        // NOT gated by FEISHU_ENABLED so partial-publish cleanup can run
        // even after the user toggled the integration off mid-flight.
        {
            let me = me.clone();
            server = server.with_tool(
                "feishu_sheet_delete",
                "Delete a Feishu spreadsheet by token. Used for DOC-04 rollback.",
                Some(json!({
                    "type": "object",
                    "properties": {
                        "spreadsheet_token": {"type": "string"}
                    },
                    "required": ["spreadsheet_token"],
                })),
                OneShotHandler(StdArc::new(move |args: serde_json::Value| {
                    let me = me.clone();
                    async move {
                        let tok = args.get("spreadsheet_token").and_then(|v| v.as_str())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing spreadsheet_token".into() })?;
                        match me.delete_sheet(tok).await {
                            Ok(()) => mk_text("ok".into()),
                            Err(e) => mk_err(format!("feishu_sheet_delete: {e}")),
                        }
                    }
                })),
            );
        }

        // feishu_set_enabled(on) — runtime toggle for DOC-05.
        {
            let me = me.clone();
            server = server.with_tool(
                "feishu_set_enabled",
                "Toggle the Feishu integration at runtime (DOC-05).",
                Some(json!({
                    "type": "object",
                    "properties": {
                        "on": {"type": "boolean"}
                    },
                    "required": ["on"],
                })),
                OneShotHandler(StdArc::new(move |args: serde_json::Value| {
                    let me = me.clone();
                    async move {
                        let on = args.get("on").and_then(|v| v.as_bool())
                            .ok_or_else(|| synapse::mcp::McpError::Rpc { code: -32602, message: "missing on".into() })?;
                        me.set_enabled(on);
                        mk_text(if on { "enabled" } else { "disabled" }.into())
                    }
                })),
            );
        }

        server
    }
}

// -- mock for tests (DOC-04 rollback + tool wiring without a tenant) ----

/// In-memory `FeishuOps` impl that records every call. Tests assert
/// on `calls` to verify the MCP handlers drive the right API in the
/// right order.
#[derive(Default)]
pub struct MockFeishu {
    pub calls: std::sync::Mutex<Vec<MockCall>>,
}

#[derive(Debug, Clone)]
pub enum MockCall {
    CreateSheet { title: String, folder_token: Option<String> },
    WriteValues { spreadsheet_token: String, sheet_id: String, range: String, rows: usize },
    Share { spreadsheet_token: String, member_type: String, member_id: String, perm: String },
    Delete { spreadsheet_token: String },
}

#[async_trait]
impl FeishuOps for MockFeishu {
    async fn create_sheet(
        &self,
        title: &str,
        folder_token: Option<&str>,
    ) -> Result<FeishuSheet, FeishuError> {
        self.calls.lock().unwrap().push(MockCall::CreateSheet {
            title: title.to_string(),
            folder_token: folder_token.map(str::to_string),
        });
        Ok(FeishuSheet {
            spreadsheet_token: format!("mock-{title}"),
            url: format!("https://mock.feishu.cn/sheets/mock-{title}"),
            sheets: vec![FeishuSheetMeta {
                sheet_id: "sheet1".into(),
                title: "Sheet1".into(),
                row_count: 100,
                column_count: 20,
            }],
        })
    }
    async fn write_sheet_values(
        &self,
        spreadsheet_token: &str,
        sheet_id: &str,
        range: &str,
        values: &[Vec<String>],
    ) -> Result<(), FeishuError> {
        self.calls.lock().unwrap().push(MockCall::WriteValues {
            spreadsheet_token: spreadsheet_token.to_string(),
            sheet_id: sheet_id.to_string(),
            range: range.to_string(),
            rows: values.len(),
        });
        Ok(())
    }
    async fn share_sheet(
        &self,
        spreadsheet_token: &str,
        member_type: &str,
        member_id: &str,
        perm: &str,
    ) -> Result<(), FeishuError> {
        self.calls.lock().unwrap().push(MockCall::Share {
            spreadsheet_token: spreadsheet_token.to_string(),
            member_type: member_type.to_string(),
            member_id: member_id.to_string(),
            perm: perm.to_string(),
        });
        Ok(())
    }
    async fn delete_sheet(&self, spreadsheet_token: &str) -> Result<(), FeishuError> {
        self.calls.lock().unwrap().push(MockCall::Delete {
            spreadsheet_token: spreadsheet_token.to_string(),
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn enabled_mcp() -> Arc<FeishuMcp> {
        let prev = std::env::var("FEISHU_ENABLED").ok();
        unsafe { std::env::set_var("FEISHU_ENABLED", "1") };
        let m = Arc::new(FeishuMcp::new(Arc::new(MockFeishu::default())));
        if let Some(v) = prev {
            unsafe { std::env::set_var("FEISHU_ENABLED", v) };
        } else {
            unsafe { std::env::remove_var("FEISHU_ENABLED") };
        }
        m
    }

    #[test]
    fn enabled_flag_defaults_off_then_on_via_env() {
        // Safety gate semantics — the FEISHU_ENABLED env var flips the
        // atomic at construction. After that only set_enabled() /
        // MCP tool feishu_set_enabled can move it.
        let prev = std::env::var("FEISHU_ENABLED").ok();
        unsafe { std::env::remove_var("FEISHU_ENABLED") };
        let m = FeishuMcp::new(Arc::new(MockFeishu::default()));
        assert!(!m.is_enabled());
        m.set_enabled(true);
        assert!(m.is_enabled());
        m.set_enabled(false);
        assert!(!m.is_enabled());
        if let Some(v) = prev {
            unsafe { std::env::set_var("FEISHU_ENABLED", v) };
        }
    }

    #[tokio::test]
    async fn create_sheet_returns_disabled_when_off() {
        let prev = std::env::var("FEISHU_ENABLED").ok();
        unsafe { std::env::remove_var("FEISHU_ENABLED") };
        let m = FeishuMcp::new(Arc::new(MockFeishu::default()));
        let err = m.create_sheet("x", None).await.unwrap_err();
        assert!(matches!(err, FeishuError::Disabled));
        if let Some(v) = prev {
            unsafe { std::env::set_var("FEISHU_ENABLED", v) };
        }
    }

    #[tokio::test]
    async fn delete_sheet_runs_even_when_disabled() {
        // DOC-04 rollback path must work regardless of the FEISHU_ENABLED
        // gate — otherwise a half-published sheet survives a mid-flight
        // toggle-off.
        let prev = std::env::var("FEISHU_ENABLED").ok();
        unsafe { std::env::remove_var("FEISHU_ENABLED") };
        let mock = Arc::new(MockFeishu::default());
        let m = FeishuMcp::new(mock.clone());
        assert!(!m.is_enabled());
        m.delete_sheet("orphan-token").await.unwrap();
        let calls = mock.calls.lock().unwrap().clone();
        assert_eq!(calls.len(), 1);
        assert!(
            matches!(&calls[0], MockCall::Delete { spreadsheet_token } if spreadsheet_token == "orphan-token"),
            "expected a single Delete call for orphan-token, got {calls:?}"
        );
        if let Some(v) = prev {
            unsafe { std::env::set_var("FEISHU_ENABLED", v) };
        }
    }

    #[tokio::test]
    async fn mcp_server_lists_five_tools_with_schemas() {
        use synapse::mcp::McpServer;
        let m = enabled_mcp();
        let server = m.mcp_server();
        let tools = server.list_tools().await.unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "feishu_sheet_create",
                "feishu_sheet_write",
                "feishu_sheet_share",
                "feishu_sheet_delete",
                "feishu_set_enabled",
            ]
        );
        for t in &tools {
            assert!(t.description.is_some());
            assert!(t.input_schema.is_some());
        }
    }

    #[tokio::test]
    async fn mcp_create_sheet_returns_url_json() {
        use synapse::mcp::McpServer;
        let m = enabled_mcp();
        let server = m.mcp_server();
        let result = server
            .call_tool("feishu_sheet_create", json!({"title": "test"}))
            .await
            .unwrap();
        assert!(!result.is_error);
        let text = match &result.content[0] {
            synapse::mcp::McpContent::Text(t) => &t.text,
        };
        let v: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(v["spreadsheet_token"], "mock-test");
        assert!(v["url"].as_str().unwrap().starts_with("https://"));
    }

    #[tokio::test]
    async fn mcp_set_enabled_flips_gate_at_runtime() {
        use synapse::mcp::McpServer;
        let prev = std::env::var("FEISHU_ENABLED").ok();
        unsafe { std::env::remove_var("FEISHU_ENABLED") };
        let m = Arc::new(FeishuMcp::new(Arc::new(MockFeishu::default())));
        let server = m.mcp_server();
        assert!(!m.is_enabled());
        let _ = server.call_tool("feishu_set_enabled", json!({"on": true})).await.unwrap();
        assert!(m.is_enabled());
        let _ = server.call_tool("feishu_set_enabled", json!({"on": false})).await.unwrap();
        assert!(!m.is_enabled());
        if let Some(v) = prev {
            unsafe { std::env::set_var("FEISHU_ENABLED", v) };
        }
    }
}