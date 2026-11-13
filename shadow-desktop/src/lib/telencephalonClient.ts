import { isTauri } from './platform';
import { DEFAULT_TELEENCEPHALON_URL } from './endpointDefaults';
import { adminHeaders } from './adminToken';
import { readDoorHeaders } from './readDoorHeaders';

// ⚠️ 默认地址**只有一处** —— lib/platform.ts 里那个常量
// ⇒ ⇒ 与 store 的默认值（stores/telencephalonStore.ts）同源 ⇒ ⇒ 两处不许漂。

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

export interface TelencephalonConfig {
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
  telencephalon: {
    id: string;
    instance_name: string;
    default_agent: string;
  };
  agents: LobeInfo[];
}

/**
 * 端脑在**轮次文本**里用的机器前缀 —— 服务端用它标记「这条轮次不是人说的」。
 *
 * 判据源（服务端）：
 * - `telencephalon/src/api/shadow/conversations.rs` → `SYSTEM_TURN_PREFIX = "[system] "`
 * - `telencephalon/src/api/shadow.rs` → `TOOL_RESULT_TURN_PREFIX = "[tool_result] "`
 *
 * ⚠️ **为什么客户端必须认它们**：端脑把会话的**人设**存成**第一条**轮次
 * （role=agent + `[system] ` 前缀）⇒ 客户端若把 history 原样画成气泡，
 * 用户就会看到**自己的配置原文**被当成大脑发言顶在最上面。
 *
 * ⚠️ 服务端喂模型时**只跳人设**（`history_of()`），工具结果**留在**历史里
 * （模型要读）⇒ ⇒ 客户端也**只跳人设**，工具结果剥掉前缀再显示。
 *
 * ⚠️ 移动端同一口径在
 * `shadow-mobile/lib/services/telencephalon/telencephalon_client.dart`
 * （`kSystemTurnPrefix` / `kToolResultTurnPrefix`）⇒ 两端**同一套判据**。
 */
export const SYSTEM_TURN_PREFIX = '[system] ';
export const TOOL_RESULT_TURN_PREFIX = '[tool_result] ';

/** 会话里的一条轮次（**线上形状**，不是画出来的东西）。 */
export interface ConversationTurn {
  role: 'user' | 'agent';
  text: string;
  /**
   * 端脑的 `ConversationTurn` 序列化成 `at: DateTime<Utc>`，
   * 所以线上字段是 **`at`**（RFC3339 字符串）—— 不是 `timestamp`。
   */
  at: string;
  /**
   * 旧的前额叶方言把时间放在 `timestamp`（毫秒整数）。
   * ⚠️ 端脑那一条**不填**它 ⇒ 用它算时间会得到 NaN ⇒ 界面出现「Invalid Date」。
   */
  timestamp?: number;
}

/** 这条轮次是**人设**（端脑存的第一条 agent 轮次，带 `[system] ` 前缀）。 */
export function isSystemTurn(turn: ConversationTurn): boolean {
  return turn.text.startsWith(SYSTEM_TURN_PREFIX);
}

/** 这条轮次是**客户端工具的结果**（带 `[tool_result] ` 前缀）。 */
export function isToolResultTurn(turn: ConversationTurn): boolean {
  return turn.text.startsWith(TOOL_RESULT_TURN_PREFIX);
}

/**
 * 剥掉机器前缀后的正文。
 *
 * 人设那类**不剥**（它整条不显示，剥了也没意义）⇒ ⇒ 只有工具结果会真的剥。
 */
export function bodyText(turn: ConversationTurn): string {
  return isToolResultTurn(turn)
    ? turn.text.slice(TOOL_RESULT_TURN_PREFIX.length).trim()
    : turn.text;
}

/**
 * 轮次时间戳（毫秒）—— 优先 `at`（RFC3339），退回 `timestamp`（毫秒整数）。
 *
 * ⚠️ 两种方言都认：只认一个的话，另一边读出来是 undefined
 * ⇒ 拿它排序 / 显示时间 ⇒ NaN ⇒ 界面出现「Invalid Date」。
 */
