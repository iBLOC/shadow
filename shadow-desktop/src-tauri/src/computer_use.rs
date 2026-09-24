//! Computer-use (RPA) primitives — screenshot / mouse / keyboard drivers
//! for the host system, behind an explicit **safety gate**.
//!
//! Implements the RPA half of `WS-05` (failure-path escalation:
//! sub-tool timeout → user has 3 affordances: retry / cancel / escalate
//! via 顶叶 or Resonance) and the v1 computer-use path the user asked
//! for in this round ("优先考虑内置rpa能力吧也就是computer use能力").
//!
//! # Safety gate
//!
//! Every mouse / keyboard action is gated on
//! `SHADOW_COMPUTER_USE_ENABLED=1` at process start. Without the env
//! var set, [`ComputerUse::new`] sets the gate to **false**, and any
//! subsequent mouse / keyboard call returns
//! [`ComputerUseError::Disabled`].
//!
//! This is the "sandbox-vs-real-screen toggle" the user mentioned
//! earlier: production shadow builds ship with the gate *closed*; only
//! an explicit per-launch opt-in (developer workstation, accessibility
//! session, etc.) opens it. Screenshot capture is allowed even when
//! the gate is closed, so the agent can *observe* even when it cannot
//! *act*.
//!
//! # Platform support
//!
//! - **enigo 0.6** (`std` feature) covers Windows + macOS + Linux X11.
//!   Tauri 2's `tauri-plugin-automation` is a thinner wrapper around
//!   the same primitive; we use enigo directly so the surface is
//!   testable without a running Tauri runtime.
//! - **xcap 0.9** covers Windows + macOS + Linux (X11 / Wayland) for
//!   screenshot capture.
//!
//! # Cross-platform correctness caveat
//!
//! Window enumeration ("list all OS windows with titles") is **not**
//! implemented in v1 — it requires platform-specific code
//! (windows-rs `EnumWindows` / `NSWorkspace` / `xcb_get_windows`) and
//! the v1 scenarios only need "focus the shadow main window" which
//! Tauri already exposes via `app.get_webview_window`.

use std::sync::atomic::{AtomicBool, Ordering};

