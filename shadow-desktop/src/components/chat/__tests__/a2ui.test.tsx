// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  A2UI_EXTENSION_URI,
  BASIC_CATALOG_ID,
  SHADOW_CATALOG_ID,
  SseDecoder,
  buildA2uiSurface,
  buildSurfaceFromEvents,
  extractA2uiMessages,
  extractTextParts,
  hasRenderableContent,
  isStructurallyEmptySurface,
  isValidComponentId,
  unknownComponentsOf,
  type A2uiMessage,
} from '../../../lib/a2uiProtocol';
import { A2uiHttpError, requestA2uiSurface } from '../../../lib/a2uiClient';
import { A2uiSurface } from '../A2uiSurface';

/**
 * 桌面端是 A2UI 跨端契约的**第三个消费者**。
 *
 * 契约住在 `shadow/fixtures/a2ui/` 里：
 *   - `tasks_sse.txt`      —— 端脑吐的 SSE 字节（**v1.0**）；
 *   - `tasks_surface.json` —— 那些字节携带的标准组件树。
 *
 * 移动端重放**同一份字节** ⇒ ⇒ 两端吃的是同一份东西。
 *
 * ⚠️ **这一份判据钉的是「官方 SDK 真的吃懂了端脑的字节」** ——
 * 协议层已经不是桌面端自己写的了（@a2ui/web_core 0.15.0）。
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

/** fixture 里的事件对象（逐条）。 */
function fixtureEvents(): unknown[] {
  const out: unknown[] = [];
  for (const line of SSE_FIXTURE.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    out.push(JSON.parse(trimmed.slice('data:'.length).trim()));
  }
  return out;
}

/**
 * 把 v1.0 消息包成一条 A2A 事件。
 *
 * ⚠️ **parts[].data 是对象**（官方 v1.0 的要求）—— 写成 JSON 字符串的话
 * 客户端会**整条跳过** ⇒ 界面上什么都不出来且**不报错**（踩过的坑）。
 */
function a2aEvent(message: A2uiMessage): unknown {
  return {
    result: {
      kind: 'task-status-update',
      status: {
        state: 'completed',
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'data', data: message }],
        },
      },
      final: true,
    },
  };
}

/**
 * 一条端脑形状的 v1.0 任务面板消息。
 *
 * ⚠️ **组件 id 用 task0 这种形状** —— v1.0 的组件 id 必须是合法 UAX #31
 * 标识符（官方 TS 与 Dart SDK 同规则）⇒ **连字符不合法**
 * ⇒ ⇒ 不合法 ⇒ 整条消息被拒 ⇒ 界面上一个面都没有。
 */
function tasksMessage(
  overrides: Partial<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
  }> = {},
): A2uiMessage {
  const id = overrides.id ?? 'task0';
  return {
    version: '1.0',
    createSurface: {
      surfaceId: 'shadow.tasks',
      catalogId: BASIC_CATALOG_ID,
      components: [
        { id: 'root', component: 'Column', children: ['title', id] },
        { id: 'title', component: 'Text', text: '# Tasks (1)' },
        {
          id,
          component: 'TaskCard',
          // ⚠️ 端脑写的就是官方 v1.0 的键名（**无 @**）⇒ 客户端原样透传。
          catalogId: SHADOW_CATALOG_ID,
          title: overrides.title ?? '写周报',
          description: overrides.description ?? '本周进展汇总',
          status: overrides.status ?? 'in_progress',
          priority: overrides.priority ?? 'high',
        },
      ],
    },
  };
}

/** 一条端脑形状的 v1.0 消息（**SSE 字节**，可直接当响应体）。 */
function tasksSse(message: A2uiMessage = tasksMessage()): string {
  return `data: ${JSON.stringify(a2aEvent(message))}\n\n`;
}

/** fixture 里的组件 id（用来核对端脑那一侧有没有守 UAX #31）。 */
function fixtureComponentIds(): string[] {
  const messages = extractA2uiMessages(fixtureEvents()[0]);
  const section = messages[0]?.createSurface as
    | { components: Record<string, unknown>[] }
    | undefined;
  return (section?.components ?? [])
    .map((component) => component.id)
    .filter((id): id is string => typeof id === 'string');
}

