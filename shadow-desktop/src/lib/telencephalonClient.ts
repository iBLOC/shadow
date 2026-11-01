import { isTauri } from './platform';
import { getAdminToken, adminHeaders } from './adminToken';

const DEFAULT_CORTEX_URL = 'http://127.0.0.1:60080';

// 影的基础人设。走端脑时随会话创建一起送出去（`createConversation({ system })`），
// 端脑把它记进会话记录 —— 叶区拿得到，模型才真的按这个人设说话。
const SHADOW_NEURON_SYSTEM =
  "You are Shadow (影), the user's personal AI avatar running locally. " +
  'Reply helpfully and concisely in the language the user writes in. ' +
  // Qwen3 soft switch — skips the <think> reasoning block entirely,
  // which otherwise burns minutes of CPU generation before any answer
  // text appears (the bridge also strips think blocks as a fallback).
  '/no_think';

/**
 * Compose the effective system prompt.
 *
 * The baseline comes first because it carries the functional part (the
 * Qwen3 `/no_think` directive has to survive a custom persona), and the
 * user-configured persona goes last so it sits closest to the user turn —
 * that is where a model gives it the most weight.
 */
export function composeSystemPrompt(custom?: string): string {
  const persona = (custom ?? '').trim();
  return persona ? `${SHADOW_NEURON_SYSTEM}\n\n${persona}` : SHADOW_NEURON_SYSTEM;
}

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

/**
 * 端脑答的「当前是谁」。
 *
 * 人（principal）、人格（persona = 记忆的隔离单元）、设备 —— 三件事
 * 分开。`identified` 为 false 表示背后**没有人**。
 */
export interface TelencephalonIdentity {
  principal: string | null;
  persona: string | null;
  device: string | null;
  identified: boolean;
  personas: { persona: string; role: string }[];
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
    /**
     * telencephalon's `ConversationTurn` serializes `at: DateTime<Utc>`,
     * so the field on the wire is **`at`** (an RFC3339 string) — not
     * `timestamp`. It used to be declared as `timestamp: number` here,
     * which never matched the server and would have broken anyone who
     * started reading the turns.
     */
    at: string;
  }>;
}

/**
 * 工具参数的 **JSON Schema** —— 模型看得懂的那一份。
 *
 * ⚠️ **和界面表单的字段声明不是一回事**：`ClientToolForm` 的 `ToolField`
 * 描述的是**输入框**（`kind` 是 'text' | 'textarea' | 'number' | 'checkbox'
 * 这种 UI 变体），JSON Schema 的类型系统是另一套 ⇒ 两边各留一份，别混。
 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  enum?: string[];
}

/**
 * OpenAI function-calling 的工具形状 —— **发给模型的那一份**。
 *
 * 端脑把它透传给 LLM；模型决定调某个工具时，端脑再把 `tool_call` 事件
 * 发回这台设备。
 */
export interface OpenAiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
}

export interface SendMessageRequest {
  text: string;
  agent?: string;
  /**
   * 这台设备**能跑的客户端工具**（JSON Schema 形状）。
   *
   * **谁声明什么由设备决定** —— 手机没有窗口可最小化，桌面端没有麦克风
   * 权限可申请 ⇒ 两端发的清单本来就该不一样。
   *
   * 端脑已经认这个字段了（`SendMessageRequest.tools`）⇒ 它把清单连同
   * JSON Schema 一起透传给叶区 ⇒ 模型看得见 `set_theme` 要吃一个 `color`。
   */
  tools?: OpenAiTool[];
  /**
   * 要不要端脑**等**这台设备的工具结果、并在**同一回合**里接着说？
   *
   * 端脑点名让设备干活（换主题之类）之后，设备干完把结果回传 —— 那是
   * **另一个** HTTP 请求。端脑若在同一条 SSE 上等这个回传，就能把结果
   * 喂回模型，让模型接着说「主题已经换成靛蓝了」⇒ 用户看到的是**一个**
   * 回合，而不是一张沉默的卡片。
   *
   * 端脑最多等 60 秒；设备不回答 ⇒ 端脑把这次工具调用当成**失败**，模型
   * 据此告诉用户设备没回应（回合照样收尾，不会吊着）。
   *
   * 老端脑不认识这个字段（serde 忽略未知字段 ⇒ 无害）。
   *
   * ⚠️ 名字是 **snake_case**：这个对象被原样 `JSON.stringify` 发出去，
   * 端脑那边认的就是 `await_tool_result`（与 `conversation_id` /
   * `tool_call_id` 同一条规矩）。
   */
  await_tool_result?: boolean;
}

