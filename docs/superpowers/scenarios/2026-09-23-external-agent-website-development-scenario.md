---
**Updated:** 2026-09-23 (initial scenario; pairs with `2026-09-23-baby-cry-monitoring-scenario.md` and the 4-lobe model in `telencephalon/AGENTS.md`; introduces the 前额叶 → 外部 A2A agent routing role and the embedded-browser / RPA / local-git shadow capability trio)
**Status:** 🔵 草案 → 评审中
**Author:** telencephalon + shadow-desktop
**Spec companions:** none yet (this doc *is* the spec for the external-A2A flow)
**Plan companions:** none yet
**Layer coverage:** L4 (shadow-desktop UI + embedded browser) ↔ L3.5 (前额叶 gateway → 外部 A2A agents in zero-trust network)
**Related docs:**
- `shadow/docs/superpowers/scenarios/2026-09-23-baby-cry-monitoring-scenario.md` — companion scenario (audio monitoring). BC-* and WS-* share the 4-lobe matrix and inter-lobe protocol definitions.
- `telencephalon/AGENTS.md` § 4-lobe model — canonical mapping; this doc amends the 前额叶 row + inter-lobe protocols.
- `shadow/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md` — overall 4-layer platform this scenario sits on.

---

## 0. Why this scenario exists

The 4-lobe model introduced alongside the baby-cry scenario (`telencephalon/AGENTS.md`) covered internal-only flows: 颞叶 ↔ 前额叶 ↔ 间脑 / 枕叶 / 顶叶, all inside the user's shadow runtime. **External agents** are not part of the model yet.

User demand: "我想开发一个官网" → the task is not something shadow's internal lobes should implement directly. It belongs to an **external project-management + development agent** (canonical example: **天工 agent**) that lives in the user's zero-trust network and orchestrates dev-tool sub-agents (opencode, claude code, codex, future) + future deploy + git management capabilities.

This scenario adds three responsibilities and three capabilities to the platform:

**新增职责**:
- 前额叶 becomes the **gateway** to external A2A agents. All outbound calls to external agents go through 前额叶, not 颞叶 / 枕叶 / 顶叶 / 间脑 directly.

**新增 shadow 能力（三件套）**:
- **内嵌浏览器** (embedded browser / iframe) for previewing the deployed website inside the shadow client without bouncing to a separate browser tab.
- **RPA 能力** — Tauri commands + scripted UI automation, allowing shadow to drive external apps on behalf of the user when no A2A endpoint exists.
- **成果管理 (Result management)** + **本地 git 仓库** — every external-agent task yields a local git repo (initialised + per-stage commits) so the user owns the artifact, can review history, and can roll back / fork / merge.

The shadow client becomes the user's **single access point** for: A2A-routed tasks (delegated) + RPA tasks (driven locally) + result browsing + version management.

---

## 1. Architectural additions (extending the 4-lobe model)

### 1.1 新增"外部 A2A agent"分类

External agents are **never** invoked by shadow directly; they are routed by 前额叶 using `synapse::a2a::client::A2AClient::send_task` over mTLS in the user's zero-trust network.

| External agent | Responsibility | Status |
|---|---|---|
| **天工** | 项目管理 + 开发编排 + 部署 + git 管理（未来） | Hypothetical / planned per user direction |
| opencode (sub-tool of 天工) | Code generation | Real OSS tool; invoked by 天工, not by shadow |
| claude code (sub-tool of 天工) | Code generation | Real; invoked by 天工 |
| codex (sub-tool of 天工) | Code generation | Real; invoked by 天工 |
| (future) deploy bot (sub-tool of 天工) | Auto-deploy to a target environment | Future |

The pattern: 天工 is the **project orchestrator** in the zero-trust network; opencode/claude/codex are its **invokable sub-tools**. shadow only talks to 天工; 天工 coordinates the sub-tools internally. This keeps shadow's outbound dependency surface small (one A2A peer) regardless of how many sub-tools 天工 orchestrates.

### 1.2 前额叶 新增职责

前额叶 adds the **external-A2A gateway** role on top of the existing intent classification + internal dispatch:

| Old | New (this scenario) |
|---|---|
| 颞叶 → ACP → 前额叶 → internal lobes / 间脑 | + 前额叶 → A2A `tasks/send` (mTLS) → 天工 → 天工's sub-tools |

Same `cortex/src/lobes/prefrontal.rs` module, additional gateway method. The gateway method holds a `Vec<A2APeerConfig>` (loaded from `CORTEX_A2A_PEERS` env at startup; mTLS cert + key + CA bundle per peer).

### 1.3 shadow desktop 新增能力

