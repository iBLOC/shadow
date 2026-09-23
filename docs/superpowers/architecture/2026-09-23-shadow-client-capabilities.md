---
**Updated:** 2026-09-23 (initial; registers browser-use + computer-use as first-class shadow-client capabilities after P4 `preview_window.rs` + P5 / P5+ `computer_use.rs` landed)
**Status:** ✅ Documented (both capabilities shipped in shadow-desktop master at `9c46327`)
**Author:** shadow-desktop
**Spec companions:** none
**Plan companions:** none
**Layer coverage:** L4 (shadow-client / shadow-mobile) — these run *on the user's device*, in contrast to A2A cross-device, ACP intra-app, MCP tool calls.
**Related docs:**
- [`scenarios/2026-09-23-baby-cry-monitoring-scenario.md`](../scenarios/2026-09-23-baby-cry-monitoring-scenario.md) — BC-* audio monitoring uses computer-use primitives to bind an audio event to a mouse-click action (WS-05 fallback path).
- [`scenarios/2026-09-23-external-agent-website-development-scenario.md`](../scenarios/2026-09-23-external-agent-website-development-scenario.md) — WS-01..WS-05 uses browser-use to preview a deployed website.
- [`architecture/2026-09-23-qiankun-evaluation.md`](2026-09-23-qiankun-evaluation.md) — alternative embedding approach (qiankun micro-frontend), considered and rejected for v1.

---

## 0. Why this doc exists

shadow-desktop now ships two distinct "act on the host" capabilities the user asked to record as first-class:

| Capability | What it does | Implementation | Safety model |
|---|---|---|---|
| **browser-use** | Spawn one OS-level WebView per preview, pointed at a URL the agent generated (a 天工 deployment, a dev server, a documentation page). | `shadow-desktop/src-tauri/src/preview_window.rs` → `tauri::WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))` | OS-level process isolation; main shadow window untouched by preview reloads; the preview-window *cannot* reach back into shadow's JS state. |
| **computer-use** | Drive the host's mouse + keyboard + read the screen, so it can act on apps that don't expose an A2A interface (legacy software, native UIs, browser pages without an API). | `shadow-desktop/src-tauri/src/computer_use.rs` → `enigo` (cross-platform mouse + keyboard) + `xcap` (screenshot) + `uiautomation` (Windows element-based). | `SHADOW_COMPUTER_USE_ENABLED=1` env-var gate; every mouse / keyboard / click_ui call does `check_enabled()` first. Screenshot is allowed even with the gate closed (observation is cheap, action is dangerous). |

These two capabilities are independent but complementary: browser-use gives an *external sandboxed rendering surface* for any web app the agent needs to see or interact with via the same WebView; computer-use gives *native host control* for everything else (legacy apps, native windows, etc.). They share the same env-var gate so a single opt-in covers both.

---

## 1. browser-use

### 1.1 What "browser-use" means here

In the broader AI-agent literature (Anthropic Computer Use, OpenAI Operator) "browser-use" can mean either:
- Coordinate-based mouse clicks inside a single browser tab the agent controls, **or**
- Spawning dedicated browsing surfaces the agent can drive

In shadow v1 we ship the **latter** — a separate Tauri `WebviewWindow` per preview URL. We deliberately **don't** ship coordinate-based mouse inside an existing WebView because:

- It shares DOM context with the host shell (XSS / state-leak risk if the preview points at an untrusted URL)
- Preview navigation reloads disrupt the parent shell's chat surface
- Per-WebView devtools / CSP / zoom can't be tuned without leaking into the parent

### 1.2 Surface

```rust
// src-tauri/src/preview_window.rs
pub fn open_preview(app: &AppHandle, task_id: &str, url: &str) -> Result<(), PreviewWindowError>
pub fn close_preview(app: &AppHandle, task_id: &str) -> Result<bool, PreviewWindowError>
pub fn list_open_previews(app: &AppHandle) -> Vec<String>
pub fn preview_label(task_id: &str) -> Result<String, PreviewWindowError>  // sanitisation
```

```text
[tauri::command]
preview_open(task_id, url)    → spawn (or re-focus) the preview-<task_id> WebviewWindow
preview_close(task_id)       → close the window by label; returns whether anything was open
```

The WebviewWindow label is `preview-<sanitised-task_id>` — Tauri requires labels to match `[A-Za-z0-9_-]`. A second `preview_open` for the same task id **navigates** the existing window instead of spawning a duplicate (per-WS-01 step 11 expectation).

### 1.3 Tauri capability

`WebviewUrl::External(url)` requires the destination scheme / host to appear in `src-tauri/capabilities/*.json` under the `webview` capability. Production deployments should restrict the allowlist to dev-server origins (e.g. `http://localhost:*`, `https://*.shadow.local`). v1 leaves this open.

