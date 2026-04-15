import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

interface WebSocketMessage {
  msg_type: string;
  payload: Record<string, unknown>;
}

interface ResonanceState {
  discoveredServices: DiscoveredService[];
  selectedService: DiscoveredService | null;
  connectionStatus: ConnectionStatus;
  modelScores: ModelScore[];
  pendingTasks: TaskPush[];
  error: string | null;
  reconnectAttempts: number;
  
  discoverServices: () => Promise<void>;
  selectService: (service: DiscoveredService) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (message: Record<string, unknown>) => Promise<void>;
  sendCapabilityRegister: () => Promise<void>;
  sendTaskResponse: (taskId: string, status: 'accepted' | 'rejected' | 'deferred', reason?: string) => Promise<void>;
  sendTaskProgress: (taskId: string, progress: number, currentStep: string, message: string) => Promise<void>;
  sendTaskResult: (taskId: string, status: 'completed' | 'failed' | 'cancelled', result: unknown) => Promise<void>;
  handleMessage: (message: WebSocketMessage) => Promise<void>;
  handleDisconnect: () => Promise<void>;
}

export const useResonanceStore = create<ResonanceState>()(
  persist(
    (set, get) => ({
      discoveredServices: [],
      selectedService: null,
      connectionStatus: 'disconnected',
      modelScores: [],
      pendingTasks: [],
      error: null,
      reconnectAttempts: 0,

      discoverServices: async () => {
        try {
          const services = await invoke<DiscoveredService[]>('discover_resonance');
          set({ discoveredServices: services, error: null });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      selectService: (service) => {
        set({ selectedService: service });
      },

      connect: async () => {
        const { selectedService } = get();
        if (!selectedService) {
          set({ error: 'No service selected' });
          return;
        }

        set({ connectionStatus: 'connecting', error: null });

        try {
          const wsUrl = `wss://${selectedService.host}:${selectedService.port}/api/v1/shadow/ws`;
          
          await invoke('ws_connect', { url: wsUrl });
          
          set({ connectionStatus: 'connected' });
          
          await get().sendCapabilityRegister();

          await listen('ws_message', (event) => {
            const msg = event.payload as WebSocketMessage;
            get().handleMessage(msg);
          });

          await listen('ws_disconnected', () => {
            get().handleDisconnect();
          });
        } catch (error) {
          set({ error: String(error), connectionStatus: 'error' });
        }
      },

      disconnect: async () => {
        try {
          await invoke('ws_disconnect');
          set({ connectionStatus: 'disconnected' });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      sendMessage: async (message: Record<string, unknown>) => {
        try {
          await invoke('ws_send', { message: JSON.stringify(message) });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      sendCapabilityRegister: async () => {
        const models = [
          { id: 'qwen2.5-3b', provider: 'candle-vllm', context_length: 8192, quantization: 'q4km', supports: ['chat', 'reasoning'] as string[] },
        ];

        const message = {
          type: 'capability_register',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            shadow_id: localStorage.getItem('shadow_id') || crypto.randomUUID(),
            device_type: 'desktop',
            instance_name: 'shadow-desktop-' + (typeof window !== 'undefined' ? window.location.hostname : 'unknown'),
            capabilities: {
              models,
              skills: [],
              mcp_tools: [],
            },
            preferred_connection: {
              protocol: 'wss',
              port: 8080,
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
              summary: status === 'completed' ? 'Task completed successfully' : 'Task failed',
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

      handleMessage: async (message: WebSocketMessage) => {
        switch (message.msg_type) {
          case 'model_scores':
            set({ modelScores: (message.payload.scores as ModelScore[]) });
            break;
          case 'task_push':
            set((state) => ({
              pendingTasks: [...state.pendingTasks, message.payload as unknown as TaskPush],
            }));
            break;
          case 'task_cancel': {
            const cancelPayload = message.payload as { task_id: string };
            set((state) => ({
              pendingTasks: state.pendingTasks.filter((t) => t.task_id !== cancelPayload.task_id),
            }));
            break;
          }
        }
      },

      handleDisconnect: async () => {
        const { reconnectAttempts, selectedService } = get();
        
        if (!selectedService) {
          set({ connectionStatus: 'disconnected', error: 'No service selected' });
          return;
        }

        set({ connectionStatus: 'disconnected' });

        const maxAttempts = 5;
        if (reconnectAttempts >= maxAttempts) {
          set({ error: 'Max reconnection attempts reached', connectionStatus: 'error' });
          return;
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        
        set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
        
        setTimeout(async () => {
          const { reconnectAttempts: currentAttempts } = get();
          if (currentAttempts <= maxAttempts) {
            set({ connectionStatus: 'connecting', error: null });
            try {
              await invoke('ws_reconnect');
              set({ connectionStatus: 'connected', reconnectAttempts: 0 });
            } catch (error) {
              set({ error: String(error), connectionStatus: 'error' });
              get().handleDisconnect();
            }
          }
        }, delay);
      },
    }),
    {
      name: 'resonance-storage',
      partialize: (state) => ({
        selectedService: state.selectedService,
      }),
    }
  )
);
