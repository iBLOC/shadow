/**
 * Tauri invoke() that gracefully degrades on the web build.
 *
 * `safeInvoke` calls a Tauri Rust command when running inside the
 * Tauri WebView. On a plain web build it returns the supplied
 * `fallback` (default `null`) instead of throwing, so the same
 * component can be rendered in either environment without
 * try/catch noise.
 *
 * Use `safeInvokeOrThrow` only when the operation is critical and
 * the web build should crash loudly if the dependency is missing.
 */

import { isTauri } from './platform';

type InvokeArgs = Record<string, unknown>;

type TauriCore = {
  invoke: <T>(cmd: string, args?: InvokeArgs) => Promise<T>;
};

let cachedCore: TauriCore | null = null;

async function getCore(): Promise<TauriCore | null> {
  if (!isTauri()) return null;
  if (cachedCore) return cachedCore;
  try {
    const mod = await import('@tauri-apps/api/core');
    cachedCore = { invoke: mod.invoke };
    return cachedCore;
  } catch (e) {
    console.warn('[tauriSafe] @tauri-apps/api/core unavailable:', e);
    return null;
  }
}

export async function safeInvoke<T>(
  cmd: string,
  args?: InvokeArgs,
  fallback: T | null = null,
): Promise<T | null> {
  const core = await getCore();
  if (!core) return fallback;
  try {
    return await core.invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`[tauriSafe] invoke(${cmd}) failed:`, e);
    return fallback;
  }
}

export async function safeInvokeOrThrow<T>(
  cmd: string,
  args?: InvokeArgs,
): Promise<T> {
  const core = await getCore();
  if (!core) {
    throw new Error(
      `Tauri command "${cmd}" is not available in the web build`,
    );
  }
  return core.invoke<T>(cmd, args);
}

export async function safeEventListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => undefined;
  }
  try {
    const mod = await import('@tauri-apps/api/event');
    const unlisten = await mod.listen<T>(event, (e) => handler(e.payload));
    return unlisten;
  } catch (e) {
    console.warn(`[tauriSafe] listen(${event}) failed:`, e);
    return () => undefined;
  }
}
