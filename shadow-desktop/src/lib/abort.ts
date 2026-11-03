/**
 * 「这一发失败，是**我们自己叫停的**，还是**真的坏了**」——
 *
 * ## 为什么要有这个判断
 *
 * 客户端会**主动**取消自己的请求：
 *
 * - A2UI 面板收起 / 切页 ⇒ `controller.abort()`（`components/chat/A2uiPanel.tsx`）
 * - 模型下载被用户取消 ⇒ `AbortController.abort()`（`stores/modelDownloadStore.ts`）
 * - 任何 `useEffect` 的 cleanup（React StrictMode 还会跑两遍）
 *
 * ⇒ 这些请求以 `AbortError: signal is aborted without reason` 结束
 * ⇒ ⇒ 而全局 fetch 拦截器（`lib/httpInterceptor.ts`）**原来**把它当成
 * 「网络故障」弹给用户 ⇒ ⇒ **用户自己收起一个面板，屏幕上冒出一个红框**
 * ⇒ ⇒ 那不是故障，是我们自己按的取消键 ⇒ ⇒ 弹框只会训练用户忽略弹框。
 *
 * ⚠️ **超时不算「有意取消」** —— `AbortSignal.timeout()` 的 reason 是
 * `TimeoutError` ⇒ 那是**真故障** ⇒ 必须报出去。
 *
 * ⚠️ **真网络故障不许被吞掉** —— 浏览器里真正的连接失败是
 * `TypeError: Failed to fetch`（**不是** `AbortError`）⇒ ⇒ 本模块只认
 * 「取消」那一种形状 ⇒ ⇒ 断网照样弹框。
 */

/** 这个错误是不是「取消」抛出来的（`AbortError`）。 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: unknown }).name === 'AbortError';
}

/**
 * 这个错误是不是「超时」抛出来的（`TimeoutError`）——
 * **超时是真故障**，不是取消 ⇒ ⇒ 不许被当成「有意取消」吞掉。
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: unknown }).name === 'TimeoutError';
}

/**
 * 取消的错误有没有被**套在 `cause` 里**。
 *
 * ⚠️ 有些运行时把取消包成 `TypeError: fetch failed`
 * ⇒ 真正的 `AbortError` 在 `cause` 里 ⇒ 只看顶层会漏掉。
 */
function hasAbortCause(error: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (isAbortError(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const cause = (error as { cause?: unknown }).cause;
  if (cause === undefined || cause === null) return false;
  return hasAbortCause(cause, depth + 1);
}

/**
 * 这一发失败是不是**我们自己叫停的**？
 *
 * @param error  fetch 抛出来的东西
 * @param signal 这一发请求带的 signal（知道它 ⇒ 就知道是不是我们自己停的）
 */
export function isIntentionalAbort(
  error: unknown,
  signal?: AbortSignal | null,
): boolean {
  // ① 超时 ⇒ **不是**有意取消（那是真故障 ⇒ 必须报出去）
  if (isTimeoutError(error)) return false;

  // ② 取消（直接抛，或套在 cause 里）⇒ 有意取消
  if (hasAbortCause(error)) return true;

  // ③ fetch 用 signal 的 reason 去拒 ⇒ 同一个对象 ⇒ 有意取消
  //    （`controller.abort()` 不带 reason 时，reason 就是一个 AbortError DOMException；
  //    带自定义 reason 时，`controller.abort(new Error('用户取消了'))` 也是同一个对象）
  if (signal?.aborted && signal.reason !== undefined && signal.reason === error) {
    return true;
  }

  return false;
}

/**
 * 这一发请求带的 signal 在哪 —— `init.signal` 或 `Request` 自带的。
 *
 * ⚠️ `fetch(Request)` 时 signal 挂在 `Request` 上 ⇒ 只看 `init` 会看漏。
 */
export function requestSignal(
  input?: RequestInfo | URL | null,
  init?: RequestInit | null,
): AbortSignal | undefined {
  const fromInit = init?.signal;
  if (fromInit) return fromInit;
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.signal;
  }
  return undefined;
}
