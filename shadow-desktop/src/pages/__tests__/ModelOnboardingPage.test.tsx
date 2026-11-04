// @vitest-environment jsdom
/**
 * `ModelOnboardingPage` —— 「这个向导页会不会把**本地明明有模型**的用户卡住」。
 *
 * ## 为什么要有这个文件
 *
 * 这一页是「没配模型」时把人领进来的地方 ⇒ 它自己那两发探测决定了
 * 「谁会被留在这儿」。
 *
 * ⚠️⚠️ **旧代码把本地模型那一发也打到了端脑面**（变量叫 `NEURON_BASE`、
 * 内容却是 `prefrontalUrl()`）⇒ ⇒ 端脑面上**根本没有** `/v1/models`
 * ⇒ ⇒ 恒 404 ⇒ ⇒ `hasLocal` **一直**是 false ⇒ ⇒ ⇒ **本地明明装了模型的
 * 用户，也会被这一页判成「没配模型」并被留在这儿** —— 失败长得像成功。
 *
 * ⇒ ⇒ 这里钉住两件事：
 * ① **本地模型那一发打的是 neuron 面**（不是端脑面）；
 * ② **本地有模型 ⇒ 这一页会放人走**（`navigate('/')`）。
 *
 * ✅ **那个缺口已经补上了（2026-11-01）**：云那半 401（门关着 / 端脑没起）
 * ⇒ ⇒ 这一页现在**说真话**：显示「连不上端脑」⇒ ⇒ **不是**「你没配模型」
 * ⇒ ⇒ ⇒ 判定搬进了 lib/modelConfigProbe.ts（三态的**唯一**实现）
 * ⇒ ⇒ ⇒ 与 AppInitializer 共用 ⇒ ⇒ 改一处两边一起好。
 * ⇒ ⇒ ⇒ 详见下面断言④⑤⑥。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/onboarding' }),
  Outlet: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../lib/platform', () => ({
  isTauri: () => false,
  prefrontalUrl: () => 'http://telencephalon.test',
}));

// ⚠️⚠️ 端脑面的 base 现在取自 **client**（用户可配的地址）—— 这一发与
// 「列表」必须打**同一台**端脑 ⇒ ⇒ 这里把 client 的地址给成 `telencephalon.test`
// ⇒ ⇒ 「两张面用两个**可区分**的地址」这个设计才继续成立。
vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: {
    getBaseUrl: () => 'http://telencephalon.test',
    getApiKey: () => undefined,
    // ⚠️ 本地模型那发走 readHeaders()（门罩整张面）⇒ mock 缺了它
    // ⇒ TypeError 被 catch 吞掉 ⇒ 一发都没发出去 ⇒ 断言全红。
    readHeaders: async () => ({}),
  },
}));

import { ModelOnboardingPage } from '../ModelOnboardingPage';

type Reply = { status: number; body?: unknown };

/** 按**完整 URL**（含主机）回不同的响应 ⇒ 才测得出「打去了哪张面」。 */
let replies: Array<[string, Reply]> = [];

const fetchMock = vi.fn(async (input: unknown) => {
  const url = String(input);
  const hit = replies.find(([frag]) => url.includes(frag));
  const reply = hit ? hit[1] : { status: 404, body: {} };
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    json: async () => reply.body ?? {},
  } as unknown as Response;
});

beforeEach(() => {
  navigateMock.mockClear();
  fetchMock.mockClear();
  replies = [];
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelOnboardingPage —— 探测打去了哪张面', () => {
  it('① 本地模型那一发打的是 **大脑那张面**（neuron 路由由端脑转发）', async () => {
    replies = [
      ['http://telencephalon.test/models/providers', { status: 401 }],
      ['http://telencephalon.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('http://telencephalon.test/v1/models'))).toBe(true);
    expect(urls.some((u) => u.startsWith('http://neuron.test'))).toBe(false);
    expect(urls.some((u) => u.startsWith('http://telencephalon.test/models/providers'))).toBe(true);
  });

  it('② 本地明明有模型 ⇒ 这一页**放人走**（navigate("/")），别把人留在这儿', async () => {
    replies = [
      ['http://telencephalon.test/models/providers', { status: 401 }],
      ['http://telencephalon.test/v1/models', { status: 200, body: { data: [{ available: true }] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('③ 云那半问到了（有供应商）⇒ 也放人走', async () => {
    replies = [
      ['http://telencephalon.test/models/providers', { status: 200, body: [{ id: 'p1' }] }],
      ['http://telencephalon.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  // ⚠️⚠️ 下面三条是**三态**的分辨力：问不到 ≠ 没配。
  it('④ 云那半问不到（401）⇒ 这一页说「连不上端脑」，**不是**「没配模型」', async () => {
    replies = [
      ['http://telencephalon.test/models/providers', { status: 401 }],
      ['http://telencephalon.test/v1/models', { status: 404 }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(screen.getByText('onboarding.unreachableTitle')).toBeTruthy());
    // ⚠️ 「没配模型」那张皮**不许**出现 ⇒ ⇒ 否则用户会去重复配置已经配好的东西。
    expect(screen.queryByText('onboarding.title')).toBeNull();
    // ⚠️ 问不到 ⇒ **不放人走**（也不该断言「你没配」）⇒ ⇒ 用户自己决定去哪儿。
    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('⑤ 云那半**确认**是空的 ⇒ 仍然显示「没配模型」（引导不能丢）', async () => {
    replies = [
      ['http://telencephalon.test/models/providers', { status: 200, body: [] }],
      ['http://telencephalon.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(screen.getByText('onboarding.title')).toBeTruthy());
    expect(screen.queryByText('onboarding.unreachableTitle')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('⑥ 云那半 200 但**形状不对** ⇒ 也是「问不到」（不许说「没配」）', async () => {
    // ⚠️ 端脑回的是数组 ⇒ ⇒ 拿到对象 ⇒ ⇒ 说明没问对 ⇒ ⇒ 归「问不到」。
    replies = [
      ['http://telencephalon.test/models/providers', { status: 200, body: { error: 'nope' } }],
      ['http://telencephalon.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(screen.getByText('onboarding.unreachableTitle')).toBeTruthy());
    expect(screen.queryByText('onboarding.title')).toBeNull();
  });
});
