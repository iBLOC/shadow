import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

/**
 * 资源管理客户端 —— 端点契约判据。
 *
 * ⚠️ 这些断言锁的是**线上的真实契约**（对着
 * `hippocampus-server/src/handlers_documents.rs` 核过），不是我们自己
 * 想象的形状：
 *
 * - `GET  /api/documents?tenantId=&limit=`（回 `{documents:[…]}`）
 * - `POST /api/documents/search`（**不是** GET）⇒ 回**两个数组**
 *   （`{keyword:[…], vector:[…]}` ⇒ ⇒ 两边分数**不可比**）
 * - `POST /api/documents/{tenant}/upload`（**裸字节** body，不是 JSON）
 * - `GET  /api/documents/{tenant}/{id}/content`（**裸字节**回包）
 * - `PATCH /api/documents/{tenant}/{id}`（body **camelCase**）
 * - `DELETE /api/documents/{tenant}/{id}`（回包 **snake_case**）
 *
 * ⚠️ **一半 camelCase、一半 snake_case 是真的** —— 请求侧的结构体写了
 * `rename_all = "camelCase"`，而 `Document` 与 `DeleteDocumentResponse`
 * 没写 ⇒ ⇒ 判据必须把这两个形状**分开钉**，否则改错一边不会红。
 */

