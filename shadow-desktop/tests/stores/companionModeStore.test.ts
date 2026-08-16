import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCompanionModeStore } from '../../src/stores/companionModeStore';

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    createSession: vi.fn().mockResolvedValue({ id: 'session-123' }),
  },
}));

vi.mock('../../src/lib/webrtcCompanion', () => {
  const mockCompanion = {
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    onVad: vi.fn(),
    onTranscription: vi.fn(),
    error: { value: null },
    state: { value: 'idle' },
    vadState: { value: 'idle' },
    transcript: { value: '' },
    audioLevel: { value: 0 },
  };

  return {
    createCompanion: vi.fn(() => mockCompanion),
    WebRtcCompanion: vi.fn(() => mockCompanion),
    VadState: ['idle', 'listening', 'speaking', 'barge_in', 'unknown'],
  };
});

describe('CompanionModeStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useCompanionModeStore.setState({
      phase: 'idle',
      transcript: '',
      partialTranscript: '',
      error: null,
      audioLevel: 0,
      sessionId: null,
      isActive: false,
      turnCount: 0,
    });
  });

  describe('initial state', () => {
    it('starts in idle phase', () => {
      const state = useCompanionModeStore.getState();
      expect(state.phase).toBe('idle');
      expect(state.isActive).toBe(false);
      expect(state.transcript).toBe('');
      expect(state.turnCount).toBe(0);
    });
  });

  describe('start', () => {
    it('transitions phase from idle -> connecting -> listening', async () => {
      const { start } = useCompanionModeStore.getState();

      const result = await start('http://localhost:8082');

      expect(result).toBe(true);
      const state = useCompanionModeStore.getState();
      expect(state.phase).toBe('listening');
      expect(state.isActive).toBe(true);
      expect(state.sessionId).toBe('session-123');
    });
  });

  describe('stop', () => {
    it('resets phase to idle and clears session', async () => {
      useCompanionModeStore.setState({
        isActive: true,
        phase: 'listening',
        sessionId: 'session-123',
        audioLevel: 0.5,
      });

      const { stop } = useCompanionModeStore.getState();
      await stop();

      const state = useCompanionModeStore.getState();
      expect(state.phase).toBe('idle');
      expect(state.isActive).toBe(false);
      expect(state.sessionId).toBeNull();
      expect(state.audioLevel).toBe(0);
    });
  });

  describe('pushTurn', () => {
    it('appends user and assistant text to transcript', () => {
      const { pushTurn } = useCompanionModeStore.getState();

      pushTurn('Hello AI', 'Hello human');

      const state = useCompanionModeStore.getState();
      expect(state.transcript).toContain('👤 Hello AI');
      expect(state.transcript).toContain('🤖 Hello human');
      expect(state.turnCount).toBe(1);
    });

    it('increments turnCount on multiple calls', () => {
      const { pushTurn } = useCompanionModeStore.getState();

      pushTurn('Question 1', 'Answer 1');
      pushTurn('Question 2', 'Answer 2');

      const state = useCompanionModeStore.getState();
      expect(state.turnCount).toBe(2);
    });
  });

  describe('reset', () => {
    it('clears transcript, error, turnCount and resets phase', () => {
      useCompanionModeStore.setState({
        transcript: 'Previous transcript\n👤 Hello',
        partialTranscript: 'Partial...',
        error: 'Some error',
        turnCount: 5,
        phase: 'barge_in',
        audioLevel: 0.8,
      });

      const { reset } = useCompanionModeStore.getState();
      reset();

      const state = useCompanionModeStore.getState();
      expect(state.transcript).toBe('');
      expect(state.partialTranscript).toBe('');
      expect(state.error).toBeNull();
      expect(state.turnCount).toBe(0);
      expect(state.phase).toBe('idle');
      expect(state.audioLevel).toBe(0);
    });
  });
});