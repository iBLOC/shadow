/**
 * Platform detection and feature flags for shadow-desktop.
 *
 * The same frontend codebase produces two distinct artefacts:
 * - **Tauri desktop**: bundled with native WebView, has access to Rust
 *   commands, secure storage, system tray, file system, etc.
 * - **Web SPA**: `pnpm build:web` outputs a plain static site; no native
 *   capabilities, all persistence falls back to `localStorage`.
 *
 * Components should use the predicates here (instead of checking
 * `'__TAURI__'` directly) so that the same code path is taken whether
 * the renderer is the Tauri WebView, a regular browser tab, or a
 * PWA installed from a browser.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
};

export const isWeb = (): boolean => !isTauri();

export const isMobileWeb = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
};

export const isDev = (): boolean => {
  if (typeof import.meta === 'undefined') return false;
  return Boolean(import.meta.env?.DEV);
};

export type Platform = 'tauri' | 'web-desktop' | 'web-mobile';

export const detectPlatform = (): Platform => {
  if (isTauri()) return 'tauri';
  if (isMobileWeb()) return 'web-mobile';
  return 'web-desktop';
};

/**
 * 端脑（telencephalon）的地址 —— 桌面端**唯一**的后端。
 *
 * ⚠️ 这个函数叫 prefrontalUrl，但它**不是**「前额叶服务」的地址 ——
 * 端脑把前额叶**内嵌**成自己的一张面（/api/telencephalon/prefrontal/*），
 * 而 lib/prefrontalClient.ts 说的是 **prefrontal 独立仓**时代的方言
 * （裸 /api/* + {success,data} 信封）⇒ ⇒ 它今天打的是端脑，但**路径与
 * 响应形状都对不上** ⇒ ⇒ 逐条对照见 scripts/client-endpoint-map.txt
 * （node scripts/check-client-endpoint-map.mjs 盯着那张表不许过期）。
 *
 * - 默认 http://localhost:60080 —— Tauri 形态下是 cortex_http.rs 在
 *   **进程内**起的端脑 HTTP 面；web 形态下**没有** sidecar，需要自己代理。
 * - 构建期用 VITE_PREFRONTAL_URL 覆盖。
 *
 * ⚠️ 旧注释写着「Tauri 默认 8082 / web 用同源」—— 那是从 2026-08-16
 * (7970925) 之前的旧契约留下来的，**今天不成立**；而 platform.test.ts
 * 里对应的那条断言被 it.skip 掉了 ⇒ ⇒ 没人发现 ⇒ ⇒ 现在两处都钉真实契约。
 */
export const prefrontalUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PREFRONTAL_URL) {
    return import.meta.env.VITE_PREFRONTAL_URL as string;
  }
  // Always use cortex URL regardless of environment
  return 'http://localhost:60080';
};

/**
 * URL of the neuron inference runtime the UI should talk to for model
 * management (`/v1/models*`: list / pull / release).
 *
 * The desktop app embeds neuron in-process via `run_embedded()` on :8085
 * (spawned in the Tauri setup hook), so Tauri builds always have a local
 * runtime. The web build has no embedded engine — it targets a standalone
 * neuron on the default :8083. Both overridable with `VITE_NEURON_URL`.
 */
export const neuronUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NEURON_URL) {
    return import.meta.env.VITE_NEURON_URL as string;
  }
  return isTauri() ? 'http://localhost:8085' : 'http://localhost:8083';
};

/**
 * Whether a given OS-level feature is available.
 * Use this to hide / disable UI elements that would otherwise 404
 * when the user runs the web build.
 */
export const features = {
  windowControl: isTauri(),
  tray: isTauri(),
  secureStorage: isTauri(),
  notifications: isTauri(),
  fileSystem: isTauri(),
  desktopOnlyPages: isTauri() ? [] as string[] : ['setup', 'models'],
  webrtc: true,
  webRtcPeerConnection: true,
  mDNS: isTauri(),
  persistentState: true,
} as const;
