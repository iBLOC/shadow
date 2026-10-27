mod mdns;
mod video_source;
mod ws_client;
mod crypto;
mod model_store;
mod config_manager;
mod opencode_manager;
mod preview_window;
mod inline_preview;
mod result_manager;
mod feishu_mcp;
mod computer_use;
mod worktree_manager;
mod recording;
mod provider_manager;
mod global_keys;
mod logger;

use config_manager::{AppConfig, DatabaseConfig, ProviderConfig, SecureAuth};
use diencephalon::Thalamus;
use encephalon::{AcpEnvelope, AgentId, Encephalon};
use model_store::{EncryptedStorage, ModelProvider};
use opencode_manager::OpenCodeManager;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime, State, WindowEvent,
};
use encephalon::telencephalon::a2a::client::TelencephalonStreamEvent as Tse;
use worktree_manager::WorktreeManager;
use result_manager::{CommitInfo, ResultManager as ResultMgr, ResultManagerError};
use preview_window as preview;
use feishu_mcp::{FeishuMcp, FeishuOps, FeishuSheet, MockFeishu, OpenLarkFeishu};
use computer_use::{ComputerUse, Screenshot as CuScreenshot};
use ws_client::MtlsWebSocketClient;

struct AppState {
    encephalon: Arc<Encephalon>,
    thalamus: Arc<Thalamus>,
    ws_client: Arc<MtlsWebSocketClient>,
    model_storage: Arc<EncryptedStorage>,
    secure_auth: Arc<SecureAuth>,
    opencode_manager: Arc<OpenCodeManager>,
    worktree_manager: Arc<WorktreeManager>,
    result_manager: Arc<ResultMgr>,
    computer_use: Arc<ComputerUse>,
    feishu_mcp: Arc<FeishuMcp>,
    recording_store: Arc<recording::RecordingStore>,
    provider_manager: Arc<encephalon::providers::ProviderManager>,
    embedded_stack: Arc<encephalon::Embedded>,
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

    // Initialise the embedded encephalon in-process: thalamus
    // (间脑) + ACP bus + hippocampus (海马体) + the single neuron
    // inference instance (owned by telencephalon). The embedded
    // encephalon is the ONLY place shadow gets inference from — no
    // direct neuron dependency, no second runtime. Protocol note:
    // shadow ↔ encephalon is process-internal by design; A2A is the
    // encephalon's *external* agent protocol only.
    let stack = tauri::async_runtime::block_on(encephalon::Embedded::boot(
        // Fixed :8085 so loopback metadata reads (models list, health)
        // keep working; chat itself goes in-process via neuron_infer.
        encephalon::EmbeddedConfig { neuron_port: 8085 },
    ))
    .expect("boot embedded encephalon");
    let neuron_addr = stack.neuron_addr();
    tracing::info!("encephalon embedded; neuron at {neuron_addr}");
    let thalamus: Arc<diencephalon::Thalamus> = stack.thalamus().clone();
    // JDM editor (`/jdm-editor` page) calls `jdm_try_run_rule`
    // which delegates to `Thalamus::try_run_graph` — that builds
    // a fresh ZenRuleEngine per call (no global state needed on
    // the thalamus side). The thalamus hot path uses the
    // broadcaster (notify_tx) but not the JDM editor; we leave
    // the hot-path engine set to None here.
    let encephalon = stack.encephalon().clone();
    let embedded_stack = stack.clone();

