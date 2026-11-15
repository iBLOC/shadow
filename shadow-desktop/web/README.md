# Shadow Desktop — Web Build

This document describes the **web target** of the shadow-desktop frontend. The same React/TypeScript codebase that ships inside the Tauri desktop binary also produces a plain static site you can host on any web server.

## Why

- One codebase, two artifacts: desktop binary (Tauri) **and** web SPA (Vite).
- The web version keeps everything that does not depend on the Rust side: HTTP calls to the **brain face** (端脑面), WebRTC, mDNS-aware Discovery page, OpenAI-compatible chat.
- Native-only features (window controls, secure storage, system tray) become soft no-ops on the web via `safeInvoke()`.

## Commands

```bash
# Build a static site into dist-web/
pnpm build:web

# Serve the built site locally
pnpm preview:web          # http://localhost:4173

# Develop with hot reload against the web build
pnpm dev:web              # http://localhost:5173
```

## Configuration

| Build-time env | Default | Effect |
|---|---|---|
| `VITE_PREFRONTAL_URL` | `http://127.0.0.1:60080` | Override the backend URL the web UI talks to. ⚠️ **名字是历史遗留** —— 它指的是**端脑/脑面**（不是「前额叶」）；没设时回落到 `127.0.0.1:60080`（桌面 sidecar 的默认口），**没有「同源」这回事**。 |

Set it at build time:
```bash
VITE_PREFRONTAL_URL=http://my-host:60080 pnpm build:web
```

⚠️ **没有同源兜底**：不设这个变量、也没有在设置页里改过地址 ⇒ 网页会一直打 `127.0.0.1:60080`（= 用户自己机器上那个口，通常没人听）⇒ ⇒ 部署网页版**必须**显式指一个真脑。

## Deployment

`pnpm build:web` produces `dist-web/`, a directory of static files. Drop it on any web host:

⚠️ **SPA 回退规则不在构建产物里** —— `vercel.json` 与 `netlify.toml` 放在**本目录**（`shadow-desktop/web/`），构建**不会**把它们拷进 `dist-web/` ⇒ ⇒ 按下面的命令直接部署 ⇒ **客户端路由（深链）会 404** ⇒ ⇒ 部署前把那两个文件拷进 `dist-web/`（或改用 `vercel deploy` 在**仓库根**用本目录的配置）。

### Vercel
```bash
npm i -g vercel
cp vercel.json netlify.toml dist-web/   # ⚠️ 别忘了 SPA 回退规则
cd dist-web && vercel deploy --prod
```

### Netlify
```bash
npm i -g netlify-cli
cp vercel.json netlify.toml dist-web/   # ⚠️ 别忘了 SPA 回退规则
cd dist-web && netlify deploy --prod --dir .
```

### GitHub Pages
```bash
cp -r dist-web/* docs/  # in your user/org site repo
git push
```

### Nginx
```nginx
server {
    listen 80;
    server_name shadow.example.com;

    root /var/www/shadow-desktop;
    index index.html;

    # SPA fallback: any unknown path serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Brain-face reverse-proxy ⚠️ 端口是 **60080**（端脑面），
    # 不是 8082 —— 8082 现在是独立端脑服务器（encephalon-server）的口，
    # prefrontal 自己的默认口也已经搬到 18083。
    location /api/ {
        proxy_pass http://localhost:60080;
    }
    location /v1/ {
        proxy_pass http://localhost:60080;
    }
    location /shadow/ {
        proxy_pass http://localhost:60080;
    }
    location /hippocampus/ {
        proxy_pass http://localhost:60080;
    }
    location /.well-known/ {
        proxy_pass http://localhost:60080;
    }
}
```

### Standalone
```bash
# Any static server works —— ⚠️ 但 SPA 需要 history fallback，
# 否则深链（/conversation 之类）会 404
npx serve dist-web
python3 -m http.server --directory dist-web 8080
```

## CORS

When serving the web build from a different origin than the brain face, configure the **endbrain** to allow that origin: `Access-Control-Allow-Origin: https://shadow.example.com`. The CORS layer lives in the **endbrain**, not in prefrontal — see `telencephalon/src/api/cors.rs` (whitelist via `telencephalon.cors.allowed_origins`) applied at `telencephalon/src/api/mod.rs`.

If you serve them on the same origin (recommended), no CORS work is needed.

## Feature comparison

| Feature | Tauri desktop | Web build |
|---|---|---|
| HTTP / WebSocket / WebRTC to the brain face | ✓ | ✓ |
| mDNS discovery UI (reads `/.well-known/agent.json`) | ✓ | ✓ (HTTP fetch, not mDNS) |
| Companion Mode (WebRTC, getUserMedia) | ✓ | ✓ |
| Discovery page | ✓ | ✓ |
| OpenAI `/v1/*` chat / TTS / ASR | ✓ | ✓ (only with a provider base URL configured — the built-in default is stale) |
| Window controls (show/hide/minimize) | ✓ | n/a (no in-app window-control UI exists on either side; the Tauri window uses OS decorations) |
| Setup wizard | ✓ | **reachable** — `/setup` is routed unconditionally; on web the `secureInvoke` calls are no-ops and the flag lands in `localStorage` |
| Models page | ✓ | **reachable** — renders the cloud-providers tab instead of the local one |
| System tray | ✓ | n/a |
| Native notifications | ✓ | **no fallback** — `notify.ts` returns `false` on web, so reminder delivery is silently dropped |
| File system access | ✓ | n/a |

## Architecture notes

- `src/lib/platform.ts` — single source of truth for "are we Tauri or web?".
- `src/lib/tauriSafe.ts` — `safeInvoke()` returns `null` on web instead of throwing.
- ⚠️ The `features` object in `platform.ts` and its `desktopOnlyPages` marker are **defined but never consumed in production code** — components gate on `isTauri()` ad hoc. Don't trust those flags to describe what the web build hides.
- ⚠️ The web build **does** depend on `@tauri-apps/api` at runtime: there are ~15 *static* `import { invoke } from '@tauri-apps/api/core'` calls across `src/`, and the built bundle carries `__TAURI_INTERNALS__`. It works on the web because the calls sit behind `isTauri()` checks, not because the import is dynamic.

See `AGENTS.md` for the desktop side and `../../docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md` for the platform-wide architecture.
