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

/**
 * Wire shape of a hippocampus task.
 *
 * `hippocampus-core/src/task.rs` puts
 * `#[serde(rename_all = "camelCase")]` on both `TaskRecord` and
 * `TaskStep`, and `#[serde(tag = "type", rename_all = "snake_case")]` plus
 * per-variant `rename_all = "camelCase"` on `StepTarget`. So the server
 * speaks camelCase; the `Task` / `TaskStep` interfaces above are the
 * UI-facing snake_case shape. The mappers below are the only place that
 * knows the difference.
 *
 * The snake_case spellings are accepted as fallbacks so the client keeps
 * working if that serde attribute is ever dropped.
 */
interface TaskRecordWire {
  taskId?: string;
  task_id?: string;
  source?: string;
  targetAgent?: string;
  target_agent?: string;
  status?: string;
  tenantId?: string;
  tenant_id?: string;
  receivedAt?: string;
  received_at?: string;
  completedAt?: string | null;
  completed_at?: string | null;
  result?: unknown;
  error?: string | null;
  payload?: unknown;
  tags?: string[];
  steps?: TaskStepWire[];
  [k: string]: unknown;
}

interface TaskStepWire {
  stepId?: string;
  step_id?: string;
  order?: number;
  dependsOn?: string[];
  depends_on?: string[];
  status?: string;
  startedAt?: string | null;
  started_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  result?: unknown;
  error?: string | null;
  target?: Record<string, unknown>;
  [k: string]: unknown;
}

function mapStepTarget(wire: unknown): TaskStepTarget | undefined {
  if (!wire || typeof wire !== 'object') return undefined;
  const raw = wire as Record<string, unknown>;
  if (raw.type === 'tool') {
    return {
      type: 'tool',
      tool_name: (raw.toolName ?? raw.tool_name) as string | undefined,
      args: raw.args,
      timeout_ms: (raw.timeoutMs ?? raw.timeout_ms) as number | null | undefined,
    };
  }
  return {
    type: 'agent',
    skill: raw.skill as string | undefined,
    lobe_id: (raw.lobeId ?? raw.lobe_id) as string | null | undefined,
    prompt: raw.prompt as string | undefined,
    inputs: raw.inputs,
  };
}

export function mapTaskStep(wire: TaskStepWire): TaskStep {
  const dependsOn = Array.isArray(wire.dependsOn)
    ? wire.dependsOn
    : Array.isArray(wire.depends_on)
      ? wire.depends_on
      : undefined;
  return {
    step_id: String(wire.stepId ?? wire.step_id ?? ''),
    order: typeof wire.order === 'number' ? wire.order : 0,
    depends_on: dependsOn ? dependsOn.map((d) => String(d)) : undefined,
    status: (wire.status ?? 'pending') as Task['status'],
    started_at: (wire.startedAt ?? wire.started_at) as string | null | undefined,
    completed_at: (wire.completedAt ?? wire.completed_at) as string | null | undefined,
    result: wire.result,
    error: (wire.error ?? null) as string | null,
    target: mapStepTarget(wire.target),
  };
}

export function mapTask(wire: TaskRecordWire): Task {
  const mapped: Task = {
    task_id: String(wire.taskId ?? wire.task_id ?? ''),
    source: (wire.source ?? 'local') as Task['source'],
    target_agent: String(wire.targetAgent ?? wire.target_agent ?? ''),
    status: (wire.status ?? 'pending') as Task['status'],
    tenant_id: String(wire.tenantId ?? wire.tenant_id ?? 'default'),
    received_at: String(wire.receivedAt ?? wire.received_at ?? ''),
    completed_at: (wire.completedAt ?? wire.completed_at ?? null) as string | null,
    result: wire.result,
    error: (wire.error ?? null) as string | null,
    payload: wire.payload,
    tags: Array.isArray(wire.tags) ? wire.tags.map((t) => String(t)) : undefined,
    steps: Array.isArray(wire.steps) ? wire.steps.map(mapTaskStep) : undefined,
  };
  return mapped;
}

/**
 * `TaskStepTarget.type` is optional on both union members, so the
 * compiler cannot narrow the union by discriminant alone. Read the
 * members through a plain record instead.
 */
function toStepTargetWire(target: TaskStepTarget | undefined): Record<string, unknown> | undefined {
  if (!target) return undefined;
  const raw = target as unknown as Record<string, unknown>;
  if (raw.type === 'tool') {
    return {
      type: 'tool',
      toolName: raw.tool_name,
      args: raw.args ?? null,
      timeoutMs: raw.timeout_ms ?? null,
    };
  }
  return {
    type: 'agent',
    skill: raw.skill,
    lobeId: raw.lobe_id ?? null,
    prompt: raw.prompt,
    inputs: raw.inputs ?? null,
  };
}

/** Inverse of {@link mapTask} — the shape `UpsertTaskRequest` expects. */
export function toTaskRecordWire(task: Task, tenantId: string): Record<string, unknown> {
  return {
    taskId: task.task_id,
    source: task.source ?? 'local',
    targetAgent: task.target_agent,
    status: task.status,
    tenantId,
    receivedAt: task.received_at,
    completedAt: task.completed_at ?? null,
    result: task.result ?? null,
    error: task.error ?? null,
    payload: task.payload ?? null,
    tags: task.tags ?? [],
    steps: (task.steps ?? []).map((s) => ({
      stepId: s.step_id,
      order: s.order,
      dependsOn: s.depends_on ?? [],
      status: s.status,
      startedAt: s.started_at ?? null,
      completedAt: s.completed_at ?? null,
      result: s.result ?? null,
      error: s.error ?? null,
      target: toStepTargetWire(s.target),
    })),
  };
}

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
    const wire = await this.request<TaskRecordWire[]>(
      `/hippocampus/api/tasks?tenantId=${encodeURIComponent(tenantId)}`
    );
    return wire.map(mapTask);
  }

  async getTask(tenantId: string, taskId: string): Promise<Task> {
    const wire = await this.request<TaskRecordWire>(
      `/hippocampus/api/tasks/${encodeURIComponent(tenantId)}/${encodeURIComponent(taskId)}`
    );
    return mapTask(wire);
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
    const merged: Task = {
      ...current,
      ...updates,
      task_id: current.task_id || taskId,
      target_agent: current.target_agent,
      tenant_id: tenantId,
    };
    const body = toTaskRecordWire(merged, tenantId);
    // Frontend-only fields: the server's `UpsertTaskRequest` has no such
    // columns and serde ignores unknown fields, so these are dropped —
    // they only round-trip in the client cache.
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.priority !== undefined) body.priority = updates.priority;
    if (updates.metadata !== undefined) body.metadata = updates.metadata;
    const wire = await this.request<TaskRecordWire>('/hippocampus/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapTask(wire);
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
