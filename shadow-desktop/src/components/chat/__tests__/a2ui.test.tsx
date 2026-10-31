// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  A2UI_EXTENSION_URI,
  A2uiSurfaceModel,
  SseDecoder,
  isStructurallyEmptySurface,
  type A2uiPayload,
} from '../../../lib/a2uiProtocol';
import { A2uiHttpError, requestA2uiSurface } from '../../../lib/a2uiClient';
import { A2uiSurface } from '../A2uiSurface';
import { A2uiPanel } from '../A2uiPanel';

/**
 * The desktop is the **third consumer** of the cross-client A2UI contract.
 *
 * The contract lives in `shadow/fixtures/a2ui/`:
 *   - `tasks_sse.txt`      — the exact SSE bytes the brain emits;
 *   - `tasks_surface.json` — the canonical component tree those bytes carry.
 *
 * Mobile (`shadow-mobile/test/widget/a2ui_*_test.dart`) replays the same
 * bytes through the Dart protocol stack. Here the same bytes go through the
 * TypeScript one. If the two implementations ever drift, the fixture stops
 * describing what the brain actually sends — so the fixture is the contract,
 * not a copy of it.
 */
function fixturePath(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'fixtures', 'a2ui', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`A2UI fixture not found: ${name}`);
}

const SSE_FIXTURE = readFileSync(fixturePath('tasks_sse.txt'), 'utf8');
const SURFACE_FIXTURE = JSON.parse(
  readFileSync(fixturePath('tasks_surface.json'), 'utf8'),
) as A2uiPayload[];

/** A response that streams the given text as-is (string chunks, no web APIs). */
function fakeResponse(body: string, status = 200): Response {
  const chunks = [body];
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          releaseLock() {},
        };
      },
    },
  } as unknown as Response;
}

/** Feed the raw SSE bytes through the protocol stack. */
function modelFromSse(text: string): { model: A2uiSurfaceModel; events: number } {
  const model = new A2uiSurfaceModel();
  const decoder = new SseDecoder();
  let events = 0;
  for (const event of decoder.push(text)) {
    events += 1;
    model.applyEvent(JSON.parse(event));
  }
  for (const event of decoder.flush()) {
    events += 1;
    model.applyEvent(JSON.parse(event));
  }
  return { model, events };
}

