import { isTauri, neuronUrl } from './platform';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_CORTEX_URL = 'http://127.0.0.1:60080';

// Embedded-neuron bridge constants (Tauri desktop conversation path).
const NEURON_CHAT_MODEL_FALLBACK = 'qwen3-0.6b';
const SHADOW_NEURON_SYSTEM =
  "You are Shadow (影), the user's personal AI avatar running locally. " +
  'Reply helpfully and concisely in the language the user writes in. ' +
  // Qwen3 soft switch — skips the <think> reasoning block entirely,
  // which otherwise burns minutes of CPU generation before any answer
  // text appears (the bridge also strips think blocks as a fallback).
  '/no_think';

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
  config?: Record<string, unknown>;
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
  type: 'delta' | 'done' | 'error' | 'audio_event' | 'computer_use_action';
  agent?: string;
  delta?: string;
  conversation_id?: string;
  state?: string;
  timestamp?: number;
  error?: string;
  /** Audio event payload (BC-01..05). Present when type ===
   *  'audio_event'. `classId` matches the diencephalon audio
   *  classifier id (e.g. "baby_cry"); `confidence` is 0..1. */
  audio?: {
    classId: string
    confidence: number
    source: string
  }
  /** Computer-use proposed-action payload (R-11 preview-before-
   *  commit). Present when type === 'computer_use_action'. The
   *  modal renders the proposed action and asks the user to
   *  Proceed / Cancel. */
  computerUse?: {
    action: 'mouse_click' | 'mouse_move' | 'keyboard_type' | 'keyboard_combo'
    x?: number
    y?: number
    button?: 'left' | 'right' | 'middle'
    text?: string
    combo?: string
  }
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

export interface ModelProvider {
  id: string;
  name: string;
  provider_type: string;
  api_base?: string;
  api_key?: string;
  models: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  model_id: string;
  is_default: boolean;
  capabilities: string[];
  supports_vision: boolean;
  supports_function_calling: boolean;
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

// Video source types (Spec #1 — cortex_video_sources table)
export interface VideoSource {
  id: string;
  deviceId: string;
  label: string;
  kind: string;
  serial?: string;
  transport: string;
  capabilities: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceBlock {
  platform: string;
  hostname: string;
  cortexVersion: string;
}

export interface TelencephalonVideoSourcesSnapshot {
  sources: VideoSource[];
  activeId?: string | null;
  device?: DeviceBlock | null;
}

export interface ThalamusSensorStats {
  name: string;
  capacity: number;
  length: number;
  oldest_ts_ms: number | null;
  newest_ts_ms: number | null;
}

export interface ThalamusSample {
  ts_ms: number;
  value: number;
}

export interface ThalamusSensorList {
  sensors: string[];
}

export interface HippocampusMemory {
  id: string;
  uri: string;
  content: string;
  layer: string;
  dimension: string;
  memory_type: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface HippocampusStats {
  memory_count: number;
  graph_node_count: number;
  pending_consolidations: number;
}

export interface HippocampusRecent {
  entries: HippocampusMemory[];
  filter: {
    layer?: string;
    dimension?: string;
    limit?: number;
  };
}

export interface ConsolidatorState {
  pending: number;
  last_consolidated_id: string | null;
  last_run_at: string | null;
  last_status: string | null;
}

export interface GraphNode {
  node_id: string;
  _stub?: boolean;
}

export interface NeuronModelSummary {
  capability: string;
  model_id: string;
  quantization: string | null;
}

export interface NeuronModelsResponse {
  models: NeuronModelSummary[];
}

export interface NeuronStats {
  running: boolean;
  models_loaded: number;
}

export interface SubsystemTokenResponse {
  token: string;
  scopes: string[];
  expires_at_unix: number;
}

export class Telencephalon412Error extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'Telencephalon412Error';
  }
}

export class TelencephalonClient {
  private baseUrl: string;
  private apiKey?: string;

