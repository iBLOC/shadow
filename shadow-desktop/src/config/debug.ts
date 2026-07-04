/**
 * Debug mode check.
 *
 * The global error popup is enabled when:
 *   1. Running in Vite DEV mode (import.meta.env.DEV === true), OR
 *   2. The URL has `?debug=1` (or `?debug=true`) query parameter.
 *
 * This allows testers to opt-in in production builds without code changes,
 * while keeping the popup out of normal user flows.
 */

export function isDebugModeEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Vite DEV mode is always on for the popup
  // (import.meta.env.DEV is a build-time constant; it's `true` for `vite dev`
  // and `false` for `vite build`).
  if (import.meta.env.DEV) {
    return true;
  }

  // Production opt-in via URL parameter
  try {
    const params = new URLSearchParams(window.location.search);
    const debug = params.get('debug');
    return debug === '1' || debug === 'true';
  } catch {
    return false;
  }
}
