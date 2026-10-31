/**
 * 桌面端的 admin 请求**必须真的带上那把钥匙**。
 *
 * ⚠️ 端脑原来有一条后门：`verify_admin_token` 里
 * `if expected == "dev-admin-key" { return Ok(()); }` ⇒ expected 恰好是那个
 * **源码里的字面量**时，**连请求头都不看**就放行 ⇒ 而桌面端递进去的
 * expected **恰好就是**它 ⇒ ⇒ 桌面端的 admin 面**任何请求都过**
 * ⇒ 再叠加端脑面的 `CorsLayer::permissive()` ⇒ ⇒ **浏览器里任意一个网站**
 * 都能往用户的大脑里插一个它自己写的叶区。
 *
 * ⇒ 这一组钉两件事：
 * ① **带上了**（有钥匙 ⇒ `X-Admin-Token` 在请求头上）；
 * ② **没有就不带**（⚠️ 不塞占位值 —— 空的 `X-Admin-Token` 在旧实现里与
 *    空串 `ct_eq` 相等 ⇒ **等于带对了** ⇒ 手机上整个 admin 面就是这么
 *    开着的 ⇒ 宁可不带，端脑回 401 且说人话）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminTokenMock = vi.fn();

vi.mock('../adminToken', () => ({
  getAdminToken: (...args: unknown[]) => getAdminTokenMock(...args),
}));

describe('telencephalonClient admin auth', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: import('../telencephalonClient').TelencephalonClient;

  beforeEach(async () => {
    getAdminTokenMock.mockReset();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, entries: [] }),
    });
    global.fetch = mockFetch;
    const { TelencephalonClient } = await import('../telencephalonClient');
    client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });
  });

  const headersOf = (call = 0): Record<string, string> =>
    (mockFetch.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

  it('carries X-Admin-Token on an admin route', async () => {
    getAdminTokenMock.mockResolvedValue('the-real-key');

    await client.listInstalledWasm();

    expect(headersOf()['X-Admin-Token']).toBe('the-real-key');
  });

  it('carries NO X-Admin-Token header at all when there is no key', async () => {
    getAdminTokenMock.mockResolvedValue(undefined);

    await client.listInstalledWasm();

    expect('X-Admin-Token' in headersOf()).toBe(false);
  });

  it('carries NO X-Admin-Token header when the key is blank', async () => {
    // ⚠️ 空的 `X-Admin-Token:` 头在旧实现里与空串 `ct_eq` 相等 ⇒ **过**
    // ⇒ ⇒ 空白值必须被当成「没有钥匙」，而不是被发出去。
    getAdminTokenMock.mockResolvedValue('   ');

    await client.listInstalledWasm();

    expect('X-Admin-Token' in headersOf()).toBe(false);
  });

  it('keeps the shadow key and the admin token as two separate headers', async () => {
    // 两把钥匙两个域：shadow key（门闩）/ admin token（凭据）⇒ 不能互相顶替。
    // ⚠️ 用**构造函数**传 shadow key（`setApiKey` 是另一台会话在飞的方法
    // ⇒ 依赖它 ⇒ 这条测试就会在对方提交前一直红 ⇒ 不该有那种依赖）。
    getAdminTokenMock.mockResolvedValue('the-real-admin-key');
    const { TelencephalonClient } = await import('../telencephalonClient');
    const withShadowKey = new TelencephalonClient({
      baseUrl: 'http://localhost:60080',
      apiKey: 'the-real-shadow-key',
    });

    await withShadowKey.listInstalledWasm();

    const headers = headersOf();
    expect(headers['X-Shadow-Key']).toBe('the-real-shadow-key');
    expect(headers['X-Admin-Token']).toBe('the-real-admin-key');
  });
});
