/**
 * modelConfigProbe —— 「有没有配好模型」这个判定的**唯一实现**。
 *
 * ## 为什么要有这个文件
 *
 * 这一发判定**决定用户会不会被踢回设置向导**，也决定「供应商列表空着」
 * 到底意味着「没配」还是「读不到」。
 *
 * ⚠️⚠️ 以前同一套判定被抄在**两处**（AppInitializer / ModelOnboardingPage）
 * ⇒ ⇒ 改了一边忘了另一边 ⇒ ⇒ 同一个病、两处症状 ⇒ ⇒ 而用户看到的
 * ⇒ ⇒ 恰恰是**没好的那一处**。现在**一份实现、多处调用**。
 *
 * ⇒ ⇒ 这里把**每一档**都钉死，重点是**「问不到」不许变成「没配」**。
 *
 * ⚠️ 本模块**自己**拥有两张面与凭据（不是形参）⇒ ⇒ 所以这里 mock 掉
 * ⇒ ⇒ platform（两张面）与 adminToken（那把钥匙）⇒ ⇒ 测的就是**真实接线**。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ⚠️ 两张面：端脑面（云供应商）/ neuron 面（本地模型）。
vi.mock('../platform', () => ({
  prefrontalUrl: () => 'http://cortex.test',
  neuronUrl: () => 'http://neuron.test',
}));

// ⚠️ 那把钥匙（admin）—— 有没有都**不影响**判定（没带 ⇒ 401 ⇒ 问不到）。
vi.mock('../adminToken', () => ({
  adminHeaders: async () => ({ 'X-Admin-Token': 'test-token' }),
}));

// ⚠️ 那把 shadow key —— **可变** ⇒ 测试能验「带 / 不带」两种形态。
//
// ⚠️ 这里 mock 掉**整个** client 模块 ⇒ ⇒ 真实的 client（它 import 了
// platform 的 isTauri）**根本不会被加载** ⇒ ⇒ 本文件对 platform 的
// **部分 mock**（只给两张面）不会因此炸掉 ⇒ ⇒ 这正是「模块加载时求值
// = 隐性耦合」那条坑的解法。
const shadowKeyState = vi.hoisted(() => ({ key: undefined as string | undefined }));
vi.mock('../telencephalonClient', () => ({
  telencephalonClient: {
    getApiKey: () => shadowKeyState.key,
  },
}));

import {
  combineModelConfig,
  probeCloudProviders,
  probeLocalModels,
  providerListState,
} from '../modelConfigProbe';

type Reply = { status: number; body?: unknown };

/** 按**完整 URL 片段**回不同的响应。 */
function stubFetch(replies: Array<[string, Reply]>) {
  const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
    const url = String(input);
    const hit = replies.find(([frag]) => url.includes(frag));
    const reply = hit ? hit[1] : { status: 404, body: {} };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  shadowKeyState.key = undefined;
});

describe('combineModelConfig —— 只有「确认没配」才说没配', () => {
  it('① 云那半问到了且有供应商 ⇒ configured', () => {
    expect(
      combineModelConfig({ known: true, count: 2 }, { known: true, available: false }),
    ).toBe('configured');
  });

  it('② 云那半问到了且**确实是空的** ⇒ not-configured', () => {
    expect(
      combineModelConfig({ known: true, count: 0 }, { known: true, available: false }),
    ).toBe('not-configured');
  });

  it('③ 云那半**问不到**（known:false）⇒ unknown —— **不许**说「没配」', () => {
    // ⚠️⚠️ **这一条是整个模块存在的理由**：门一上 ⇒ 401 ⇒ known:false
    // ⇒ ⇒ 而以前这里被折成「没配」⇒ ⇒ 用户明明配好了却被踢回向导。
    expect(
      combineModelConfig({ known: false, count: 0 }, { known: true, available: false }),
    ).toBe('unknown');
    expect(
      combineModelConfig({ known: false, count: 0 }, { known: true, available: false }),
    ).not.toBe('not-configured');
  });

  it('④ 云问不到 + 本地有可用模型 ⇒ configured（本地有也算配好）', () => {
    expect(
      combineModelConfig({ known: false, count: 0 }, { known: true, available: true }),
    ).toBe('configured');
  });

  it('⑤ 云问不到 + 本地那半也读不到 ⇒ 仍是 unknown（本地读不到 ≠ 用户没配）', () => {
    expect(
      combineModelConfig({ known: false, count: 0 }, { known: false, available: false }),
    ).toBe('unknown');
  });
});

