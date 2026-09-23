---
**Updated:** 2026-09-23 (initial feasibility + architecture)
**Status:** 🟢 Recommended for v1 (alignment with "成果物 成品化" requirement from the user's earlier session); implementation is a multi-PR follow-up — see §6.
**Author:** shadow-desktop + diencephalon
**Related:**
- [`2026-09-23-shadow-client-capabilities.md`](2026-09-23-shadow-client-capabilities.md) — browser-use + computer-use. document-use is the **third** client capability; this doc extends that matrix.
- [`2026-09-23-qiankun-evaluation.md`](2026-09-23-qiankun-evaluation.md) — rejected qiankun for the same "embed viewer in shadow" problem. **Univer does not need qiankun either**: it's a React component (npm package `@univerjs/presets`), not a separate web app.
- [`../scenarios/2026-09-23-external-agent-website-development-scenario.md`](../scenarios/2026-09-23-external-agent-website-development-scenario.md) — WS-05 calls this out as a follow-up: "成果管理 — 把成品丢回飞书云文档".

---

## 0. The user's ask

> "univer能否实现document use配合飞书mcp实现结果物的成品化"

Restated: can shadow use **Univer** to drive a **document-use** capability (author / edit spreadsheets, docs, slides inline in shadow), then **push the finished artifact to Feishu** via a **飞书 MCP server**, so the AI's raw output becomes a shareable Feishu doc?

Answer: **yes.** Univer is the right editor surface (React component, drops into shadow's existing WebView without micro-frontend machinery); the Feishu MCP ecosystem already has Rust implementations; combining them closes the "成果物 成品化" loop that today stops at "the agent finished but the result is stuck in local fs".

This doc lays out the design + a concrete implementation plan.

---

## 1. Univer recap (from earlier research)

| | |
|---|---|
| Repo | `dream-num/univer` |
| License | Apache-2.0 |
| Scale | 15.9 k stars · 5.8 k commits · active |
| Embedding | npm package; drops into any React (or plain JS) host via `<div id="app">` mount |
| Sheets | formulas, formatting, filtering, sorting, conditional formatting, tables, comments |
| Docs | rich text model, lists, hyperlinks, comments |
| Slides | data model + UI (active development) |
| API | OpenAI-style FacAPI (`FUniver.newAPI(univer)`) — programmatic read / write / commands |
| i18n | EN / zh-CN / zh-TW / ja / ko / es |
| Headless rendering | xlsx import + JS-only rendering (no UI) — `Univer.new()` w/o `UniverUIPlugin` |

Univer is **not** an iframe / separate web app — it's an npm package. The micro-frontend argument from the qiankun doc **doesn't apply**: there's nothing to embed with `import-html-entry` because Univer runs in the same JS runtime as shadow.

---

## 2. Feishu / Lark MCP landscape

| | |
|---|---|
| `open-lark` crate | enterprise-grade Lark/Feishu Open API SDK, Apache-2.0, currently `0.14.0`. Covers sheets / docs / bitable / wiki / drive / IM. Chinese-first docs. Maintained. |
| `feishu-sdk` | smaller, `0.1.2`, narrower surface |
| `larkrs-mcp-server` | community Rust MCP server wrapping Lark endpoints, ~3 stars, last update Jun 2025 — usable reference but not production-grade |
| `isagoakira/feishu-mcp-server` | similar community MCP server, "production-ready" claim, last update May 2025 |
| Auth | Lark uses `tenant_access_token` (app-level) or `user_access_token` (per-user) — both supported by `open-lark` |

The Feishu open platform itself rolled out official MCP support in 2025; the mature path for Rust is to write a thin MCP wrapper on top of `open-lark` (rather than depend on a community MCP server). ~1 day of work for a useful first cut.

---

## 3. The third client capability: `document-use`

Alongside browser-use (WebView per preview) and computer-use (mouse / keyboard / UIA), document-use is:

| | |
|---|---|
| **What** | Author / edit / read a spreadsheet, doc, or slide inline in shadow. |
| **How** | Univer npm package, mounted as a React component in shadow's main WebView. |
| **Save to** | local fs (via Tauri command) **and/or** Feishu (via Feishu MCP). |
| **Trust boundary** | Same JS runtime as shadow's main app. Sandboxing done at the Univer-data level (cells hold untrusted strings / formulas — never `eval`'d; formulas run in Univer's sandboxed expression engine). |
| **Sharing** | The user explicitly hits "Publish to Feishu" → Feishu MCP creates a doc, returns the share URL. |

### 3.1 Why Univer (not Office Online, not Google Docs, not onlyoffice)

- **Apache-2.0**, vendor-neutral, no external SaaS dependency for the editor itself
- **React-native**: no micro-frontend framework needed (the qiankun rejection still holds — Univer ships as a React component, you mount it with `<Univer />`)
- **Files stay local** — Univer persists to JSON / xlsx; no required cloud upload
- **FacAPI** is OpenAI-style — easy to drive from any agent, not just shadow's
- Sheets / Docs / Slides all in one package; consistent API surface

### 3.2 Where it lives in shadow's React tree

```
shadow-desktop frontend (React 19 + Vite)
├── main shell (chat surface, agent panels)
└── <UniverSheet taskId={id} />          ← new
     │
     ├── onMount  → load univer workbook from Tauri:
     │            invoke('document_load', {task_id, source: 'local'|'feishu'|'template'})
     ├── onChange → debounced save:
     │            invoke('document_save', {task_id, snapshot})
     └── user actions → "Publish to Feishu"
                      invoke('document_publish_feishu', {task_id, title, folder_token?})
```

No qiankun. No micro-frontend. Just a React component dropped into the existing shadow shell. Bundle size: Univer's sheets bundle is ~300 KB gzipped; docs + slides each ~150 KB. Loaded only on the Document tab.

---

## 4. The productization loop (WS-05 follow-up)

The flow from WS-05 (external-agent website dev) becomes:

1. Agent in shadow-desktop (or via A2A from another device) finishes generating the artifact.
2. `result_manager.commit()` (P3) writes the working-tree files into `~/.shadow/results/<task-id>/` and commits.
3. **NEW** `document_init(task_id, template)`:
    - shadow-desktop mounts a `<UniverSheet>` component.
    - Tauri backend loads `~/.shadow/results/<task-id>/summary.xlsx` (or a configurable template) via Univer's xlsx import.
    - Agent (or human) edits cells inline.
    - Tauri backend auto-commits each cell change to the local git repo (P3 hook).
4. **NEW** `document_publish_feishu(task_id, title)`:
    - Feishu MCP `create_sheet` → returns `spreadsheet_token` + `url`.
    - Feishu MCP `write_sheet_values` to fill from current Univer snapshot.
    - Feishu MCP `add_permission_member` to share with the user's collaborators.
    - Returns the share URL → 颞叶 renders the result card.
5. User opens the Feishu URL → polished, shareable artifact. Shadow-desktop's working copy stays in the local git repo for future iteration.

Compared to today (commit + push only) this closes the loop: **agent output → shareable doc**, not just **agent output → file on local fs**.

---

## 5. The Feishu MCP server shape (Rust side)

```
shadow-desktop/src-tauri/src/feishu_mcp/
├── mod.rs        // FeishuMcpServer: wraps open-lark, builds synapse::mcp::SimpleMcpServer
├── config.rs     // FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_REDIRECT_URI env-driven
├── client.rs     // thin open-lark wrapper for sheet/doc/bitable operations
└── tools/
    ├── sheets.rs   // read / write / create / share sheet tools
    ├── docs.rs     // read / write / create document tools
    ├── bitable.rs  // bitable CRUD tools
    └── drive.rs    // file / folder helpers
```

Tool examples (initial cut):

```text
feishu_sheet_create(title, folder_token?)          → { spreadsheet_token, url }
feishu_sheet_read(spreadsheet_token, range)       → { values, range }
feishu_sheet_write(spreadsheet_token, range, values)
feishu_sheet_share(spreadsheet_token, member_type, member_id, perm)
feishu_doc_create(title, folder_token?)            → { doc_token, url }
feishu_doc_read(doc_token)                        → { content, blocks }
feishu_doc_append(doc_token, content)
feishu_bitable_list_records(app_token, table_id)   → { records }
feishu_bitable_create_record(app_token, table_id, fields)
```

All 11 tools (or however many we ship in v1) wrap `open-lark` calls and ride the existing `synapse::mcp::SimpleMcpServer` wire — same MCP substrate diencephalon uses for its 4 tools.

Auth:
- App-level: `FEISHU_APP_ID` + `FEISHU_APP_SECRET` → exchange for `tenant_access_token` (cached until expiry)
- User-level: OAuth flow → `user_access_token` stored in shadow's encrypted secret store

v1 ships **app-level only**; user-level OAuth is a follow-up.

---

## 6. Concrete implementation plan (when you give the go)

| Step | Work | Estimated size | Risk |
|---|---|---|---|
| 6.1 | Add `@univerjs/presets` + `@univerjs/sheets` + `@univerjs/engine-render` to `shadow-desktop/` `package.json`; mount `<UniverSheet>` in a new `/document/:taskId` route | ~300 KB gzipped bundle; 1 new page; new `useUniverSheet` hook | low — Univer is well-documented |
| 6.2 | Tauri commands: `document_load` / `document_save` / `document_publish_feishu` (stub for now, real impl in 6.5) | ~200 LoC | low |
| 6.3 | Add `open-lark = "0.14"` to `shadow-desktop/src-tauri/Cargo.toml`; build `feishu_mcp` module skeleton with config + client | ~300 LoC; new dep | medium — `open-lark` API surface is large; pin to a minimal feature subset |
| 6.4 | Implement `feishu_sheet_*` + `feishu_doc_*` MCP tools (5-8 of the 11 above); wire into a `synapse::mcp::SimpleMcpServer` instance on AppState | ~500 LoC | medium |
| 6.5 | Implement `document_publish_feishu` Tauri command: snapshot current Univer → `feishu_sheet_create` + `feishu_sheet_write` + `feishu_sheet_share` → return URL | ~100 LoC | low |
| 6.6 | Scenario doc: `2026-09-23-document-productization-scenario.md` walking the full agent → Univer → Feishu loop | ~200 LoC doc | n/a |
| 6.7 | Tests: Tauri command smoke tests; Feishu MCP wrapper integration tests against a mock server | ~200 LoC tests | medium — can't run in current env (ziti-sdk blocker in shadow-desktop tests); same caveat as P3/P4/P5 |
| 6.8 | Commit + push (one bundle PR per step 6.1-6.6, or one combined PR — your call) | — | — |

---

## 7. Why this isn't another micro-frontend debate

| Concern | Verdict |
| |
| "Is Univer a separate web app we need to embed via qiankun?" | **No.** Univer is a React npm package; it's mounted with `<UniverSheet />` in shadow's existing app. Same JS runtime, same React tree. qiankun / single-spa / Module Federation solve the cross-bundle-autonomy problem, which we don't have. |
| "Is Univer a separate web app we serve from shadow's Tauri resources?" | **No.** Univer is npm; it runs in shadow's existing WebView. No static-asset shipping, no entry HTML parsing. |
| "Is this the same question as the browser-use / computer-use capabilities?" | **Adjacent, not the same.** browser-use spawns a separate OS WebView per preview URL. computer-use drives the host's mouse / keyboard. document-use is **inline** — the editor mounts in shadow's main WebView because it's where the user is interacting with their content. |
| "Do we need Web Components for Univer?" | **No.** Univer is React already; Web Components would be a downgrade (synthetic React DOM in a custom element is exactly what qiankun does and what we're avoiding). |
| "Does Univer respect Tauri capability boundaries?" | **Yes — but the trust boundary is the React app itself.** Tauri commands gate writes to disk / Feishu. Univer's runtime is sandboxed (no `eval`, no `new Function`, formula parser runs in a restricted environment) so a malicious xlsx file can't escape the editor. |

---

## 8. Open questions / decisions

1. **Scope of the first cut** — sheets only? sheets + docs? all three (sheets + docs + slides)? Recommendation: sheets only for v1 (covers the "成品化" use case — financial models, project plans, status reports); docs + slides in follow-up.
2. **Feishu auth** — app-level only for v1 (FEISHU_APP_ID + FEISHU_APP_SECRET env vars), or user-level OAuth too? Recommendation: app-level only — simpler config, shadow acts on the user's behalf via a pre-installed Feishu app.
3. **Where does the Feishu MCP server live** — same process as the Tauri backend (SimpleMcpServer in-process), or a separate child process that the Tauri backend talks to over stdio? Recommendation: **in-process** for v1 — same pattern as diencephalon's MCP server (P1). Child process is the v2 if we ever need to deploy the MCP server standalone for other iBLOC clients.
4. **Permission scope on publish** — when shadow publishes a sheet, who can see it? Recommendation: v1 default = private (only creator visible), with an explicit "Share with…" affordance in the 颞叶 UI before publishing.
5. **Local → Feishu sync** — when the user edits a cell in Univer, do we auto-commit to local git (P3 hook) and optionally to Feishu on save? Recommendation: local auto-commit on every change; Feishu push is user-initiated ("Publish" button).

---

## 9. Acceptance checklist (this doc + future implementation)

- [x] Univer evaluated as editor surface (vs Office Online / Google Docs / onlyoffice)
- [x] Feishu MCP landscape surveyed (Rust crates + community servers)
- [x] Architecture documented (component placement, MCP server shape, productization flow)
- [x] Recommendation: inline `<UniverSheet />` + in-process Feishu MCP on top of `open-lark`
- [x] Concrete 8-step implementation plan (§6)
- [ ] Approval to implement
- [ ] `npm i @univerjs/presets @univerjs/sheets @univerjs/engine-render`
- [ ] `Cargo.toml`: `open-lark = "0.14"`
- [ ] Tauri command + React component + Feishu MCP server + scenario doc