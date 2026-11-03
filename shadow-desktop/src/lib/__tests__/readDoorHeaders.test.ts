/**
 * 「读面的凭据集合必须与门形一致」—— 桌面端这一侧的**判据**。
 *
 * ⚠️ 门形（判据源 `telencephalon/src/api/door_policy.txt`）：读门 =
 * **影子锁 ∪ admin token**（任一把就开 ⇒ 实现
 * `security/api_key.rs::verify_read_credential`）。
 *
 * ⇒ 客户端读面必须递**它手里有的全部钥匙** ⇒ 只递一把 ⇒ 在「那台端脑只认
 * 另一把」时 ⇒ **401** ⇒ 而同一张面的另一发读得到 ⇒ 「列表读得到、状态页
 * 读不到」。
 *
 * ⚠️ 两条不许省的纪律：
 * ① **拿不到就不带那个头** —— 空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开；
 * ② **空白值在 JS 里是 truthy**（`'   '`）⇒ ⇒ 必须 trim。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const adminState = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('../adminToken', () => ({
  getAdminToken: async () => adminState.token,
  adminHeaders: async () =>
    adminState.token ? { 'X-Admin-Token': adminState.token } : {},
}));

// ⚠️ platform —— client 会 import 它的 `isTauri`（health 的 Tauri 分支要真）。
vi.mock('../platform', () => ({
  isTauri: () => true,
  prefrontalUrl: () => 'http://telencephalon.test',
}));

import { readDoorHeaders } from '../readDoorHeaders';
import { telencephalonClient } from '../telencephalonClient';

/** 请求头里那两把钥匙（只数那两把）。 */
function credsOf(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((k) => k === 'X-Shadow-Key' || k === 'X-Admin-Token')
    .sort();
}

/** 某一次 fetch 带的头。 */
function headersOf(fetchMock: ReturnType<typeof vi.fn>, n = 0): Record<string, string> {
  const init = fetchMock.mock.calls[n]?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  adminState.token = undefined;
  telencephalonClient.setApiKey('');
  telencephalonClient.setBaseUrl('http://telencephalon.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('读门的凭据集合（= 门形）', () => {
  it('① 两把都在 ⇒ 两把都递', async () => {
    adminState.token = 'admin-1';
    const h = await readDoorHeaders('sk-1');
    expect(credsOf(h)).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
    expect(h['X-Shadow-Key']).toBe('sk-1');
    expect(h['X-Admin-Token']).toBe('admin-1');
  });

  it('② 只有影子锁 ⇒ 不许带一个空的 X-Admin-Token 头', async () => {
    const h = await readDoorHeaders('sk-1');
    expect(credsOf(h)).toEqual(['X-Shadow-Key']);
  });

  it('③ 只有 admin token ⇒ 不许带一个空的 X-Shadow-Key 头', async () => {
    adminState.token = 'admin-1';
    const h = await readDoorHeaders(undefined);
    expect(credsOf(h)).toEqual(['X-Admin-Token']);
  });

  it('④ 一把都没有 ⇒ 一个凭据头都不许有', async () => {
    const h = await readDoorHeaders('');
    expect(credsOf(h)).toEqual([]);
  });

  it('⑤ 空白值当作没有（JS 里空白串是 truthy）', async () => {
    adminState.token = '   ';
    const h = await readDoorHeaders('   ');
    expect(credsOf(h)).toEqual([]);
  });

  it('⑥ client 的 health（读面）递两把', async () => {
    adminState.token = 'admin-1';
    telencephalonClient.setApiKey('sk-1');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', addr: 'x' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await telencephalonClient.health();

    expect(credsOf(headersOf(fetchMock))).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
  });

  it('⑦ client 的 request()（读面）递两把', async () => {
    adminState.token = 'admin-1';
    telencephalonClient.setApiKey('sk-1');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await telencephalonClient.listProviders();

    expect(credsOf(headersOf(fetchMock))).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
  });
});
