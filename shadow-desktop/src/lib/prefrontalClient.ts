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

/**
 * 解开响应 —— **端脑的裸体**与**旧方言的信封**两种都认。
 *
 * ## 为什么两种都要认
 *
 * 这个 client 说的是 **prefrontal 独立仓**时代的方言（`{success,data}` 信封）
 * ⇒ ⇒ 而它今天打的是**端脑**（`lib/platform.ts` 自己写着：`prefrontalUrl()`
 * 其实是端脑的地址）⇒ ⇒ 端脑那边**一律返裸体**
 * ⇒ ⇒ 只认信封 ⇒ ⇒ `env.success` 是 `undefined` ⇒ ⇒ **每一发都抛错**
 * ⇒ ⇒ 「路径对得上、方法对得上」**不等于**「解析得通」。
 *
 * ⚠️ 判别依据是**「顶层对象有没有 success 字段」** ⇒ ⇒ 端脑的
 * `LlmConfigureResponse` 也有 `success`（那是**业务字段**）⇒ ⇒ 所以判别时
 * 只看**顶层对象**，不看数组。
 *
 * ⚠️ 端脑这一面**压根没有信封**（机器可判 ⇒ `scripts/check-client-dialect.mjs`
 * ⇒ `scripts/lib/response-shape.mjs`）⇒ ⇒ 这个 helper 是**迁移期**的过渡，
 * 不是「端脑有两套形状」的证据。
 */
export function unwrapEnvelope<T>(body: unknown, failMessage: string): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'success' in (body as Record<string, unknown>)) {
    const env = body as { success?: boolean; data?: T; error?: string };
    if (!env.success) throw new Error(env.error || failMessage);
    return env.data as T;
  }
  return body as T;
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
  /**
   * Skip the global error dialog. Background/polling calls set this so an
   * unreachable backend does not throw a modal at the user on every page
   * mount; the caller surfaces the failure inline instead.
   */
  silent?: boolean;
};

import { prefrontalUrl } from './platform';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { useErrorDialogStore } from '../stores/errorDialogStore';
import { isIntentionalAbort } from './abort';
import { readDoorHeaders } from './readDoorHeaders';
import { adminHeaders } from './adminToken';

export class PrefrontalClient {
  private headers: Record<string, string>;

  /**
   * **显式**指定的地址（测试 / 嵌入场景）—— 只作用于**这一个实例**。
   *
   * ⚠️ 构造时**不再**改写全局 store。
   * ⇒ ⇒ 病根：以前构造函数调 store.setBaseUrl(url)
   * ⇒ ⇒ 而模块加载时 new PrefrontalClient(prefrontalUrl()) 传进去的是**默认值**
   * ⇒ ⇒ ⇒ **每次应用启动都把用户配的端脑地址抹回默认**（而且写回 localStorage）
   * ⇒ ⇒ ⇒ 同一刻 store.setBaseUrl 还把 telencephalonClient 的地址也改了
   * ⇒ ⇒ ⇒ 两个客户端一起被打回本地（用户配的是远程大脑时 ⇒ 连不上自己的脑）。
   */
  private readonly overrideBaseUrl?: string;

  constructor(baseUrl?: string) {
    this.headers = {
      'Content-Type': 'application/json',
    };
    this.overrideBaseUrl = baseUrl;
  }

  /**
   * 这一发打**哪个脑** —— 真相源只有一处 = store 的 connection.baseUrl。
   *
   * ① 实例显式指定的地址（测试 / 嵌入）⇒ 它赢；
   * ② store 里的地址（用户可配、持久化、重启后复原）⇒ 它赢；
   * ③ 都没有 ⇒ prefrontalUrl() 兜底。
   */
  private getBaseUrl(): string {
    if (this.overrideBaseUrl) return this.overrideBaseUrl;
    const telencephalonBase = useTelencephalonStore.getState().connection.baseUrl;
    if (telencephalonBase) return telencephalonBase;
    return prefrontalUrl();
  }