  // ---- embedded-neuron chat bridge (Tauri desktop) ----
  // The cortex sidecar is gone from the desktop app (replaced by the
  // in-process encephalon crate), so the /shadow/v1 conversation API no
  // longer exists there. In Tauri builds the conversation surface talks
  // to the embedded neuron's OpenAI-compatible /v1/chat/completions
  // instead, preserving the StreamEvent contract ConversationPage
  // consumes. Web builds keep targeting a deployed cortex.
  private neuronHistory = new Map<string, Array<{ role: 'system' | 'user' | 'assistant'; content: string }>>();
  private neuronModel: string | null = null;

  constructor(config: Partial<CortexConfig> = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_CORTEX_URL;
    this.apiKey = config.apiKey;
  }

  /** Pick the first downloaded (available) llm model from the embedded
   *  runtime, falling back to the small default catalog entry. */
  private async pickNeuronModel(): Promise<string> {
    if (this.neuronModel) return this.neuronModel;
    try {
      const r = await fetch(`${neuronUrl()}/v1/models?engine=llm`);
      if (r.ok) {
        const body = await r.json();
        const available: Array<{ id: string; available?: boolean }> = body.data ?? [];
        const first = available.find((m) => m.available);
        if (first) {
          // /v1/models ids look like `llm/qwen3-0.6b`; the chat API wants
          // the registered (bare) model id.
          this.neuronModel = first.id.split('/').pop() || NEURON_CHAT_MODEL_FALLBACK;
          return this.neuronModel;
        }
      }
    } catch {
      // runtime not reachable — fall through to the catalog default so
      // the error surfaces from the chat request itself.
    }
    return NEURON_CHAT_MODEL_FALLBACK;
  }

  private newLocalConversation(opts: { agent?: string; system?: string } = {}): Conversation {
    const now = new Date().toISOString();
    return {
      id: `local-${crypto.randomUUID()}`,
      agent: opts.agent ?? 'shadow-local',
      created_at: now,
      updated_at: now,
      history: [],
    };
  }

  private async *streamMessageNeuron(
    conversationId: string,
    req: SendMessageRequest,
  ): AsyncGenerator<StreamEvent> {
    const history = this.neuronHistory.get(conversationId) ?? [
      { role: 'system' as const, content: SHADOW_NEURON_SYSTEM },
    ];
    history.push({ role: 'user', content: req.text });

    let assistant = '';
    // In-process inference: the Tauri command dispatches the request
    // body straight into the embedded encephalon's neuron adapter
    // pipeline — no loopback HTTP, no CORS. Non-stream by design
    // (adapter dispatch buffers); the full answer is emitted as one
    // delta after think-stripping below, which preserves the
    // streaming-bubble contract ConversationPage consumes.
    try {
      const model = await this.pickNeuronModel();
      const payload = JSON.stringify({ model, messages: history, stream: false, max_tokens: 400 });
      const resp = await invoke<{ status: number; body: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } }>(
        'neuron_infer',
        {
          path: '/v1/chat/completions',
          body: Array.from(new TextEncoder().encode(payload)),
        },
      );
      if (resp.status >= 400 || !resp.body) {
        const msg = resp.body?.error?.message ?? `neuron chat ${resp.status}`;
        throw new Error(msg);
      }
      let delta: string | undefined = resp.body.choices?.[0]?.message?.content;
      if (delta) {
        const start = delta.indexOf('<think>');
        if (start !== -1) {
          const end = delta.indexOf('</think>', start);
          delta =
            end === -1
              ? delta.slice(0, start)
              : delta.slice(0, start) + delta.slice(end + '</think>'.length);
        }
      }
      if (delta) {
        assistant = delta;
        yield {
          type: 'delta',
          delta,
          agent: 'shadow-local',
          conversation_id: conversationId,
          timestamp: Date.now(),
        };
      }
      if (!assistant) {
        // The model spent its whole budget inside <think>…</think>
        // (small Qwen3 models do this when the block never closes).
        // Surface a graceful notice instead of a silent empty reply.
        const fallback =
          '（本地模型本次只输出了思考过程，没有给出答案 — 请重试或换个问法。）';
        assistant = fallback;
        yield {
          type: 'delta',
          delta: fallback,
          agent: 'shadow-local',
          conversation_id: conversationId,
          timestamp: Date.now(),
        };
      }
      history.push({ role: 'assistant', content: assistant });
      this.neuronHistory.set(conversationId, history);
      yield {
        type: 'done',
        conversation_id: conversationId,
        state: 'COMPLETED',
        timestamp: Date.now(),
      };
    } catch (e) {
      yield {
        type: 'error',
        conversation_id: conversationId,
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      };
    }
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
    if (isTauri()) {
      // No cortex in the desktop app — the embedded neuron is the liveness
      // surface (drives the header connection indicator).
      const r = await fetch(`${neuronUrl()}/health`);
      if (!r.ok) throw new Error(`neuron health ${r.status}: ${r.statusText}`);
      return r.json();
    }
    return this.request('/.well-known/agent.json');
  }