### 1.4 Known limitations

- WebView doesn't share JS state with the main shadow window — by design, but means cross-window MCP / ACP calls must go through the Tauri command bus.
- macOS / Linux WebView backends aren't officially enumerated for parity with Windows; behaviour is the same `WebviewUrl::External` API but no UIA-style element queries.
- No built-in tab switcher — if the user wants 5 previews at once they get 5 OS windows. Reasonable for v1.

---

## 2. computer-use

### 2.1 What "computer-use" means here

Industry "computer use" (Anthropic, OpenAI, Adept) is *drive the host like a user would*: see the screen, find a button by name, click it, type into a field. For shadow, this is the fallback when no A2A endpoint exists — e.g. legacy admin panels, native apps, or browser pages without automation APIs.

### 2.2 Two paths, by platform

| Platform | Path | Library |
|---|---|---|
| **Windows** | element-based: query UI Automation tree (`uiautomation-rs`), find by `Name` substring or `AutomationId` exact, invoke the default action (click), read `Name` / `Value`, set `Value` for edit controls. | `uiautomation = "0.25"` (cfg-gated `cfg(target_os = "windows")`) |
| macOS / Linux | coordinate-based: move mouse + click + scroll + type + key combos. | `enigo = "0.6"` (mouse + keyboard) + `xcap = "0.9"` (screenshot) |

The Windows element-based path is **strongly preferred** over coordinate-based because:
- it survives window resize, DPI changes, multi-monitor position shifts
- it matches what Anthropic's Computer Use and OpenAI's Operator do
- accessibility-friendly: it's the same API assistive tech uses

macOS / Linux keep the coordinate path. Equivalent Apple Accessibility (`XCAccessibilityElement`) and AT-SPI bindings are out of scope for v1.

### 2.3 Surface

```rust
// src-tauri/src/computer_use.rs
// Cross-platform (gated)
fn screenshot()                                          → Result<Screenshot, ...>  // allowed with gate closed
fn mouse_move(x, y)                                      → Result<(), ...>            // gate
fn mouse_click(x, y, button: MouseButton)               → Result<(), ...>            // gate
fn mouse_scroll(dx, dy)                                  → Result<(), ...>            // gate
fn keyboard_type(text)                                   → Result<(), ...>            // gate + 4096-char cap
fn keyboard_combo(combo: KeyCombo)                       → Result<(), ...>            // gate + allowlist

// Windows-only (cfg-gated)
fn list_ui_elements()                                    → Result<Vec<UiElement>, ...>
fn find_ui_by_name(name_substr)                          → Result<Option<UiElement>, ...>
fn find_ui_by_automation_id(id)                          → Result<Option<UiElement>, ...>
fn click_ui_by_name(name_substr)                         → Result<(), ...>
fn read_ui_text(name_substr)                             → Result<String, ...>
fn set_ui_value(name_substr, value)                      → Result<(), ...>
```

```text
[tauri::command]
# cross-platform
cu_screenshot()                → Screenshot
cu_mouse_click(x, y, button)   → ()
cu_mouse_move(x, y)            → ()
cu_mouse_scroll(dx, dy)        → ()
cu_keyboard_type(text)          → ()
cu_keyboard_combo(combo)       → ()
cu_set_enabled(on)             → ()

# Windows-only (cfg(target_os = "windows"))
cu_list_ui_elements()           → Vec<UiElement>
cu_click_ui_by_name(name)       → ()
cu_read_ui_text(name)           → String
cu_set_ui_value(name, value)    → ()
```

### 2.4 Safety model

Three layers of defence:

1. **Env-var gate** — `SHADOW_COMPUTER_USE_ENABLED=1` must be set at process start. Default OFF. Production shadow builds ship closed; only an explicit per-launch opt-in opens it.
2. **Per-call check** — every mouse / keyboard / click_ui call invokes `check_enabled()` first; the runtime toggle (`cu_set_enabled(true|false)`) is for a future "trust this device for 5 minutes" UI affordance.
3. **Bounded inputs** — `keyboard_type` caps at 4096 chars (defence-in-depth against a runaway agent typing into an unlocked input); `keyboard_combo` parses key names through a fixed allowlist (`Return / Escape / Tab / arrow keys / Home / End / PageUp / PageDown`) so the agent cannot pass an arbitrary string as a key.

The `ComputerUse::new()` constructor falls back to a permanently-disabled instance when enigo can't bind (e.g. headless CI runner, missing display server) — every action then returns `ComputerUseError::Disabled` instead of panicking. Screenshot returns its own `NoMonitor` error in the same case.

### 2.5 Known limitations

