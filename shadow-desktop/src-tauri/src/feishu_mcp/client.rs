//! Open-lark-backed `FeishuOps` impl. Doc-only scaffold — the actual
//! HTTP calls against the Lark Open Platform go here. v1 uses a
//! minimal slice (auth + sheets.v3 + drive.v1).
//!
//! The struct + impl are split out from `mod.rs` so tests can use the
//! `MockFeishu` impl without compiling open-lark's full surface.

use async_trait::async_trait;
use open_lark::core::auth::AuthTrait;
use open_lark::service::sheets::v3::spreadsheet::{CreateSpreadsheetRequest, CreateSpreadsheetResp};
use open_lark::Client;

use super::{FeishuError, FeishuOps, FeishuSheet};

pub struct OpenLarkFeishu {
    client: Client,
    user_email: String,
}

impl OpenLarkFeishu {
    /// Construct from env vars. `FEISHU_APP_ID` + `FEISHU_APP_SECRET`
    /// are required; `FEISHU_DEFAULT_USER_EMAIL` is the user the
    /// `feishu_sheet_share` tool grants `view` to by default (DOC-03
    /// privacy default).
    pub fn from_env() -> Result<Self, FeishuError> {
        let app_id = std::env::var("FEISHU_APP_ID")
            .map_err(|_| FeishuError::ConfigMissing("FEISHU_APP_ID"))?;
        let app_secret = std::env::var("FEISHU_APP_SECRET")
            .map_err(|_| FeishuError::ConfigMissing("FEISHU_APP_SECRET"))?;
        let user_email = std::env::var("FEISHU_DEFAULT_USER_EMAIL")
            .unwrap_or_else(|_| "default@shadow.local".into());
        let client = Client::builder()
            .app_id(app_id)
            .app_secret(app_secret)
            .build()
            .map_err(|e| FeishuError::Auth(e.to_string()))?;
        Ok(Self { client, user_email })
    }

    /// Exchange the app credentials for a `tenant_access_token`. The
    /// open-lark client caches the token until expiry so callers don't
    /// need to manage the refresh.
    async fn auth(&self) -> Result<(), FeishuError> {
        self.client
            .auth()
            .tenant_access_token()
            .await
            .map(|_| ())
            .map_err(|e| FeishuError::Auth(e.to_string()))
    }
}

#[async_trait]
impl FeishuOps for OpenLarkFeishu {
    async fn create_sheet(
        &self,
        title: &str,
        folder_token: Option<&str>,
    ) -> Result<FeishuSheet, FeishuError> {
        self.auth().await?;
        let req = CreateSpreadsheetRequest {
            title: title.to_string(),
            folder_token: folder_token.map(str::to_string),
        };
        let resp: CreateSpreadsheetResp = self
            .client
            .sheets()
            .v3()
            .spreadsheet()
            .create(&req)
            .await
            .map_err(|e| FeishuError::Api(e.to_string()))?;
        Ok(FeishuSheet {
            spreadsheet_token: resp.spreadsheet_token,
            url: resp.url,
            sheets: resp
                .sheets
                .into_iter()
                .map(|s| super::FeishuSheetMeta {
                    sheet_id: s.sheet_id,
                    title: s.title,
                    row_count: s.row_count,
                    column_count: s.column_count,
                })
                .collect(),
        })
    }

    async fn write_sheet_values(
        &self,
        spreadsheet_token: &str,
        sheet_id: &str,
        range: &str,
        values: &[Vec<String>],
    ) -> Result<(), FeishuError> {
        self.auth().await?;
        let req = open_lark::service::sheets::v2::value::WriteValuesRequest {
            spreadsheet_token: spreadsheet_token.to_string(),
            sheet_id: sheet_id.to_string(),
            range: range.to_string(),
            values: values.to_vec(),
        };
        self.client
            .sheets()
            .v2()
            .value()
            .write(&req)
            .await
            .map(|_| ())
            .map_err(|e| FeishuError::Api(e.to_string()))
    }

    async fn share_sheet(
        &self,
        spreadsheet_token: &str,
        member_type: &str,
        member_id: &str,
        perm: &str,
    ) -> Result<(), FeishuError> {
        self.auth().await?;
        let req = open_lark::service::drive::v1::permission::CreatePermissionRequest {
            token: spreadsheet_token.to_string(),
            member_type: member_type.to_string(),
            member_id: member_id.to_string(),
            perm: perm.to_string(),
        };
        self.client
            .drive()
            .v1()
            .permission()
            .create(&req)
            .await
            .map(|_| ())
            .map_err(|e| FeishuError::Api(e.to_string()))
    }

    async fn delete_sheet(&self, spreadsheet_token: &str) -> Result<(), FeishuError> {
        self.auth().await?;
        let req = open_lark::service::drive::v1::file::DeleteFileRequest {
            file_token: spreadsheet_token.to_string(),
        };
        self.client
            .drive()
            .v1()
            .file()
            .delete(&req)
            .await
            .map(|_| ())
            .map_err(|e| FeishuError::Api(e.to_string()))
    }
}

// DOC-03 default: when publish_feishu is invoked without an explicit
// member_id, default to the constructor's user_email with view perm.
// Stored on the impl so the Tauri command can read it.
impl OpenLarkFeishu {
    pub fn default_share_target(&self) -> (&str, &str) {
        (self.user_email.as_str(), "view")
    }
}