describe('A2UI protocol — desktop', () => {
  it('frames the shared SSE fixture into exactly two A2A events', () => {
    const { events } = modelFromSse(SSE_FIXTURE);
    expect(events).toBe(2);
  });

  it('parses the shared fixture into the canonical surface', () => {
    const { model } = modelFromSse(SSE_FIXTURE);
    const surface = model.get('shadow.tasks');

    expect(surface).toBeDefined();
    expect(surface?.rendered).toBe(true);
    expect(surface?.rootId).toBe('root');
    expect(surface?.components.map((c) => c.id)).toEqual(['root', 'title', 'task-0']);
  });

  it('agrees with the canonical cross-client component tree', () => {
    // ⚠️ This is the point of the fixture: the bytes on the wire and the
    // canonical tree must describe the same surface. If the desktop's
    // parser drifts from the brain's output, this is where it shows.
    const fromBytes = modelFromSse(SSE_FIXTURE).model.get('shadow.tasks');

    const fromContract = new A2uiSurfaceModel();
    for (const payload of SURFACE_FIXTURE) fromContract.applyPayload(payload);
    const fromTree = fromContract.get('shadow.tasks');

    expect(fromBytes?.components).toEqual(fromTree?.components);
    expect(fromBytes?.rootId).toBe(fromTree?.rootId);
  });

  it('keeps a surface unrenderable until beginRendering arrives', () => {
    // ⚠️ A2UI is two-phase: `surfaceUpdate` only caches the components,
    // `beginRendering` starts the render
    // (`genui-0.7.0/lib/src/core/a2ui_message_processor.dart:160-197`).
    // Rendering on the first phase would show a half-built screen.
    const model = new A2uiSurfaceModel();
    model.applyPayload(SURFACE_FIXTURE[0]);

    expect(model.get('shadow.tasks')?.components).toHaveLength(3);
    expect(model.renderableSurfaces).toHaveLength(0);

    model.applyPayload(SURFACE_FIXTURE[1]);
    expect(model.renderableSurfaces).toHaveLength(1);
  });

  it('drops a surface on deleteSurface', () => {
    const model = new A2uiSurfaceModel();
    for (const payload of SURFACE_FIXTURE) model.applyPayload(payload);
    expect(model.surfaceIds).toContain('shadow.tasks');

    model.applyPayload({ deleteSurface: { surfaceId: 'shadow.tasks' } });
    expect(model.surfaceIds).not.toContain('shadow.tasks');
  });

  it('tells an empty surface from a surface with content', () => {
    // ⚠️ 端脑把「没有内容」画成一个**只有文字**的板子
    // （`telencephalon/src/a2a/a2ui.rs` → `render_tasks` / `render_agents`）
    // ⇒ 「空」在**结构上**可判。
    const emptyModel = new A2uiSurfaceModel();
    emptyModel.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.tasks',
        components: [
          { id: 'root', component: { Column: { children: ['title', 'empty'] } } },
          { id: 'title', component: { Text: { text: { literalString: 'Tasks (0)' } } } },
          {
            id: 'empty',
            component: { Text: { text: { literalString: 'No tasks yet.' } } },
          },
        ],
      },
    });
    emptyModel.applyPayload({ beginRendering: { surfaceId: 'shadow.tasks', root: 'root' } });

    expect(isStructurallyEmptySurface(emptyModel.get('shadow.tasks'))).toBe(true);
    // ⚠️ **有内容的那张不是空的** —— 断言有分辨力，不是恒真。
    expect(
      isStructurallyEmptySurface(modelFromSse(SSE_FIXTURE).model.get('shadow.tasks')),
    ).toBe(false);
  });

  it('never calls a surface with an unknown component type empty', () => {
    // ⚠️ **规则反过来写**（除布局与文字之外的都是内容），而不是认组件名白名单
    // ⇒ 端脑加一种新组件（`Timeline` / `Chart` / …）时，
    // 客户端**不会**把一张有内容的界面说成空的。
    const model = new A2uiSurfaceModel();
    model.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.future',
        components: [
          { id: 'root', component: { Column: { children: ['chart'] } } },
          { id: 'chart', component: { Timeline: { points: [] } } },
        ],
      },
    });
    model.applyPayload({ beginRendering: { surfaceId: 'shadow.future', root: 'root' } });

    expect(isStructurallyEmptySurface(model.get('shadow.future'))).toBe(false);
  });
});

