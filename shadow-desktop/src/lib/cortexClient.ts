const DEFAULT_CORTEX_URL = 'http://127.0.0.1:60000';

export interface CortexConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  url: string;
  metadata: {
    input_modalities: string[];
    output_modalities: string[];
    capabilities: string[];
  };
}

export interface LobeInfo {
  name: string;
  kind: 'native' | 'wasm' | 'prompt' | 'external';
  url: string;
  enabled: boolean;
  skills: string[];
  agent_card: AgentCard;
  health_status: 'healthy' | 'unhealthy' | 'unknown' | 'offline';
}

export interface AgentsResponse {
  cortex: {
    id: string;
    instance_name: string;
    default_agent: string;
  };
  agents: LobeInfo[];
}

export interface Conversation {
  id: string;
  agent: string;
  created_at: string;
  updated_at: string;
  history: Array<{
    role: 'user' | 'agent';
    text: string;
    timestamp: number;
  }>;
}

export interface SendMessageRequest {
  text: string;
  agent?: string;
}

export interface SendMessageResponse {
  conversation_id: string;
  agent: string;
  reply: string;
  state: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  timestamp: number;
}

export interface StreamEvent {
  type: 'delta' | 'done' | 'error';
  agent?: string;
  delta?: string;
  conversation_id?: string;
  state?: string;
  timestamp?: number;
  error?: string;
}

export interface FlowMeta {
  id: string;
  name: string;
  version: string;
  is_draft: boolean;
  tags: string[];
}

export interface FlowDefinition {
  id: string;
  name: string;
  version: string;
  schema_version: string;
  description?: string | null;
  inputs: unknown[];
  outputs: unknown[];
  variables: unknown[];
  nodes: unknown[];
  edges: unknown[];
  metadata?: {
    tags?: string[];
    created_by?: string | null;
    provenance?: unknown;
  };
}

export interface FlowRunResult {
  outputs: Record<string, unknown>;
}

export interface AgentMutationResult {
  name: string;
  version: string;
  kind: string;
  skills: string[];
  description: string | null;
  created_at: string;
}

export interface GeneratedDescription {
  description: string;
  model: string;
}

export interface AgentSearchHit {
  name: string;
  kind: string;
  description: string | null;
  skills: string[];
  url: string | null;
  enabled: boolean;
  version: string;
}

export interface AgentSearchResponse {
  count: number;
  agents: AgentSearchHit[];
}

export interface ScanResult {
  scanned_at: string;
  hosts: string;
  detected: Array<{
    provider_id: string;
    provider_label: string;
    detected_path: string;
    version: string | null;
    reachable: boolean;
    endpoint: string | null;
    skills: string[];
    models: string[];
  }>;
}

export interface InstalledWasmEntry {
  name: string;
  version: string;
  sha256: string;
  source: string;
  source_url: string | null;
  size_bytes: number;
  uploaded_at: string;
}

export interface InstalledWasmList {
  count: number;
  entries: InstalledWasmEntry[];
}

export type McpServerState = 'stopped' | 'starting' | 'running' | 'error';

export interface McpWasmRef {
  name: string;
  version: string;
  sha256: string;
}

export interface McpResourceQuota {
  memory_bytes: number;
  fuel: number;
  wall_clock_ms: number;
}

export interface McpToolSummary {
  name: string;
  description: string | null;
  input_schema: unknown;
}

export interface McpServerRecord {
  id: string;
  name: string;
  wasm: McpWasmRef;
  quota: McpResourceQuota;
  description: string | null;
  state: McpServerState;
  last_error: string | null;
  tools: McpToolSummary[];
  registered_at: string;
  last_started_at: string | null;
}

export interface McpServerList {
  count: number;
  servers: McpServerRecord[];
}

export interface McpAgentBinding {
  agent_name: string;
  server_id: string;
  bound_at: string;
}

export interface McpAgentBindingsList {
  agent_name: string;
  count: number;
  bindings: McpAgentBinding[];
}

export interface DiscoveryResult {
  agents: Array<{
    name: string;
    kind: string;
    description: string;
    skills: string[];
    input_modalities: string[];
    output_modalities: string[];
    url: string | null;
    enabled: boolean;
    version: string;
  }>;
  count: number;
}

