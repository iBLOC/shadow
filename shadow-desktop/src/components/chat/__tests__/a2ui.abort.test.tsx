// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

/** 调试弹框在开发模式下开着 ⇒ 这里钉成开。 */
vi.mock('../../../config/debug', () => ({ isDebugModeEnabled: () => true }));

import { A2uiPanel } from '../A2uiPanel';

const ORIGINAL_FETCH = window.fetch;

afterEach(() => {
  window.fetch = ORIGINAL_FETCH;
  globalThis.fetch = ORIGINAL_FETCH;
});

/**
 * ⚠️ 一个「永远在飞、收到 abort 就以 reason 拒」的 fetch ——
 * 形状与浏览器一致（fetch 用 signal 的 reason 去拒）。
 */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const reason = () =>
          (signal as { reason?: unknown }).reason ??
          new DOMException('signal is aborted without reason', 'AbortError');
        if (signal.aborted) {
          reject(reason());
          return;
        }
        signal.addEventListener('abort', () => reject(reason()));
      }),
  );
}

async function load() {
  vi.resetModules();
  const { installHttpErrorInterceptor } = await import('../../../lib/httpInterceptor');
  const { useErrorDialogStore } = await import('../../../stores/errorDialogStore');
  useErrorDialogStore.getState().clearQueue();
  return { installHttpErrorInterceptor, useErrorDialogStore };
}

describe('A2UI 面板：收起（卸载）时自己 abort ⇒ 不弹「网络故障」', () => {
  it('卸载 ⇒ 请求被取消 ⇒ 屏幕上不冒红框', async () => {
    const { installHttpErrorInterceptor, useErrorDialogStore } = await load();
    const fetchMock = hangingFetch();
    window.fetch = fetchMock as unknown as typeof fetch;
    installHttpErrorInterceptor();
    // ⚠️ jsdom 里 `globalThis` 与 `window` 是两个对象 ⇒ 浏览器里
    // 「裸 fetch 就是 window.fetch」的同一性要在这里补上（否则拦截器
    // 不在这条路上 ⇒ 这个测试会因为失败而绿）。
    globalThis.fetch = window.fetch;

    const view = render(<A2uiPanel baseUrl="http://localhost:60080" view="tasks" />);
    await act(async () => {
      view.unmount();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(useErrorDialogStore.getState().current).toBeNull();
    expect(useErrorDialogStore.getState().queue).toHaveLength(0);
  });

  it('正控：真网络故障照样弹（证明拦截器确实在这条路上）', async () => {
    const { installHttpErrorInterceptor, useErrorDialogStore } = await load();
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    installHttpErrorInterceptor();
    globalThis.fetch = window.fetch;

    render(<A2uiPanel baseUrl="http://localhost:60080" view="tasks" />);

    await waitFor(() => expect(useErrorDialogStore.getState().current).not.toBeNull());
    expect(useErrorDialogStore.getState().current?.message).toContain('Network error');
  });
});
