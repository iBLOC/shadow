import { isDebugModeEnabled } from '../config/debug';
import { useErrorDialogStore } from '../stores/errorDialogStore';

let installed = false;

/**
 * Install window-level error handlers.
 *
 * Captures:
 *   - window.error (synchronous runtime errors)
 *   - window.unhandledrejection (unhandled promise rejections)
 *
 * Only active when debug mode is enabled (DEV or `?debug=1`).
 *
 * Idempotent — safe to call multiple times.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  if (!isDebugModeEnabled()) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Ignore ResizeObserver loop errors (browser quirk, not actionable)
    if (event.message?.includes('ResizeObserver loop')) return;

    useErrorDialogStore.getState().show({
      source: 'unhandled',
      message: event.message || 'Unknown runtime error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    useErrorDialogStore.getState().show({
      source: 'promise',
      message: `Unhandled promise rejection: ${message}`,
      stack,
    });
  });
}
