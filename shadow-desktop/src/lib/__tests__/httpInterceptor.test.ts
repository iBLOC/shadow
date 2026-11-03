// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * ⚠️ 调试弹框在**开发模式**下开着（`config/debug.ts`）⇒ 这里直接把它钉成开。
 */
vi.mock('../../config/debug', () => ({ isDebugModeEnabled: () => true }));

const ORIGINAL_FETCH = window.fetch;

afterEach(() => {
  window.fetch = ORIGINAL_FETCH;
  globalThis.fetch = ORIGINAL_FETCH;
});

async function load() {
  vi.resetModules();
  const { installHttpErrorInterceptor } = await import('../httpInterceptor');
  const { useErrorDialogStore } = await import('../../stores/errorDialogStore');
  useErrorDialogStore.getState().clearQueue();
  return { installHttpErrorInterceptor, useErrorDialogStore };
}

describe('HTTP 拦截器：取消不许报成「网络故障」', () => {
  it('自己 abort 掉的请求 ⇒ 不弹框，但错误照样往上抛', async () => {
    const { installHttpErrorInterceptor, useErrorDialogStore } = await load();
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    window.fetch = vi.fn(async () => {
      throw reason;
    }) as unknown as typeof fetch;
    installHttpErrorInterceptor();

    await expect(
      window.fetch('http://localhost:60080/a2a', {
        method: 'POST',
        signal: controller.signal,
      }),
    ).rejects.toBeTruthy();

    expect(useErrorDialogStore.getState().current).toBeNull();
    expect(useErrorDialogStore.getState().queue).toHaveLength(0);
  });

  it('真网络故障 ⇒ 照样弹（判据没把真故障吞掉）', async () => {
    const { installHttpErrorInterceptor, useErrorDialogStore } = await load();
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    installHttpErrorInterceptor();

    await expect(window.fetch('http://localhost:60080/a2a')).rejects.toBeTruthy();

    const current = useErrorDialogStore.getState().current;
    expect(current).not.toBeNull();
    expect(current?.message).toContain('Network error');
  });

  it('非 2xx ⇒ 照样弹（这条路径没被改坏）', async () => {
    const { installHttpErrorInterceptor, useErrorDialogStore } = await load();
    const fakeResponse = {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      clone: () => ({ text: async () => 'boom' }),
    } as unknown as Response;
    window.fetch = vi.fn(async () => fakeResponse) as unknown as typeof fetch;
    installHttpErrorInterceptor();

    const response = await window.fetch('http://localhost:60080/a2a');
    expect(response.status).toBe(500);
    expect(useErrorDialogStore.getState().current?.message).toContain('500');
  });
});
