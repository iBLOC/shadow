// Global shortcut keys — keyboard chords + Bluetooth remote buttons.
//
// Shadow-Desktop accepts shortcut triggers from two device classes: the
// physical keyboard (chords like `Ctrl+Shift+R`) and a Bluetooth remote
// such as the Mi (米家) TV remote. Once the remote is paired in Windows
// "Bluetooth & devices" it enumerates as a HID keyboard and its buttons
// arrive as ordinary virtual-key events — media keys
// (VK_MEDIA_PLAY_PAUSE), browser keys, arrows, OK = Enter, 返回 = Escape,
// volume keys, and so on. A single Windows low-level keyboard hook
// (WH_KEYBOARD_LL) is therefore the one detection point for both
// sources: no per-device BLE stack, no window-focus requirement, and
// matched keys can be swallowed so binding e.g. VolumeUp does not also
// change the system volume.
//
// Wire format: chords are canonical strings
//   [Ctrl+][Shift+][Alt+][Meta+]<Key>
// where <Key> uses the DOM KeyboardEvent.code spelling (KeyR,
// MediaPlayPause, F5, Numpad1, ...). The frontend owns the binding UI
// and persistence (`shadow-shortcut-storage`) and pushes the active
// table via `gk_set_bindings`; this module owns global detection,
// suppression and delivery:
//   * `gk-trigger`  { action } — a bound chord was pressed anywhere
//   * `gk-capture`  { chord }  — the settings UI is recording a chord
//
// Injected input (enigo / computer-use) is ignored via LLKHF_INJECTED
// so RPA automation can never recurse into a shortcut trigger.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, RwLock, RwLockReadGuard, RwLockWriteGuard};
use tauri::{AppHandle, Emitter, State};

// ── Public surface (state + commands) ────────────────────────────────

/// One active binding pushed from the frontend settings UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalKeyBinding {
    pub action: String,
    pub chord: String,
}

#[derive(Debug, Clone, Serialize)]
struct TriggerEvent {
    action: String,
}

#[derive(Debug, Clone, Serialize)]
struct CaptureEvent {
    chord: String,
}

/// Shared detection state. The same `Arc` backs the Tauri-managed state
/// and the leaked instance the raw hook callback dereferences, so
/// binding updates pushed by `gk_set_bindings` are visible to the hook
/// immediately — no restart, no re-registration.
#[derive(Clone)]
pub struct GlobalKeysState {
    inner: Arc<Inner>,
}

struct Inner {
    /// chord → action id. Replaced wholesale by `gk_set_bindings`.
    bindings: RwLock<HashMap<String, String>>,
    /// True while the settings UI is recording a chord.
    capturing: AtomicBool,
    /// Currently-held modifier bits (MOD_CTRL | MOD_SHIFT | MOD_ALT |
    /// MOD_META). Tracked by the hook itself instead of GetAsyncKeyState
    /// because swallowed events never reach the system key-state table.
    modifiers: AtomicU32,
    /// vk whose keydown was swallowed and whose keyup must be swallowed
    /// too. While set, same-vk keydowns are auto-repeats of that hold
    /// (a remote button held down) and are suppressed without
    /// re-triggering — exactly one trigger per physical press.
    swallowing: Mutex<Option<u32>>,
    /// Diagnostics + unit-test observability.
    last_trigger: Mutex<Option<String>>,
    last_capture: Mutex<Option<String>>,
    trigger_count: AtomicUsize,
    app: OnceLock<AppHandle>,
}

impl Default for GlobalKeysState {
    fn default() -> Self {
        Self::new()
    }
}

