import { isDebugModeEnabled } from '../config/debug';
import { useErrorDialogStore } from '../stores/errorDialogStore';
import { isIntentionalAbort, requestSignal } from './abort';

let installed = false;
let originalFetch: typeof window.fetch | null = null;

interface RequestMeta {
  url: string;
  method: string;
}

interface ApiError {
  code: number;
  message: string;
  details?: unknown;
  hint?: string;
}

interface ApiErrorResponse {
  error: ApiError;
}

function extractMeta(
  input: RequestInfo | URL,
  init?: RequestInit
): RequestMeta {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  return { url, method };
}

function parseApiError(body: string): ApiError | null {
  try {
    const parsed = JSON.parse(body) as ApiErrorResponse;
    if (parsed.error && typeof parsed.error.code === 'number' && typeof parsed.error.message === 'string') {
      return parsed.error;
    }
  } catch {
    // not JSON or not our error format
  }
  return null;
}

/**
 * Patch window.fetch so that any non-2xx response or thrown network error
 * is reported to the global error dialog store.
 *
 * Only active when debug mode is enabled. The wrapped fetch preserves
 * all original behavior (returns the same Response / rethrows the same
 * error) so existing call sites are unaffected.
 *
 * Idempotent — safe to call multiple times.
 */
export function installHttpErrorInterceptor(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  if (!isDebugModeEnabled()) return;
  if (typeof window.fetch !== 'function') return;
  installed = true;

  originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const meta = extractMeta(input, init);
    if (!originalFetch) {
      // Should not happen since we set it above, but satisfy the type checker.
      throw new Error('fetch interceptor not initialized');
    }
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        let body = '';
        try {
          const text = await response.clone().text();
          body = text ? text.slice(0, 2000) : '';
        } catch {
          // ignore body read errors
        }
        
        const apiError = parseApiError(body);
        
        if (apiError) {
          const hint = apiError.hint ? `\n\n💡 Hint: ${apiError.hint}` : '';
          useErrorDialogStore.getState().show({
            source: 'http',
            endpoint: meta.url,
            method: meta.method,
            status: response.status,
            statusText: response.statusText,
            message: `[${apiError.code}] ${apiError.message}${hint}`,
          });
        } else {
          useErrorDialogStore.getState().show({
            source: 'http',
            endpoint: meta.url,
            method: meta.method,
            status: response.status,
            statusText: response.statusText,
            message: `HTTP ${response.status} ${
              response.statusText
            }${body ? `: ${body.slice(0, 500)}` : ''}`.trim(),
          });
        }
      }
      return response;
    } catch (err) {
      // ⚠️ **自己叫停的取消不许报成「网络故障」** ——
      // 组件卸载（A2UI 面板收起 / 切页）/ 用户取消模型下载
      // ⇒ ⇒ 这一发以 `AbortError` 结束 ⇒ ⇒ **那不是故障**
      // ⇒ ⇒ 不弹框（弹了只会训练用户忽略弹框 ⇒ 真故障也就没人看了）。
      // ⚠️ **真断网照样弹** —— 浏览器里那是 `TypeError: Failed to fetch`，
      //    不是 `AbortError` ⇒ ⇒ 本判据只认「取消」那一种形状。
      if (isIntentionalAbort(err, requestSignal(input, init))) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      useErrorDialogStore.getState().show({
        source: 'http',
        endpoint: meta.url,
        method: meta.method,
        message: `Network error: ${message}`,
        stack,
      });
      throw err;
    }
  };
}