describe('A2UI client — desktop', () => {
  it('posts to /a2a with the shadow key and the A2UI extension header', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return fakeResponse(SSE_FIXTURE);
    });

    const result = await requestA2uiSurface({
      baseUrl: 'http://127.0.0.1:60080',
      apiKey: 'the-real-key',
      view: 'tasks',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:60080/a2a');
    expect(calls[0].init.method).toBe('POST');

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Shadow-Key']).toBe('the-real-key');
    expect(headers['X-A2A-Extensions']).toBe(A2UI_EXTENSION_URI);

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.method).toBe('message/stream');
    // ⚠️ The view must be explicit — keyword matching would be at the mercy
    // of the user's wording (`telencephalon/src/a2a/a2ui.rs` → resolve_view).
    expect(body.params.message.metadata.a2ui.view).toBe('tasks');

    expect(result.model.renderableSurfaces).toHaveLength(1);
  });

  it('asks the brain to speak the user language (Accept-Language)', async () => {
    // ⚠️ The brain draws the screen — *and its words*. The words have
    // to be in the user's language, so the client reports which one
    // it wants; the truth source is the server
    // (`telencephalon/src/a2a/a2ui_i18n.rs`).
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return fakeResponse(SSE_FIXTURE);
    });

    await requestA2uiSurface({
      baseUrl: 'http://127.0.0.1:60080',
      apiKey: 'the-real-key',
      view: 'tasks',
      locale: 'zh-CN',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Accept-Language']).toBe('zh-CN');
  });

  it('omits Accept-Language when nobody asked for a language', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return fakeResponse(SSE_FIXTURE);
    });

    await requestA2uiSurface({
      baseUrl: 'http://127.0.0.1:60080',
      view: 'tasks',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    // ⚠️ No header ⇒ the brain falls back to English — the very same
    // bytes it produced before this feature existed.
    expect(headers['Accept-Language']).toBeUndefined();
  });

  it('omits the shadow key header when the brain runs in dev mode', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return fakeResponse(SSE_FIXTURE);
    });

    await requestA2uiSurface({
      baseUrl: 'http://127.0.0.1:60080',
      view: 'tasks',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    // ⚠️ An *empty* key header is not the same as no header at all.
    expect('X-Shadow-Key' in headers).toBe(false);
  });

  it('raises a typed error when the brain refuses the request', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse('unauthorized', 401));

    await expect(
      requestA2uiSurface({
        baseUrl: 'http://127.0.0.1:60080',
        view: 'tasks',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(A2uiHttpError);
  });
});