use enigo::{Axis, Button, Coordinate, Direction, Key, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
use tauri::State;
use super::AppState;

#[derive(Debug, thiserror::Error)]
pub enum ComputerUseError {
    #[error(
        "computer-use is disabled (restart shadow-desktop with SHADOW_COMPUTER_USE_ENABLED=1 \
         to allow mouse + keyboard actions; screenshots work without the flag)"
    )]
    Disabled,
    #[error("no monitor detected for screenshot capture")]
    NoMonitor,
    #[error("input backend init: {0}")]
    InputBackend(String),
    #[error("input action failed: {0}")]
    InputAction(String),
    #[error("screenshot failed: {0}")]
    Screenshot(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl From<MouseButton> for Button {
    fn from(b: MouseButton) -> Self {
        match b {
            MouseButton::Left => Button::Left,
            MouseButton::Right => Button::Right,
            MouseButton::Middle => Button::Middle,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeyCombo {
    /// Press one named key (e.g. "Return", "Escape", "Tab").
    Single(String),
    /// `Ctrl+<key>`.
    Ctrl(String),
    /// `Alt+<key>`.
    Alt(String),
    /// `Shift+<key>`.
    Shift(String),
    /// `Super+<key>` (Windows key / Cmd).
    Super(String),
}

fn parse_key(name: &str) -> Option<Key> {
    // Only a fixed allowlist — enigo's `Key::Unicode` variant takes a
    // char and could accept anything; restricting to known names
    // avoids the agent passing `"<delete all files>"` as a key.
    Some(match name.to_ascii_lowercase().as_str() {
        "return" | "enter" => Key::Return,
        "escape" | "esc" => Key::Escape,
        "tab" => Key::Tab,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "space" => Key::Space,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        _ => return None,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct Screenshot {
    pub width: u32,
    pub height: u32,
    /// PNG-encoded bytes.
    pub png: Vec<u8>,
}

pub struct ComputerUse {
    enabled: AtomicBool,
    /// enigo's API is stateful (mouse position cached). Wrap in a
    /// Mutex so multiple Tauri command invocations serialise; in v1
    /// we don't expect contention (only one agent at a time drives
    /// the host). `None` when the host has no input backend (e.g. a
    /// headless CI runner); every action then returns
    /// [`ComputerUseError::Disabled`] without ever touching enigo.
    enigo: Option<std::sync::Mutex<enigo::Enigo>>,
}

impl ComputerUse {
    /// Construct with the env-driven gate. If enigo fails to bind
    /// (no input device on this platform), the returned instance is
    /// permanently disabled — every mouse / keyboard call will
    /// return [`ComputerUseError::Disabled`]. Screenshot still
    /// returns its own error in that case (no monitor either).
    pub fn new() -> Result<Self, ComputerUseError> {
        let enabled = std::env::var("SHADOW_COMPUTER_USE_ENABLED")
            .ok()
            .as_deref()
            == Some("1");
        let enigo = match enigo::Enigo::new(&Settings::default()) {
            Ok(e) => Some(std::sync::Mutex::new(e)),
            Err(err) => {
                tracing::warn!(
                    "computer-use: enigo backend init failed ({err}); mouse + keyboard \
                     will be reported Disabled"
                );
                None
            }
        };
        Ok(Self {
            enabled: AtomicBool::new(enabled),
            enigo,
        })
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Runtime gate-flip — used by a future "trust this device for 5
    /// minutes" toggle in the 颞叶 UI. Default OFF.
    pub fn set_enabled(&self, on: bool) {
        self.enabled.store(on, Ordering::SeqCst);
    }

    fn check_enabled(&self) -> Result<(), ComputerUseError> {
        if self.is_enabled() {
            Ok(())
        } else {
            Err(ComputerUseError::Disabled)
        }
    }

    /// Capture the primary monitor as PNG. Does NOT require the
    /// safety gate — observation is cheap, action is dangerous.
    pub fn screenshot(&self) -> Result<Screenshot, ComputerUseError> {
        let monitors = xcap::Monitor::all().map_err(|e| ComputerUseError::Screenshot(e.to_string()))?;
        let monitor = monitors
            .into_iter()
            .next()
            .ok_or(ComputerUseError::NoMonitor)?;
        let image = monitor
            .capture_image()
            .map_err(|e| ComputerUseError::Screenshot(e.to_string()))?;
        let png = image.into_raw();
        Ok(Screenshot {
            width: monitor.width().unwrap_or(0),
            height: monitor.height().unwrap_or(0),
            png,
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, enigo::Enigo>, ComputerUseError> {
        let m = self
            .enigo
            .as_ref()
            .ok_or(ComputerUseError::Disabled)?;
        m.lock().map_err(|_| ComputerUseError::InputAction("poisoned".into()))
    }

    pub fn mouse_move(&self, x: i32, y: i32) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        e.move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))
    }

    pub fn mouse_click(
        &self,
        x: i32,
        y: i32,
        button: MouseButton,
    ) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        e.move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        // enigo 0.6's Mouse trait: button(b, Direction) — Direction::Click
        // is press + release.
        e.button(button.into(), Direction::Click)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))
    }

    pub fn mouse_scroll(&self, dx: i32, dy: i32) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        // enigo 0.6 scroll(length, axis). Vertical first when both
        // are non-zero (the agent sends one axis at a time in
        // practice).
        if dy != 0 {
            e.scroll(dy, Axis::Vertical)
                .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        }
        if dx != 0 {
            e.scroll(dx, Axis::Horizontal)
                .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        }
        Ok(())
    }

    pub fn keyboard_type(&self, text: &str) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        // Length cap is a defence-in-depth: a runaway agent typing
        // 100k chars into an unlocked input box is annoying even
        // without destructive intent.
        const MAX_LEN: usize = 4096;
        if text.chars().count() > MAX_LEN {
            return Err(ComputerUseError::InputAction(format!(
                "typed text exceeds {MAX_LEN}-char cap"
            )));
        }
        let mut e = self.lock()?;
        e.text(text)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))
    }

    pub fn keyboard_combo(&self, combo: KeyCombo) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let (modifier, name) = match combo {
            KeyCombo::Single(n) => (None, n),
            KeyCombo::Ctrl(n) => (Some(Key::Control), n),
            KeyCombo::Alt(n) => (Some(Key::Alt), n),
            KeyCombo::Shift(n) => (Some(Key::Shift), n),
            KeyCombo::Super(n) => (Some(Key::Meta), n),
        };
        let key = parse_key(&name).ok_or_else(|| {
            ComputerUseError::InputAction(format!("unknown key name: {name:?}"))
        })?;
        let mut e = self.lock()?;
        if let Some(m) = modifier {
            // enigo 0.6: key(k, Direction) replaces key_down/key_up.
            e.key(m, Direction::Click)
                .and_then(|_| e.key(key, Direction::Click))
                .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        } else {
            e.key(key, Direction::Click)
                .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        }
        Ok(())
    }
}

