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
 * URL of the Prefrontal backend the UI should talk to.
 * - Tauri: defaults to `http://localhost:8082` (embedded service in dev,
 *   remote in prod). Overridable via `VITE_PREFRONTAL_URL` at build time
 *   or via in-app Settings.
 * - Web: defaults to the same origin of the deployed site (`""` for
 *   same-origin requests). Set `VITE_PREFRONTAL_URL=https://my-server`
 *   to talk to a remote Prefrontal from the web version.
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
 * The desktop app no longer proxies these through cortex (the sidecar was
 * replaced by the in-process encephalon crate), so the models pages talk
 * to neuron directly. Default is neuron's standalone port 8083; 8085 is
 * only used when neuron is embedded in the Tauri shell, which the desktop
 * build does not currently do. Override with `VITE_NEURON_URL`.
 */
export const neuronUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NEURON_URL) {
    return import.meta.env.VITE_NEURON_URL as string;
  }
  return 'http://localhost:8083';
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
