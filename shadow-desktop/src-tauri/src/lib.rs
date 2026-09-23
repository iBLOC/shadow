mod mdns;
mod video_source;
mod ws_client;
mod crypto;
mod model_store;
mod config_manager;
mod opencode_manager;
mod worktree_manager;
mod logger;

use config_manager::{AppConfig, DatabaseConfig, ProviderConfig, SecureAuth};
use diencephalon::Thalamus;
use encephalon::{AcpEnvelope, AgentId, Encephalon, TelencephalonStreamEvent};
use model_store::{EncryptedStorage, ModelProvider};
use opencode_manager::OpenCodeManager;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime, State, WindowEvent,
};
use telencephalon::a2a::client::TelencephalonStreamEvent as Tse;
use worktree_manager::WorktreeManager;
use ws_client::MtlsWebSocketClient;

struct AppState {
    encephalon: Arc<Encephalon>,
    thalamus: Arc<Thalamus>,
    ws_client: Arc<MtlsWebSocketClient>,
    model_storage: Arc<EncryptedStorage>,
    secure_auth: Arc<SecureAuth>,
    opencode_manager: Arc<OpenCodeManager>,
    worktree_manager: Arc<WorktreeManager>,
    workflow_state: Arc<tokio::sync::Mutex<WorkflowState>>,
}

struct WorkflowState {
    approved_tasks: std::collections::HashMap<String, bool>,
    rejected_tasks: std::collections::HashMap<String, String>,
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "显示窗口 / Show", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "隐藏窗口 / Hide", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出 / Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

    let icon = Image::from_path("icons/32x32.png")
        .or_else(|_| Image::from_path("icons/icon.png"))
        .unwrap_or_else(|_| {
            let rgba = vec![0x63, 0x66, 0xf1, 0xff].repeat(32 * 32);
            Image::new_owned(rgba, 32, 32)
        });

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Shadow Desktop")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon<_>, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init();
    logger::log_startup_diagnostics();

    // Initialise the embedded 大脑 (encephalon) in-process. This blocks
    // the main thread for a few ms (creating an empty thalamus + a
    // broadcast::channel), which is faster than the old cortex-sidecar
    // cold-start that previously added 100s–10s of startup latency.
    let thalamus = Arc::new(
        tauri::async_runtime::block_on(diencephalon::Thalamus::new(None))
            .expect("init thalamus"),
    );
    let encephalon = Arc::new(
        tauri::async_runtime::block_on(Encephalon::new(thalamus.clone())),
    );