impl GlobalKeysState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                bindings: RwLock::new(HashMap::new()),
                capturing: AtomicBool::new(false),
                modifiers: AtomicU32::new(0),
                swallowing: Mutex::new(None),
                last_trigger: Mutex::new(None),
                last_capture: Mutex::new(None),
                trigger_count: AtomicUsize::new(0),
                app: OnceLock::new(),
            }),
        }
    }

    /// Handle one key event from the LL hook. Returns `Some(1)` when
    /// the event must be swallowed (bound key, held key repeat, or
    /// capture in progress).
    fn on_key_event(&self, vk: u32, is_up: bool) -> Option<isize> {
        const SWALLOW: Option<isize> = Some(1);

        if let Some(bit) = modifier_bit(vk) {
            if is_up {
                self.inner.modifiers.fetch_and(!bit, Ordering::SeqCst);
            } else {
                self.inner.modifiers.fetch_or(bit, Ordering::SeqCst);
            }
            // During capture, modifier presses are recorded but hidden
            // from the system — the capture modal owns the keyboard.
            return if self.inner.capturing.load(Ordering::SeqCst) {
                SWALLOW
            } else {
                None
            };
        }

        if self.inner.capturing.load(Ordering::SeqCst) {
            if is_up {
                return SWALLOW; // hide the upstroke of the captured key
            }
            if let Some(code) = vk_to_code(vk) {
                let chord = chord_string(self.inner.modifiers.load(Ordering::SeqCst), code);
                self.emit_capture(&chord);
                return SWALLOW;
            }
            return None; // unnamed vk — let the system deal with it
        }

        if is_up {
            let mut swallowing = self.inner.swallowing.lock_ignore_poison();
            if *swallowing == Some(vk) {
                *swallowing = None;
                return SWALLOW; // match the swallowed downstroke
            }
            return None;
        }

        // Auto-repeat of a currently-held swallowed key: suppress
        // silently instead of re-triggering the action.
        if *self.inner.swallowing.lock_ignore_poison() == Some(vk) {
            return SWALLOW;
        }

        let code = vk_to_code(vk)?;
        let chord = chord_string(self.inner.modifiers.load(Ordering::SeqCst), code);
        let action = self
            .inner
            .bindings
            .read_ignore_poison()
            .get(&chord)
            .cloned();
        match action {
            Some(action) => {
                *self.inner.swallowing.lock_ignore_poison() = Some(vk);
                self.emit_trigger(&action);
                SWALLOW
            }
            None => None,
        }
    }

    fn emit_trigger(&self, action: &str) {
        *self.inner.last_trigger.lock_ignore_poison() = Some(action.to_string());
        self.inner.trigger_count.fetch_add(1, Ordering::SeqCst);
        if let Some(app) = self.inner.app.get() {
            if let Err(e) = app.emit("gk-trigger", TriggerEvent {
                action: action.to_string(),
            }) {
                tracing::warn!("global keys: trigger emit failed: {e}");
            }
        }
    }

    fn emit_capture(&self, chord: &str) {
        *self.inner.last_capture.lock_ignore_poison() = Some(chord.to_string());
        if let Some(app) = self.inner.app.get() {
            if let Err(e) = app.emit("gk-capture", CaptureEvent {
                chord: chord.to_string(),
            }) {
                tracing::warn!("global keys: capture emit failed: {e}");
            }
        }
    }

    // Diagnostics used by tests (and handy when debugging live hooks).

    #[cfg(test)]
    fn last_triggered(&self) -> Option<String> {
        self.inner.last_trigger.lock_ignore_poison().clone()
    }

    #[cfg(test)]
    fn last_captured(&self) -> Option<String> {
        self.inner.last_capture.lock_ignore_poison().clone()
    }

    #[cfg(test)]
    fn trigger_count(&self) -> usize {
        self.inner.trigger_count.load(Ordering::SeqCst)
    }
}

// Lock helpers: a panic inside the hook callback would silently kill
// global shortcuts for the rest of the session, so poisoned locks are
// drained and reused instead of unwrapped.

trait MutexLockIgnorePoison<T> {
    fn lock_ignore_poison(&self) -> MutexGuard<'_, T>;
}

