/**
 * 「**同一张面 ⇒ 同一套凭据、同一结果**」—— 客户端**两发**读 `/models/providers`：
 *
 * * **列表**（设置页）⇒ `telencephalonClient.listProviders()`；
 * * **探针**（判定）⇒ `modelConfigProbe.probeCloudProviders()`。
 *
 * ## 为什么要有这个文件
 *
 * ⚠️ 以前这两发**递的钥匙不一样**：列表递 **shadow ∪ admin**，探针**只递 admin**
 * ⇒ ⇒ 在「客户端手里只有 shadow key」的形态上（独立端脑服务器 + 那台机器
 * 配了 shadow key + 桌面 sidecar 那把 admin token 对不上）
 * ⇒ ⇒ **列表读得到、探针读不到** ⇒ ⇒ 设置页列着供应商、判定却说「问不到端脑」
 * ⇒ ⇒ ⇒ **同一个客户端、同一张面，两处给出互相矛盾的说法**。
 *
 * ⚠️ 而这种矛盾**单测很难发现** —— 两条路各自都绿 ⇒ ⇒ 只能**把它们放在
 * **同一道门前**比** ⇒ ⇒ 那道门就是本文件里的 stub（读门 = shadow ∪ admin）。
 *
 * ## 为什么这里用**真** client + **真** probe（而不是 mock 掉整个 client）
 *
 * ⚠️ mock 掉整个 client ⇒ ⇒ 测的是「**我们以为服务端长什么样**」
 * ⇒ ⇒ 端点拼错 / 形状对不上 / 钥匙没带 ⇒ **一样测不出来**
 * ⇒ ⇒ 失败长得像成功（这正是上面那个 bug 能活下来的原因）。
 * ⇒ ⇒ 所以这里只替换**传输层**（fetch）与**两把钥匙的来源**，
 * ⇒ ⇒ 请求路径 / 请求头 / 解析 / 错误映射**全是生产代码在跑**。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ⚠️ 那把 admin token —— **可变** ⇒ ⇒ 能造出「有 / 没有」两种形态。
const adminState = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('../adminToken', () => ({
  getAdminToken: async () => adminState.token,
  adminHeaders: async () =>
    adminState.token ? { 'X-Admin-Token': adminState.token } : {},
}));

// ⚠️ platform —— 这次**给全**（真 client 会 import 它的 `isTauri`）。
// ⚠️ `prefrontalUrl()` 给一个**故意不同**的地址 ⇒ ⇒ 「这一发到底用的是
// ⚠️ client 的地址、还是 platform 的写死值」这件事**测得出来**。
vi.mock('../platform', () => ({
  isTauri: () => false,
  prefrontalUrl: () => 'http://platform-default.test',
}));

import { telencephalonClient } from '../telencephalonClient';
import { probeCloudProviders } from '../modelConfigProbe';

/**
 * 那道门 —— **照端脑读门的形状实现**（shadow ∪ admin）。
 *
 * ⚠️ 端脑那边：`security::api_key::verify_read_credential` ⇒ 读门 =
 * **shadow ∪ admin** ⇒ ⇒ **有任意一把就放行**，一把都没有 ⇒ 401。
 *
 * ⇒ ⇒ 所以这个 stub 既是「服务端」也是「判据」⇒ ⇒ 两发在它面前的表现
 * ⇒ ⇒ 就是它们在真端脑面前的表现。
 */
function doorFetch() {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const shadow = headers['X-Shadow-Key'];
    const admin = headers['X-Admin-Token'];
    const hasShadow = typeof shadow === 'string' && shadow.length > 0;
    const hasAdmin = typeof admin === 'string' && admin.length > 0;
    if (!hasShadow && !hasAdmin) {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'shadow key required' }),
        text: async () => 'shadow key required',
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as unknown as Response;
  });
}

/** 这一发带的是哪几把钥匙（只数那两把）。 */
function credsOf(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((k) => k === 'X-Shadow-Key' || k === 'X-Admin-Token')
    .sort();
}

