//! Provider management commands — **薄代理到大脑那张面**。
//!
//! ⚠️ **2026-11-02 的架构决定**：云端供应商/本地模型/agent/mcp 等等**都由
//! 大脑（端脑）直接提供接口，两端保持一致** ⇒ ⇒ 本模块**不再自己持有
//! 一份注册表** ⇒ ⇒ 一切都转发给端脑的 `/models/providers`。
//!
//! ⚠️ **为什么必须换**（本轮量到的事实）：端脑推理**只认**它自己那份
//! （`telencephalon/src/lobes/mod.rs:798` → `api/providers.rs:338`）⇒ ⇒
//! 桌面端原来管的 `~/.shadow/providers.json` **大脑根本不读** ⇒ ⇒
//! 「桌面端配好的供应商对推理零影响」—— 这一族能力以前**看着能用、其实
//! 没用**。
//!
//! ✅ **命令名与返回类型一个字没改** ⇒ ⇒ 前端（`ProvidersPage.tsx`）
//! **零改动** ⇒ ⇒ 但它管的从此是**大脑真正在用的那份**。
//!
//! ⚠️ **旧的那份本地文件**（`~/.shadow/providers.json`，**数组**格式 ⇒
//! 与大脑的**对象**格式天然可区分）⇒ ⇒ 现在只作**一次性导入源**：大脑那边
//! 一条都没有 ＋ 本机还没导过 ⇒ ⇒ 才把它导进去 ⇒ ⇒ 导完**不删**那个文件
//! （删了不可逆）⇒ ⇒ 导入过的机器写一个**标记文件**，免得「用户把大脑那份
//! 全删了 ⇒ 下次启动又被旧文件复活」。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::{json, Value};
use tauri::State;

use encephalon::providers::{HttpModelFetcher, ProviderEntry, ProviderManager};
use synapse::providers::catalog::{self, ApiStandard, ModelSummary, ProviderPreset};

use crate::AppState;

// ============================================================================
// 大脑面的地址与钥匙
// ============================================================================

/// 大脑面的地址 —— 与端脑宿主（`telencephalon_http::DEFAULT_ADDR`）同一处。
pub(crate) fn brain_base() -> String {
    format!("http://{}", crate::telencephalon_http::DEFAULT_ADDR)
}

/// 大脑面的 admin 钥匙（**一把** ⇒ 读门与写门都开）。
///
/// ⚠️ 端脑的门型：读门 = shadow ∪ admin，写门 = admin ⇒ ⇒ 递 admin 一把
/// 就够 ⇒ ⇒ 绝不塞空串（空串与空串相等 ⇒ 等于把门骗开）。
pub(crate) fn brain_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    let token = crate::admin_token::admin_token().to_string();
    // ⚠️ **递不出去就不递**（fail-closed）⇒ ⇒ 绝不用空串冒充一把钥匙
    // （空串与空串相等 ⇒ 等于把门骗开）。
    if let Ok(value) = HeaderValue::from_str(&token) {
        headers.insert(HeaderName::from_static("x-admin-token"), value);
    }
    headers
}

pub(crate) fn brain_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap_or_default()
}

/// 大脑回的错误 ⇒ **原样带出去**（不要换成「添加失败」这种没信息的话）。
async fn brain_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let body = body.trim();
    if body.is_empty() {
        format!("大脑回 {}", status)
    } else {
        format!("大脑回 {}：{}", status, body)
    }
}

async fn brain_get(base: &str, path: &str) -> Result<Value, String> {
    let resp = brain_client()
        .get(format!("{}{}", base, path))
        .headers(brain_headers())
        .send()
        .await
        .map_err(|e| {
            format!(
                "连不上大脑（{}）—— 大脑可能还没起来，或它被别人占着端口：{}",
                brain_base(),
                e
            )
        })?;
    if !resp.status().is_success() {
        return Err(brain_error(resp).await);
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| {
        // ⚠️ **大脑的原话要带出来** —— 只说「形状不对」的话，用户看到的是
        // 一句没有信息量的错 ⇒ ⇒ 真原因（schema 过期 / 存储错误…）被换掉了。
        format!("大脑回的形状不对：{}（大脑原话：{}）", e, text.trim())
    })
}

