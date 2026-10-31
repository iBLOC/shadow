// @vitest-environment jsdom
/**
 * `AppInitializer` —— 「有没有配好模型」这个判定。
 *
 * ## 为什么要有这个文件
 *
 * 这一发判定**决定用户会不会被踢回设置向导**，而它的输入有两半：
 *
 * * **云**（`/models/providers`）⇒ 在**端脑面**上 ⇒ 端脑正把它放到
 *   **admin 门**后面 ⇒ **没配 token ⇒ 401** ⇒ 而 **web 部署没有 sidecar
 *   ⇒ 没有 admin token ⇒ 「问不到」是常态**；
 * * **本地**（`/v1/models`）⇒ 在 **neuron 面**上 ⇒ **不在端脑面**。
 *
 * ⚠️⚠️ 以前这两处都打**端脑面**（变量叫 `NEURON_BASE`、内容却是
 * `prefrontalUrl()`）⇒ ⇒ 端脑面上**根本没有** `/v1/models` ⇒ ⇒ 恒 404
 * ⇒ ⇒ `hasLocal` **一直**是 false ⇒ ⇒ 「有没有配好」**完全**取决于云那半
 * ⇒ ⇒ 而云那半一 401 ⇒ ⇒ **必然**把用户踢回向导 ⇒ ⇒
 * ⇒ **用户明明配好了，却被说成「没配模型」** —— 那是「失败长得像成功」。
 *
 * ⇒ ⇒ 这里把三件事钉死：
 * ① **「问不到」≠「没配好」** ⇒ 不踢；
 * ② **「确认没配」** ⇒ 仍然踢（引导不能丢）；
 * ③ **本地模型那一发打的是 neuron 面**（不是端脑面）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

// ⚠️ `vi.mock` 会被 vitest **提升**到 import 之前 ⇒ 下面 import 组件时
// 拿到的就是这些替身。
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/' }),
  Outlet: () => null,
}));

// ⚠️ 两张面用两个**可区分**的地址 ⇒ 测试能一眼看出「那一发打去了哪张面」。
vi.mock('../../lib/platform', () => ({
  isTauri: () => false,
  prefrontalUrl: () => 'http://cortex.test',
  neuronUrl: () => 'http://neuron.test',
}));

import { AppInitializer } from '../AppInitializer';

type Reply = { status: number; body?: unknown };

/**
 * 按**完整 URL**（含主机）回不同的响应。
 *
 * ⚠️⚠️ **为什么必须按主机区分**：第一版只按路径片段匹配
 * （`'/v1/models'`）⇒ ⇒ 「本地模型那一发打去了哪张面」**测不出来**
 * ⇒ ⇒ 断言⑤（云问不到 + 本地有模型 ⇒ 不踢）在**base 打错**时**照样绿**
 * ⇒ ⇒ 断言没有分辨力（这是反向验证当场抓到的）。
 * ⇒ ⇒ 现在：`neuron.test` 的 `/v1/models` 回 200，`cortex.test` 的**同一条
 * 路由**回 404 —— **端脑面上确实没有它**（实测：telencephalon 的 api 目录里
 * 零个 `/v1` 路由；neuron 自己的 router 只在 `build_full_app` 里 merge 到根）。
 */
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

function renderInit() {
  return render(
    <AppInitializer>
      <div data-testid="child" />
    </AppInitializer>
  );
}

/** 等探测跑完（跑完才会把 children 放出来）。 */
async function settled() {
  await waitFor(() => expect(screen.getByTestId('child')).toBeTruthy());
}

beforeEach(() => {
  navigateMock.mockClear();
  fetchMock.mockClear();
  replies = [];
  // 越过「还没走过设置向导」那一关，否则它会先去 /setup 就返回了。
  localStorage.setItem('shadow_setup_complete', '1');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppInitializer —— 「有没有配好模型」', () => {
  it('① 问不到（云那半 401）⇒ **不**把用户踢回 /onboarding', async () => {
    // ⚠️ 这就是**门一上之后 web 部署的常态**：没有 admin token ⇒ 401。
    replies = [
      ['http://cortex.test/models/providers', { status: 401 }],
      ['http://neuron.test/v1/models', { status: 404 }],
    ];
    renderInit();
    await settled();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('①b 端脑没起（fetch 直接抛）⇒ 也是「问不到」⇒ **不**踢', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });
    replies = [['/v1/models', { status: 404 }]];
    renderInit();
    await settled();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('② 确认没配（云 200 且空 + 本地 200 且空）⇒ 仍然踢回 /onboarding（引导不能丢）', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 200, body: [] }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    renderInit();
    await settled();
    expect(navigateMock).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('③ 配好了（云 200 且非空）⇒ 不踢', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 200, body: [{ id: 'p1' }] }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [] } }],
    ];
    renderInit();
    await settled();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('④ 本地模型在 neuron 面（**不是**端脑面）—— 端脑面上没有 /v1/models', async () => {
    replies = [
      ['http://cortex.test/models/providers', { status: 401 }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [{ available: true }] } }],
    ];
    renderInit();
    await settled();

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('http://neuron.test/v1/models'))).toBe(true);
    expect(urls.some((u) => u.startsWith('http://cortex.test/v1/models'))).toBe(false);
    // ⚠️ 云那半打的是**端脑面**（providers 面在端脑上）。
    expect(urls.some((u) => u.startsWith('http://cortex.test/models/providers'))).toBe(true);
  });

  it('⑤ 云问不到、但本地有模型 ⇒ 算「配好了」⇒ 不踢', async () => {
    // ⚠️ 这一条在**修 base 之前**是做不到的：本地那发恒 404 ⇒ hasLocal 恒 false。
    replies = [
      ['http://cortex.test/models/providers', { status: 401 }],
      ['http://neuron.test/v1/models', { status: 200, body: { data: [{ available: true }] } }],
    ];
    renderInit();
    await settled();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding', { replace: true });
  });
});
