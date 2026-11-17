/**
 * 资源管理 —— 桌面端的**文档面**客户端（海马体 `/api/documents/*`）。
 *
 * ## 它管的是什么
 *
 * 「资源管理」＝ 用户自己的**文件与产物**：名字、类型、大小、字节在哪、
 * 能不能被搜到、能不能改名、能不能删掉。
 *
 * 分面是上一刀拍板的：
 * · **清单（权威）**留调用方自己的库；
 * · **字节**留对象存储（blob 面）；
 * · **可检索的那一份**进海马体 `documents.lance`（索引面）；
 * · **不写成 memory 行**（会进巩固/摘要/遗忘 —— 用户的文件不该被忘）。
 *
 * ⚠️ **它不是记忆面** —— 记忆会被巩固、摘要、遗忘；用户的文件不会。
 * ⇒ ⇒ 所以这里另开一个客户端，而不是往 `hippocampusClient` 里加方法：
 * ① 记忆面已有一条 R5 债务登记（`scripts/check-failure-masking.mjs`），
 *   再往里塞东西会让那条登记更难读；
 * ② 两个面的**通道**不同（文档面有裸字节通道，记忆面没有）。
 *
 * ## 地址
 *
 * 桌面端**不跑独立的海马体进程** —— 海马体嵌在端脑里（`/hippocampus`）
 * ⇒ ⇒ 正确地址是 `{端脑}/hippocampus/api/...`（不是 localhost:8081）。
 *
 * ## 契约陷阱（都对着 `hippocampus-server/src/handlers_documents.rs` 核过）
 *
 * 1. **上传是裸字节，不是 JSON** —— `POST /api/documents/{tenant}/upload`
 *    的 body **就是文件内容本身**（`bytes: Bytes` 提取器）⇒ ⇒ 一旦
 *    `JSON.stringify` ⇒ ⇒ 二进制变成 Base64 文本 ⇒ ⇒ 存回去的是 Base64，
 *    下载回来是乱码 ⇒ ⇒ **失败长得像成功**。
 * 2. **下载也是裸字节** —— `GET /api/documents/{tenant}/{id}/content`
 *    回的是文件内容（带 `Content-Type`），不是 JSON ⇒ ⇒ 必须走
 *    `arrayBuffer()`。
 * 3. **搜索是 POST** —— `POST /api/documents/search`（没有 GET 那一条）。
 * 4. **两个通道分开回** —— `DocumentSearchResults` 是 `{keyword, vector}`
 *    **两个数组**，不是融合后的一个列表 ⇒ ⇒ 两边的分数**不可比**
 *    （BM25 vs 余弦相似度）⇒ ⇒ 界面不许把它们排成一张表。
 * 5. **删除回包是 snake_case** —— `DeleteDocumentResponse` **没有**
 *    `rename_all = "camelCase"` ⇒ ⇒ 回的是 `bytes_deleted` / `bytes_error`
 *    （而请求侧的结构体是 camelCase）⇒ ⇒ 一半 camelCase 一半 snake_case
 *    是**真的**，不是笔误。
 * 6. **租户在路径第三段** —— `/api/documents/{tenant}/{id}` ⇒ ⇒ 人格
 *    跟着路径走（中间件从第三段取租户并与凭据比对 ⇒ 不匹配就 403）。
 *
 * ## 门
 *
 * 读门 = **影子锁 ∪ admin token**（判据源 `lib/readDoorHeaders.ts`）
 * ⇒ ⇒ 写操作（上传/改名/删除）落**写门**（只认 admin token）⇒ ⇒
 * 那把钥匙也在这一组里 ⇒ ⇒ 读写都过。
 */

import { prefrontalUrl } from './platform';
import { readDoorHeaders } from './readDoorHeaders';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { useIdentityStore } from '../stores/identityStore';

/** 海马体 `Document` 的线上形状（snake_case —— 那个结构体没写 camelCase）。 */
interface WireDocument {
  id: string;
  tenant_id: string;
  name: string;
  mime: string;
  size: number;
  blob_key: string;
  text: string;
  tags: string[];
  source: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
}

