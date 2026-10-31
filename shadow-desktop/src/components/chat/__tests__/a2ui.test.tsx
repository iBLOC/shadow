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

    await waitFor(() => expect(screen.getByTestId('a2ui-empty')).toBeInTheDocument());
    expect(screen.getByText('这里能看什么')).toBeInTheDocument();
    expect(screen.queryByTestId('a2ui-error')).not.toBeInTheDocument();
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