describe('probeCloudProviders —— 「问不到」与「确认空」必须分开', () => {
  it('① 200 + 非空数组 ⇒ known:true 且 count 正确', async () => {
    stubFetch([
      ['http://cortex.test/models/providers', { status: 200, body: [{ id: 'a' }, { id: 'b' }] }],
    ]);
    await expect(probeCloudProviders()).resolves.toEqual({ known: true, count: 2 });
  });

  it('② 200 + 空数组 ⇒ known:true, count:0（**确认空**）', async () => {
    stubFetch([['http://cortex.test/models/providers', { status: 200, body: [] }]]);
    await expect(probeCloudProviders()).resolves.toEqual({ known: true, count: 0 });
  });

  it('③ 401（门关着 / 钥匙不对）⇒ known:false（问不到）', async () => {
    stubFetch([['http://cortex.test/models/providers', { status: 401 }]]);
    await expect(probeCloudProviders()).resolves.toEqual({ known: false, count: 0 });
  });

  it('④ 5xx（端脑坏了）⇒ known:false', async () => {
    stubFetch([['http://cortex.test/models/providers', { status: 500 }]]);
    await expect(probeCloudProviders()).resolves.toEqual({ known: false, count: 0 });
  });

  it('⑤ 网络错（端脑没起）⇒ known:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(probeCloudProviders()).resolves.toEqual({ known: false, count: 0 });
  });

  it('⑥ 200 但 body **不是数组** ⇒ known:false（形状不对 ⇒ 不许说「确认空」）', async () => {
    // ⚠️ 端脑回的是 Json<Vec<ProviderView>>（数组）⇒ ⇒ 拿到别的形状
    // ⇒ ⇒ 说明这一发**没问对**（代理的 HTML 错误页 / 版本不匹配）
    // ⇒ ⇒ 归「问不到」⇒ ⇒ 旧写法会把它当成「确认空」⇒ ⇒ 会踢人。
    stubFetch([
      ['http://cortex.test/models/providers', { status: 200, body: { error: 'nope' } }],
    ]);
    await expect(probeCloudProviders()).resolves.toEqual({ known: false, count: 0 });
  });

  it('⑦ 这一发打的是**端脑面**（不是 neuron 面）', async () => {
    const fetchMock = stubFetch([['/models/providers', { status: 200, body: [] }]]);
    await probeCloudProviders();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('http://cortex.test/models/providers'))).toBe(true);
    expect(urls.some((u) => u.startsWith('http://neuron.test'))).toBe(false);
  });
});