describe('A2UI surface renderer — desktop', () => {
  it('renders the task card from the shared fixture', () => {
    const surface = modelFromSse(SSE_FIXTURE).model.get('shadow.tasks');
    render(<A2uiSurface surface={surface!} />);

    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-id', 'shadow.tasks');
    expect(screen.getByText('Tasks (1)')).toBeInTheDocument();

    const card = screen.getByTestId('a2ui-task-card');
    expect(card).toHaveAttribute('data-status', 'in_progress');
    expect(card).toHaveAttribute('data-priority', 'high');
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('本周进展汇总')).toBeInTheDocument();
  });

  it('renders an unknown component type as a placeholder instead of throwing', () => {
    const model = new A2uiSurfaceModel();
    model.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.future',
        components: [
          { id: 'root', component: { SomeFutureWidget: { anything: true } } },
        ],
      },
    });
    model.applyPayload({ beginRendering: { surfaceId: 'shadow.future', root: 'root' } });

    render(<A2uiSurface surface={model.get('shadow.future')!} />);
    expect(screen.getByTestId('a2ui-unknown-component')).toHaveAttribute(
      'data-component-type',
      'SomeFutureWidget',
    );
  });

  it('never paints an unknown agent status as "idle" (unknown ≠ healthy)', () => {
    // ⚠️ 端脑对「从没被探活过的叶区」报 `unknown`
    // （`telencephalon/src/a2a/a2ui.rs` 的 `agent_status`）⇒ 客户端
    // **不许**把它画成 `idle` —— 在手机上是**绿灯**（= 就绪），
    // 而那 4 条占位叶区**从来没被联系过**。
    //
    // ⚠️ 端脑哪天多说一个词（客户端还不认识）⇒ **也不许**落回 idle。
    const model = new A2uiSurfaceModel();
    model.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.agents',
        components: [
          { id: 'root', component: { Column: { children: ['a0', 'a1', 'a2', 'a3'] } } },
          {
            id: 'a0',
            component: {
              AgentStatusIndicator: {
                agentName: 'parietal',
                status: 'unknown',
                message: 'not probed',
              },
            },
          },
          {
            id: 'a1',
            component: { AgentStatusIndicator: { agentName: 'temporal', status: 'brand-new' } },
          },
          {
            id: 'a2',
            component: { AgentStatusIndicator: { agentName: 'frontal', status: 'idle' } },
          },
          {
            // ⚠️ **连 status 都没说** ⇒ 更不许当成「就绪」。
            id: 'a3',
            component: { AgentStatusIndicator: { agentName: 'occipital' } },
          },
        ],
      },
    });
    model.applyPayload({ beginRendering: { surfaceId: 'shadow.agents', root: 'root' } });

    render(<A2uiSurface surface={model.get('shadow.agents')!} />);

    const rows = screen.getAllByTestId('a2ui-agent-status');
    expect(rows).toHaveLength(4);
    const badge = (row: HTMLElement): string => row.querySelector('span')?.className ?? '';

    // `unknown` 有自己的一档（虚线框）⇒ 形状上就与 `idle` 分得开
    expect(rows[0]).toHaveAttribute('data-status', 'unknown');
    expect(badge(rows[0])).toContain('border-dashed');

    // ⚠️ **端脑多说一个词** ⇒ 也不许落回 `idle` 那档
    expect(rows[1]).toHaveAttribute('data-status', 'brand-new');
    expect(badge(rows[1])).toContain('border-dashed');

    // ⚠️ **连 status 都没说** ⇒ 缺省是「不知道」，不是「就绪」
    expect(rows[3]).toHaveAttribute('data-status', 'unknown');
    expect(badge(rows[3])).toContain('border-dashed');

    // `idle` 是另一档（没有虚线）⇒ 上面的断言有分辨力，不是恒真
    expect(rows[2]).toHaveAttribute('data-status', 'idle');
    expect(badge(rows[2])).not.toContain('border-dashed');
  });

  it('renders a component that is referenced twice, twice', () => {
    // ⚠️ The cycle guard must ask "is this an **ancestor** of me?", not
    // "have I seen this id before?" — a "seen" set would silently swallow the
    // second reference and the user would lose part of the screen.
    const model = new A2uiSurfaceModel();
    model.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.shared',
        components: [
          { id: 'root', component: { Column: { children: ['left', 'right'] } } },
          { id: 'left', component: { Column: { children: ['shared'] } } },
          { id: 'right', component: { Column: { children: ['shared'] } } },
          { id: 'shared', component: { Text: { text: { literalString: 'shared' } } } },
        ],
      },
    });
    model.applyPayload({ beginRendering: { surfaceId: 'shadow.shared', root: 'root' } });

    render(<A2uiSurface surface={model.get('shadow.shared')!} />);
    expect(screen.getAllByText('shared')).toHaveLength(2);
  });

  it('stops at a component that references itself instead of looping forever', () => {
    const model = new A2uiSurfaceModel();
    model.applyPayload({
      surfaceUpdate: {
        surfaceId: 'shadow.cycle',
        components: [
          { id: 'root', component: { Column: { children: ['root'] } } },
        ],
      },
    });
    model.applyPayload({ beginRendering: { surfaceId: 'shadow.cycle', root: 'root' } });

    render(<A2uiSurface surface={model.get('shadow.cycle')!} />);
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute(
      'data-surface-id',
      'shadow.cycle',
    );
  });
});