describe('A2UI 协议 — 桌面端（官方 SDK）', () => {
  it('把端脑的 SSE 字节切成 A2A 事件', () => {
    const decoder = new SseDecoder();
    const events = [...decoder.push(SSE_FIXTURE), ...decoder.flush()];
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]).result.kind).toBe('task-status-update');
  });

  it('从 A2A 事件里挖出 **v1.0 消息**（载荷在 parts[].data 里是**对象**）', () => {
    const messages = extractA2uiMessages(fixtureEvents()[0]);
    expect(messages).toHaveLength(1);
    expect(messages[0].version).toBe('1.0');
    const section = messages[0].createSurface as { surfaceId: string; components: unknown[] };
    expect(section.surfaceId).toBe('shadow.tasks');
    expect(section.components).toHaveLength(3);
  });

  it('**端脑发的就是 catalogId，客户端原样交给官方 SDK**（客户端不做协议翻译）', () => {
    // ⚠️ 官方 v1.0 的组件目录键是 catalogId（**无 @**）⇒ 端脑发的就是它
    // ⇒ ⇒ 客户端**一个字都不改** ⇒ ⇒ 目录解析由官方 SDK 做。
    const messages = extractA2uiMessages(fixtureEvents()[0]);
    const section = messages[0].createSurface as {
      components: Record<string, unknown>[];
    };
    const card = section.components.find((c) => c.component === 'TaskCard');
    expect(card?.catalogId).toBe(SHADOW_CATALOG_ID);
    // ⚠️ 客户端**不**认识、也**不**发明别的键名。
    expect(Object.keys(card ?? {}).sort()).toEqual(
      ['catalogId', 'component', 'description', 'id', 'priority', 'status', 'title'].sort(),
    );
  });

  it('**共享 fixture 的字节 ⇒ 官方 SDK 的判决与它的 UAX #31 规则一致**', () => {
    // ⚠️ 这一条钉的是「共享契约」：端脑发的字节 ⇒ 官方 SDK 按**它自己的规则**
    // 判决（组件 id 不合法 ⇒ 整条消息被拒 ⇒ 界面上一个面都没有）。
    // ⚠️ 桌面端**不**替端脑改 id（那才是协议翻译层）。
    const ids = fixtureComponentIds();
    expect(ids.length).toBeGreaterThan(0);
    const conforming = ids.every(isValidComponentId);
    const { surface, errors } = buildA2uiSurface(fixtureEvents());
    // ⚠️ 「有没有东西可画」才是用户看得见的那一格（面可能建出来了，
    // 但里面一个组件都没进去 ⇒ 界面上还是空的）。
    expect(hasRenderableContent(surface)).toBe(conforming);
    if (conforming) {
      expect(surface?.componentsModel.getAll().size).toBe(3);
    } else {
      // ⚠️ **不合规必须报出来**（不许静悄悄地什么都不画）。
      expect(errors.join('\n')).toContain('UAX #31');
    }
  });

  it('官方 SDK 把端脑的字节吃成一块面（**TaskCard 落在自建目录里**）', () => {
    const surface = buildSurfaceFromEvents([a2aEvent(tasksMessage())]);
    expect(surface).not.toBeNull();
    expect(surface?.id).toBe('shadow.tasks');
    expect(surface?.rootId).toBe('root');

    const components = surface?.componentsModel.getAll();
    expect(components?.size).toBe(3);
    const card = components?.get('task0');
    expect(card?.type).toBe('TaskCard');
    // ⚠️ **目录解析成功** ⇒ 组件落在**自建目录**里（不是基础目录）。
    expect(card?.catalog.id).toBe(SHADOW_CATALOG_ID);
    expect(card?.properties.title).toBe('写周报');
    expect(card?.properties.status).toBe('in_progress');
    expect(card?.properties.priority).toBe('high');
  });

  it('**组件 id 带连字符 ⇒ 官方必须拒**（负控：桌面端不替端脑改）', () => {
    // ⚠️ v1.0 的组件 id 必须是合法 UAX #31 标识符 ⇒ 连字符不合法
    // ⇒ ⇒ 官方 SDK 把那条组件拒掉 ⇒ ⇒ **界面上没有东西可画**，
    // 而且**必须报出来**（不许静悄悄地什么都不画）。
    expect(isValidComponentId('task0')).toBe(true);
    expect(isValidComponentId('task-0')).toBe(false);

    const { surface, errors } = buildA2uiSurface([a2aEvent(tasksMessage({ id: 'task-0' }))]);
    expect(hasRenderableContent(surface)).toBe(false);
    expect(errors.join('\n')).toContain('UAX #31');
  });

  it('**分得清「有内容」与「空」**（结构规则：除布局与文字外都是内容）', () => {
    const withContent = buildSurfaceFromEvents([a2aEvent(tasksMessage())]);
    expect(isStructurallyEmptySurface(withContent)).toBe(false);

    // ⚠️ 端脑把「没有任务」画成**只有文字**的面 ⇒ 「空」在结构上可判。
    const empty: A2uiMessage = {
      version: '1.0',
      createSurface: {
        surfaceId: 'shadow.tasks',
        catalogId: BASIC_CATALOG_ID,
        components: [
          { id: 'root', component: 'Column', children: ['title', 'empty'] },
          { id: 'title', component: 'Text', text: '# Tasks (0)' },
          { id: 'empty', component: 'Text', text: 'No tasks yet.' },
        ],
      },
    };
    const emptySurface = buildSurfaceFromEvents([a2aEvent(empty)]);
    expect(emptySurface).not.toBeNull();
    expect(isStructurallyEmptySurface(emptySurface)).toBe(true);
  });

  it('**不认识的组件类型降级成占位**，不许把整块界面带走', () => {
    const message = tasksMessage();
    const section = message.createSurface as { components: Record<string, unknown>[] };
    section.components.push({
      id: 'future',
      component: 'Timeline',
      children: [],
    });
    (section.components[0].children as string[]).push('future');

    const surface = buildSurfaceFromEvents([a2aEvent(message)]);
    expect(surface).not.toBeNull();
    // ⚠️ 界面**还在**（不是「什么都没有」）⇒ 端脑加了新组件不会白屏。
    expect(surface?.componentsModel.get('task0')).toBeTruthy();
    expect(unknownComponentsOf(surface)).toEqual([{ id: 'future', type: 'Timeline' }]);
  });
});

