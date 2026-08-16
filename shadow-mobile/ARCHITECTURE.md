# Shadow Platform Architecture

This project is **Layer 4 (Interaction) — mobile** of the **Shadow 4-layer + 1 cross-cutting storage** platform.

- Flutter 3.11+ UI + Android native (Kotlin MNN / LiteRT engine)
- Layer 2 (Engine) is implemented in Kotlin (`OpenAIServer.kt`) on port 8085, speaking the OpenAI shape
- Calls Layer 3 Prefrontal (port 8082) for agent orchestration

The unified architecture document is here:

→ **`/home/ibloc/Projects/docs/architecture.md`**

Rendered diagrams:
- `/home/ibloc/Projects/docs/diagrams/architecture.svg`
- `/home/ibloc/Projects/docs/diagrams/architecture.png`

For the full Shadow 4-layer platform architecture, see the doc above. For mobile-specific details, see `AGENTS.md` in this directory.
