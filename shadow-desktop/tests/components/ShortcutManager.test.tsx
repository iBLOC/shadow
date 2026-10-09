import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShortcutManager } from '../../src/components/ShortcutManager';
import { useShortcutStore } from '../../src/stores/shortcutStore';

const setGlobalKeyBindingsMock = vi.fn().mockResolvedValue(undefined);
let triggerHandler: ((action: string) => void) | null = null;

vi.mock('../../src/lib/globalKeysClient', () => ({
  setGlobalKeyBindings: (...args: unknown[]) => setGlobalKeyBindingsMock(...args),
  onGlobalKeyTrigger: vi.fn((handler: (action: string) => void) => {
    triggerHandler = handler;
    return Promise.resolve(() => {
      triggerHandler = null;
    });
  }),
}));

const runShortcutActionMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/shortcutActions', () => ({
  runShortcutAction: (...args: unknown[]) => runShortcutActionMock(...args),
}));

describe('ShortcutManager', () => {
  beforeEach(() => {
    localStorage.clear();
    setGlobalKeyBindingsMock.mockClear();
    runShortcutActionMock.mockClear();
    triggerHandler = null;
    useShortcutStore.setState({ bindings: {} });
  });

  it('pushes the current binding table into the Rust hook on mount', async () => {
    useShortcutStore.setState({
      bindings: { window_toggle: 'Ctrl+Shift+KeyW', nav_tasks: 'F9', stale_action: '' },
    });

    render(
      <MemoryRouter>
        <ShortcutManager />
      </MemoryRouter>,
    );

    // Empty chords are filtered; only real bindings reach the hook.
    await vi.waitFor(() => {
      expect(setGlobalKeyBindingsMock).toHaveBeenCalledWith([
        { action: 'window_toggle', chord: 'Ctrl+Shift+KeyW' },
        { action: 'nav_tasks', chord: 'F9' },
      ]);
    });
  });

  it('re-pushes bindings when the store changes', async () => {
    render(
      <MemoryRouter>
        <ShortcutManager />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(setGlobalKeyBindingsMock).toHaveBeenCalledTimes(1));

    useShortcutStore.getState().setBinding('recording_toggle', 'MediaPlayPause');

    await vi.waitFor(() => expect(setGlobalKeyBindingsMock).toHaveBeenCalledTimes(2));
    expect(setGlobalKeyBindingsMock).toHaveBeenLastCalledWith([
      { action: 'recording_toggle', chord: 'MediaPlayPause' },
    ]);
  });

  it('dispatches triggered actions through runShortcutAction', async () => {
    render(
      <MemoryRouter>
        <ShortcutManager />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(triggerHandler).not.toBeNull());
    (triggerHandler as (action: string) => void)('window_toggle');

    await vi.waitFor(() =>
      expect(runShortcutActionMock).toHaveBeenCalledWith('window_toggle', expect.any(Function)),
    );
  });
});