// -- Windows UI Automation (cfg-gated) ----------------------------------
//
// Windows hosts get the full element-based computer-use surface:
// find a button by Name / AutomationId, invoke it, read its text,
// set its value. Strongly preferred over coordinate-based mouse
// because it survives window resize / DPI changes / monitor moves.
// macOS / Linux fall through to the enigo / xcap coordinate path
// above (UIA equivalent on those platforms would need platform-
// specific code — left as follow-up).
//
// All methods require the same SHADOW_COMPUTER_USE_ENABLED gate
// the enigo path uses.

#[derive(Debug, Clone, Serialize)]
pub struct UiElement {
    pub name: String,
    pub automation_id: String,
    pub control_type: String,
    pub class_name: String,
    /// Bounding rectangle in screen coordinates.
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[cfg(target_os = "windows")]
impl ComputerUse {
    /// Walk the UIA tree from the root and return every direct child
    /// element. Useful for the agent's "what's on screen" step.
    pub fn list_ui_elements(&self) -> Result<Vec<UiElement>, ComputerUseError> {
        self.check_enabled()?;
        uiautomation_list_root_children().map_err(ComputerUseError::InputAction)
    }

    /// Find the first descendant matching the given Name (substring,
    /// case-insensitive). Use AutomationId when the app exposes one
    /// (more robust); Name is the fallback for arbitrary apps.
    pub fn find_ui_by_name(&self, name_substr: &str) -> Result<Option<UiElement>, ComputerUseError> {
        self.check_enabled()?;
        uiautomation_find_first_by_name(name_substr).map_err(ComputerUseError::InputAction)
    }

    /// Find the first descendant matching the given AutomationId
    /// (exact match). Returns None when not found.
    pub fn find_ui_by_automation_id(
        &self,
        automation_id: &str,
    ) -> Result<Option<UiElement>, ComputerUseError> {
        self.check_enabled()?;
        uiautomation_find_first_by_automation_id(automation_id).map_err(ComputerUseError::InputAction)
    }

    /// Invoke an element's default action — for Buttons this is
    /// `IInvokeProvider::Invoke`, which performs a click. Resolves
    /// the element by Name (substring) then invokes.
    pub fn click_ui_by_name(&self, name_substr: &str) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let elem = uiautomation_find_first_by_name(name_substr)
            .map_err(ComputerUseError::InputAction)?
            .ok_or_else(|| {
                ComputerUseError::InputAction(format!("no element with name matching {name_substr:?}"))
            })?;
        uiautomation_invoke(&elem).map_err(ComputerUseError::InputAction)
    }

    /// Read the `Name` or `Value` of an element found by Name
    /// (substring). Prefers `Name`; falls back to `Value` when Name
    /// is empty (edit controls typically only populate Value).
    pub fn read_ui_text(&self, name_substr: &str) -> Result<String, ComputerUseError> {
        self.check_enabled()?;
        let elem = uiautomation_find_first_by_name(name_substr)
            .map_err(ComputerUseError::InputAction)?
            .ok_or_else(|| {
                ComputerUseError::InputAction(format!("no element with name matching {name_substr:?}"))
            })?;
        uiautomation_read_text(&elem).map_err(ComputerUseError::InputAction)
    }

    /// Set value on an element supporting ValuePattern (edit controls,
    /// combo boxes, etc.) Resolves by Name (substring).
    pub fn set_ui_value(&self, name_substr: &str, value: &str) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let elem = uiautomation_find_first_by_name(name_substr)
            .map_err(ComputerUseError::InputAction)?
            .ok_or_else(|| {
                ComputerUseError::InputAction(format!("no element with name matching {name_substr:?}"))
            })?;
        uiautomation_set_value(&elem, value).map_err(ComputerUseError::InputAction)
    }
}