/** 一条搜索命中。 */
interface WireHit {
  document: WireDocument;
  score: number;
  channel: string;
}

/** `DocumentSearchResults` —— 两个通道分开。 */
interface WireSearchResults {
  keyword: WireHit[];
  vector: WireHit[];
}

/** `ListDocumentsResponse`。 */
interface WireListResponse {
  documents: WireDocument[];
}

/**
 * `DeleteDocumentResponse` 的线上形状。
 *
 * ⚠️ **snake_case**（那个结构体没写 `rename_all = "camelCase"`）
 * ⇒ ⇒ `bytes_deleted` / `bytes_error`，不是 camelCase。
 */
interface WireDeleteResponse {
  success: boolean;
  deleted: boolean;
  bytes_deleted: boolean;
  bytes_error: string | null;
}

/** 一份资源在界面上的形状。 */
export interface ResourceDocument {
  id: string;
  tenantId: string;
  name: string;
  mime: string;
  size: number;
  /** 字节在对象存储里的 key（索引只存 key，不存字节）。 */
  blobKey: string;
  /** 被索引的正文（关键词通道只看它）。 */
  text: string;
  tags: string[];
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** `metadata.kind` —— `file` | `artifact` | …（自由词表）。 */
  kind: string;
  /** 有没有抽出正文（没有 ⇒ 只能按名字搜到）。 */
  extracted: boolean;
  /** 正文只索引了前 64KB（截断了）。 */
  truncated: boolean;
}

/** 一条搜索命中。 */
export interface ResourceSearchHit {
  document: ResourceDocument;
  score: number;
  /** `keyword` | `vector` —— **两个通道的分数不可比**。 */
  channel: string;
}

/** 搜索的结果 —— 两个通道分开，不融合。 */
export interface ResourceSearchResults {
  keyword: ResourceSearchHit[];
  vector: ResourceSearchHit[];
}

/**
 * 删除的**三件事实** —— 回包分开说，不许合成一句「删掉了」。
 *
 * ⚠️ 索引行与字节是**两件事**：行删了、字节没删（blob 后端没配/报错）
 * ⇒ ⇒ 用户以为文件没了，存储悄悄涨 ⇒ ⇒ 这必须原样说出来。
 */
export interface ResourceDeleteResult {
  /** 索引行删掉了没有。 */
  deleted: boolean;
  /** 字节删掉了没有。 */
  bytesDeleted: boolean;
  /** 字节为什么没删掉（null = 字节删掉了，或压根没有字节）。 */
  bytesError: string | null;
}

/** 取回的文件。 */
export interface ResourceContent {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/** 上传时要带的东西。 */
export interface ResourceUpload {
  name: string;
  bytes: Uint8Array;
  mime?: string;
  /** `file` | `artifact` | …（进 `metadata.kind`）。 */
  kind?: string;
  /** 谁传的（`desktop` | `mobile` | …）。 */
  source?: string;
}

/**
 * `metadata` 是自由 JSON ⇒ ⇒ 解析要**防御式**：
 * 别的写入方（`POST /api/documents`）可能带来完全不同的形状。
 */
function parseMetadata(raw: unknown): {
  kind: string;
  extracted: boolean;
  truncated: boolean;
} {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const kind = obj.kind;
  return {
    kind: typeof kind === 'string' && kind.length > 0 ? kind : 'file',
    extracted: obj.extracted === true,
    truncated: obj.truncated === true,
  };
}

/** 线上 `Document` → 界面上的资源。 */
export function toResourceDocument(raw: WireDocument): ResourceDocument {
  const meta = parseMetadata(raw.metadata);
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    name: raw.name,
    mime: raw.mime ?? '',
    size: typeof raw.size === 'number' ? raw.size : 0,
    blobKey: raw.blob_key ?? '',
    text: raw.text ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    source: raw.source ?? null,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
    kind: meta.kind,
    extracted: meta.extracted,
    truncated: meta.truncated,
  };
}

