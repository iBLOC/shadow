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
- **Storage**: opendal (S3, GCS, Azure Blob, FS)
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
