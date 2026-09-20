# Shadow Platform Architecture

This project is the **Layer 4 (Interaction) umbrella** of the **Shadow 4-layer + 1 cross-cutting storage** platform.

It contains:
- `shadow-desktop/` — Tauri 2 + React 19 desktop client (Layer 4 UI + embeds Layer 2 neuron)
- `shadow-mobile/` — Flutter + Android mobile client (Layer 4 UI + Kotlin MNN/LiteRT engine)

The unified architecture document is here:

→ **`/home/ibloc/Projects/docs/architecture.md`**

Rendered diagrams:
- `/home/ibloc/Projects/docs/diagrams/architecture.svg`
- `/home/ibloc/Projects/docs/diagrams/architecture.png`

For the full Shadow 4-layer platform architecture, see the doc above. For each client's details, see `AGENTS.md` in the corresponding subdirectory.
