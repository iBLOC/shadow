import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runShortcutAction } from '../../src/lib/shortcutActions';
import { useConversationStore } from '../../src/stores/conversationStore';

const safeInvokeMock = vi.fn();

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: (...args: unknown[]) => safeInvokeMock(...args),
}));

describe('runShortcutAction', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    safeInvokeMock.mockReset();
    navigate.mockClear();
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
    });
  });

  it('window_toggle invokes the visibility command without navigating', async () => {
    await runShortcutAction('window_toggle', navigate);

    expect(safeInvokeMock).toHaveBeenCalledWith('toggle_window_visibility');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('window_hide invokes hide only', async () => {
    await runShortcutAction('window_hide', navigate);

    expect(safeInvokeMock).toHaveBeenCalledWith('hide_window');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('nav actions show the window and navigate', async () => {
    await runShortcutAction('nav_tasks', navigate);
    expect(safeInvokeMock).toHaveBeenCalledWith('show_window');
    expect(navigate).toHaveBeenCalledWith('/tasks');

    await runShortcutAction('nav_settings', navigate);
    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('conversation_new creates a text conversation and opens it', async () => {
    await runShortcutAction('conversation_new', navigate);

    expect(safeInvokeMock).toHaveBeenCalledWith('show_window');
    expect(navigate).toHaveBeenCalledWith('/conversation');
    const { conversations, activeConversationId } = useConversationStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].kind).toBe('text');
    expect(activeConversationId).toBe(conversations[0].id);
  });

  it('recording_toggle starts an audio session when none is live', async () => {
    safeInvokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'recording_list') return Promise.resolve([]);
      if (cmd === 'recording_start') {
        return Promise.resolve({
          id: 'sess-1',
          mode: 'audio',
          started_at: '2026-09-28T10:00:00Z',
          ended_at: null,
          wallclock_start_ms: 1000,
        });
      }
      return Promise.resolve(null);
    });

    await runShortcutAction('recording_toggle', navigate);

    expect(safeInvokeMock).toHaveBeenCalledWith('recording_start', { mode: 'audio' });
    const { conversations, activeConversationId } = useConversationStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: 'sess-1',
      kind: 'audio',
      recordingEndedAt: null,
      recordingWallclockStartMs: 1000,
    });
    expect(activeConversationId).toBe('sess-1');
    expect(navigate).toHaveBeenCalledWith('/conversation');
    expect(safeInvokeMock).not.toHaveBeenCalledWith('recording_stop', expect.anything());
  });

  it('recording_toggle stops the live session when one exists', async () => {
    useConversationStore.getState().addConversation({
      id: 'sess-live',
      kind: 'audio',
      title: '语音会话',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      recordingStartedAt: '2026-09-28T10:00:00Z',
      recordingEndedAt: null,
    });

    safeInvokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'recording_list') {
        return Promise.resolve([
          {
            id: 'sess-live',
            mode: 'audio',
            started_at: '2026-09-28T10:00:00Z',
            ended_at: null,
            wallclock_start_ms: 1000,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    await runShortcutAction('recording_toggle', navigate);

    expect(safeInvokeMock).toHaveBeenCalledWith('recording_stop', { sessionId: 'sess-live' });
    expect(safeInvokeMock).not.toHaveBeenCalledWith('recording_start', expect.anything());
    const stopped = useConversationStore
      .getState()
      .conversations.find((c) => c.id === 'sess-live');
    expect(stopped?.recordingEndedAt).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith('/conversation');
  });

  it('ignores unknown action ids', async () => {
    await runShortcutAction('legacy_action_gone', navigate);
    expect(safeInvokeMock).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
