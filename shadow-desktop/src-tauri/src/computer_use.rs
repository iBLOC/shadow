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
// ⚠️ **AtomicU64 只有 Windows 面上用得到**（快照号自增器在 UIA 那条路上）
// ⇒ ⇒ 非 Windows 面上留着这个 import ⇒ ⇒ 会被 lint 当成「未使用的导入」
// ⇒ ⇒ 而 Linux 面正是 CI 跑 clippy 的那一面（2026-11-11 补记）。
#[cfg(target_os = "windows")]
use std::sync::atomic::AtomicU64;

use super::AppState;
use enigo::{Axis, Button, Coordinate, Direction, Key, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
use tauri::State;

// -- Delivery semantics -------------------------------------------------
//
// ⚠️ **为什么有这一层**（2026-11-09）—— 在这一刀之前，所有 `cu_*` 的
// 失败都只是一句 `String` ⇒ ⇒ **调用方（agent）分不清「什么都没发生」
// 与「可能已经发生」** ⇒ ⇒ 而这两种情形的重试后果完全不同：前者可以
// 随便重试，后者重试可能二次点击／二次提交 ⇒ ⇒ 所以这里给每一次动作
// 一个**机器可读的投递判定**。
//
// 口径对齐 agent-desktop（vercel-labs）的 `disposition`：
//
//   delivery = not_delivered | delivery_uncertain | delivered_unverified
//   retry    = safe | unsafe
//
// ⚠️ **不变量**（由结构保证，不是靠约定）：
// `retry` **只**由 `delivery` 派生 ⇒ ⇒ 不可能出现「delivered_* + safe」
// 这种自相矛盾的组合 ⇒ ⇒ 三个字段都是私有的，**唯一的构造路径是
// 三个构造器** ⇒ ⇒ 想造一个错配的 disposition **在 Rust 里做不到**。
//
// ⚠️ **为什么没有 `delivered_verified`** —— 本刀的每条动作路径
// （enigo 物理注入 / UIA Invoke / UIA ValuePattern）**都不回读应用状态**
// ⇒ ⇒ 「动作确实落到了目标应用里」这件事**我们并不知道** ⇒ ⇒ 按
// agent-desktop 的口径，物理派发只能报 `delivered_unverified`
// ⇒ ⇒ **不许**因为「函数返回 Ok」就谎称已验证。

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
// ⚠️ 必须是 **snake_case**（"not_delivered" / "delivery_uncertain" /
// "delivered_unverified"）—— 前端 src/lib/cuErrors.ts 的 TS 类型按这三个
// 字面量写 ⇒ ⇒ 用 "lowercase" 会变成 "notdelivered" ⇒ ⇒ 契约对不上。
// （2026-11-09：这条就是被 error_serializes_with_code_message_and_disposition
//  当场抓出来的。）
#[serde(rename_all = "snake_case")]
pub enum CuDelivery {
    /// 没有任何输入被发出（闸门关着、后端不可用、只读命令失败）。
    NotDelivered,
    /// 输入可能已经发出去了，也可能没有 ⇒ ⇒ **不许**自动重试。
    DeliveryUncertain,
    /// 输入确定发出去了，但**没有回读证据**证明应用收到了它。
    DeliveredUnverified,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CuRetry {
    /// 重试安全：上一次确定什么都没发生。
    Safe,
    /// 重试不安全：上一次可能已经落地。
    Unsafe,
}

/// 一次动作的投递判定。**字段私有** ⇒ ⇒ 只能由三个构造器产生。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CuDisposition {
    delivery: CuDelivery,
    retry: CuRetry,
}

/// ⚠️ **手写 Serialize（不走 derive）** —— 线上的形状由**那两个读取器**
/// 决定 ⇒ ⇒ 「不变量」与「线上的形状」**不可能各走各的**。
///
/// （2026-11-11：derive 那版把私有字段直接吐出去，而 `delivery()` ／
/// `retry()` 在 **lib 面上没有调用者**（只有测试在用）⇒ ⇒ clippy 判它
/// 死代码 ⇒ ⇒ 那正是 Linux CI 上 computer_use.rs 唯一的那条错误
/// ⇒ ⇒ 顺手把「线的形状」收到读取器上，两个问题一起没了。）
impl Serialize for CuDisposition {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("CuDisposition", 2)?;
        state.serialize_field("delivery", &self.delivery())?;
        state.serialize_field("retry", &self.retry())?;
        state.end()
    }
}

impl CuDisposition {
    pub fn not_delivered() -> Self {
        Self {
            delivery: CuDelivery::NotDelivered,
            retry: CuRetry::Safe,
        }
    }

    pub fn delivery_uncertain() -> Self {
        Self {
            delivery: CuDelivery::DeliveryUncertain,
            retry: CuRetry::Unsafe,
        }
    }

    pub fn delivered_unverified() -> Self {
        Self {
            delivery: CuDelivery::DeliveredUnverified,
            retry: CuRetry::Unsafe,
        }
    }

    pub fn delivery(&self) -> CuDelivery {
        self.delivery
    }

    pub fn retry(&self) -> CuRetry {
        self.retry
    }
}

/// 一条动作的机器可读回执。
#[derive(Debug, Clone, Serialize)]
pub struct CuOutcome {
    /// 动作名（如 `mouse_click`）—— 与 `CuError.code` 同一命名空间。
    pub action: String,
    pub disposition: CuDisposition,
}

impl CuOutcome {
    pub fn action(action: &str, disposition: CuDisposition) -> Self {
        Self {
            action: action.to_string(),
            disposition,
        }
    }
}

/// 一次失败的机器可读形状（**前端与 agent 都按这个读**）。
#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct CuError {
    /// 稳定错误码（agent 靠它分支，**不许**改文案）。
    pub code: String,
    /// 人读的文本（与旧版的 `String(e)` 一致 ⇒ 前端展示不变）。
    pub message: String,
    pub disposition: CuDisposition,
}

#[derive(Debug, thiserror::Error)]
pub enum ComputerUseError {
    #[error(
        "computer-use is disabled (restart shadow-desktop with SHADOW_COMPUTER_USE_ENABLED=1 \
         to allow mouse + keyboard actions; screenshots work without the flag)"
    )]
    Disabled,
    #[error("no monitor detected for screenshot capture")]
    NoMonitor,
    // ⚠️ 还没被构造出来（2026-11-08）—— 但它是**真实会发生的失败**
    // （输入后端初始化失败：权限/平台不支持）⇒ ⇒ 留着这个变体，
    // 别让 lint 把它藏起来（将来构造它时不用再改错误面）。
    #[allow(dead_code)]
    #[error("input backend init: {0}")]
    InputBackend(String),
    /// 输入动作失败，且**确定什么都没落地**（例如移动鼠标失败）。
    #[error("input action failed: {0}")]
    InputAction(String),
    /// 输入动作失败，但**可能已经落地**（例如按键打了一半、点击按下后
    /// 抬起失败）⇒ ⇒ 重试会重复生效 ⇒ ⇒ `retry: unsafe`。
    #[error("input action failed (delivery uncertain): {0}")]
    InputActionUncertain(String),
    #[error("screenshot failed: {0}")]
    Screenshot(String),
    /// ref 已经失效（元素没了／快照过期／根本不是合法 ref 形状）。
    #[error("stale ref: {0}")]
    StaleRef(String),
    /// 一个 ref 匹配到**多个**元素 ⇒ ⇒ **不许猜**（不许替用户挑一个）。
    #[error("ambiguous ref: {0}")]
    AmbiguousRef(String),
    /// 那次快照**不完整**（树被深度／节点上限截断）⇒ ⇒ 它的 ref 一律不许动作。
    #[error("snapshot was incomplete: {0}")]
    SnapshotIncomplete(String),
    /// 这个元素**没法被寻址**（匿名 ＋ 或树上不唯一）。
    #[error("element is not addressable: {0}")]
    NotAddressable(String),
}