export interface SendMessageResponse {
  conversation_id: string;
  agent: string;
  reply: string;
  state: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  timestamp: number;
}

export interface StreamEvent {
  type:
    | 'delta'
    | 'done'
    | 'error'
    | 'audio_event'
    | 'computer_use_action'
    // Progress events emitted by telencephalon /shadow/v1 SSE
    // (src/api/shadow.rs TelencephalonStreamEvent). 'clarification'
    // is currently desktop-side only — no backend emitter yet.
    | 'tool_call'
    | 'tool_result'
    | 'route'
    | 'handoff'
    | 'step'
    | 'clarification';
  agent?: string;
  delta?: string;
  conversation_id?: string;
  state?: string;
  timestamp?: number;
  error?: string;
  /** tool_call / tool_result name. */
  name?: string;
  /** tool_call arguments (JSON value). */
  args?: unknown;
  /** tool_result payload. */
  result?: unknown;
  latency_ms?: number;
  /** The call id the endbrain puts on a `tool_call` event (a uuid).
   *  Older endbrains omit it — consumers synthesize one in that case. */
  tool_call_id?: string;
  /** route event. */
  supervisor?: string;
  target?: string;
  reason?: string;
  /** handoff / step event. */
  from?: string;
  to?: string;
  context_size?: number;
  step?: string;
  /** clarification event payload (visual QA). */
  clarification?: unknown;
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
  /** Non-wasm backend descriptor. Null/absent = wasm (historical
   *  default). Mirrors telencephalon TransportKind (serde tag
   *  "kind", snake_case). */
  transport?:
    | { kind: 'stdio'; command: string; args: string[] }
    | { kind: 'http'; url: string; bearer?: string | null }
    | null;
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

