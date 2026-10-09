import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Global shortcut bindings (keyboard chords + Mi Bluetooth remote
 * buttons). Persistence is frontend-owned (`shadow-shortcut-storage`);
 * the Rust hook receives the active table via gk_set_bindings whenever
 * it changes (see ShortcutManager).
 *
 * A chord maps to exactly one action: binding a chord that another
 * action already holds steals it (the previous holder becomes
 * unbound). Chord strings are produced by the Rust capture path in
 * canonical form `[Ctrl+][Shift+][Alt+][Meta+]<KeyboardEvent.code>`.
 */
interface ShortcutState {
  bindings: Record<string, string>;
  setBinding: (actionId: string, chord: string) => void;
  clearBinding: (actionId: string) => void;
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      bindings: {},
      setBinding: (actionId, chord) =>
        set((state) => {
          const next: Record<string, string> = { ...state.bindings };
          for (const [id, existing] of Object.entries(next)) {
            if (id !== actionId && existing === chord) {
              delete next[id];
            }
          }
          next[actionId] = chord;
          return { bindings: next };
        }),
      clearBinding: (actionId) =>
        set((state) => {
          const { [actionId]: _removed, ...rest } = state.bindings;
          return { bindings: rest };
        }),
    }),
    { name: 'shadow-shortcut-storage' },
  ),
);
