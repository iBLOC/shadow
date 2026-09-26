---
**Date:** 2026-09-25
**Type:** E2E coverage assessment (read-only; no code changes)
**Baseline:** [`2026-09-23-iBLOC-progress-assessment.md`](2026-09-23-iBLOC-progress-assessment.md) (audit closed R-01..R-11, deferred R-12/R-13 to "parietal workflow editor")
**Companion doc:** [`2026-09-25-doc-sync-changelog.md`](2026-09-25-doc-sync-changelog.md)
**Scope:** Test files across all `C:\Projects\iBLOC\` repos. CI pipeline status, assertion quality, cross-component coverage.
**Author of underlying audit data:** two parallel `Explore` subagents (1645731 + 3381048 tokens; ~92 + ~161 tool calls each, 2026-09-25)

---

## 0. Headline

| | This assessment | 2026-09-23 audit (baseline) | Net |
|---|---|---|---|
| Repos with at least one test file | 17 (incl. out-of-scope siblings) | 10 | +7 |
| Total test files (in-tree) | ~177 (84 shadow-desktop + 35 shadow-mobile + 92 Rust integration + inline) | ~95 | +82 |
| Repos wired into CI | 10 | 8 | +2 |
| **Repos that run e2e in CI** | **0** (none — every Playwright/WDIO/tauri-driver script is dev-only) | 0 | 0 |
| Repos with coverage tool wired | 2 (neuron tarpaulin + telencephalon llvm-cov) | 2 | 0 |
| **Critical no-e2e flows (zero coverage)** | **6** (RecordingPage, Workflow Studio, Shadow→neuron :8085, Shadow→Cortex mTLS, Computer-Use, Recording→Hippocampus) | 13 (UI/UX audit items) | -7 |
| E2E tests with hard assertions | ~5% (most are `console.log('reachable')` + soft skip) | ~5% | 0 |
| **Bottom line** | **Shadow-Desktop has 84 test files but is functionally untested end-to-end.** Most gaps from the 2026-09-23 audit closed at code level; gaps at assertion-quality + CI-gating level are **wider** than the audit captured. | | |

**The shape is done; the substance is uneven.** Every layer has tests at file-level. The platform's actual end-to-end coverage is held together by:
1. **Server-side Rust e2e** (telencephalon's 31 integration tests, hippocampus's 16, synapse's 22) — these are robust, but disconnected from the desktop/mobile surface.
2. **Vitest unit-level "e2e"** in shadow-desktop — labeled `tests/e2e/*.test.tsx` but use `MemoryRouter` + `vi.mock('.../store')` and never hit a real HTTP endpoint.
3. **Page-smoke Playwright** — `tests/e2e-ui/*.spec.ts` checks "title contains X" + "button visible" + `console.log('lobe reachable')` graceful skip.

The Rust side has the strongest e2e matrix on the platform (92 integration files, ~180+ tests passing per the 2026-09-23 audit). The shadow-client side has the largest known gap, and the gap is structural: **the existing e2e tooling isn't wired into CI, and the cortex empty-directory issue makes Playwright specs dead code on Windows.**

---

## 1. Repo-by-repo test inventory

Test counts are in-tree files only (inline `#[cfg(test)]` mod tests are noted but not counted as separate files).

| Repo | Unit | Integration | E2E / UI | Test runner | Coverage tool | CI runs e2e? |
|---|---|---|---|---|---|---|
| `shadow-desktop` (Tauri 2 + React 19) | ~47 stores + components + pages + lib | 23 vitest "e2e" + 1 protocol + 1 lib | 28 Playwright + 5 WDIO+chromedriver + 5 tauri-driver + 3 webdriverio | vitest 3.1 (jsdom), Playwright 1.62, WebdriverIO 9 | v8 declared (50/40/45/50), **not enforced** | ❌ no |
| `shadow-mobile` (Flutter 3.11+) | 22 in `test/` + `test/unit/` | 0 | 7 `integration_test/*.dart` | `flutter test`, `flutter test integration_test` | none | ❌ no |
| `shadow-esp32` (Zephyr C) | 0 | 0 | 0 | — | — | ❌ no (firmware only) |
| `synapse` (shared A2A / MCP / providers) | inline | 22 `tests/*.rs` | 0 | `cargo test` | none | ❌ no CI workflow at all |
| `prefrontal` (Rust, :8082) | inline in `agent_store.rs` etc. | 6 `tests/*.rs` (`api_flow_integration`, `group_lifecycle`, `memory_integration`, `model_discovery`, `session_integration`, `webrtc_ice_events`) + 1 bench | 0 | `cargo test` | none | ❌ `cargo test --all-features` only |
| `hippocampus` (Rust, :8081) | inline across 5 sub-crates | 16 `tests/*.rs` (incl. `crud_e2e`, `consolidator_e2e`, `episode_linking_e2e`, `graph_e2e`, `hybrid_rag_graph`, `lance_backend_e2e`, `mcp_basic`, `mcp_graph`, `mcp_invalidation`, `blob_backend`, `consolidator_dataset_integration`, `lance_storage_integration`, `lance_sync_integration`) | 0 | `cargo test --all` | none | ❌ |
| `neuron` (Rust, :8083/8085) | inline | 7 `tests/*.rs` (`chronos2_integration`, `decision_parity`, `http_integration`, `mage_vl_*`) | 0 | `cargo test --lib` only in CI | ✅ **cargo-tarpaulin** → Codecov | ❌ only `--lib`, not `--tests` |
| `resonance` (Rust, :8080) | inline in `engine/src/...` | 2 `tests/*.rs` (`synapse_agent`, `auth_workspace`) | 0 | `cargo test` | none | ❌ |
| `telencephalon` (renamed cortex, :60080) | inline across `src/` | **31 `tests/*.rs`** incl. `a2a_gateway`, `business_flows_e2e{,_part2,_part3}`, `cross_process_e2e`, `dtls_srtp_e2e`, `encephalon_e2e_full`, `lobe_config_e2e`, `mcp_http_transport_e2e`, `mcp_stdio_transport_e2e`, `mcp_invoke_e2e`, `neuron_embedded_regression`, `phase_a_e2e`, `prefrontal_register`, `shadow_api`, `shadow_interaction`, `shadow_persistence`, `temporal_webrtc_companion_mode`, `three_layer_e2e`, `video_sources_e2e`, `vision_pipeline_e2e`, `visual_task_e2e`, `wasm_a2a_e2e`, `wasm_e2e`, `webrtc_signaling_e2e` | 0 | `cargo test --all-features` | ✅ **cargo-llvm-cov** → lcov | ❌ runs locally + in CI, **not surfaced to shadow-desktop CI** |
| `diencephalon` (sensory preprocessing + data gateway) | inline | 3 `tests/*.rs` (`audio_pipeline`, `data_gateway`, `vision_pipeline`) | 0 | `cargo test --all-targets` | none | ❌ |
| `encephalon` (ACP bus MVP, frozen) | inline | 1 `tests/bus_flow.rs` | 0 | `cargo test --all-targets` | none | ❌ |
| `temporal` (audio pipeline lobe) | inline only (no `tests/`) | 0 | 0 | — | — | ❌ no CI workflow |
| `occipital` (vision lobe) | inline only | 0 | 0 | — | — | ❌ no CI workflow |
| `parietal` (IoT/sensor lobe) | inline (10 modules) | 1 `tests/forecast_e2e.rs` (mock axum + real `NeuronClient`) | 0 | `cargo test` | none | ❌ no CI workflow |
| `cerebellum` (workflow engine, new) | inline `mod tests` × 4 crates | 0 | 0 | — | — | ❌ no CI workflow |
| `parietal-lobe` (workflow schema, new) | inline only | 0 | 0 | — | — | ❌ no CI workflow |
| `cortex` (placeholder) | n/a | n/a | n/a | — | — | n/a (empty dir) |
| `ibloc-hr-agent` (sibling, out-of-scope) | mixed | vitest matrix (ubuntu/windows/macos) + cargo | **tauri-driver WebDriver e2e** | full | none | ✅ |
| `hengjian` (sibling, out-of-scope) | mixed | cargo (`--ignored` integration vs postgres:16) + vitest | **Playwright e2e with seed SQL** | full | none | ✅ |

**Shadow-desktop CI** (`.github/workflows/ci.yml`) runs only:
- `prefrontal-rust` job: `cargo check/test/clippy`
- `desktop-test` job: `pnpm exec vitest run` (no `--coverage`, no Playwright/WDIO/tauri-driver)
- `desktop-build` job: `tsc + pnpm build + pnpm build:web`
- `mobile-analyze` job: `flutter analyze` (no `flutter test`, no `flutter test integration_test`)

The `package.json` scripts `test:e2e`, `test:tauri`, `test:wdio`, `test:playwright` are **defined but never invoked in any workflow file.**

---

## 2. Critical gaps (P0 — no working e2e at all)

These flows exist in code and are in scope per the 2026-09-23 audit, but **have zero end-to-end driver coverage**.

### 2.1 RecordingPage flow (R1-R4 — recording mode)

- **Code surface:** `src-tauri/src/recording/mod.rs` (commands `recording_start/stop/status/events/list/report`), `src/pages/RecordingPage.tsx`, Tauri commands in `src-tauri/src/lib.rs:928+`.
- **Audit context:** closed R1-R4 in commits `a1e3509` (design) → `de0913e` (R1 data model) → `8520c31` (lobe ownership) → `afa8d60` (UI + i18n) → `3600166`/`30d7f59`/`3600166` (lobe pipelines) → `0390379`/`856621c`/`965bc15`/`ec467b7` (recording summary + LanceGraph edges).
- **Server-side coverage:** `telencephalon/tests/vision_pipeline_e2e.rs` and `diencephalon/tests/vision_pipeline.rs` cover the data pipeline; `telencephalon/tests/business_flows_e2e.rs` includes step 8 ("Voice transcription + synthesis"). Hippocampus `voiceprint.rs` has inline tests.
- **Gap:** **No Playwright/WDIO/tauri-driver test exercises `/recording` route or any `recording_*` command.** `grep -r 'RecordingPage|recording_start|recording_stop'` returns empty across `tests/`.

### 2.2 Shadow-Desktop → Cortex (A2A) → Prefrontal (OpenAI /v1) end-to-end

- **Server-side:** `telencephalon/tests/{a2a_gateway,prefrontal_register,shadow_api,business_flows_e2e}.rs` cover the chain.
- **Client-side:** `tests/e2e-ui/{business-flow-ui,e2e-conversation-flow,e2e-provider-conversation,e2e-task-scheduling}.spec.ts` exist, but each is gated on `isCortexRunning()` and uses `console.log('✓ lobe reachable')` + soft `if (sendRes.ok())` — **they cannot fail when the lobe is offline.**
- **CI gap:** Even if those soft checks were upgraded to hard assertions, the Playwright job isn't run in CI (see §5).
- **Concrete fix:** add a `SHADOW_FULL_STACK=1` env var that gates hard assertions; wire the Playwright job in CI behind a cortex + prefrontal service container.

### 2.3 Shadow-Desktop → Resonance (mTLS)

- **Server-side:** `telencephalon/tests/dtls_srtp_e2e.rs` covers inbound mTLS on the WebRTC side. mTLS wire-through commit `d05d4ba` (`feat(telencephalon): wire mTLS through A2AGateway send_task`).
- **Client-side:** `tests/e2e-ui/resonance.spec.ts` only checks page title + list visibility. **No test exercises `discover_resonance` → mTLS handshake → capability_register end-to-end.**

### 2.4 Shadow-Desktop → neuron :8085 (embedded local inference)

- **Server-side:** `telencephalon/tests/neuron_embedded_regression.rs` guards the architecture (file-existence regression asserting `/v1/*` is NOT proxied to external neuron). `neuron/tests/{http_integration,mage_vl_*}` cover neuron's HTTP surface.
- **Client-side:** `tests/lib/prefrontalClientContract.test.ts` is a **mock-only contract test** of the `:8085` endpoint. **No end-to-end driver that boots shadow-desktop, calls a `:8085` route via a real neuron process, and asserts the result.** Models page (`tests/e2e-ui/models.spec.ts`) only smoke-tests tab switching.

### 2.5 Workflow Studio editor (R-12/R-13 closure)

- **Code surface:** `src/pages/WorkflowStudioPage.tsx` exists; UI shipped in commit `4023493` (2026-09-25, "Workflow Studio — parietal drag-drop workflow editor (R-12/R-13 v1)"); backend in `cerebellum/apps/editor` (commit `b4730e2`).
- **Gap:** **No spec under `tests/e2e-ui/`, `tests/e2e/`, `tests/tauri-e2e/`, `tests/wdio/`, or `e2e-tests/specs/` references Workflow Studio.**

### 2.6 Computer-Use surface

- **Code surface:** `src-tauri/src/computer_use.rs` exposes 11 commands: `cu_screenshot`, `cu_mouse_click/move/scroll`, `cu_keyboard_type/combo`, `cu_set_enabled`, `cu_get_enabled`, `cu_list_ui_elements`, `cu_click_ui_by_name`, `cu_read_ui_text`, `cu_set_ui_value`. UI: `ComputerUsePage.tsx`. Closed R-10/R-11 in commits `84418a2`, `9c46327`, `c37b163`, `b5743fc`.
- **Gap:** **Zero coverage of any `cu_*` command. No Playwright/WDIO/vitest spec references Computer Use.**

---

## 3. High-priority gaps (P1 — thin / mock-only / non-real)

### 3.1 shadow-desktop `tests/e2e/*.test.tsx` are not e2e

The 23 "e2e" files in `shadow-desktop/tests/e2e/` (`agents-flow`, `mcp-flow`, `memory-flow`, `settings-flow`, `discovery-flow`, `models-flow`, `skills-flow`, `onboarding-flow`, `conversation-flow`, `provider-setup-flow`, `task-creation-flow`, `setup-lifecycle`, `tasks-lifecycle`, `error-handling-flow`, `cross-page-navigation`, etc.) all instantiate the page with `MemoryRouter` and `vi.mock('.../store')`. They **never hit a real HTTP endpoint, never trigger a real Tauri command, never exercise routing.**

**Recommendation:** rename to `tests/integration/*.test.tsx` (component-integration only), or migrate to Playwright real-store with a cortex fixture.

### 3.2 tauri-driver suite is nav-only

`shadow-desktop/tests/tauri-e2e/smoke/` (`startup.test.ts`, `api.test.ts`, `conversation.test.ts`, `pages.test.ts`, `features.test.ts`, `__tests__/state-reset.test.ts`):
- `startup.test.ts` asserts title contains "Shadow" + `window.__TAURI_INTERNALS__` exists + `cortex /health` reachable
- `pages.test.ts` asserts URL/bodyness only
- `features.test.ts` repeats the navigation ladder

**No `await element.click() → expect(state).toBe(...)` assertions.** The driver is wired but in essence a smoke ladder.

### 3.3 wdio+chromedriver suite is also smoke-only

`shadow-desktop/tests/wdio/` repeats the same nav ladder as `tauri-e2e/`. Only `wdio/conversation.test.ts` does a `setValue(...)` into an input.

### 3.4 OpenCode / Worktree / preview-window subsystems untested

- `src-tauri/src/opencode_manager.rs` — commands `opencode_launch/check_installed/install/stop/list_instances/create_session/send_message`
- `src-tauri/src/worktree_manager.rs` — `worktree_create/delete/get`
- `src-tauri/src/preview_window.rs` — preview window management

No e2e. Only `tests/stores/{agentStore,subsystemStore}.test.{ts,tsx}` exercises these at store-mock level.

### 3.5 Feishu MCP / mcp_catalog untested

- `src-tauri/src/feishu_mcp/{mod.rs,client.rs}` — Feishu publishing bridge
- `src-tauri/src/mcp_catalog.rs` — MCP catalog runtime

The MCP UI page is smoke-checked only (`tests/e2e-ui/mcp.spec.ts` — header + add-server button). No test for `add_server / remove_server / builtin_servers` runtime behaviour. **The transport-aware MCPPage (stdio/http/wasm) shipped in `1c0c3ec` is fully uncovered.**

### 3.6 shadow-desktop CI doesn't run any e2e

`.github/workflows/ci.yml` only runs `pnpm exec vitest run`. Playwright/WDIO/tauri-driver scripts in `package.json` are **defined but never invoked in any workflow file**. Sibling repos do this correctly:
- `ibloc-hr-agent/.github/workflows/ci.yml` runs vitest matrix (ubuntu/windows/macos) + cargo + **Tauri WebDriver e2e against `e2e-mock` build**
- `hengjian/.github/workflows/test.yml` runs cargo (unit + `--ignored` integration vs postgres:16) + vitest + **Playwright e2e with seed SQL**

shadow-desktop CI is materially weaker than these siblings.

### 3.7 shadow-mobile integration tests silently skip

`integration_test/{api_flow,memory_flow,group_flow,model_share}_test.dart` all start with `isPrefrontalRunning()` and `return;` on false. **There is no CI matrix that boots prefrontal before these.** They run as smoke / skip checks only.

`integration_test/{conversation_flow,task_flow,app_test}_test.dart` use `app.main()` against a stub app context with **no live CortexClient**. The `cortex_client_test.dart` uses `http_testing.MockClient` only.

### 3.8 shadow-mobile BLE provisioning / USB audio / InCallService untested

The AGENTS.md documents `com.ibloc.shadow/ble_provision`, `com.ibloc.shadow/usb_audio`, `com.ibloc.shadow/call_state` channels. No `integration_test/*ble*`, `*usb_audio*`, or `*call*` files exist. v2.8-v2.6 platform channels all uncovered.

### 3.9 shadow-mobile Live Stream + Customer Service modes untested

`/livestream` and `/customer-service` documented in `AGENTS.md` but no `integration_test` covers them.

### 3.10 shadow-esp32 has zero unit tests

All source files (`audio.c`, `audio_pipeline.c`, `dialog_task.c`, `dtls.c`, `ice.c`, `io_task.c`, `led_task.c`, `main.c`, `net_task.c`, `provision.c`, `sctp_agent.c`, `srtp.c`, `stun.c`, `usb_audio.c`, `ws_client.c`) are pure C with **no unit-test runner** (no `tests/` dir, no `unity` / `ztest` usage). CI in `shadow-esp32/.github/workflows/*.yml` only runs `west build`. The end-to-end smoke in `dialog_task.c` is a `main()`-level integration, not a test.

### 3.11 shadow-desktop vitest v8 coverage thresholds not enforced

`vitest.config.ts` declares `statements: 50, branches: 40, functions: 45, lines: 50`. `desktop-test` job runs `pnpm exec vitest run` **without `--coverage`**, so the threshold exit code never fires.

---

## 4. Medium / Low priority gaps (P2/P3)

### 4.1 shadow-desktop store-contract tests don't exercise Tauri commands

`tests/stores/{cortexStoreSupervisor,resonanceStore}.test.ts` cover store contracts but not the actual `discover_resonance` / `resolve_resonance` Tauri commands in `lib.rs`.

### 4.2 No snapshot / visual regression

`themeStability.test.ts` exists but no Playwright snapshot mode is configured.

### 4.3 synapse / cerebellum / temporal / occipital / parietal / parietal-lobe have no CI workflow

`synapse/.github/workflows/` directory does not exist. `cerebellum/` is new — no CI yet. The 4 lobe repos (temporal / occipital / parietal / parietal-lobe) have inline tests but no automated gate.

### 4.4 Telencephalon's `cross_process_e2e.rs` isn't surfaced to shadow-desktop CI

The only place "boot cortex + boot temporal-lobe + HTTP-call" exists is `telencephalon/.github/workflows/ci.yml::telencephalon-integration` (postgres:16 service). shadow-desktop's CI doesn't reach into it.

### 4.5 cortex dir is empty — every Playwright spec is dead code on Windows

`tests/e2e-ui/global-setup.ts` line 6 hardcodes:
```ts
const CORTEX_BIN = '/home/ibloc/Projects/cortex/target/debug/cortex';
```
On Windows this path is unreachable. The `cortex/` directory at `C:\Projects\iBLOC\cortex\` is empty (no `.git`, no `Cargo.toml`, no source). **Every Playwright spec that hits `CORTEX_URL=http://localhost:60080` is effectively dead code in the current environment.**

**Concrete fix options** (out of scope for this assessment):
- Seed the empty `cortex/` dir from `ibloc-hr-agent/cortex` or repoint `CORTEX_BIN` to the actual telencephalon binary at `C:\Projects\iBLOC\telencephalon\target\debug\telencephalon`
- Switch from `spawn(CORTEX_BIN)` to a docker compose that builds cortex/telencephalon from the local checkout
- Drop the assumption entirely and have Playwright depend on a CI-injected `CORTEX_BIN` env var

---

## 5. CI matrix current state

| Project | Has CI? | What runs | What does NOT run |
|---|---|---|---|
| shadow (mono) | yes | `prefrontal-rust` (check/test/clippy), `desktop-test` (`vitest run`), `desktop-build` (tsc + build + build:web), `mobile-analyze` (`flutter analyze`) | Playwright e2e, WebDriverIO wdio, Tauri-driver, mobile `flutter test`, mobile `integration_test`, shadow-esp32 firmware, synapse/telencephalon/diencephalon/encephalon/cerebellum/hippocampus/neuron (each in its own repo CI) |
| telencephalon | yes | `cargo check/test/clippy/fmt/coverage` (cargo-llvm-cov) + `telencephalon-integration` vs `postgres:16` | end-to-end smoke against real lobes outside the workspace |
| prefrontal | yes | `cargo check/test --all-features/clippy/fmt/doc` | coverage tool |
| hippocampus | yes | `cargo fmt/clippy/lock --check`, `cargo build --release`, `cargo test --all` | coverage tool |
| neuron | yes | `cargo fmt/clippy/test --lib/build --all-features/audit` + `cargo-tarpaulin` → Codecov | `cargo test --tests` (only `--lib`) |
| synapse | **none** | — | full CI |
| diencephalon | yes | `cargo fmt/clippy/test --all-targets/doc` | — |
| encephalon | yes | same as diencephalon | — |
| cerebellum | **none** | — | full CI |
| temporal / occipital / parietal / parietal-lobe | **none** | — | full CI |
| shadow-esp32 | yes | `west build -b esp32s3_devkitc app --pristine` only | unit tests (none exist) |
| cortex (placeholder) | n/a | n/a | n/a (empty dir) |
| ibloc-hr-agent | yes | vitest matrix (ubuntu/windows/macos) + cargo + **e2e via Tauri WebDriver** | — |
| hengjian | yes | cargo (unit + `--ignored` integration vs postgres:16) + vitest + **Playwright e2e with seed SQL** | — |

**Shadow-desktop CI is materially weaker than its siblings.** The `ibloc-hr-agent` and `hengjian` patterns (Tauri WebDriver / Playwright in CI) are directly applicable.

---

## 6. Recommendations (prioritised)

### P0 — Critical, single-day fixes that unlock everything

| # | Action | Effort | Impact |
|---|---|---|---|
| **P0-A** | **Repoint `CORTEX_BIN` in `tests/e2e-ui/global-setup.ts`** to the actual `telencephalon` binary (or accept `CORTEX_BIN` from CI env). Currently the Playwright suite is dead code on Windows. | 1h | Restores all 28 Playwright specs as runnable tests |
| **P0-B** | **Wire Playwright + WDIO + tauri-driver into `shadow/.github/workflows/ci.yml`.** Mirror `ibloc-hr-agent`: `desktop-e2e` job builds shadow-desktop with `--features e2e-mock`, runs `pnpm test:e2e:setup && pnpm test:e2e` under xvfb. | 1 day | Validates the 84 test files actually run; gates regressions |
| **P0-C** | **Build out RecordingPage e2e** (the R1-R4 closure): Playwright + tauri-driver + fake `RecordingStore`. Drive `/recording` → start audio recording → wait for events → stop → assert summary. Covers all 6 `recording_*` Tauri commands + R1-R4 memory hooks. | 2 days | Closes the largest known uncovered flow |
| **P0-D** | **Promote Playwright e2e-conversation-flow + business-flow-ui from soft-skip to hard-assertion.** Replace `console.log('✓ lobe reachable')` with `expect(reply).toBeTruthy()` gated on `SHADOW_FULL_STACK=1`. | 1 day | Validates Shadow → Cortex (A2A) → Prefrontal (OpenAI /v1) |

### P1 — High priority, well-scoped

| # | Action | Effort | Impact |
|---|---|---|---|
| **P1-A** | **Workflow Studio editor e2e.** Drive `WorkflowStudioPage.tsx` against `cerebellum/crates/workflow-*` — create a node, connect, save, run, assert execution. | 3-5 days | Closes R-12/R-13 fully (code shipped, no test) |
| **P1-B** | **Computer-Use e2e.** Drive `ComputerUsePage.tsx` against real `cu_screenshot` → `cu_mouse_click` → `cu_read_ui_text` loop, asserting text matches what the page actually says. | 2 days | Validates R-10/R-11 code that shipped in `84418a2`/`9c46327`/`c37b163`/`b5743fc` |
| **P1-C** | **Shadow → neuron :8085 e2e.** From desktop binary, set `engine_url=http://localhost:8085`, open `/conversation`, send a prompt, assert response came from embedded neuron. | 1-2 days | Validates the architecture-regression guard `neuron_embedded_regression.rs` exists to protect |
| **P1-D** | **Shadow → Cortex (mTLS) → Resonance e2e.** Drive `discover_resonance` against a real resonance process started under test. | 2 days | Validates mTLS wire-through (`d05d4ba`) on the client side |
| **P1-E** | **OpenCode / Worktree / preview-window subsystem e2e.** Drive subsystemStore end-to-end: install opencode, create session, send message, assert reply; create worktree, switch, run `pnpm tauri dev` against it. | 3 days | Uncovers the largest single Tauri command surface |
| **P1-F** | **shadow-mobile real-Cortex e2e.** Drop `isPrefrontalRunning()→return;` skip pattern. Add CI matrix that boots cortex+prefrontal before running integration tests. | 2 days | Same gain as P0-D for the mobile surface |
| **P1-G** | **shadow-mobile BLE / USB audio / InCallService e2e.** Add `integration_test/{ble_provision,usb_audio,in_call_service}_test.dart` per the AGENTS.md channel surface. | 3 days | Closes v2.5-v2.8 mobile platform-channel coverage gap |
| **P1-H** | **Feishu MCP / mcp_catalog e2e.** Drive `add_server` / `remove_server` / `builtin_servers` runtime against a real `cortex:60080/api/cortex/mcp/...`. | 1 day | Validates the transport-aware MCPPage (`1c0c3ec`) |
| **P1-I** | **Multi-lobe orchestration e2e.** Extend `tests/e2e-ui/business-flow-ui.spec.ts` to post a request requiring `temporal` + `parietal` + `hippocampus` sequentially. | 2 days | Cross-lobe surface validated |

### P2 — Medium / structural

| # | Action | Effort | Impact |
|---|---|---|---|
| **P2-A** | **shadow-esp32 firmware unit tests.** Add `tests/` with `ztest` or `Unity` per-module tests for `audio_pipeline.c`, `dtls.c`, `ice.c`, `stun.c`, `srtp.c`, `sctp_agent.c`, `usb_audio.c`, `provision.c`. Wire `west test` into CI. | 1-2 weeks | First test coverage on the ESP32 firmware |
| **P2-B** | **Enforce v8 coverage thresholds in shadow-desktop CI.** Change `desktop-test` to `pnpm exec vitest run --coverage` and assert the threshold exit code. | 1h | Catches the 147 pre-existing failures the 2026-09-23 audit noted as "unrelated test files" |
| **P2-C** | **Promote `cross_process_e2e.rs` to shadow-desktop CI.** Run as a release gate that boots telencephalon + temporal-lobe + HTTP-call. | 0.5 day | Catches A2A regressions before desktop ships |
| **P2-D** | **Add synapse CI workflow.** `cargo test` on 22 integration files is unverified by automation today. | 0.5 day | Validates the substrate that everything rides on |
| **P2-E** | **Add cerebellum / temporal / occipital / parietal / parietal-lobe CI workflows.** Each has inline tests but no automated gate. | 1 day | Validates the 4-lobe split just landed |
| **P2-F** | **Snapshot / visual-regression** for the 28 Playwright specs. Add `@playwright/test` snapshot mode for `tests/e2e-ui/{conversation,agents,settings,models}.spec.ts`. | 1 day | Catches visual regressions |
| **P2-G** | **Auto-run `cross_process_e2e.rs` from shadow-desktop CI.** Release-gate behavior. | 0.5 day | A2A regression guard |
| **P2-H** | **Move the 23 vitest "e2e" files in `tests/e2e/*.test.tsx` to `tests/integration/`.** Rename for signal clarity. | 0.5 day | Honest audit signal — what is true e2e |
| **P2-I** | **Drop the empty `cortex/` directory or seed it.** The empty placeholder creates dead-code-by-environment. | 0.5 day | Removes a known footgun |

### P3 — Low priority / nice-to-have

| # | Action | Effort |
|---|---|---|
| **P3-A** | Coverage tooling for prefrontal / hippocampus / synapse (none today). | 1 day |
| **P3-B** | Doc-sync automation: a CI check that fails when `AGENTS.md` "Updated" header is older than the latest commit in the repo. | 0.5 day |
| **P3-C** | shadow-mobile unit + widget + integration_test in shadow's mono-repo CI. | 0.5 day |

---

## 7. Where this leaves us

**Test infrastructure at file-level is healthier than the audit captured.** shadow-desktop grew from "147 pre-existing failures" to 84 test files; telencephalon has 31 integration tests with real-binary cross-process coverage; synapse has 22; hippocampus has 16. **None of this growth is reflected in CI.**

**The structural issue isn't missing tests, it's missing CI gates.** The same shadow-desktop CI that ran before the audit still runs after. The 28 Playwright specs, 5 WDIO+chromedriver specs, 5 tauri-driver smoke specs, 23 vitest "e2e" files all exist on disk but **none are in CI**. The Playwright specs are additionally dead code on Windows because `global-setup.ts` hardcodes a Linux path to an empty directory.

**The biggest gap from the audit (RecordingPage) was closed in code (R1-R4 commits landed) but is now the biggest e2e gap.** Workflow Studio (R-12/R-13 closure, `4023493`) is in the same shape: code shipped, zero test coverage, zero CI gate.

**The Rust-side e2e matrix is the strongest part of the platform** (31 telencephalon tests, 16 hippocampus tests, 22 synapse tests), but it is **disconnected from the desktop/mobile surface**. Closing that loop — having shadow-desktop's Playwright suite assert against a telencephalon booted by the same workflow — would convert most of the P0 gaps into green coverage with a single sprint.

**The cortex empty-directory issue is a one-line `CORTEX_BIN` repoint** that unlocks every existing Playwright spec. It's the single highest-ROI fix on the list.

---

## Addendum (2026-09-26): telencephalon build + startup findings

After the 2026-09-25 doc pass, I built `telencephalon` to verify the Playwright path. New findings:

1. **Build:** `cargo build` from `C:\Projects\iBLOC\telencephalon` produces `target/debug/telencephalon.exe` in ~13 minutes. One-shot cargo warning, exit 0.

2. **Startup behavior (2026-09-26):** Running the binary without env vars boots neuron embedded on `0.0.0.0:8086` and prints `DATABASE_URL is not set; booting in in-memory mode`, then **hangs indefinitely** before reaching `axum::serve` on the configured 60080. No "Cortex public listening" log line ever appears. `curl http://127.0.0.1:60080/health` returns nothing. The HTTP listener is never reached.

3. **Suspect site:** `src/main.rs:241-243` — `if let Some(n) = neuron_handle.as_ref() { n.shutdown(); }` is called before `serve_embedded()`. If `NeuronHandle::shutdown()` waits for in-flight requests on neuron's router without a timeout, a single hung tokio task can block the main function forever. (Hypothesis — needs deeper investigation in the telencephalon repo; out of scope for this shadow-desktop assessment.)

4. **Practical workaround:** Until the hang is diagnosed, Playwright on Windows stays gated. Two cheaper paths:
   - Run the Playwright suite against a Linux CI runner where the hang may not reproduce (network socket + tokio runtime differences).
   - Refactor `global-setup.ts` to **skip Playwright gracefully** when telencephalon fails to bind (downgrade from `process.exit(1)` to `console.warn` + per-test `isCortexReachable()` check), then gate each spec with `test.skip(!cortexReachable)`. The 24 of 28 specs that don't actually hit `60080/health` would then run.

5. **out-of-scope:** the telencephalon hang is a telencephalon-repo bug, not a shadow-desktop test-infra bug. Tracking should live there.

---

## 8. Acceptance checklist

- [x] Per-repo test inventory with counts + runners + coverage tooling
- [x] P0/P1/P2 gap list with `file:line` references where verifiable
- [x] CI matrix current state per repo
- [x] Recommendations ranked by ROI
- [x] Identified the single biggest-ROI fix (P0-A: repoint `CORTEX_BIN`)
- [x] Acknowledged the gap-vs-2026-09-23-audit: code gaps closed, assertion-quality + CI-gating gaps widened
- [x] Documented the structural disconnect: Rust-side e2e is strong but isolated from desktop/mobile surface

---

## 9. Cross-cutting observations (separate from the ranked list)

- **Audit doc comparison.** The 2026-09-23 audit captured "shadow-desktop e2e gaps" at the code-missing level. This assessment finds the same gaps at the **assertion-quality + CI-gating level**, which the audit didn't measure. The two views are complementary — together they say "the test files exist; the test files aren't being run."
- **Sibling-repo contrast.** `ibloc-hr-agent` runs Tauri-driver e2e in CI; `hengjian` runs Playwright e2e in CI. Both shadow clients in the iBLOC org have the right pattern; shadow (the main one) doesn't.
- **No coverage data exists for 9 of the 11 Rust repos.** Only neuron (cargo-tarpaulin → Codecov) and telencephalon (cargo-llvm-cov → lcov) wire coverage into CI. Adding it to prefrontal/hippocampus/synapse is mechanical (1 day total).
- **The 4-lobe split landed in code (commit `965bc15`)** but only 2 of the 4 lobes have any kind of test file. temporal / occipital / parietal-lobe have inline `mod tests` only; parietal has 1 forecast e2e. With cerebellum now hosting the workflow schema + runtime (per `43f9e97`), the testing strategy needs to be re-thought — what's tested where.
- **Documented doc-state issues** (see companion [`2026-09-25-doc-sync-changelog.md`](2026-09-25-doc-sync-changelog.md)) compounded the test-discovery problem: AGENTS.md headers in 7+ repos are still dated 2026-07-19 even after 60+ commits, making it hard to know what's current.
