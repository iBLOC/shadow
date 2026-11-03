import type { Memory, SearchResult } from '../types';
import { prefrontalUrl } from './platform';
import { readDoorHeaders } from './readDoorHeaders';
import { useTelencephalonStore } from '../stores/telencephalonStore';

/**
 * 海马体客户端（桌面端）。
 *
 * ## 海马体在哪
 *
 * 桌面端**不跑独立的海马体进程**：海马体是嵌在端脑里的 —— `encephalon` 的
 * default features 含 `hippocampus`（`encephalon/Cargo.toml`），端脑把它
 * 挂在 `/hippocampus` 下（`telencephalon/src/api/mod.rs:160`
 * `outer.nest("/hippocampus", h)`）。
 *
 * 所以正确地址是 **`{端脑}/hippocampus/api/...`**，不是 `localhost:8081`。
 * （移动端不同：它的 `libencephalon.so` 用 `--no-default-features
 * --features mobile` 编，**不带海马体**，Lance 也因此退出移动端依赖图。）
 *
 * ## 三个契约陷阱（都对着 hippocampus 源码核过）
 *
 * 1. **搜索是 POST 不是 GET**：海马体没有 `GET /api/memory/search`，
 *    搜索是 `POST /api/search`（`hippocampus-server/src/lib.rs:360`）。
 * 2. **dimension 请求侧小写、响应侧 PascalCase**：`add_memory` 只认
 *    `"user"|"agent"|"session"|"resources"`（`handlers.rs:216-222`，传
 *    其它值直接 400 "Invalid dimension"），而 `Memory` 的 serde 默认把
 *    dimension 序列化成 `"User"|"Agent"|…`（`types.rs:9-14`）。
 * 3. **字段是 snake_case、时间是 RFC3339 字符串**：海马体的 `Memory` 没有
 *    `rename_all = "camelCase"`（`types.rs:103-129`），所以是
 *    `session_id` / `created_at` / `updated_at`；`layer` 是枚举全名
 *    （`L2Detail`）而不是 UI 用的 `'L2'`。
 */

/** 海马体 `Memory` 的线上形状。 */
interface HippocampusMemory {
  id: string;
  uri: string;
  content: string;
  dimension: 'User' | 'Agent' | 'Session' | 'Resources';
  layer?: string | null;
  session_id?: string | null;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
  memory_type?: string | null;
  metadata?: unknown;
}

/** 海马体 `SearchResult` 的线上形状。 */
interface HippocampusSearchResult {
  memory: HippocampusMemory;
  score: number;
  source: 'Keyword' | 'Vector' | 'Graph';
}

/** 请求侧的 dimension 取值（小写）。 */
type DimensionWire = 'user' | 'agent' | 'session' | 'resources';

const DIMENSION_TO_WIRE: Record<Memory['dimension'], DimensionWire> = {
  User: 'user',
  Agent: 'agent',
  Session: 'session',
  Resources: 'resources',
};

/** 响应侧的 layer 是枚举全名，UI 用简写。 */
const LAYER_TO_UI: Record<string, Memory['layer']> = {
  L0Abstract: 'L0',
  L1Overview: 'L1',
  L2Detail: 'L2',
};

