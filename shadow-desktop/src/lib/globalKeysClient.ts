// Tauri bridge for the global shortcut feature (keyboard chords +
// Mi Bluetooth remote buttons). All Tauri access goes through this
// module so the web build degrades to no-ops and tests can mock a
// single surface. The Rust side lives in src-tauri/src/global_keys.rs.

import { safeInvoke } from './tauriSafe';

export interface GlobalKeyBindingPayload {
  action: string;
  chord: string;
}

/** Replace the hook's active chord → action table. */
export async function setGlobalKeyBindings(
  bindings: GlobalKeyBindingPayload[],
): Promise<void> {
  await safeInvoke('gk_set_bindings', { bindings });
}

/**
 * Begin chord recording: every key press from any window or paired
 * Bluetooth device is suppressed and reported via
 * {@link onGlobalKeyCapture} until stopGlobalKeyCapture.
 */
export async function startGlobalKeyCapture(): Promise<void> {
  await safeInvoke('gk_start_capture');
}

export async function stopGlobalKeyCapture(): Promise<void> {
  await safeInvoke('gk_stop_capture');
}

/** A bound chord was pressed anywhere (app focused or not). */
export async function onGlobalKeyTrigger(
  handler: (action: string) => void,
): Promise<() => void> {
  return subscribeEvent<{ action: string }>('gk-trigger', (p) =>
    handler(p.action),
  );
}

/** A chord was captured while the settings UI is recording. */
export async function onGlobalKeyCapture(
  handler: (chord: string) => void,
): Promise<() => void> {
  return subscribeEvent<{ chord: string }>('gk-capture', (p) =>
    handler(p.chord),
  );
}

async function subscribeEvent<P>(
  event: string,
  handler: (payload: P) => void,
): Promise<() => void> {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<P>(event, (e) => handler(e.payload));
  } catch {
    // Web build (no Tauri runtime) — shortcuts never fire, unsubscribe
    // is a no-op so callers don't need to branch.
    return () => {};
  }
}
