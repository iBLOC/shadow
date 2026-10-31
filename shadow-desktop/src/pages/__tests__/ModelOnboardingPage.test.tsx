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
 * ⚠️ **已知缺口（不在这个文件里）**：云那半 401（端脑把 providers 面放到
 * admin 门后面、而 web 部署没有 admin token）⇒ 这一页会说「没配模型」。
 * ⇒ ⇒ 那需要**三态 + 一句新文案** ⇒ 而 i18n 文件**正被另一个会话在飞**
 * ⇒ ⇒ ⇒ 故不在此处改动（见 AGENTS.md）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

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
  prefrontalUrl: () => 'http://cortex.test',
  neuronUrl: () => 'http://neuron.test',
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
  it('① 本地模型那一发打的是 **neuron 面**（端脑面上没有 /v1/models）', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 401 }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('http://neuron.test/v1/models'))).toBe(true);
    expect(urls.some((u) => u.startsWith('http://cortex.test/v1/models'))).toBe(false);
    expect(urls.some((u) => u.startsWith('http://cortex.test/models/providers'))).toBe(true);
  });

  it('② 本地明明有模型 ⇒ 这一页**放人走**（navigate("/")），别把人留在这儿', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 401 }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [{ available: true }] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('③ 云那半问到了（有供应商）⇒ 也放人走', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 200, body: [{ id: 'p1' }] }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    render(<ModelOnboardingPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });
});