pub(crate) async fn brain_post(base: &str, path: &str, body: Value) -> Result<Value, String> {
    let resp = brain_client()
        .post(format!("{}{}", base, path))
        .headers(brain_headers())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连不上大脑（{}）：{}", brain_base(), e))?;
    if !resp.status().is_success() {
        return Err(brain_error(resp).await);
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| {
        // ⚠️ **大脑的原话要带出来** —— 只说「形状不对」的话，用户看到的是
        // 一句没有信息量的错 ⇒ ⇒ 真原因（schema 过期 / 存储错误…）被换掉了。
        format!("大脑回的形状不对：{}（大脑原话：{}）", e, text.trim())
    })
}

/// **向大脑要一份「会带材料」的响应** —— ⚠️ **解析失败时绝不带原文**。
///
/// ⚠️⚠️ **为什么不能复用 `brain_post`**：它在解析失败时会把**响应原文**
/// 放进错误串（「大脑的原话要带出来」）⇒ ⇒ 而这一路的原文**就是材料**
/// ⇒ ⇒ 材料会漏进错误信息（进而进日志）⇒ ⇒ ⇒ 所以这一族单独走：
/// **失败只说「形状不对」，不带原文**。
///
/// ⚠️ **而「大脑回了错误状态」那条路仍然带原文** —— 那一路的请求体是空的
/// ⇒ ⇒ 大脑的错误响应里**不可能有材料** ⇒ ⇒ 保留原话是有信息量的。
pub(crate) async fn brain_post_secret(
    base: &str,
    path: &str,
    body: Value,
) -> Result<Value, String> {
    let resp = brain_client()
        .post(format!("{}{}", base, path))
        .headers(brain_headers())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连不上大脑（{}）：{}", base, e))?;
    if !resp.status().is_success() {
        return Err(brain_error(resp).await);
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| {
        // ⚠️⚠️ **这里绝不带原文** —— 原文就是材料。
        format!("大脑回的形状不对（材料不在错误里）：{e}")
    })
}

async fn brain_put(base: &str, path: &str, body: Value) -> Result<Value, String> {
    let resp = brain_client()
        .put(format!("{}{}", base, path))
        .headers(brain_headers())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连不上大脑（{}）：{}", brain_base(), e))?;
    if !resp.status().is_success() {
        return Err(brain_error(resp).await);
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| {
        // ⚠️ **大脑的原话要带出来** —— 只说「形状不对」的话，用户看到的是
        // 一句没有信息量的错 ⇒ ⇒ 真原因（schema 过期 / 存储错误…）被换掉了。
        format!("大脑回的形状不对：{}（大脑原话：{}）", e, text.trim())
    })
}

async fn brain_delete(base: &str, path: &str) -> Result<(), String> {
    let resp = brain_client()
        .delete(format!("{}{}", base, path))
        .headers(brain_headers())
        .send()
        .await
        .map_err(|e| format!("连不上大脑（{}）：{}", brain_base(), e))?;
    if !resp.status().is_success() {
        return Err(brain_error(resp).await);
    }
    Ok(())
}

// ============================================================================
// 形状映射（大脑的读模型 → 桌面端那份条目形状）
// ============================================================================