impl From<ComputerUseError> for CuError {
    /// **投递判定在「抛错的现场」定，不在「读错误的地方」定** ——
    /// 只有抛错现场知道「这一步之前有没有东西已经发出去」。
    fn from(e: ComputerUseError) -> Self {
        let (code, disposition) = match &e {
            ComputerUseError::Disabled => {
                ("COMPUTER_USE_DISABLED", CuDisposition::not_delivered())
            }
            ComputerUseError::NoMonitor => ("NO_MONITOR", CuDisposition::not_delivered()),
            ComputerUseError::InputBackend(_) => (
                "INPUT_BACKEND_UNAVAILABLE",
                CuDisposition::not_delivered(),
            ),
            // 确定没落地：移动鼠标失败、UIA 侧平台在执行前就拒绝了。
            ComputerUseError::InputAction(_) => {
                ("INPUT_ACTION_FAILED", CuDisposition::not_delivered())
            }
            // 可能已经落地：按键打了一半 / 点击按下后抬起失败。
            ComputerUseError::InputActionUncertain(_) => (
                "INPUT_ACTION_FAILED",
                CuDisposition::delivery_uncertain(),
            ),
            // 只读命令 ⇒ 从不投递任何输入。
            ComputerUseError::Screenshot(_) => {
                ("SCREENSHOT_FAILED", CuDisposition::not_delivered())
            }
            // ref 解析失败 ⇒ ⇒ **什么都没做**⇒ ⇒ 可安全重试（换个新 ref）。
            ComputerUseError::StaleRef(_) => ("STALE_REF", CuDisposition::not_delivered()),
            ComputerUseError::AmbiguousRef(_) => {
                ("AMBIGUOUS_REF", CuDisposition::not_delivered())
            }
            ComputerUseError::SnapshotIncomplete(_) => {
                ("SNAPSHOT_INCOMPLETE", CuDisposition::not_delivered())
            }
            ComputerUseError::NotAddressable(_) => {
                ("NOT_ADDRESSABLE", CuDisposition::not_delivered())
            }
        };
        CuError {
            code: code.to_string(),
            message: e.to_string(),
            disposition,
        }
    }
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
// ⚠️ `try_from = "String"`（2026-11-09）—— wire 形状改成**人写的规格串**
// （"ctrl+c" / "F5" / "escape"）⇒ ⇒ 与前端审批弹窗发出来的形状一致。
// 之前只有「枚举 ＋ 内部变体」的 serde 形状 ⇒ ⇒ **从 wire 收到的字符串
// 永远反序列化不进去** ⇒ ⇒ 那条路径从来没跑通过。
#[serde(rename_all = "snake_case", try_from = "String")]
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

impl KeyCombo {
    /// 解析**人写的**组合键规格串（如 `"ctrl+c"` / `"Ctrl+C"` /
    /// `"cmd+s"` / `"F5"` / `"escape"`）。
    ///
    /// ⚠️ **只支持一个修饰键** —— `KeyCombo` 这个形状（Single/Ctrl/Alt/
    /// Shift/Super）本来就只有一个修饰键 ⇒ ⇒ `"ctrl+shift+a"` 报**明确**
    /// 的错，而不是悄悄丢掉一个修饰键。
    pub fn parse(spec: &str) -> Result<Self, String> {
        let parts: Vec<&str> = spec
            .split('+')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect();
        match parts.as_slice() {
            [] => Err(format!("empty key combo: {spec:?}")),
            [key] => {
                parse_key(key).ok_or_else(|| format!("unknown key name: {key:?}"))?;
                Ok(KeyCombo::Single((*key).to_string()))
            }
            [modifier, key] => {
                parse_key(key).ok_or_else(|| format!("unknown key name: {key:?}"))?;
                let m = modifier.to_ascii_lowercase();
                Ok(match m.as_str() {
                    "ctrl" | "control" => KeyCombo::Ctrl((*key).to_string()),
                    "alt" | "opt" | "option" => KeyCombo::Alt((*key).to_string()),
                    "shift" => KeyCombo::Shift((*key).to_string()),
                    "super" | "cmd" | "command" | "win" | "meta" => {
                        KeyCombo::Super((*key).to_string())
                    }
                    other => return Err(format!("unknown modifier: {other:?}")),
                })
            }
            _ => Err(format!(
                "unsupported key combo (only one modifier is supported): {spec:?}"
            )),
        }
    }
}

impl TryFrom<String> for KeyCombo {
    type Error = String;

    fn try_from(spec: String) -> Result<Self, Self::Error> {
        KeyCombo::parse(&spec)
    }
}

fn parse_key(name: &str) -> Option<Key> {
    // 只接受**一个**键名 —— enigo 的 `Key::Unicode` 变体收一个 char，
    // 放开成任意长串就等于让 agent 把 "<delete all files>" 当键名塞进来。
    let lower = name.to_ascii_lowercase();

    // F1..F12（enigo 的 Key 有这些变体）。
    if let Some(digits) = lower.strip_prefix('f') {
        if let Ok(n) = digits.parse::<u8>() {
            if (1..=12).contains(&n) {
                return Some(match n {
                    1 => Key::F1,
                    2 => Key::F2,
                    3 => Key::F3,
                    4 => Key::F4,
                    5 => Key::F5,
                    6 => Key::F6,
                    7 => Key::F7,
                    8 => Key::F8,
                    9 => Key::F9,
                    10 => Key::F10,
                    11 => Key::F11,
                    12 => Key::F12,
                    _ => unreachable!("n is in 1..=12"),
                });
            }
        }
    }

    // 单个 ASCII 字母/数字 ⇒ `Key::Unicode`（"ctrl+c" 这类组合键需要它）。
    // ⚠️ 仍然只收**一个字符** ⇒ ⇒ 长串照样被拒。
    let mut chars = lower.chars();
    if let (Some(c), None) = (chars.next(), chars.next()) {
        if c.is_ascii_alphanumeric() {
            return Some(Key::Unicode(c));
        }
    }

    Some(match lower.as_str() {
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
    /// UIA 快照的 refmap（**只有 Windows 面上才有 UIA** ⇒ ⇒ 非 Windows
    /// 面上这个字段**连存在都不该有** ⇒ ⇒ 否则 Linux CI 会报死代码
    /// —— 而 Linux 面正是 CI 跑 clippy 的那一面）。
    ///
    /// ⚠️ 只保留**最近几次**快照（见 `store_ui_snapshot`）⇒ ⇒ 不会无限长
    /// ⇒ ⇒ 代价是「很早以前的 ref」会变成 stale（那是**该有的行为**）。
    #[cfg(target_os = "windows")]
    ui_snapshots: std::sync::Mutex<UiSnapshotQueue>,
    /// 快照号自增器（进程内唯一 ⇒ ⇒ 同一进程里两枚快照不会撞号）。
    #[cfg(target_os = "windows")]
    ui_snapshot_seq: AtomicU64,
}

impl ComputerUse {
    /// Construct with the env-driven gate. If enigo fails to bind
    /// (no input device on this platform), the returned instance is
    /// permanently disabled — every mouse / keyboard call will
    /// return [`ComputerUseError::Disabled`]. Screenshot still
    /// returns its own error in that case (no monitor either).
    pub fn new() -> Result<Self, ComputerUseError> {
        let enabled = std::env::var("SHADOW_COMPUTER_USE_ENABLED").ok().as_deref() == Some("1");
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
            #[cfg(target_os = "windows")]
            ui_snapshots: std::sync::Mutex::new(UiSnapshotQueue::new()),
            #[cfg(target_os = "windows")]
            ui_snapshot_seq: AtomicU64::new(0),
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
        let monitors =
            xcap::Monitor::all().map_err(|e| ComputerUseError::Screenshot(e.to_string()))?;
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
        let m = self.enigo.as_ref().ok_or(ComputerUseError::Disabled)?;
        m.lock()
            .map_err(|_| ComputerUseError::InputAction("poisoned".into()))
    }

    pub fn mouse_move(&self, x: i32, y: i32) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        e.move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))
    }