/** fetch 的第 n 次调用（URL + 请求头）。 */
function callOf(fetchMock: ReturnType<typeof doorFetch>, n = 0) {
  const call = fetchMock.mock.calls[n];
  return {
    url: String(call?.[0]),
    headers: ((call?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
  };
}

beforeEach(() => {
  adminState.token = undefined;
  telencephalonClient.setApiKey('');
  telencephalonClient.setBaseUrl('http://127.0.0.1:60080');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('读面：列表与探针必须在同一道门前表现一致', () => {
  it('① **只有 shadow key**（没有 admin token）⇒ 两发都过得去', async () => {
    // ⚠️⚠️ 这一条钉的就是**曾经坏掉的那个形态**：
    // 端脑的 admin 面 fail-closed ⇒ 客户端那把 admin token 对不上
    // ⇒ ⇒ 读面只剩 shadow 那把 ⇒ ⇒ 以前：**列表读得到、探针读不到**。
    telencephalonClient.setApiKey('sk-only');
    const fetchMock = doorFetch();
    vi.stubGlobal('fetch', fetchMock);

    const list = await telencephalonClient.listProviders();
    const probe = await probeCloudProviders();

    expect(list).toEqual([]);
    expect(probe).toEqual({ known: true, count: 0 });
  });

  it('② **只有 admin token**（没有 shadow key）⇒ 两发也都过得去', async () => {
    adminState.token = 'admin-only';
    const fetchMock = doorFetch();
    vi.stubGlobal('fetch', fetchMock);

    const list = await telencephalonClient.listProviders();
    const probe = await probeCloudProviders();

    expect(list).toEqual([]);
    expect(probe).toEqual({ known: true, count: 0 });
  });

  it('③ **两把都没有** ⇒ 两发**一起失败** —— 而探针说的是「问不到」，不是「没有」', async () => {
    // ⚠️ 失败**不能长得像成功**：探针这一发失败 ⇒ ⇒ 必须是
    // `known: false`（**问不到**）⇒ ⇒ **不许**是「确认空」（count: 0 + known: true）
    // ⇒ ⇒ 否则用户明明配好了，却被说成「没配模型」。
    const fetchMock = doorFetch();
    vi.stubGlobal('fetch', fetchMock);

    await expect(telencephalonClient.listProviders()).rejects.toThrow();
    await expect(probeCloudProviders()).resolves.toEqual({ known: false, count: 0 });
  });

  it('④ 两发递的是**同一套钥匙**（同一个集合）', async () => {
    // ⚠️ 这一条钉的是**不变量本身**：客户端读同一张面 ⇒ ⇒ 必须递同一套钥匙
    // ⇒ ⇒ 否则就会出现「一处说读到了、另一处说读不到」。
    adminState.token = 'admin-1';
    telencephalonClient.setApiKey('sk-1');
    const fetchMock = doorFetch();
    vi.stubGlobal('fetch', fetchMock);

    await telencephalonClient.listProviders();
    await probeCloudProviders();

    const list = callOf(fetchMock, 0);
    const probe = callOf(fetchMock, 1);
    expect(credsOf(probe.headers)).toEqual(credsOf(list.headers));
    expect(credsOf(list.headers)).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
  });

  it('⑤ 两发打的是**同一个地址**（不是各打各的端脑）', async () => {
    // ⚠️⚠️ 这一条钉的是「**同一张面**」的**后半句**：地址。
    // ⇒ ⇒ 「列表」走 `telencephalonClient.request()` ⇒ ⇒ 打的是 client 的地址
    // ⇒ ⇒ （用户可在设置里改 ⇒ 持久化 ⇒ 重启后复原）
    // ⇒ ⇒ 而探针以前打 `prefrontalUrl()`（**写死** localhost:60080）
    // ⇒ ⇒ ⇒ 用户改过地址之后 ⇒ **列表打新地址、探针打老地址**
    // ⇒ ⇒ ⇒ 于是「列表读到了、探针说问不到」—— 同一个病，换了个面。
    // ⚠️ 先给一把钥匙 ⇒ ⇒ 否则门会先 401 挡下来（那样就比不到地址了）。
    telencephalonClient.setApiKey('sk-1');
    telencephalonClient.setBaseUrl('http://brain.example:7777');
    const fetchMock = doorFetch();
    vi.stubGlobal('fetch', fetchMock);

    await telencephalonClient.listProviders();
    await probeCloudProviders();

    const list = callOf(fetchMock, 0);
    const probe = callOf(fetchMock, 1);
    expect(probe.url).toBe(list.url);
    expect(probe.url).toBe('http://brain.example:7777/models/providers');
  });
});
