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

import { DEFAULT_TELEENCEPHALON_URL, buildTimeTelencephalonUrl } from './endpointDefaults';

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
 * - 默认 http://127.0.0.1:60080 —— Tauri 形态下是端脑 HTTP 面在
 *   **进程内**起的端脑 HTTP 面；web 形态下**没有** sidecar，需要自己代理。
 * - 构建期用 VITE_PREFRONTAL_URL 覆盖。
 *
 * ⚠️ **它不是「客户端的大脑地址」** —— 客户端的那一个地址是
 * `telencephalonClient.getBaseUrl()`（用户可在设置里改 ⇒ 持久化）。
 * ⇒ ⇒ 本函数只服务**旧前额叶方言**的客户端（`lib/prefrontalClient.ts`）
 * ⇒ ⇒ 以及「没有 store 时的兜底」。
 *
 * ⚠️ 旧注释写着「Tauri 默认 8082 / web 用同源」—— 那是从 2026-08-16
 * (7970925) 之前的旧契约留下来的，**今天不成立**；而 platform.test.ts
 * 里对应的那条断言被 it.skip 掉了 ⇒ ⇒ 没人发现 ⇒ ⇒ 现在两处都钉真实契约。
 */
export const prefrontalUrl = (): string =>
  buildTimeTelencephalonUrl() ?? DEFAULT_TELEENCEPHALON_URL;

/**
 * ⚠️ 这里**曾经**有过**第二个后端地址** —— `neuronUrl()`
 * （`VITE_NEURON_URL` / `localhost:8085` / `localhost:8083`）—— 客户端拿它
 * 直连 neuron's 自己的 listener 做模型管理（`/v1/models*`）。
 *
 * ⚠️⚠️ **2026-11-02 删掉**（用户拍板：「**坚持嵌入式，所有的入口都在大脑，
 * 由大脑负责路由和分发**」）：
 *
 * * **它本来就不必要** —— neuron's route table 已经被端脑挂在**根**上
 *   （`telencephalon/src/api/mod.rs` 的 `build_full_app` ⇒
 *   `outer.merge(neuron_router)`）⇒ ⇒ 端脑那张面**自己就有**
 *   `/v1/models` / `/v1/models/pull` ⇒ ⇒ 客户端只要**一个**地址就够。
 * * **它是一条绕过大脑的入口** —— 直连 neuron ⇒ ⇒ 大脑**不知道** ⇒ ⇒
 *   「谁在读模型列表 / 谁在删模型 / 谁在拉模型」在大脑那一侧**不可见**。
 * * **它是漂移源** —— 用户在设置里改了大脑地址 ⇒ ⇒ 这一半还在打 8085
 *   ⇒ ⇒ 「供应商来自新大脑、本地模型来自老机器」—— 同一个页面两张脸。
 *
 * ⇒ ⇒ 桌面端**只有一个**大脑地址：`telencephalonClient.getBaseUrl()`
 * （= store 的 `connection.baseUrl`：用户可配、持久化、重启后复原）。
 */

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