| Capability | How (current idea, design-level) | Open work |
|---|---|---|
| **内嵌浏览器** | Tauri WebView with `<iframe sandbox="allow-scripts allow-same-origin">`; or a dedicated WebView window per preview tab | iframe sandbox CSP for dev preview URLs; per-tab session storage; "open in system browser" fallback |
| **RPA** | Tauri commands for window/focus/click/type (e.g., `tauri-plugin-automation`); shadow ships a small DSL ("click button labelled X") that user can author or that 前额叶 generates | Safety boundaries; sandbox-vs-real-screen toggle; recording-vs-scripting split |
| **成果管理 + 本地 git** | `git2` Rust crate (or `git` shell-out) inside shadow-desktop/src-tauri; one local repo per task at `~/.shadow/results/<task-id>/`; per-stage auto-commit on each天工 milestone reply | Conflict resolution if user edits outside shadow; LFS for large artifacts; optional sync to remote git |

These three capabilities are **needed** for the WS-* scenarios but **not yet implemented** — this doc records them as future work in §3.

---

## 2. Scenarios

### WS-01 — Website development (main flow, end-to-end)

**Setup**
- User on shadow-desktop has the 天工 agent configured as a known A2A peer in their zero-trust network (mTLS certs + endpoint URL).
- 颞叶 UI is open with a chat input.
- User wants to develop a personal website.

**Flow**

| # | Step | Component | Protocol | Detail |
|---|---|---|---|---|
| 1 | User NL: "我想开发一个个人官网，主页放自我介绍和项目列表" | 颞叶 (UI) | local UI event | 颞叶 captures natural-language request + `session_id`. |
| 2 | 颞叶 → 前额叶 | 颞叶 → 前额叶 | ACP message | 颞叶 forwards raw text + session_id to 前额叶 `on_user_input`. |
| 3 | 前额叶 intent classification | 前额叶 | in-process | 前额叶 classifies: "task delegation to external agent (天工)". Builds initial task envelope `{ goal, constraints, deliverable: "personal website" }`. |
| 4 | 前额叶 → 天工 (initial task) | 前额叶 → 天工 | **A2A `tasks/send` over mTLS** | 前额叶 invokes `A2AClient::send_task(peer="tiangong", envelope)`. 天工 replies with a `Task { id, status: "input-required", artifacts: [project_plan_draft] }` plus clarification questions. |
| 5 | 前额叶 → 颞叶 (render clarification) | 前额叶 → 颞叶 → user | ACP + SSE | 前额叶 forwards 天工's reply as a `CortexStreamEvent::Delta { kind: PlanReview, artifact: project_plan_draft, asks: [...] }`. 颞叶 renders an inline plan card + clarification form. |
| 6 | Multi-round 需求确认 | user ⇄ 颞叶 ⇄ 前额叶 ⇄ 天工 | ACP round-trips + A2A `tasks/send` follow-ups | User edits the plan / answers questions; each round = one A2A `tasks/send` with the same `task.id` + an additional `message` part. Continues until 天工 replies `status: "completed"` for the planning step (or user cancels). |
| 7 | 天工 invokes sub-tool (opencode / claude / codex) | 天工 | internal to zero-trust network | Not visible to shadow; 天工 orchestrates. Returns progressively via A2A `tasks/send` `status: "working"` with `artifacts: [code/<file>, ...]`. |
| 8 | 成果 git init + per-stage commits | shadow-desktop | local (git2) | On each 天工 artifact push, shadow's result-manager initialises or extends `~/.shadow/results/<task-id>/` with the new files and auto-commits with author `shadow <shadow@iBLOC.local>` and message `${tiangong task id} + ${stage}`. |
| 9 | 天工 deploys (future) | 天工 | internal | When deploy capability lands, 天工 deploys to a target environment and returns `url`. (Currently skipped — open work.) |
| 10 | 天工 → 前额叶 (final) | 天工 → 前额叶 | A2A | Final `status: "completed"`, `artifacts: { url, repo_path, summary }`. |
| 11 | 前额叶 → 颞叶 → user (preview) | 前额叶 → 颞叶 → user | ACP + SSE + **内嵌浏览器** | 颞叶 renders the result card with an **iframe** pointing at the deployed URL (sandboxed CSP) + a git history panel + a "send to RPA" affordance. |
| 12 | User iterates | user ⇄ 颞叶 ⇄ 前额叶 ⇄ 天工 | full loop | "改一下 header 颜色" → 前额叶 forwards to 天工 (same task.id, new message) → 天工 iterates → back to step 7. |

**Edge cases / variants covered separately: WS-02..WS-05.**

**Acceptance (WS-01)**
- End-to-end: user NL → first 天工 reply ≤ 5 s on local zero-trust network.
- Zero data loss across iterations: every 天工 reply yields exactly one local git commit + one ACP/SSE delta.
- Privacy: shadow → 天工 traffic is mTLS only; the mTLS cert + key live in shadow-desktop's encrypted secret store (already present per `shadow-desktop/src-tauri/AGENTS.md` § SecureAuth).
- iframe preview respects dev-server CSP and never navigates the parent shadow WebView away.

---

### WS-02 — Multi-round 需求确认 (requirement clarification)

**Setup:** WS-01 step 4 returned `status: "input-required"` with 3 clarification questions.