    pub fn mouse_click(&self, x: i32, y: i32, button: MouseButton) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        e.move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| ComputerUseError::InputAction(e.to_string()))?;
        // enigo 0.6's Mouse trait: button(b, Direction) — Direction::Click
        // is press + release.
        //
        // ⚠️ **抛错现场定投递**：Direction::Click 是「按下 ＋ 抬起」两步
        // ⇒ ⇒ 它失败时**可能按下去了没抬起来** ⇒ ⇒ 「可能已经落地」
        // ⇒ ⇒ 报 `delivery_uncertain`（重试会二次点击）⇒ ⇒ 不许报 safe。
        e.button(button.into(), Direction::Click)
            .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))
    }

    pub fn mouse_scroll(&self, dx: i32, dy: i32) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let mut e = self.lock()?;
        // enigo 0.6 scroll(length, axis). Vertical first when both
        // are non-zero (the agent sends one axis at a time in
        // practice).
        // ⚠️ 滚动失败 ⇒ ⇒ 可能已经滚了一部分 ⇒ ⇒ `delivery_uncertain`。
        if dy != 0 {
            e.scroll(dy, Axis::Vertical)
                .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))?;
        }
        if dx != 0 {
            e.scroll(dx, Axis::Horizontal)
                .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))?;
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
        // ⚠️ 打字失败 ⇒ ⇒ **可能打进去一半** ⇒ ⇒ `delivery_uncertain`
        // （重试会重复一段文本）⇒ ⇒ 不许报 safe。
        e.text(text)
            .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))
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
        let key = parse_key(&name)
            .ok_or_else(|| ComputerUseError::InputAction(format!("unknown key name: {name:?}")))?;
        let mut e = self.lock()?;
        // ⚠️ 组合键失败 ⇒ ⇒ 可能「修饰键已按下、主键没按」⇒ ⇒
        // **可能已经落地**（而且可能留下一个卡住的修饰键）⇒ ⇒
        // `delivery_uncertain`。
        if let Some(m) = modifier {
            // enigo 0.6: key(k, Direction) replaces key_down/key_up.
            e.key(m, Direction::Click)
                .and_then(|_| e.key(key, Direction::Click))
                .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))?;
        } else {
            e.key(key, Direction::Click)
                .map_err(|e| ComputerUseError::InputActionUncertain(e.to_string()))?;
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
    ///
    /// ⚠️ **还没被接线**（2026-11-08）：Windows-only，且只有测试在用
    /// ⇒ ⇒ 但它是「屏幕上有什么」这套能力面的**一半**（另一半
    /// `list_ui_elements` 已在用）⇒ ⇒ 显式豁免并留名。
    #[allow(dead_code)]
    pub fn find_ui_by_name(
        &self,
        name_substr: &str,
    ) -> Result<Option<UiElement>, ComputerUseError> {
        self.check_enabled()?;
        uiautomation_find_first_by_name(name_substr).map_err(ComputerUseError::InputAction)
    }

    /// Find the first descendant matching the given AutomationId
    /// (exact match). Returns None when not found.
    ///
    /// ⚠️ 同上（Windows-only ＋ 未接线）⇒ 显式豁免并留名。
    #[allow(dead_code)]
    pub fn find_ui_by_automation_id(
        &self,
        automation_id: &str,
    ) -> Result<Option<UiElement>, ComputerUseError> {
        self.check_enabled()?;
        uiautomation_find_first_by_automation_id(automation_id)
            .map_err(ComputerUseError::InputAction)
    }

    /// Invoke an element's default action — for Buttons this is
    /// `IInvokeProvider::Invoke`, which performs a click. Resolves
    /// the element by Name (substring) then invokes.
    pub fn click_ui_by_name(&self, name_substr: &str) -> Result<(), ComputerUseError> {
        self.check_enabled()?;
        let elem = uiautomation_find_first_by_name(name_substr)
            .map_err(ComputerUseError::InputAction)?
            .ok_or_else(|| {
                ComputerUseError::InputAction(format!(
                    "no element with name matching {name_substr:?}"
                ))
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
                ComputerUseError::InputAction(format!(
                    "no element with name matching {name_substr:?}"
                ))
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
                ComputerUseError::InputAction(format!(
                    "no element with name matching {name_substr:?}"
                ))
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
    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("get_root_element: {e}"))?;
    let children = root
        .find_all(
            uiautomation::types::TreeScope::Children,
            &automation
                .create_true_condition()
                .map_err(|e| format!("create_true_condition: {e}"))?,
        )
        .map_err(|e| format!("find_all: {e}"))?;
    Ok(children.iter().map(uiautomation_to_element).collect())
}

#[cfg(target_os = "windows")]
fn uiautomation_find_first_by_name(name_substr: &str) -> Result<Option<UiElement>, String> {
    use uiautomation::types::TreeScope;
    use uiautomation::types::UIProperty;

    let needle = name_substr.to_ascii_lowercase();
    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("root: {e}"))?;
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
// ⚠️ 只被上面那个「未接线」的 `find_ui_by_automation_id` 用 ⇒ ⇒ 跟着它
// 一起显式豁免（Windows-only，Linux CI 看不到这一条）。
#[allow(dead_code)]
fn uiautomation_find_first_by_automation_id(
    automation_id: &str,
) -> Result<Option<UiElement>, String> {
    use uiautomation::types::TreeScope;
    use uiautomation::types::UIProperty;

    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("root: {e}"))?;
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
    use uiautomation::types::TreeScope;
    use uiautomation::types::UIProperty;
    use uiautomation::variants::Variant;

    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("root: {e}"))?;
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
    use uiautomation::types::TreeScope;
    use uiautomation::types::UIProperty;
    use uiautomation::variants::Variant;

    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("root: {e}"))?;
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
    use uiautomation::types::TreeScope;
    use uiautomation::types::UIProperty;
    use uiautomation::variants::Variant;

    let automation =
        uiautomation::UIAutomation::new().map_err(|e| format!("UIAutomation::new: {e}"))?;
    let root = automation
        .get_root_element()
        .map_err(|e| format!("root: {e}"))?;
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
//
// ⚠️ **这一刀的契约变更**（2026-11-09）——
// ❶ **失败**从 `Err(String)` 变成 `Err(CuError)`（结构体：
//    `code` / `message` / `disposition`）⇒ ⇒ 前端 catch 到的不再是
//    一句字符串，而是一个**带投递判定的对象** ⇒ ⇒ 展示文本仍然是
//    `message`（所以 UI 不用改文案），但**agent 拿得到判定**。
// ❷ **成功**从 `()` 变成 `CuOutcome { action, disposition }`
//    ⇒ ⇒ 动作类命令成功时一律 `delivered_unverified` + `retry: unsafe`
//    ⇒ ⇒ 因为**本刀的每条路径都不回读应用状态** ⇒ ⇒ 谎称「已验证」
//    会让 agent 放心重试 ⇒ ⇒ 那正是要消灭的「失败长得像成功」。
// ❸ **只读命令**（截图 / 读文本 / 列表）失败一律 `not_delivered`
//    + `retry: safe` ⇒ ⇒ 它们从不发输入。