export class CortexClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: Partial<CortexConfig> = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_CORTEX_URL;
    this.apiKey = config.apiKey;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    if (this.apiKey) {
      headers['X-Shadow-Key'] = this.apiKey;
    }
    const resp = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`cortex ${resp.status}: ${text || resp.statusText}`);
    }
    if (resp.status === 204) return undefined as T;
    return resp.json() as Promise<T>;
  }

  async health(): Promise<{ status: string; addr: string }> {
    return this.request('/.well-known/agent.json');
  }

  async listAgents(): Promise<AgentsResponse> {
    return this.request('/shadow/v1/agents');
  }

  async getAgent(name: string): Promise<{ name: string; agent_card: AgentCard; health_status: string }> {
    return this.request(`/shadow/v1/agents/${encodeURIComponent(name)}`);
  }

  async createConversation(opts: { agent?: string; system?: string } = {}): Promise<Conversation> {
    return this.request('/shadow/v1/conversations', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request(`/shadow/v1/conversations/${encodeURIComponent(id)}`);
  }

  async listConversations(): Promise<Conversation[]> {
    return this.request('/shadow/v1/conversations');
  }

  async sendMessage(conversationId: string, req: SendMessageRequest): Promise<SendMessageResponse> {
    return this.request(`/shadow/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async *streamMessage(conversationId: string, req: SendMessageRequest): AsyncGenerator<StreamEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-Shadow-Key'] = this.apiKey;
    const resp = await fetch(
      `${this.baseUrl}/shadow/v1/conversations/${encodeURIComponent(conversationId)}/messages:stream`,
      { method: 'POST', headers, body: JSON.stringify(req) },
    );
    if (!resp.ok || !resp.body) {
      throw new Error(`cortex stream ${resp.status}: ${resp.statusText}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          yield JSON.parse(data) as StreamEvent;
        } catch {
          /* skip malformed */
        }
      }
    }
  }

  webrtcSignalingUrl(sessionId: string, modality: string = 'voice'): string {
    return `${this.baseUrl}/api/webrtc/${modality}/sessions/${encodeURIComponent(sessionId)}/ws`;
  }

  async listFlows(opts: { name?: string; tag?: string; isDraft?: boolean } = {}): Promise<FlowMeta[]> {
    const params = new URLSearchParams();
    if (opts.name) params.set('name', opts.name);
    if (opts.tag) params.set('tag', opts.tag);
    if (opts.isDraft !== undefined) params.set('is_draft', String(opts.isDraft));
    const qs = params.toString();
    const path = `/api/flows${qs ? `?${qs}` : ''}`;
    return this.request<FlowMeta[]>(path);
  }

  async getFlow(id: string): Promise<FlowDefinition> {
    return this.request<FlowDefinition>(`/api/flows/${encodeURIComponent(id)}`);
  }

  async createFlow(flow: FlowDefinition): Promise<FlowDefinition> {
    return this.request<FlowDefinition>('/api/flows', {
      method: 'POST',
      body: JSON.stringify(flow),
    });
  }

  async runFlow(
    flowName: string,
    inputs: Record<string, unknown>,
    opts: { sessionId?: string; version?: string } = {},
  ): Promise<FlowRunResult> {
    const body: Record<string, unknown> = { inputs };
    if (opts.sessionId) body.session_id = opts.sessionId;
    const versionPath = opts.version ? `/${encodeURIComponent(opts.version)}` : '';
    return this.request<FlowRunResult>(
      `/api/flows/by-name/${encodeURIComponent(flowName)}${versionPath}/invoke`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  async listDrafts(): Promise<FlowDefinition[]> {
    const resp = await this.request<{ drafts?: FlowDefinition[] } | FlowDefinition[]>('/api/flows/draft');
    if (Array.isArray(resp)) return resp;
    return resp.drafts ?? [];
  }

  async promoteDraft(draftId: string): Promise<FlowDefinition> {
    return this.request<FlowDefinition>(
      `/api/flows/draft/${encodeURIComponent(draftId)}/promote`,
      { method: 'POST', body: '{}' },
    );
  }

  async rejectDraft(draftId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/flows/draft/${encodeURIComponent(draftId)}/reject`, {
      method: 'POST',
      headers: this.apiKey ? { 'X-Shadow-Key': this.apiKey } : {},
    });
  }

  async createPromptAgent(req: {
    name: string;
    version?: string;
    system_prompt: string;
    description?: string;
    skills?: string[];
    model_provider?: string;
    model_name?: string;
  }): Promise<AgentMutationResult> {
    return this.request<AgentMutationResult>('/api/cortex/admin/agents/create', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async generateAgentDescription(systemPrompt: string): Promise<GeneratedDescription> {
    return this.request<GeneratedDescription>(
      '/api/cortex/admin/agents/generate-description',
      {
        method: 'POST',
        body: JSON.stringify({ system_prompt: systemPrompt }),
      },
    );
  }

  async scanExternalAgents(): Promise<ScanResult> {
    return this.request<ScanResult>('/api/cortex/agents/scan', { method: 'POST' });
  }

  async syncExternalAgent(providerId: string): Promise<AgentMutationResult> {
    return this.request<AgentMutationResult>(
      `/api/cortex/agents/sync/${encodeURIComponent(providerId)}`,
      { method: 'POST' }
    );
  }

  async discoverAgents(): Promise<DiscoveryResult> {
    return this.request<DiscoveryResult>('/api/cortex/agents/discover');
  }

  async listInstalledWasm(): Promise<InstalledWasmList> {
    return this.request<InstalledWasmList>('/api/cortex/admin/agents/installed');
  }

  async deleteWasm(name: string, version: string): Promise<void> {
    await this.request<void>(
      `/api/cortex/admin/agents/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
      { method: 'DELETE' },
    );
  }

  async searchAgents(opts: { skill?: string; q?: string } = {}): Promise<AgentSearchResponse> {
    const params = new URLSearchParams();
    if (opts.skill) params.set('skill', opts.skill);
    if (opts.q) params.set('q', opts.q);
    const qs = params.toString();
    return this.request<AgentSearchResponse>(
      `/api/cortex/agents/search${qs ? `?${qs}` : ''}`,
    );
  }

  async listMcpServers(): Promise<McpServerList> {
    return this.request<McpServerList>('/api/cortex/mcp/servers');
  }

  async getMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/cortex/mcp/servers/${encodeURIComponent(id)}`,
    );
  }

  async getMcpServerTools(id: string): Promise<McpToolSummary[]> {
    return this.request<McpToolSummary[]>(
      `/api/cortex/mcp/servers/${encodeURIComponent(id)}/tools`,
    );
  }

  async listMcpServersForAgent(agentName: string): Promise<McpAgentBindingsList> {
    return this.request<McpAgentBindingsList>(
      `/api/cortex/mcp/agents/${encodeURIComponent(agentName)}/servers`,
    );
  }

  async getAgentMcpTools(agentName: string): Promise<McpToolSummary[]> {
    return this.request<McpToolSummary[]>(
      `/api/cortex/mcp/agents/${encodeURIComponent(agentName)}/tools`,
    );
  }

  async createMcpServer(req: {
    name: string;
    wasm: McpWasmRef;
    quota?: McpResourceQuota;
    description?: string;
  }): Promise<McpServerRecord> {
    return this.request<McpServerRecord>('/api/cortex/admin/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async deleteMcpServer(id: string): Promise<void> {
    await this.request<void>(
      `/api/cortex/admin/mcp/servers/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  }

  async startMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/cortex/admin/mcp/servers/${encodeURIComponent(id)}/start`,
      { method: 'POST' },
    );
  }

  async stopMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/cortex/admin/mcp/servers/${encodeURIComponent(id)}/stop`,
      { method: 'POST' },
    );
  }

  async bindMcpServerToAgent(agentName: string, serverId: string): Promise<McpAgentBinding> {
    return this.request<McpAgentBinding>(
      `/api/cortex/admin/mcp/agents/${encodeURIComponent(agentName)}/servers/${encodeURIComponent(serverId)}`,
      { method: 'POST' },
    );
  }

  async unbindMcpServerFromAgent(agentName: string, serverId: string): Promise<void> {
    await this.request<void>(
      `/api/cortex/admin/mcp/agents/${encodeURIComponent(agentName)}/servers/${encodeURIComponent(serverId)}`,
      { method: 'DELETE' },
    );
  }
}

export const cortexClient = new CortexClient();