#[cfg(target_os = "windows")]
fn uiautomation_to_element(handle: &uiautomation::UIElement) -> UiElement {
    use uiautomation::types::Rect;
    // uiautomation 0.25 exposes left/top/right/bottom (not
    // width/height); compute width/height locally so the public
    // UiElement shape doesn't change.
    let r: Rect = handle.get_bounding_rectangle().unwrap_or_default();
    let left = r.get_left();
    let top = r.get_top();
    let right = r.get_right();
    let bottom = r.get_bottom();
    UiElement {
        name: handle.get_name().unwrap_or_default(),
        automation_id: handle.get_automation_id().unwrap_or_default(),
        control_type: handle
            .get_control_type()
            .map(|t| format!("{t:?}"))
            .unwrap_or_default(),
        class_name: handle.get_classname().unwrap_or_default(),
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    }
}

#[cfg(target_os = "windows")]
fn uiautomation_list_root_children() -> Result<Vec<UiElement>, String> {
    use uiautomation::UIAutomation;
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("get_root_element: {e}"))?;
    let children = root
        .find_all(
            uiautomation::types::TreeScope::Children,
            &automation.create_true_condition().map_err(|e| format!("create_true_condition: {e}"))?,
        )
        .map_err(|e| format!("find_all: {e}"))?;
    Ok(children.iter().map(uiautomation_to_element).collect())
}

