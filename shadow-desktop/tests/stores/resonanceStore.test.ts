import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { useResonanceStore } from '../../src/stores/resonanceStore';
import type { DiscoveredService, TaskPush } from '../../src/stores/resonanceStore';

const { mockSafeInvoke, telencephalonStatusRef, telencephalonConnectionRef, hasResonanceRef } = vi.hoisted(() => {
  const mockSafeInvoke = vi.fn();
  const telencephalonStatusRef = { value: 'stopped' };
  const telencephalonConnectionRef = { value: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' } };
  const hasResonanceRef = { value: false };
  return { mockSafeInvoke, telencephalonStatusRef, telencephalonConnectionRef, hasResonanceRef };
});

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

vi.mock('../../src/stores/telencephalonStore', () => ({
  useTelencephalonStore: {
    getState: () => ({
      status: telencephalonStatusRef.value,
      connection: telencephalonConnectionRef.value,
      hasConfiguredResonance: () => hasResonanceRef.value,
    }),
  },
}));

vi.mock('../../src/stores/serviceStore', () => ({
  useServiceStore: {
    getState: () => ({
      getPrimaryResonance: () => null,
      hasConfiguredResonance: () => hasResonanceRef.value,
    }),
  },
}));

const sampleService: DiscoveredService = {
  name: 'home-resonance',
  host: '192.168.1.10',
  port: 8080,
  txt_records: { version: '0.1.0' },
};

const sampleTask: TaskPush = {
  task_id: 'task-1',
  priority: 'high',
  goal: 'Test goal',
  required_capabilities: {
    min_model_score: 80,
    preferred_models: ['qwen2.5-3b'],
    required_skills: ['playwright'],
  },
  context: {
    user_id: 'user-1',
    session_id: 'session-1',
    metadata: {},
  },
};

describe('ResonanceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeInvoke.mockReset();
    telencephalonStatusRef.value = 'stopped';
    hasResonanceRef.value = false;
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts disconnected with empty collections', () => {
      const state = useResonanceStore.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.discoveredServices).toEqual([]);
      expect(state.pendingTasks).toEqual([]);
      expect(state.modelScores).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('discoverServices', () => {
    it('returns early with error when no resonance configured', async () => {
      telencephalonStatusRef.value = 'stopped';
      const { discoverServices } = useResonanceStore.getState();
      await discoverServices();
      const state = useResonanceStore.getState();
      expect(state.error).toMatch(/no resonance instances configured/i);
      expect(state.discoveredServices).toEqual([]);
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });

    it('populates discoveredServices on success when telencephalon is running', async () => {
      telencephalonStatusRef.value = 'running';
      hasResonanceRef.value = true;
      mockSafeInvoke.mockResolvedValueOnce([sampleService]);
      const { discoverServices } = useResonanceStore.getState();
      await discoverServices();
      const state = useResonanceStore.getState();
      expect(mockSafeInvoke).toHaveBeenCalledWith('discover_resonance');
      expect(state.discoveredServices).toEqual([sampleService]);
      expect(state.error).toBeNull();
    });

    it('stores empty array when service returns null', async () => {
      telencephalonStatusRef.value = 'running';
      hasResonanceRef.value = true;
      mockSafeInvoke.mockResolvedValueOnce(null);
      const { discoverServices } = useResonanceStore.getState();
      await discoverServices();
      const state = useResonanceStore.getState();
      expect(state.discoveredServices).toEqual([]);
      expect(state.error).toBeNull();
    });

    it('sets error on failure', async () => {
      telencephalonStatusRef.value = 'running';
      hasResonanceRef.value = true;
      mockSafeInvoke.mockRejectedValueOnce(new Error('Network unreachable'));
      const { discoverServices } = useResonanceStore.getState();
      await discoverServices();
      const state = useResonanceStore.getState();
      expect(state.error).toContain('Network unreachable');
    });
  });

  describe('connect', () => {
    it('sets error when telencephalon is not running', async () => {
      telencephalonStatusRef.value = 'stopped';
      const { connect } = useResonanceStore.getState();
      await connect();
      const state = useResonanceStore.getState();
      expect(state.error).toMatch(/telencephalon must be running/i);
      expect(state.connectionStatus).toBe('error');
    });

    it('sets error when no resonance configured even with telencephalon running', async () => {
      telencephalonStatusRef.value = 'running';
      const { connect } = useResonanceStore.getState();
      await connect();
      const state = useResonanceStore.getState();
      expect(state.error).toMatch(/no resonance instances configured/i);
      expect(state.connectionStatus).toBe('error');
    });

    it('connects successfully through telencephalon A2A gateway', async () => {
      hasResonanceRef.value = true;
      telencephalonStatusRef.value = 'running';
      telencephalonConnectionRef.value = { baseUrl: "http://127.0.0.1:60080", apiKey: "" };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      const { connect } = useResonanceStore.getState();
      await connect();
      const state = useResonanceStore.getState();
      expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:60080/a2a/health');
      expect(state.connectionStatus).toBe('connected');
    });

    it('sets error when telencephalon A2A gateway is not reachable', async () => {
      hasResonanceRef.value = true;
      telencephalonStatusRef.value = 'running';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not found', { status: 404 }),
      );
      const { connect } = useResonanceStore.getState();
      await connect();
      const state = useResonanceStore.getState();
      expect(state.connectionStatus).toBe('error');
      expect(state.error).toMatch(/not reachable/i);
    });
  });

  describe('disconnect', () => {
    it('sets status to disconnected', async () => {
      useResonanceStore.setState({ connectionStatus: 'connected' });
      const { disconnect } = useResonanceStore.getState();
      await disconnect();
      expect(useResonanceStore.getState().connectionStatus).toBe('disconnected');
    });
  });

  describe('sendMessage', () => {
    it('sets error when not connected', async () => {
      const { sendMessage } = useResonanceStore.getState();
      await sendMessage({ type: 'test' });
      expect(useResonanceStore.getState().error).toMatch(/not connected/i);
    });

    it('posts A2A task when connected', async () => {
      useResonanceStore.setState({ connectionStatus: 'connected' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      const { sendMessage } = useResonanceStore.getState();
      await sendMessage({ type: 'ping' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:60080/a2a/tasks/send',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sets error on fetch failure', async () => {
      useResonanceStore.setState({ connectionStatus: 'connected' });
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Send failed'));
      const { sendMessage } = useResonanceStore.getState();
      await sendMessage({ type: 'ping' });
      expect(useResonanceStore.getState().error).toContain('Send failed');
    });
  });

  describe('sendTaskResponse / sendTaskProgress / sendTaskResult', () => {
    // ⚠️ `ReturnType<typeof vi.spyOn>` 在 vitest 4 里是**重载的** ⇒ ⇒ 推成
    //   「最后一个重载」那个泛型签名 ⇒ ⇒ 与 `vi.spyOn(globalThis, 'fetch')`
    //   实际返回的 MockInstance **不兼容** ⇒ ⇒ TS2322。
    //   ⇒ ⇒ 直接标成 fetch 的 MockInstance（**承重类型**，不是凑合）。
    let fetchSpy: MockInstance<typeof globalThis.fetch>;

    beforeEach(() => {
      useResonanceStore.setState({ connectionStatus: 'connected' });
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
    });

    it('sendTaskResponse posts correct message', async () => {
      const { sendTaskResponse } = useResonanceStore.getState();
      await sendTaskResponse('task-1', 'accepted', 'ready');
      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.method).toBe('tasks/send');
      expect(callBody.params.type).toBe('task_response');
      expect(callBody.params.payload.task_id).toBe('task-1');
      expect(callBody.params.payload.status).toBe('accepted');
      expect(callBody.params.payload.reason).toBe('ready');
    });

    it('sendTaskProgress posts correct message', async () => {
      const { sendTaskProgress } = useResonanceStore.getState();
      await sendTaskProgress('task-1', 50, 'reasoning', 'halfway');
      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.params.type).toBe('task_progress');
      expect(callBody.params.payload.task_id).toBe('task-1');
      expect(callBody.params.payload.progress).toBe(50);
      expect(callBody.params.payload.current_step).toBe('reasoning');
      expect(callBody.params.payload.message).toBe('halfway');
    });

    it('sendTaskResult completed uses success summary', async () => {
      const { sendTaskResult } = useResonanceStore.getState();
      await sendTaskResult('task-1', 'completed', { output: 'ok' });
      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.params.type).toBe('task_result');
      expect(callBody.params.payload.task_id).toBe('task-1');
      expect(callBody.params.payload.status).toBe('completed');
      expect(callBody.params.payload.result.summary).toBe('Task completed successfully');
      expect(callBody.params.payload.result.data).toEqual({ output: 'ok' });
    });
  });

  describe('handleMessage', () => {
    it('updates modelScores on model_scores message', () => {
      useResonanceStore.getState().handleMessage({
        msg_type: 'model_scores',
        payload: {
          scores: [
            {
              model_id: 'qwen2.5-3b',
              benchmark_scores: { reasoning: 80, code: 80, creativity: 80, speed: 90 },
              overall_score: 82,
            },
          ],
        },
      });
      const state = useResonanceStore.getState();
      expect(state.modelScores).toHaveLength(1);
      expect(state.modelScores[0].model_id).toBe('qwen2.5-3b');
    });

    it('appends to pendingTasks on task_push', () => {
      useResonanceStore.getState().handleMessage({
        msg_type: 'task_push',
        payload: sampleTask as unknown as Record<string, unknown>,
      });
      expect(useResonanceStore.getState().pendingTasks).toHaveLength(1);
      expect(useResonanceStore.getState().pendingTasks[0].task_id).toBe('task-1');
    });

    it('removes task on task_cancel', () => {
      useResonanceStore.setState({ pendingTasks: [sampleTask] });
      useResonanceStore.getState().handleMessage({
        msg_type: 'task_cancel',
        payload: { task_id: 'task-1' },
      });
      expect(useResonanceStore.getState().pendingTasks).toHaveLength(0);
    });

    it('ignores unknown message types', () => {
      expect(() =>
        useResonanceStore
          .getState()
          .handleMessage({ msg_type: 'unknown', payload: {} }),
      ).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('marks disconnected when primary not configured', async () => {
      telencephalonStatusRef.value = 'stopped';
      const { handleDisconnect } = useResonanceStore.getState();
      await handleDisconnect();
      const state = useResonanceStore.getState();
      expect(state.connectionStatus).toBe('disconnected');
    });

    it('stops reconnecting after max attempts', async () => {
      useResonanceStore.setState({ reconnectAttempts: 5 });
      const { handleDisconnect } = useResonanceStore.getState();
      await handleDisconnect();
      const state = useResonanceStore.getState();
      expect(state.error).toBe('Max reconnection attempts reached');
      expect(state.connectionStatus).toBe('error');
    });
  });

  describe('clearError', () => {
    it('clears the error', () => {
      useResonanceStore.setState({ error: 'something' });
      useResonanceStore.getState().clearError();
      expect(useResonanceStore.getState().error).toBeNull();
    });
  });
});