    let app_state = AppState {
        encephalon: encephalon.clone(),
        thalamus: thalamus.clone(),
        ws_client: Arc::new(MtlsWebSocketClient::new()),
        model_storage: Arc::new(EncryptedStorage::new()),
        secure_auth: Arc::new(SecureAuth::new()),
        opencode_manager: Arc::new(OpenCodeManager::new()),
        worktree_manager: Arc::new(WorktreeManager::new()),
        result_manager: Arc::new(
            ResultMgr::with_default_base_dir()
                .unwrap_or_else(|_| ResultMgr::new(std::env::temp_dir().join("shadow-results"))),
        ),
        // Computer-use (RPA): mouse + keyboard + screenshot. Default
        // OFF; the env var SHADOW_COMPUTER_USE_ENABLED=1 must be set
        // by the user at launch time. If construction fails (no
        // input backend on this platform, build with `enigo`'s
        // Computer-use (RPA): mouse + keyboard + screenshot. gate
        // defaults OFF; the env var SHADOW_COMPUTER_USE_ENABLED=1
        // must be set by the user at launch time. `ComputerUse::new`
        // is infallible: if enigo can't bind on this platform
        // (headless CI runner), the instance is permanently disabled
        // — every mouse/keyboard call returns Disabled.
        computer_use: Arc::new(
            ComputerUse::new()
                .unwrap_or_else(|_| unreachable!("ComputerUse::new is infallible")),
        ),
        // Feishu MCP for the document-use surface (DOC-01..DOC-05). When
        // FEISHU_APP_ID + FEISHU_APP_SECRET are set we use the real
        // open-lark backend; otherwise we fall back to the in-memory
        // MockFeishu so the wiring stays usable (every tool call then
        // returns FeishuError::Disabled because FEISHU_ENABLED defaults
        // off without the env vars).
        feishu_mcp: Arc::new({
            let ops: Arc<dyn FeishuOps> = match std::env::var("FEISHU_APP_ID") {
                Ok(_) => match OpenLarkFeishu::from_env() {
                    Ok(c) => Arc::new(c) as Arc<dyn FeishuOps>,
                    Err(e) => {
                        tracing::warn!(
                            "FEISHU_APP_ID set but OpenLarkFeishu::from_env failed ({e}); \
                             falling back to MockFeishu — every tool call will \
                             return FeishuError::Api"
                        );
                        Arc::new(MockFeishu::default())
                    }
                },
                Err(_) => Arc::new(MockFeishu::default()),
            };
            FeishuMcp::new(ops)
        }),
        recording_store: Arc::new(recording::RecordingStore::new()),
        // Provider management (端脑): presets need only an API key; model
        // lists are fetched per provider and refreshed every 10 min.
        provider_manager: Arc::new(provider_manager::new_manager()),
        embedded_stack: embedded_stack.clone(),
        workflow_state: Arc::new(tokio::sync::Mutex::new(WorkflowState {
            approved_tasks: std::collections::HashMap::new(),
            rejected_tasks: std::collections::HashMap::new(),
        })),
    };

