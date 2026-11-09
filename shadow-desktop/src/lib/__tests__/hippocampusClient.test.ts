import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
beforeEach(() => {
  // 每个测试前重装（afterEach 清过 ⇒ ⇒ 这里补回来）
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});


/**
 * 海马体端点契约测试。
 *
 * 这些断言锁的是**线上的真实契约**，不是我们自己想象的形状 —— 改之前
 * 先对着 `hippocampus-server/src/handlers.rs` 核一遍：
 *
 * - `GET  /api/memory?dimension=&limit=`（dimension 请求侧**小写**）
 * - `POST /api/search`（**不是** `GET /api/memory/search`）
 * - `POST /api/memory`（body camelCase，dimension 小写）
 * - `PUT  /api/memory/{id}`（只能改 content / dimension）
 * - `DELETE /api/memory/{id}`
 *
 * 响应体是 snake_case、dimension 是 PascalCase、layer 是枚举全名。
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

/** 一条线上的 `Memory`（snake_case + PascalCase dimension + 全名 layer）。 */
const wireMemory = {
  id: '11111111-2222-3333-4444-555555555555',
  uri: 'memory://123',
  content: 'likes dark mode',
  dimension: 'Agent',
  layer: 'L1Overview',
  session_id: 'session-1',
  tenant_id: 'default',
  created_at: '2026-10-29T01:02:03Z',
  updated_at: '2026-10-29T01:02:04Z',
  memory_type: 'Raw',
  metadata: {},
};

describe('hippocampusClient', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('列表走 GET /hippocampus/api/memory，dimension 用小写', async () => {
    mockFetch.mockResolvedValue(jsonResponse([wireMemory]));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.listMemories({ dimension: 'Agent', limit: 5 });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory?');
    expect(url).toContain('dimension=agent');
    expect(url).toContain('limit=5');
    expect(init.method).toBe('GET');
  });

  it('服务端回的不是 JSON（200 + 纯文本）⇒ 说真话，不许抛一句 JS 语法错', async () => {
    // 2026-11-02 实测到的真实形状：海马体存储出错时回 200 + 纯文本。
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.reject(
          new SyntaxError('Unexpected token \'S\', "Storage er"... is not valid JSON'),
        ),
      text: () =>
        Promise.resolve(
          'Storage error: lance scan stream: Invalid user input: Schema error: No field named tenant_id',
        ),
    });
    const { hippocampusClient } = await import('../hippocampusClient');

    const err = await hippocampusClient
      .listMemories()
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(err).toBeTruthy();
    expect(err!.message).toContain('Storage error');
    expect(err!.message).not.toContain('Unexpected token');
  });

  it('搜索走 POST /hippocampus/api/search（不是 GET /api/memory/search）', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.searchMemories('coffee', 3);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/search');
    expect(url).not.toContain('/api/memory/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ query: 'coffee', limit: 3 });
  });

  it('新增记忆 dimension 用小写、字段用 camelCase', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireMemory));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.addMemory({
      uri: 'memory://1',
      content: 'hello',
      dimension: 'Agent',
      sessionId: 'session-9',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      uri: 'memory://1',
      content: 'hello',
      dimension: 'agent',
      sessionId: 'session-9',
    });
  });

  it('更新记忆走 PUT /api/memory/{id}，只带 content/dimension', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireMemory));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.updateMemory('mem-id', { content: 'new' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory/mem-id');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ content: 'new' });
  });

  it('删除记忆走 DELETE /api/memory/{id}', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.deleteMemory('mem-id');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/hippocampus/api/memory/mem-id');
    expect(init.method).toBe('DELETE');
  });

  it('响应字段映射成 UI 形状：snake_case → camelCase，layer 全名 → 简写', async () => {
    mockFetch.mockResolvedValue(jsonResponse([wireMemory]));
    const { hippocampusClient } = await import('../hippocampusClient');

    const [memory] = await hippocampusClient.listMemories();

    expect(memory.id).toBe(wireMemory.id);
    expect(memory.uri).toBe('memory://123');
    expect(memory.content).toBe('likes dark mode');
    expect(memory.dimension).toBe('Agent');
    expect(memory.layer).toBe('L1');
    expect(memory.sessionId).toBe('session-1');
    expect(memory.createdAt).toBeInstanceOf(Date);
    expect(memory.updatedAt).toBeInstanceOf(Date);
  });

  it('layer 认不出来时兜底成 L2', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([{ ...wireMemory, layer: 'SomethingNew' }])
    );
    const { hippocampusClient } = await import('../hippocampusClient');

    const [memory] = await hippocampusClient.listMemories();

    expect(memory.layer).toBe('L2');
  });

  it('非 2xx 抛错并带上状态码', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Invalid dimension'),
      json: () => Promise.resolve({}),
    });
    const { hippocampusClient } = await import('../hippocampusClient');

    await expect(
      hippocampusClient.addMemory({
        uri: 'memory://1',
        content: 'x',
        dimension: 'Agent',
      })
    ).rejects.toThrow(/400/);
  });

  it('地址跟随端脑运行时配置（不是写死的 localhost:8081）', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { hippocampusClient } = await import('../hippocampusClient');
    const { useTelencephalonStore } = await import('../../stores/telencephalonStore');

    useTelencephalonStore.getState().setBaseUrl('http://10.0.0.9:60080');
    await hippocampusClient.listMemories();

    const [url] = mockFetch.mock.calls[0];
    expect(url.startsWith('http://10.0.0.9:60080/hippocampus/api/memory')).toBe(true);
  });

  it('setTenantId 之后读写都带上租户（多灵魂共存的那条轴）', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { hippocampusClient } = await import('../hippocampusClient');

    hippocampusClient.setTenantId('persona-ada');
    await hippocampusClient.listMemories();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('tenantId=persona-ada');
  });

  it('新增记忆时把租户放进 body', async () => {
    mockFetch.mockResolvedValue(jsonResponse(wireMemory));
    const { hippocampusClient } = await import('../hippocampusClient');

    hippocampusClient.setTenantId('persona-ada');
    await hippocampusClient.addMemory({
      uri: 'memory://1',
      content: 'x',
      dimension: 'Agent',
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body).tenantId).toBe('persona-ada');
  });

  it('没有设置人格时不带租户（服务端用默认的 "default"）', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    const { hippocampusClient } = await import('../hippocampusClient');

    await hippocampusClient.listMemories();

    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('tenantId');
  });
});
