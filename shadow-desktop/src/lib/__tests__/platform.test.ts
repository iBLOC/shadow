import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    it.skip('falls back to localhost:8082 on Tauri', async () => {
      (window as any).__TAURI__ = {};
      vi.stubEnv('VITE_PREFRONTAL_URL', '');
      vi.resetModules();
      const { prefrontalUrl } = await import('../platform');
      expect(prefrontalUrl()).toBe('http://localhost:8082');
    });

    it('falls back to cortex default on web', async () => {
      delete (window as any).__TAURI__;
      vi.stubEnv('VITE_PREFRONTAL_URL', '');
      vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
      vi.resetModules();
      const { prefrontalUrl } = await import('../platform');
      expect(prefrontalUrl()).toBe('http://localhost:60080');
    });
  });
});