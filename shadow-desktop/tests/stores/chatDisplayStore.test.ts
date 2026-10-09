import { describe, it, expect, beforeEach } from 'vitest';
import { useChatDisplayStore } from '../../src/stores/chatDisplayStore';

describe('useChatDisplayStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset to defaults before each test (persist middleware hydrates
    // from localStorage on creation; clearing storage alone is enough
    // because subsequent reads fall through to the initial state).
    useChatDisplayStore.setState({ showTokenStats: false });
  });

  it('defaults to off', () => {
    expect(useChatDisplayStore.getState().showTokenStats).toBe(false);
  });

  it('toggles on', () => {
    useChatDisplayStore.getState().setShowTokenStats(true);
    expect(useChatDisplayStore.getState().showTokenStats).toBe(true);
  });

  it('toggles off again', () => {
    useChatDisplayStore.getState().setShowTokenStats(true);
    useChatDisplayStore.getState().setShowTokenStats(false);
    expect(useChatDisplayStore.getState().showTokenStats).toBe(false);
  });
});