**Flow**
1. 颞叶 renders a structured form (text input per question + a "send batch" button).
2. User types answers → 颞叶 collects into one batch message.
3. 颞叶 → 前额叶 ACP `{ kind: "tiangong_reply", task_id, answers }`.
4. 前额叶 → 天工 A2A `tasks/send` with `task.id = task_id` and a `message` part containing the answers.
5. 天工 replies with updated plan OR more questions (loops back to step 1).
6. Termination = 天工 `status: "completed"`.

**Acceptance:** each round ≤ 3 s RTT; UI never blocks on a single round (multiple rounds in flight allowed).

---

### WS-03 — Implementation + commit + deploy

**Setup:** WS-02 returned `completed` for planning; 天工 starts implementation.

**Flow**
1. 天工 pushes code artifacts via `tasks/send` `status: "working"` with file payloads.
2. shadow-desktop result-manager, on each artifact:
   - writes files into `~/.shadow/results/<task-id>/`
   - auto-commits with message `<stage>:<artifact-name>` (e.g. `feat: add index.html`, `feat: add styles.css`).
3. 天工 reports `status: "completed"` + `url: "https://..."` (when deploy is implemented; currently `url: null`).
4. 颞叶 renders preview iframe + git log + commit messages.

**Acceptance:** every artifact batch produces exactly one local commit; `git log --oneline` on `~/.shadow/results/<task-id>/` matches the artifact batch list 1:1.

---

### WS-04 — Result management + local git versioning

**Setup:** Task has finished (WS-03 `completed`). User comes back later to review history.

**Flow**
1. User in 颞叶: "展示 task-xxx 的提交历史".
2. 颞叶 → 前额叶 ACP.
3. 前额叶 dispatches to a local tool (not 天工) that runs `git log --oneline ~/.shadow/results/task-xxx/`.
4. Reply returned via ACP → 颞叶 → SSE rendering as a timeline.
5. User can `git diff <sha>` between any two stages; or checkout an earlier stage for re-deploy (future).

**Acceptance:** git history is intact across shadow-desktop restarts; per-task repo path is stable (`<user-config>/shadow/results/<task-id>/`).

---

### WS-05 — Failure handling + sub-tool fallback

**Setup:** 天工 reports that opencode failed on a task step (e.g., timeout, syntax error).

**Flow**
1. 天工 → 前额叶: `{ status: "failed", cause: "opencode timeout after 60s" }`.
2. 前额叶 → 天工 A2A `tasks/send` follow-up: "retry with claude code" (天工 sub-tool fallback policy — 天工 decides, not shadow).
3. If 天工 exhausts sub-tools: → 颞叶 → SSE failure card with "retry / cancel / escalate to human" affordances.
4. User decides: retry (back to step 2), cancel (前额叶 → 天工 A2A `tasks/cancel` + cleanup), or escalate (前额叶 dispatches to a human on-call via 顶叶 or Resonance).

**Acceptance:** failure surfaces to the user within 10 s of sub-tool failure; user has 3 explicit affordances; no silent retries.

---

## 3. Open work (new shadow capabilities)

This scenario cannot run end-to-end today. Required additions:

1. **前额叶 external-A2A gateway** — `cortex::lobes::prefrontal::A2AGateway` (or new `cortex::lobes::a2a_gateway.rs`) with `Vec<A2APeerConfig>` loaded from `CORTEX_A2A_PEERS` (mTLS cert/key/CA per peer). Use `synapse::a2a::client::A2AClient` as the wire layer (already shipped per `synapse/`).
2. **内嵌浏览器 (iframe)** — Tauri WebView-side `<iframe sandbox>` + dev-URL CSP allowlist. Consider a dedicated WebView window for preview (separate from the main chat window) so iframe reloads don't disrupt the chat.
3. **RPA capability** — pick a Tauri-compatible automation lib (or write a thin wrapper around OS-level input APIs). Required for tasks 天工 can't reach (e.g., a local desktop app with no A2A endpoint).
4. **成果管理 + 本地 git** — `git2` crate or shell-out; per-task repo at `~/.shadow/results/<task-id>/`; auto-commit on each 天工 artifact.
5. **天工 agent itself** — external; outside this codebase. 天工 needs to implement A2A `tasks/send` server-side. (Documented here so shadow's contract is clear; implementation is on 天工's side.)
6. **deploy bot** — future sub-tool of 天工; deploys the built artifact and returns `url`. Optional for v1 (return `url: null` and document); required for v2.

---

## 4. Acceptance checklist (WS-01 only, the headline)

- [ ] 前额叶 A2A gateway implemented with at least one peer (天工) configured.
- [ ] 颞叶 renders a structured plan card on first 天工 reply + clarification form on `input-required`.
- [ ] iframe preview pane ships with CSP allowlist for dev-server URLs.
- [ ] Per-task local git repo initialised + per-artifact commit verified.
- [ ] WS-04 history view works after shadow-desktop restart (re-reads from `~/.shadow/results/<task-id>/.git`).
- [ ] WS-05 failure path: sub-tool timeout surfaces within 10 s; user has retry/cancel/escalate affordances.
- [ ] E2E test: full WS-01 happy path with a mock 天工 server (`tasks/send` echo) is green; covers 2+ clarification rounds.