    let app_state = AppState {
        encephalon: encephalon.clone(),
        thalamus: thalamus.clone(),
        ws_client: Arc::new(MtlsWebSocketClient::new()),
        model_storage: Arc::new(EncryptedStorage::new()),
        secure_auth: Arc::new(SecureAuth::new()),
        opencode_manager: Arc::new(OpenCodeManager::new()),
        worktree_manager: Arc::new(WorktreeManager::new()),
        workflow_state: Arc::new(tokio::sync::Mutex::new(WorkflowState {
            approved_tasks: std::collections::HashMap::new(),
            rejected_tasks: std::collections::HashMap::new(),
        })),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // In test mode (wdio Tauri E2E), bypass the focus-existing-window
            // behavior so a second `pnpm tauri dev` launched by a developer
            // during a test run starts a fresh instance instead of stealing
            // focus from the wdio-controlled Tauri process.
            if std::env::var("TAURI_TEST_NO_SINGLE_INSTANCE").is_ok() {
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_wdio_webdriver::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .setup(|app| {
            if let Err(e) = setup_tray(app) {
                tracing::error!("Failed to setup tray: {}", e);
            }

            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            let app_handle = app.handle().clone();
            // In-process encephalon is already initialised; nothing
            // async to spawn here. (The old cortex sidecar spawn is
            // gone — see commit f200f93 for the deletion history.)
            let _ = app_handle;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_window,
            hide_window,
            minimize_window,
            toggle_window_visibility,
            discover_resonance,
            resolve_resonance,
            encephalon_status,
            ws_connect,
            ws_send,
            ws_disconnect,
            ws_reconnect,
            encrypt_value,
            decrypt_value,
            set_master_key,
            add_model_provider,
            list_model_providers,
            delete_model_provider,
            set_password,
            get_machine_id,
            verify_password,
            save_db_config,
            get_db_config,
            is_setup_complete,
            fetch_provider_models,
            save_provider_config,
            get_provider_config,
            update_setup_step,
            get_setup_step,
            mark_setup_complete,
            opencode_launch,
            opencode_check_installed,
            opencode_install,
            opencode_stop,
            opencode_list_instances,
            opencode_create_session,
            opencode_send_message,
            worktree_create,
            worktree_delete,
            worktree_get,
            workflow_start_planning,
            approve_task,
            reject_task,
            workflow_execute_step,
            encephalon_publish_demo,
            video_source::enumerate_uvc,
            video_source::probe_capabilities,
            video_source::push_thalamus,
            video_source::sync_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_window_visibility(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn discover_resonance() -> Result<Vec<mdns::DiscoveredService>, String> {
    mdns::discover_resonance().await
}

#[tauri::command]
async fn resolve_resonance(name: String) -> Result<Option<mdns::DiscoveredService>, String> {
    mdns::resolve_service(&name).await
}

#[tauri::command]
async fn encephalon_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "bus_receivers": state.encephalon.bus.receiver_count(),
        "thalamus_sensor_count": state.thalamus.sensor_count(),
        "thalamus_sensors": state.thalamus.sensor_names(),
        "thalamus_video_cameras": state.thalamus.video_cameras(),
        "telencephalon_attached": state.encephalon.telencephalon.is_some(),
    }))
}

#[tauri::command]
async fn encephalon_publish_demo(
    state: State<'_, AppState>,
    topic: String,
    message: String,
) -> Result<usize, String> {
    state
        .encephalon
        .broadcast_event(
            AgentId::from("shadow-desktop-demo"),
            topic,
            Tse::Delta { text: message },
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ws_connect(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    url: String,
async fn ws_connect(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    url: String,
    client_cert: Option<String>,
    client_key: Option<String>,
) -> Result<(), String> {
    let cert_tuple = match (client_cert, client_key) {
        (Some(cert), Some(key)) => {
            let cert_bytes = base64_decode(&cert);
            let key_bytes = base64_decode(&key);
            cert_bytes.zip(key_bytes)
        }
        _ => None,
    };
    state.ws_client.connect(app, url, cert_tuple).await
}

#[tauri::command]
async fn ws_send(state: State<'_, AppState>, message: String) -> Result<(), String> {
    state.ws_client.send(message).await
}

#[tauri::command]
async fn ws_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    state.ws_client.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn ws_reconnect(state: State<'_, AppState>) -> Result<(), String> {
    state.ws_client.reconnect().await
}

#[tauri::command]
fn encrypt_value(value: String, passphrase: String) -> Result<String, String> {
    crypto::encrypt_value(&value, &passphrase)
}

#[tauri::command]
fn decrypt_value(encrypted: String, passphrase: String) -> Result<String, String> {
    crypto::decrypt_value(&encrypted, &passphrase)
}

#[tauri::command]
fn set_master_key(state: State<'_, AppState>, passphrase: String) -> Result<(), String> {
    state.model_storage.set_master_key(&passphrase)
}

#[tauri::command]
async fn add_model_provider(
    state: State<'_, AppState>,
    provider: ModelProvider,
) -> Result<ModelProvider, String> {
    state.model_storage.add_provider(provider).await
}

#[tauri::command]
async fn list_model_providers(state: State<'_, AppState>) -> Result<Vec<ModelProvider>, String> {
    state.model_storage.list_providers().await
}

#[tauri::command]
async fn delete_model_provider(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.model_storage.delete_provider(&id).await
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    fn decode_char(b: u8) -> Option<u8> {
        match b {
            b'A'..=b'Z' => Some(b - b'A'),
            b'a'..=b'z' => Some(b - b'a' + 26),
            b'0'..=b'9' => Some(b - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    let input = input.trim();
    let len = input.len();
    let padding = if len >= 2 && input[len-2..].as_bytes() == b"==" {
        2
    } else if len >= 1 && input[len-1..].as_bytes() == b"=" {
        1
    } else {
        0
    };

    let mut result = Vec::with_capacity(len * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0;

    for byte in input.bytes() {
        if byte == b'=' {
            break;
        }
        if let Some(value) = decode_char(byte) {
            buffer = (buffer << 6) | (value as u32);
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                result.push((buffer >> bits) as u8);
                buffer &= (1 << bits) - 1;
            }
        }
    }

    if padding > 0 && bits > 0 {
        buffer <<= 8 - padding * 2;
        result.push(buffer as u8);
    }

    Some(result)
}

#[tauri::command]
async fn set_password(
    state: State<'_, AppState>,
    password: String,
    machine_id: String,
) -> Result<String, String> {
    state.secure_auth.set_password(&password, &machine_id).await?;
    state.model_storage.set_master_key(&password)?;
    Ok("Password set successfully".to_string())
}

#[tauri::command]
async fn get_machine_id(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.secure_auth.get_machine_id().await)
}

#[tauri::command]
async fn verify_password(
    state: State<'_, AppState>,
    password: String,
    machine_id: String,
) -> Result<bool, String> {
    state.secure_auth.verify_password(&password, &machine_id).await
}

#[tauri::command]
async fn save_db_config(
    state: State<'_, AppState>,
    db_type: String,
    db_config: DatabaseConfig,
) -> Result<(), String> {
    state.secure_auth.save_db_config(&db_type, db_config).await
}

#[tauri::command]
async fn get_db_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.secure_auth.get_config().await)
}

#[tauri::command]
async fn is_setup_complete(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.secure_auth.is_setup_complete().await)
}

#[tauri::command]
async fn mark_setup_complete(state: State<'_, AppState>) -> Result<(), String> {
    state.secure_auth.mark_setup_complete().await
}

#[derive(serde::Deserialize)]
struct ProviderModelsResponse {
    data: Vec<ProviderModelData>,
}

#[derive(serde::Deserialize)]
struct ProviderModelData {
    id: String,
    #[serde(default)]
    object: String,
    #[serde(default)]
    #[allow(dead_code)]
    created: Option<u64>,
    #[serde(default)]
    context_window: Option<i32>,
}

#[derive(serde::Serialize, Clone)]
struct FetchedModel {
    id: String,
    name: String,
    model_id: String,
    model_type: String,
    context_length: Option<i32>,
    supports_vision: bool,
    supports_function_calling: bool,
}

fn get_fallback_models(api_base: &str) -> Option<Vec<FetchedModel>> {
    let api_base_lower = api_base.to_lowercase();
    
    if api_base_lower.contains("minimax") || api_base_lower.contains("minimaxi") {
        return Some(vec![
            FetchedModel { id: "MiniMax-M2.7".to_string(), name: "MiniMax M2.7".to_string(), model_id: "MiniMax-M2.7".to_string(), model_type: "chat".to_string(), context_length: Some(200000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "MiniMax-M2.7-highspeed".to_string(), name: "MiniMax M2.7 Highspeed".to_string(), model_id: "MiniMax-M2.7-highspeed".to_string(), model_type: "chat".to_string(), context_length: Some(200000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "MiniMax-M2.5".to_string(), name: "MiniMax M2.5".to_string(), model_id: "MiniMax-M2.5".to_string(), model_type: "chat".to_string(), context_length: Some(100000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "MiniMax-M2.5-highspeed".to_string(), name: "MiniMax M2.5 Highspeed".to_string(), model_id: "MiniMax-M2.5-highspeed".to_string(), model_type: "chat".to_string(), context_length: Some(100000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "M2-her".to_string(), name: "M2-her".to_string(), model_id: "M2-her".to_string(), model_type: "chat".to_string(), context_length: Some(32000), supports_vision: false, supports_function_calling: true },
        ]);
    }
    
    if api_base_lower.contains("moonshot") || api_base_lower.contains(" moonshot") {
        return Some(vec![
            FetchedModel { id: "moonshot-v1-8k".to_string(), name: "Moonshot V1 8K".to_string(), model_id: "moonshot-v1-8k".to_string(), model_type: "chat".to_string(), context_length: Some(8000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "moonshot-v1-32k".to_string(), name: "Moonshot V1 32K".to_string(), model_id: "moonshot-v1-32k".to_string(), model_type: "chat".to_string(), context_length: Some(32000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "moonshot-v1-128k".to_string(), name: "Moonshot V1 128K".to_string(), model_id: "moonshot-v1-128k".to_string(), model_type: "chat".to_string(), context_length: Some(128000), supports_vision: false, supports_function_calling: true },
        ]);
    }
    
    if api_base_lower.contains("zhipu") || api_base_lower.contains("bigmodel") {
        return Some(vec![
            FetchedModel { id: "glm-4".to_string(), name: "GLM-4".to_string(), model_id: "glm-4".to_string(), model_type: "chat".to_string(), context_length: Some(128000), supports_vision: true, supports_function_calling: true },
            FetchedModel { id: "glm-4v".to_string(), name: "GLM-4V".to_string(), model_id: "glm-4v".to_string(), model_type: "chat".to_string(), context_length: Some(4096), supports_vision: true, supports_function_calling: true },
            FetchedModel { id: "glm-3".to_string(), name: "GLM-3".to_string(), model_id: "glm-3".to_string(), model_type: "chat".to_string(), context_length: Some(128000), supports_vision: false, supports_function_calling: true },
        ]);
    }
    
    if api_base_lower.contains("deepseek") {
        return Some(vec![
            FetchedModel { id: "deepseek-chat".to_string(), name: "DeepSeek Chat".to_string(), model_id: "deepseek-chat".to_string(), model_type: "chat".to_string(), context_length: Some(64000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "deepseek-coder".to_string(), name: "DeepSeek Coder".to_string(), model_id: "deepseek-coder".to_string(), model_type: "chat".to_string(), context_length: Some(16384), supports_vision: false, supports_function_calling: true },
        ]);
    }
    
    if api_base_lower.contains("qwen") || api_base_lower.contains("aliyun") || api_base_lower.contains("dashscope") {
        return Some(vec![
            FetchedModel { id: "qwen-turbo".to_string(), name: "Qwen Turbo".to_string(), model_id: "qwen-turbo".to_string(), model_type: "chat".to_string(), context_length: Some(8000), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "qwen-plus".to_string(), name: "Qwen Plus".to_string(), model_id: "qwen-plus".to_string(), model_type: "chat".to_string(), context_length: Some(131072), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "qwen-max".to_string(), name: "Qwen Max".to_string(), model_id: "qwen-max".to_string(), model_type: "chat".to_string(), context_length: Some(131072), supports_vision: false, supports_function_calling: true },
            FetchedModel { id: "qwen-vl-max".to_string(), name: "Qwen VL Max".to_string(), model_id: "qwen-vl-max".to_string(), model_type: "chat".to_string(), context_length: Some(8000), supports_vision: true, supports_function_calling: true },
        ]);
    }
    
    None
}

#[tauri::command]
async fn fetch_provider_models(
    api_base: String,
    api_key: Option<String>,
) -> Result<Vec<FetchedModel>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/v1/models", api_base.trim_end_matches('/'));

    let mut request = client.get(&url);
    if let Some(key) = &api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request.send().await.map_err(|e: reqwest::Error| e.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        if let Some(fallback_models) = get_fallback_models(&api_base) {
            return Ok(fallback_models);
        }
        return Err("API returned status: 404 Not Found. This provider may not support model listing.".to_string());
    }

    if !response.status().is_success() {
        return Err(format!("API returned status: {}", response.status()));
    }

    let models_resp: ProviderModelsResponse = response
        .json()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    let models: Vec<FetchedModel> = models_resp
        .data
        .into_iter()
        .filter(|m| m.object == "model")
        .map(|m| {
            let name = m.id.clone();
            let parts: Vec<&str> = name.split('/').collect();
            let display_name = if parts.len() > 1 {
                parts[parts.len() - 1].to_string()
            } else {
                name.clone()
            };

            FetchedModel {
                id: m.id.clone(),
                name: display_name,
                model_id: m.id,
                model_type: "chat".to_string(),
                context_length: m.context_window,
                supports_vision: false,
                supports_function_calling: false,
            }
        })
        .collect();

    Ok(models)
}

#[tauri::command]
async fn save_provider_config(
    state: State<'_, AppState>,
    provider_config: ProviderConfig,
) -> Result<(), String> {
    state.secure_auth.save_provider_config(provider_config).await
}

#[tauri::command]
async fn get_provider_config(state: State<'_, AppState>) -> Result<ProviderConfig, String> {
    Ok(state.secure_auth.get_provider_config().await)
}

#[tauri::command]
async fn update_setup_step(
    state: State<'_, AppState>,
    step: String,
) -> Result<(), String> {
    state.secure_auth.update_setup_step(&step).await
}

#[tauri::command]
async fn get_setup_step(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.secure_auth.get_setup_step().await)
}

#[tauri::command]
async fn opencode_launch(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<String, String> {
    let instance = state.opencode_manager.launch(port).await?;
    Ok(instance.id)
}

#[tauri::command]
async fn opencode_check_installed() -> Result<bool, String> {
    Ok(OpenCodeManager::check_installed().await)
}

#[tauri::command]
async fn opencode_install() -> Result<(), String> {
    OpenCodeManager::install().await
}

#[tauri::command]
async fn opencode_stop(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    state.opencode_manager.stop(&instance_id).await
}

#[tauri::command]
async fn opencode_list_instances(
    state: State<'_, AppState>,
) -> Result<Vec<opencode_manager::OpenCodeInstance>, String> {
    Ok(state.opencode_manager.list_instances().await)
}

#[tauri::command]
async fn opencode_create_session(
    state: State<'_, AppState>,
    instance_id: String,
    project_path: String,
) -> Result<String, String> {
    state.opencode_manager.create_session(&instance_id, &project_path).await
}

#[tauri::command]
async fn opencode_send_message(
    state: State<'_, AppState>,
    instance_id: String,
    session_id: String,
    message: String,
) -> Result<String, String> {
    state.opencode_manager.send_message(&instance_id, &session_id, &message).await
}

#[tauri::command]
async fn worktree_create(
    state: State<'_, AppState>,
    task_id: String,
    repo_path: String,
    base_branch: Option<String>,
) -> Result<worktree_manager::WorktreeInfo, String> {
    state.worktree_manager.create(&task_id, &repo_path, base_branch.as_deref()).await
}

#[tauri::command]
async fn worktree_delete(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    state.worktree_manager.delete(&task_id).await
}

#[tauri::command]
async fn worktree_get(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Option<worktree_manager::WorktreeInfo>, String> {
    Ok(state.worktree_manager.get(&task_id).await)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct PlanStep {
    pub order: u32,
    pub description: String,
    pub agent_type: String,
    pub target_file: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WorkflowPlan {
    pub steps: Vec<PlanStep>,
    pub estimated_time: Option<String>,
    pub required_agents: Vec<String>,
}

#[tauri::command]
async fn workflow_start_planning(
    state: State<'_, AppState>,
    _task_id: String,
    task_title: String,
    task_description: String,
) -> Result<WorkflowPlan, String> {
    let session_id = state.prefrontal.create_session().await?;
    let planning_prompt = format!(
        "You are a task planner. Decompose the following task into clear, actionable steps.\n\nTask: {}\nDescription: {}\n\nRespond with a JSON plan containing:\n- steps: array of step objects with order (number), description (string), agent_type (string: 'opencode', 'executor', 'reviewer'), and optional target_file\n- estimated_time: string like '30 minutes'\n- required_agents: array of agent type strings\n\nOnly respond with valid JSON.",
        task_title, task_description
    );

    let response = state.prefrontal.process(&session_id, &planning_prompt).await
        .map_err(|e| format!("Planner error: {}", e))?;

    match serde_json::from_str::<WorkflowPlan>(&response) {
        Ok(plan) => Ok(plan),
        Err(_) => {
            Ok(WorkflowPlan {
                steps: vec![PlanStep {
                    order: 1,
                    description: format!("Execute: {}", task_title),
                    agent_type: "opencode".to_string(),
                    target_file: None,
                }],
                estimated_time: Some("1 hour".to_string()),
                required_agents: vec!["opencode".to_string()],
            })
        }
    }
}

#[tauri::command]
async fn approve_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    state.workflow_state.lock().await.approved_tasks.insert(task_id, true);
    Ok(())
}

#[tauri::command]
async fn reject_task(
    state: State<'_, AppState>,
    task_id: String,
    reason: String,
) -> Result<(), String> {
    state.workflow_state.lock().await.rejected_tasks.insert(task_id, reason);
    Ok(())
}

#[tauri::command]
async fn workflow_execute_step(
    state: State<'_, AppState>,
    _task_id: String,
    step: PlanStep,
) -> Result<String, String> {
    if step.agent_type == "opencode" {
        let instance = state.opencode_manager.launch(None).await?;
        let session_id = state.opencode_manager.create_session(&instance.id, "").await?;
        let response = state.opencode_manager.send_message(&instance.id, &session_id, &step.description).await?;
        Ok(response)
    } else {
        Err(format!("Unsupported agent type: {}", step.agent_type))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cortex_manager_initial_state() {
        let m = CortexManager::new();
        let status = m.status_json().await.unwrap();
        assert_eq!(status["status"], "stopped");
    }
}
