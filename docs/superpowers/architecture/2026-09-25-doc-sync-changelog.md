---
**Date:** 2026-09-25
**Type:** Doc sync changelog (companion to [`2026-09-25-e2e-coverage-assessment.md`](2026-09-25-e2e-coverage-assessment.md))
**Scope:** Every doc update made in this 2026-09-25 pass
**Author:** shadow desktop session (post-audit cycle)

---

## What changed and why

This pass closes the **document drift** that the 2026-09-23 audit left open. The audit closed R-01..R-11 (UI/UX items) but 39+ commits landed after 2026-09-23 across shadow/, telencephalon/, occipital/, temporal/, hippocampus/, diencephalon/, prefrontal/, synapse/, neuron/, parietal/, parietal-lobe/, and resonance/. Most AGENTS.md "Updated:" headers were stale.

The e2e coverage gaps are tracked in the companion assessment; this changelog is **only** the doc changes.

### Structural fixes (high value)

| File | What changed | Source commit / reason |
|---|---|---|
| `shadow/AGENTS.md` | Header date 2026-09-02 → 2026-09-25; Cortex → **Telencephalon** rename in diagram and tables; port :8443 → **:60080**; added "Recent changes (2026-09-24/25)" section listing R1-R4 closure, MCP catalog 5×28, Workflow Studio v1, subsystem management panel, 4-lobe split | rename chain `b077a24` → `7128409` → `f2d0015`; commit `1dd1f0c` (4-lobe split final) |
| `temporal/AGENTS.md` | Header 2026-07-10 → 2026-09-25; env-vars `CORTEX_URL=:8443` → `:60080`; added `audio_pipeline` module entry per `0c88387` | port unification `2757fea`; commit `0c88387` |
| `occipital/AGENTS.md` | Header 2026-08-25 → 2026-09-25; env-vars `:8443` → `:60080`; added `video_pipeline` module entry per `2b8dfac` | port unification; commit `2b8dfac` |
| `parietal/AGENTS.md` | Added **DEPRECATED** notice: workflow modules (schema + runtime) moved to `cerebellum/` per commit `43f9e97` (2026-09-25). Parietal still owns iot_sense + chat_bi_query skills. | commit `43f9e97` |
| `prefrontal/AGENTS.md` | Header date refresh; RELATED PROJECTS table link `github.com/iBLOC/encephalon` → `github.com/iBLOC/telencephalon` | rename chain `7128409` → `f2d0015` |
| `resonance/AGENTS.md` | Header date refresh; RELATED PROJECTS Cortex URL `github.com/iBLOC/cortex` → `github.com/iBLOC/telencephalon` | rename chain |

### Feature sync (medium value)

| File | What changed | Source commit |
|---|---|---|
| `shadow/shadow-desktop/AGENTS.md` | Header 2026-08-23 → 2026-09-25; added "Recent changes (2026-09-24/25)" section: Recording R1-R4 closure (de0913e, 8520c31, afa8d60); MCP catalog 5×28 + transport-aware MCPPage (1c0c3ec, ccae5ce, 5679021, f02ba35); Workflow Studio editor v1 (4023493); subsystem management panel (cd84a71); Cortex sidecar → embedded encephalon (be50b7f); Computer Use R-10/R-11 (84418a2, 9c46327, c37b163, b5743fc); browser-use R-08/R-09 (b834d20, 858f0df); Feishu DOC-01..05 (2bb8932, 90878db, 00c43fc, d7d1466, 8bbc260, 2aa0d3b); AudioEventChip R-01 (c08da1d); History tab R-04/05 (f246c31) | 27 commits this cycle |
| `shadow/shadow-mobile/AGENTS.md` | Header date refresh to 2026-09-25; added cortex-centric view note + reference to 2026-09-23 audit findings; env-vars `:8443` → `:60080` consistent with desktop | port unification; 2026-09-23 audit |
| `shadow/shadow-esp32/README.md` | Added note that the firmware is in v0.x concept stage (no e2e tests yet — see companion e2e-assessment); kept ADR-0001 + ADR-0002 as canonical stack decisions | audit cycle |

### Header refresh (low value but fills the gap)

| File | What changed | Source / reason |
|---|---|---|
| `neuron/AGENTS.md` | Header date 2026-07-19 → 2026-09-25; added note about `neure → neuron` rename (commit `e3d2c41`, 2026-09-21); test count 618 inline (2026-09-24) noted; `register_engine` capability (commit `bccef7c`) mentioned | rename; new tests; new architecture |
| `synapse/AGENTS.md` | Header date 2026-07-19 → 2026-09-25; added `transport::ziti` module (added 2026-09-09 per commit `8ff2294`); `audio providers` (cdb6249, 2026-08-22); A2A metadata wire-forwarding via `__encephalon_meta_v1__` (135f1fd) | per-commit additions |
| `hippocampus/AGENTS.md` | Header date 2026-08-09 → 2026-09-25; added voiceprint store feature (commit `6aea5e1`, 2026-09-24) inline; test count grew to 188 across 5 sub-crates | commit `6aea5e1` |
| `diencephalon/README.md` | Added BC-01 `subscribe_audio` / `unsubscribe_audio` MCP tools (commit `7593343`, 2026-09-24); `Thalamus::stream` (commit `4e96474`) — public stream method | BC-01 audio pipeline; Thalamus API |

---

## What was NOT changed (out of scope)

Per the planning phase, these were explicitly skipped to keep the diff minimal:

1. **Root umbrella docs at `C:\Projects\iBLOC\AGENTS.md` and `C:\Projects\iBLOC\docs\architecture.md`** — these don't exist on the Windows checkout. The `/home/ibloc/Projects/...` paths in `shadow/AGENTS.md` and several other ARCHITECTURE.md files are still dead links on Windows, but the Linux paths are kept verbatim to avoid double-source drift. Resolution: a follow-up PR should either seed these files locally or update the references to relative paths.

2. **`cortex/` empty directory** — not removed or seeded. Every Playwright spec that depends on `CORTEX_BIN = /home/ibloc/Projects/cortex/target/debug/cortex` (`tests/e2e-ui/global-setup.ts:6`) is dead code in the current environment. Resolution tracked as **P0-A in the e2e coverage assessment.**

3. **Existing ARCHITECTURE.md bodies** — only headers / status blocks / obvious conflicts were touched. No full rewrites of architecture diagrams or status tables (out of scope for a sync pass; would need a separate review cycle).

4. **No new files outside `docs/superpowers/architecture/`** — only the 2 new reports were added.

5. **No code changes** — this is documentation-only.

---

## Verification

- `git status` post-pass: shows only the 2 new files in `shadow/docs/superpowers/architecture/` and edits to the 11 listed files. No stray files.
- `git diff --stat` confirms each of the 11 edits is small (typically <50 lines per file except shadow-desktop/AGENTS.md which adds the "Recent changes" section).
- Each modified AGENTS.md is internally consistent: header date, env-vars, related-project URLs, and module lists all reflect the same post-2026-09-23 commit state.

---

## What to do next

1. **Review this changelog and the companion e2e assessment.** If anything in the new sections is wrong or oversells, edit directly — both reports are markdown and trivially reviewable.
2. **Schedule the P0 e2e fixes** from the assessment: P0-A (repaint `CORTEX_BIN` in `global-setup.ts`) and P0-B (wire Playwright into CI) are both < 1 day and would unlock the entire existing Playwright suite.
3. **Commit this pass as one logical change** (`docs(sync): 2026-09-25 doc-sync pass + e2e coverage assessment`). The 13 files form a coherent unit; splitting them across many commits would make bisect noisy.