/** 海马体 → UI 的 `Memory`。 */
export function toUiMemory(raw: HippocampusMemory): Memory {
  return {
    id: raw.id,
    uri: raw.uri,
    content: raw.content,
    dimension: raw.dimension,
    layer: (raw.layer && LAYER_TO_UI[raw.layer]) || 'L2',
    sessionId: raw.session_id ?? undefined,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

export class HippocampusClient {
  /**
   * 租户 / 人格 id —— 海马体里所有读写都按它隔离
   * （`list_memories`、`search` 的 `tenant_id` 都来自这里）。
   *
   * `null` = 用服务端的默认租户 `"default"`。
   *
   * **为什么需要它**：将来「一个海马体、多个灵魂」是明确要支持的场景 ——
   * 家庭里只部署一个海马体，但每个人都有自己的个人助理。每个助理用
   * 自己的 tenant id，就能在同一份数据里共存，**不用改海马体的 schema**
   * （`Memory.tenant_id` 本来就是一等字段，`metadata` 还是自由 JSON）。
   */
  private tenantId: string | null = null;

  /** 设置当前的人格 / 租户（`null` = 默认租户）。 */
  setTenantId(tenantId: string | null): void {
    this.tenantId = tenantId;
  }

  /** 端脑地址 —— 优先用运行时配置的，兜底用默认的端脑端口。 */
  private getBaseUrl(): string {
    return (
      useTelencephalonStore.getState().connection.baseUrl || prefrontalUrl()
    );
  }

  private async request<T>(
    endpoint: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const url = `${this.getBaseUrl()}/hippocampus${endpoint}`;
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      // ⚠️ **门罩住整张面**（2026-11-03）⇒ ⇒ `/hippocampus/*` 现在也在门型表
      // 管辖内 ⇒ ⇒ 不递钥匙就是 401 ⇒ ⇒ 这里必须带读门的**全部**钥匙
      // （影子锁 ∪ admin token）—— 判据源 `lib/readDoorHeaders.ts`。
      //
      // ⚠️ 写操作（upsert / DELETE）落**写门**（只认 admin token）⇒ ⇒
      // 那把钥匙也在这一组里 ⇒ ⇒ 读写都过。
      headers: {
        'Content-Type': 'application/json',
        ...(await readDoorHeaders(
          useTelencephalonStore.getState().connection.apiKey,
        )),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      let body = '';
      try {
        const text = await response.text();
        body = text ? `: ${text.slice(0, 300)}` : '';
      } catch {
        // body 读不出来不是致命错误
      }
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}${body}`
      );
    }

    // ⚠️ **别让「服务端回的不是 JSON」变成一句 JS 语法错**。
    //
    // 2026-11-02 实测：海马体在存储出错时回的是 **HTTP 200 + 纯文本**
    // （「Storage error: lance scan stream: ... No field named tenant_id ...」）
    // ⇒ ⇒ `response.json()` 抛
    // `Unexpected token 'S', "Storage er"... is not valid JSON`
    // ⇒ ⇒ 用户看到的是**一句 JS 语法错**，而真正的理由（盘上的数据集
    // 是旧版写的、缺一列）**被换掉了** ⇒ ⇒ **失败长得像成功**。
    //
    // ⇒ 现在：先读文本 ⇒ 是 JSON 就解析 ⇒ 不是 ⇒ **把服务端那句话原样说出来**。
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (parseError) {
      // 空 body 也落在这里（`JSON.parse('')` 同样会抛）⇒ 保持「失败就是失败」。
      const detail = text.trim() ? text.slice(0, 300) : String(parseError);
      throw new Error(`服务端回的不是 JSON（HTTP ${response.status}）：${detail}`);
    }
  }

  /** 列出记忆 —— `GET /api/memory`（支持 tenantId / dimension / limit 过滤）。 */
  async listMemories(
    params: {
      dimension?: Memory['dimension'];
      limit?: number;
      tenantId?: string | null;
    } = {}
  ): Promise<Memory[]> {
    const query = new URLSearchParams();
    if (params.tenantId ?? this.tenantId) {
      query.set('tenantId', (params.tenantId ?? this.tenantId) as string);
    }
    if (params.dimension) {
      query.set('dimension', DIMENSION_TO_WIRE[params.dimension]);
    }
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const raw = await this.request<HippocampusMemory[]>(
      `/api/memory${suffix}`
    );
    return raw.map(toUiMemory);
  }

  /** 搜索记忆 —— `POST /api/search`（**不是** `GET /api/memory/search`）。 */
  async searchMemories(
    query: string,
    limit = 10,
    tenantId?: string | null
  ): Promise<SearchResult[]> {
    const tenant = tenantId ?? this.tenantId;
    const raw = await this.request<HippocampusSearchResult[]>('/api/search', {
      method: 'POST',
      body: { query, limit, ...(tenant ? { tenantId: tenant } : {}) },
    });
    return raw.map((r) => ({
      memory: toUiMemory(r.memory),
      score: r.score,
      source: r.source,
    }));
  }

  /** 新增记忆 —— `POST /api/memory`。 */
  async addMemory(input: {
    uri: string;
    content: string;
    dimension: Memory['dimension'];
    sessionId?: string;
    tenantId?: string | null;
  }): Promise<Memory> {
    const tenant = input.tenantId ?? this.tenantId;
    const raw = await this.request<HippocampusMemory>('/api/memory', {
      method: 'POST',
      body: {
        uri: input.uri,
        content: input.content,
        dimension: DIMENSION_TO_WIRE[input.dimension],
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(tenant ? { tenantId: tenant } : {}),
      },
    });
    return toUiMemory(raw);
  }

  /** 更新记忆 —— `PUT /api/memory/{id}`。 */
  async updateMemory(
    id: string,
    patch: { content?: string; dimension?: Memory['dimension'] }
  ): Promise<Memory> {
    const raw = await this.request<HippocampusMemory>(`/api/memory/${id}`, {
      method: 'PUT',
      body: {
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.dimension
          ? { dimension: DIMENSION_TO_WIRE[patch.dimension] }
          : {}),
      },
    });
    return toUiMemory(raw);
  }

  /** 删除记忆 —— `DELETE /api/memory/{id}`。 */
  async deleteMemory(id: string): Promise<void> {
    await this.request<unknown>(`/api/memory/${id}`, { method: 'DELETE' });
  }

  /**
   * 按 uri 找一条记忆。
   *
   * 海马体**没有**「按 uri 查」的端点（只有 list / search / 增删改），
   * 所以只能列出来在客户端匹配。`limit` 有上限 —— 影子自己的偏好条数
   * 很小，但 `dimension=Agent` 里还塞着巩固器产的洞见，所以要给足。
   */
  async findMemoryByUri(
    uri: string,
    options: {
      dimension?: Memory['dimension'];
      limit?: number;
      tenantId?: string | null;
    } = {}
  ): Promise<Memory | null> {
    const memories = await this.listMemories({
      dimension: options.dimension,
      limit: options.limit ?? 200,
      tenantId: options.tenantId,
    });
    return memories.find((m) => m.uri === uri) ?? null;
  }

  /**
   * 按 uri upsert 一条记忆。
   *
   * 海马体既没有 upsert 也没有「按 uri 改」，所以：列出来按 uri 匹配，
   * 命中就 `PUT`、没命中就 `POST`。给「影子记住的偏好」用 —— 那是
   * **当前值**（一条稳定 uri），不是历史流水。
   */
  async upsertMemory(input: {
    uri: string;
    content: string;
    dimension: Memory['dimension'];
    sessionId?: string;
    tenantId?: string | null;
  }): Promise<Memory> {
    const found = await this.findMemoryByUri(input.uri, {
      dimension: input.dimension,
      tenantId: input.tenantId,
    });
    if (found) {
      return this.updateMemory(found.id, { content: input.content });
    }
    return this.addMemory(input);
  }
}

export const hippocampusClient = new HippocampusClient();
