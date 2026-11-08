//! 「外部工具的模型配置」—— 把 opencode / Claude Code / Codex 的配置**读进来**
//! （装载进 shadow 的供应商表），以及把 shadow 里的供应商**写回**那些工具的
//! 配置文件。
//!
//! ⚠️ **为什么读文件在桌面端做**：那些文件**长在这台机器上** ⇒ ⇒ 大脑
//! （可能在手机上）看不见它们 ⇒ ⇒ 桌面端是唯一能读的地方。
//! ⚠️ **为什么能力在 synapse**：备份 / 原子替换 / 只动指定段 这些规则是
//! ⇒ ⇒ **公共能力** ⇒ ⇒ 落在 `synapse::providers::import`（两端共用）。
//!
//! ⚠️⚠️ **材料不进任何返回值** —— 扫描只回**长度**；材料只在两条路里流动：
//!   ① 「读文件 → 直接交给大脑」（材料从不上桌）；
//!   ② 「大脑 → 明文 → 直接写文件」（材料从不上桌）。

use serde::Serialize;
use serde_json::{json, Value};

use encephalon::providers::ProviderEntry;
use synapse::providers::catalog::ApiStandard;
use synapse::providers::import::{self, ExternalTool};

use crate::provider_manager::{brain_base, brain_post, brain_post_secret, entry_from_brain};

/// 一个外部工具里的**一条**供应商 —— **不含材料**（只报长度）。
#[derive(Debug, Clone, Serialize)]
pub struct ExternalProviderPreview {
    /// 工具 id（`opencode` / `claude-code` / `codex`）。
    pub tool: String,
    /// 工具的显示名。
    pub tool_display: String,
    /// 外部那个 id（opencode: `minimax-cn`；codex: `OPENAI_API_KEY`）。
    pub source_id: String,
    /// ⚠️ **只报长度** ⇒ ⇒ 材料不进界面、不进日志。
    pub key_len: Option<usize>,
    /// 外部配置里的 base URL（常常没有 ⇒ ⇒ 那就靠大脑的预设目录补）。
    pub base_url: Option<String>,
    /// **协议族**（`openai` / `anthropic`）⇒ ⇒ 决定按哪个 API 标准说话。
    pub provider: String,
    /// 材料来自哪个文件的哪个字段（**不含材料**）。
    pub origin: String,
}

/// 一次写回的结果（**不含材料**）。
#[derive(Debug, Clone, Serialize)]
pub struct ExternalToolWriteReport {
    pub tool: String,
    /// 实际改动了哪些 id。
    pub changed: Vec<String>,
    /// 写到哪个文件。
    pub written: String,
    /// 备份在哪（可回滚）。
    pub backup: Option<String>,
}

/// ⚠️ **OAuth 槽不能写 api key** —— Claude Code 的 `claudeAiOauth.accessToken`
/// 装的是 OAuth 令牌 ⇒ ⇒ 把 api key 写进去 ⇒ ⇒ 那个工具会拿它去换令牌 ⇒ ⇒
/// ⇒ **必然失败**，而且失败得很晚 ⇒ ⇒ 直接拒。
const OAUTH_SLOTS: [&str; 1] = ["claudeAiOauth.accessToken"];

/// 工具 id ⇒ 工具（`opencode` / `claude-code` / `codex`）。
fn parse_tool(id: &str) -> Result<ExternalTool, String> {
    serde_json::from_value::<ExternalTool>(Value::String(id.to_string()))
        .map_err(|_| format!("unknown external tool: {id} (opencode | claude-code | codex)"))
}

/// 协议族 ⇒ 大脑的**预设 id**（没有 base_url 时靠它补 base URL ＋ 标准）。
fn preset_id_for(standard: ApiStandard) -> &'static str {
    match standard {
        ApiStandard::OpenAi => "openai",
        ApiStandard::Claude => "anthropic",
    }
}

