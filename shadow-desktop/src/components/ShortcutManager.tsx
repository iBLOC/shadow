import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onGlobalKeyTrigger, setGlobalKeyBindings } from '../lib/globalKeysClient';
import { runShortcutAction } from '../lib/shortcutActions';
import { useShortcutStore } from '../stores/shortcutStore';

/**
 * Global shortcut bridge (keyboard chords + Mi Bluetooth remote
 * buttons). Pushes the persisted binding table into the Rust hook
 * whenever it changes and dispatches triggered actions. Renders
 * nothing; must live inside the router (navigation actions).
 */
export function ShortcutManager() {
  const navigate = useNavigate();
  const bindings = useShortcutStore((s) => s.bindings);

  useEffect(() => {
    const payload = Object.entries(bindings)
      .filter(([, chord]) => chord)
      .map(([action, chord]) => ({ action, chord }));
    void setGlobalKeyBindings(payload);
  }, [bindings]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onGlobalKeyTrigger((action) => {
      void runShortcutAction(action, navigate);
    }).then((u) => {
      if (disposed) {
        u();
      } else {
        unlisten = u;
      }
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
