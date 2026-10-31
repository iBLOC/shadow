// @vitest-environment jsdom
/**
 * A2UI —— **对着一个活的端脑**跑一遍。
 *
 * ## 为什么要有这个文件
 *
 * `a2ui.test.tsx` 喂的是**录下来的字节**（`fixtures/a2ui/tasks_sse.txt`）。
 * 录下来的字节只能证明「协议解析对不对」⇒ **证明不了**：
 *
 *   ① 端脑**真的**在 `POST /a2a` 上吐这个形状（不是我们以为的形状）；
 *   ② 端脑的 `/a2a` **真的**在 shadow key 后面（不是「应该」在）；
 *   ③ 两段式语义（`surfaceUpdate` 先、`beginRendering` 后）在**活的**流里成立；
 *   ④ 面板把**活的**字节画成 DOM。
 *
 * ⇒ 这个文件补的就是 ㊼ 条 ⑦ 说的那句「还差的是『桌面客户端真的把界面画出来』
 * 那段运行时证据」。
 *
 * ## 怎么跑
 *
 * 先起一台端脑（`telencephalon::api::build_full_app` 那张面，**带 shadow key**），
 * 然后：
 *
 * ```powershell
 * $env:A2UI_LIVE_URL         = 'http://127.0.0.1:60080'
 * $env:A2UI_LIVE_KEY         = '<shadow key>'
 * $env:A2UI_LIVE_ADMIN_TOKEN = '<admin token>'   # 建任务用
 * pnpm vitest run src/components/chat/__tests__/a2ui.live.test.tsx
 * ```
 *
 * ⚠️ **没设这些环境变量就整组跳过** ⇒ 常规 `vitest run` 不受影响
 * （不许让「端脑没起」变成一条红）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { A2uiHttpError, requestA2uiSurface } from '../../../lib/a2uiClient';
import { A2uiPanel } from '../A2uiPanel';

const LIVE_URL = process.env.A2UI_LIVE_URL;
const LIVE_KEY = process.env.A2UI_LIVE_KEY;
const LIVE_ADMIN = process.env.A2UI_LIVE_ADMIN_TOKEN;

const live = Boolean(LIVE_URL && LIVE_KEY && LIVE_ADMIN);

/**
 * 丢掉 `signal` 的 fetch 适配器。
 *
 * ⚠️ **为什么必须丢**：jsdom 的 `AbortSignal` 与 undici 的**不是同一个类**
 * ⇒ undici 直接拒收：`RequestInit: Expected signal ("AbortSignal {}") to be
 * an instance of AbortSignal.`
 * ⇒ 而 `A2uiPanel` 内部**自己**建了一个 `AbortController` 交给请求 ⇒
 * 在 jsdom 下，面板对**真端脑**的每一次请求都会当场失败。
 *
 * ⚠️ 这个坑仓库里早就记过：`vitest.config.ts` 的注释里写着，
 * `tests/api-contract/**` 那个真实 HTTP 探测套件在 jsdom 下
 * 「每一条探测都像够不着 ⇒ 整个套件静默退化成空跑」。
 * ⇒ 它自己的解法是**换到 node 环境**（`vitest.api.config.ts`）。
 *
 * 这里不换环境（要渲染 React），而是**把 signal 丢掉**：这条测试要验的是
 * 「线缆格式 + 渲染」，不是「能不能中断一个请求」。
 */
const fetchWithoutSignal: typeof fetch = (input, init) => {
  const { signal: _signal, ...rest } = init ?? {};
  return fetch(input, rest);
};

