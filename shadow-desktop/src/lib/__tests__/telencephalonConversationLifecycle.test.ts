/**
 * 桌面端对端脑的「归档 / 删除」两个状态 —— 契约测试。
 *
 * ⚠️ 这组钉的是**请求形状**：打哪条路由、带哪把钥匙、默认列不列归档的。
 * 服务端的真行为由端脑那边的**真 HTTP 复验**负责（telencephalon 仓
 * `src/api/shadow/http_tests.rs`：真的 TCP 监听 + 真的 HTTP 客户端）
 * ⇒ ⇒ 两边各钉自己那一半，谁也不替谁吹。
 *
 * ⚠️ 为什么「写门」那两条必须钉：归档/删除**改状态、删数据** ⇒ ⇒ 端脑把
 * 它们放在**写门（admin token）**后面，而不是读门（影子锁 ∪ admin）
 * ⇒ ⇒ 桌面端递错钥匙 ⇒ 端脑 401 ⇒ ⇒ 界面必须把这句话说出来。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminTokenMock = vi.fn();

vi.mock('../adminToken', () => ({
  getAdminToken: (...args: unknown[]) => getAdminTokenMock(...args),
  // ⚠️ 这里自己实现一遍 adminHeaders（而不是用真身）⇒ ⇒ 这条测试只钉
  // 「客户端会不会带上那把钥匙」，不与 adminToken.ts 的实现绑死
  // （那一份由 adminToken.test.ts 负责）。
  adminHeaders: async () => {
    const token = (await getAdminTokenMock())?.trim();
    return token ? { 'X-Admin-Token': token } : {};
  },
}));

describe('desktop client — conversation archive / delete', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: import('../telencephalonClient').TelencephalonClient;

  beforeEach(async () => {
    getAdminTokenMock.mockReset();
    getAdminTokenMock.mockResolvedValue('the-real-admin-key');
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'c1', archived: false, history: [] }),
    });
    global.fetch = mockFetch;
    const { TelencephalonClient } = await import('../telencephalonClient');
    client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });
  });

  const urlOf = (n = 0): string => mockFetch.mock.calls[n][0] as string;
  const initOf = (n = 0): RequestInit => mockFetch.mock.calls[n][1] as RequestInit;
  const headersOf = (n = 0): Record<string, string> =>
    initOf(n).headers as Record<string, string>;

  it('asks for the live list by default — no archive query at all', async () => {
    await client.listConversations();
    expect(urlOf()).toBe('http://localhost:60080/shadow/v1/conversations');
  });

  it('asks the archive box explicitly', async () => {
    await client.listConversations({ archivedOnly: true });
    expect(urlOf()).toBe(
      'http://localhost:60080/shadow/v1/conversations?archived_only=true',
    );
  });

  it('asks for both when the caller wants both', async () => {
    await client.listConversations({ includeArchived: true });
    expect(urlOf()).toBe(
      'http://localhost:60080/shadow/v1/conversations?include_archived=true',
    );
  });

  it('archives with POST and carries the admin token', async () => {
    await client.archiveConversation('c 1');
    expect(urlOf()).toBe(
      'http://localhost:60080/shadow/v1/conversations/c%201/archive',
    );
    expect(initOf().method).toBe('POST');
    expect(headersOf()['X-Admin-Token']).toBe('the-real-admin-key');
  });

  it('unarchives with POST on /unarchive', async () => {
    await client.unarchiveConversation('c1');
    expect(urlOf()).toBe(
      'http://localhost:60080/shadow/v1/conversations/c1/unarchive',
    );
    expect(initOf().method).toBe('POST');
    expect(headersOf()['X-Admin-Token']).toBe('the-real-admin-key');
  });

  it('deletes with DELETE on the conversation itself', async () => {
    await client.deleteConversation('c1');
    expect(urlOf()).toBe('http://localhost:60080/shadow/v1/conversations/c1');
    expect(initOf().method).toBe('DELETE');
    expect(headersOf()['X-Admin-Token']).toBe('the-real-admin-key');
  });

  it('carries NO admin token when there is none — the door will say why', async () => {
    // ⚠️ 宁可不带（端脑回 401 并说清原因）⇒ ⇒ 也不塞一个空的
    // （空串与空串 ct_eq 相等 ⇒ 等于把门骗开）。
    getAdminTokenMock.mockResolvedValue(undefined);
    await client.archiveConversation('c1');
    expect('X-Admin-Token' in headersOf()).toBe(false);
  });

  it('surfaces the words of the endbrain when the door refuses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () =>
        JSON.stringify({ error: 'telencephalon_door_closed', door: 'admin' }),
    });
    await expect(client.deleteConversation('c1')).rejects.toThrow(/door_closed/);
  });
});