/// 大脑的一条供应商 → 桌面端要的 `ProviderEntry`。
///
/// ⚠️ **纯函数**（不碰网络）⇒ ⇒ 单测能直接钉它 ⇒ ⇒ 「两边字段名对不上」
/// 这类漂移会在编译/测试期就暴露，而不是界面上少一块。
pub(crate) fn entry_from_brain(raw: &Value) -> Result<ProviderEntry, String> {
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("大脑那条供应商没有 id")?
        .to_string();
    let name = raw
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let provider_type = raw
        .get("provider_type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    // ⚠️ `base_url` 是大脑给的别名，`api_base` 是它自己的老字段 ⇒ 两个都读。
    let base_url = raw
        .get("base_url")
        .and_then(|v| v.as_str())
        .or_else(|| raw.get("api_base").and_then(|v| v.as_str()))
        .unwrap_or_default()
        .to_string();
    // ⚠️ 没给标准就按 provider_type 派生（存量里是 `openai_compatible` 这种
    // 自由文本）⇒ ⇒ **一份真相**，不是两个字段各说各话。
    let api_standard = match raw.get("api_standard").and_then(|v| v.as_str()) {
        Some(s) => ApiStandard::parse(s).unwrap_or_else(|| derive_standard(provider_type)),
        None => derive_standard(provider_type),
    };
    let preset_id = raw
        .get("preset_id")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    // 默认模型只有目录里有 ⇒ ⇒ 按 preset_id 查（没有 preset 的自定义供应商
    // 就没这一项 —— 这是事实，不是空值冒充）。
    let default_model = preset_id
        .as_deref()
        .and_then(|pid| catalog::find_preset(pid))
        .and_then(|p| p.default_model.map(str::to_string));
    let models = raw
        .get("models")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|m| ModelSummary {
                    id: m
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    display_name: m.get("name").and_then(|v| v.as_str()).map(str::to_string),
                    context_length: None,
                    created_at: None,
                    // ⚠️ **能力**（llm / asr / tts / …）—— 内置条目（neuron 目录）
                    // ⇒ ⇒ 的模型**横跨七种能力** ⇒ ⇒ 不透传 ⇒ ⇒ 界面分不出
                    // ⇒ ⇒ 「这条是聊天模型还是语音模型」。
                    capability: m
                        .get("capabilities")
                        .and_then(|v| v.as_array())
                        .and_then(|a| a.first())
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                    // ⚠️ **盘上真的有吗** ⇒ ⇒ 内置条目里「目录里有、但还没下载」
                    // ⇒ ⇒ 的模型也列出来 ⇒ ⇒ 不透传 ⇒ ⇒ 界面会把「选了也跑不
                    // ⇒ ⇒ 起来」的模型当成能用的 ⇒ ⇒ 「失败长得像成功」。
                    available: m.get("available").and_then(|v| v.as_bool()),
                    // ⚠️ **这条能力从哪来**（user / upstream / catalog /
                    // inferred / default）—— 端脑读面算的五档判据结果。
                    // 不透传 ⇒ ⇒ 界面分不清「上游给的」与「我们猜的」⇒ ⇒
                    // 猜错了用户也发现不了（「失败长得像成功」）。
                    capability_source: m
                        .get("capability_source")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ProviderEntry {
        id,
        name,
        preset_id,
        base_url,
        api_standard,
        // ⚠️ 大脑那边**只回掩码** ⇒ ⇒ 桌面端拿到的也是掩码 ⇒ ⇒ 「界面把
        // 用户的云密钥显示出来」这条路被**堵死**了（以前本地那份存的是
        // 明文，前端想显示就能显示）。
        api_key: raw
            .get("api_key")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        enabled: raw.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
        // ⚠️ 内置供应商（neuron）⇒ ⇒ 界面据此不给「编辑 / 删除」按钮。
        builtin: raw
            .get("builtin")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        selected_model: raw
            .get("selected_model")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        default_model,
        models,
        last_refreshed_at: raw
            .get("last_refreshed_at")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        last_error: raw
            .get("last_error")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

fn derive_standard(provider_type: &str) -> ApiStandard {
    let t = provider_type.trim().to_ascii_lowercase();
    if t.contains("claude") || t.contains("anthropic") {
        ApiStandard::Claude
    } else {
        ApiStandard::OpenAi
    }
}

fn entries_from_brain(raw: &Value) -> Result<Vec<ProviderEntry>, String> {
    let arr = raw.as_array().ok_or("大脑回的供应商列表不是一个数组")?;
    arr.iter().map(entry_from_brain).collect()
}

// ============================================================================
// 旧本地注册表 → 大脑那份（一次性导入）
// ============================================================================

/// 导入标记（**每机一次**）—— 免得「用户把大脑那份全删了 ⇒ 旧文件又把它
/// 复活」。
fn import_marker_path() -> std::path::PathBuf {
    legacy_path().with_extension("imported")
}

/// 旧那份本地注册表的路径（**数组**格式）。
fn legacy_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".shadow")
        .join("providers.json")
}

/// 旧本地条目 → 大脑的「加一个」请求体。
///
/// ⚠️ 旧条目存着**真密钥** ⇒ ⇒ 导入时**原样带上**（那正是要迁过去的东西）。
fn legacy_to_add_body(entry: &ProviderEntry) -> Value {
    json!({
        "id": entry.id,
        "name": entry.name,
        "provider_type": entry.api_standard.as_str(),
        "api_base": entry.base_url,
        "api_key": entry.api_key,
        "enabled": entry.enabled,
        "selected_model": entry.selected_model,
        "preset_id": entry.preset_id,
        "models": [],
    })
}

/// 把旧本地注册表**一次性**导进大脑。
///
/// ⚠️ 条件：**本机还没导过**（标记文件）⇒ ⇒ 导入失败也不会把用户的配置弄丢
/// （旧文件一直留着）⇒ ⇒ 成功则写标记文件。
///
/// ⚠️⚠️ **逐条幂等**：大脑那边**同 id** 的跳过 ⇒ ⇒ 中途失败后重试**不会**卡在
/// 「id 已存在」上 ⇒ ⇒ 也不会出现「导了一半就再也不导了」。
///
/// ⚠️⚠️ **失败可以重试**：只有「真的导完 / 确实没东西可导」才置
/// `IMPORT_ATTEMPTED` ⇒ ⇒ 大脑还没起来时**下次还会试**（否则「导不进去」
/// 就变成「永远导不进去」）。
async fn import_legacy_into_brain(state: &AppState) -> Result<(), String> {
    if import_marker_path().exists() {
        IMPORT_ATTEMPTED.store(true, Ordering::SeqCst);
        return Ok(());
    }
    let legacy: Vec<ProviderEntry> = state.provider_manager.list().await;
    if legacy.is_empty() {
        IMPORT_ATTEMPTED.store(true, Ordering::SeqCst);
        return Ok(());
    }
    let current = brain_get(&brain_base(), "/models/providers").await?;
    // ⚠️ 大脑那边已经有配置了 ⇒ ⇒ **不导入**（两份并存 = 用户会看到重影）。
    //
    // ⚠️⚠️ 但**已经有配置**不等于「导入完了」⇒ ⇒ 只跳过**同 id** 的那几条
    // ⇒ ⇒ **逐条幂等** ⇒ ⇒ 中途失败后重试**不会**因为「id 已存在」卡死。
    let existing = ids_present(&current);
    if !existing.is_empty() {
        tracing::info!(
            "provider legacy import: 大脑已有 {} 条 ⇒ 只补缺的那些",
            existing.len()
        );
    }
    for entry in &legacy {
        if existing.contains(&entry.id) {
            continue;
        }
        brain_post(
            &brain_base(),
            "/models/providers",
            legacy_to_add_body(entry),
        )
        .await?;
    }
    if let Some(dir) = import_marker_path().parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(
        import_marker_path(),
        format!("imported {} entries\n", legacy.len()),
    );
    tracing::info!("provider legacy import: {} entries → 大脑", legacy.len());
    // ⚠️ **标志只在真的干完之后才置位** ⇒ ⇒ 失败（大脑还没起来 / 网络抽风）
    // ⇒ ⇒ **下次还会试** ⇒ ⇒ 否则「导不进去」就变成「永远导不进去」。
    IMPORT_ATTEMPTED.store(true, Ordering::SeqCst);
    Ok(())
}

/// 大脑那边**已经有的**那些 id。
fn ids_present(current: &Value) -> std::collections::HashSet<String> {
    current
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.get("id").and_then(|v| v.as_str()))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// 进程内「已经试过导入」的闸（避免每次列一次都去读盘 ＋ 试一次）。
static IMPORT_ATTEMPTED: AtomicBool = AtomicBool::new(false);

// ============================================================================
// Tauri 命令（**名字与返回类型一字未改** ⇒ 前端零改动）
// ============================================================================

/// **预设目录** —— 直接读 `synapse::providers::catalog`。
///
/// ⚠️ 为什么不是去问大脑：`ProviderPreset` 的字段是 `&'static str` ⇒ ⇒ 它
/// **只能**由那份**静态目录**构造 ⇒ ⇒ 问大脑再反序列化是**做不到**的。
///
/// ⇒ ⇒ 而大脑那个 `GET /models/providers/presets` 端点回的**就是同一份
/// 目录** ⇒ ⇒ 两端读的是**同一个来源** ⇒ ⇒ 不可能漂。
#[tauri::command]
pub fn provider_presets() -> Result<Vec<ProviderPreset>, String> {
    Ok(catalog::presets().to_vec())
}

#[tauri::command]
pub async fn provider_list(state: State<'_, AppState>) -> Result<Vec<ProviderEntry>, String> {
    // ⚠️ **失败要能重试** ⇒ ⇒ 这里**不**置位；置位只发生在「真的导完 /
    // 确实没东西可导」的时候（见 import_legacy_into_brain）。
    if !IMPORT_ATTEMPTED.load(Ordering::SeqCst) {
        if let Err(e) = import_legacy_into_brain(state.inner()).await {
            // ⚠️ 导入失败**不吞掉**：界面要能说出「旧配置没导进去」。
            tracing::warn!("provider legacy import failed (will retry): {e}");
        }
    }
    let raw = brain_get(&brain_base(), "/models/providers").await?;
    entries_from_brain(&raw)
}

/// 按预设添加 —— **只需要 API key**（base URL ＋ API 标准由大脑的目录给）。
#[tauri::command]
pub async fn provider_add_preset(
    preset_id: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    let body = json!({
        "preset_id": preset_id,
        "api_key": api_key,
    });
    let raw = brain_post(&brain_base(), "/models/providers", body).await?;
    entry_from_brain(&raw)
}

/// 自定义供应商 —— 用户自己给名字、地址、API 标准、key。
#[tauri::command]
pub async fn provider_add_custom(
    name: String,
    base_url: String,
    api_standard: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    let standard = ApiStandard::parse(&api_standard)
        .ok_or_else(|| format!("unknown API standard: {} (openai | claude)", api_standard))?;
    let body = json!({
        "name": name,
        "api_base": base_url,
        "provider_type": standard.as_str(),
        "api_key": api_key,
    });
    let raw = brain_post(&brain_base(), "/models/providers", body).await?;
    entry_from_brain(&raw)
}

#[tauri::command]
pub async fn provider_remove(id: String) -> Result<(), String> {
    brain_delete(&brain_base(), &format!("/models/providers/{}", id)).await
}

#[tauri::command]
pub async fn provider_set_enabled(id: String, enabled: bool) -> Result<ProviderEntry, String> {
    let raw = brain_put(
        &brain_base(),
        &format!("/models/providers/{}", id),
        json!({"enabled": enabled}),
    )
    .await?;
    entry_from_brain(&raw)
}

/// 换 key —— 预设供应商**唯一**可改的东西。
#[tauri::command]
pub async fn provider_set_api_key(id: String, api_key: String) -> Result<ProviderEntry, String> {
    let raw = brain_put(
        &brain_base(),
        &format!("/models/providers/{}", id),
        json!({"api_key": api_key}),
    )
    .await?;
    entry_from_brain(&raw)
}

/// 改自定义供应商的完整定义。
///
/// ⚠️ **预设供应商忽略定义改动**（只换 key）—— 与原来那条规则一致 ⇒ ⇒
/// 不然用户能把「目录给的 base URL」改成一个不相干的地方 ⇒ ⇒ 两端对不上。
#[tauri::command]
pub async fn provider_update_custom(
    id: String,
    name: String,
    base_url: String,
    api_standard: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    let standard = ApiStandard::parse(&api_standard)
        .ok_or_else(|| format!("unknown API standard: {} (openai | claude)", api_standard))?;
    let current = brain_get(&brain_base(), "/models/providers").await?;
    let is_preset = current
        .as_array()
        .map(|arr| {
            arr.iter().any(|p| {
                p.get("id").and_then(|v| v.as_str()) == Some(id.as_str())
                    && p.get("preset_id").and_then(|v| v.as_str()).is_some()
            })
        })
        .unwrap_or(false);
    let body = if is_preset {
        json!({"api_key": api_key})
    } else {
        json!({
            "name": name,
            "api_base": base_url,
            "provider_type": standard.as_str(),
            "api_key": api_key,
        })
    };
    let raw = brain_put(&brain_base(), &format!("/models/providers/{}", id), body).await?;
    entry_from_brain(&raw)
}

#[tauri::command]
pub async fn provider_select_model(
    id: String,
    model_id: Option<String>,
) -> Result<ProviderEntry, String> {
    let raw = brain_put(
        &brain_base(),
        &format!("/models/providers/{}", id),
        json!({"selected_model": model_id}),
    )
    .await?;
    entry_from_brain(&raw)
}

/// 刷新一个供应商的模型列表（大脑那边去拉）。
#[tauri::command]
pub async fn provider_refresh(id: String) -> Result<ProviderEntry, String> {
    brain_post(
        &brain_base(),
        &format!("/models/providers/{}/fetch-models", id),
        json!({}),
    )
    .await?;
    let raw = brain_get(&brain_base(), "/models/providers").await?;
    let entries = entries_from_brain(&raw)?;
    entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("大脑那边没有这条供应商了：{}", id))
}

/// 刷新**全部**启用中的供应商。
#[tauri::command]
pub async fn provider_refresh_all() -> Result<Vec<ProviderEntry>, String> {
    let raw = brain_get(&brain_base(), "/models/providers").await?;
    let entries = entries_from_brain(&raw)?;
    for entry in entries.iter().filter(|e| e.enabled) {
        // ⚠️ 一个失败**不许**把整轮刷掉 ⇒ ⇒ 记下来继续。
        if let Err(e) = brain_post(
            &brain_base(),
            &format!("/models/providers/{}/fetch-models", entry.id),
            json!({}),
        )
        .await
        {
            tracing::warn!("provider refresh failed for {}: {e}", entry.id);
        }
    }
    let raw = brain_get(&brain_base(), "/models/providers").await?;
    entries_from_brain(&raw)
}

/// **无状态**预览模型列表（「测试并获取模型」按钮）—— 不落盘、不进列表。
#[tauri::command]
pub async fn provider_preview_fetch(
    preset_id: Option<String>,
    base_url: Option<String>,
    api_standard: String,
    api_key: Option<String>,
) -> Result<Vec<ModelSummary>, String> {
    let standard = ApiStandard::parse(&api_standard)
        .ok_or_else(|| format!("unknown API standard: {} (openai | claude)", api_standard))?;
    let body = json!({
        "preset_id": preset_id,
        "api_base": base_url,
        "api_standard": standard.as_str(),
        "api_key": api_key,
    });
    let raw = brain_post(&brain_base(), "/models/providers/preview", body).await?;
    let models = raw.get("models").cloned().ok_or("大脑回的不是预览形状")?;
    serde_json::from_value(models).map_err(|e| format!("大脑回的模型列表形状不对：{}", e))
}

/// 构造管理器 —— ⚠️ 现在**只**作**旧本地注册表的读取源**（一次性导入用）。
///
/// ⚠️ 它**不再**是桌面端那份「配置真相」—— 真相在**大脑**。
pub fn new_manager() -> ProviderManager {
    let persist = dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".shadow")
        .join("providers.json");
    ProviderManager::with_persistence(std::sync::Arc::new(HttpModelFetcher), Some(persist))
}

