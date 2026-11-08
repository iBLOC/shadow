/**
 * Lightweight wrapper around `localStorage` with quota handling.
 *
 * `localStorage` is synchronous, ~5MB per origin, and throws
 * `QuotaExceededError` when full. This wrapper:
 *   - returns `null` instead of throwing on parse errors
 *   - silently evicts older entries on quota errors (best effort)
 */

const STORAGE_KEY_PREFIX = 'shadow:';

export function loadJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PREFIX + key,
      JSON.stringify(value)
    );
    return true;
  } catch (err) {
    // Quota exceeded or storage unavailable; evict the oldest half and retry.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      try {
        const allKeys = Object.keys(window.localStorage).filter((k) =>
          k.startsWith(STORAGE_KEY_PREFIX)
        );
        const half = Math.max(1, Math.floor(allKeys.length / 2));
        for (let i = 0; i < half; i++) {
          window.localStorage.removeItem(allKeys[i]);
        }
        window.localStorage.setItem(
          STORAGE_KEY_PREFIX + key,
          JSON.stringify(value)
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