describe('probeCloudProviders —— 读面的凭据集合必须与门形一致（读门 = shadow ∪ admin）', () => {
  /** 取出这一发 fetch 的 headers。 */
  function headersOf(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
    const init = fetchMock.mock.calls[0]?.[1] as
      | { headers?: Record<string, string> }
      | undefined;
    return init?.headers ?? {};
  }

  it('① 有 shadow key ⇒ **两把都递**（admin + shadow）', async () => {
    // ⚠️⚠️ 这一条钉的是**同一个病**：以前这一发**只递 admin**
    // ⇒ ⇒ 在「独立端脑服务器 + 那台机器配了 shadow key」那个形态上
    // ⇒ ⇒ 读面只剩 shadow 那把 ⇒ ⇒ **列表读得到、探针读不到**
    // ⇒ ⇒ ⇒ 同一个客户端、同一张面，两处给出互相矛盾的说法。
    shadowKeyState.key = 'shadow-key-123';
    const fetchMock = stubFetch([
      ['/models/providers', { status: 200, body: [{ id: 'a' }] }],
    ]);

    await probeCloudProviders();

    const headers = headersOf(fetchMock);
    expect(headers['X-Admin-Token']).toBe('test-token');
    expect(headers['X-Shadow-Key']).toBe('shadow-key-123');
  });

  it('② 没有 shadow key ⇒ 只递 admin，**绝不塞空串**（空串与空串相等 ⇒ 等于带对了）', async () => {
    shadowKeyState.key = undefined;
    const fetchMock = stubFetch([['/models/providers', { status: 200, body: [] }]]);

    await probeCloudProviders();

    const headers = headersOf(fetchMock);
    expect(headers['X-Admin-Token']).toBe('test-token');
    expect('X-Shadow-Key' in headers).toBe(false);
  });

  it('③ 两把都在 ⇒ 门认哪把都过得去（**不是**二选一）', async () => {
    // ⚠️ 这条钉的是**规则**：读门认 shadow **或** admin ⇒ 两把都递
    // ⇒ ⇒ 才可能在「只有其中一把对得上」的形态下也过得去 ⇒ ⇒
    // ⇒ 「少递一把 ⇒ 被挡」这件事**结构上不可能**发生。
    shadowKeyState.key = 'k';
    const fetchMock = stubFetch([['/models/providers', { status: 200, body: [] }]]);

    await probeCloudProviders();

    const headers = headersOf(fetchMock);
    expect(
      Object.keys(headers).filter((k) => k === 'X-Admin-Token' || k === 'X-Shadow-Key'),
    ).toEqual(expect.arrayContaining(['X-Admin-Token', 'X-Shadow-Key']));
  });
});
describe('probeLocalModels —— 本地那半在 neuron 面', () => {
  it('① 200 + 有 available:true ⇒ available:true', async () => {
    stubFetch([['http://neuron.test/v1/models', { status: 200, body: { data: [{ available: true }] } }]]);
    await expect(probeLocalModels()).resolves.toEqual({ known: true, available: true });
  });

  it('② 200 + 没有可用的 ⇒ available:false（**不是**「用户什么都没配」）', async () => {
    stubFetch([['http://neuron.test/v1/models', { status: 200, body: { data: [{ available: false }] } }]]);
    await expect(probeLocalModels()).resolves.toEqual({ known: true, available: false });
  });

  it('③ 404（打错了面）⇒ known:false', async () => {
    stubFetch([['http://neuron.test/v1/models', { status: 404 }]]);
    await expect(probeLocalModels()).resolves.toEqual({ known: false, available: false });
  });

  it('④ 网络错 ⇒ known:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(probeLocalModels()).resolves.toEqual({ known: false, available: false });
  });

  it('⑤ 这一发打的是 **neuron 面**（端脑面上没有 /v1/models）', async () => {
    const fetchMock = stubFetch([['/v1/models', { status: 200, body: { data: [] } }]]);
    await probeLocalModels();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('http://neuron.test/v1/models'))).toBe(true);
    expect(urls.some((u) => u.startsWith('http://cortex.test'))).toBe(false);
  });
});

describe('providerListState —— 供应商列表的三态', () => {
  it('① 这一发失败了 ⇒ unreadable（**不许**显示成「暂无供应商」）', () => {
    expect(providerListState([], true)).toBe('unreadable');
  });

  it('② providers 为 null ⇒ unreadable', () => {
    expect(providerListState(null, false)).toBe('unreadable');
    expect(providerListState(undefined, false)).toBe('unreadable');
  });

  it('③ 问到了且确实是空的 ⇒ empty（**这一档才**显示「暂无供应商」）', () => {
    expect(providerListState([], false)).toBe('empty');
  });

  it('④ 问到了且有 ⇒ ready', () => {
    expect(providerListState([{ id: 'a' }], false)).toBe('ready');
  });
});