    // Global shortcuts (keyboard chords + Mi Bluetooth remote buttons):
    // one leaked instance is shared between the managed state and the
    // raw WH_KEYBOARD_LL callback, so gk_set_bindings updates are seen
    // by the hook immediately (same Arc<Inner> on both sides).
    let global_keys_state: &'static global_keys::GlobalKeysState =
        Box::leak(Box::new(global_keys::GlobalKeysState::new()));

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
        .manage(global_keys_state.clone())
        .setup(move |app| {
            if let Err(e) = setup_tray(app) {
                tracing::error!("Failed to setup tray: {}", e);
            }

            // Low-level keyboard hook for global shortcuts + Bluetooth
            // remote buttons (Windows). Runs after the AppHandle exists
            // so the hook thread can emit gk-trigger / gk-capture.
            global_keys::install(global_keys_state, app.handle().clone());

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

            // Periodic model refresh: every enabled provider's /models
            // endpoint is re-fetched every 10 minutes so the cached model
            // lists track what the provider actually serves.
            let refresh_manager = app
                .state::<AppState>()
                .provider_manager
                .clone();
            tauri::async_runtime::spawn(async move {
                refresh_manager
                    .start_refresh_loop(std::time::Duration::from_secs(10 * 60));
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_window,
            hide_window,
            minimize_window,
            // JDM editor dry-run + publish (registered here —
            // they were defined but never wired before).
            jdm_try_run_rule,
            jdm_register_rule,
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
            result_init,
            result_commit,
            result_history,
            recording_start,
            recording_stop,
            recording_status,
            recording_events,
            recording_list,
            recording_report,
            document_load,
            document_save,
            document_publish_feishu,
            document_set_feishu_enabled,
            document_feishu_enabled,
            preview::preview_open,
            preview::preview_close,
            inline_preview::inline_preview_open,
            inline_preview::inline_preview_set_bounds,
            inline_preview::inline_preview_close,
            inline_preview::inline_preview_fetch_markdown,
            computer_use::cu_screenshot,
            computer_use::cu_mouse_click,
            computer_use::cu_mouse_move,
            computer_use::cu_mouse_scroll,
            computer_use::cu_keyboard_type,
            computer_use::cu_keyboard_combo,
            computer_use::cu_set_enabled,
            computer_use::cu_get_enabled,
            #[cfg(target_os = "windows")]
            computer_use::cu_list_ui_elements,
            #[cfg(target_os = "windows")]
            computer_use::cu_click_ui_by_name,
            #[cfg(target_os = "windows")]
            computer_use::cu_read_ui_text,
            #[cfg(target_os = "windows")]
            computer_use::cu_set_ui_value,
            provider_manager::provider_presets,
            provider_manager::provider_list,
            provider_manager::provider_add_preset,
            provider_manager::provider_add_custom,
            provider_manager::provider_remove,
            provider_manager::provider_set_enabled,
            provider_manager::provider_set_api_key,
            provider_manager::provider_update_custom,
            provider_manager::provider_select_model,
            provider_manager::provider_refresh,
            provider_manager::provider_refresh_all,
            provider_manager::provider_preview_fetch,
            neuron_infer,
            global_keys::gk_set_bindings,
            global_keys::gk_start_capture,
            global_keys::gk_stop_capture,
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
/// Tauri command: dry-run a JDM graph against an input snapshot
/// without going through the hot path. The JDM editor page
/// (`src/pages/JdmEditorPage.tsx`) calls this with the
/// currently-edited graph (GoRules JDM JSON) + a sample input;
/// diencephalon (in-process in the Tauri shell) builds a fresh
/// `ZenRuleEngine`, evaluates, and returns the
/// `DecisionOutcome`. No global state is mutated.
///
/// Wire format:
/// `(graph: serde_json::Value, input: serde_json::Value)
///  -> Result<serde_json::Value, String>`
/// where the Ok value is the `DecisionOutcome` serialized. The
/// error string is a human-readable reason ("graph parse: …",
/// "evaluate: …", etc.).
#[tauri::command]
fn jdm_try_run_rule(
    graph: serde_json::Value,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    diencephalon::Thalamus::try_run_graph(graph, &input)
        .map(|o| serde_json::to_value(o).map_err(|e| e.to_string()))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn jdm_register_rule(
    state: tauri::State<'_, AppState>,
    rule_id: String,
    graph: serde_json::Value,
) -> Result<(), String> {
    // Publish: store the graph on the embedded thalamus. Hot path
    // picks it up next sensor event automatically.
    state.thalamus.register_rule(rule_id, graph)
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
    // state.prefrontal was removed when the cortex sidecar was
    // replaced by the embedded encephalon (commit be50b7f). Until the
    // planner is re-wired to the encephalon ACP bus, return a stub
    // plan derived from the task description so the workflow command
    // stays functional.
    let planning_prompt = format!(
        "You are a task planner. Decompose the following task into clear, actionable steps.\n\nTask: {}\nDescription: {}\n\nRespond with a JSON plan containing:\n- steps: array of step objects with order (number), description (string), agent_type (string: 'opencode', 'executor', 'reviewer'), and optional target_file\n- estimated_time: string like '30 minutes'\n- required_agents: array of agent type strings\n\nOnly respond with valid JSON.",
        task_title, task_description
    );
    let _ = planning_prompt;

    match serde_json::from_str::<WorkflowPlan>("") {
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

// -- WS-01..WS-04 result-management Tauri surface -------------------------

#[tauri::command]
async fn result_init(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
) -> Result<String, String> {
    state
        .result_manager
        .init(&task_id, &title)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn result_commit(
    state: State<'_, AppState>,
    task_id: String,
    message: String,
) -> Result<String, String> {
    state
        .result_manager
        .commit(&task_id, &message)
        .map(|oid| oid.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn result_history(
    state: State<'_, AppState>,
    task_id: String,
    limit: Option<usize>,
) -> Result<Vec<CommitInfo>, String> {
    state
        .result_manager
        .history(&task_id, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

// -- 记录模式 (Recording Mode, spec 2026-09-24-recording-mode-design) ----

#[tauri::command]
async fn recording_start(
    state: State<'_, AppState>,
    mode: recording::RecordingMode,
) -> Result<recording::RecordingSession, String> {
    let session = state.recording_store.start_session(mode);
    Ok(session)
}

#[tauri::command]
async fn recording_stop(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<recording::RecordingSession, String> {
    state
        .recording_store
        .stop_session(&session_id)
        .ok_or_else(|| format!("unknown session {session_id}"))
}

#[tauri::command]
async fn recording_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let session = state
        .recording_store
        .get_session(&session_id)
        .ok_or_else(|| format!("unknown session {session_id}"))?;
    let count = state.recording_store.event_count(&session_id);
    let elapsed = chrono::Utc::now().timestamp_millis() - session.wallclock_start_ms;
    Ok(serde_json::json!({
        "session": session,
        "elapsed_ms": elapsed,
        "event_count": count,
    }))
}

#[tauri::command]
async fn recording_events(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<recording::RecordingEvent>, String> {
    // Generate a synthetic event if enough time has passed since the
    // last one — keeps the event stream alive for dev/demo (real
    // audio pipeline replaces this in production).
    state.recording_store.tick_synthetic_events(&session_id);
    Ok(state.recording_store.events(&session_id))
}

/// In-process inference — the chat bridge's primary path. The
/// frontend sends the OpenAI-compatible request body; it is
/// dispatched straight into the embedded encephalon's neuron adapter
/// pipeline (no loopback HTTP, no CORS). Returns
/// `{ status, body }` where body is the raw OpenAI wire response.
#[tauri::command]
async fn neuron_infer(
    state: State<'_, AppState>,
    path: String,
    body: Vec<u8>,
) -> Result<serde_json::Value, String> {
    // Only adapter routes are reachable through this command.
    if path != "/v1/chat/completions" && path != "/v1/messages" {
        return Err(format!("route not allowed through in-process infer: {path}"));
    }
    let (status, bytes) = state.embedded_stack.infer(&path, body).await;
    let parsed: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or(serde_json::json!({
        "error": { "message": String::from_utf8_lossy(&bytes) }
    }));
    Ok(serde_json::json!({ "status": status, "body": parsed }))
}

#[tauri::command]
async fn recording_list(
    state: State<'_, AppState>,
) -> Result<Vec<recording::RecordingSession>, String> {
    Ok(state.recording_store.list_sessions())
}

#[tauri::command]
async fn recording_report(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<recording::SummaryReport, String> {
    // 会话结束后由 stop 隐式触发总结（v1 用拼接 stub；R4 换 LLM）。
    if let Some(existing) = state.recording_store.get_summary(&session_id) {
        return Ok(existing);
    }
    state
        .recording_store
        .summarize(&session_id, |events| {
            // v1 stub: 按时间拼接事件文本；person_ids 去重收集。
            let mut text = String::from("记录总结：\n");
            let mut ids = Vec::new();
            for e in events {
                text.push_str(&format!(
                    "- [{}s–{}s] {}\n",
                    e.start_rel_ms / 1000,
                    e.end_rel_ms / 1000,
                    e.content
                ));
                ids.extend(e.person_ids.iter().cloned());
            }
            ids.sort();
            ids.dedup();
            (text, ids)
        })
        .map_err(|e| e)
}

// -- WS-05 / DOC-01..DOC-05 document-use surface -------------------------
//
// DOC-01 mount UniverSheet and load the per-task workbook (xlsx bytes).
// DOC-02 debounced auto-save back to disk + local git commit.
// DOC-03 publish to Feishu with the full 5-tool orchestration.
// DOC-04 best-effort rollback on mid-publish failure.
// DOC-05 runtime toggle for the integration.

const DEFAULT_XLSX_NAME: &str = "summary.xlsx";

async fn read_task_xlsx(state: &AppState, task_id: &str) -> Result<Vec<u8>, String> {
    use std::path::PathBuf;
    let home = dirs::home_dir()
        .ok_or_else(|| "no $HOME".to_string())?;
    let path: PathBuf = home.join(".shadow").join("results").join(task_id).join(DEFAULT_XLSX_NAME);
    tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read {}: {e}", path.display()))
}

async fn write_task_xlsx(state: &AppState, task_id: &str, bytes: &[u8]) -> Result<(), String> {
    use std::path::PathBuf;
    let home = dirs::home_dir()
        .ok_or_else(|| "no $HOME".to_string())?;
    let dir: PathBuf = home.join(".shadow").join("results").join(task_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    let path = dir.join(DEFAULT_XLSX_NAME);
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| format!("write {}: {e}", path.display()))
}

#[tauri::command]
async fn document_load(state: State<'_, AppState>, task_id: String) -> Result<Vec<u8>, String> {
    read_task_xlsx(&state, &task_id).await
}

#[tauri::command]
async fn document_save(
    state: State<'_, AppState>,
    task_id: String,
    snapshot: Vec<u8>,
) -> Result<(), String> {
    write_task_xlsx(&state, &task_id, &snapshot).await?;
    // DOC-02: auto-commit each save to the local git history.
    state
        .result_manager
        .commit(&task_id, "edit: snapshot")
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Sheet contents as `Vec<Vec<String>>`. Each outer element is a
// sheet; each inner element is a row of stringified cells. Sent
// through the JSON shape the MCP `feishu_sheet_write` tool expects.
#[tauri::command]
async fn document_publish_feishu(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
    folder_token: Option<String>,
    sheets: Vec<Vec<Vec<String>>>,
) -> Result<FeishuSheet, String> {
    if state.feishu_mcp.is_enabled() == false {
        return Err("feishu disabled (FEISHU_ENABLED=0)".into());
    }
    // DOC-03 step 3 — create.
    let sheet = state
        .feishu_mcp
        .create_sheet(&title, folder_token.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    // DOC-03 step 4 — write each sheet.
    for (i, rows) in sheets.iter().enumerate() {
        let sheet_meta = sheet.sheets.get(i).cloned().unwrap_or_else(|| {
            feishu_mcp::FeishuSheetMeta {
                sheet_id: format!("sheet{}", i + 1),
                title: format!("Sheet{}", i + 1),
                row_count: rows.len() as i64,
                column_count: rows.iter().map(|r| r.len() as i64).max().unwrap_or(0),
            }
        });
        let range = format!("{}!A1:Z{}", sheet_meta.sheet_id, rows.len().max(1));
        if let Err(e) = state
            .feishu_mcp
            .write_sheet_values(&sheet.spreadsheet_token, &sheet_meta.sheet_id, &range, rows)
            .await
        {
            // DOC-04 — best-effort rollback.
            let _ = state.feishu_mcp.delete_sheet(&sheet.spreadsheet_token).await;
            return Err(format!("write_sheet_values sheet {i} failed: {e}; rolled back"));
        }
    }
    // DOC-03 step 5 — share with view perm (default target = the
    // user_email in OpenLarkFeishu, or the MockFeishu any-pass).
    // For the v1 cut we hard-code email+view; users can re-share
    // from the Feishu UI.
    let (member_email, perm) = ("shadow@shadow.local", "view");
    if let Err(e) = state
        .feishu_mcp
        .share_sheet(&sheet.spreadsheet_token, "email", member_email, perm)
        .await
    {
        let _ = state.feishu_mcp.delete_sheet(&sheet.spreadsheet_token).await;
        return Err(format!("share_sheet failed: {e}; rolled back"));
    }
    Ok(sheet)
}

// cu_set_enabled / cu_get_enabled live in computer_use.rs (registered
// as computer_use::cu_set_enabled / computer_use::cu_get_enabled in
// the invoke_handler). document_set_feishu_enabled is defined below
// alongside the other document_* commands.

#[tauri::command]
async fn document_set_feishu_enabled(
    state: State<'_, AppState>,
    on: bool,
) -> Result<(), String> {
    state.feishu_mcp.set_enabled(on);
    Ok(())
}

#[tauri::command]
async fn document_feishu_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.feishu_mcp.is_enabled())
}

#[cfg(test)]
mod tests {
    use super::*;

    // CortexManager was removed when the cortex sidecar was replaced by
    // the embedded encephalon (commit be50b7f). The old
    // test_cortex_manager_initial_state asserted the sidecar's stopped
    // state; the replacement contract is that AppState always carries a
    // live encephalon handle, asserted in the setup path.
}
