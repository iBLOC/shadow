export interface SessionResponse {
  id: string;
  name?: string;
  createdAt: string;
}

export interface ProcessResponse {
  response: string;
}

export interface Provider {
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
}

export interface Task {
  task_id: string;
  source?: 'local' | 'a2a' | 'schedule';
  target_agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tenant_id: string;
  received_at: string;
  completed_at: string | null;
  result?: unknown;
  error?: string | null;
  payload?: unknown;
  tags?: string[];
  /** Frontend-only presentation fields. hippocampus TaskRecord has
   *  no such columns, so edits to them are not persisted server-side
   *  (upsert drops unknown fields); they only round-trip in the
   *  client cache. Optional because the backend never sends them. */
  title?: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
  /** Sub-task DAG from hippocampus TaskRecord.steps. The backend
   *  serialises camelCase (stepId/dependsOn/...); fields below use
   *  the snake_case spellings the desktop UI reads. */
  steps?: TaskStep[];
}

export interface TaskStep {
  step_id: string;
  order: number;
  depends_on?: string[];
  status: Task['status'];
  started_at?: string | null;
  completed_at?: string | null;
  result?: unknown;
  error?: string | null;
  /** Mirrors hippocampus `StepTarget` (tag = "type",
   *  rename_all = "snake_case"). The `prompt`/`skill`/`tool_name`
   *  fields below come from the wire. */
  target?: TaskStepTarget;
}

export type TaskStepTarget =
  | {
      type?: 'agent';
      skill?: string;
      lobe_id?: string | null;
      prompt?: string;
      inputs?: unknown;
    }
  | {
      type?: 'tool';
      tool_name?: string;
      args?: unknown;
      timeout_ms?: number | null;
    };

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type ServiceStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy' | 'offline';

export interface ServiceInfo {
  name: string;
  displayName: string;
  host: string;
  port: number;
  status: ServiceStatus;
  latency?: number;
  error?: string;
  lastCheck?: Date;
}

type HttpRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

import { prefrontalUrl } from './platform';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { useErrorDialogStore } from '../stores/errorDialogStore';

export class PrefrontalClient {
  private headers: Record<string, string>;

  constructor(baseUrl?: string) {
    this.headers = {
      'Content-Type': 'application/json',
    };
    if (baseUrl) {
      useTelencephalonStore.getState().setBaseUrl(baseUrl);
    }
  }

  private getBaseUrl(): string {
    const cortexBase = useTelencephalonStore.getState().connection.baseUrl;
    if (cortexBase) return cortexBase;
    return prefrontalUrl();
  }

