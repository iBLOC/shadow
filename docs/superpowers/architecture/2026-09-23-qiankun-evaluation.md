---
**Updated:** 2026-09-23 (initial evaluation; recommendation: **don't** adopt qiankun for v1 — use the dedicated-WebViewViewWindow path that P4 already shipped)
**Status:** 🔵 评估完成 (rejected for v1; revisit if a future scenario scenario demands inline embedding)
**Author:** shadow-desktop
**Spec companions:** none
**Plan companions:** none

---

## 0. Why evaluate qiankun at all

The user asked whether shadow-desktop could embed a micro-frontend framework (**qiankun** specifically) so that diencephalon's workflow viewer / editor could be displayed inside shadow directly — avoiding code duplication or other ways of re-implementing the same viewer.

The intent behind the is reasonable: diencephalon is the data-gateway + sensory pipeline, and a UI to inspect / edit its workflows (data sources, ring-buffer layouts, MCP-exposed tools, etc.) is a real piece of UI work that lives on the boundary between the Rust backend and a web surface. Building it twice — once as a standalone web app diencephalon ships, once as a native React component inside shadow — is wasteful, and keeping the two in sync is the kind kind of work that drifts silently.

This doc evaluates **qiankun** as the embedding mechanism specifically (vs other micro-frontend frameworks, vs iframe, vs native Tauri WebViewWindow, vs Web Components) and lands on a recommendation.

---

## 1. What qiankun is

- **Origin / popular**  Alibaba open-sourced in 2019, popular in Chinese frontend ecosystems as an alternative to single-spa / Module Federation.
- **Approach**  browser-side application orchestrator. Each "micro-app" ships as a static `index.html` + JS bundle. qiankun fetches the HTML, parses `<script src=…>` entries, runs them in a **proxy-sandboxed** JS context (no ` `with`, no ` `new Function` leakage), mounts/unmounts each app into a DOM container.
- **Main framework**  framework-agnostic; React / Vue / Angular micro- apps all work. Uses `import-html-entry` under the hood.
- **State isolation**  via the JS-sandbox proxy; styles via Shadow DOM or scoped CSS. Not a process boundary — everything runs in the same browser tab.
- **Same-origin required**  micro-apps must be served from the same origin as the shell (or a same-origin proxy). Cross-origin micro-apps require CORS + qianian's `loadMicroApp` adaptation.

---

## 2. What shadow needs (recap)

The diencephalon workflow viewer / editor needs to be **somewhere the user can see it inside shadow**. Concretely:

| Need | Why |
|---|---|
| Visualisation of registered sensors + their ring-buffer state | BC-01..BC-05 audio flow needs to be debugable ("why didn't the baby-cry detector fire?") |
| Visualisation of MCP-exposed tools (query / sensor_stats / sensor_tail / archive_clip) and their JSON Schemas | Agent developers need to verify the contract |
| Workflow editor — assemble data sources → transforms → event handlers, save as a JSON descriptor the runtime picks up | Let non-developer users author the WS-01 web-dev + BC-01 audio flows without recompiling |
| Live preview of the assembled workflow's events (e.g. "stream sensor tail every 1 s") | Verification step before save |

The viewer is **read-write** (it mutates diencephalon's workflow config) and **debug-oriented** (devs use it during integration). It's not a user-facing product surface per se.

---

## 3. Feasibility of qiankun in shadow-desktop

### 3.1 What's required to ship qiankun

| Need | qiankun provides | Notes |
|---|---|---|
| Shell host | qiankun's `registerMicroApps([...])` API; render sub-apps into named DOM containers | shadow's main React app gains a qiankun container component |
| Micro-app delivery | each micro-app is a static `index.html` + JS bundle | diencephalon ships its viewer as `examples/diencephalon-viewer/` — a static Vite/ Vue/ / plain-TS app that talks to diencephalon's MCP server |
| Asset serving | `http://` origin or `file://`-like served assets | Tauri can serve bundled assets via `tauri://localhost/<asset>` or via a Tauri-spawned HTTP server on `127127.0.0.1:<random>` |
| Sandbox | qiankun's built-in `with` proxy; cross-origin handled by `loadMicroApp` adapter | fine inside a Tauri WebView (Chromium-based) |

### 3.2 What it actually buys in

- **One React tree per micro-app** — but qiankun instances a separate React inside the sandboxed iframe-like wrapper, so each micro-app has its own React, its own state, its own bundle. The shell's React tree hosts only the qiankun container + the per-app `<div>` containers. There's still a "two-React-tree" problem to solve (shell vs micro-app).
- **Hot-swap micro-apps** — qiankun can mount / unmount micro-apps at runtime. Useful if diencephalon-viewer ships multiple sub-views (e.g. "sensor list" vs "workflow editor") that we want as separate bundles.
- **Independent bundle versioning** — each micro-app ships its own `package.json` and `node_modules`. diencephalon-viewer can pin its own React / Vue / antd version independent of shadow's stack.

### 3.3 What it costs

- **Bundle size** — qiankun itself is ~30 KB gzipped, plus per-micro-app sandbox + `import-html-entry`. Realistically adds ~150-300 KB to the main shadow bundle. Significant on a Tauri WebView where every KB is cold-start latency.
- **Cognitive overhead** — qiankun's lifecycle model (`bootstrap / mount / unmount / update`) is a foreign abstraction layer. Future devs must learn qiankun to debug micro-app issues. The shadow codebase has none of this today.
- **Same-origin constraint** — diencephalon-viewer must be served from the same origin as shadow's Tauri. Options:
  - Bundle the viewer static files into the Tauri binary via `tauri.conf.json` `bundle.resources` and serve via `tauri://localhost/...` — adds binary size
  - Run a Tauri-spawned local HTTP server on `127127.0.0.1:<random>` at startup — adds startup complexity + port-collision risk
- **Two React trees** — qiankun's sandbox instances its own React inside. If shadow is on React 19 and diencephalon-viewer is on React 18, the bundle is doubled; if both on 19, qiankun still instances its own copy (it's not a peer dep).
- **Debugging surface** — qiankun bugs land in shadow's WebView console with a long error chain. Hard to map back to "this micro-app did X wrong".
- **The very thing qiankun solves (cross-team micro-frontend autonomy) isn't our problem** — shadow and diencephalon-viewer are both in the same monorepo / same team. We don't need runtime hot-swap of independently-versioned bundles. The autonomy is a cost, not a benefit, here.

---

## 4. Alternatives

| Alternative | Bundle cost | Isolation | Reuses work | Verdict |
|---|---|---|---|---|
| **qiankun** | ~150-300 KB added to shadow | JS-sandbox proxy (same process, same tab) | ✅ can reuse diencephalon-viewer as-is | Heavy for a same-team viewer; pays the full qiankun cost for no cross-team benefit |
| **single-spa** | ~20 KB | JS-sandbox (similar to qiankun) | ✅ | Lighter than qiankun but still same problems (two trees, sandbox proxy). No real win over qiankun here. |
| **Module Federation** (Webpack 5 / Vite) | ~0 (build-time only) | Shared runtime, build-time isolation | ✅ | Best **build-time** story if we ever split repos, but requires bundler-specific setup and shared runtime (can't ship independently-versioned bundles without a registry server). For v1, the bundler-coupling cost > the benefit. |
| **Web Components** (custom elements) | ~0 | Real DOM / Shadow DOM | ✅ if diencephalon-viewer uses custom elements | If diencephalon-viewer is authored as Web Components (`<diencephalon-sensor-list>` etc.), they slot into any framework with `<diencephalon-sensor-list>` markup. **No JS framework needed for the shell.** Smaller blast radius than qiankun. |
| **iframe + postMessage** | ~0 | OS-level process (separate window/document) | ✅ if diencephalon-viewer ships as a standalone HTML page | Same isolation level as a Tauri WebviewWindow (no shared DOM, no shared JS state). Doesn't share shadow's chrome (nav, theme, etc.) which is a downside. |
| **Tauri WebviewWindowBuilder (P4)** | ~0 | OS-level process (separate WebView) | ✅ if diencephalon-viewer ships as standalone HTML | Same isolation as iframe, but opens as a proper OS window with its own taskbar entry, devtools, CSP, dev-server style URL. **Already shipped.** |

---

## 5. Recommendation

**Don't adopt qiankun for v1.** Use the **`Tauri WebviewWindowBuilder` path that P4 already shipped**.

### 5.1 Concrete plan

1. **diencephalon ships a static web viewer** at `examples/diencephalon-viewer/` — a Vite + React (or Vue) app that talks to diencephalon's `synapse::mcp::SimpleMcpServer` over the stdio / HTTP transport. Standalone — runs in any browser. Bundle size ≈ the same as running it inside shadow.
2. **shadow-desktop wires it via the existing `preview_open` Tauri command** with a known URL convention (e.g. `diencephalon://viewer` or `http://localhost:<random>/diencephalon-viewer/`). The viewer opens in a dedicated WebViewWindow, isolated from shadow's main shell.
3. **If inline embedding is later required** (e.g. a future scenario scenario wants the viewer embedded in the chat surface), use **Web Components** for the embedding (write `diencephalon-viewer` as a custom-elements bundle), not qiankun. Web Components give shadow's React tree a clean `<diencephalon-sensor-list>` interface without bundling weight or sandbox proxies.

### 5.2 Why this beats qiankun for us

| Concern | qiankun | WebviewWindow + static viewer |
|---|---|---|
| Bundle bloat in shadow | +150-300 KB | 0 KB (viewer is standalone) |
| Two-React-tree problem | yes (shell + per-micro-app React) | no (viewer is standalone) |
| Same-origin constraint | yes — must serve from same origin | no (each WebView has its own origin) |
| Sandbox proxy bug surface | non-trivial | none (OS process is the sandbox) |
| Reuse of viewer's existing codebase | ✅ | ✅ |
| Devtools isolation | one devtools for the shell, separate for each micro-app | dedicated devtools per viewer window |
| User can drag viewer to second monitor | no (single tab) | yes (real OS window) |
| Matches existing shadow architecture | no (new abstraction) | yes (P4 already shipped) |
| Fits "show diencephalon's viewer in shadow" requirement | yes (inline) | yes (separate window) |

The user said "可以直接吧间脑中的工作流查看器 编辑器在shadow中展示".  — "directly display diencephalon's workflow viewer / editor in shadow". Both approaches do this. The "directly" implies inline, but a separate OS WebView next to shadow's main window also counts as "in shadow" from the user's perspective — they see it, they can interact with it, it's launched from the shadow UI.

### 5.3 When to to revisit

qiankun (or any other micro-frontend framework) becomes interesting again when shadow and diencephalon-viewer are maintained by **different teams** that ship on **independent cadences** and need **runtime hot-swap** of one team's bundle without rebuilding the other's. We don't have that today. If the iBLOC org grows to the point where multiple teams own different shadow sub-apps, revisit.

---

## 6. Concrete next steps for v1

1. Build `diencephalon/examples/diencephalon-viewer/` — Vite + React (or Vue) + Tailwind. Talks to diencephalon's MCP server (`query`, `sensor_stats`, `sensor_tail`, `archive_clip`) via the existing P1 surface. Workflow editor saves JSON descriptors that the runtime picks up.
2. Wire `preview_open` in shadow-desktop to launch the viewer (Tauri bundles the viewer static files via `tauri.conf.json` `bundle.resources` and serves via `tauri://localhost/diencephalon-viewer/`).
3. MCP-wire `preview_open` so so prefrontal agents can launch the viewer on demand.
4. Consider Web Components for the viewer authoring (custom elements) so a future inline embedding works without bundler cost.

## 7. Acceptance checklist (this doc)

- [x] Evaluated qiankun specifically against shadow-desktop's needs
- [x] Listed alternatives (single-spa, Module Federation, Web Components, iframe, WebviewWindow)
- [x] Recommendation: don't adopt qiankun; use the P4 WebviewWindow path
- [x] Concrete next steps for diencephalon's viewer + shadow wiring
- [x] Revisit criterion noted (multi-team hot-swap)