describe('A2UI panel — desktop', () => {
  it('renders the surface end-to-end from the shared fixture bytes', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(SSE_FIXTURE));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        apiKey="the-real-key"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('tells the brain which language the interface is in', async () => {
    // ⚠️ The panel is the one that knows the app language
    // (i18next) ⇒ it has to hand it to the client, or the brain
    // keeps answering in English.
    const calls: Array<{ init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      calls.push({ init });
      return fakeResponse(SSE_FIXTURE);
    });

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        apiKey="the-real-key"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    const headers = calls[0].init.headers as Record<string, string>;
    // `tests/setup.ts` mocks react-i18next with `i18n: { language: 'en' }`.
    expect(headers['Accept-Language']).toBe('en');
  });

  it("shows the brain's plain-text answer when there is no view to draw", async () => {
    // ⚠️ The brain answers a request it cannot render with plain text, not an
    // error (`telencephalon/src/api/a2ui_gateway.rs` → text_reply). Showing
    // "no data" instead would hide the brain's actual answer.
    const textReply =
      'data: {"result":{"kind":"task-status-update","status":{"state":"completed","message":{"kind":"message","role":"agent","parts":[{"kind":"text","text":"这里能看什么"}]}},"final":true}}\n\n';
    const fetchImpl = vi.fn(async () => fakeResponse(textReply));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    // ⚠️ **纯文本是它自己的一档** —— 不再与「什么都没有」并成一种。
    await waitFor(() => expect(screen.getByTestId('a2ui-text')).toBeInTheDocument());
    expect(screen.getByText('这里能看什么')).toBeInTheDocument();
    expect(screen.queryByTestId('a2ui-error')).not.toBeInTheDocument();
    // ⚠️ **不许再压一句「暂无数据」** —— 端脑明明说了话（"这里能看什么"）。
    // 旧版把这两种并成一种 ⇒ 纯文本时先显示「暂无数据」⇒ **假话**。
    // （`tests/setup.ts` 把 `t(key)` mock 成返回 key 本身。）
    expect(screen.queryByText('common.noData')).not.toBeInTheDocument();
  });

  it('says "no data" only when the brain said nothing at all', async () => {
    // ⚠️ 「暂无数据」**只**属于这一档 —— 端脑连一句话都没说。
    const fetchImpl = vi.fn(async () => fakeResponse(''));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-empty')).toBeInTheDocument());
    expect(screen.getByText('common.noData')).toBeInTheDocument();
    // ⚠️ 这一档**不是**「纯文本」⇒ 断言有分辨力，不是恒绿。
    expect(screen.queryByTestId('a2ui-text')).not.toBeInTheDocument();
  });

  it('tells an empty surface apart from a surface with content', async () => {
    // ⚠️ 端脑把「没有任务」画成一个**只有文字**的板子
    // （`telencephalon/src/a2a/a2ui.rs` → `render_tasks`：列表为空时
    // 产出 `root`(Column) + `title`(Text) + `empty`(Text)）
    // ⇒ 「空」在**结构上**就是可判的。
    const emptySurfaceSse =
      'data: {"result":{"kind":"task-status-update","status":{"state":"working","message":{"kind":"message","role":"agent","parts":[{"kind":"data","data":{"surfaceUpdate":{"surfaceId":"shadow.tasks","components":[{"id":"root","component":{"Column":{"children":["title","empty"],"alignment":"stretch"}}},{"id":"title","component":{"Text":{"text":{"literalString":"Tasks (0)"},"usageHint":"h3"}}},{"id":"empty","component":{"Text":{"text":{"literalString":"No tasks yet."}}}}]}}}]}},"final":false}}\n\n' +
      'data: {"result":{"kind":"task-status-update","status":{"state":"completed","message":{"kind":"message","role":"agent","parts":[{"kind":"data","data":{"beginRendering":{"surfaceId":"shadow.tasks","root":"root"}}}]}},"final":true}}\n\n';

    const fetchImpl = vi.fn(async () => fakeResponse(emptySurfaceSse));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    // ⚠️ **空**这件事在 DOM 上是**可判的**（不靠眼力）。
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-empty', 'true');
    // 端脑**自己**在空 surface 里说了实话 ⇒ 客户端**不再补一句**概括。
    expect(screen.getByText('Tasks (0)')).toBeInTheDocument();
    expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
    expect(screen.queryByText('common.noData')).not.toBeInTheDocument();
  });

  it('marks a surface with content as not empty', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(SSE_FIXTURE));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    // ⚠️ 断言有分辨力：同一块 DOM，同一个属性，两种取值。
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-empty', 'false');
  });

  it('shows an error when the brain refuses the request', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse('unauthorized', 401));

    render(
      <A2uiPanel
        baseUrl="http://127.0.0.1:60080"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('a2ui-error')).toBeInTheDocument());
    expect(screen.queryByTestId('a2ui-surface')).not.toBeInTheDocument();
  });
});