/// **扫描本机装了哪些外部工具、它们各有哪些供应商** —— **只报长度**。
#[tauri::command]
pub fn external_tools_scan() -> Result<Vec<ExternalProviderPreview>, String> {
    Ok(import::read_all()
        .iter()
        .flat_map(|cfg| {
            cfg.providers.iter().map(move |p| ExternalProviderPreview {
                tool: cfg.tool.id().to_string(),
                tool_display: cfg.tool.display_name().to_string(),
                source_id: p.source_id.clone(),
                key_len: p.config.api_key.as_ref().map(|k| k.len()),
                base_url: p.config.base_url.clone(),
                provider: p.config.provider.clone(),
                origin: p.origin.clone(),
            })
        })
        .collect())
}

/// **把一个外部供应商装载进大脑的供应商表**。
#[tauri::command]
pub async fn external_tools_import(
    tool: String,
    source_id: String,
) -> Result<ProviderEntry, String> {
    let tool = parse_tool(&tool)?;
    let cfg = import::read(tool).map_err(|e| e.to_string())?;
    let provider = cfg
        .providers
        .iter()
        .find(|p| p.source_id == source_id)
        .ok_or_else(|| format!("{} 里没有 {source_id}", tool.display_name()))?;

    // ⚠️ 材料**从不上桌** ⇒ ⇒ 直接进请求体 ⇒ ⇒ 不经过界面、不进日志。
    let key = provider
        .config
        .api_key
        .clone()
        .ok_or_else(|| format!("{source_id} 没有材料"))?;
    let standard = ApiStandard::parse(&provider.config.provider).unwrap_or(ApiStandard::OpenAi);

    let mut body = json!({
        "name": provider.source_id,
        "api_key": key,
    });
    match provider.config.base_url.as_deref() {
        // ⚠️ 有 base_url ⇒ ⇒ 自定义供应商（按外部配置说话）。
        Some(base) => {
            body["api_base"] = json!(base);
            body["provider_type"] = json!(standard.as_str());
        }
        // ⚠️ 没有 base_url ⇒ ⇒ 走大脑的**预设目录**（它自带 base URL ＋ 标准）
        // ⇒ ⇒ 不然这条供应商会「加进去了但永远连不上」。
        None => {
            body["preset_id"] = json!(preset_id_for(standard));
        }
    }

    let raw = brain_post(&brain_base(), "/models/providers", body).await?;
    entry_from_brain(&raw)
}

/// **把大脑里的一条供应商写回某个外部工具的配置文件**。
#[tauri::command]
pub async fn external_tools_export(
    tool: String,
    source_id: String,
    provider_id: String,
) -> Result<ExternalToolWriteReport, String> {
    let tool = parse_tool(&tool)?;
    if OAUTH_SLOTS.contains(&source_id.as_str()) {
        return Err(format!(
            "{source_id} 是 OAuth 令牌槽 ⇒ ⇒ 不能写 api key（那个工具会拿它去换令牌 ⇒ ⇒ 必然失败）"
        ));
    }

    // ① 从大脑取回明文（**admin 域** ⇒ ⇒ 大脑那边有审计日志）。
    //    ⚠️ 这一路必须走 `brain_post_secret` —— 响应原文**就是材料**。
    let revealed = brain_post_secret(
        &brain_base(),
        &format!("/models/providers/{provider_id}/reveal"),
        json!({}),
    )
    .await?;
    let key = revealed
        .get("api_key")
        .and_then(|k| k.as_str())
        .map(str::to_string)
        .ok_or_else(|| "大脑那边没有这把钥匙".to_string())?;

    // ② 写回那个工具自己的配置（**备份 ＋ 原子替换** ⇒ ⇒ 只动那一项）。
    let report = import::write(tool, &[(source_id.as_str(), Some(key.as_str()))])
        .map_err(|e| e.to_string())?;

    Ok(ExternalToolWriteReport {
        tool: tool.id().to_string(),
        changed: report.changed,
        written: report.written.display().to_string(),
        backup: report.backup.map(|p| p.display().to_string()),
    })
}
