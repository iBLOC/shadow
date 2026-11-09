import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});


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