/**
 * 资源管理客户端（桌面端）。
 *
 * 租户**只有一个出处** —— 身份 store（`GET /shadow/v1/identity` 问端脑
 * 「你是谁」⇒ 人格就是租户）⇒ ⇒ 桌面与手机用同一个账号时算出的**同一个
 * 人格** ⇒ ⇒ 同一份资源 ⇒ ⇒ 不需要另设一条注入通道。
 */
export class DocumentsClient {
  /** 端脑地址 —— 优先用运行时配置的，兜底用默认的端脑端口。 */
  private getBaseUrl(): string {
    return (
      useTelencephalonStore.getState().connection.baseUrl || prefrontalUrl()
    );
  }

  /** 当前租户（人格）—— 身份 store 是唯一权威。 */
  private getTenantId(): string {
    return useIdentityStore.getState().tenantId;
  }

  /** 门上的钥匙（影子锁 ∪ admin token）。 */
  private async doorHeaders(): Promise<Record<string, string>> {
    return readDoorHeaders(
      useTelencephalonStore.getState().connection.apiKey,
    );
  }

  /** 把服务端的错误**原样说出来**（不换一句 JS 语法错）。 */
  private async fail(response: Response): Promise<never> {
    let body = '';
    try {
      const text = await response.text();
      body = text ? `: ${text.slice(0, 300)}` : '';
    } catch {
      // body 读不出来不是致命错误
    }
    throw new Error(
      `HTTP ${response.status}: ${response.statusText}${body}`,
    );
  }

  /** 发一个 JSON 请求并回 JSON。 */
  private async requestJson<T>(
    endpoint: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const url = `${this.getBaseUrl()}/hippocampus${endpoint}`;
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(await this.doorHeaders()),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      await this.fail(response);
    }

