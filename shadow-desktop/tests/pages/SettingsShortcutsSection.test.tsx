import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShortcutsSection } from '../../src/pages/SettingsPage';
import { useShortcutStore } from '../../src/stores/shortcutStore';

const startCaptureMock = vi.fn().mockResolvedValue(undefined);
const stopCaptureMock = vi.fn().mockResolvedValue(undefined);
let captureHandler: ((chord: string) => void) | null = null;

vi.mock('../../src/lib/globalKeysClient', () => ({
  startGlobalKeyCapture: () => startCaptureMock(),
  stopGlobalKeyCapture: () => stopCaptureMock(),
  onGlobalKeyCapture: vi.fn((handler: (chord: string) => void) => {
    captureHandler = handler;
    return Promise.resolve(() => {
      captureHandler = null;
    });
  }),
  setGlobalKeyBindings: vi.fn().mockResolvedValue(undefined),
  onGlobalKeyTrigger: vi.fn().mockResolvedValue(() => {}),
}));

function pressCapturedKey(chord: string) {
  expect(captureHandler).not.toBeNull();
  captureHandler!(chord);
}

describe('ShortcutsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    startCaptureMock.mockClear();
    stopCaptureMock.mockClear();
    captureHandler = null;
    useShortcutStore.setState({ bindings: {} });
  });

  it('renders one row per registered action, initially unbound', () => {
    render(<ShortcutsSection />);

    for (const id of [
      'window_toggle',
      'window_hide',
      'nav_tasks',
      'nav_conversation',
      'nav_settings',
      'conversation_new',
      'recording_toggle',
    ]) {
      expect(screen.getByTestId(`shortcut-row-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`shortcut-row-${id}`).textContent).toContain('shortcuts.unbound');
    }
  });

  it('arms the hook on capture and binds the captured chord', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByTestId('shortcut-capture-window_toggle'));
    await waitFor(() => expect(startCaptureMock).toHaveBeenCalled());

    pressCapturedKey('Ctrl+Shift+KeyW');

    await waitFor(() => {
      expect(useShortcutStore.getState().bindings.window_toggle).toBe('Ctrl+Shift+KeyW');
    });
    expect(stopCaptureMock).toHaveBeenCalled();
    expect(screen.getByTestId('shortcut-chord-window_toggle')).toBeInTheDocument();
  });

  it('treats Escape as cancel and leaves bindings untouched', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByTestId('shortcut-capture-nav_tasks'));
    await waitFor(() => expect(startCaptureMock).toHaveBeenCalled());

    pressCapturedKey('Escape');

    await waitFor(() => expect(stopCaptureMock).toHaveBeenCalled());
    expect(useShortcutStore.getState().bindings).toEqual({});
  });

  it('requires confirmation before binding a bare typing key', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByTestId('shortcut-capture-recording_toggle'));
    await waitFor(() => expect(startCaptureMock).toHaveBeenCalled());

    // The remote's OK button arrives as Enter — bindable, but risky.
    pressCapturedKey('Enter');

    // Capture is disarmed while the dialog is up (Enter must work there).
    await waitFor(() => expect(stopCaptureMock).toHaveBeenCalled());
    expect(useShortcutStore.getState().bindings.recording_toggle).toBeUndefined();

    await user.click(screen.getByTestId('shortcut-risky-confirm'));

    expect(useShortcutStore.getState().bindings.recording_toggle).toBe('Enter');
  });

  it('cancelling the risky dialog leaves the action unbound', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByTestId('shortcut-capture-recording_toggle'));
    await waitFor(() => expect(startCaptureMock).toHaveBeenCalled());
    pressCapturedKey('Enter');
    await waitFor(() => expect(screen.getByTestId('shortcut-risky-cancel')).toBeInTheDocument());

    await user.click(screen.getByTestId('shortcut-risky-cancel'));

    expect(useShortcutStore.getState().bindings).toEqual({});
  });

  it('steals a duplicated chord from its previous holder', async () => {
    const user = userEvent.setup();
    useShortcutStore.setState({ bindings: { window_toggle: 'MediaPlayPause' } });
    render(<ShortcutsSection />);

    await user.click(screen.getByTestId('shortcut-capture-recording_toggle'));
    await waitFor(() => expect(startCaptureMock).toHaveBeenCalled());

    pressCapturedKey('MediaPlayPause');

    await waitFor(() => {
      expect(useShortcutStore.getState().bindings).toEqual({
        recording_toggle: 'MediaPlayPause',
      });
    });
    expect(screen.getByTestId('shortcut-notice').textContent).toBe('shortcuts.stoleNotice');
  });

  it('clear removes an existing binding', async () => {
    const user = userEvent.setup();
    useShortcutStore.setState({ bindings: { window_hide: 'Ctrl+Alt+KeyH' } });
    render(<ShortcutsSection />);

    expect(screen.getByTestId('shortcut-chord-window_hide')).toBeInTheDocument();
    await user.click(screen.getByTestId('shortcut-clear-window_hide'));

    expect(useShortcutStore.getState().bindings).toEqual({});
  });
});
