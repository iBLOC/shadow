---
**Updated:** 2026-09-23 (initial; pairs with [`2026-09-23-document-use-feishu-univer.md`](../architecture/2026-09-23-document-use-feishu-univer.md) — the implementation plan)
**Status:** 🔵 草案 → 评审中
**Author:** shadow-desktop
**Spec companions:** none yet (this doc *is* the spec for the document-use productization flow)
**Plan companions:** none yet
**Layer coverage:** L4 (shadow-desktop UI + Rust backend) + L3.5 (telencephalon + diencephalon MCP)
**Related docs:**
- [`../architecture/2026-09-23-document-use-feishu-univer.md`](../architecture/2026-09-23-document-use-feishu-univer.md) — capability matrix, surface area, 8-step implementation plan.
- [`2026-09-23-external-agent-website-development-scenario.md`](2026-09-23-external-agent-website-development-scenario.md) — WS-05 §Open work called this out as the "成品化" follow-up.
- [`2026-09-23-baby-cry-monitoring-scenario.md`](2026-09-23-baby-cry-monitoring-scenario.md) — same loop pattern (audio event → user notification) but the product surface is a message, not a doc.
- [`../architecture/2026-09-23-shadow-client-capabilities.md`](../architecture/2026-09-23-shadow-client-capabilities.md) — browser-use + computer-use + (now) document-use.

---

## 0. Why this scenario exists

The BC-* and WS-* scenarios both end at "agent finished; result sits in `~/.shadow/results/<task-id>/`". That's good enough for personal iteration but bad enough for delivery: the user wants a **polished, shareable artifact** to send to a collaborator, not a folder path they have to teach their colleague how to git-clone.

This scenario closes that loop:

```
agent finished
    ↓
result_manager.commit()         (P3 — local git history)
    ↓
document_init(task_id)          ← mounts <UniverSheet> in shadow's WebView
    ↓
human (or agent) edits cells
    ↓
document_save(task_id)          ← debounced auto-commit to local git
    ↓
[user clicks "Publish to Feishu"]
    ↓
document_publish_feishu(task_id)
    ↓
feishu_mcp.create_sheet → write_sheet → share
    ↓
{ spreadsheet_url }
    ↓
颞叶 renders "🎉 your doc is live at <url>"
```

Compared to today (commit + push only), this closes the loop: **agent output → shareable Feishu doc**, not just **agent output → file on local fs**.

---

## 1. Setup

- shadow-desktop is the host (Tauri 2 + React 19 + Vite 7).
- `FEISHU_APP_ID` + `FEISHU_APP_SECRET` env vars are set at startup; shadow calls Lark's `/auth/v3/tenant_access_token/internal` once and caches until expiry.
- A previous task (BC-* or WS-*) has finished and the result is in `~/.shadow/results/<task-id>/`. The result includes either:
  - a `summary.xlsx` (sheets scenario), or
  - a JSON descriptor the shadow docs call the "report shape" (generic — gets coerced into a sheet).
- User has the shadow-desktop GUI open and the task is visible in the task list.

---

## 2. Scenarios

### DOC-01 — Mount UniverSheet for a finished task

**Setup**: A WS-01 website-dev task `task-007` finished, agent produced `summary.xlsx` with ~5 sheets of project info.

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | User clicks the task in the task board | shadow-desktop frontend | UI event | `<UniverSheet>` is mounted via the route `/document/task-007`. |
| 2 | `UniverSheet` mounts and asks the backend for the workbook | React | Tauri `invoke` | `invoke('document_load', { task_id: 'task-007' })` |
| 3 | Backend loads `~/.shadow/results/task-007/summary.xlsx` from disk | `shadow-desktop/src-tauri` | local fs | Reads bytes via `tokio::fs`; returns `Vec<u8>` to the frontend. |
| 4 | Frontend constructs a Univer instance via `@univerjs/presets` | React | in-process JS | `FUniver.newAPI(univer).createWorkbookFromBytes(bytes)` mounts the xlsx into the `<div ref>` container. |
| 5 | User edits cells | React | in-process JS | Univer's editing model; auto-save debounce starts a 2 s timer. |
| 6 | User clicks "Publish to Feishu" | React | Tauri `invoke` | `invoke('document_publish_feishu', { task_id: 'task-007', title: 'Project Plan' })` |