  // ---- 通信链路：大脑 → 端脑 → 叶区 ----------------------------------
  //
  // 桌面对话**不再**直连 neuron。端脑的 HTTP 面由 sidecar 挂在
  // 127.0.0.1:60080（`src-tauri/src/cortex_http.rs`），形状与独立运行的
  // 端脑完全一致：会话 / agent 走 `/shadow/v1/*`，叶区是端脑进程内的
  // native lobe（temporal / prefrontal / parietal）。
  //
  // 直连 neuron 的老路（`streamMessageNeuron` + `neuron_infer`）已经删掉 ——
  // 那条路绕过端脑和叶区，意图路由、工具、flow 全都不在链路上，
  // 桌面端因此永远收不到 `tool_call` 事件。

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
    // ⚠️ **admin 面（建 agent / MCP / 改 LLM 上游…）现在必须真的带上凭据。**
    //
    // 端脑原来有一条「`expected == "dev-admin-key"` ⇒ **认任何人**」的后门
    // （连请求头都不看）⇒ 而桌面端递进去的 expected **恰好就是**那个字面量
    // ⇒ ⇒ 桌面端的 admin 面**任何请求都过** ⇒ 再叠加端脑面的
    // `CorsLayer::permissive()` ⇒ **任意网站**都能往用户的大脑里插 agent。
    //
    // ⇒ 那把钥匙现在由 sidecar **生成并持久化**（`admin_token.rs`）⇒
    // ⇒ 前端问它要（`getAdminToken()`）。
    //
    // ⚠️ 拿不到就**不带**那个头 —— 空的 `X-Admin-Token` 在旧实现里与空串
    // `ct_eq` 相等 ⇒ **过**（手机上整个 admin 面就是这么开着的）。
    //
    // ⚠️ **自己再 trim 一次**（不信任上游模块的输出）：JS 里 `'   '` 是
    // **truthy** ⇒ ⇒ 空白值会被当成一把钥匙发出去 ⇒ ⇒ 判据是
    // 「trim 之后还剩东西吗」。
    const adminToken = (await getAdminToken())?.trim();
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
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
      // 探**端脑**而不是 neuron —— 连通性指示器要反映的是
      // 「大脑 → 端脑 → 叶区」这条链。端脑的 status 端点同时回报
      // neuron 是否可达（`neuron_reachable`）和可用模型数。
      const r = await fetch(`${this.baseUrl}/api/telencephalon/status`, {
        headers: await adminHeaders(),
      });
      if (!r.ok) throw new Error(`cortex health ${r.status}: ${r.statusText}`);
      return r.json();
    }
    return this.request('/.well-known/agent.json');
  }

  /**
   * 当前是谁 —— 人 / 人格 / 设备。
   *
   * 端脑答的是「这台机器（或这次请求）属于谁」。`identified` 为 false
   * 表示背后没有人（机器还没账号、请求也没带凭证）。
   */
  async getIdentity(): Promise<TelencephalonIdentity> {
    return this.request('/shadow/v1/identity');
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

  async *streamMessage(
    conversationId: string,
    req: SendMessageRequest,
  ): AsyncGenerator<StreamEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-Shadow-Key'] = this.apiKey;
    // ⚠️⚠️ **这条 SSE 路由在 shadow 门后面** ⇒ 端脑的读门 =
    // **shadow ∪ admin**（security::api_key::verify_read_credential）
    // ⇒ ⇒ 桌面端**递不出 shadow key**（宿主没生成过这把钥匙）⇒ ⇒
    // 这里必须递 **admin token**，否则端脑一把门关上，桌面的**对话流**
    // 就全 401（**门掐断主人** —— 自己把自己的大脑锁在外面）。
    // ⚠️ 拿不到 token ⇒ **不带**那个头（端脑会 401 并说清原因）。
    const adminToken = (await getAdminToken())?.trim();
    if (adminToken) headers['X-Admin-Token'] = adminToken;
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

  /**
   * Report a **client-side tool** result back to telencephalon.
   *
   * The brain's `tool_call` event arrives here → the desktop runs the
   * tool (change the theme, …) → the result goes back → telencephalon
   * feeds it to the model, so the model knows the theme actually
   * changed. Without this step the brain waits forever for a result
   * that never arrives.
   *
   * Endpoint: `POST /shadow/v1/conversations/{id}/tool-results`
   *
   * ⚠️ Callers must still catch this and report "result not
   * delivered" rather than let it take the whole conversation down.
   * A 404 here now means the **conversation id** is wrong (or the
   * brain is an older build that predates this route) — the route
   * itself has shipped on the telencephalon side.
   */
  async reportToolResult(
    conversationId: string,
    req: { name: string; toolCallId?: string; result: unknown; ok?: boolean },
  ): Promise<void> {
    const body: Record<string, unknown> = {
      name: req.name,
      result: req.result,
      ok: req.ok ?? true,
    };
    if (req.toolCallId) body.tool_call_id = req.toolCallId;
    await this.request(
      `/shadow/v1/conversations/${encodeURIComponent(conversationId)}/tool-results`,
      { method: 'POST', body: JSON.stringify(body) },
    );
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
      headers: {
        ...(await adminHeaders()),
        ...(this.apiKey ? { 'X-Shadow-Key': this.apiKey } : {}),
      },
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
        ...(await adminHeaders()),
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
        ...(await adminHeaders()),
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
    // Tauri command with an HTTP admin endpoint.
    //
    // ⚠️ **这里不再有 `?? 'dev-admin-key'`** —— 那个字面量打进前端产物 ⇒
    // 它从来就不是秘密；而端脑那边曾经有一条「expected 恰好是它 ⇒ **认任何
    // 人**」的后门 ⇒ ⇒ 等于「谁都能进 admin 面」。
    //
    // ⇒ 钥匙由 `request()` 统一带上（它问 sidecar 要：生成 + 持久化的那把）。
    const body: Record<string, unknown> = { scopes };
    if (ttlSeconds !== undefined) body.ttl_seconds = ttlSeconds;
    return this.request<SubsystemTokenResponse>(
      '/api/telencephalon/admin/token',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  };
}

export const telencephalonClient = new TelencephalonClient();