trait RwLockIgnorePoison<T> {
    fn read_ignore_poison(&self) -> RwLockReadGuard<'_, T>;
    fn write_ignore_poison(&self) -> RwLockWriteGuard<'_, T>;
}

impl<T> MutexLockIgnorePoison<T> for Mutex<T> {
    fn lock_ignore_poison(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

impl<T> RwLockIgnorePoison<T> for RwLock<T> {
    fn read_ignore_poison(&self) -> RwLockReadGuard<'_, T> {
        self.read().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
    fn write_ignore_poison(&self) -> RwLockWriteGuard<'_, T> {
        self.write().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

// ── Hook installation ────────────────────────────────────────────────

static HOOK_STATE: OnceLock<&'static GlobalKeysState> = OnceLock::new();

/// Install the global key hook. Called once from `setup` with the
/// leaked state created in `run`; `app` is stored so the hook thread
/// can emit `gk-trigger` / `gk-capture`. On non-Windows platforms this
/// is a logged no-op (the commands still work; triggers never fire).
pub fn install(state: &'static GlobalKeysState, app: AppHandle) {
    let _ = state.inner.app.set(app);
    #[cfg(windows)]
    {
        let _ = HOOK_STATE.set(state);
        let spawned = std::thread::Builder::new()
            .name("global-keys-hook".into())
            .spawn(|| unsafe { hook_thread() });
        if let Err(e) = spawned {
            tracing::error!("global keys: failed to spawn hook thread: {e}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        tracing::warn!(
            "global keys: low-level keyboard hook is Windows-only; \
             shortcuts will not fire on this platform"
        );
    }
}

#[cfg(windows)]
unsafe fn hook_thread() {
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetMessageW, SetWindowsHookExW, MSG, WH_KEYBOARD_LL,
    };
    use windows::core::PCWSTR;

    // WH_KEYBOARD_LL runs in-process, so the exe module handle is the
    // standard (and, with a null thread id, the documented) choice.
    let hmodule = match GetModuleHandleW(PCWSTR::null()) {
        Ok(h) => h,
        Err(e) => {
            tracing::error!("global keys: GetModuleHandleW failed: {e}");
            return;
        }
    };
    let hinstance = windows::Win32::Foundation::HINSTANCE(hmodule.0);

    match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), Some(hinstance), 0) {
        Ok(_) => tracing::info!("global keys: WH_KEYBOARD_LL installed"),
        Err(e) => {
            tracing::error!("global keys: hook installation failed: {e}");
            return;
        }
    }

    // The hook callback is only invoked while this thread pumps messages.
    let mut msg = MSG::default();
    while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
}

#[cfg(windows)]
unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{CallNextHookEx, KBDLLHOOKSTRUCT};

    const LLKHF_UP_BITS: u32 = 0x80; // transition state (keyup)
    const LLKHF_INJECTED_BITS: u32 = 0x10;