**Edge cases** (separate sub-scenarios below):

- DOC-02 false-positive detection (WS-02 pattern)
- DOC-03 concurrent edits while publish is in flight
- DOC-04 publish failure → rollback / retry affordances
- DOC-05 user disables Feishu integration → saves stay local-only

**Acceptance (DOC-01)**

- `UniverSheet` mounts within ≤ 500 ms after `document_load` returns.
- Edits reflect back into Univer's working model within ≤ 50 ms (Univer's normal diff cycle).
- Save debounce fires within 2 s of last edit; local git commit lands with the task id as the commit message prefix.

---

### DOC-02 — Auto-commit on each cell edit (WS-03 pattern adapted)

**Setup**: User is mid-edit; no publish in flight.

**Flow**

| # | Step | Component | Protocol |
|---|---|---|---|
| 1 | Univer `onChange` callback fires (debounced 2 s) | React | in-process JS |
| 2 | `invoke('document_save', { task_id, snapshot })` | React → Tauri | Tauri `invoke` |
| 3 | `document_save` writes `summary.xlsx` back to `~/.shadow/results/<task-id>/` and runs `result_manager.commit(task_id, "edit: <one-line summary>")` | `shadow-desktop/src-tauri` | local fs + git2 (P3 surface) |
| 4 | Local git history now has N+1 commits; the UI's git-history panel refreshes | shadow-desktop | local |

**Acceptance**: local git history mirrors the user's edit cadence; no commit is generated for no-op edits (Univer's `onChange` should debounce on programmatic reloads as well as user typing).

---

### DOC-03 — Publish to Feishu (the headline flow)

**Setup**: DOC-01 state; user clicks "Publish".

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | `invoke('document_publish_feishu', { task_id, title, folder_token? })` | React → Tauri | Tauri `invoke` | |
| 2 | `document_publish_feishu` snapshots the current Univer model → JSON sheet-of-arrays-of-arrays | Tauri | in-process JS bridge | `univerAPI.getActiveWorkbook().getSnapshot()` |
| 3 | `feishu_sheet_create(title, folder_token)` → `spreadsheet_token` + `url` | Tauri → open-lark → Feishu | Lark Open API | |
| 4 | For each (sheet_name, values) in the snapshot: `feishu_sheet_write(spreadsheet_token, range, values)` | Tauri → open-lark → Feishu | Lark Open API | batched per sheet, 5000-row batches |
| 5 | `feishu_sheet_share(spreadsheet_token, member_type: 'email', member_id: <user>, perm: 'view')` | Tauri → open-lark → Feishu | Lark Open API | default permission = private + 1 viewer (the user). The user can re-share from the Feishu UI; shadow doesn't auto-share with anyone else. |
| 6 | Return `{ spreadsheet_token, url }` | Tauri → React | Tauri response |
| 7 | 颞叶 renders a result card with the URL | shadow-desktop | SSE / result card | |

**Acceptance**

- End-to-end publish ≤ 10 s for a 5-sheet workbook of typical size.
- Privacy default = private + 1 viewer (the user). Sharing further is up to the user via Feishu's native sharing UI.
- If any sheet's write fails, the create is rolled back (best-effort: delete the created sheet) and a clear error reaches the 颞叶 — no half-created docs.

---

### DOC-04 — Publish failure recovery

**Setup**: DOC-03 in progress; the network drops mid-publish.

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | `feishu_sheet_create` succeeds → `spreadsheet_token` | Tauri → Feishu | — | |
| 2 | `feishu_sheet_write` for sheet 1 fails (network drop) | Tauri → Feishu | — | |
| 3 | Best-effort rollback: `feishu_sheet_delete(spreadsheet_token)` to clean up the partial doc | Tauri → Feishu | — | Best-effort: if delete also fails, log the orphan `spreadsheet_token` so the user can clean up manually. |
| 4 | Return `Err(ComputerUseError::InputAction("publish failed at sheet 1, rolled back: ..."))` | Tauri → React | Tauri error response | |
| 5 | 颞叶 renders the failure with retry / cancel affordances (WS-05 pattern) | shadow-desktop | SSE | |