describe('A2UI 客户端 — 桌面端', () => {
  it('posts to /a2a with the shadow key and the **v1.0** A2UI extension header', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return fakeResponse(tasksSse());
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
    // ⚠️ **扩展 URI 自带版本** ⇒ 不带它端脑会退回 v0.8 那套。
    expect(headers['X-A2A-Extensions']).toBe(A2UI_EXTENSION_URI);
    expect(A2UI_EXTENSION_URI).toBe('https://a2ui.org/a2a-extension/a2ui/v1.0');

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.method).toBe('message/stream');
    // ⚠️ The view must be explicit — keyword matching would be at the mercy
    // of the user's wording.
    expect(body.params.message.metadata.a2ui.view).toBe('tasks');

    // ⚠️ **能力协商**：没有它，端脑不知道客户端支持 v1.0 的哪些目录。
    const capabilities = body.params.message.metadata.a2uiRendererCapabilities;
    expect(capabilities['1.0'].supportedCatalogIds).toEqual([
      BASIC_CATALOG_ID,
      SHADOW_CATALOG_ID,
    ]);

    expect(result.surface).not.toBeNull();
    expect(result.errors).toEqual([]);
  });

  it('asks the brain to speak the user language (Accept-Language)', async () => {
    const calls: Array<{ init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      calls.push({ init });
      return fakeResponse(tasksSse());
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
    const calls: Array<{ init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      calls.push({ init });
      return fakeResponse(tasksSse());
    });

    await requestA2uiSurface({
      baseUrl: 'http://127.0.0.1:60080',
      view: 'tasks',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Accept-Language']).toBeUndefined();
  });

  it('omits the shadow key header when the brain runs in dev mode', async () => {
    const calls: Array<{ init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      calls.push({ init });
      return fakeResponse(tasksSse());
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

describe('A2UI surface renderer — 桌面端', () => {
  it('renders the task card', async () => {
    const surface = buildSurfaceFromEvents([a2aEvent(tasksMessage())]);
    render(<A2uiSurface surface={surface!} />);

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-id', 'shadow.tasks');

    const card = await screen.findByTestId('a2ui-task-card');
    expect(card).toHaveAttribute('data-status', 'in_progress');
    expect(card).toHaveAttribute('data-priority', 'high');
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('本周进展汇总')).toBeInTheDocument();
    // ⚠️ 官方基础目录的 Text 走 Markdown ⇒ "# Tasks (1)" 变成一个标题。
    expect(screen.getByText('Tasks (1)')).toBeInTheDocument();
  });

  it('**端脑发来 cancelled / overdue ⇒ 界面照样画得出来**', async () => {
    // ⚠️ 枚举少一档 ⇒ 官方 SDK 按目录 schema **拒掉整条消息**
    // ⇒ ⇒ 界面「什么都没有」⇒ 失败长得像成功。
    for (const status of ['cancelled', 'overdue'] as const) {
      const surface = buildSurfaceFromEvents([
        a2aEvent(tasksMessage({ id: 'taskx', title: '过期任务', status })),
      ]);
      expect(surface).not.toBeNull();
      expect(surface?.componentsModel.get('taskx')).toBeTruthy();

      const view = render(<A2uiSurface surface={surface!} />);
      const card = await screen.findByTestId('a2ui-task-card');
      expect(card).toHaveAttribute('data-status', status);
      expect(screen.getByText('过期任务')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('renders an unknown component type as a placeholder instead of throwing', async () => {
    const message = tasksMessage();
    const section = message.createSurface as { components: Record<string, unknown>[] };
    section.components.push({ id: 'future', component: 'SomeFutureWidget', anything: true });
    (section.components[0].children as string[]).push('future');

    const surface = buildSurfaceFromEvents([a2aEvent(message)]);
    render(<A2uiSurface surface={surface!} />);

    const placeholder = await screen.findByTestId('a2ui-unknown-component');
    expect(placeholder).toHaveAttribute('data-component-type', 'SomeFutureWidget');
  });
});

describe('A2UI — 面板摘除后保留的断言（挂共享渲染器，不再经面板）', () => {
  it('tells an empty surface apart from a surface with content', async () => {
    const emptyMessage: A2uiMessage = {
      version: '1.0',
      createSurface: {
        surfaceId: 'shadow.tasks',
        catalogId: BASIC_CATALOG_ID,
        components: [
          { id: 'root', component: 'Column', children: ['title', 'empty'] },
          { id: 'title', component: 'Text', text: '# Tasks (0)' },
          { id: 'empty', component: 'Text', text: 'No tasks yet.' },
        ],
      },
    };
    const surface = buildSurfaceFromEvents([a2aEvent(emptyMessage)]);

    render(<A2uiSurface surface={surface!} />);

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    // ⚠️ **空**这件事在 DOM 上是**可判的**（不靠眼力）。
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-empty', 'true');
    // 端脑**自己**在空 surface 里说了实话 ⇒ 客户端**不再补一句**概括。
    expect(await screen.findByText('Tasks (0)')).toBeInTheDocument();
    expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
    expect(screen.queryByText('common.noData')).not.toBeInTheDocument();
  });

  it('marks a surface with content as not empty', async () => {
    const surface = buildSurfaceFromEvents([a2aEvent(tasksMessage())]);

    render(<A2uiSurface surface={surface!} />);

    await waitFor(() => expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument());
    expect(screen.getByTestId('a2ui-surface')).toHaveAttribute('data-surface-empty', 'false');
  });

  it('**纯文本回复被如实挖出来**（协议层）', () => {
    const texts = extractTextParts({
      result: {
        status: {
          message: { parts: [{ kind: 'text', text: '这里能看什么' }] },
        },
      },
    });
    expect(texts).toEqual(['这里能看什么']);
  });
});