export function turnTimestamp(turn: ConversationTurn): number {
  if (turn.at) {
    const parsed = Date.parse(turn.at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return turn.timestamp ?? 0;
}

/**
 * **可以画给人看的轮次** —— 人设那条被跳过（它是**配置**，不是对话），
 * 工具结果剥掉前缀后保留（它是这一回合**真实发生**的事）。
 */
export function displayableTurns(
  history: readonly ConversationTurn[],
): Array<{ role: 'user' | 'agent'; text: string; at: string }> {
  return history
    .filter((t) => !isSystemTurn(t))
    .map((t) => ({ role: t.role, text: bodyText(t), at: t.at }));
}

export interface Conversation {
  id: string;
  agent: string;
  created_at: string;
  updated_at: string;
  history: ConversationTurn[];
  /**
   * 归档 —— **软标记**（可恢复）：会话还在，只是默认不再出现在列表里。
   *
   * ⚠️ **可选**：端脑老数据（还没这个字段时落下的）没有这个键 ⇒ ⇒ 读不到
   * 就当「没归档」。
   */
  archived?: boolean;
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
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array';
  description?: string;
  enum?: string[];
  /** array 类型参数的元素声明（required_permissions 这类参数用）。 */
  items?: { type: 'string'; enum?: string[] };
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

/**
 * **分档默认模型** —— 「这一类能力用哪个模型」。
 *
 * ⚠️ 键是**能力词**（llm / asr / tts …）⇒ ⇒ 端脑的 `Capability` 词表是
 * 单一真源（`GET` 把合法词表一起回来）⇒ ⇒ 界面照它渲染选择器。
 */
export interface CapabilityDefaultsView {
  defaults: Record<string, string>;

  /**
   * **逐叶区的分档覆盖**（叶区 → 能力词 → 模型 id）。
   *
   * 端脑的解析链：显式 `model` → **叶区覆盖** → 全局分档默认 → 第一个
   * 注册的引擎。不在表里＝该叶区该档**跟随全局**（与 llm 的
   * `lobe_models` 同一约定：只装显式覆盖）。
   *
   * ⚠️ **`llm` 不在这张表里** —— 逐叶区 llm 走 `lobes/models` 路由面
   * （那里有持久化与引擎注册）⇒ ⇒ 端脑收到 `llm` 会整份拒绝（4008）。
   */
  lobe_defaults?: Record<string, Record<string, string>>;
  capabilities: string[];

  /**
   * **按引擎 id 解析**的能力词（asr / tts）—— 端脑说了算。
   *
   * ⚠️ 客户端**不许自己造**这张表 ⇒ ⇒ 也不许拿目录面（能下载的权重清单）
   * 去填这几档 ⇒ ⇒ 那套 id 端脑解析不到 ⇒ ⇒ **存得进去、用不了**。
   */
  engine_resolved?: string[];

  /**
   * 那些档**此刻已注册**的引擎 id（能力词 → id 列表）。
   *
   * ⚠️ **空列表 = 这台大脑此刻没注册这类引擎**（不是「没有这个能力」）。
   */
  registered?: Record<string, string[]>;
}

/**
 * `POST /api/telencephalon/lobes/models` 的一条**远端 llm 引擎注册**。
 *
 * ⚠️ **不带 `api_key`** —— 端脑按 `id` 从自己的供应商目录解析 key
 * （供应商材料不出大脑；与移动端 `buildModelRoutingPayload` 同一约定）。
 */
export interface LobeModelProviderRegistration {
  /** 供应商 id（端脑据此解析 key）。 */
  id: string;
  base_url: string;
  /** 路由键＝供应商目录的模型 id（`default_model` 认的也是它）。 */
  model: string;
}

/** `POST /api/telencephalon/lobes/models` 的请求体（三态字段见方法注释）。 */
export interface LobeModelsPush {
  providers: LobeModelProviderRegistration[];
  /** 三态：不给字段＝不动；`null`＝回落本地；串＝该模型。 */
  default_model?: string | null;
  /** per-lobe 覆盖，**整份替换**；「跟随全局」不进表。 */
  lobe_models?: Record<string, string | null>;
}

/** `POST /api/telencephalon/lobes/models` 的响应。 */
export interface LobeModelsView {
  default_model: string | null;
  /** 各叶区此刻生效的模型（含跟随全局解析后的值）。 */
  applied: Record<string, string | null>;
  overrides: Record<string, string | null>;
  /** 表里出现但端脑不认识的叶区名。 */
  unknown: string[];
  /** 注册成功的远端引擎数。 */
  registered: number;
}

/**
 * `GET /api/telencephalon/lobes/routing` 的响应 —— 模型路由的**覆盖表**
 * 全貌（不是生效值）。
 *
 * ⚠️ 两张表都是「只装显式覆盖」：不在表里＝跟随全局。矩阵 UI 合并写回时
 * 必须基于它，否则会把「跟随全局」钉死。
 */
export interface LobeRoutingView {
  /** 全局默认对话模型（`null` = 全体回落本地）。 */
  default_model: string | null;
  /** 逐叶区 llm 覆盖（`null` = 该叶区强制本地）。 */
  lobe_models: Record<string, string | null>;
  /** 逐叶区按引擎 id 解析的档（asr / tts / image_gen）。 */
  lobe_capability_models: Record<string, Record<string, string>>;
}

/** `GET /api/telencephalon/lobes/manifest` 里的一条（只取界面用的字段）。 */
export interface LobeManifestSummary {
  name: string;
  description?: string;
  version?: string;
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

// Video source types (Spec #1 — telencephalon_video_sources table)
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
  telencephalonVersion: string;
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

/**
 * 端脑 `GET /api/telencephalon/neuron/preview/models` 的**真实形状**。
 *
 * ⚠️⚠️ **这里以前声明的是 `quantization`**（2026-11-11 实测取证）⇒ ⇒ 而端脑
 * 从来不发这个字段 ⇒ ⇒ 端脑发的是 **`engine`**（运行时实现，如 `Candle` /
 * `MistralRs` / `Burn` / `Tract` / `Sherpa`）⇒ ⇒ 那枚显示「量化」的 Badge
 * **永远渲染不出来**（`m.quantization` 恒为 `undefined`）⇒ ⇒ 界面少显示一个字段。
 *
 * ⚠️ **口径**：`preview/models` 说的是「**此刻已注册的引擎**」⇒ ⇒ 所以这里那个
 * 字段是**引擎实现**，**不是**量化档位 ⇒ ⇒ 「量化」是**另一个集合**的字段
 * （下载面 `modelDownloadService` 的 `quantization`，那份不归这里管）。
 */
export interface NeuronModelSummary {
  capability: string;
  model_id: string;
  /** 运行时实现（端脑 `impl_id` 的 Debug 形式，如 `Candle` / `MistralRs`）。 */
  engine: string;
}

export interface NeuronModelsResponse {
  models: NeuronModelSummary[];
}

export interface NeuronStats {
  running: boolean;
  models_loaded: number;
}

/**
 * neuron **目录条目**（`GET /v1/models` 的 `data[]` 元素）—— 与移动端
 * `NeuronCatalogEntry.fromJson` 同一份线上形状（两端一个解析口径）。
 */
export interface NeuronCatalogEntry {
  /** `engine/model`（如 `candle/moss-image`）—— engine 前缀要去掉才是 pull 的 id。 */
  id: string;
  engine: string;
  /** **盘上真的有吗** —— false ＝ 目录里有、还没下载。 */
  available: boolean;
  size_bytes?: number;
  /** 默认仓库（`huggingface:owner/repo`）—— 直接当 pull 的 reference。 */
  default_repo?: string;
  capabilities: string[];
}

/** 一个下载任务（`GET /v1/models/pull` 的 `data[]` 元素）。 */
export interface NeuronPullJob {
  job_id: string;
  /** pending / in_progress / completed / failed / cancelled */
  status: string;
  reference: string;
  engine: string;
  bytes_downloaded: number;
  total_bytes?: number;
  current_file?: string;
  error?: string;
}

export interface SubsystemTokenResponse {
  token: string;
  scopes: string[];
  expires_at_unix: number;
}

/**
 * **图片生成请求** —— 与端脑门面（`POST /api/telencephalon/images/generations`）
 * 同形（OpenAI Images 近似族 + neuron 扩展）。
 *
 * ⚠️ neuron 扩展字段（negative_prompt / steps / …）是**可选**：显式给了才
 * 往云上游转发（不把本地默认值强塞给不认识的供应商）；本地分支端脑自己补
 * 默认（1024×1024 / 50 步 / CFG 3.0）。
 */
export interface GenerateImageRequest {
  prompt: string;
  /** 模型 id 覆盖；不给 ⇒ `image_gen` 分档默认（云端或本地端脑自己分流）。 */
  model?: string;
  /**
   * **哪个叶区在用**（如 `occipital` —— 视觉那一叶）⇒ ⇒ 端脑先查该叶区的
   * `image_gen` 覆盖，再回落全局分档默认。不传 ＝ 走全局。
   */
  lobe?: string;
  /** 1..=4。 */
  n?: number;
  /** `"WxH"`，须为 16 的倍数、≤ 2048（本地管线的约束）。 */
  size?: string;
  /** 仅支持 `b64_json`（缺省即它）。 */
  response_format?: string;
  negative_prompt?: string;
  steps?: number;
  guidance_scale?: number;
  seed?: number;
  max_sequence_length?: number;
}

export interface GenerateImageDatum {
  b64_json: string;
  /** `"WxH"`（实际出图的尺寸）。 */
  size: string;
  /** 实际用的种子（请求没给 ⇒ 端脑采的）。 */
  seed: number;
}

export interface GenerateImageResponse {
  created: number;
  data: GenerateImageDatum[];
}

/**
 * 配置中心的一条配置（`GET /api/telencephalon/config/{section}` 的 `entries[]`）。
 *
 * ⚠️ **`secret` 的条目读回是掩码**（`***`）—— 回写时原样送回即保留原值
 * （服务端 `config_center/policy.rs` 认这个约定）。
 */
export interface ConfigEntry {
  key: string;
  value: unknown;
  secret?: boolean;
  version?: number;
  updated_at?: string;
  updated_by?: string;
}

/** 一个配置段（读回来带「何时生效」）。 */
export interface ConfigSectionView {
  section: string;
  entries: ConfigEntry[];
  /** `restart` 等 —— **「已保存」不等于「已生效」**，界面照它说。 */
  applies_when: string;
}

/** 写一条配置的回包（脱敏后的那条 ＋ 何时生效）。 */
export interface ConfigWriteResult extends ConfigEntry {
  applies_when: string;
}

export class Telencephalon412Error extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'Telencephalon412Error';
  }
}

/**
 * 一条提醒 —— 端脑的**通知收件箱**里的一条。
 *
 * ⚠️ 形状与端脑 `lobes::notification_inbox::Notification` 对齐
 * （`notification_type` 是端脑的枚举字面量，不是随便编的字符串）。
 */
export interface ReminderNotification {
  /** 通知自己的编号（拿它去 ack）。 */
  id: string;
  /** 任务号 —— 端脑分配的事实。 */
  task_id: string;
  task_title: string;
  notification_type: 'Reminder' | 'Overdue' | 'NeedsConfirmation';
  message: string;
  timestamp: string;
  due_time?: string | null;
}

export class TelencephalonClient {
  private baseUrl: string;
  private apiKey?: string;

  // ---- 通信链路：大脑 → 端脑 → 叶区 ----------------------------------
  //
  // 桌面对话**不再**直连 neuron。端脑的 HTTP 面由 sidecar 挂在
  // 127.0.0.1:60080（`src-tauri/src/telencephalon_http.rs`），形状与独立运行的
  // 端脑完全一致：会话 / agent 走 `/shadow/v1/*`，叶区是端脑进程内的
  // native lobe（temporal / prefrontal / parietal）。
  //
  // 直连 neuron 的老路（`streamMessageNeuron` + `neuron_infer`）已经删掉 ——
  // 那条路绕过端脑和叶区，意图路由、工具、flow 全都不在链路上，
  // 桌面端因此永远收不到 `tool_call` 事件。

  constructor(config: Partial<TelencephalonConfig> = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_TELEENCEPHALON_URL;
    this.apiKey = config.apiKey;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * 设置端脑的 shadow key（`X-Shadow-Key`）。
   *
   * ⚠️ **必须和 store 同步** —— `setBaseUrl` 一直有同步，`setApiKey` 之前只改了
   * store ⇒ client 永远拿不到 key ⇒ 所有走 `request()` 的请求**都不带** header
   * ⇒ 一旦端脑配了 `shadow.api_key`（非开发模式），客户端全量 401。
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey || undefined;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * 当前带出去的 shadow key（`undefined` = 不带 header = 开发模式）。
   *
   * 主要给测试与调试用 —— 之前没有 getter ⇒ 「client 到底有没有拿到 key」
   * 这件事**无法从外部观察**，只能靠猜。
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  /**
   * 读面的**全部**钥匙 —— 影子锁 ∪ admin token。
   *
   * ⚠️ **一条规则、一处实现**：客户端递的凭据集合必须与**门形**一致 ——
   * 门认哪几把，客户端就递哪几把（读门 = **影子锁 ∪ admin token**，
   * 判据源 `telencephalon/src/api/door_policy.txt` ⇒ 实现
   * `security/api_key.rs::verify_read_credential`）。
   *
   * ⇒ 以前**读面**只递 `X-Admin-Token` ⇒ ⇒ 在「客户端手里只有影子锁」的
   * 形态上 ⇒ 读面 **401** ⇒ 而同一张面的另一发（走 `request()`）**读得到**
   * ⇒ ⇒ ⇒ 「列表读得到、状态页读不到」—— 同一个客户端、同一张面，两处矛盾。
   *
   * ⚠️ 拿不到就**不带**那个头（绝不塞空串）⇒ 理由见 `lib/readDoorHeaders.ts`。
   */
  async readHeaders(): Promise<Record<string, string>> {
    return readDoorHeaders(this.apiKey);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
      // ⚠️ **读面的全部钥匙**（影子锁 ∪ admin token）—— 一条规则、一处实现。
      //
      // admin 面那把钥匙的来历（sidecar 生成并持久化 ⇒ 前端问它要
      // `getAdminToken()`；端脑原来的「`dev-admin-key` 认任何人」后门），
      // 以及两条不许省的纪律（**空串会把门骗开** / **空白值在 JS 里是 truthy**），
      // 见 `lib/readDoorHeaders.ts`。
      ...(await this.readHeaders()),
      };
    const resp = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`telencephalon ${resp.status}: ${text || resp.statusText}`);
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
        // ⚠️ 读门 = **影子锁 ∪ admin token** ⇒ 两把都递
        // （哪把拿不到就不带那个头 ⇒ 端脑回 401 并说清原因）。
        headers: await this.readHeaders(),
      });
      if (!r.ok) throw new Error(`telencephalon health ${r.status}: ${r.statusText}`);
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

  /**
   * 列会话。
   *
   * ⚠️ **默认只列未归档的** —— 归档过的会话不在默认列表里（这正是「归档」
   * 的意义）⇒ ⇒ 归档箱要**显式问**：`archivedOnly: true`。
   */
  async listConversations(
    opts: { includeArchived?: boolean; archivedOnly?: boolean } = {},
  ): Promise<Conversation[]> {
    const params = new URLSearchParams();
    if (opts.includeArchived) params.set('include_archived', 'true');
    if (opts.archivedOnly) params.set('archived_only', 'true');
    const query = params.toString();
    const path = '/shadow/v1/conversations' + (query ? '?' + query : '');
    return this.request(path);
  }

  /**
   * 归档（软）—— 会话还在，只是离开默认列表。
   *
   * ⚠️ **写门（admin token）**：归档/删除改状态、删数据 ⇒ ⇒ 不在读门后面
   * （判据源 `telencephalon/src/api/door_policy.txt`）⇒ ⇒ 拿不到 admin
   * token 就没有这把钥匙 ⇒ 端脑回 401 并说清原因（不是静默失败）。
   */
  async archiveConversation(id: string): Promise<Conversation> {
    return this.request(`/shadow/v1/conversations/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      headers: await adminHeaders(),
    });
  }

  /** 取消归档 —— 把会话放回默认列表。 */
  async unarchiveConversation(id: string): Promise<Conversation> {
    return this.request(`/shadow/v1/conversations/${encodeURIComponent(id)}/unarchive`, {
      method: 'POST',
      headers: await adminHeaders(),
    });
  }

  /**
   * **物理删除**一个会话 —— 连带删掉海马体里的那份（会话行 + 全部消息）。
   *
   * ⚠️ 不可逆 ⇒ ⇒ 界面上要先跟用户确认。
   */
  async deleteConversation(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request(`/shadow/v1/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await adminHeaders(),
    });
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
    // ⚠️⚠️ **这条 SSE 路由在 shadow 门后面** ⇒ 端脑的读门 =
    // **shadow ∪ admin**（security::api_key::verify_read_credential）
    // ⇒ ⇒ 两把都递（哪把拿不到就不带那个头 ⇒ 端脑会 401 并说清原因）。
    // ⇒ ⇒ 只递 admin 的话，桌面端**递不出 shadow key**时对话流全 401
    // （**门掐断主人** —— 自己把自己的大脑锁在外面）。
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.readHeaders()),
    };
    const resp = await fetch(
      `${this.baseUrl}/shadow/v1/conversations/${encodeURIComponent(conversationId)}/messages:stream`,
      { method: 'POST', headers, body: JSON.stringify(req) },
    );
    if (!resp.ok || !resp.body) {
      let errorMsg = `telencephalon stream ${resp.status}: ${resp.statusText}`;
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

  /**
   * 把**本机真实跑出来的**工具轨迹喂给端脑的「思维定式」闭环
   * （POST /api/flows/traces/ingest）—— learner 会把成功轨迹蒸馏成
   * flow 草稿（人工 promote/reject 后成为可复用的思维定式）。
   * ⚠️ 失败轨迹也照喂（轨迹行里 `ok: false`）—— 意图检索要能
   * 避开已知的失败路径、复用成功的。
   *
   * ⚠️ **写门（admin token）**：与 flow 管理同一族 ⇒ 递 admin 钥匙
   * （与移动端 `_adminPost` 同一档）。调用方负责 fire-and-forget
   * （catch 不外抛）—— 数据面永远不能挡住对话面。
   */
  async ingestTrace(req: {
    source: string;
    trajectory: Array<{ tool: string; ok: boolean; at: string }>;
    userInput?: string;
    intentSignature?: string;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      source: req.source,
      trajectory: req.trajectory,
    };
    if (req.userInput) body.user_input = req.userInput;
    if (req.intentSignature) body.intent_signature = req.intentSignature;
    await this.request('/api/flows/traces/ingest', {
      method: 'POST',
      headers: await adminHeaders(),
      body: JSON.stringify(body),
    });
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
    /**
     * **这个 agent 需要哪几类模型**（llm / asr / tts …）。
     *
     * ⚠️ 词表是端脑的 `Capability`（**单一真源**）⇒ ⇒ 不认识的词会被
     * 端脑**整个拒绝**（不会一半生效、一半被丢掉）⇒ ⇒ 界面照那份词表
     * 渲染选择器，不许自己另造一套词。
     */
    required_capabilities?: string[];
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
    /**
     * **这个 agent 需要哪几类模型**（llm / asr / tts …）—— 与
     * [createPromptAgent] 同一个键、同一个语义。
     */
    required_capabilities?: string[];
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

  // ⚠️ **旧的路径是 `/api/cortex/admin/agents/install`** —— 服务端早已改名，
  // 那个路由**根本不存在** ⇒ ⇒ 还在用旧路径的老脚本会 404 ⇒ ⇒ 以这里为准。
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
  /**
   * **大脑 ASR** —— `model` 不给就用端脑那档（asr）的**分档默认**。
   *
   * ⚠️ 端脑现在**真的按 id 选引擎**（以前这个字段收下就丢 ⇒ ⇒ 实际跑的
   * 永远是「第一个注册的引擎」）⇒ ⇒ 给了不存在的 id 会**明确报错**，
   * 不会静默换一个引擎。
   *
   * ⚠️ **`lobe` 决定「用哪个叶区的语音模型」**：端脑的解析链是
   * 显式 `model` → **该叶区的 asr 覆盖** → 全局分档默认 → 第一个注册的
   * 引擎。不传 ＝ 走全局（旧行为）。
   *
   * ⚠️ **不是 `conversation_id`**（2026-11-13 订正）：端脑**没有**
   * 「会话 → 叶区」这张映射 ⇒ ⇒ 发 `conversation_id` 只会被 serde
   * 静默丢掉 ⇒ ⇒ 看着像配了、其实没生效（失败长得像成功）。调用方
   * 是**哪个叶区的耳朵**，就直说哪个叶区。
   */
  async transcribeAudio(
    audio: string,
    format: string = 'webm',
    language: string = 'zh',
    model?: string,
    lobe?: string,
  ): Promise<{ text: string }> {
    return this.request<{ text: string }>('/api/telencephalon/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify({
        audio,
        format,
        language,
        ...(model ? { model } : {}),
        ...(lobe ? { lobe } : {}),
      }),
    });
  }

  /**
   * **大脑 TTS** —— `model` 不给就用端脑那档（tts）的**分档默认**。
   *
   * `lobe` 语义同 {@link transcribeAudio}（叶区覆盖优先于全局）。
   */
  async synthesizeSpeech(
    text: string,
    voice: string = 'alloy',
    model?: string,
    lobe?: string,
  ): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/telencephalon/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await adminHeaders()),
      },
      body: JSON.stringify({
        text,
        voice,
        ...(model ? { model } : {}),
        ...(lobe ? { lobe } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Speech synthesis failed: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * **图片生成**（`image_gen` 档的门面）—— 云供应商的模型走**端脑代理**
   * （key 不出大脑），本地模型走**内嵌 neuron 的 imagegen 注册表**；
   * `model` 不给就用 `image_gen` 分档默认。
   *
   * ⚠️ 门是 **admin**（与 voice 同一把尺 ⇒ `request()` 递的那把）。
   * ⚠️ **显式类型参数**（`request<GenerateImageResponse>(…)`）⇒ ⇒ 才进得了
   * 契约清单（见 getCapabilityDefaults 的注释）。
   */
  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResponse> {
    return this.request<GenerateImageResponse>('/api/telencephalon/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        prompt: req.prompt,
        ...(req.model ? { model: req.model } : {}),
        ...(req.lobe ? { lobe: req.lobe } : {}),
        ...(req.n != null ? { n: req.n } : {}),
        ...(req.size ? { size: req.size } : {}),
        ...(req.response_format ? { response_format: req.response_format } : {}),
        ...(req.negative_prompt ? { negative_prompt: req.negative_prompt } : {}),
        ...(req.steps != null ? { steps: req.steps } : {}),
        ...(req.guidance_scale != null ? { guidance_scale: req.guidance_scale } : {}),
        ...(req.seed != null ? { seed: req.seed } : {}),
        ...(req.max_sequence_length != null
          ? { max_sequence_length: req.max_sequence_length }
          : {}),
      }),
    });
  }

  /**
   * **分档默认模型** —— 「这一类能力用哪个模型」。
   *
   * ⚠️ 键是**能力词**（llm / asr / tts …）⇒ ⇒ 端脑的 `Capability` 词表是
   * 单一真源（`GET` 把合法词表一起回来）⇒ ⇒ 界面照它渲染选择器。
   */
  async getCapabilityDefaults(): Promise<CapabilityDefaultsView> {
    // ⚠️ **显式类型参数**（`this.request<CapabilityDefaultsView>(…)`）——
    // ⇒ ⇒ 契约清单的抓取脚本认的是 `request<T>(` 这个形状 ⇒ ⇒ 写成
    // `this.request(` 就**抓不到** ⇒ ⇒ 这个端点就**不在清单里** ⇒ ⇒
    // 端点漂移（端脑哪天少这条路由）永远抓不到。
    return this.request<CapabilityDefaultsView>(
      '/api/telencephalon/lobes/capability-defaults',
    );
  }

  /**
   * 写**分档默认模型**（写门 ⇒ 要 admin 钥匙 ⇒ `request()` 递的那把）。
   *
   * ⚠️ **`defaults` 整份替换** —— 下发的是全量 ⇒ ⇒ 两端不会各留一半。
   *
   * ⚠️ **`lobeDefaults` 是可加段**（2026-11-13）：不带 ⇒ 端脑**不动**
   * 已有的逐叶区表（旧客户端/只要改全局的调用方不该顺手抹掉叶区选择）；
   * 带了 ⇒ 整份替换那张表（空对象 = 清空 ⇒ 全部叶区回到跟随全局）。
   */
  async setCapabilityDefaults(
    defaults: Record<string, string>,
    lobeDefaults?: Record<string, Record<string, string>>,
  ): Promise<CapabilityDefaultsView> {
    // ⚠️ 同上：**显式类型参数** ⇒ ⇒ 才进得了契约清单。
    return this.request<CapabilityDefaultsView>(
      '/api/telencephalon/lobes/capability-defaults',
      {
        method: 'PUT',
        body: JSON.stringify({
          defaults,
          ...(lobeDefaults !== undefined ? { lobe_defaults: lobeDefaults } : {}),
        }),
      },
    );
  }

  /**
   * **llm 路由的真消费面**（`POST /api/telencephalon/lobes/models`）——
   * 把云供应商模型**注册成 neuron 的远端 llm 引擎**＋设**全局默认**；
   * per-lobe 覆盖整份替换（不在表里＝跟随全局）。
   *
   * ⚠️ **key 不出大脑**：请求体只递供应商 `id`（端脑按 id 从自己的供应商
   * 目录解析 key —— 与移动端 `buildModelRoutingPayload` 同一约定）。
   * ⚠️ **`default_model` 三态**：字段不出现＝不动；`null`＝回落本地；
   * 串＝该模型。`lobe_models` 只装显式覆盖（「跟随全局」不进表）。
   * ⚠️ 显式类型参数 ⇒ 进契约清单（端点漂移才抓得到）。
   */
  async setLobeModels(req: LobeModelsPush): Promise<LobeModelsView> {
    return this.request<LobeModelsView>('/api/telencephalon/lobes/models', {
      method: 'POST',
      body: JSON.stringify({
        providers: req.providers,
        ...(req.default_model !== undefined
          ? { default_model: req.default_model }
          : {}),
        ...(req.lobe_models ? { lobe_models: req.lobe_models } : {}),
      }),
    });
  }

  /**
   * **模型路由全貌**（只读）—— 叶区 × 类型的矩阵要合并写回，就必须先读到
   * **当前那份覆盖表**（不是生效值：生效值回填会把「跟随全局」钉死）。
   *
   * ⚠️ 路径是 `lobes/routing`（只读），与写面 `lobes/models`（POST）分开。
   * ⚠️ 显式类型参数 ⇒ 进契约清单。
   */
  async getLobeRouting(): Promise<LobeRoutingView> {
    return this.request<LobeRoutingView>('/api/telencephalon/lobes/routing');
  }

  /** **原生叶区清单**（名字 ＋ 描述）—— 端脑注册了哪些就显示哪些。 */
  async getLobeManifests(): Promise<LobeManifestSummary[]> {
    const body = await this.request<{ lobes?: LobeManifestSummary[] }>(
      '/api/telencephalon/lobes/manifest',
    );
    return body.lobes ?? [];
  }

  // Task methods
  async getTasks(): Promise<any[]> {
    return this.request<any[]>('/api/telencephalon/tasks');
  }

  /**
   * 新建一条端脑任务。
   *
   * ⚠️ **线上形状是蛇形**（端脑 `CreateTaskRequest` 收 `due_time`）⇒ ⇒
   * 以前这里把入参**整个**发出去 ⇒ ⇒ serde **静默丢掉** `dueTime` 那个键
   * ⇒ ⇒ 建出来的任务**永远没有截止时间**（移动端发的是 `due_time` ✔）。
   * ⇒ ⇒ 这一刀按**线上形状显式拼**请求体（不照抄入参）。
   */
  async createTask(task: {
    title: string;
    description?: string;
    dueTime?: string;
    priority?: string;
    tags?: string[];
  }): Promise<any> {
    const body: Record<string, unknown> = { title: task.title };
    if (task.description !== undefined) body.description = task.description;
    if (task.dueTime) body.due_time = task.dueTime;
    if (task.priority) body.priority = task.priority;
    if (task.tags) body.tags = task.tags;
    return this.request<any>('/api/telencephalon/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * 确认（或拒绝）一条端脑任务。
   *
   * ⚠️ **请求体里带上 `task_id`**（对齐移动端）—— 端脑**两样都收**：
   * **路径里那个才是规范来源**（处理器会用它覆盖请求体那个）⇒ ⇒ 不带也认
   * （端脑侧那条 `#[serde(default)]` 就是为这件事加的）。
   */
  async confirmTask(taskId: string, confirmed: boolean, modifications?: any): Promise<any> {
    return this.request<any>(`/api/telencephalon/tasks/${taskId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, confirmed, modifications }),
    });
  }

  /**
   * **改**一条端脑任务（标题／状态／优先级／截止时间）。
   *
   * ⚠️ **只改给了的字段**（没给的字段服务端不动）⇒ ⇒ 与移动端同一语义。
   * ⚠️ **线上形状是蛇形**：入参用 `dueTime`（客户端口径），
   * **发出去**是 `due_time`（端脑 `TaskUpdateBody` 认的那个）。
   */
  async updateTask(
    taskId: string,
    fields: {
      title?: string;
      status?: string;
      priority?: string;
      dueTime?: string;
    },
  ): Promise<any> {
    const body: Record<string, string> = {};
    if (fields.title) body.title = fields.title;
    if (fields.status) body.status = fields.status;
    if (fields.priority) body.priority = fields.priority;
    if (fields.dueTime) body.due_time = fields.dueTime;
    return this.request<any>(
      `/api/telencephalon/tasks/${encodeURIComponent(taskId)}/update`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** 删掉一条端脑任务（端脑回 **204**）。 */
  async deleteTask(taskId: string): Promise<void> {
    await this.request<void>(
      `/api/telencephalon/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    );
  }

  /**
   * 未确认的提醒 —— 端脑的**通知收件箱**（客户端轮询的就是它）。
   *
   * ⚠️ **读门**（影子锁 ∪ admin token）—— `request()` 已经把两把都带上。
   */
  async listNotifications(): Promise<ReminderNotification[]> {
    return this.request<ReminderNotification[]>('/api/telencephalon/notifications');
  }

  /**
   * 确认提醒（= 「已经送到用户眼前了」）。
   *
   * ⚠️ **写门**（admin token）⇒ ⇒ 影子锁开不了它 ⇒ ⇒ 别人不能替你的
   * 客户端把提醒标记成已送达。
   */
  async ackNotifications(ids: string[]): Promise<void> {
    await this.request('/api/telencephalon/notifications/ack', {
      method: 'POST',
      body: JSON.stringify({ ids }),
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

    /**
     * **配置中心**（`/api/telencephalon/config/*`）—— 记忆存储的落点就写在这里。
     *
     * ⚠️ 读不到控制面是 **503**（`config_centre_unavailable`），不是 404、
     * 也不是「空列表」⇒ ⇒ 界面必须把「读不到」与「没配过」分开说。
     * ⚠️ **显式泛型**（`request<…>`）⇒ 才进得了契约清单。
     */
    configSection: (section: string): Promise<ConfigSectionView> =>
      this.request<ConfigSectionView>(
        `/api/telencephalon/config/${encodeURIComponent(section)}`,
      ),

    /** 写一条（`secret: true` ⇒ 服务端密封入库、读回掩码）。 */
    putConfig: (
      section: string,
      key: string,
      value: unknown,
      opts?: { secret?: boolean },
    ): Promise<ConfigWriteResult> =>
      this.request<ConfigWriteResult>(
        `/api/telencephalon/config/${encodeURIComponent(section)}/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ value, secret: opts?.secret ?? false }),
        },
      ),

    /** 删一条（切后端后清掉不再适用的键）。 */
    deleteConfig: (section: string, key: string): Promise<{ removed: boolean }> =>
      this.request<{ removed: boolean }>(
        `/api/telencephalon/config/${encodeURIComponent(section)}/${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      ),

    /**
     * neuron **目录面**（`GET /v1/models`，neuron 路由挂在脑面根上）——
     * **全量**（含「目录里有、还没下载」的条目）。
     *
     * ⚠️ 与 `/models/providers` 里内置条目的读视图是**两份形状**：这边带
     * `engine`／`default_repo`（发起下载要用的两样）⇒ 那边没有 ⇒
     * 「下载面」的数据源是**这一份**（与移动端 NeuronDownloadSheet 同源）。
     */
    catalog: (): Promise<NeuronCatalogEntry[]> =>
      this.request<{ data: NeuronCatalogEntry[] }>('/v1/models').then((r) => r.data ?? []),

    /**
     * 发起下载（`POST /v1/models/pull`）—— **异步任务**（202 Accepted ＋
     * job_id）⇒ `request()` 对 2xx 都放行 ⇒ 不用单独写。
     *
     * ⚠️ `reference` 用目录条目的 `default_repo`（`huggingface:owner/repo`）；
     * `id` 用**去掉 engine 前缀**的模型 id（与移动端 `modelId` 同一刀法）。
     */
    pull: (req: { reference: string; engine: string; id: string }): Promise<string> =>
      this.request<{ job_id: string }>('/v1/models/pull', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((r) => r.job_id),

    /** 下载任务列表（进度轮询用）。 */
    pullJobs: (): Promise<NeuronPullJob[]> =>
      this.request<{ data: NeuronPullJob[] }>('/v1/models/pull').then((r) => r.data ?? []),

    /** 取消一个下载任务（`DELETE /v1/models/pull/{job_id}`）。 */
    pullCancel: (jobId: string): Promise<void> =>
      this.request<void>(
        `/v1/models/pull/${encodeURIComponent(jobId)}`,
        { method: 'DELETE' },
      ),
  };

  issueSubsystemToken = async (
    scopes: string[],
    ttlSeconds?: number
  ): Promise<SubsystemTokenResponse> => {
    // Telencephalon replaced the legacy subsystem-token sidecar command
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