    // ⚠️ **别让「服务端回的不是 JSON」变成一句 JS 语法错** ——
    // 海马体在存储出错时回的是 HTTP 200 + 纯文本 ⇒ ⇒ `response.json()`
    // 抛 `Unexpected token 'S', "Storage er"...` ⇒ ⇒ 用户看到的是一句
    // JS 语法错，而真正的理由被换掉了 ⇒ ⇒ 失败长得像成功。
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (parseError) {
      const detail = text.trim() ? text.slice(0, 300) : String(parseError);
      throw new Error(`服务端回的不是 JSON（HTTP ${response.status}）：${detail}`);
    }
  }

  /**
   * 列资源 —— `GET /api/documents`（租户在查询串里，最新的在前）。
   *
   * 租户**可以不给** —— 服务端会回退到它的默认租户
   * （桌面端一般会给出身份 store 里那个人格）。
   */
  async list(params: { limit?: number; tenantId?: string } = {}): Promise<
    ResourceDocument[]
  > {
    const query = new URLSearchParams();
    const tenant = params.tenantId ?? this.getTenantId();
    if (tenant) query.set('tenantId', tenant);
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const raw = await this.requestJson<WireListResponse>(
      `/api/documents${suffix}`,
    );
    return (raw.documents ?? []).map(toResourceDocument);
  }

  /**
   * 搜索资源 —— `POST /api/documents/search`（**不是** GET）。
   *
   * ⚠️ 两个通道**分开回**（BM25 vs 余弦相似度 ⇒ ⇒ 分数不可比）。
   */
  async search(
    query: string,
    limit = 10,
    tenantId?: string,
  ): Promise<ResourceSearchResults> {
    const tenant = tenantId ?? this.getTenantId();
    const raw = await this.requestJson<WireSearchResults>(
      '/api/documents/search',
      {
        method: 'POST',
        body: {
          query,
          limit,
          ...(tenant ? { tenantId: tenant } : {}),
        },
      },
    );
    const map = (hits: WireHit[] | undefined): ResourceSearchHit[] =>
      (hits ?? []).map((h) => ({
        document: toResourceDocument(h.document),
        score: h.score,
        channel: h.channel,
      }));
    return {
      keyword: map(raw.keyword),
      vector: map(raw.vector),
    };
  }

  /**
   * 上传 —— `POST /api/documents/{tenant}/upload`。
   *
   * ⚠️ **body 是裸字节**（不是 JSON）⇒ ⇒ 租户**只能**在路径里
   * （查询串里那个是给 `/api/documents` 那种 JSON body 用的）。
   */
  async upload(input: ResourceUpload): Promise<ResourceDocument> {
    const tenant = encodeURIComponent(this.getTenantId());
    const query = new URLSearchParams();
    query.set('name', input.name);
    if (input.mime) query.set('mime', input.mime);
    if (input.kind) query.set('kind', input.kind);
    if (input.source) query.set('source', input.source);

    const url = `${this.getBaseUrl()}/hippocampus/api/documents/${tenant}/upload?${query.toString()}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': input.mime || 'application/octet-stream',
        ...(await this.doorHeaders()),
      },
      // ⚠️ **不许 JSON.stringify** —— 这一段就是文件内容本身。
      body: input.bytes as unknown as BodyInit,
    });

    if (!response.ok) {
      await this.fail(response);
    }

    const text = await response.text();
    let raw: WireDocument;
    try {
      raw = JSON.parse(text) as WireDocument;
    } catch (parseError) {
      const detail = text.trim() ? text.slice(0, 300) : String(parseError);
      throw new Error(`服务端回的不是 JSON（HTTP ${response.status}）：${detail}`);
    }
    return toResourceDocument(raw);
  }

  /**
   * 下载 —— `GET /api/documents/{tenant}/{id}/content`（**裸字节**）。
   *
   * ⚠️ 只有元数据、没有字节的文档 ⇒ 服务端回 **404**
   * （`this document was indexed by metadata only — it has no bytes`）
   * ⇒ ⇒ 界面要把这句话说出来，而不是笼统的「下载失败」。
   */
  async download(id: string): Promise<ResourceContent> {
    const tenant = encodeURIComponent(this.getTenantId());
    const url = `${this.getBaseUrl()}/hippocampus/api/documents/${tenant}/${encodeURIComponent(id)}/content`;
    const response = await fetch(url, {
      method: 'GET',
      headers: await this.doorHeaders(),
    });

    if (!response.ok) {
      await this.fail(response);
    }

    const buffer = await response.arrayBuffer();
    const mime =
      response.headers?.get?.('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';
    return { name: '', mime, bytes: new Uint8Array(buffer) };
  }

  /**
   * 改名 / 重打标签 / 换 kind —— `PATCH /api/documents/{tenant}/{id}`。
   *
   * ⚠️ 请求体是 **camelCase**（`UpdateDocumentRequest` 写了
   * `rename_all = "camelCase"`）⇒ ⇒ 与 `Document` 自己的 snake_case
   * **不一样** ⇒ ⇒ 这两半必须分开记。
   */
  async update(
    id: string,
    patch: { name?: string; tags?: string[]; kind?: string; source?: string },
  ): Promise<ResourceDocument> {
    const tenant = encodeURIComponent(this.getTenantId());
    const raw = await this.requestJson<WireDocument>(
      `/api/documents/${tenant}/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.source !== undefined ? { source: patch.source } : {}),
        },
      },
    );
    return toResourceDocument(raw);
  }

  /**
   * 删除 —— `DELETE /api/documents/{tenant}/{id}`。
   *
   * 回包**三件事实分开说**：索引行删了没、字节删了没、字节为什么没删。
   */
  async remove(id: string): Promise<ResourceDeleteResult> {
    const tenant = encodeURIComponent(this.getTenantId());
    const raw = await this.requestJson<WireDeleteResponse>(
      `/api/documents/${tenant}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return {
      deleted: raw.deleted === true,
      bytesDeleted: raw.bytes_deleted === true,
      bytesError: raw.bytes_error ?? null,
    };
  }
}

export const documentsClient = new DocumentsClient();
