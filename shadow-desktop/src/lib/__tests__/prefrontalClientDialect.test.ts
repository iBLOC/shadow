/**
 * 桌面端 `prefrontalClient` 的**方言** —— 「端脑返裸体」这一层的判据。
 *
 * ⚠️ 这个 client 说的是 **prefrontal 独立仓**时代的方言（`{success,data}` 信封），
 * 而它今天打的是**端脑**（`lib/platform.ts` 自己写着：`prefrontalUrl()` 其实是
 * 端脑的地址）⇒ ⇒ 端脑那边**一律返裸体**
 * ⇒ ⇒ 只认信封 ⇒ ⇒ `env.success` 是 `undefined` ⇒ ⇒ **每一发都抛错**。
 *
 * ⇒ ⇒ 这里钉两件事：
 *   ① 解包**两种都认**（`unwrapEnvelope`）；
 *   ② 这一发递的钥匙**与门形一致**（读门 = 影子锁 ∪ admin；写门 = admin）。
 *
 * 判据源：`telencephalon/src/api/door_policy.txt` ⇒ 读门 = 影子锁 ∪ admin token
 * ⇒ ⇒ 实现 `security/api_key.rs::verify_read_credential`。
 * ⇒ ⇒ 机器闸：`scripts/check-client-dialect.mjs`（形状那一维）。
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const telencephalonState = vi.hoisted(() => ({
  connection: { baseUrl: 'http://localhost:60080', apiKey: 'shadow-key-1' },
}));

const adminState = vi.hoisted(() => ({ token: 'admin-key-1' as string | undefined }));

vi.mock('../platform', () => ({
  isTauri: () => true,
  prefrontalUrl: () => 'http://localhost:60080',
}));

vi.mock('../adminToken', () => ({
  getAdminToken: async () => adminState.token,
  adminHeaders: async () =>
    adminState.token ? { 'X-Admin-Token': adminState.token } : {},
}));

vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: {
    getState: () => ({
      connection: telencephalonState.connection,
      setBaseUrl: (url: string) => { telencephalonState.connection.baseUrl = url; },
    }),
  },
}));

/** 端脑的一条**裸体**响应。 */
function okBody(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** 那一次请求带的两把钥匙（只数那两把）。 */
function credsOf(call: unknown[]): string[] {
  const headers = (call[1] as RequestInit).headers as Record<string, string>;
  return Object.keys(headers)
    .filter((k) => k === 'X-Shadow-Key' || k === 'X-Admin-Token')
    .sort();
}

describe('prefrontalClient 方言（端脑返裸体）', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    telencephalonState.connection.baseUrl = 'http://localhost:60080';
    telencephalonState.connection.apiKey = 'shadow-key-1';
    adminState.token = 'admin-key-1';
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('端脑的裸体对象能被解开（createSession 不再抛）', async () => {
    mockFetch.mockResolvedValue(okBody({
      id: 's1', session_id: 's1', tenant_id: 'default', title: null,
      status: 'active', created_at: '2026-11-01T00:00:00Z', closed_at: null,
    }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    const session = await client.createSession('x');
    expect(session.id).toBe('s1');
  });

  it('端脑的裸体数组能被解开（listSessions 不再抛）', async () => {
    mockFetch.mockResolvedValue(okBody([{ id: 's1' }]));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    const sessions = await client.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('s1');
  });

  it('旧方言的信封仍然认（迁移期两种都能解析）', async () => {
    mockFetch.mockResolvedValue(okBody({ success: true, data: { id: 's2' } }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    const session = await client.createSession('x');
    expect(session.id).toBe('s2');
  });

  it('信封说失败 ⇒ 抛错并把 error 带出来', async () => {
    mockFetch.mockResolvedValue(okBody({ success: false, error: 'boom' }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    await expect(client.createSession('x')).rejects.toThrow('boom');
  });

  it('写面递 admin token（POST /api/sessions 是 admin 门）', async () => {
    mockFetch.mockResolvedValue(okBody({ id: 's1' }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    // ⚠️ 故意用**不带信封解析**的那一发（`deleteProvider`）⇒ ⇒ 这一条只钉
    // 「钥匙对不对」⇒ ⇒ 与「形状对不对」两条判据**互不耦合**（否则一处坏 ⇒ 全红）。
    await client.deleteProvider('openai');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(credsOf(mockFetch.mock.calls[0])).toEqual(['X-Admin-Token']);
  });

  it('读面递影子锁 ∪ admin（读门认两把）', async () => {
    mockFetch.mockResolvedValue(okBody({ id: 's1' }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    // ⚠️ 同样是**不带信封解析**的那一发（`getSession`）⇒ ⇒ 只钉钥匙。
    await client.getSession('s1');
    expect(credsOf(mockFetch.mock.calls[0])).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
  });

  it('拿不到钥匙就不带那个头（绝不塞空串 / 空白值）', async () => {
    adminState.token = undefined;
    telencephalonState.connection.apiKey = '   ';
    mockFetch.mockResolvedValue(okBody({ id: 's1' }));
    const { PrefrontalClient } = await import('../prefrontalClient');
    const client = new PrefrontalClient();
    await client.getSession('s1');
    expect(credsOf(mockFetch.mock.calls[0])).toEqual([]);
  });
});