/** 建一条**本次运行独有**的任务 —— 断言才能精确到「画出来的是我建的那条」。 */
async function createProbeTask(title: string): Promise<void> {
  const resp = await fetch(`${LIVE_URL!.replace(/\/+$/, '')}/api/telencephalon/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': LIVE_ADMIN! },
    body: JSON.stringify({
      title,
      description: '这条任务是活体联调测试建的',
      priority: 'high',
      tags: ['a2ui-live'],
    }),
  });
  if (!resp.ok) {
    throw new Error(`建任务失败：HTTP ${resp.status} ${await resp.text().catch(() => '')}`);
  }
}

describe.skipIf(!live)('A2UI — 对着活的端脑（live）', () => {
  it('端脑真的在 /a2a 上吐 surfaceUpdate + beginRendering（两段式）', async () => {
    const title = `活体联调任务 ${Date.now()}`;
    await createProbeTask(title);

    const result = await requestA2uiSurface({
      baseUrl: LIVE_URL!,
      apiKey: LIVE_KEY!,
      view: 'tasks',
    });

    // ⚠️ 协议层没有报过错 ⇒ 端脑发的东西是我们**认识**的形状
    expect(result.errors).toEqual([]);

    // 两段式：`beginRendering` 到了 ⇒ 才有可渲染的 surface
    const renderable = result.model.renderableSurfaces;
    expect(renderable).toHaveLength(1);

    const surface = result.model.get('shadow.tasks');
    expect(surface?.rendered).toBe(true);
    expect(surface?.rootId).toBe('root');

    // ⚠️ 画出来的是**活的数据**，不是录下来的字节
    //
    // ⚠️ 而且**不能**按位置取第一张卡：端脑的排序是
    // （状态 → 优先级 → **标题字典序**）(`telencephalon/src/a2a/a2ui.rs`
    // → `render_tasks` / `status_rank`) ⇒ 第一张卡**不是**最新的那条
    // ⇒ 断言必须按**标题**找，不能按下标找。
    const titles = (surface?.components ?? [])
      .filter((c) => 'TaskCard' in c.component)
      .map((c) => (c.component.TaskCard as { title?: string }).title);
    expect(titles).toContain(title);
  });

  it('agents 视图也是活的（端脑自己的叶区就在那儿）', async () => {
    // ⚠️ 端脑启动时**自己**注册原生叶区（temporal / parietal / occipital /
    // memory / prefrontal —— `telencephalon/src/api/lobe_register.rs` 的模块注释）
    // ⇒ 不需要外部注册就能验到第二个视图、第四种组件（`AgentStatusIndicator`）。
    const result = await requestA2uiSurface({
      baseUrl: LIVE_URL!,
      apiKey: LIVE_KEY!,
      view: 'agents',
    });

    expect(result.errors).toEqual([]);

    const surface = result.model.get('shadow.agents');
    expect(surface?.rendered).toBe(true);
    expect(surface?.rootId).toBe('root');

    const names = (surface?.components ?? [])
      .filter((c) => 'AgentStatusIndicator' in c.component)
      .map((c) => (c.component.AgentStatusIndicator as { agentName?: string }).agentName);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toBeTruthy();
  });

  it('活的端脑把 /a2a 挡在 shadow key 后面（没钥匙 ⇒ 401）', async () => {
    // ⚠️ 这一条是**安全断言**，不是「端点存在」——
    // 录下来的字节永远验不到它（fixture 是带钥匙的请求录的）。
    await expect(
      requestA2uiSurface({ baseUrl: LIVE_URL!, view: 'tasks' }),
    ).rejects.toBeInstanceOf(A2uiHttpError);

    const error = await requestA2uiSurface({ baseUrl: LIVE_URL!, view: 'tasks' }).catch(
      (e: unknown) => e as A2uiHttpError,
    );
    expect((error as A2uiHttpError).status).toBe(401);
  });

  it('面板把活的字节画成 DOM（界面上真的看得到那条任务）', async () => {
    const title = `活体渲染任务 ${Date.now()}`;
    await createProbeTask(title);

    render(
      <A2uiPanel
        baseUrl={LIVE_URL!}
        apiKey={LIVE_KEY!}
        view="tasks"
        fetchImpl={fetchWithoutSignal}
      />,
    );

    await waitFor(
      () => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute(
      'data-surface-id',
      'shadow.tasks',
    );
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