  /**
   * 这一发该递哪几把钥匙（**按门形**分家）。
   *
   * - 读（GET/HEAD）⇒ 读门认**两把** ⇒ 影子锁 ∪ admin token；
   * - 写（其余）⇒ 写门只认 **admin token**。
   *
   * ⚠️ 一条规则、一处实现 ⇒ 复用共享实现（`lib/readDoorHeaders.ts` /
   * `lib/adminToken.ts`）⇒ ⇒ **不另抄一份钥匙逻辑**，也**拿不到就不带那个头**
   * （绝不塞空串 —— 空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开）。
   */
  private async doorHeaders(method: string): Promise<Record<string, string>> {
    try {
      if (method === 'GET' || method === 'HEAD') {
        return await readDoorHeaders(useTelencephalonStore.getState().connection.apiKey);
      }
      return await adminHeaders();
    } catch {
      // ⚠️ **拿不到就不带那个头** —— 读钥匙本身出错（sidecar 没起来 / 老版本
      // 没有那个命令）⇒ ⇒ 照样把请求发出去 ⇒ ⇒ 端脑回 401 并说清原因
      // ⇒ ⇒ 比「因为读不到钥匙就不发请求」好（后者会把网络问题说成别的）。
      return {};
    }
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
          // ⚠️ **端脑的门**：读门 = 影子锁 ∪ admin token；写门 = admin token
          // ⇒ ⇒ **门认哪几把，客户端就递哪几把**（判据源
          // `telencephalon/src/api/door_policy.txt` ⇒ 实现
          // `security/api_key.rs::verify_read_credential`）。
          // ⇒ ⇒ 之前这个 client **一把钥匙都不带** ⇒ ⇒ 写面（`POST /api/sessions`
          // 是 admin 门 ⇒ `auto` ⇒ POST ⇒ admin）**必然 401**。
          ...(await this.doorHeaders(method)),
        },
        body: options.body,
      });
    } catch (err) {
      // ⚠️ **自己叫停的取消不许报成「网络故障」**（判据见 `lib/abort.ts`）
      if (isIntentionalAbort(err)) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      if (!options.silent) {
        useErrorDialogStore.getState().show({
          source: 'http',
          endpoint: url,
          method,
          message: `Network error: ${message}`,
          stack,
        });
      }
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
      if (!options.silent) {
        useErrorDialogStore.getState().show({
          source: 'http',
          endpoint: url,
          method,
          status: response.status,
          statusText: response.statusText,
          message,
        });
      }
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
    const body = await this.request<unknown>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return unwrapEnvelope<SessionResponse>(body, 'createSession failed');
  }

  async listSessions(): Promise<SessionResponse[]> {
    const body = await this.request<unknown>('/api/sessions');
    return unwrapEnvelope<SessionResponse[]>(body, 'listSessions failed') ?? [];
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

  /**
   * 读对端的一个任务。
   *
   * ⚠️ **回包形状 = 平台的 `protocol::Task`**（`{id, status:{state, message, timestamp}}`）
   * —— **不是** `{task_id, state, result}`。服务端 `get_a2a_task` 把对端 `tasks/get`
   * 的结果**原样转述** ⇒ ⇒ 字段名跟着平台走：`state` 是**大写**的
   * （`COMPLETED` / `CANCELED` / …），文本在 `status.message` 里。
   *
   * ⚠️ 以前这里声明的是 `{task_id, state, result?:{text}}` —— 服务端**从来不这么回**
   * ⇒ ⇒ 声明与实现不符 ⇒ ⇒ 谁按那个声明写代码，谁拿到的就是 undefined。
   */
  async getA2ATask(peerId: string, taskId: string): Promise<{
    id: string;
    status: {
      state: string;
      message?: string;
      timestamp?: number;
    };
    history?: unknown[];
    metadata?: Record<string, unknown>;
  }> {
    return this.request(`/api/a2a/peers/${peerId}/tasks/${taskId}`);
  }

  /**
   * 取消对端的一个任务。
   *
   * ⚠️ 服务端 `cancel_a2a_task` 回的是 **`null`**（它把 `()` 序列化了）
   * ⇒ ⇒ **没有** `success` 字段 ⇒ ⇒ 这里如实声明 `null`。
   * ⚠️ 顺带记一笔：服务端把对端 `tasks/cancel` 的 `{"ok":true}` **丢掉了**
   * ⇒ ⇒ 「让代理别丢回包」是一笔独立的欠项，不在本次改动里。
   */
  async cancelA2ATask(peerId: string, taskId: string): Promise<null> {
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

  async listTasks(
    tenantId: string = 'default',
    opts: { silent?: boolean } = {},
  ): Promise<Task[]> {
    const wire = await this.request<TaskRecordWire[]>(
      `/hippocampus/api/tasks?tenantId=${encodeURIComponent(tenantId)}`,
      { silent: opts.silent }
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

  /**
   * 把一条任务**复制**到另一个租户。
   *
   * 海马体的任务键是 `{tenant_id}::{task_id}`（`hippocampus-core/src/task.rs`
   * 的 `InMemoryTaskBackend::save`）⇒ 用同一个 taskId 换个租户 upsert，
   * 得到的是**新租户里的新一行**，不是搬家。
   *
   * 迁移「`default` 桶 → 账号人格桶」靠的就是它（`lib/tenantMigration.ts`）。
   * 前端专属字段（title / description / priority / metadata）不带过去 ——
   * 海马体本来就不存这些列（`updateTask` 里的同一套说明）。
   */
  async copyTaskToTenant(
    fromTenant: string,
    toTenant: string,
    taskId: string
  ): Promise<Task> {
    const current = await this.getTask(fromTenant, taskId);
    const body = toTaskRecordWire(current, toTenant);
    const wire = await this.request<TaskRecordWire>('/hippocampus/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapTask(wire);
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

  // 记忆相关的读写走 `lib/hippocampusClient.ts`（端脑的 `/hippocampus/api/*`），
  // 这里**不再**提供 `listMemories` —— 它打的是 `/api/memory/search`，而海马体
  // 没有这个端点（搜索是 `POST /api/search`），而且它从来没有调用方。

  setAuthToken(token: string): void {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.headers['Authorization'];
  }
}

/**
 * 桌面端旧方言客户端的**单例**。
 *
 * ⚠️ **不传地址** ⇒ ⇒ 它跟着 store 走（用户配的地址 / 持久化复原的地址）
 * ⇒ ⇒ 而不是在模块加载那一刻把默认地址钉死。
 */
export const prefrontalClient = new PrefrontalClient();