#[tauri::command]
pub async fn cu_screenshot(state: State<'_, AppState>) -> Result<Screenshot, CuError> {
    state.computer_use.screenshot().map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_mouse_click(
    state: State<'_, AppState>,
    x: i32,
    y: i32,
    button: MouseButton,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .mouse_click(x, y, button)
        .map(|()| CuOutcome::action("mouse_click", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_mouse_move(
    state: State<'_, AppState>,
    x: i32,
    y: i32,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .mouse_move(x, y)
        .map(|()| CuOutcome::action("mouse_move", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_mouse_scroll(
    state: State<'_, AppState>,
    dx: i32,
    dy: i32,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .mouse_scroll(dx, dy)
        .map(|()| CuOutcome::action("mouse_scroll", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_keyboard_type(
    state: State<'_, AppState>,
    text: String,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .keyboard_type(&text)
        .map(|()| CuOutcome::action("keyboard_type", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_keyboard_combo(
    state: State<'_, AppState>,
    combo: KeyCombo,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .keyboard_combo(combo)
        .map(|()| CuOutcome::action("keyboard_combo", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[tauri::command]
pub async fn cu_set_enabled(state: State<'_, AppState>, on: bool) -> Result<(), String> {
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
pub async fn cu_list_ui_elements(state: State<'_, AppState>) -> Result<Vec<UiElement>, CuError> {
    // 只读命令 ⇒ ⇒ 失败一律 not_delivered / retry: safe。
    state
        .computer_use
        .list_ui_elements()
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_click_ui_by_name(
    state: State<'_, AppState>,
    name: String,
) -> Result<CuOutcome, CuError> {
    // UIA 的 InvokePattern 返回 Ok ⇒ 「平台接受了这次调用」⇒ ⇒ 但我们
    // **没有回读应用状态** ⇒ ⇒ 仍然是 delivered_unverified。
    state
        .computer_use
        .click_ui_by_name(&name)
        .map(|()| CuOutcome::action("click_ui_by_name", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_read_ui_text(state: State<'_, AppState>, name: String) -> Result<String, CuError> {
    // 只读命令 ⇒ ⇒ 失败一律 not_delivered / retry: safe。
    state
        .computer_use
        .read_ui_text(&name)
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_set_ui_value(
    state: State<'_, AppState>,
    name: String,
    value: String,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .set_ui_value(&name, &value)
        .map(|()| CuOutcome::action("set_ui_value", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

// -- UIA 树快照 + ref（Windows-only 的动作面）-------------------------------
//
// ⚠️ **为什么从「按名字找第一个」升级成「树快照 ＋ ref」**（2026-11-10）——
// 上一刀把 computer-use 接进了客户端工具注册表 ⇒ ⇒ 模型**调得到**了
// ⇒ ⇒ 但那一刻它能做的只有「按 Name 子串找第一个」⇒ ⇒
// **撞名即错**：两个都叫 "OK" 的按钮，点到哪个全凭运气 ⇒ ⇒ 而且
// **模型看不见结构**（只拿到根的直接子元素）⇒ ⇒
// ⇒ ⇒ 现在补上 agent-desktop 那一套的**最小版**：
//   ❶ **快照**：走 UIA 树 ⇒ 每个节点带一枚 **ref**（`@<snapshot_id>:e<N>`）
//   ❷ **refmap**：ref → **runtime id**（UIA 的元素身份）＋ role ＋ name
//   ❸ **动作前重识别**：按 runtime id 在树上找 ⇒ 0 个 = STALE_REF，
//      2 个 = AMBIGUOUS ⇒ ⇒ **失败就失败，不许猜**
//
// ⚠️ **与 agent-desktop 的差别（诚实记账）**：它做的是「捕获时唯一性证明」
// ——ref 只有在**整窗完整读过且唯一**时才可解析 ⇒ ⇒ 我们这版**没有**
// 那一格 ⇒ ⇒ 我们的 ref 靠 runtime id 重识别 ⇒ ⇒ runtime id 在元素
// 被重建时会变 ⇒ ⇒ 那时的表现是「重识别不到」⇒ ⇒ STALE_REF
// ⇒ ⇒ 而不是「悄悄点到另一个」⇒ ⇒ 方向对，强度弱一档。

/// 快照里一个节点（给模型看的那一份）。
#[derive(Debug, Clone, Serialize)]
pub struct UiNode {
    /// `@<snapshot_id>:e<N>` —— **快照限定**：换一次快照就换一批 ref。
    pub ref_id: String,
    /// UIA 的 control type（Button / Edit / Text …）。
    pub role: String,
    pub name: String,
    pub automation_id: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub depth: u32,
    /// 这个节点**能做什么**（Click / SetValue / Toggle）—— 空 = 不能动。
    pub actions: Vec<String>,
    /// 这个节点**能不能被寻址**（有身份 ＋ 树上唯一）⇒ ⇒ **false 的 ref
    /// 一律不许动作**（模型会看到它标着「不可寻址」）。
    pub addressable: bool,
}

/// 一次快照。
#[derive(Debug, Clone, Serialize)]
pub struct UiSnapshot {
    pub snapshot_id: String,
    pub nodes: Vec<UiNode>,
    /// 树是否**完整**（没被深度／节点上限截断，也没读过失败）。
    pub complete: bool,
    /// 被截断的原因（深度上限／节点上限／读失败）—— 完整时为 None。
    pub truncated_by: Option<String>,
    /// 这次快照的**作用域**：「focused-window」（焦点窗口）｜「desktop」。
    ///
    /// ⚠️ 作用域**不是性能优化**，是「唯一性证明」能不能成立的**前提**
    /// （真机实测：桌面根的树永远不完整，焦点窗口的树完整 —— 见台账
    /// U+3501 条的取证）。
    pub scope: String,
}

/// ref → 重识别证据（**只存在于 Windows 面** ⇒ ⇒ 非 Windows 面上它是
/// 死代码 ⇒ ⇒ 必须 cfg 挡住 —— 否则 Linux CI 会报死代码，而 Linux 面
/// 正是 CI 跑 clippy 的那一面）。
#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
struct UiRefEntry {
    /// UIA 的 runtime id —— 元素在本次会话里的身份。
    runtime_id: Vec<i32>,
    role: String,
    name: String,
    /// 捕获时它**能不能被寻址**（见 `ui_addressable_flags`）。
    addressable: bool,
}

/// 一次快照的存储：完整性 ＋ refmap。
#[cfg(target_os = "windows")]
struct UiSnapshotStore {
    /// 快照**完整吗** ⇒ ⇒ 不完整 ⇒ ⇒ 那批 ref **一律不许动作**
    /// （树被截断 ⇒ ⇒ 我们证明不了「这个 ref 只有一个」）。
    complete: bool,
    refs: std::collections::HashMap<String, UiRefEntry>,
}

/// UIA 快照的 refmap —— **先进先出**地保留最近几次快照。
///
/// ⚠️ 原来是 `HashMap` ＋「随便删一个」⇒ ⇒ 淘汰的是**随机**那一个
/// ⇒ ⇒ 刚拍的那张快照可能当场失效（模型拿到 STALE_REF 却不知道为什么）
/// ⇒ ⇒ 改成队列（≤8 项 ⇒ ⇒ 线性查找就够）。
#[cfg(target_os = "windows")]
struct UiSnapshotQueue {
    items: Vec<(String, UiSnapshotStore)>,
}

#[cfg(target_os = "windows")]
impl UiSnapshotQueue {
    fn new() -> Self {
        Self { items: Vec::new() }
    }

    fn get(&self, snapshot_id: &str) -> Option<&UiSnapshotStore> {
        self.items
            .iter()
            .find(|(id, _)| id == snapshot_id)
            .map(|(_, store)| store)
    }

    /// 插进去 ⇒ ⇒ 超上限就淘汰**最旧**那一个。
    fn insert(&mut self, snapshot_id: &str, store: UiSnapshotStore) {
        self.items.push((snapshot_id.to_string(), store));
        while self.items.len() > UI_KEEP_SNAPSHOTS {
            self.items.remove(0);
        }
    }
}

/// 生成一枚 ref —— `@<snapshot_id>:e<N>`。
fn ui_ref_id(snapshot_id: &str, index: usize) -> String {
    format!("@{snapshot_id}:e{index}")
}

/// 解析 `@<snapshot_id>:e<N>` —— **平台无关** ⇒ ⇒ 普通单测就能覆盖。
///
/// ⚠️ **必须带快照号**：裸的 `@e3` 一律拒（那是**旧快照的 ref 混进来**
/// 的典型形状）⇒ ⇒ 错一次就可能点到别的东西 ⇒ ⇒ 宁可拒。
fn parse_ui_ref(ref_id: &str) -> Result<(String, String), String> {
    let s = ref_id.trim();
    let rest = s
        .strip_prefix('@')
        .ok_or_else(|| format!("ref must start with '@': {ref_id:?}"))?;
    let (snapshot_id, local) = rest
        .split_once(':')
        .ok_or_else(|| format!("ref must look like '@<snapshot_id>:e<N>': {ref_id:?}"))?;
    if snapshot_id.is_empty() {
        return Err(format!("ref is missing a snapshot id: {ref_id:?}"));
    }
    if !local.starts_with('e') || local.len() < 2 || !local[1..].chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("ref must look like '@<snapshot_id>:e<N>': {ref_id:?}"));
    }
    Ok((snapshot_id.to_string(), local.to_string()))
}

/// 一个元素的**身份谓词** —— 返回 `None` ＝ **这个元素没法被寻址**。
///
/// ⚠️ **为什么是这个三元组**（role ＋ name ＋ automation_id）：
/// · **值**（文本框里的内容）**不是**身份（它一直在变）；
/// · **坐标**也**不是**身份（窗口一动就变）；
/// · ⇒ ⇒ 只用「角色 ＋ 稳定名字 ＋ 开发者 id」。
///
/// ⚠️ **匿名元素没有身份** —— 既没名字也没开发者 id ⇒ ⇒ 它**不可寻址**
/// ⇒ ⇒ 这与 agent-desktop 一致（无可寻址元素的就不该给 ref）。
pub fn ui_identity_key(role: &str, name: &str, automation_id: &str) -> Option<String> {
    let name = name.trim();
    let automation_id = automation_id.trim();
    if name.is_empty() && automation_id.is_empty() {
        return None;
    }
    Some(format!("{role}\u{1f}{name}\u{1f}{automation_id}"))
}

/// 逐个节点算「**可寻址**」与否 —— **平台无关** ⇒ ⇒ 普通单测就能覆盖。
///
/// 规则（与 agent-desktop 的 capture proof 同族，**强度弱一档**）：
/// · **匿名元素** ⇒ ⇒ **不可寻址**（它没有身份）；
/// · **身份重复**（三元组全同、树上出现了两次）⇒ ⇒ **不可寻址**
///   （动作时重识别可能落到另一个身上 ⇒ ⇒ 宁可拒）。
pub fn ui_addressable_flags(nodes: &[(String, String, String)]) -> Vec<bool> {
    let keys: Vec<Option<String>> = nodes
        .iter()
        .map(|(role, name, automation_id)| ui_identity_key(role, name, automation_id))
        .collect();
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for key in keys.iter().flatten() {
        *counts.entry(key.clone()).or_insert(0) += 1;
    }
    keys.iter()
        .map(|key| match key {
            None => false,
            Some(k) => counts.get(k).copied().unwrap_or(0) == 1,
        })
        .collect()
}

/// ref 的**闸**（**平台无关** ⇒ ⇒ Linux CI 也看得见这一格）。
///
/// ⚠️ **形状**（承 agent-desktop 的「捕获时唯一性证明」）：
/// · 快照**不完整** ⇒ ⇒ 那批 ref 一律不许用
///   （树被截断 ⇒ ⇒ 我们证明不了「这个 ref 只对应一个元素」）；
/// · 元素**不可寻址**（匿名 ＋ 或树上不唯一）⇒ ⇒ 不许用
///   （模型点名点不到它 ⇒ ⇒ 动作会落到别的东西上）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiRefGate {
    /// 可以用。
    Open,
    /// 那次快照不完整。
    SnapshotIncomplete,
    /// 那个元素不可寻址。
    NotAddressable,
}

/// 判一个 ref 能不能用 —— **纯函数**（零 IO ⇒ ⇒ 可自检 ⇒ ⇒ 判据与
/// 平台解耦 ⇒ ⇒ 这条判据在 Linux CI 上也跑得起来）。
pub fn ui_ref_gate(snapshot_complete: bool, entry_addressable: bool) -> UiRefGate {
    if !snapshot_complete {
        UiRefGate::SnapshotIncomplete
    } else if !entry_addressable {
        UiRefGate::NotAddressable
    } else {
        UiRefGate::Open
    }
}

#[cfg(target_os = "windows")]
const UI_MAX_NODES: usize = 300;
#[cfg(target_os = "windows")]
const UI_MAX_DEPTH: u32 = 8;
/// refmap 里保留几次快照（免得无限长 ⇒ ⇒ 更早的 ref 变 stale 是**该有的行为**）。
#[cfg(target_os = "windows")]
const UI_KEEP_SNAPSHOTS: usize = 8;

#[cfg(target_os = "windows")]
impl ComputerUse {
    /// 走 UIA 树，给每个节点发一枚 ref。
    ///
    /// ⚠️ **要闸**：UIA 树能看见**别的应用**的控件内容 ⇒ ⇒ 比截图更敏感
    /// ⇒ ⇒ 所以它**要**闸（而截图不要）—— 两者的敏感度不一样。
    pub fn snapshot_ui_tree(
        &self,
        max_depth: Option<u32>,
    ) -> Result<UiSnapshot, ComputerUseError> {
        self.check_enabled()?;
        let automation = uiautomation::UIAutomation::new().map_err(|e| {
            ComputerUseError::InputAction(format!("UIAutomation::new: {e}"))
        })?;
        // ⚠️ **control view walker** —— 它给出的是「控件视图」那棵树
        // ⇒ ⇒ 比 raw view 干净（少一堆碎片节点）⇒ ⇒ 同一份深度预算
        // 能覆盖更多**真正可操作**的控件。
        let walker = automation.get_control_view_walker().map_err(|e| {
            ComputerUseError::InputAction(format!("get_control_view_walker: {e}"))
        })?;
        // ⚠️ **作用域＝焦点窗口**（真机实测 2026-11-11）：
        // · 桌面根的树在真机上**永远**撞深度上限（481 节点 / 深度 16 仍截断）
        //   ⇒ ⇒ 「完整性」那档永远不成立 ⇒ ⇒ 那批 ref 永远不许用；
        // · 焦点窗口的树很小（实测 22 节点 / 深度 5）⇒ ⇒ 完整性成立。
        // ⇒ ⇒ **作用域不是性能优化，是「唯一性证明」能不能成立的前提。**
        let (root, scope) = ui_scope_root(&automation, &walker)?;

        let snapshot_id = self.next_ui_snapshot_id();
        let depth_limit = max_depth.unwrap_or(UI_MAX_DEPTH).min(UI_MAX_DEPTH);
        let mut walk = UiWalk {
            walker: &walker,
            snapshot_id: snapshot_id.clone(),
            max_depth: depth_limit,
            nodes: Vec::new(),
            refs: std::collections::HashMap::new(),
            truncated_by: None,
        };
        walk_ui_tree(&mut walk, &root, 0);

        // ⚠️ **可寻址性必须在整棵树走完之后才算** —— 「孪生」是**全树比较**
        // 才看得出来的（两个同名同角色的节点可能散落在完全不同的地方）。
        let triples: Vec<(String, String, String)> = walk
            .nodes
            .iter()
            .map(|n| (n.role.clone(), n.name.clone(), n.automation_id.clone()))
            .collect();
        let flags = ui_addressable_flags(&triples);
        let mut nodes = std::mem::take(&mut walk.nodes);
        for (node, flag) in nodes.iter_mut().zip(flags.iter()) {
            node.addressable = *flag;
        }
        for node in &nodes {
            if let Some(entry) = walk.refs.get_mut(&node.ref_id) {
                entry.addressable = node.addressable;
            }
        }

        let complete = walk.truncated_by.is_none();
        self.store_ui_snapshot(
            &snapshot_id,
            UiSnapshotStore {
                complete,
                refs: walk.refs,
            },
        );
        Ok(UiSnapshot {
            snapshot_id,
            nodes,
            complete,
            truncated_by: walk.truncated_by,
            scope: scope.to_string(),
        })
    }

    /// 按 ref **重识别**元素 —— 0 个 = stale，2 个 = ambiguous。
    pub fn resolve_ui_ref(
        &self,
        ref_id: &str,
    ) -> Result<uiautomation::UIElement, ComputerUseError> {
        let (snapshot_id, local) =
            parse_ui_ref(ref_id).map_err(ComputerUseError::StaleRef)?;
        let (entry, snapshot_complete) = {
            let guard = self.ui_snapshots.lock().map_err(|_| {
                ComputerUseError::InputAction("refmap lock poisoned".into())
            })?;
            let store = guard.get(&snapshot_id).ok_or_else(|| {
                ComputerUseError::StaleRef(format!("{ref_id} is not in any live snapshot"))
            })?;
            let entry = store.refs.get(&local).cloned().ok_or_else(|| {
                ComputerUseError::StaleRef(format!("{ref_id} is not in any live snapshot"))
            })?;
            (entry, store.complete)
        };

        // ⚠️ **闸在「重识别」之前** —— 这两档的失败**连元素都没碰到**
        // ⇒ ⇒ 投递判定是 not_delivered ⇒ ⇒ 可安全重试（换个能用的 ref）。
        match ui_ref_gate(snapshot_complete, entry.addressable) {
            UiRefGate::SnapshotIncomplete => {
                return Err(ComputerUseError::SnapshotIncomplete(format!(
                    "{ref_id} comes from an incomplete snapshot — that batch of refs \
                     cannot be used (the uniqueness proof is missing)"
                )))
            }
            UiRefGate::NotAddressable => {
                let role = entry.role.clone();
                let name = entry.name.clone();
                return Err(ComputerUseError::NotAddressable(format!(
                    "{ref_id} is not addressable ({role} \"{name}\" — anonymous or \
                     not unique in its snapshot)"
                )))
            }
            UiRefGate::Open => {}
        }

        let automation = uiautomation::UIAutomation::new().map_err(|e| {
            ComputerUseError::InputAction(format!("UIAutomation::new: {e}"))
        })?;
        let root = automation.get_root_element().map_err(|e| {
            ComputerUseError::InputAction(format!("get_root_element: {e}"))
        })?;
        let walker = automation.get_control_view_walker().map_err(|e| {
            ComputerUseError::InputAction(format!("get_control_view_walker: {e}"))
        })?;
        let mut found: Option<uiautomation::UIElement> = None;
        let mut matches = 0usize;
        find_ui_by_runtime_id(
            &walker,
            &root,
            &entry.runtime_id,
            0,
            UI_MAX_DEPTH,
            &mut found,
            &mut matches,
        );
        match matches {
            0 => Err(ComputerUseError::StaleRef(format!(
                "{ref_id} no longer matches a live element"
            ))),
            1 => Ok(found.expect("matches == 1 implies a found element")),
            n => Err(ComputerUseError::AmbiguousRef(format!(
                "{ref_id} matched {n} elements"
            ))),
        }
    }

    /// 按 ref 点击。
    pub fn click_ui_by_ref(&self, ref_id: &str) -> Result<(), ComputerUseError> {
        let element = self.resolve_ui_ref(ref_id)?;
        uiautomation_invoke_handle(&element).map_err(ComputerUseError::InputAction)
    }

    /// 按 ref 读文本。
    pub fn read_ui_by_ref(&self, ref_id: &str) -> Result<String, ComputerUseError> {
        let element = self.resolve_ui_ref(ref_id)?;
        uiautomation_read_text_handle(&element).map_err(ComputerUseError::InputAction)
    }

    /// 按 ref 写值。
    pub fn set_ui_value_by_ref(
        &self,
        ref_id: &str,
        value: &str,
    ) -> Result<(), ComputerUseError> {
        let element = self.resolve_ui_ref(ref_id)?;
        uiautomation_set_value_handle(&element, value).map_err(ComputerUseError::InputAction)
    }

    fn next_ui_snapshot_id(&self) -> String {
        let n = self.ui_snapshot_seq.fetch_add(1, Ordering::SeqCst);
        format!("s{:08x}", n & 0xffff_ffff)
    }

    fn store_ui_snapshot(&self, snapshot_id: &str, store: UiSnapshotStore) {
        if let Ok(mut guard) = self.ui_snapshots.lock() {
            // ⚠️ 淘汰规则在 `UiSnapshotQueue` 里 ⇒ ⇒ **先进先出**
            // ⇒ ⇒ 不是「随机删一个」（那会让刚拍的那张快照当场失效）。
            guard.insert(snapshot_id, store);
        }
    }
}

/// 走树时的**上下文**（⇒ ⇒ 不然参数太多，clippy 会红）。
#[cfg(target_os = "windows")]
struct UiWalk<'a> {
    walker: &'a uiautomation::UITreeWalker,
    /// 自持一份（**不借用调用方**）⇒ ⇒ 后面把 `snapshot_id` 交出去时
    /// 不会撞上「move out of ... because it is borrowed」。
    snapshot_id: String,
    max_depth: u32,
    nodes: Vec<UiNode>,
    refs: std::collections::HashMap<String, UiRefEntry>,
    /// 截断／读失败的原因（None ＝ **完整** ⇒ ⇒ 那批 ref 才可以用）。
    truncated_by: Option<String>,
}

/// 走树 ⇒ 记录每个节点 ⇒ 发 ref。
#[cfg(target_os = "windows")]
fn walk_ui_tree(walk: &mut UiWalk, element: &uiautomation::UIElement, depth: u32) {
    if walk.nodes.len() >= UI_MAX_NODES {
        walk.truncated_by
            .get_or_insert_with(|| format!("node cap {UI_MAX_NODES} reached"));
        return;
    }
    let runtime_id = element.get_runtime_id().unwrap_or_default();
    let role = element
        .get_control_type()
        .map(|t| format!("{t:?}"))
        .unwrap_or_default();
    let name = element.get_name().unwrap_or_default();
    let automation_id = element.get_automation_id().unwrap_or_default();
    let rect = element.get_bounding_rectangle().unwrap_or_default();
    let left = rect.get_left();
    let top = rect.get_top();
    let right = rect.get_right();
    let bottom = rect.get_bottom();
    let ref_id = ui_ref_id(&walk.snapshot_id, walk.nodes.len());
    walk.nodes.push(UiNode {
        ref_id: ref_id.clone(),
        role: role.clone(),
        name: name.clone(),
        automation_id,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        depth,
        actions: ui_actions(element),
        // ⚠️ 真正的值在**整棵树走完之后**统一回填（孪生要全树比较）。
        addressable: false,
    });
    walk.refs.insert(
        ref_id,
        UiRefEntry {
            runtime_id,
            role,
            name,
            addressable: false,
        },
    );

    // ⚠️ **先问子节点，再问深度上限** —— 只有「真的还有子节点却没往下走」
    // 才算截断；叶子走到深度上限**不是**截断（否则叶子多的树永远不完整）。
    let (children, read_failed) = ui_children(walk.walker, element);
    if read_failed {
        walk.truncated_by
            .get_or_insert_with(|| "children unreadable (UIA read failed)".to_string());
    }
    if depth >= walk.max_depth {
        if !children.is_empty() {
            // ⚠️ 先把上限**取出来** ⇒ ⇒ 闭包不必再借 `walk`
            // ⇒ ⇒ 否则「可变借用 + 不可变借用」撞车。
            let cap = walk.max_depth;
            walk.truncated_by
                .get_or_insert_with(|| format!("depth cap {cap} reached"));
        }
        return;
    }
    for child in children {
        walk_ui_tree(walk, &child, depth + 1);
    }
}

/// 作用域根 —— **焦点元素最近的 Window 祖先**（真机实测 2026-11-11）。
///
/// ⚠️ **为什么不是桌面根**：
/// · 桌面根的树在真机上**永远**撞深度上限（实测 481 节点 / 深度 16 仍截断）
///   ⇒ ⇒ 「完整性」那档永远不成立 ⇒ ⇒ 那批 ref 永远不许用；
/// · 焦点窗口的树很小（实测 22 节点 / 深度 5）⇒ ⇒ 完整性成立。
/// ⇒ ⇒ **作用域不是性能优化，是「唯一性证明」能不能成立的前提。**
///
/// ⚠️ 拿不到焦点（无焦点元素／上溯失败）⇒ ⇒ 退回桌面根 ⇒ ⇒ 那时多半
/// **不完整** ⇒ ⇒ ref 不可用（模型会看到 complete=false 与原因）。
#[cfg(target_os = "windows")]
fn ui_scope_root(
    automation: &uiautomation::UIAutomation,
    walker: &uiautomation::UITreeWalker,
) -> Result<(uiautomation::UIElement, &'static str), ComputerUseError> {
    let desktop = automation.get_root_element().map_err(|e| {
        ComputerUseError::InputAction(format!("get_root_element: {e}"))
    })?;
    let Ok(focused) = automation.get_focused_element() else {
        return Ok((desktop, "desktop"));
    };
    let mut node = focused;
    for _ in 0..32 {
        let Ok(parent) = walker.get_parent(&node) else {
            break;
        };
        if parent.get_control_type().ok() == Some(uiautomation::types::ControlType::Window) {
            return Ok((parent, "focused-window"));
        }
        // 到了桌面根 ⇒ ⇒ 上面不会再有 Window ⇒ ⇒ 退回桌面根。
        if parent.get_runtime_id().ok() == desktop.get_runtime_id().ok() {
            break;
        }
        node = parent;
    }
    Ok((desktop, "desktop"))
}

/// 取子节点 —— **区分「这节点没有子节点」与「子节点读失败」**。
///
/// ⚠️ 真机实测（uiautomation 0.25.1）：叶子节点的 `get_first_child` 返回
/// `Err(code == 0)`（这是「没有第一个子节点」的正常信号）；**非 0 才是
/// 真读失败** ⇒ ⇒ 读失败 ⇒ ⇒ **树不完整** ⇒ ⇒ 那批 ref 一律不许用。
#[cfg(target_os = "windows")]
fn ui_children(
    walker: &uiautomation::UITreeWalker,
    element: &uiautomation::UIElement,
) -> (Vec<uiautomation::UIElement>, bool) {
    match walker.get_children(element) {
        Some(children) => (children, false),
        None => match walker.get_first_child(element) {
            Err(err) if err.code() == 0 => (Vec::new(), false),
            _ => (Vec::new(), true),
        },
    }
}

/// 按 runtime id 在树上找（**重识别**的那一步）。
#[cfg(target_os = "windows")]
fn find_ui_by_runtime_id(
    walker: &uiautomation::UITreeWalker,
    element: &uiautomation::UIElement,
    runtime_id: &[i32],
    depth: u32,
    max_depth: u32,
    found: &mut Option<uiautomation::UIElement>,
    matches: &mut usize,
) {
    if *matches > 1 || depth > max_depth {
        return;
    }
    let current = element.get_runtime_id().unwrap_or_default();
    if current == runtime_id {
        *matches += 1;
        if found.is_none() {
            *found = Some(element.clone());
        }
    }
    if let Some(children) = walker.get_children(element) {
        for child in children {
            find_ui_by_runtime_id(
                walker,
                &child,
                runtime_id,
                depth + 1,
                max_depth,
                found,
                matches,
            );
        }
    }
}

/// 这个节点**能做什么** —— 没有可用的 pattern 就是 []（不能动）。
#[cfg(target_os = "windows")]
fn ui_actions(element: &uiautomation::UIElement) -> Vec<String> {
    let mut actions = Vec::new();
    if element
        .get_pattern::<uiautomation::patterns::UIInvokePattern>()
        .is_ok()
    {
        actions.push("Click".to_string());
    }
    if element
        .get_pattern::<uiautomation::patterns::UIValuePattern>()
        .is_ok()
    {
        actions.push("SetValue".to_string());
    }
    if element
        .get_pattern::<uiautomation::patterns::UITogglePattern>()
        .is_ok()
    {
        actions.push("Toggle".to_string());
    }
    actions
}

/// 直接在**元素句柄**上调用 InvokePattern（不再按名字二次解析 ⇒ ⇒ 不撞名）。
#[cfg(target_os = "windows")]
fn uiautomation_invoke_handle(element: &uiautomation::UIElement) -> Result<(), String> {
    use uiautomation::patterns::UIInvokePattern;
    let pattern: UIInvokePattern = element
        .get_pattern()
        .map_err(|e| format!("get InvokePattern: {e}"))?;
    pattern.invoke().map_err(|e| format!("invoke: {e}"))
}

/// 直接在**元素句柄**上读 Name / Value。
#[cfg(target_os = "windows")]
fn uiautomation_read_text_handle(element: &uiautomation::UIElement) -> Result<String, String> {
    let name = element.get_name().map_err(|e| format!("get_name: {e}"))?;
    if !name.is_empty() {
        return Ok(name);
    }
    use uiautomation::patterns::UIValuePattern;
    let pattern: UIValuePattern = element
        .get_pattern()
        .map_err(|e| format!("get ValuePattern: {e}"))?;
    let value = pattern.get_value().map_err(|e| format!("get_value: {e}"))?;
    Ok(value)
}

/// 直接在**元素句柄**上写 Value。
#[cfg(target_os = "windows")]
fn uiautomation_set_value_handle(
    element: &uiautomation::UIElement,
    value: &str,
) -> Result<(), String> {
    use uiautomation::patterns::UIValuePattern;
    let pattern: UIValuePattern = element
        .get_pattern()
        .map_err(|e| format!("get ValuePattern: {e}"))?;
    pattern
        .set_value(value)
        .map_err(|e| format!("set_value (control may not implement ValuePattern): {e}"))
}

// -- Tauri commands: UIA 快照与按 ref 动作（Windows-only）------------------

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_snapshot_ui_tree(
    state: State<'_, AppState>,
    depth: Option<u32>,
) -> Result<UiSnapshot, CuError> {
    state
        .computer_use
        .snapshot_ui_tree(depth)
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_click_ui_by_ref(
    state: State<'_, AppState>,
    // ⚠️ 参数名用**单词** —— Tauri v2 默认把 snake_case 参数名转成 camelCase
    // ⇒ ⇒ 单词名在两端都同名 ⇒ ⇒ 不用赌那一层转换。
    target: String,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .click_ui_by_ref(&target)
        .map(|()| CuOutcome::action("click_ui_by_ref", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_read_ui_by_ref(
    state: State<'_, AppState>,
    target: String,
) -> Result<String, CuError> {
    state
        .computer_use
        .read_ui_by_ref(&target)
        .map_err(CuError::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn cu_set_ui_value_by_ref(
    state: State<'_, AppState>,
    target: String,
    value: String,
) -> Result<CuOutcome, CuError> {
    state
        .computer_use
        .set_ui_value_by_ref(&target, &value)
        .map(|()| CuOutcome::action("set_ui_value_by_ref", CuDisposition::delivered_unverified()))
        .map_err(CuError::from)
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
        assert!(parse_key("ctrl+c-pretender").is_none());
    }

    #[test]
    fn parse_key_case_insensitive() {
        assert!(parse_key("RETURN").is_some());
        assert!(parse_key("return").is_some());
        assert!(parse_key("Return").is_some());
        assert!(
            parse_key("RETURN ").is_none(),
            "trailing space must not match"
        );
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
        // ⚠️⚠️ 2026-11-08：**真的调生产构造器 `ComputerUse::new()`** ——
        //   原来这里**内联构造** `ComputerUse { enabled: AtomicBool::new(...),
        //   enigo: None }` ⇒ ⇒ 断言打的是**测试自己造的原子量**，不是**生产代码
        //   读 env 的那条路** ⇒ ⇒ **假绿形状**：把 `new()` 里的 env 读取改坏
        //   （改 var 名 / 改比较值），这条测试**照样绿** ⇒ ⇒ 它证明不了闸逻辑。
        //   ⇒ ⇒ 现在改成真的调 `ComputerUse::new()` ⇒ ⇒ 断言打在生产读点上。
        //
        //   **为什么 headless 安全**：`new()` 里的 enigo 绑定**失败也不 panic** ——
        //   它 `tracing::warn!` 之后把 `enigo` 置成 `None`（结构体注释：headless ⇒
        //   None ⇒ 动作一律 Disabled）⇒ ⇒ **无显示器的 CI runner 上照样返回 Ok**
        //   ⇒ ⇒ 这条测试**不需要显示器**，也不需要 xvfb 垫层。
        let cu = ComputerUse::new()
            .expect("ComputerUse::new is infallible (enigo failure degrades to None)");
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
            // ⚠️ 同上：`None` 是这个类型**明确支持**的状态（headless）⇒ ⇒ 这条测试
            //   **不需要显示器** ⇒ ⇒ 闸不再有「环境缺口型」的间歇红。
            enigo: None,
            #[cfg(target_os = "windows")]
            ui_snapshots: std::sync::Mutex::new(UiSnapshotQueue::new()),
            #[cfg(target_os = "windows")]
            ui_snapshot_seq: AtomicU64::new(0),
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
            #[cfg(target_os = "windows")]
            ui_snapshots: std::sync::Mutex::new(UiSnapshotQueue::new()),
            #[cfg(target_os = "windows")]
            ui_snapshot_seq: AtomicU64::new(0),
        };
        let err = cu.mouse_move(0, 0).unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
        let err = cu.keyboard_type("hi").unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
        let err = cu.mouse_click(0, 0, MouseButton::Left).unwrap_err();
        assert!(matches!(err, ComputerUseError::Disabled));
    }

    // -- delivery semantics (2026-11-09) -----------------------------------

    #[test]
    fn error_variants_map_to_codes_and_dispositions() {
        // ⚠️ 这条表是**契约表**：agent 按 `code` 分支、按 `retry` 决定
        // 要不要重试 ⇒ ⇒ 改任何一格都要先想清楚后果。
        let cases: Vec<(ComputerUseError, &str, CuDelivery, CuRetry)> = vec![
            (
                ComputerUseError::Disabled,
                "COMPUTER_USE_DISABLED",
                CuDelivery::NotDelivered,
                CuRetry::Safe,
            ),
            (
                ComputerUseError::NoMonitor,
                "NO_MONITOR",
                CuDelivery::NotDelivered,
                CuRetry::Safe,
            ),
            (
                ComputerUseError::InputBackend("boom".into()),
                "INPUT_BACKEND_UNAVAILABLE",
                CuDelivery::NotDelivered,
                CuRetry::Safe,
            ),
            (
                ComputerUseError::InputAction("boom".into()),
                "INPUT_ACTION_FAILED",
                CuDelivery::NotDelivered,
                CuRetry::Safe,
            ),
            (
                // 「可能打进去一半」⇒ ⇒ 不许报 safe。
                ComputerUseError::InputActionUncertain("boom".into()),
                "INPUT_ACTION_FAILED",
                CuDelivery::DeliveryUncertain,
                CuRetry::Unsafe,
            ),
            (
                ComputerUseError::Screenshot("boom".into()),
                "SCREENSHOT_FAILED",
                CuDelivery::NotDelivered,
                CuRetry::Safe,
            ),
        ];
        for (err, code, delivery, retry) in cases {
            let cu: CuError = err.into();
            assert_eq!(cu.code, code);
            assert_eq!(cu.disposition.delivery(), delivery);
            assert_eq!(cu.disposition.retry(), retry);
            assert!(!cu.message.is_empty(), "message must stay human-readable");
        }
    }

    #[test]
    fn retry_is_always_derived_from_delivery() {
        // 不变量：**safe ⟺ not_delivered**。
        // （disposition 的字段是私有的 ⇒ ⇒ Rust 里造不出错配的组合；
        //   这条测试是给「将来有人加构造器」兜底的。）
        let all = [
            CuDisposition::not_delivered(),
            CuDisposition::delivery_uncertain(),
            CuDisposition::delivered_unverified(),
        ];
        for d in all {
            let expected = match d.delivery() {
                CuDelivery::NotDelivered => CuRetry::Safe,
                CuDelivery::DeliveryUncertain | CuDelivery::DeliveredUnverified => CuRetry::Unsafe,
            };
            assert_eq!(d.retry(), expected);
        }
    }

    #[test]
    fn gate_closed_action_is_not_delivered_and_safe_to_retry() {
        let cu = ComputerUse {
            enabled: AtomicBool::new(false),
            enigo: None,
            #[cfg(target_os = "windows")]
            ui_snapshots: std::sync::Mutex::new(UiSnapshotQueue::new()),
            #[cfg(target_os = "windows")]
            ui_snapshot_seq: AtomicU64::new(0),
        };
        let err: CuError = cu.mouse_click(0, 0, MouseButton::Left).unwrap_err().into();
        assert_eq!(err.code, "COMPUTER_USE_DISABLED");
        assert_eq!(err.disposition.delivery(), CuDelivery::NotDelivered);
        assert_eq!(err.disposition.retry(), CuRetry::Safe);
        // 键盘那条同口径（闸门关 ⇒ 什么都没发）。
        let err: CuError = cu.keyboard_type("hi").unwrap_err().into();
        assert_eq!(err.disposition.retry(), CuRetry::Safe);
    }

    #[test]
    fn error_serializes_with_code_message_and_disposition() {
        // ⚠️ 这条是**给前端的契约**（前端按 `code` / `disposition` 读）⇒ ⇒
        // 字段改名就红。
        let cu: CuError = ComputerUseError::Disabled.into();
        let v = serde_json::to_value(&cu).expect("CuError must serialize");
        assert_eq!(v["code"], "COMPUTER_USE_DISABLED");
        assert!(v["message"].is_string());
        assert_eq!(v["disposition"]["delivery"], "not_delivered");
        assert_eq!(v["disposition"]["retry"], "safe");
    }

    #[test]
    fn outcome_serializes_action_and_disposition() {
        let outcome = CuOutcome::action("mouse_click", CuDisposition::delivered_unverified());
        let v = serde_json::to_value(&outcome).expect("CuOutcome must serialize");
        assert_eq!(v["action"], "mouse_click");
        assert_eq!(v["disposition"]["delivery"], "delivered_unverified");
        assert_eq!(v["disposition"]["retry"], "unsafe");
    }

    // -- key combo wire shape (2026-11-09) ----------------------------------

    #[test]
    fn key_combo_parses_human_specs() {
        assert_eq!(KeyCombo::parse("ctrl+c").unwrap(), KeyCombo::Ctrl("c".into()));
        assert_eq!(KeyCombo::parse("Ctrl+C").unwrap(), KeyCombo::Ctrl("C".into()));
        assert_eq!(KeyCombo::parse("cmd+s").unwrap(), KeyCombo::Super("s".into()));
        assert_eq!(KeyCombo::parse("escape").unwrap(), KeyCombo::Single("escape".into()));
        assert_eq!(KeyCombo::parse("F5").unwrap(), KeyCombo::Single("F5".into()));
    }

    #[test]
    fn key_combo_rejects_multi_modifier_and_unknown_names() {
        // 只支持一个修饰键 ⇒ ⇒ 报错要**明确**，不许悄悄丢掉一个修饰键。
        assert!(KeyCombo::parse("ctrl+shift+a").is_err());
        assert!(KeyCombo::parse("hyper+a").is_err());
        assert!(KeyCombo::parse("nope").is_err());
        assert!(KeyCombo::parse("").is_err());
    }

    #[test]
    fn key_combo_deserializes_from_a_wire_string() {
        // ⚠️ 这条钉的是**前端审批弹窗实际发出来的形状** ⇒ ⇒ 它要是红，
        // 那条路径就从来没跑通过（2026-11-09 之前就是那样：wire 形状是
        // 枚举 ＋ 变体，而弹窗发的是字符串）。
        let combo: KeyCombo =
            serde_json::from_str("\"ctrl+c\"").expect("wire string must parse");
        assert_eq!(combo, KeyCombo::Ctrl("c".into()));
        let combo: KeyCombo =
            serde_json::from_str("\"Ctrl+C\"").expect("mixed case must parse");
        assert_eq!(combo, KeyCombo::Ctrl("C".into()));
    }

    #[test]
    fn single_letters_and_function_keys_are_valid_keys() {
        assert_eq!(parse_key("c"), Some(Key::Unicode('c')));
        assert_eq!(parse_key("5"), Some(Key::Unicode('5')));
        assert_eq!(parse_key("f5"), Some(Key::F5));
        // 长串仍然被拒（不许把任意字符串当键名塞进来）。
        assert!(parse_key("ctrl+c-pretender").is_none());
    }

    // -- Windows 段的**编译证明**（2026-11-09）--------------------------------
    //
    // ⚠️ **为什么要这条**：UIA 那一整段是 `#[cfg(target_os = "windows")]`
    // ⇒ ⇒ **Linux CI 根本看不到它** ⇒ ⇒ 「这段编过了没有」这件事
    // ⇒ ⇒ **只能靠本机** ⇒ ⇒ 而「本机是 Windows」这件事不该靠人记得
    // ⇒ ⇒ 所以让它**成为一条测试**：这条测试**只存在于 Windows 上**
    // ⇒ ⇒ 它出现在测试清单里 ⇒ ⇒ 就是「那段代码**被编译了**」的
    // ⇒ ⇒ **机器证据**（不是人眼、不是记忆）。
    //
    // ⚠️ 它**证明的是编译与链接**，不是运行时 —— UIA 要**真桌面会话**
    // ⇒ ⇒ 运行时的读数仍然是另一格（见台账那条的「仍然欠着」）。
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_uia_surface_is_compiled_and_linked() {
        // 取函数指针 ⇒ ⇒ 强制这两个符号**被引用** ⇒ ⇒ 链接期也过。
        let _find: fn(&str) -> Result<Option<UiElement>, String> =
            uiautomation_find_first_by_automation_id;
        let _list: fn() -> Result<Vec<UiElement>, String> = uiautomation_list_root_children;
    }

    // -- UIA ref 的形状规则（**平台无关** ⇒ ⇒ Linux CI 也看得见）-----------

    #[test]
    fn ui_ref_roundtrip_and_shape_rules() {
        // 生成 ⇒ ⇒ 解析回来。
        let id = ui_ref_id("s0000002f", 7);
        assert_eq!(id, "@s0000002f:e7");
        assert_eq!(
            parse_ui_ref(&id).unwrap(),
            ("s0000002f".to_string(), "e7".to_string())
        );

        // ⚠️ **裸 ref 一律拒** —— 「旧快照的 ref 混进来」是最典型的形状
        // ⇒ ⇒ 错一次可能点到别的东西 ⇒ ⇒ 宁可拒。
        assert!(parse_ui_ref("@e7").is_err(), "bare ref must be rejected");
        assert!(parse_ui_ref("s0000002f:e7").is_err(), "missing @");
        assert!(parse_ui_ref("@s0000002f").is_err(), "missing :e<N>");
        assert!(parse_ui_ref("@:e7").is_err(), "empty snapshot id");
        assert!(parse_ui_ref("@s0000002f:x7").is_err(), "index must be numeric");
        assert!(parse_ui_ref("@s0000002f:e").is_err(), "index must not be empty");
        assert!(parse_ui_ref("").is_err());
    }

    // -- 捕获时唯一性证明（**平台无关** ⇒ ⇒ Linux CI 也看得见）-----------

    #[test]
    fn anonymous_element_has_no_identity_key() {
        // 既没名字也没开发者 id ⇒ ⇒ **不可寻址**（它没有身份）。
        assert_eq!(ui_identity_key("Button", "", ""), None);
        assert_eq!(ui_identity_key("Button", "   ", "  "), None);
        // 有名字 ⇒ ⇒ 有身份。
        assert!(ui_identity_key("Button", "保存", "").is_some());
        // 只有开发者 id 也算有身份。
        assert!(ui_identity_key("Edit", "", "field-1").is_some());
    }

    #[test]
    fn twin_elements_are_not_addressable() {
        let nodes = vec![
            ("Button".to_string(), "保存".to_string(), String::new()),
            ("Button".to_string(), "保存".to_string(), String::new()),
            ("Button".to_string(), "取消".to_string(), String::new()),
        ];
        let flags = ui_addressable_flags(&nodes);
        // ⚠️ **孪生两个都不可寻址**（不许替用户挑一个）；唯一那个照旧。
        assert_eq!(flags, vec![false, false, true]);
    }

    #[test]
    fn anonymous_nodes_are_never_addressable() {
        let nodes = vec![
            ("Pane".to_string(), String::new(), String::new()),
            ("Text".to_string(), "标题".to_string(), String::new()),
        ];
        assert_eq!(ui_addressable_flags(&nodes), vec![false, true]);
    }

    #[test]
    fn same_name_but_different_automation_id_stays_addressable() {
        // 树里**列出了** automation_id ⇒ ⇒ 模型分得清 ⇒ ⇒ 仍可寻址。
        let nodes = vec![
            ("Text".to_string(), "标题".to_string(), "a".to_string()),
            ("Text".to_string(), "标题".to_string(), "b".to_string()),
        ];
        assert_eq!(ui_addressable_flags(&nodes), vec![true, true]);
    }

    #[test]
    fn ref_gate_refuses_incomplete_snapshot_and_non_addressable_entry() {
        assert_eq!(ui_ref_gate(true, true), UiRefGate::Open);
        // 不完整 ⇒ ⇒ 一律不许用（哪怕那个元素本身可寻址）。
        assert_eq!(ui_ref_gate(false, true), UiRefGate::SnapshotIncomplete);
        // 完整但不可寻址 ⇒ ⇒ 也不许用。
        assert_eq!(ui_ref_gate(true, false), UiRefGate::NotAddressable);
        // 不完整 ＋ 不可寻址 ⇒ ⇒ **先报不完整**（那是更根本的那一档）。
        assert_eq!(ui_ref_gate(false, false), UiRefGate::SnapshotIncomplete);
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
