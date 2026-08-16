import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tauriSafe', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
    vi.stubGlobal('navigator', { userAgent: '' });
  });

  describe('safeInvoke', () => {
    it('on web returns the fallback (default null)', async () => {
      const { safeInvoke } = await import('../tauriSafe');
      const result = await safeInvoke('test-command');
      expect(result).toBe(null);
    });

    it('on web returns custom fallback', async () => {
      const { safeInvoke } = await import('../tauriSafe');
      const result = await safeInvoke('test-command', {}, 'custom-fallback' as any);
      expect(result).toBe('custom-fallback');
    });

    it('returns fallback when not in Tauri', async () => {
      const { safeInvoke } = await import('../tauriSafe');
      const result = await safeInvoke('any-cmd', { foo: 'bar' }, 'fb');
      expect(result).toBe('fb');
    });
  });

  describe('safeInvokeOrThrow', () => {
    it('on web throws an error', async () => {
      const { safeInvokeOrThrow } = await import('../tauriSafe');
      await expect(safeInvokeOrThrow('any-command')).rejects.toThrow(
        'is not available in the web build'
      );
    });
  });

  describe('safeEventListen', () => {
    it('on web returns a no-op unsubscribe function', async () => {
      const { safeEventListen } = await import('../tauriSafe');
      const handler = vi.fn();
      const unsubscribe = await safeEventListen('test-event', handler);
      expect(typeof unsubscribe).toBe('function');
      expect(unsubscribe()).toBe(undefined);
    });
  });
});