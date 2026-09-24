---
**Updated:** 2026-09-23 (initial; companion to the telencephalon AGENTS §4-lobe model and to the audit doc that flagged R-12/R-13 as a missing workflow editor. This doc maps the four lobes to concrete repo targets so the team can decide whether / when to actually split)
**Status:** 🔵 Design — no code moved yet
**Author:** shadow-desktop + telencephalon
**Related:**
- [`telencephalon/AGENTS.md` § 4-lobe model (2026-09-23 commit 27ab880)](https://github.com/iBLOC/encephalon/blob/master/AGENTS.md#4-lobe-model-new--2026-09-23)
- [`2026-09-23-shadow-client-capabilities.md`](2026-09-23-shadow-client-capabilities.md) — the three client capabilities (browser-use / computer-use / document-use) live in shadow-desktop's Tauri backend today; the 4-lobe split is the orthogonal "who-runs-the-agent" question
- [`2026-09-23-shadow-desktop-uiux-audit.md`](2026-09-23-shadow-desktop-uiux-audit.md) — R-12/R-13 (workflow editor) + 顶叶 entry in the 4-lobe nav
- [`2026-09-23-qiankun-evaluation.md`](2026-09-23-qiankun-evaluation.md) — orthogonal: viewer embedding, not lobe structure

---

## 0. The proposal

Today the four functional "lobes" of the shadow platform live in three different repos, often overlapping:

| Lobe | Where the code lives today | Proposed repo | Repo name |
|---|---|---|---|
| **颞叶 (Temporal)** — user dialog surface (chat, SSE render) | `shadow-desktop/src/pages/ConversationPage.tsx`, `components/chat/*` | `iBLOC/temporal-lobe` | `temporal-lobe` |
| **枕叶 (Occipital)** — visual QA + screenshot pipeline | `telencephalon/src/visual_qa/*`, `cortex/src/lobes/visual_qa.rs::*VisualQALobe` | `iBLOC/occipital-lobe` | `occipital-lobe` |
| **顶叶 (Parietal)** — workflow authoring (drag-drop nodes) | (not yet implemented; only docs reference it) | `iBLOC/parietal-lobe` | `parietal-lobe` |
| **前额叶 (Prefrontal)** — intent classification + agent dispatch | `iBLOC/prefrontal` (separate crate, port 8082) + `telencephalon/src/lobes/prefrontal.rs` dispatcher | **`iBLOC/prefrontal`（已有仓，即前额叶 GitHub home — 不新建不改名）** | `prefrontal` |

Splitting these into independent repos unlocks per-lobe ownership boundaries: each team can ship on its own cadence, choose its own transport (A2A / ACP / direct), and accept / decline PRs independently. It also clarifies the boundary the audit flagged as missing (R-12/R-13 — 顶叶 workflow editor entry).

The split is **not** mechanical code movement — three of the four lobes need to *gain* code first (顶叶 in particular doesn't exist). The split is primarily an organisational / repo-shape question; what each repo *contains* is set by its design doc.

**The split does NOT change the wire protocols.** A2A still crosses device / lobe boundaries; ACP still lives inside shadow-desktop for in-process lobe chatter; MCP still exposes tool calls. What changes is where the source for each lobe lives — and that source tree becomes independently versioned + releasable.

---

## 1. Status per lobe

### 1.1 颞叶 (Temporal) → `iBLOC/temporal-lobe`

**Code locations today**:
- `shadow-desktop/src/pages/ConversationPage.tsx` (~620 LoC)
- `shadow-desktop/src/components/chat/*` (AgentClarificationDialog, BindModelDialog, ClientToolForm, ToolApprovalCard, ToolOutputCard, ToolPartRouter, VisualQaClarificationChip, AudioEventChip, FeishuPublishedCard, ComputerUsePendingModal)
- `shadow-desktop/src/stores/conversationStore.ts`
- `shadow-desktop/src/lib/cortexClient.ts` (HTTP client to cortex/telencephalon)

**Proposal**:
- New repo `iBLOC/temporal-lobe` with `packages/temporal-lobe-core/` (React 19 + TS + Vite, MIT/Apache 2.0 licensed).
- The 10 files above move as-is. `cortexClient.ts` becomes `temporalApi.ts` (just a rename — its HTTP calls to cortex stay the same).
- Future lobe extensions (4-lobe page extensions, artifact viewers) start in this repo rather than shadow-desktop.

**What does NOT move**:
- `shadow-desktop/src-tauri/` stays in shadow-desktop (it's the Tauri shell — the host, not a lobe).
- The Tauri command surface (`preview_open`, `cu_*`, `document_*`, `feishu_*`) stays in shadow-desktop; temporal-lobe invokes it via `@tauri-apps/api/core`'s `invoke`.

**Dependency**: depends on shadow-desktop (npm) for Tauri APIs. Inverts today: today shadow-desktop is the deployable artifact, tomorrow temporal-lobe ships and shadow-desktop consumes it.

**Migration plan**:
1. Create repo + skeleton (Cargo-style): LICENSE, AGENTS.md, package.json (React 19, Vite, react-router-dom 7).
2. Copy the 10 files verbatim.
3. Add `vite.config.ts` with a Tauri-shell aliasing setup OR publish as a plain web bundle that shadow-desktop renders via an iframe / Web Component (see the qiankun-evaluation doc for the iframe rejection — Tauri WebviewWindowBuilder is the answer for v1; for v2 consider module-federation).
4. shadow-desktop package.json: `"temporal-lobe": "file:../temporal-lobe"` and rewire imports.

### 1.2 枕叶 (Occipital) → `iBLOC/occipital-lobe`

**Code locations today**:
- `telencephalon/src/visual_qa/*` (visual QA server handlers)
- `telencephalon/src/api/visual_qa_*` (HTTP API surface)
- `telencephalon/src/lobes/visual_qa.rs::*VisualQALobe` (Spec #3 / #6 — dispatcher + capture loop)
- `telencephalon/src/cortex/src/lobes/visual_qa.rs::*VisualQALobe` (the dispatch side)

**Problem**: `枕叶` is half in `telencephalon` and half in `cortex` (now `telencephalon`'s cortex module). The visual_qa.rs in telencephalon is the receiving side; cortex/lobes/visual_qa.rs is the dispatching side. The split across these two files mirrors the 4-lobe dispatcher pattern but is awkward to evolve separately.

**Proposal**:
- New repo `iBLOC/occipital-lobe` with two crates:
  - `crates/occipital-lobe-server/` (Rust, axum): visual QA HTTP surface, mage_vl client wrapper
  - `crates/occipital-lobe-agent/` (Rust, lib): the in-process VisualQALobe struct + Spec #3/#6 logic
- Shadow-desktop consumes `occipital-lobe-agent` (A2A client) for the user-facing "Source picker" chip (VisualQaClarificationChip). The HTTP server runs as a sibling process (or in shadow-desktop's Tauri backend) talking A2A.

**What does NOT move**: VisualQaClarificationChip (React) stays in shadow-desktop; only the Rust lobes move.

**Migration plan**:
1. `git mv telencephalon/src/visual_qa/* occipital-lobe/crates/occipital-lobe-server/src/`
2. `git mv telencephalon/src/lobes/visual_qa.rs occipital-lobe/crates/occipital-lobe-agent/src/lib.rs` (rename)
3. Update imports across telencephalon (path deps → workspace deps)
4. Cut a v0.1.0 release of occipital-lobe; update telencephalon's Cargo.toml to depend on it

### 1.3 顶叶 (Parietal) → `iBLOC/parietal-lobe`

**Status**: **not implemented**. `parietal-lobe` doesn't exist locally OR on GitHub (verified in the audit round). The design lives in 2026-03-14 plan docs only.

**Proposal**:
- New repo `iBLOC/parietal-lobe` (greenfield, monorepo).
- Workspace:
  - `apps/frontend/` — Next.js + Tailwind + shadcn-style components (per the 2026-03 plan); drag-drop node editor
  - `apps/api/` — Axum HTTP API for workflow CRUD
  - `packages/runtime/` — workflow execution engine (talks to diencephalon via MCP, telencephalon via A2A)
  - `packages/schema/` — JSON schema for workflow descriptors

**Why greenfield and not extract**:
- The current "顶叶" code surface is zero lines (no Rust file, no TS file). There's nothing to extract.
- Trying to extract from anywhere (telencephalon, shadow-desktop) would be a lossy "design-from-fossil" exercise.
- Greenfield gives the team license to make API decisions that match v1 reality (BS-04 has direct WebSocket → telencephalon, not the HTTP+Postgres the 2026-03 plan described).

**Migration plan**:
1. Create repo + LICENSE (Apache-2.0) + AGENTS.md.
2. Build `packages/schema/` first: the JSON shape a workflow descriptor has.
3. Build `packages/runtime/`: takes a descriptor, runs the flow, talks to MCP / A2A.
4. Build `apps/api/`: CRUD on top of runtime.
5. Build `apps/frontend/`: workflow editor + run-trace viewer.
6. R-12 fix done: shadow-desktop adds a "Workflows" / "Tasks" nav entry that opens a WorkflowEditorPage hosted by an occipital-lobe WebViewWindow.

### 1.4 前额叶 (Prefrontal) → `iBLOC/prefrontal`（已有仓即 home）

**Code locations today**:
- Standalone `iBLOC/prefrontal` repo at port 8082 (Rust, OpenAI / Anthropic compatible)
- `telencephalon/src/lobes/prefrontal.rs::*prefrontal dispatcher + TemporalLobe`

**定论（2026-09-25）**：GitHub 上四个 lobe 全部已有正式仓，均用裸名（无 -lobe 后缀）：
- 颞叶 → `iBLOC/temporal`（Sprint 2/4 — ASR/TTS 音频管线 + WebRTC Companion）
- 枕叶 → `iBLOC/occipital`（Mage-VL 默认视频/图像理解 + neuron_client）
- 顶叶 → `iBLOC/parietal`（ChatBI + Chronos2 forecast + DataFusion SessionContext）
- 前额叶 → `iBLOC/prefrontal`

拆分方式随之修正：不是新建仓，而是把本会话新写的管线模块直接集成进
各既有仓（temporal: src/audio_pipeline.rs；occipital: src/video_pipeline.rs；
parietal: src/workflow_schema.rs + src/workflow_runtime.rs，均已提交推送）。
telencephalon 经路径依赖 + pub use 重导出，既有调用方零改动。
先前误建的 -lobe 骨架目录已删除。

**Proposal**:
- ~~Rename~~ — 不改名。GitHub 上 `iBLOC/prefrontal` 即前额叶 home（commit f2d0015 已推送）。
- In `telencephalon/src/lobes/prefrontal.rs`: the `TemporalLobe` struct + dispatcher stays. It's the in-process lobe part that talks to prefrontal-lobe over A2A. The dispatcher lives in telencephalon because it has to know how to route incoming tasks to specific lobes — that's an orchestration concern, not a prefrontal-lobe concern.

**What does NOT move**: any of the cortex/lobes/prefrontal.rs code. It's already correctly placed in telencephalon.

**Migration plan**:
1. Update prefrontal repo's AGENTS.md to align with the 4-lobe matrix (it already documents its role; just refresh the cross-link to telencephalon/AGENTS.md).
2. Document the A2A contract with telencephalon — already mostly documented in WS-01..05 scenarios.
3. Done. The prefrontal repo IS the prefrontal-lobe; the rename is cosmetic.

---

## 2. Repo-creation checklist (operational)

The `gh` CLI isn't available in this dev environment so the actual `git init` / `gh repo create` calls need to be run by a human or CI. Until then, the docs in this file + the existing `telencephalon/AGENTS.md` § 4-lobe model are the canonical reference.

When the splits happen, the order should be:

1. **parietal-lobe** (greenfield, no code to move)
2. **occipital-lobe** (Rust crate extraction from telencephalon — smallest blast radius)
3. **前额叶**：已完成 — GitHub home 即 `iBLOC/prefrontal`，无需动作
4. **temporal-lobe** (React extraction from shadow-desktop — biggest because it has the most files + the chat surface depends on Tauri APIs that need re-wiring)

The order minimizes risk: greenfield first, then small Rust moves, then naming, then the big React move.

---

## 3. Open questions

1. **Naming convention**: `iBLOC/{lobe}-lobe` vs `iBLOC/{lobe}`. Parietal already uses `parietal-lobe`; prefrontal doesn't. The 4-lobe matrix in `telencephalon/AGENTS.md` uses bare names (颞叶, 枕叶, 顶叶, 前额叶). Naming should probably converge. Recommendation: use `-lobe` suffix for repo consistency with the term used in the lobe matrix.

2. **Versioning cadence**: each lobe repo on its own semver? Or shared workspace version? Recommended: independent semver. Lobe owners ship on their own timeline; downstream consumers (shadow-desktop, telencephalon) pin specific versions.

3. **Cross-lobe contracts**: A2A schemas for "ask 颞叶 to display a message" or "ask 枕叶 to capture frame X" — where do these live? A central `iBLOC/lobe-contracts` repo with JSON Schema / protobuf definitions would be the canonical place. Out of scope for v1.

4. **Shared infrastructure**: should the 4 lobes share a workspace via `iBLOC/lobes-workspace`? Probably yes (shared CI, shared Cargo.lock policy, shared release tooling). Defer until at least 2 lobes exist.

5. **顶叶 timing**: the lobe is the most valuable (real workflow editor = real product), but also the largest to build. Sequencing: do 顶叶 before or after the other splits? My recommendation: after the smaller splits are done, so the team has infra (CI for lobe repos, shared workspace tooling) before committing to a 6-month workflow-editor build.

---

## 4. Acceptance checklist (this doc)

- [x] Mapping of 4 lobes to 4 proposed repos
- [x] Code locations for each lobe identified
- [x] Migration plan per lobe (including non-trivial notes on temporal / occipital)
- [x] Sequencing (which lobe first)
- [x] Open questions enumerated
- [x] Acknowledgement that `gh` isn't in this env so the actual `git init` calls are the user's responsibility

---

## 5. What I did vs what's pending

- ✅ This doc — written + commit-ready
- ⏸️ Actual repo creation (`gh repo create iBLOC/{lobe}-lobe --private`) — needs a human with `gh` auth or the GitHub web UI
- ⏸️ Parietal-lobe greenfield implementation (R-12/R-13) — multi-week standalone work
- ⏸️ Occipital-lobe extraction — needs the telencephalon code path to be cleanly factored first (the cortex/lobes/visual_qa.rs side currently references internal types)
- ⏸️ Temporal-lobe extraction — needs shadow-desktop's Tauri command surface to be exposed as a TS library so the lobe can be a peer dependency
- ⏸️ Prefrontal-lobe rename — trivial; should happen alongside the other renames