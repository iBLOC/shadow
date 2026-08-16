# Shadow Desktop — Web Build

This document describes the **web target** of the shadow-desktop frontend. The same React/TypeScript codebase that ships inside the Tauri desktop binary also produces a plain static site you can host on any web server.

## Why

- One codebase, two artifacts: desktop binary (Tauri) **and** web SPA (Vite).
- The web version keeps everything that does not depend on the Rust side: HTTP calls to Prefrontal, WebRTC, mDNS-aware Discovery page, OpenAI-compatible chat.
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
| `VITE_PREFRONTAL_URL` | `""` (same origin) | Override the Prefrontal backend URL the web UI talks to. |

Set it at build time:
```bash
VITE_PREFRONTAL_URL=https://my-prefrontal.example.com pnpm build:web
```

## Deployment

`pnpm build:web` produces `dist-web/`, a directory of static files. Drop it on any web host:

### Vercel
```bash
npm i -g vercel
cd dist-web && vercel deploy --prod
```

### Netlify
```bash
npm i -g netlify-cli
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

    # Prefrontal reverse-proxy
    location /api/ {
        proxy_pass http://localhost:8082;
    }
    location /v1/ {
        proxy_pass http://localhost:8082;
    }
    location /.well-known/ {
        proxy_pass http://localhost:8082;
    }
}
```

### Standalone
```bash
# Any static server works
npx serve dist-web
python3 -m http.server --directory dist-web 8080
```

## CORS

When serving the web build from a different origin than the Prefrontal backend, configure Prefrontal to send `Access-Control-Allow-Origin: https://shadow.example.com` on every response. See `tower-http` CORS layer in `prefrontal/src/server/mod.rs`.

If you serve them on the same origin (recommended), no CORS work is needed.

## Feature comparison

| Feature | Tauri desktop | Web build |
|---|---|---|
| HTTP / WebSocket / WebRTC to Prefrontal | ✓ | ✓ |
| mDNS discovery UI (reads `/.well-known/agent.json`) | ✓ | ✓ (HTTP fetch, not mDNS) |
| Companion Mode (WebRTC, getUserMedia) | ✓ | ✓ |
| Discovery page | ✓ | ✓ |
| OpenAI `/v1/*` chat / TTS / ASR | ✓ | ✓ |
| Window controls (show/hide/minimize) | ✓ | hidden |
| Setup wizard (writes to `secure_auth` Rust module) | ✓ | hidden (uses Prefrontal HTTP if available) |
| System tray | ✓ | n/a |
| Native notifications | ✓ | Web Notification API fallback |
| File system access | ✓ | n/a |

## Architecture notes

- `src/lib/platform.ts` — single source of truth for "are we Tauri or web?".
- `src/lib/tauriSafe.ts` — `safeInvoke()` returns `null` on web instead of throwing.
- The `features` object in `platform.ts` lets components hide OS-only controls.
- The web build does NOT depend on `@tauri-apps/api` at runtime: that import is dynamic and only fires when `isTauri()` returns true.

See `AGENTS.md` for the desktop side and `../docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md` for the platform-wide architecture.