- **Window enumeration** — `cu_list_windows` (full OS window list) is **not** in v1; macOS would need `CGWindowListCopyWindowInfo`, Windows would need `EnumWindows`, Linux would need `xcb_get_windows` / `wayland-client`. Each is platform-specific. The need is real (WS-05 failure path wants "focus the shadow main window then type") but defer to a follow-up.
- **OCR / object detection** — the agent currently sees a screenshot PNG. To click "the button labelled Submit" it needs pixel coords OR the element-based UIA path (Windows only). v1 ships both raw modes; OCR is future.
- **Coord-based click stability** — clicking at `(245, 612)` on macOS / Linux breaks the moment the window moves. The fix is UIA-equivalent libs (out of scope). Document this as the reason to prefer the Windows path when available.
- **enigo 0.6 API drift** — the wrapper uses `Mouse::mouse_move_to`, `Mouse::mouse_click(Coordinate{x,y}, button)`, `Mouse::mouse_scroll_wheel`, `Keyboard::text`, `Keyboard::key_down` / `key_up`. Future enigo majors may rename.

---

## 3. How browser-use and computer-use relate

| | browser-use | computer-use |
|---|---|---|
| **Sees the screen?** | The WebView renders the URL itself | `cu_screenshot` reads the host display |
| **Acts on it?** | User (human) clicks the rendered page; or agent uses `cu_*` against an external system via Tauri commands | Agent drives `mouse / keyboard / UIA` calls |
| **Trust boundary** | OS-level WebView process; sandboxed CSP via Tauri `initialization_script` | `SHADOW_COMPUTER_USE_ENABLED` gate + per-call check + bounded inputs |
| **Where to ship?** | WebView URL points at any reachable host (`http://localhost:*`, `https://app.deploy.local`). | Drives whatever the agent can see on the host display. |

The two are complementary, not substitutes:
- browser-use for things you want the user (or agent via DOM) to interact with inside a WebView
- computer-use for everything else (legacy apps, native UIs, browser pages without automation APIs)

---

## 4. MCP wrapping (future)

Both surfaces are designed to be wrapped as MCP tools so telencephalon / prefrontal agents can drive them through `synapse::mcp::SimpleMcpServer` without invoking Tauri commands directly:

```text
# cross-platform MCP tools (planned)
browser_use.open_preview(task_id, url)            → opens a WebviewWindow
browser_use.close_preview(task_id)               → ()
browser_use.list_previews()                       → Vec<{task_id, label}>

computer_use.screenshot()                        → { width, height, png_base64 }
computer_use.mouse_click(x, y, button)           → ()
computer_use.mouse_move(x, y)                    → ()
computer_use.mouse_scroll(dx, dy)                → ()
computer_use.keyboard_type(text)                 → ()
computer_use.keyboard_combo(combo)              → ()

# Windows-only MCP tools
computer_use.list_ui_elements()                  → Vec<UiElement>
computer_use.click_ui_by_name(name)              → ()
computer_use.read_ui_text(name)                  → String
computer_use.set_ui_value(name, value)           → ()
```

The wrapper would live in either `diencephalon/src/mcp.rs` (extending the P1 server) or a new `shadow-desktop/src/mcp.rs`. Decision deferred to whichever side needs it first (BC-01 audio scenario doesn't use these; WS-01..WS-05 web-dev uses browser-use). Not blocking any current scenario.

---

## 5. Open questions

1. **MCP wiring** — see §4. Where to host the wrapper?
2. **macOS / Linux element-based equivalent** — Apple Accessibility + AT-SPI bindings are the natural counterpart. Out of scope for v1.
3. **Window enumeration** — see §2.5.
4. **Recording vs scripting** — RPA literature splits "user records a flow, shadow replays it" from "agent reasons live". v1 is the live-agent path; recording is a separate feature.
5. **Sandbox mode** — enigo on macOS / Linux can drive the *real* host, including typing into other apps while the user is at the keyboard. The gate prevents this when closed; when open, the user is on the hook to not touch the mouse while an action is mid-flight. Follow-up: per-action "preview-before-commit" UI affordance (show the proposed action, user clicks "OK", agent proceeds).

---

## 6. Acceptance checklist (v1 status)

- [x] browser-use: `preview_open` / `preview_close` / label sanitisation (`b834d20`)
- [x] computer-use cross-platform: `cu_screenshot` / `cu_mouse_*` / `cu_keyboard_*` / `cu_set_enabled` (`84418a2`)
- [x] computer-use Windows element-based: `cu_list_ui_elements` / `cu_click_ui_by_name` / `cu_read_ui_text` / `cu_set_ui_value` (`9c46327`)
- [ ] MCP wrapping (see §4)
- [ ] macOS / Linux element-based (see §5)
- [ ] Window enumeration (see §5)
- [ ] Per-action preview-before-commit UI affordance (see §5)