**Acceptance**: zero half-created sheets survive a failure. A user-readable error reaches 颞叶 within ≤ 5 s of failure.

---

### DOC-05 — Disabling Feishu (local-only mode)

**Setup**: User opts out of Feishu integration in shadow's settings (Settings → Integrations → Feishu → Off).

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | Settings flip writes `FEISHU_ENABLED=false` to shadow's encrypted store | shadow-desktop | Tauri `invoke` | |
| 2 | Subsequent `document_publish_feishu` calls return `Err("feishu integration disabled")` | Tauri | — | |
| 3 | The "Publish to Feishu" button in `<UniverSheet>` is hidden / disabled | React | — | |
| 4 | DOC-01 / DOC-02 continue to work; only DOC-03 / DOC-04 are gated | — | — | |

**Acceptance**: integration off → zero Feishu network calls; integration on → exactly one `feishu_sheet_create` per publish.

---

## 3. Inter-component protocol summary

| Edge | Protocol | Note |
|---|---|---|
| `UniverSheet` (React) ↔ `document_load` / `document_save` | Tauri `invoke` (JSON over IPC) | snapshot round-trip via xlsx bytes |
| `document_publish_feishu` ↔ `feishu_mcp` server | in-process `synapse::mcp::SimpleMcpServer` | same MCP substrate as diencephalon (P1) and hippocampus |
| `feishu_mcp` ↔ Feishu Open API | open-lark `0.14` crate | Lark Open Platform over HTTPS |
| Univer editing surface ↔ result_manager (P3) | local fs + git2 | each `document_save` triggers a `result_manager.commit` |
| Tauri ↔ Tauri (within shadow-desktop) | already-established Tauri command bus | consistent with browser-use / computer-use |

---

## 4. Failure modes + affordances (summary)

| Failure | Affordance |
|---|---|
| Feishu network drop mid-publish | Retry (best-effort) / Cancel / show orphan token |
| `tenant_access_token` expired | Re-auth flow (re-fetch with app_id + app_secret); user just hits retry |
| Univer save debounce races with click | Last write wins; debounce is a 2 s timer, easily extendable |
| User edits after publish (without re-publish) | The local edit is in git history; the published sheet is stale. Show a "republish" affordance next to the URL. |
| Feishu rate limit | Backoff; surface "Feishu is rate-limiting; retry in 30 s" |

---

## 5. Open work

- **DOC-06 offline support**: when the user is offline, `document_publish_feishu` queues the publish in shadow's local store and fires when the network returns. (Queued publishes also visible in 颞叶.)
- **DOC-07 incremental publish**: when the user clicks "Publish", ship only the diff since the last publish (`git diff` + `feishu_sheet_write` of changed cells). Cuts bandwidth and avoids overwriting Fe-side formatting the user may have added on the published sheet.
- **DOC-08 templates**: a template registry `~/.shadow/templates/` lets the user pick a starting layout (budget, project plan, status report, …) before `document_init`. Templates ship as xlsx files shadow-desktop bundles via `tauri.conf.json` `bundle.resources`.
- **DOC-09 docs + slides**: the v1 cut is sheets-only. Docs / Slides are follow-ups once Univer's modules are wired.

---

## 6. Acceptance checklist

- [x] Setup (env, prior commit, integration point) defined
- [x] DOC-01..DOC-05 each have 9-row flow table + edge cases + acceptance
- [ ] DOC-01 implemented (npm univer + Tauri command + component)
- [ ] DOC-02 implemented (auto-commit on save)
- [ ] DOC-03 implemented (publish to Feishu end-to-end)
- [ ] DOC-04 implemented (rollback + retry)
- [ ] DOC-05 implemented (settings gate)
- [ ] Integration test against a Feishu mock server (`open-lark` substituted by a stub)
- [ ] End-to-end test: task finishes → user edits → publish → URL returned
- [ ] Privacy default verified (private + 1 viewer)
- [ ] Performance: ≤ 10 s publish for 5 sheets