  private async request<T>(
    endpoint: string,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          ...this.headers,
          ...options.headers,
        },
        body: options.body,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      useErrorDialogStore.getState().show({
        source: 'http',
        endpoint: url,
        method,
        message: `Network error: ${message}`,
        stack,
      });
      throw err;
    }

    if (!response.ok) {
      let body = '';
      try {
        const text = await response.clone().text();
        body = text ? `: ${text.slice(0, 500)}` : '';
      } catch {
        // body read failures are non-fatal
      }
      const message = `HTTP ${response.status}: ${response.statusText}${body}`;
      useErrorDialogStore.getState().show({
        source: 'http',
        endpoint: url,
        method,
        status: response.status,
        statusText: response.statusText,
        message,
      });
      throw new Error(message);
    }

    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('/health');
      return true;
    } catch {
      return false;
    }
  }

  async createSession(name?: string): Promise<SessionResponse> {
    const env = await this.request<ApiEnvelope<SessionResponse>>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!env.success) throw new Error(env.error || 'createSession failed');
    return env.data!;
  }

  async listSessions(): Promise<SessionResponse[]> {
    const env = await this.request<ApiEnvelope<SessionResponse[]>>('/api/sessions');
    if (!env.success) throw new Error(env.error || 'listSessions failed');
    return env.data ?? [];
  }

  async getSession(sessionId: string): Promise<SessionResponse> {
    return this.request<SessionResponse>(`/api/sessions/${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async exportSession(sessionId: string): Promise<unknown> {
    return this.request<unknown>(`/api/sessions/${sessionId}/export`);
  }

  async prepareMigration(sessionId: string): Promise<{
    ready_for_migration: boolean;
    session_id: string;
    payload: unknown;
    size_bytes: number;
  }> {
    return this.request(`/api/sessions/${sessionId}/migrate`);
  }

  async importSession(payload: unknown, opts: { newId?: boolean } = {}): Promise<unknown> {
    return this.request('/api/sessions/import', {
      method: 'POST',
      body: JSON.stringify({
        payload,
        new_id: opts.newId ?? true,
      }),
    });
  }

  async listA2APeers(): Promise<{ count: number; data: unknown[] }> {
    return this.request<{ count: number; data: unknown[] }>('/api/a2a/peers');
  }

  async registerA2APeer(id: string, url: string, fetchCard = true): Promise<unknown> {
    return this.request('/api/a2a/peers', {
      method: 'POST',
      body: JSON.stringify({ id, url, fetch_card: fetchCard }),
    });
  }

  async delegateToPeer(
    peerId: string,
    message: string,
    wait: boolean
  ): Promise<{
    text: string;
    task_id?: string | null;
    state: string;
  }> {
    return this.request('/api/a2a/delegate', {
      method: 'POST',
      body: JSON.stringify({ peer_id: peerId, message, wait }),
    });
  }

  async getA2ATask(peerId: string, taskId: string): Promise<{
    task_id: string;
    state: string;
    result?: { text: string };
  }> {
    return this.request(`/api/a2a/peers/${peerId}/tasks/${taskId}`);
  }

  async cancelA2ATask(peerId: string, taskId: string): Promise<{ success: boolean }> {
    return this.request(`/api/a2a/peers/${peerId}/tasks/${taskId}/cancel`, {
      method: 'DELETE',
    });
  }

  async addSessionMessage(
    sessionId: string,
    role: string,
    content: string
  ): Promise<void> {
    await this.request(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, content }),
    });
  }

  async processMessage(
    sessionId: string,
    message: string,
    useTools: boolean = false
  ): Promise<ProcessResponse> {
    return this.request<ProcessResponse>(
      `/api/sessions/${sessionId}/process`,
      {
        method: 'POST',
        body: JSON.stringify({ message, useTools }),
      }
    );
  }

  async *processMessageStream(
    sessionId: string,
    message: string,
    useTools: boolean = false
  ): AsyncGenerator<string> {
    const url = `${this.getBaseUrl()}/api/sessions/${sessionId}/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ message, useTools }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          yield data;
        }
      }
    }
  }

  async listProviders(): Promise<Provider[]> {
    return this.request<Provider[]>('/api/providers');
  }

  async addProvider(provider: Provider): Promise<void> {
    await this.request('/api/providers', {
      method: 'POST',
      body: JSON.stringify(provider),
    });
  }

  async deleteProvider(type: string): Promise<void> {
    await this.request(`/api/providers/${type}`, { method: 'DELETE' });
  }

  async listModelProviders(): Promise<Provider[]> {
    return this.request<Provider[]>('/api/model-providers');
  }

  async listAgents(): Promise<Agent[]> {
    const env = await this.request<ApiEnvelope<Agent[]>>('/api/agents');
    if (!env.success) throw new Error(env.error || 'listAgents failed');
    return env.data ?? [];
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${agentId}`);
  }

  async listTasks(tenantId: string = 'default'): Promise<Task[]> {
    return this.request<Task[]>(`/hippocampus/api/tasks?tenantId=${encodeURIComponent(tenantId)}`);
  }

  async getTask(tenantId: string, taskId: string): Promise<Task> {
    return this.request<Task>(`/hippocampus/api/tasks/${encodeURIComponent(tenantId)}/${encodeURIComponent(taskId)}`);
  }

  /**
   * Persist task updates via the hippocampus upsert endpoint
   * (POST /hippocampus/api/tasks). Only fields the backend
   * TaskRecord knows (status/tags/steps/payload/...) survive the
   * round-trip; title/description/priority/metadata are
   * frontend-only and silently dropped by the backend.
   */
  async updateTask(
    tenantId: string,
    taskId: string,
    updates: Partial<Pick<Task, 'status' | 'tags' | 'title' | 'description' | 'priority' | 'metadata' | 'steps' | 'payload' | 'result' | 'error'>>,
  ): Promise<Task> {
    const current = await this.getTask(tenantId, taskId);
    const body = {
      ...current,
      ...updates,
      task_id: current.task_id,
      target_agent: current.target_agent,
      tenant_id: tenantId,
    };
    return this.request<Task>('/hippocampus/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteTask(tenantId: string, taskId: string): Promise<void> {
    await this.request<void>(
      `/hippocampus/api/tasks/${encodeURIComponent(tenantId)}/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    );
  }

  async listSkills(): Promise<unknown[]> {
    return this.request<unknown[]>('/api/skills');
  }

  async listMcpServers(): Promise<unknown[]> {
    return this.request<unknown[]>('/api/mcp/servers');
  }

  async listConversations(): Promise<unknown[]> {
    return this.request<unknown[]>('/api/conversations');
  }

  async listMemories(
    query?: string,
    limit: number = 10
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', limit.toString());
    return this.request<unknown[]>(`/api/memory/search?${params}`);
  }

  setAuthToken(token: string): void {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.headers['Authorization'];
  }
}

export const prefrontalClient = new PrefrontalClient(prefrontalUrl());