// ============================================================================
// 单测（**纯函数** ⇒ ⇒ 不碰网络、不碰磁盘 ⇒ ⇒ 跑得飞快）
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// 大脑回的一条供应商（最小形状）。
    fn brain_entry(extra: Value) -> Value {
        let mut v = json!({
            "id": "p1",
            "name": "OpenAI",
            "provider_type": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-***",
            "models": [{ "id": "gpt-4o" }],
        });
        if let (Some(base), Some(extra)) = (v.as_object_mut(), extra.as_object()) {
            for (k, val) in extra {
                base.insert(k.clone(), val.clone());
            }
        }
        v
    }

    #[test]
    fn reads_the_base_url_alias_the_brain_speaks() {
        let e = entry_from_brain(&brain_entry(json!({}))).expect("entry");
        assert_eq!(e.base_url, "https://api.openai.com/v1");
    }

    #[test]
    fn falls_back_to_the_brains_own_api_base_field() {
        let raw = json!({ "id": "p1", "name": "x", "api_base": "https://old/v1" });
        let e = entry_from_brain(&raw).expect("entry");
        assert_eq!(e.base_url, "https://old/v1");
    }

    #[test]
    fn derives_the_api_standard_when_the_brain_does_not_say() {
        let raw = json!({ "id": "p1", "provider_type": "anthropic" });
        let e = entry_from_brain(&raw).expect("entry");
        assert_eq!(e.api_standard, ApiStandard::Claude);
    }

    #[test]
    fn the_brains_api_standard_wins_over_the_derived_one() {
        let raw = json!({
            "id": "p1",
            "provider_type": "anthropic",
            "api_standard": "openai",
        });
        let e = entry_from_brain(&raw).expect("entry");
        assert_eq!(e.api_standard, ApiStandard::OpenAi);
    }

    #[test]
    fn old_data_without_enabled_stays_enabled() {
        let raw = json!({ "id": "p1", "name": "x" });
        let e = entry_from_brain(&raw).expect("entry");
        assert!(
            e.enabled,
            "旧数据没有 enabled 字段 ⇒ 必须默认启用（不能静默把老供应商停用）"
        );
    }

    #[test]
    fn a_missing_api_key_is_absent_not_empty() {
        let raw = json!({ "id": "p1", "name": "x" });
        let e = entry_from_brain(&raw).expect("entry");
        assert_eq!(e.api_key, None, "没有 key ⇒ None（不能变成空串冒充有 key）");
    }

    #[test]
    fn the_default_model_comes_from_the_catalog_not_from_the_brain() {
        let raw = json!({ "id": "p1", "preset_id": "openai" });
        let e = entry_from_brain(&raw).expect("entry");
        assert_eq!(
            e.default_model.as_deref(),
            Some("gpt-4o"),
            "默认模型来自那份**静态目录** ⇒ ⇒ 与大脑的预设目录同源"
        );
    }

    #[test]
    fn a_list_that_is_not_a_list_is_an_error_not_an_empty_list() {
        let err = entries_from_brain(&json!({ "error": "boom" })).expect_err("必须报错");
        assert!(err.contains("数组"), "错误要说清形状不对：{err}");
    }

    #[test]
    fn the_legacy_body_carries_the_real_key_and_the_preset() {
        let e = ProviderEntry {
            id: "old".into(),
            name: "旧供应商".into(),
            preset_id: Some("qwen".into()),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            api_standard: ApiStandard::OpenAi,
            api_key: Some("sk-real-secret".into()),
            enabled: false,
            // ⚠️ 存量条目**不是**内置条目（内置的只有大脑读视图里那个 neuron）。
            builtin: false,
            selected_model: Some("qwen-plus".into()),
            default_model: Some("qwen-plus".into()),
            models: vec![],
            last_refreshed_at: None,
            last_error: None,
        };
        let body = legacy_to_add_body(&e);
        assert_eq!(body["api_key"], json!("sk-real-secret"), "导入必须带真 key");
        assert_eq!(body["preset_id"], json!("qwen"));
        assert_eq!(body["enabled"], json!(false), "停用状态也要迁过去");
        assert_eq!(
            body["api_base"],
            json!("https://dashscope.aliyuncs.com/compatible-mode/v1")
        );
    }

    // ------------------------------------------------------------------
    // 对着**一台假大脑**跑真链路（⇒ 「失败长得像成功」这条路被堵死）
    // ------------------------------------------------------------------

    /// 一台**假大脑** —— 只应答一次，并把收到的请求原样交回来。
    ///
    /// ⚠️ 手写 TCP 而不用 axum ⇒ ⇒ 桌面端 crate 不必为了测一个代理
    /// 多背一个 web 框架依赖。
    async fn fake_brain(
        status: &'static str,
        body: &'static str,
    ) -> (String, tokio::sync::oneshot::Receiver<String>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fake brain");
        let addr = listener.local_addr().expect("addr");
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            let mut raw: Vec<u8> = Vec::new();
            let mut tmp = [0u8; 1024];
            // 读到 headers 结束
            loop {
                match sock.read(&mut tmp).await {
                    Ok(0) => break,
                    Ok(n) => {
                        raw.extend_from_slice(&tmp[..n]);
                        if raw.windows(4).any(|w| w == b"\r\n\r\n".as_slice()) {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let head = String::from_utf8_lossy(&raw).to_string();
            let mut want = 0usize;
            for line in head.lines() {
                let lower = line.to_ascii_lowercase();
                if let Some(v) = lower.strip_prefix("content-length:") {
                    want = v.trim().parse().unwrap_or(0);
                }
            }
            let have = head.split("\r\n\r\n").nth(1).map(|s| s.len()).unwrap_or(0);
            while have + want > raw.len() {
                match sock.read(&mut tmp).await {
                    Ok(0) => break,
                    Ok(n) => raw.extend_from_slice(&tmp[..n]),
                    Err(_) => break,
                }
            }
            let _ = tx.send(String::from_utf8_lossy(&raw).to_string());
            let resp = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                body.len(),
                body
            );
            let _ = sock.write_all(resp.as_bytes()).await;
            let _ = sock.flush().await;
        });
        (format!("http://{}", addr), rx)
    }

    #[tokio::test]
    async fn the_brains_own_words_survive_into_the_error() {
        let (base, _rx) = fake_brain(
            "500 Internal Server Error",
            "{\"error\":\"真原因：schema 过期\"}",
        )
        .await;
        let err = brain_get(&base, "/models/providers")
            .await
            .expect_err("必须报错");
        assert!(
            err.contains("真原因：schema 过期"),
            "大脑的原话必须原样带出来：{err}"
        );
    }

    #[tokio::test]
    async fn a_reply_that_is_not_json_says_what_the_brain_actually_said() {
        let (base, _rx) = fake_brain(
            "200 OK",
            "Storage error: lance scan stream: No field named tenant_id",
        )
        .await;
        let err = brain_get(&base, "/models/providers")
            .await
            .expect_err("必须报错");
        assert!(err.contains("形状不对"), "要说明形状不对：{err}");
        assert!(
            err.contains("tenant_id"),
            "大脑的原话要带出来（不然用户只看到一句没信息量的错）：{err}"
        );
    }

    #[tokio::test]
    async fn adding_by_preset_only_sends_a_key() {
        let (base, rx) = fake_brain(
            "200 OK",
            "{\"id\":\"qwen\",\"name\":\"通义\",\"preset_id\":\"qwen\",\"base_url\":\"https://dashscope.aliyuncs.com/compatible-mode/v1\",\"api_standard\":\"openai\",\"api_key\":\"sk-***\",\"enabled\":true,\"models\":[]}",
        )
        .await;
        let raw = brain_post(
            &base,
            "/models/providers",
            json!({ "preset_id": "qwen", "api_key": "sk-user" }),
        )
        .await
        .expect("必须成功");
        let req = rx.await.expect("必须收到请求");
        let payload = req.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        let sent: Value = serde_json::from_str(&payload).expect("请求体必须是 JSON");
        assert_eq!(sent["preset_id"], json!("qwen"));
        assert!(
            sent.get("api_base").is_none(),
            "按预设加 ⇒ base URL 由大脑的目录给，客户端不许自己编：{sent}"
        );
        assert!(
            sent.get("models").is_none(),
            "客户端不该自己编模型列表：{sent}"
        );
        let entry = entry_from_brain(&raw).expect("entry");
        assert_eq!(
            entry.base_url,
            "https://dashscope.aliyuncs.com/compatible-mode/v1"
        );
        assert!(entry.enabled);
        assert_eq!(
            entry.api_key.as_deref(),
            Some("sk-***"),
            "掩码原样传 ⇒ 桌面端拿不到明文密钥"
        );
    }

    #[tokio::test]
    async fn a_brain_that_is_not_there_says_so() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let addr = listener.local_addr().expect("addr");
        drop(listener);
        let err = brain_get(&format!("http://{}", addr), "/models/providers")
            .await
            .expect_err("必须报错");
        assert!(err.contains("连不上大脑"), "要明说是连不上：{err}");
    }
}
