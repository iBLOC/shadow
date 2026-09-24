//! Real `FeishuOps` impl stub against the open-lark 0.14 SDK.
//!
//! This module was scaffolded in commit 90878db but the OpenLarkFeishu
//! wire has not been validated end-to-end against a real Lark tenant
//! — and the open_lark 0.14 SDK's type names + module paths shifted
//! (e.g. `CreateSpreadsheetRequest` is spelled `CreateSpreedSheetRequest`
//! upstream). Pinning the exact API surface against the current
//! 0.14 release is a follow-up that needs a real tenant for
//! integration testing.
//!
//! For v1 the *MockFeishu* path covers tests + local development
//! (FEISHU_APP_ID unset → MockFeishu). When FEISHU_APP_ID is set we
//! want OpenLarkFeishu, so this stub returns FeishuError::Api
//! explicitly rather than panicking — the failure surfaces as an
//! actionable runtime error ("FEISHU_APP_ID set but OpenLarkFeishu
//! is a 0.14-API placeholder; see client.rs for the rewrite plan")
//! and doesn't break shadow-desktop's cargo check.
//!
//! End-to-end rewrite plan (tracked as a follow-up):
//! - Pin open_lark to a known-good version (0.13 or 0.14 with
//!   verified spreadsheet-create path) in workspace deps.
//! - Verify the `auth().tenant_access_token()` request shape and
//!   the `sheets.v3.spreadsheet.create()` response schema against
//!   the official Lark API docs at open.feishu.cn.
//! - Then re-enable the real impl with `#[cfg(feature =
//!   "real-feishu")]` so MockFeishu remains the default for tests.

use async_trait::async_trait;

use super::{FeishuError, FeishuOps, FeishuSheet};

pub struct OpenLarkFeishu {
    pub user_email: String,
}

impl OpenLarkFeishu {
    pub fn from_env() -> Result<Self, FeishuError> {
        // FEISHU_APP_ID + FEISHU_APP_SECRET are read at the call site
        // (lib.rs build path). The OpenLarkFeishu constructor itself
        // takes the configured identity; here we just plumb the
        // default user email used by `document_publish_feishu` for
        // the `share_sheet` permission grant.
        Ok(Self {
            user_email: std::env::var("FEISHU_DEFAULT_USER_EMAIL")
                .unwrap_or_else(|_| "default@shadow.local".into()),
        })
    }
}

#[async_trait]
impl FeishuOps for OpenLarkFeishu {
    async fn create_sheet(
        &self,
        _title: &str,
        _folder_token: Option<&str>,
    ) -> Result<FeishuSheet, FeishuError> {
        Err(FeishuError::Api(
            "OpenLarkFeishu is a v1.1 placeholder; the open_lark 0.14 \
             SDK's create_sheet path needs verification against a real \
             Lark tenant. MockFeishu is the working path for v1. See \
             src-tauri/src/feishu_mcp/client.rs for the rewrite plan."
                .into(),
        ))
    }

    async fn write_sheet_values(
        &self,
        _spreadsheet_token: &str,
        _sheet_id: &str,
        _range: &str,
        _values: &[Vec<String>],
    ) -> Result<(), FeishuError> {
        Err(FeishuError::Api("OpenLarkFeishu placeholder (see create_sheet)".into()))
    }

    async fn share_sheet(
        &self,
        _spreadsheet_token: &str,
        _member_type: &str,
        _member_id: &str,
        _perm: &str,
    ) -> Result<(), FeishuError> {
        Err(FeishuError::Api("OpenLarkFeishu placeholder (see create_sheet)".into()))
    }

    async fn delete_sheet(&self, _spreadsheet_token: &str) -> Result<(), FeishuError> {
        Err(FeishuError::Api("OpenLarkFeishu placeholder (see create_sheet)".into()))
    }
}