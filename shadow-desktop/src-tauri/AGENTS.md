# src-tauri/ - Rust Backend

## OVERVIEW

Tauri v2 Rust backend with tokio async runtime. Integrates with hippocampus-core for memory management.

## STRUCTURE

```
src-tauri/
├── src/
│   ├── main.rs        # Entry point
│   └── lib.rs         # Main library (41KB - large)
├── Cargo.toml         # Rust dependencies
├── tauri.conf.json    # Tauri config
└── capabilities/      # Tauri permissions
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Entry | `src/main.rs` |
| Commands | `src/lib.rs` |
| Config | `tauri.conf.json` |

## CONVENTIONS

- **Runtime**: tokio (full features)
- **Error**: anyhow + thiserror
- **Logging**: tracing + tracing-subscriber
- **Serialization**: serde + serde_json
- **Storage**: none locally — blob storage is delegated to `hippocampus` (port 8081); consume via `hippocampus-mcp` (`blob_put/get/delete/exists/size/list`) or `http://localhost:8081/api/blobs/*`. `opendal` itself lives in `hippocampus-storage`; this Tauri crate does NOT link it directly (avoids the `tonic 0.12 → axum 0.7` clash with cortex's axum 0.8 — see `hippocampus/Cargo.toml` long comment).
- **HTTP**: reqwest
- **ID**: uuid v4

## DEPENDENCIES

- **hippocampus-core**: Memory system (local path: https://github.com/iBLOC/hippocampus/hippocampus-core)
- **tauri**: v2 with tray-icon, image-png features

## ANTI-PATTERNS

- lib.rs is 41KB - should be split into modules

## COMMANDS

```bash
# Build
pnpm tauri build

# Dev
pnpm tauri dev
```