  async listAgents(): Promise<AgentsResponse> {
    return this.request('/shadow/v1/agents');
  }

  async getAgent(name: string): Promise<{ name: string; agent_card: AgentCard; health_status: string }> {
    return this.request(`/shadow/v1/agents/${encodeURIComponent(name)}`);
  }

  async createConversation(opts: { agent?: string; system?: string } = {}): Promise<Conversation> {
    if (isTauri()) return this.newLocalConversation(opts);
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
    if (isTauri()) {
      yield* this.streamMessageNeuron(conversationId, req);
      return;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-Shadow-Key'] = this.apiKey;
    const resp = await fetch(
      `${this.baseUrl}/shadow/v1/conversations/${encodeURIComponent(conversationId)}/messages:stream`,
      { method: 'POST', headers, body: JSON.stringify(req) },
    );
    if (!resp.ok || !resp.body) {
      let errorMsg = `cortex stream ${resp.status}: ${resp.statusText}`;
      try {
        const errorBody = await resp.text();
        if (errorBody) {
          const parsed = JSON.parse(errorBody);
          if (parsed.error && parsed.error.message) {
            errorMsg = parsed.error.message;
            if (parsed.error.hint) {
              errorMsg += ` (${parsed.error.hint})`;
            }
          }
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(errorMsg);
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
    return this.request<AgentMutationResult>('/api/telencephalon/admin/agents/create', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async registerExternalAgent(req: {
    name: string;
    endpoint: string;
    description?: string;
    skills?: string[];
    version?: string;
    provider_type?: string;
  }): Promise<AgentMutationResult> {
    return this.request<AgentMutationResult>('/api/telencephalon/admin/agents/register', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async generateAgentDescription(systemPrompt: string): Promise<GeneratedDescription> {
    return this.request<GeneratedDescription>(
      '/api/telencephalon/admin/agents/generate-description',
      {
        method: 'POST',
        body: JSON.stringify({ system_prompt: systemPrompt }),
      },
    );
  }

  async scanExternalAgents(): Promise<ScanResult> {
    return this.request<ScanResult>('/api/telencephalon/agents/scan', { method: 'POST' });
  }

  async syncExternalAgent(providerId: string): Promise<AgentMutationResult> {
    return this.request<AgentMutationResult>(
      `/api/telencephalon/agents/sync/${encodeURIComponent(providerId)}`,
      { method: 'POST' }
    );
  }

  async discoverAgents(): Promise<DiscoveryResult> {
    return this.request<DiscoveryResult>('/api/telencephalon/agents/discover');
  }

  async listInstalledWasm(): Promise<InstalledWasmList> {
    return this.request<InstalledWasmList>('/api/telencephalon/admin/agents/installed');
  }

  async deleteWasm(name: string, version: string): Promise<void> {
    await this.request<void>(
      `/api/telencephalon/admin/agents/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
      { method: 'DELETE' },
    );
  }

  async listProviders(): Promise<ModelProvider[]> {
    return this.request<ModelProvider[]>('/models/providers');
  }

  async searchAgents(opts: { skill?: string; q?: string } = {}): Promise<AgentSearchResponse> {
    const params = new URLSearchParams();
    if (opts.skill) params.set('skill', opts.skill);
    if (opts.q) params.set('q', opts.q);
    const qs = params.toString();
    return this.request<AgentSearchResponse>(
      `/api/telencephalon/agents/search${qs ? `?${qs}` : ''}`,
    );
  }

  async updateLobeConfig(name: string, config: Record<string, unknown>): Promise<void> {
    await this.request<void>(
      `/api/telencephalon/agents/${encodeURIComponent(name)}/config`,
      {
        method: 'PATCH',
        body: JSON.stringify({ config }),
      },
    );
  }

  async listMcpServers(): Promise<McpServerList> {
    return this.request<McpServerList>('/api/telencephalon/mcp/servers');
  }

  async getMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/telencephalon/mcp/servers/${encodeURIComponent(id)}`,
    );
  }

  async getMcpServerTools(id: string): Promise<McpToolSummary[]> {
    return this.request<McpToolSummary[]>(
      `/api/telencephalon/mcp/servers/${encodeURIComponent(id)}/tools`,
    );
  }

  async listMcpServersForAgent(agentName: string): Promise<McpAgentBindingsList> {
    return this.request<McpAgentBindingsList>(
      `/api/telencephalon/mcp/agents/${encodeURIComponent(agentName)}/servers`,
    );
  }

  async getAgentMcpTools(agentName: string): Promise<McpToolSummary[]> {
    return this.request<McpToolSummary[]>(
      `/api/telencephalon/mcp/agents/${encodeURIComponent(agentName)}/tools`,
    );
  }

  async createMcpServer(req: {
    name: string;
    wasm?: McpWasmRef;
    quota?: McpResourceQuota;
    description?: string;
    transport?: {
      kind: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
    } | {
      kind: 'http';
      url: string;
      bearer?: string;
    };
  }): Promise<McpServerRecord> {
    return this.request<McpServerRecord>('/api/telencephalon/admin/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async deleteMcpServer(id: string): Promise<void> {
    await this.request<void>(
      `/api/telencephalon/admin/mcp/servers/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  }

  async startMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/telencephalon/admin/mcp/servers/${encodeURIComponent(id)}/start`,
      { method: 'POST' },
    );
  }

  async stopMcpServer(id: string): Promise<McpServerRecord> {
    return this.request<McpServerRecord>(
      `/api/telencephalon/admin/mcp/servers/${encodeURIComponent(id)}/stop`,
      { method: 'POST' },
    );
  }

  async bindMcpServerToAgent(agentName: string, serverId: string): Promise<McpAgentBinding> {
    return this.request<McpAgentBinding>(
      `/api/telencephalon/admin/mcp/agents/${encodeURIComponent(agentName)}/servers/${encodeURIComponent(serverId)}`,
      { method: 'POST' },
    );
  }

  async unbindMcpServerFromAgent(agentName: string, serverId: string): Promise<void> {
    await this.request<void>(
      `/api/telencephalon/admin/mcp/agents/${encodeURIComponent(agentName)}/servers/${encodeURIComponent(serverId)}`,
      { method: 'DELETE' },
    );
  }

  // Voice methods
  async transcribeAudio(audio: string, format: string = 'webm', language: string = 'zh'): Promise<{ text: string }> {
    return this.request<{ text: string }>('/api/telencephalon/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audio, format, language }),
    });
  }

  async synthesizeSpeech(text: string, voice: string = 'alloy'): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/telencephalon/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice }),
    });

    if (!response.ok) {
      throw new Error(`Speech synthesis failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // Task methods
  async getTasks(): Promise<any[]> {
    return this.request<any[]>('/api/telencephalon/tasks');
  }

  async createTask(task: {
    title: string;
    description?: string;
    dueTime?: string;
    priority?: string;
    tags?: string[];
  }): Promise<any> {
    return this.request<any>('/api/telencephalon/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async confirmTask(taskId: string, confirmed: boolean, modifications?: any): Promise<any> {
    return this.request<any>(`/api/telencephalon/tasks/${taskId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmed, modifications }),
    });
  }

  // Video source methods (Spec #1)
  async listVideoSources(): Promise<TelencephalonVideoSourcesSnapshot> {
    return this.request<TelencephalonVideoSourcesSnapshot>('/api/telencephalon/video-sources');
  }

  async putVideoSources(
    snapshot: TelencephalonVideoSourcesSnapshot,
    ifMatch: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'If-Match': ifMatch,
    };
    const resp = await fetch(`${this.baseUrl}/api/telencephalon/video-sources`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(snapshot),
    });
    if (resp.status === 412) {
      throw new Telencephalon412Error('video-sources ETag mismatch');
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`putVideoSources ${resp.status}: ${text || resp.statusText}`);
    }
    return resp.headers.get('ETag') || '';
  }

  thalamus = {
    listSensors: (): Promise<string[]> =>
      this.request<ThalamusSensorList>('/api/telencephalon/thalamus/preview/sensors').then((r) => r.sensors),
    getStats: (name: string): Promise<ThalamusSensorStats> =>
      this.request<ThalamusSensorStats>(`/api/telencephalon/thalamus/preview/sensors/${encodeURIComponent(name)}/stats`),
    tail: (name: string, limit?: number): Promise<ThalamusSample[]> => {
      const qs = limit ? `?limit=${limit}` : '';
      return this.request<{ samples: ThalamusSample[] }>(
        `/api/telencephalon/thalamus/preview/sensors/${encodeURIComponent(name)}/tail${qs}`
      ).then((r) => r.samples);
    },
    query: (template: string, sensor: string, limit?: number): Promise<ThalamusSample[]> => {
      const body: Record<string, unknown> = { template, sensor };
      if (limit) body.limit = limit;
      return this.request<{ samples?: ThalamusSample[] }>('/api/telencephalon/thalamus/preview/query', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.samples ?? []);
    },
    register: (req: { name: string; kind?: string; capacity?: number }): Promise<{ name: string }> =>
      this.request<{ name: string }>('/api/telencephalon/thalamus/manage/sensors', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    deregister: (name: string): Promise<void> =>
      this.request<void>(`/api/telencephalon/thalamus/manage/sensors/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    updateConfig: (name: string, cfg: { capacity: number }): Promise<void> =>
      this.request<void>(`/api/telencephalon/thalamus/manage/sensors/${encodeURIComponent(name)}/config`, {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  };

  hippocampus = {
    stats: (): Promise<HippocampusStats> =>
      this.request<HippocampusStats>('/api/telencephalon/hippocampus/preview/stats'),
    recent: (opts: { layer?: string; dimension?: string; limit?: number } = {}): Promise<HippocampusRecent> => {
      const params = new URLSearchParams();
      if (opts.layer) params.set('layer', opts.layer);
      if (opts.dimension) params.set('dimension', opts.dimension);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return this.request<HippocampusRecent>(`/api/telencephalon/hippocampus/preview/recent${qs ? `?${qs}` : ''}`);
    },
    consolidator: (): Promise<ConsolidatorState> =>
      this.request<ConsolidatorState>('/api/telencephalon/hippocampus/preview/consolidator'),
    graphNode: (nodeId: string): Promise<GraphNode> =>
      this.request<GraphNode>(`/api/telencephalon/hippocampus/preview/graph/${encodeURIComponent(nodeId)}`),
  };

  neuron = {
    models: (): Promise<NeuronModelSummary[]> =>
      this.request<NeuronModelsResponse>('/api/telencephalon/neuron/preview/models').then((r) => r.models),
    stats: (): Promise<NeuronStats> =>
      this.request<NeuronStats>('/api/telencephalon/neuron/preview/stats'),
  };

  issueSubsystemToken = async (
    scopes: string[],
    ttlSeconds?: number
  ): Promise<SubsystemTokenResponse> => {
    // Telencephalon replaced the legacy `cortex_issue_subsystem_token`
    // Tauri command with an HTTP admin endpoint. Resolve the admin
    // token from localStorage (defaulting to `dev-admin-key` in dev)
    // and forward as `X-Admin-Token`.
    const adminToken =
      typeof window !== 'undefined'
        ? (window.localStorage.getItem('shadow-admin-token') ?? 'dev-admin-key')
        : 'dev-admin-key';
    const body: Record<string, unknown> = { scopes };
    if (ttlSeconds !== undefined) body.ttl_seconds = ttlSeconds;
    return this.request<SubsystemTokenResponse>(
      '/api/telencephalon/admin/token',
      {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken },
        body: JSON.stringify(body),
      },
    );
  };
}

export const telencephalonClient = new TelencephalonClient();