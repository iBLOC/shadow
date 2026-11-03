import { describe, it, expect } from 'vitest';
import {
  isAbortError,
  isIntentionalAbort,
  isTimeoutError,
  requestSignal,
} from '../abort';

/**
 * 「自己叫停的取消」与「真的坏了」的判据。
 *
 * ⚠️ 这条判据的**两头**都必须钉住：
 * - 取消 ⇒ 不许报成「网络故障」（否则用户收起面板就见红框）；
 * - 真故障 / 超时 ⇒ **不许被吞掉**（否则失败长得像成功）。
 */
describe('「自己叫停」判据', () => {
  it('controller.abort()（不带 reason）⇒ 取消', () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    expect(isAbortError(reason)).toBe(true);
    expect(isIntentionalAbort(reason, controller.signal)).toBe(true);
  });

  it('超时（TimeoutError）⇒ **不是**取消（那是真故障）', () => {
    const controller = new AbortController();
    controller.abort(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );
    expect(isTimeoutError(controller.signal.reason)).toBe(true);
    expect(isIntentionalAbort(controller.signal.reason, controller.signal)).toBe(false);
  });

  it('真网络故障（TypeError: Failed to fetch）⇒ 不是取消', () => {
    expect(isIntentionalAbort(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('取消被套在 cause 里 ⇒ 仍然认得出', () => {
    const controller = new AbortController();
    controller.abort();
    const wrapped = new TypeError('fetch failed');
    (wrapped as { cause?: unknown }).cause = controller.signal.reason;
    expect(isIntentionalAbort(wrapped)).toBe(true);
  });

  it('自定义 reason 的取消 ⇒ 认得出（fetch 用 signal.reason 去拒）', () => {
    const controller = new AbortController();
    const reason = new Error('用户取消了');
    controller.abort(reason);
    expect(controller.signal.reason).toBe(reason);
    expect(isIntentionalAbort(reason, controller.signal)).toBe(true);
  });

  it('requestSignal：init.signal 优先；没有 init 时看 Request 自带的', () => {
    const controller = new AbortController();
    expect(requestSignal('http://x/y', { signal: controller.signal })).toBe(controller.signal);
    expect(requestSignal('http://x/y', undefined)).toBeUndefined();
    if (typeof Request !== 'undefined') {
      // ⚠️ **不带 signal** —— jsdom 的 AbortSignal 与 undici 的 Request 不是
      // 一族（带 signal 构造 Request 会被拒收，见 vitest.config.ts 的注）
      const request = new Request('http://x/y');
      expect(requestSignal(request, undefined)).toBe(request.signal);
    }
  });
});
