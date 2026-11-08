import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ⚠️⚠️ 修法：还原 `vi.stubGlobal`。
//   本文件里有一句 `vi.stubGlobal('window', { location: … })` —— 它把**整个 window**
//   换成普通对象（其上**没有 localStorage**）⇒ ⇒ 而 vitest 默认
//   `unstubGlobals: false` ⇒ ⇒ stub **不会**在文件结束时还原
//   ⇒ ⇒ **跨文件泄漏**给同一 worker 的后续文件
//   ⇒ ⇒ 后续受害者里 zustand `persist`（`createJSONStorage(() => window.localStorage)`
//   在**模块加载那一刻**就捕获 storage）⇒ ⇒ 捕获到 `undefined`
//   ⇒ ⇒ 之后每次 `setState` 抛 `TypeError: Cannot read properties of undefined`。
//   ⇒ ⇒ 还原放在**污染源**这里（放在受害者上无效）。
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('platform', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
    vi.stubGlobal('navigator', { userAgent: '' });
  });

  describe('isTauri', () => {
    it('returns false in jsdom (no globals)', async () => {
      const { isTauri } = await import('../platform');
      expect(isTauri()).toBe(false);
    });

    it('returns true when window.__TAURI_INTERNALS__ is set', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      vi.resetModules();
      const { isTauri } = await import('../platform');
      expect(isTauri()).toBe(true);
    });

    it('returns true when window.__TAURI__ is set', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { isTauri } = await import('../platform');
      expect(isTauri()).toBe(true);
    });
  });

  describe('isWeb', () => {
    it('is the inverse of isTauri', async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
      const mod = await import('../platform');
      expect(mod.isWeb()).toBe(true);

      (window as any).__TAURI__ = {};
      vi.resetModules();
      const mod2 = await import('../platform');
      expect(mod2.isWeb()).toBe(false);
    });
  });

  describe('isMobileWeb', () => {
    it('matches Android user agent', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(true);
    });

    it('matches iPhone user agent', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(true);
    });

    it('matches iPad user agent', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Safari/604' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(true);
    });

    it('matches iPod user agent', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) Safari/604' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(true);
    });

    it('returns false on desktop Chrome UA', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(false);
    });

    it('returns false on desktop Firefox UA', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/2010 Firefox/121.0' });
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(false);
    });

    it('returns false when no navigator', async () => {
      vi.stubGlobal('navigator', undefined as any);
      vi.resetModules();
      const { isMobileWeb } = await import('../platform');
      expect(isMobileWeb()).toBe(false);
    });
  });

  describe('isDev', () => {
    it('returns boolean based on import.meta.env.DEV', async () => {
      const { isDev } = await import('../platform');
      expect(typeof isDev()).toBe('boolean');
    });
  });

  describe('detectPlatform', () => {
    it("returns 'tauri' when in Tauri", async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { detectPlatform } = await import('../platform');
      expect(detectPlatform()).toBe('tauri');
    });

    it("returns 'web-mobile' on mobile UA", async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604' });
      vi.resetModules();
      const { detectPlatform } = await import('../platform');
      expect(detectPlatform()).toBe('web-mobile');
    });

    it("returns 'web-desktop' otherwise", async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
      vi.resetModules();
      const { detectPlatform } = await import('../platform');
      expect(detectPlatform()).toBe('web-desktop');
    });
  });

  describe('features', () => {
    it('windowControl is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.windowControl).toBe(true);
    });

    it('windowControl is false on web', async () => {
      delete (window as any).__TAURI__;
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.windowControl).toBe(false);
    });

    it('webrtc is always true', async () => {
      const { features } = await import('../platform');
      expect(features.webrtc).toBe(true);
    });

    it('webRtcPeerConnection is always true', async () => {
      const { features } = await import('../platform');
      expect(features.webRtcPeerConnection).toBe(true);
    });

    it('persistentState is always true', async () => {
      const { features } = await import('../platform');
      expect(features.persistentState).toBe(true);
    });

    it('tray is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.tray).toBe(true);
    });

    it('secureStorage is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.secureStorage).toBe(true);
    });

    it('notifications is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.notifications).toBe(true);
    });

    it('fileSystem is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.fileSystem).toBe(true);
    });

    it('mDNS is true on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.mDNS).toBe(true);
    });

    it('desktopOnlyPages is empty on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.desktopOnlyPages).toEqual([]);
    });

    it('desktopOnlyPages contains setup and models on web', async () => {
      delete (window as any).__TAURI__;
      vi.resetModules();
      const { features } = await import('../platform');
      expect(features.desktopOnlyPages).toContain('setup');
      expect(features.desktopOnlyPages).toContain('models');
    });
  });

  describe('prefrontalUrl', () => {
    it('reads VITE_PREFRONTAL_URL when set', async () => {
      vi.stubEnv('VITE_PREFRONTAL_URL', 'https://prefrontal.example.com');
      vi.resetModules();
      const { prefrontalUrl } = await import('../platform');
      expect(prefrontalUrl()).toBe('https://prefrontal.example.com');
    });

    it('falls back to the telencephalon address on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.stubEnv('VITE_PREFRONTAL_URL', '');
      vi.resetModules();
      const { prefrontalUrl } = await import('../platform');
      // ⚠️ 这条以前是 it.skip（断言 8082）—— 契约早就改成端脑 60080 了，
      // 而断言被**跳过** ⇒ ⇒ 没人发现 ⇒ ⇒ 现在钉**真实**契约。
      expect(prefrontalUrl()).toBe('http://127.0.0.1:60080');
    });

    it('falls back to telencephalon default on web', async () => {
      delete (window as any).__TAURI__;
      vi.stubEnv('VITE_PREFRONTAL_URL', '');
      vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
      vi.resetModules();
      const { prefrontalUrl } = await import('../platform');
      expect(prefrontalUrl()).toBe('http://127.0.0.1:60080');
    });
  });
});