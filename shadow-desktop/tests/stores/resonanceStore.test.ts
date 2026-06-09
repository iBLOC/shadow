import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useResonanceStore } from '../../src/stores/resonanceStore';
import type { DiscoveredService, TaskPush } from '../../src/stores/resonanceStore';

const mockSafeInvoke = vi.fn();
const mockSafeEventListen = vi.fn();

vi.mock('../../src/lib/tauriSafe', () => ({
 safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
 safeEventListen: (...args: unknown[]) => mockSafeEventListen(...args),
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
 mockSafeEventListen.mockReset();
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
 it('starts disconnected with empty collections', () => {
 const state = useResonanceStore.getState();
 expect(state.connectionStatus).toBe('disconnected');
 expect(state.discoveredServices).toEqual([]);
 expect(state.selectedService).toBeNull();
 expect(state.pendingTasks).toEqual([]);
 expect(state.modelScores).toEqual([]);
 expect(state.error).toBeNull();
 expect(state.reconnectAttempts).toBe(0);
 });
 });

 describe('discoverServices', () => {
 it('populates discoveredServices on success', async () => {
 mockSafeInvoke.mockResolvedValueOnce([sampleService]);
 const { discoverServices } = useResonanceStore.getState();

 await discoverServices();

 const state = useResonanceStore.getState();
 expect(mockSafeInvoke).toHaveBeenCalledWith('discover_resonance');
 expect(state.discoveredServices).toEqual([sampleService]);
 expect(state.error).toBeNull();
 });

 it('stores empty array when service returns null', async () => {
 mockSafeInvoke.mockResolvedValueOnce(null);
 const { discoverServices } = useResonanceStore.getState();

 await discoverServices();

 const state = useResonanceStore.getState();
 expect(state.discoveredServices).toEqual([]);
 expect(state.error).toBeNull();
 });

 it('sets error on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Network unreachable'));
 const { discoverServices } = useResonanceStore.getState();

 await discoverServices();

 const state = useResonanceStore.getState();
 expect(state.error).toContain('Network unreachable');
 });
 });

 describe('selectService', () => {
 it('sets the selected service', () => {
 const { selectService } = useResonanceStore.getState();
 selectService(sampleService);

 expect(useResonanceStore.getState().selectedService).toEqual(sampleService);
 });
 });

 describe('connect', () => {
 it('connects successfully, registers capabilities, and listens for events', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 mockSafeEventListen.mockResolvedValue(() => undefined);
 useResonanceStore.setState({ selectedService: sampleService });
 const { connect } = useResonanceStore.getState();

 await connect();

 const state = useResonanceStore.getState();
 expect(mockSafeInvoke).toHaveBeenCalledWith('ws_connect', {
 url: 'wss://192.168.1.10:8080/api/v1/shadow/ws',
 });
 expect(state.connectionStatus).toBe('connected');
 expect(mockSafeEventListen).toHaveBeenCalledWith(
 'ws_message',
 expect.any(Function)
 );
 expect(mockSafeEventListen).toHaveBeenCalledWith(
 'ws_disconnected',
 expect.any(Function)
 );
 });

 it('sets error when no service selected', async () => {
 const { connect } = useResonanceStore.getState();

 await connect();

 const state = useResonanceStore.getState();
 expect(state.error).toBe('No service selected');
 expect(mockSafeInvoke).not.toHaveBeenCalled();
 });

 it('sets error state when ws_connect throws', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('WS failed'));
 useResonanceStore.setState({ selectedService: sampleService });
 const { connect } = useResonanceStore.getState();

 await connect();

 const state = useResonanceStore.getState();
 expect(state.connectionStatus).toBe('error');
 expect(state.error).toContain('WS failed');
 });
 });

 describe('disconnect', () => {
 it('calls ws_disconnect and resets status', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 useResonanceStore.setState({ connectionStatus: 'connected' });
 const { disconnect } = useResonanceStore.getState();

 await disconnect();

 const state = useResonanceStore.getState();
 expect(mockSafeInvoke).toHaveBeenCalledWith('ws_disconnect');
 expect(state.connectionStatus).toBe('disconnected');
 });
 });

 describe('sendMessage', () => {
 it('serializes message and calls ws_send', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 const { sendMessage } = useResonanceStore.getState();

 await sendMessage({ type: 'ping' });

 expect(mockSafeInvoke).toHaveBeenCalledWith('ws_send', {
 message: JSON.stringify({ type: 'ping' }),
 });
 });

 it('sets error on failure', async () => {
 mockSafeInvoke.mockRejectedValueOnce(new Error('Send failed'));
 const { sendMessage } = useResonanceStore.getState();

 await sendMessage({ type: 'ping' });

 expect(useResonanceStore.getState().error).toContain('Send failed');
 });
 });

 describe('sendTaskResponse / sendTaskProgress / sendTaskResult', () => {
 it('sendTaskResponse builds correct message', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 const { sendTaskResponse } = useResonanceStore.getState();

 await sendTaskResponse('task-1', 'accepted', 'ready');

 const sent = JSON.parse(
 mockSafeInvoke.mock.calls[mockSafeInvoke.mock.calls.length -1][1].message
 );
 expect(sent.type).toBe('task_response');
 expect(sent.payload.task_id).toBe('task-1');
 expect(sent.payload.status).toBe('accepted');
 expect(sent.payload.reason).toBe('ready');
 expect(sent.payload.selected_model).toBe('qwen2.5-3b');
 });

 it('sendTaskProgress builds correct message', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 const { sendTaskProgress } = useResonanceStore.getState();

 await sendTaskProgress('task-1', 50, 'reasoning', 'halfway');

 const sent = JSON.parse(
 mockSafeInvoke.mock.calls[mockSafeInvoke.mock.calls.length -1][1].message
 );
 expect(sent.type).toBe('task_progress');
 expect(sent.payload.task_id).toBe('task-1');
 expect(sent.payload.progress).toBe(50);
 expect(sent.payload.current_step).toBe('reasoning');
 expect(sent.payload.message).toBe('halfway');
 });

 it('sendTaskResult completed uses success summary', async () => {
 mockSafeInvoke.mockResolvedValue(undefined);
 const { sendTaskResult } = useResonanceStore.getState();

 await sendTaskResult('task-1', 'completed', { output: 'ok' });

 const sent = JSON.parse(
 mockSafeInvoke.mock.calls[mockSafeInvoke.mock.calls.length -1][1].message
 );
 expect(sent.type).toBe('task_result');
 expect(sent.payload.task_id).toBe('task-1');
 expect(sent.payload.status).toBe('completed');
 expect(sent.payload.result.summary).toBe('Task completed successfully');
 expect(sent.payload.result.data).toEqual({ output: 'ok' });
 });
 });

 describe('handleMessage', () => {
 it('updates modelScores on model_scores message', () => {
 const { handleMessage } = useResonanceStore.getState();

 handleMessage({
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
 const { handleMessage } = useResonanceStore.getState();

 handleMessage({
 msg_type: 'task_push',
 payload: sampleTask as unknown as Record<string, unknown>,
 });

 expect(useResonanceStore.getState().pendingTasks).toHaveLength(1);
 expect(useResonanceStore.getState().pendingTasks[0].task_id).toBe('task-1');
 });

 it('removes task on task_cancel', () => {
 useResonanceStore.setState({ pendingTasks: [sampleTask] });
 const { handleMessage } = useResonanceStore.getState();

 handleMessage({
 msg_type: 'task_cancel',
 payload: { task_id: 'task-1' },
 });

 expect(useResonanceStore.getState().pendingTasks).toHaveLength(0);
 });

 it('ignores unknown message types', () => {
 const { handleMessage } = useResonanceStore.getState();

 expect(() =>
 handleMessage({ msg_type: 'unknown', payload: {} })
 ).not.toThrow();
 });
 });

 describe('handleDisconnect', () => {
 it('returns error when no service selected', async () => {
 const { handleDisconnect } = useResonanceStore.getState();

 await handleDisconnect();

 const state = useResonanceStore.getState();
 expect(state.error).toBe('No service selected');
 expect(state.connectionStatus).toBe('disconnected');
 });

 it('stops reconnecting after max attempts', async () => {
 useResonanceStore.setState({
 selectedService: sampleService,
 reconnectAttempts: 5,
 });
 const { handleDisconnect } = useResonanceStore.getState();

 await handleDisconnect();

 const state = useResonanceStore.getState();
 expect(state.error).toBe('Max reconnection attempts reached');
 expect(state.connectionStatus).toBe('error');
 });
 });
});