// ⚠️ 租户的唯一权威是身份 store（人格）⇒ ⇒ 这里把它钉成一个人格。
vi.mock('../../stores/identityStore', () => ({
  useIdentityStore: {
    getState: () => ({ tenantId: 'persona-test' }),
  },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 一条线上的 `Document`（snake_case）。 */
const wireDocument = {
  id: '22222222-3333-4444-5555-666666666666',
  tenant_id: 'persona-test',
  name: 'notes.md',
  mime: 'text/markdown',
  size: 12,
  blob_key: 'persona-test/22222222-3333-4444-5555-666666666666/notes.md',
  text: 'hello world',
  tags: ['note'],
  source: 'desktop',
  created_at: '2026-11-17T01:02:03Z',
  updated_at: '2026-11-17T01:02:04Z',
  metadata: { kind: 'file', extracted: true, truncated: false },
};

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const bytesResponse = (bytes: Uint8Array, mime = 'application/octet-stream') => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  arrayBuffer: () =>
    Promise.resolve(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    ),
  headers: {
    get: (key: string) =>
      key.toLowerCase() === 'content-type' ? mime : null,
  },
  text: () => Promise.resolve(''),
});

describe('documentsClient —— 文档面端点契约', () => {
  it('列资源走 GET /hippocampus/api/documents，租户在查询串里', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ documents: [wireDocument] }));
    const { documentsClient } = await import('../documentsClient');

    const list = await documentsClient.list({ limit: 5 });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/documents?');
    expect(url).toContain('tenantId=persona-test');
    expect(url).toContain('limit=5');
    expect(init.method).toBe('GET');
    expect(list).toHaveLength(1);
  });

  it('线上的 snake_case 映射成界面形状，metadata 三件事实如实带出来', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ documents: [wireDocument] }));
    const { documentsClient } = await import('../documentsClient');

    const [doc] = await documentsClient.list();

    expect(doc.id).toBe(wireDocument.id);
    expect(doc.tenantId).toBe('persona-test');
    expect(doc.blobKey).toBe(wireDocument.blob_key);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.kind).toBe('file');
    expect(doc.extracted).toBe(true);
    expect(doc.truncated).toBe(false);
  });

  it('metadata 缺形状时不许假装有正文（extracted/truncated 默认假）', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        documents: [{ ...wireDocument, metadata: null }],
      }),
    );
    const { documentsClient } = await import('../documentsClient');

    const [doc] = await documentsClient.list();

    expect(doc.kind).toBe('file');
    expect(doc.extracted).toBe(false);
    expect(doc.truncated).toBe(false);
  });

  it('搜索走 POST /api/documents/search，两个通道分开回', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        keyword: [{ document: wireDocument, score: 3.2, channel: 'keyword' }],
        vector: [],
      }),
    );
    const { documentsClient } = await import('../documentsClient');

    const results = await documentsClient.search('hello', 3);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/documents/search');
    expect(url).not.toContain('/api/documents?');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      query: 'hello',
      limit: 3,
      tenantId: 'persona-test',
    });
    expect(results.keyword).toHaveLength(1);
    expect(results.keyword[0].score).toBe(3.2);
    expect(results.vector).toHaveLength(0);
  });

  it('⚠️ 上传走裸字节（不是 JSON）—— 否则二进制会被存成 Base64', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireDocument));
    const { documentsClient } = await import('../documentsClient');

    const payload = new Uint8Array([1, 2, 3, 255]);
    await documentsClient.upload({
      name: 'blob.bin',
      bytes: payload,
      mime: 'application/octet-stream',
      kind: 'artifact',
      source: 'desktop',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/documents/persona-test/upload');
    expect(url).toContain('name=blob.bin');
    expect(url).toContain('kind=artifact');
    expect(init.method).toBe('POST');
    // ⚠️ body 必须是**字节**，不能是 JSON 字符串
    expect(typeof init.body).not.toBe('string');
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(Array.from(init.body as Uint8Array)).toEqual([1, 2, 3, 255]);
    expect(init.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('上传没有 mime 时用 octet-stream，不许谎称 application/json', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireDocument));
    const { documentsClient } = await import('../documentsClient');

    await documentsClient.upload({
      name: 'blob.bin',
      bytes: new Uint8Array([7]),
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('下载走裸字节（不是 JSON），并带上服务端的 Content-Type', async () => {
    const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch.mockResolvedValue(bytesResponse(payload, 'image/png'));
    const { documentsClient } = await import('../documentsClient');

    const content = await documentsClient.download('doc-1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain(
      '/hippocampus/api/documents/persona-test/doc-1/content',
    );
    expect(init.method).toBe('GET');
    expect(Array.from(content.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(content.mime).toBe('image/png');
  });

  it('改名走 PATCH，请求体是 camelCase（与 Document 自己的 snake_case 不同）', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ ...wireDocument, name: 'renamed.md' }),
    );
    const { documentsClient } = await import('../documentsClient');

    const updated = await documentsClient.update('doc-1', {
      name: 'renamed.md',
      kind: 'artifact',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/documents/persona-test/doc-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({
      name: 'renamed.md',
      kind: 'artifact',
    });
    expect(updated.name).toBe('renamed.md');
  });

  it('⚠️ 删除回包是 snake_case —— bytes_deleted / bytes_error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        deleted: true,
        bytes_deleted: false,
        bytes_error: 'blob delete k: boom',
      }),
    );
    const { documentsClient } = await import('../documentsClient');

    const result = await documentsClient.remove('doc-1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/documents/persona-test/doc-1');
    expect(init.method).toBe('DELETE');
    expect(result.deleted).toBe(true);
    // ⚠️ 字节**没**删掉，理由必须带出来 —— 不许吞掉
    expect(result.bytesDeleted).toBe(false);
    expect(result.bytesError).toBe('blob delete k: boom');
  });

  it('删除成功时 bytes_deleted 为真、bytes_error 为空', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        deleted: true,
        bytes_deleted: true,
        bytes_error: null,
      }),
    );
    const { documentsClient } = await import('../documentsClient');

    const result = await documentsClient.remove('doc-1');

    expect(result.deleted).toBe(true);
    expect(result.bytesDeleted).toBe(true);
    expect(result.bytesError).toBeNull();
  });

  it('非 2xx 抛错并带上状态码与服务端的话', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('the blob store is not configured'),
      json: () => Promise.resolve({}),
    });
    const { documentsClient } = await import('../documentsClient');

    await expect(documentsClient.list()).rejects.toThrow(/503/);
  });

  it('服务端回的不是 JSON（200 + 纯文本）⇒ 说真话，不许抛一句 JS 语法错', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      text: () => Promise.resolve('Storage error: lance scan stream: boom'),
    });
    const { documentsClient } = await import('../documentsClient');

    const err = await documentsClient
      .list()
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(err).toBeTruthy();
    expect(err!.message).toContain('Storage error');
    expect(err!.message).not.toContain('Unexpected token');
  });

  it('地址跟随端脑运行时配置（不是写死的 localhost）', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ documents: [] }));
    const { documentsClient } = await import('../documentsClient');
    const { useTelencephalonStore } = await import(
      '../../stores/telencephalonStore'
    );

    useTelencephalonStore.getState().setBaseUrl('http://10.0.0.9:60080');
    await documentsClient.list();

    const [url] = mockFetch.mock.calls[0];
    expect(
      url.startsWith('http://10.0.0.9:60080/hippocampus/api/documents'),
    ).toBe(true);
  });
});
