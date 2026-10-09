import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type SendMessageResponse } from '../lib/telencephalonClient';
import { safeInvoke } from '../lib/tauriSafe';
import { useTelencephalonStore } from './telencephalonStore';
import { useServiceStore } from './serviceStore';

export interface DiscoveredService {
  name: string;
  host: string;
  port: number;
  txt_records: Record<string, string>;
}

export interface ModelScore {
  model_id: string;
  benchmark_scores: {
    reasoning: number;
    code: number;
    creativity: number;
    speed: number;
  };
  overall_score: number;
}

export interface TaskPush {
  task_id: string;
  priority: 'high' | 'normal' | 'low';
  goal: string;
  required_capabilities: {
    min_model_score: number;
    preferred_models: string[];
    required_skills: string[];
  };
  context: {
    user_id: string;
    session_id: string;
    metadata: Record<string, unknown>;
  };
  deadline?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface A2aMessage {
  msg_type: string;
  payload: Record<string, unknown>;
}

interface ResonanceState {
  discoveredServices: DiscoveredService[];
  connectionStatus: ConnectionStatus;
  modelScores: ModelScore[];
  pendingTasks: TaskPush[];
  error: string | null;
  reconnectAttempts: number;
  a2aEndpoint: string;

  discoverServices: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (message: Record<string, unknown>) => Promise<void>;
  sendCapabilityRegister: () => Promise<void>;
  sendTaskResponse: (
    taskId: string,
    status: 'accepted' | 'rejected' | 'deferred',
    reason?: string,
  ) => Promise<void>;
  sendTaskProgress: (
    taskId: string,
    progress: number,
    currentStep: string,
    message: string,
  ) => Promise<void>;
  sendTaskResult: (
    taskId: string,
    status: 'completed' | 'failed' | 'cancelled',
    result: unknown,
  ) => Promise<void>;
  handleMessage: (message: A2aMessage) => Promise<void>;
  handleDisconnect: () => Promise<void>;
  clearError: () => void;
}

function getA2aEndpoint(): string {
  const base = useTelencephalonStore.getState().connection.baseUrl;
  return `${base}/a2a`;
}

async function postA2a(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`A2A gateway ${resp.status}: ${resp.statusText}`);
  }
  return resp.json();
}

export const useResonanceStore = create<ResonanceState>()(
  persist(
    (set, get) => ({
      discoveredServices: [],
      connectionStatus: 'disconnected',
      modelScores: [],
      pendingTasks: [],
      error: null,
      reconnectAttempts: 0,
      a2aEndpoint: getA2aEndpoint(),

      clearError: () => set({ error: null }),

      discoverServices: async () => {
        if (!useServiceStore.getState().hasConfiguredResonance()) {
          set({
            error: 'No Resonance instances configured. Add one in Settings first.',
            discoveredServices: [],
          });
          return;
        }
        try {
          const services = await safeInvoke<DiscoveredService[]>(
            'discover_resonance',
          );
          set({ discoveredServices: services ?? [], error: null });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      connect: async () => {
        const cortexStatus = useTelencephalonStore.getState().status;
        if (cortexStatus !== 'running') {
          set({
            error: 'Cortex must be running to connect to Resonance',
            connectionStatus: 'error',
          });
          return;
        }

        if (!useServiceStore.getState().hasConfiguredResonance()) {
          set({
            error: 'No Resonance instances configured. Add one in Settings first.',
            connectionStatus: 'error',
          });
          return;
        }

        set({ connectionStatus: 'connecting', error: null, a2aEndpoint: getA2aEndpoint() });

        try {
          const endpoint = `${getA2aEndpoint()}/health`;
          const resp = await fetch(endpoint);
          if (!resp.ok) {
            throw new Error(`cortex A2A gateway not reachable: ${resp.status}`);
          }

          set({ connectionStatus: 'connected' });
          await get().sendCapabilityRegister();
        } catch (error) {
          set({ error: String(error), connectionStatus: 'error' });
        }
      },

      disconnect: async () => {
        set({ connectionStatus: 'disconnected' });
      },

      sendMessage: async (message) => {
        if (get().connectionStatus !== 'connected') {
          set({ error: 'Not connected to Resonance (via cortex A2A gateway)' });
          return;
        }
        try {
          await postA2a(`${getA2aEndpoint()}/tasks/send`, {
            method: 'tasks/send',
            params: message,
          });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      sendCapabilityRegister: async () => {
        const models = [
          {
            id: 'qwen2.5-3b',
            provider: 'candle-vllm',
            context_length: 8192,
            quantization: 'q4km',
            supports: ['chat', 'reasoning'] as string[],
          },
        ];

        const message = {
          type: 'capability_register',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            shadow_id: localStorage.getItem('shadow_id') || crypto.randomUUID(),
            device_type: 'desktop',
            instance_name:
              'shadow-desktop-' +
              (typeof window !== 'undefined' ? window.location.hostname : 'unknown'),
            capabilities: {
              models,
              skills: [],
              mcp_tools: [],
            },
            preferred_connection: {
              protocol: 'https',
              port: 60080,
            },
          },
        };

        await get().sendMessage(message);
      },

      sendTaskResponse: async (taskId, status, reason) => {
        const message = {
          type: 'task_response',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            task_id: taskId,
            status,
            reason,
            selected_model: 'qwen2.5-3b',
          },
        };

        await get().sendMessage(message);
      },

      sendTaskProgress: async (taskId, progress, currentStep, message) => {
        const msg = {
          type: 'task_progress',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            task_id: taskId,
            progress,
            current_step: currentStep,
            message,
          },
        };

        await get().sendMessage(msg);
      },

      sendTaskResult: async (taskId, status, result) => {
        const message = {
          type: 'task_result',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            task_id: taskId,
            status,
            result: {
              summary:
                status === 'completed'
                  ? 'Task completed successfully'
                  : 'Task failed',
              data: result,
            },
            memory_summary: {
              memories_created: 0,
              entities_extracted: 0,
            },
          },
        };

        await get().sendMessage(message);
      },

      handleMessage: async (message) => {
        switch (message.msg_type) {
          case 'model_scores':
            set({ modelScores: message.payload.scores as ModelScore[] });
            break;
          case 'task_push':
            set((state) => ({
              pendingTasks: [
                ...state.pendingTasks,
                message.payload as unknown as TaskPush,
              ],
            }));
            break;
          case 'task_cancel': {
            const cancelPayload = message.payload as { task_id: string };
            set((state) => ({
              pendingTasks: state.pendingTasks.filter(
                (t) => t.task_id !== cancelPayload.task_id,
              ),
            }));
            break;
          }
        }
      },

      handleDisconnect: async () => {
        set({ connectionStatus: 'disconnected' });

        const maxAttempts = 5;
        const { reconnectAttempts } = get();
        if (reconnectAttempts >= maxAttempts) {
          set({
            error: 'Max reconnection attempts reached',
            connectionStatus: 'error',
          });
          return;
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));

        setTimeout(() => {
          const { reconnectAttempts: current } = get();
          if (current > maxAttempts) return;
          void get().connect();
        }, delay);
      },
    }),
    { name: 'resonance-state' },
  ),
);

export type { SendMessageResponse };