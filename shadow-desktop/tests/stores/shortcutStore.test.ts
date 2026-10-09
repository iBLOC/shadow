import { describe, it, expect, beforeEach } from 'vitest';
import { useShortcutStore } from '../../src/stores/shortcutStore';

describe('ShortcutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useShortcutStore.setState({ bindings: {} });
  });

  it('starts with no bindings', () => {
    expect(useShortcutStore.getState().bindings).toEqual({});
  });

  it('setBinding stores a chord for an action', () => {
    useShortcutStore.getState().setBinding('window_toggle', 'Ctrl+Shift+KeyW');
    expect(useShortcutStore.getState().bindings).toEqual({
      window_toggle: 'Ctrl+Shift+KeyW',
    });
  });

  it('setBinding steals the chord from a previous holder', () => {
    useShortcutStore.getState().setBinding('window_toggle', 'MediaPlayPause');
    useShortcutStore.getState().setBinding('recording_toggle', 'MediaPlayPause');

    const bindings = useShortcutStore.getState().bindings;
    expect(bindings.recording_toggle).toBe('MediaPlayPause');
    expect(bindings.window_toggle).toBeUndefined();
  });

  it('setBinding keeps other distinct chords untouched', () => {
    useShortcutStore.getState().setBinding('window_toggle', 'Ctrl+Shift+KeyW');
    useShortcutStore.getState().setBinding('nav_tasks', 'F9');

    expect(useShortcutStore.getState().bindings).toEqual({
      window_toggle: 'Ctrl+Shift+KeyW',
      nav_tasks: 'F9',
    });
  });

  it('clearBinding removes the chord and leaves the rest', () => {
    useShortcutStore.getState().setBinding('window_toggle', 'Ctrl+Shift+KeyW');
    useShortcutStore.getState().setBinding('nav_tasks', 'F9');
    useShortcutStore.getState().clearBinding('window_toggle');

    expect(useShortcutStore.getState().bindings).toEqual({ nav_tasks: 'F9' });
  });

  it('clearBinding is a no-op for an unbound action', () => {
    useShortcutStore.getState().clearBinding('nav_tasks');
    expect(useShortcutStore.getState().bindings).toEqual({});
  });

  it('re-binding after a steal lets the first action take it back', () => {
    const { setBinding } = useShortcutStore.getState();
    setBinding('recording_toggle', 'MediaPlayPause');
    setBinding('window_toggle', 'MediaPlayPause');
    setBinding('recording_toggle', 'MediaPlayPause');

    const bindings = useShortcutStore.getState().bindings;
    expect(bindings.recording_toggle).toBe('MediaPlayPause');
    expect(bindings.window_toggle).toBeUndefined();
  });

  it('persists bindings to localStorage', () => {
    useShortcutStore.getState().setBinding('window_hide', 'Ctrl+Alt+KeyH');
    const raw = localStorage.getItem('shadow-shortcut-storage');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { bindings: Record<string, string> } };
    expect(parsed.state.bindings.window_hide).toBe('Ctrl+Alt+KeyH');
  });
});
