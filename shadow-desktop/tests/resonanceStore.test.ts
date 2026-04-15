import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { useResonanceStore, type DiscoveredService, type TaskPush } from '../src/stores/resonanceStore';

describe('ResonanceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResonanceStore.setState({
      discoveredServices: [],
      selectedService: null,
      connectionStatus: 'disconnected',
      modelScores: [],
      pendingTasks: [],
      error: null,
      reconnectAttempts: 0,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useResonanceStore.getState();
      expect(state.discoveredServices).toEqual([]);
      expect(state.selectedService).toBeNull();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.modelScores).toEqual([]);
      expect(state.pendingTasks).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('selectService', () => {
    it('sets selected service', () => {
      const service: DiscoveredService = {
        name: 'Resonance',
        host: 'localhost',
        port: 8080,
        txt_records: {},
      };

      useResonanceStore.getState().selectService(service);

      const state = useResonanceStore.getState();
      expect(state.selectedService).toEqual(service);
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

      statuses.forEach(status => {
        useResonanceStore.setState({ connectionStatus: status });
        expect(useResonanceStore.getState().connectionStatus).toBe(status);
      });
    });
  });
});
