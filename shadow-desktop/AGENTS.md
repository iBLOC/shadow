# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-14
**Updated:** 2026-03-21
**Project:** shadow-desktop (Tauri Desktop App)

## OVERVIEW

Shadow 桌面端应用，基于 Tauri (Rust + React)。作为用户分身的桌面界面，通过 Prefrontal 执行任务，支持 CopilotKit Agent2UI 和 candle-vllm 本地推理。

## 架构定位

```
Shadow-Desktop
    │
    ├── UI Shell (React 19 + Zustand)
    │         │
    │         └── CopilotKit (Agent2UI)
    │
    ├── Prefrontal Client (HTTP API → :8082)
    │
    └── Candle-VLLM (本地模型推理，可选)
```

## STRUCTURE

```
shadow-desktop/
├── src/                    # TypeScript frontend (React 19)
│   ├── App.tsx            # Root component
│   ├── main.tsx          # Entry point
│   ├── components/       # Reusable UI components
│   ├── hooks/           # Custom React hooks
│   ├── pages/            # Route pages
│   ├── stores/           # Zustand state stores (HTTP API calls)
│   ├── lib/              # Utilities
│   ├── types/            # TypeScript types
│   └── i18n/             # Internationalization
└── src-tauri/            # Rust backend
    ├── src/lib.rs        # Prefrontal integration + window controls
    ├── Cargo.toml        # Rust dependencies (Prefrontal crate)
    └── tauri.conf.json   # Tauri config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| UI Components | `src/components/` | React components |
| State Management | `src/stores/` | Zustand stores (HTTP API) |
| Routes/Pages | `src/pages/` | React Router pages |
| CopilotKit Integration | `src/lib/copilotkit.ts` | Agent2UI setup |
| Prefrontal Client | `src-tauri/src/lib.rs` | Rust-side Prefrontal calls |
| Config | `tauri.conf.json` | App window/settings |

## CONVENTIONS

- **Frontend**: React 19, TypeScript
- **Build**: Vite 7, pnpm
- **State**: Zustand 5
- **Routing**: react-router-dom 7
- **Validation**: Zod
- **i18n**: i18next + react-i18next
- **Tauri**: v2
- **Agent2UI**: CopilotKit
- **API Communication**: HTTP fetch / WebSocket

## 与 RESONANCE 的连接

### 连接流程
1. mDNS 发现 `_shadow._tcp` 服务
2. 主动建立 mTLS 连接
3. TLS 双向认证
4. A2A 能力注册（模型/Skill/MCP）
5. WebSocket 接收任务推送

### 环境变量
```bash
export RESONANCE_HOST="http://localhost:8080"
export SHADOW_ID="uuid"
export MTLS_CERT_PATH="/path/to/client.pem"
export MTLS_KEY_PATH="/path/to/client.key"
export MTLS_CA_PATH="/path/to/ca.pem"
```

## API ENDPOINTS

| Service | URL | Purpose |
|---------|-----|---------|
| Resonance | `http://localhost:8080` | 任务派发、模型评分 |
| Prefrontal | `http://localhost:8082` | 任务执行、Agent 管理 |
| Hippocampus | `http://localhost:8081` | 记忆存储和搜索 |

## 本地模型 (CANDLE-VLLM)

Candle-VLLM 集成用于本地大模型推理：
- 路径：`src-tauri/` 中的 Rust 集成
- 模型来源：魔搭社区下载
- 配置：通过 Prefrontal 的模型管理接口

## COMMANDS

```bash
# Development
pnpm dev

# Build frontend
pnpm build

# Run Tauri
pnpm tauri dev

# Build Tauri app
pnpm tauri build
```

## NOTES

- Rust 后端负责 Prefrontal 集成和窗口控制
- CopilotKit 提供 Agent2UI 能力（对话式 + 自动化）
- 所有数据操作通过 HTTP API 与 Prefrontal/Hippocampus 通信
- mTLS 证书管理在首次连接时初始化