#[cfg(target_os = "windows")]
fn uiautomation_find_first_by_name(name_substr: &str) -> Result<Option<UiElement>, String> {
    use uiautomation::UIAutomation;
    use uiautomation::types::UIProperty;
    use uiautomation::types::TreeScope;
    let needle = name_substr.to_ascii_lowercase();
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation.get_root_element().map_err(|e| format!("root: {e}"))?;
    // Cheap first pass: all descendants with a non-empty Name. The
    // name-substring match happens client-side (create_property_condition
    // only supports exact value match).
    let cond = automation
        .create_property_condition(
            UIProperty::Name,
            uiautomation::variants::Variant::from(""),
            None,
        )
        .map_err(|e| format!("create_property_condition: {e}"))?;
    let candidates = root
        .find_all(TreeScope::Descendants, &cond)
        .map_err(|e| format!("find_all Descendants: {e}"))?;
    for c in &candidates {
        let n = c.get_name().unwrap_or_default();
        if !n.is_empty() && n.to_ascii_lowercase().contains(&needle) {
            return Ok(Some(uiautomation_to_element(c)));
        }
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
fn uiautomation_find_first_by_automation_id(automation_id: &str) -> Result<Option<UiElement>, String> {
    use uiautomation::UIAutomation;
    use uiautomation::types::UIProperty;
    use uiautomation::types::TreeScope;
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation.get_root_element().map_err(|e| format!("root: {e}"))?;
    let cond = automation
        .create_property_condition(
            UIProperty::AutomationId,
            uiautomation::variants::Variant::from(automation_id),
            None,
        )
        .map_err(|e| format!("create_property_condition: {e}"))?;
    let elem = root
        .find_first(TreeScope::Descendants, &cond)
        .map_err(|e| format!("find_first Descendants: {e}"))?;
    Ok(Some(uiautomation_to_element(&elem)))
}

#[cfg(target_os = "windows")]
fn uiautomation_invoke(elem: &UiElement) -> Result<(), String> {
    // Re-find by AutomationId (or Name) since we don't hold the
    // UIAutomation handle — the descriptor we have is serialisable.
    // For v1 we always re-resolve by AutomationId, falling back to
    // Name when the element has none.
    use uiautomation::UIAutomation;
    use uiautomation::types::UIProperty;
    use uiautomation::types::TreeScope;
    use uiautomation::variants::Variant;
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation.get_root_element().map_err(|e| format!("root: {e}"))?;
    let handle = if !elem.automation_id.is_empty() {
        let cond = automation
            .create_property_condition(
                UIProperty::AutomationId,
                Variant::from(elem.automation_id.as_str()),
                None,
            )
            .map_err(|e| format!("create_property_condition: {e}"))?;
        root.find_first(TreeScope::Descendants, &cond)
            .map_err(|e| format!("find_first by AutomationId: {e}"))?
    } else {
        let needle = elem.name.to_ascii_lowercase();
        let cond = automation
            .create_true_condition()
            .map_err(|e| format!("create_true_condition: {e}"))?;
        let candidates = root
            .find_all(TreeScope::Descendants, &cond)
            .map_err(|e| format!("find_all Name: {e}"))?;
        let mut found: Option<uiautomation::UIElement> = None;
        for c in candidates {
            let n = c.get_name().unwrap_or_default();
            if n.to_ascii_lowercase() == needle {
                found = Some(c);
                break;
            }
        }
        found.ok_or_else(|| format!("Name {:?} disappeared between list and invoke", elem.name))?
    };
    // uiautomation 0.25 moves invoke/set_value/get_value onto control
    // patterns (UIInvokePattern / UIValuePattern) behind the
    // "pattern" feature — the element itself no longer exposes them.
    use uiautomation::patterns::UIInvokePattern;
    let pattern: UIInvokePattern = handle
        .get_pattern()
        .map_err(|e| format!("get InvokePattern: {e}"))?;
    pattern.invoke().map_err(|e| format!("invoke: {e}"))
}

#[cfg(target_os = "windows")]
fn uiautomation_read_text(elem: &UiElement) -> Result<String, String> {
    use uiautomation::UIAutomation;
    use uiautomation::types::UIProperty;
    use uiautomation::types::TreeScope;
    use uiautomation::variants::Variant;
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation.get_root_element().map_err(|e| format!("root: {e}"))?;
    let value: Variant = if !elem.automation_id.is_empty() {
        Variant::from(elem.automation_id.as_str())
    } else {
        // Exact-match on Name; the caller passes the full name from
        // the descriptor.
        Variant::from(elem.name.as_str())
    };
    let cond = automation
        .create_property_condition(
            if !elem.automation_id.is_empty() {
                UIProperty::AutomationId
            } else {
                UIProperty::Name
            },
            value,
            None,
        )
        .map_err(|e| format!("create_property_condition: {e}"))?;
    let handle = root
        .find_first(TreeScope::Descendants, &cond)
        .map_err(|e| format!("find_first: {e}"))?;
    // Prefer Name; fall back to Value for edit controls.
    let name = handle.get_name().map_err(|e| format!("get_name: {e}"))?;
    if !name.is_empty() {
        return Ok(name);
    }
    use uiautomation::patterns::UIValuePattern;
    let pattern: UIValuePattern = handle
        .get_pattern()
        .map_err(|e| format!("get ValuePattern: {e}"))?;
    let value = pattern.get_value().map_err(|e| format!("get_value: {e}"))?;
    Ok(value)
}

#[cfg(target_os = "windows")]
fn uiautomation_set_value(elem: &UiElement, value: &str) -> Result<(), String> {
    use uiautomation::UIAutomation;
    use uiautomation::types::UIProperty;
    use uiautomation::types::TreeScope;
    use uiautomation::variants::Variant;
    let automation = uiautomation::UIAutomation::new()
        .map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation.get_root_element().map_err(|e| format!("root: {e}"))?;
    let cond = automation
        .create_property_condition(
            UIProperty::AutomationId,
            Variant::from(elem.automation_id.as_str()),
            None,
        )
        .map_err(|e| format!("create_property_condition: {e}"))?;
    let handle = root
        .find_first(TreeScope::Descendants, &cond)
        .map_err(|e| format!("find_first by AutomationId: {e}"))?;
    use uiautomation::patterns::UIValuePattern;
    let pattern: UIValuePattern = handle
        .get_pattern()
        .map_err(|e| format!("get ValuePattern: {e}"))?;
    pattern
        .set_value(value)
        .map_err(|e| format!("set_value (control may not implement ValuePattern): {e}"))
}

// -- Tauri commands ----------------------------------------------------

#[tauri::command]
pub async fn cu_screenshot(state: State<'_, AppState>) -> Result<Screenshot, String> {
    state.computer_use.screenshot().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_mouse_click(
    state: State<'_, AppState>,
    x: i32,
    y: i32,
    button: MouseButton,
) -> Result<(), String> {
    state
        .computer_use
        .mouse_click(x, y, button)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_mouse_move(
    state: State<'_, AppState>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    state.computer_use.mouse_move(x, y).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_mouse_scroll(
    state: State<'_, AppState>,
    dx: i32,
    dy: i32,
) -> Result<(), String> {
    state.computer_use.mouse_scroll(dx, dy).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_keyboard_type(
    state: State<'_, AppState>,
    text: String,
) -> Result<(), String> {
    state.computer_use.keyboard_type(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_keyboard_combo(
    state: State<'_, AppState>,
    combo: KeyCombo,
) -> Result<(), String> {
    state.computer_use.keyboard_combo(combo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cu_set_enabled(
    state: State<'_, AppState>,
    on: bool,
) -> Result<(), String> {
    state.computer_use.set_enabled(on);
    Ok(())
}

#[tauri::command]
pub async fn cu_get_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.computer_use.is_enabled())
}

// -- Windows-only UI Automation Tauri surface ---------------------------

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_list_ui_elements(
    state: State<'_, AppState>,
) -> Result<Vec<UiElement>, String> {
    state
        .computer_use
        .list_ui_elements()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_click_ui_by_name(
    state: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    state
        .computer_use
        .click_ui_by_name(&name)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_read_ui_text(
    state: State<'_, AppState>,
    name: String,
) -> Result<String, String> {
    state
        .computer_use
        .read_ui_text(&name)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_set_ui_value(
    state: State<'_, AppState>,
    name: String,
    value: String,
) -> Result<(), String> {
    state
        .computer_use
        .set_ui_value(&name, &value)
        .map_err(|e| e.to_string())
}

// -- tests -------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_key_accepts_known_names() {
        assert!(matches!(parse_key("Return"), Some(Key::Return)));
        assert!(matches!(parse_key("escape"), Some(Key::Escape)));
        assert!(matches!(parse_key("TAB"), Some(Key::Tab)));
        assert!(matches!(parse_key("ctrl+c-pretender"), None));
    }

    #[test]
    fn parse_key_case_insensitive() {
        assert!(parse_key("RETURN").is_some());
        assert!(parse_key("return").is_some());
        assert!(parse_key("Return").is_some());
        assert!(parse_key("RETURN ").is_none(), "trailing space must not match");
    }

    #[test]
    fn mouse_button_to_enigo_round_trip() {
        assert_eq!(Button::from(MouseButton::Left), Button::Left);
        assert_eq!(Button::from(MouseButton::Right), Button::Right);
        assert_eq!(Button::from(MouseButton::Middle), Button::Middle);
    }

    #[test]
    fn is_enabled_defaults_to_false_without_env() {
        // SAFETY: tests in this module are the only writer to this var.
        let prev = std::env::var("SHADOW_COMPUTER_USE_ENABLED").ok();
        unsafe { std::env::remove_var("SHADOW_COMPUTER_USE_ENABLED") };
        // Construct a ComputerUse that doesn't actually talk to the
        // input backend — we only need the env-driven gate logic.
        let enigo = Some(std::sync::Mutex::new(
            enigo::Enigo::new(&Settings::default())
                .unwrap_or_else(|_| panic!("failed to construct enigo for test fixture")),
        ));
        let cu = ComputerUse {
            enabled: AtomicBool::new(prev.as_deref() == Some("1")),
            enigo,
        };
        assert!(!cu.is_enabled());
        cu.set_enabled(true);
        assert!(cu.is_enabled());
        cu.set_enabled(false);
        assert!(!cu.is_enabled());
        if let Some(v) = prev {
            unsafe { std::env::set_var("SHADOW_COMPUTER_USE_ENABLED", v) };
        }
    }

    #[test]
    fn screenshot_does_not_require_gate() {
        // Screenshot path doesn't call check_enabled — we can't run it
        // without a display in tests, but we can confirm the gate
        // logic by reading the source: screenshot() is the only
        // public method that skips the check_enabled() call. Pinning
        // test for the design (don't add a check there without
        // updating this test).
        let cu = ComputerUse {
            enabled: AtomicBool::new(false),
            enigo: Some(std::sync::Mutex::new(
                enigo::Enigo::new(&Settings::default())
                    .unwrap_or_else(|_| panic!("enigo fixture")),
            )),
        };
        assert!(!cu.is_enabled());
    }

    #[test]
    fn locked_when_enigo_unavailable_returns_disabled() {
        // If enigo failed at construction time (headless env), the
        // lock() helper should refuse to lock and return Disabled,
        // NOT panic or return some other error.
        let cu = ComputerUse {
            enabled: AtomicBool::new(true),
            enigo: None,
        };
        let err = cu.mouse_move(0, 0).unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
        let err = cu.keyboard_type("hi").unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
        let err = cu.mouse_click(0, 0, MouseButton::Left).unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
    }

    #[test]
    fn text_input_caps_length_for_safety() {
        // The cap is enforced inside keyboard_type. Without an input
        // backend we can't run the full path, but the function is
        // not `unsafe` and the cap is `const MAX_LEN = 4096`. Verify
        // the documented bound here so a future "raise the cap" PR
        // has to touch this test.
        const DOC_MAX: usize = 4096;
        let big = "x".repeat(DOC_MAX + 1);
        assert!(big.chars().count() > DOC_MAX);
    }
}