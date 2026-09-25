//! Provider management commands — thin Tauri bridge over the 端脑
//! (encephalon) `ProviderManager`.
//!
//! The reusable substrate (preset catalog, dual-standard model listing)
//! lives in `synapse::providers::catalog`; the management layer (registry,
//! cached model lists, periodic refresh, persistence) lives in
//! `encephalon::providers`. This module only exposes that surface to the
//! frontend — and is deliberately free of business logic so tiangong-agent
//! can reuse the encephalon layer unchanged.

use tauri::State;

use encephalon::providers::{HttpModelFetcher, ProviderEntry, ProviderManager};
use synapse::providers::catalog::{ApiStandard, ProviderPreset};

use crate::AppState;

#[tauri::command]
pub fn provider_presets(state: State<'_, AppState>) -> Vec<ProviderPreset> {
    state.provider_manager.presets()
}

#[tauri::command]
pub async fn provider_list(state: State<'_, AppState>) -> Result<Vec<ProviderEntry>, String> {
    Ok(state.provider_manager.list().await)
}

/// Add a preset provider. The preset bundles base URL + API standard, so
/// the user's only input is the API key (omitted for keyless local
/// runtimes). An immediate model fetch runs on the encephalon side.
#[tauri::command]
pub async fn provider_add_preset(
    state: State<'_, AppState>,
    preset_id: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    state
        .provider_manager
        .add_preset(&preset_id, api_key)
        .await
}

/// Add a custom provider: the user supplies name + base URL + API
/// standard + key themselves.
#[tauri::command]
pub async fn provider_add_custom(
    state: State<'_, AppState>,
    name: String,
    base_url: String,
    api_standard: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    let standard = ApiStandard::parse(&api_standard)
        .ok_or_else(|| format!("unknown API standard: {} (openai | claude)", api_standard))?;
    state
        .provider_manager
        .add_custom(&name, &base_url, standard, api_key)
        .await
}

#[tauri::command]
pub async fn provider_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.provider_manager.remove(&id).await
}

#[tauri::command]
pub async fn provider_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<ProviderEntry, String> {
    state.provider_manager.set_enabled(&id, enabled).await
}

/// Replace a provider's API key (the only editable field of a preset
/// provider).
#[tauri::command]
pub async fn provider_set_api_key(
    state: State<'_, AppState>,
    id: String,
    api_key: String,
) -> Result<ProviderEntry, String> {
    state.provider_manager.set_api_key(&id, &api_key).await
}

/// Update a custom provider's full definition. Preset providers ignore
/// name/URL/standard changes (only the key is applied).
#[tauri::command]
pub async fn provider_update_custom(
    state: State<'_, AppState>,
    id: String,
    name: String,
    base_url: String,
    api_standard: String,
    api_key: Option<String>,
) -> Result<ProviderEntry, String> {
    let standard = ApiStandard::parse(&api_standard)
        .ok_or_else(|| format!("unknown API standard: {} (openai | claude)", api_standard))?;
    state
        .provider_manager
        .update_custom(&id, &name, &base_url, standard, api_key)
        .await
}

#[tauri::command]
pub async fn provider_select_model(
    state: State<'_, AppState>,
    id: String,
    model_id: Option<String>,
) -> Result<ProviderEntry, String> {
    state.provider_manager.select_model(&id, model_id).await
}

/// Force a model-list refresh for one provider now.
#[tauri::command]
pub async fn provider_refresh(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProviderEntry, String> {
    state.provider_manager.refresh(&id).await
}

/// Force a refresh of every enabled provider now (the background loop
/// does this periodically anyway).
#[tauri::command]
pub async fn provider_refresh_all(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderEntry>, String> {
    Ok(state.provider_manager.refresh_all().await)
}

/// Construct the manager with `~/.shadow/providers.json` persistence.
/// Kept next to the commands so `lib.rs` stays a pure wiring file.
pub fn new_manager() -> ProviderManager {
    let persist = dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".shadow")
        .join("providers.json");
    ProviderManager::with_persistence(std::sync::Arc::new(HttpModelFetcher), Some(persist))
}