    if code >= 0 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let is_up = kb.flags.0 & LLKHF_UP_BITS != 0;
        let injected = kb.flags.0 & LLKHF_INJECTED_BITS != 0;
        // Ignore enigo/computer-use injected events so RPA automation
        // cannot trigger (and be suppressed by) our own shortcuts.
        if !injected {
            if let Some(state) = HOOK_STATE.get() {
                if state.on_key_event(kb.vkCode, is_up).is_some() {
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

// ── Tauri commands ───────────────────────────────────────────────────

/// Replace the active chord → action table. Chords are validated so a
/// frontend bug can never install a hook entry the hook can't produce.
#[tauri::command]
pub fn gk_set_bindings(
    state: State<'_, GlobalKeysState>,
    bindings: Vec<GlobalKeyBinding>,
) -> Result<(), String> {
    let mut map = HashMap::new();
    for binding in bindings {
        if binding.action.is_empty() || binding.chord.is_empty() {
            continue; // cleared bindings arrive as empty chords
        }
        validate_chord(&binding.chord)?;
        if map.insert(binding.chord.clone(), binding.action).is_some() {
            return Err(format!("duplicate binding for {}", binding.chord));
        }
    }
    *state.inner.bindings.write_ignore_poison() = map;
    Ok(())
}

/// Begin chord recording: every key press (any window, any device) is
/// suppressed and reported as a `gk-capture` event until
/// `gk_stop_capture`.
#[tauri::command]
pub fn gk_start_capture(state: State<'_, GlobalKeysState>) -> Result<(), String> {
    state.inner.modifiers.store(0, Ordering::SeqCst);
    *state.inner.swallowing.lock_ignore_poison() = None;
    state.inner.capturing.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn gk_stop_capture(state: State<'_, GlobalKeysState>) -> Result<(), String> {
    state.inner.capturing.store(false, Ordering::SeqCst);
    Ok(())
}

// ── Chord primitives (cross-platform: shared by hook + tests) ────────

const MOD_CTRL: u32 = 1;
const MOD_SHIFT: u32 = 2;
const MOD_ALT: u32 = 4;
const MOD_META: u32 = 8;

/// Canonical modifier order, also the wire order of chord strings.
const MODIFIER_NAMES: [&str; 4] = ["Ctrl", "Shift", "Alt", "Meta"];

fn modifier_bit(vk: u32) -> Option<u32> {
    match vk {
        // VK_SHIFT / VK_LSHIFT / VK_RSHIFT
        0x10 | 0xA0 | 0xA1 => Some(MOD_SHIFT),
        // VK_CONTROL / VK_LCONTROL / VK_RCONTROL
        0x11 | 0xA2 | 0xA3 => Some(MOD_CTRL),
        // VK_MENU / VK_LMENU / VK_RMENU
        0x12 | 0xA4 | 0xA5 => Some(MOD_ALT),
        // VK_LWIN / VK_RWIN
        0x5B | 0x5C => Some(MOD_META),
        _ => None,
    }
}

fn chord_string(modifiers: u32, code: &str) -> String {
    let mut s = String::new();
    for (i, bit) in [MOD_CTRL, MOD_SHIFT, MOD_ALT, MOD_META]
        .iter()
        .enumerate()
    {
        if modifiers & bit != 0 {
            s.push_str(MODIFIER_NAMES[i]);
            s.push('+');
        }
    }
    s.push_str(code);
    s
}

const DIGIT_CODES: [&str; 10] = [
    "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8",
    "Digit9",
];
const KEY_CODES: [&str; 26] = [
    "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK",
    "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV",
    "KeyW", "KeyX", "KeyY", "KeyZ",
];
const FN_CODES: [&str; 24] = [
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14",
    "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
];
const NUMPAD_CODES: [&str; 10] = [
    "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7",
    "Numpad8", "Numpad9",
];

/// Map a Win32 virtual-key code to its DOM KeyboardEvent.code spelling.
/// The remote-relevant consumer pages (media / browser / launch keys,
/// 0xA6–0xB7) are what a paired Mi Bluetooth remote actually sends.
fn vk_to_code(vk: u32) -> Option<&'static str> {
    match vk {
        0x08 => Some("Backspace"),
        0x09 => Some("Tab"),
        0x0D => Some("Enter"),
        0x13 => Some("Pause"),
        0x14 => Some("CapsLock"),
        0x1B => Some("Escape"),
        0x20 => Some("Space"),
        0x21 => Some("PageUp"),
        0x22 => Some("PageDown"),
        0x23 => Some("End"),
        0x24 => Some("Home"),
        0x25 => Some("ArrowLeft"),
        0x26 => Some("ArrowUp"),
        0x27 => Some("ArrowRight"),
        0x28 => Some("ArrowDown"),
        0x2C => Some("PrintScreen"),
        0x2D => Some("Insert"),
        0x2E => Some("Delete"),
        0x30..=0x39 => Some(DIGIT_CODES[(vk - 0x30) as usize]),
        0x41..=0x5A => Some(KEY_CODES[(vk - 0x41) as usize]),
        0x60..=0x69 => Some(NUMPAD_CODES[(vk - 0x60) as usize]),
        0x6A => Some("NumpadMultiply"),
        0x6B => Some("NumpadAdd"),
        0x6D => Some("NumpadSubtract"),
        0x6E => Some("NumpadDecimal"),
        0x6F => Some("NumpadDivide"),
        0x70..=0x87 => Some(FN_CODES[(vk - 0x70) as usize]),
        0x90 => Some("NumLock"),
        0x91 => Some("ScrollLock"),
        0xA6 => Some("BrowserBack"),
        0xA7 => Some("BrowserForward"),
        0xA8 => Some("BrowserRefresh"),
        0xA9 => Some("BrowserStop"),
        0xAA => Some("BrowserSearch"),
        0xAB => Some("BrowserFavorites"),
        0xAC => Some("BrowserHome"),
        0xAD => Some("VolumeMute"),
        0xAE => Some("VolumeDown"),
        0xAF => Some("VolumeUp"),
        0xB0 => Some("MediaTrackNext"),
        0xB1 => Some("MediaTrackPrevious"),
        0xB2 => Some("MediaStop"),
        0xB3 => Some("MediaPlayPause"),
        0xB4 => Some("LaunchMail"),
        0xB5 => Some("LaunchMediaPlayer"),
        0xB6 => Some("LaunchApplication1"),
        0xB7 => Some("LaunchApplication2"),
        0xBA => Some("Semicolon"),
        0xBB => Some("Equal"),
        0xBC => Some("Comma"),
        0xBD => Some("Minus"),
        0xBE => Some("Period"),
        0xBF => Some("Slash"),
        0xC0 => Some("Backquote"),
        0xDB => Some("BracketLeft"),
        0xDC => Some("Backslash"),
        0xDD => Some("BracketRight"),
        0xDE => Some("Quote"),
        _ => None,
    }
}

/// Inverse check for `vk_to_code` — accepts every code the hook can
/// produce (and rejects everything else, e.g. "F25", "F05", "KeyA+" flags).
fn is_known_code(code: &str) -> bool {
    if let Some(rest) = code.strip_prefix("Key") {
        return rest.len() == 1 && rest.as_bytes()[0].is_ascii_uppercase();
    }
    if let Some(rest) = code.strip_prefix("Digit") {
        return rest.len() == 1 && rest.as_bytes()[0].is_ascii_digit();
    }
    if let Some(rest) = code.strip_prefix("Numpad") {
        return rest.len() == 1 && rest.as_bytes()[0].is_ascii_digit();
    }
    if let Some(rest) = code.strip_prefix("F") {
        return !rest.starts_with('0')
            && rest.parse::<u8>().is_ok_and(|n| (1..=24).contains(&n));
    }
    matches!(
        code,
        "Backspace"
            | "Tab"
            | "Enter"
            | "Pause"
            | "CapsLock"
            | "Escape"
            | "Space"
            | "PageUp"
            | "PageDown"
            | "End"
            | "Home"
            | "ArrowLeft"
            | "ArrowUp"
            | "ArrowRight"
            | "ArrowDown"
            | "PrintScreen"
            | "Insert"
            | "Delete"
            | "NumpadMultiply"
            | "NumpadAdd"
            | "NumpadSubtract"
            | "NumpadDecimal"
            | "NumpadDivide"
            | "NumLock"
            | "ScrollLock"
            | "BrowserBack"
            | "BrowserForward"
            | "BrowserRefresh"
            | "BrowserStop"
            | "BrowserSearch"
            | "BrowserFavorites"
            | "BrowserHome"
            | "VolumeMute"
            | "VolumeDown"
            | "VolumeUp"
            | "MediaTrackNext"
            | "MediaTrackPrevious"
            | "MediaStop"
            | "MediaPlayPause"
            | "LaunchMail"
            | "LaunchMediaPlayer"
            | "LaunchApplication1"
            | "LaunchApplication2"
            | "Semicolon"
            | "Equal"
            | "Comma"
            | "Minus"
            | "Period"
            | "Slash"
            | "Backquote"
            | "BracketLeft"
            | "BracketRight"
            | "Backslash"
            | "Quote"
    )
}

/// Validate a chord string pushed from the frontend. Chords are always
/// produced by this module's capture path, so the format is strict:
/// canonical modifier order, no duplicates, known base key. Bare typing
/// keys are accepted at this layer — the settings UI asks for explicit
/// confirmation before binding one, because a bare chord swallows that
/// key in every application (including the remote's OK button, Enter).
pub fn validate_chord(chord: &str) -> Result<(), String> {
    if chord.is_empty() {
        return Err("empty chord".into());
    }
    let (modifiers_head, base) = match chord.rsplit_once('+') {
        Some((head, base)) => (Some(head), base),
        None => (None, chord),
    };

    let mut bits = 0u32;
    let mut next_index = 0usize;
    if let Some(head) = modifiers_head {
        for part in head.split('+') {
            let idx = MODIFIER_NAMES
                .iter()
                .position(|m| *m == part)
                .ok_or_else(|| format!("unknown modifier {part:?}"))?;
            if idx < next_index {
                return Err(format!(
                    "modifiers must be in {} order",
                    MODIFIER_NAMES.join("+")
                ));
            }
            let bit = 1u32 << idx;
            if bits & bit != 0 {
                return Err(format!("duplicate modifier {part:?}"));
            }
            bits |= bit;
            next_index = idx + 1;
        }
    }

    if is_known_code(base) {
        Ok(())
    } else {
        Err(format!("unknown key {base:?}"))
    }
}

// ── Tests (pure logic — compiles and runs on every platform) ─────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vk_table_is_consistent_with_known_codes() {
        for vk in 0..=255u32 {
            if let Some(code) = vk_to_code(vk) {
                assert!(
                    is_known_code(code),
                    "vk {vk:#04x} maps to {code:?} which is_known_code rejects"
                );
            }
        }
    }

    #[test]
    fn media_and_chord_samples() {
        assert_eq!(vk_to_code(0xB3), Some("MediaPlayPause"));
        assert_eq!(vk_to_code(0xAE), Some("VolumeDown"));
        assert_eq!(vk_to_code(0x52), Some("KeyR"));
        assert_eq!(vk_to_code(0x26), Some("ArrowUp"));
        assert_eq!(vk_to_code(0x0D), Some("Enter"));
        assert_eq!(vk_to_code(0x01), None); // mouse, not keyboard
        assert!(is_known_code("F24"));
        assert!(!is_known_code("F25"));
        assert!(!is_known_code("F05"));
        assert!(!is_known_code("Keyr"));
        assert!(!is_known_code("MediaNonsense"));
        assert!(!is_known_code("Shift")); // modifiers are never base keys
    }

    #[test]
    fn chord_string_uses_canonical_modifier_order() {
        assert_eq!(chord_string(MOD_CTRL | MOD_SHIFT, "KeyR"), "Ctrl+Shift+KeyR");
        assert_eq!(chord_string(MOD_SHIFT | MOD_CTRL, "KeyR"), "Ctrl+Shift+KeyR");
        assert_eq!(chord_string(MOD_META, "Enter"), "Meta+Enter");
        assert_eq!(chord_string(0, "MediaPlayPause"), "MediaPlayPause");
    }

    #[test]
    fn validate_chord_accepts_canonical_and_rejects_junk() {
        assert!(validate_chord("Ctrl+Alt+Delete").is_ok());
        assert!(validate_chord("MediaPlayPause").is_ok());
        assert!(validate_chord("Shift+MediaPlayPause").is_ok());
        assert!(validate_chord("Ctrl+Shift+F5").is_ok());
        assert!(validate_chord("MediaPlayPause+Ctrl").is_err()); // modifier after base
        assert!(validate_chord("Ctrl+Ctrl+KeyR").is_err()); // duplicate
        assert!(validate_chord("Shift+Ctrl+KeyR").is_err()); // wrong order
        assert!(validate_chord("Hyper+KeyR").is_err()); // unknown modifier
        assert!(validate_chord("Ctrl+NotAKey").is_err()); // unknown base
        assert!(validate_chord("").is_err());
    }

    #[test]
    fn bound_key_triggers_once_per_press_and_swallows_repeats() {
        let state = GlobalKeysState::new();
        state
            .inner
            .bindings
            .write_ignore_poison()
            .insert("MediaPlayPause".into(), "recording.toggle".into());

        // First press: swallowed + triggered.
        assert_eq!(state.on_key_event(0xB3, false), Some(1));
        assert_eq!(state.last_triggered(), Some("recording.toggle".into()));
        assert_eq!(state.trigger_count(), 1);

        // Held-down auto-repeats: swallowed, NOT re-triggered (a remote
        // button held down fires exactly once).
        assert_eq!(state.on_key_event(0xB3, false), Some(1));
        assert_eq!(state.trigger_count(), 1);

        // Release: swallowed to match the downstroke.
        assert_eq!(state.on_key_event(0xB3, true), Some(1));

        // Second physical press triggers again.
        assert_eq!(state.on_key_event(0xB3, false), Some(1));
        assert_eq!(state.trigger_count(), 2);
    }

    #[test]
    fn unbound_key_passes_through_untouched() {
        let state = GlobalKeysState::new();
        assert_eq!(state.on_key_event(0x41, false), None); // KeyA down
        assert_eq!(state.on_key_event(0x41, true), None); // KeyA up
        assert_eq!(state.trigger_count(), 0);
    }

    #[test]
    fn modifier_chord_matches_and_modifiers_pass_through() {
        let state = GlobalKeysState::new();
        state
            .inner
            .bindings
            .write_ignore_poison()
            .insert("Ctrl+Shift+KeyR".into(), "nav.tasks".into());

        assert_eq!(state.on_key_event(0x11, false), None); // Ctrl down
        assert_eq!(state.on_key_event(0xA1, false), None); // RShift down
        assert_eq!(state.on_key_event(0x52, false), Some(1)); // R → bound
        assert_eq!(state.last_triggered(), Some("nav.tasks".into()));

        // With Ctrl alone held, R does not match the Ctrl+Shift chord.
        state.inner.modifiers.store(MOD_CTRL, Ordering::SeqCst);
        assert_eq!(state.on_key_event(0x52, false), None);
    }

    #[test]
    fn capture_mode_reports_chords_and_suppresses_everything() {
        let state = GlobalKeysState::new();
        state.inner.capturing.store(true, Ordering::SeqCst);

        // Modifier presses are hidden but tracked.
        assert_eq!(state.on_key_event(0x11, false), Some(1));
        // Base key: captured with the live modifier chord.
        assert_eq!(state.on_key_event(0x52, false), Some(1));
        assert_eq!(state.last_captured(), Some("Ctrl+KeyR".into()));
        // Matching upstroke swallowed too.
        assert_eq!(state.on_key_event(0x52, true), Some(1));
        // Modifiers never leak into the trigger path during capture.
        assert_eq!(state.trigger_count(), 0);
    }

    #[test]
    fn emit_without_app_handle_is_safe() {
        // No AppHandle installed (unit-test env): emits must be skipped,
        // not panic — the hook thread must survive headless environments.
        let state = GlobalKeysState::new();
        state.emit_trigger("window.toggle");
        state.emit_capture("MediaPlayPause");
        assert_eq!(state.trigger_count(), 1);
    }
}
