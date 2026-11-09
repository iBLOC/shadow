import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../src/stores/telencephalonStore', () => ({
  useTelencephalonStore: {
    getState: () => ({
      status: 'stopped',
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
      hasConfiguredResonance: () => false,
    }),
  },
}));

vi.mock('../src/stores/serviceStore', () => ({
  useServiceStore: {
    getState: () => ({
      getPrimaryResonance: () => null,
      hasConfiguredResonance: () => false,
    }),
  },
}));

import { useResonanceStore, type TaskPush } from '../src/stores/resonanceStore';

describe('ResonanceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResonanceStore.setState({
      discoveredServices: [],
      connectionStatus: 'disconnected',
      modelScores: [],
      pendingTasks: [],
      error: null,
      reconnectAttempts: 0,
      a2aEndpoint: 'http://127.0.0.1:60080/a2a',
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useResonanceStore.getState();
      expect(state.discoveredServices).toEqual([]);
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.modelScores).toEqual([]);
      expect(state.pendingTasks).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('connect', () => {
    it('sets error when telencephalon is not running', async () => {
      const { connect } = useResonanceStore.getState();
      await connect();
      const state = useResonanceStore.getState();
      expect(state.error).toMatch(/telencephalon must be running/i);
      expect(state.connectionStatus).toBe('error');
    });
  });

  describe('handleMessage', () => {
    it('appends task_push to pendingTasks', async () => {
      const task: TaskPush = {
        task_id: 'task-1',
        priority: 'normal',
        goal: 'Test task',
        required_capabilities: {
          min_model_score: 0,
          preferred_models: [],
          required_skills: [],
        },
        context: {
          user_id: 'u1',
          session_id: 's1',
          metadata: {},
        },
      };
      await useResonanceStore.getState().handleMessage({
        msg_type: 'task_push',
        payload: task as unknown as Record<string, unknown>,
      });
      expect(useResonanceStore.getState().pendingTasks).toContainEqual(task);
    });

    it('removes task on task_cancel', async () => {
      useResonanceStore.setState({
        pendingTasks: [
          {
            task_id: 'cancel-me',
            priority: 'normal',
            goal: '',
            required_capabilities: { min_model_score: 0, preferred_models: [], required_skills: [] },
            context: { user_id: 'u', session_id: 's', metadata: {} },
          },
        ],
      });
      await useResonanceStore.getState().handleMessage({
        msg_type: 'task_cancel',
        payload: { task_id: 'cancel-me' },
      });
      expect(useResonanceStore.getState().pendingTasks).toEqual([]);
    });
  });

  describe('clearError', () => {
    it('clears the error', () => {
      useResonanceStore.setState({ error: 'something' });
      useResonanceStore.getState().clearError();
      expect(useResonanceStore.getState().error).toBeNull();
    });
  });

  describe('types', () => {
    it('accepts valid TaskPush structure', () => {
      const task: TaskPush = {
        task_id: 'test-task-1',
        priority: 'normal',
        goal: 'Complete user registration',
        required_capabilities: {
          min_model_score: 75,
          preferred_models: ['qwen2.5-3b'],
          required_skills: ['web_search'],
        },
        context: {
          user_id: 'user-123',
          session_id: 'session-456',
          metadata: {},
        },
      };
      expect(task.task_id).toBe('test-task-1');
      expect(task.priority).toBe('normal');
      expect(task.required_capabilities.min_model_score).toBe(75);
    });
  });

  describe('ConnectionStatus', () => {
    it('has valid status values', () => {
      const statuses = ['disconnected', 'connecting', 'connected', 'error'] as const;
      statuses.forEach((status) => {
        useResonanceStore.setState({ connectionStatus: status });
        expect(useResonanceStore.getState().connectionStatus).toBe(status);
      });
    });
  });
});