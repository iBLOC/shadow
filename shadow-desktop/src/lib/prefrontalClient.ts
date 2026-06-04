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
  id: string;
  status: string;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
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

export class PrefrontalClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string = 'http://localhost:8082') {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        ...this.headers,
        ...options.headers,
      },
      body: options.body,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    return this.request<SessionResponse>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async listSessions(): Promise<SessionResponse[]> {
    return this.request<SessionResponse[]>('/api/sessions');
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
    const url = `${this.baseUrl}/api/sessions/${sessionId}/stream`;
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
    return this.request<Agent[]>('/api/agents');
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${agentId}`);
  }

  async listTasks(): Promise<Task[]> {
    return this.request<Task[]>('/api/tasks');
  }

  async getTask(taskId: string): Promise<Task> {
    return this.request<Task>(`/api/tasks/${taskId}`);
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

export const prefrontalClient = new PrefrontalClient();
