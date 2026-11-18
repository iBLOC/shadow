/**
 * A2UI v1.0 —— 桌面端的**适配层**（传输 + 目录 + 官方处理器）。
 *
 * ## 这一份文件负责什么
 *
 * ① **传输**：SSE 分帧、A2A 事件 → A2UI 消息、纯文本回复、JSON-RPC 错误；
 * ② **目录**：官方基础目录（Column / Text …）＋ 本仓自建目录（两个业务组件）；
 * ③ **处理器**：把 v1.0 消息喂给官方 MessageProcessor，产出 surface 模型。
 *
 * ## 协议层**不是**桌面端写的
 *
 * ⚠️ v1.0 的解析、目录解析、数据绑定、组件树求解**全部**交给官方 SDK
 * （@a2ui/web_core 0.15.0 ＋ @a2ui/react 0.15.0）⇒ ⇒ 桌面端**原样**把
 * 端脑的字节交给它 ⇒ ⇒ **零协议翻译**（没有键名改写、没有载荷重排、没有
 * 组件 id 修补）⇒ ⇒ 端脑说什么，客户端就喂什么。
 *
 * ## ⚠️ 端脑那侧必须守的两条（v1.0 的硬规矩）
 *
 * ❶ **组件 id 必须是合法 UAX #31 标识符**（官方 TS 与 Dart SDK 同规则：
 *    @a2ui/web_core 的 PayloadValidator.enforceIdentifiers；
 *    a2ui_core/lib/src/validation/validator.dart 的 _checkComponentHeader）
 *    ⇒ **连字符不合法**（task-0 ⇒ 整条消息被拒 ⇒ 界面上一个面都没有）。
 *    ⇒ ⇒ 端脑要发 task0 / agent0 这种形状。
 *    ⇒ ⇒ 桌面端**不**替它改（改了就成「协议翻译层」了）⇒ ⇒ 不合规就是
 *    **一条明确的错误**（面板会把它报出来），不是一块空白。
 *
 * ❷ **载荷在 A2A 信封的 parts[].data 里必须是对象**（不是 JSON 字符串）
 *    ⇒ ⇒ 字符串会被客户端整条跳过 ⇒ 界面上什么都不出来且**不报错**。
 */
import { createElement } from 'react';
import { z } from 'zod';
import {
  Catalog,
  MessageProcessor,
  STRICT_VALIDATION,
  isValidUax31Identifier,
  type ComponentApi,
  type SurfaceModel,
} from '@a2ui/web_core/v1_0';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import {
  createComponentImplementation,
  type ReactCatalogComponent,
  type ReactComponentImplementation,
} from '@a2ui/react';

/** A2UI 扩展 URI —— 客户端在 X-A2A-Extensions 头里声明它（**URI 自带版本**）。 */
export const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v1.0';

/** 线缆上的协议版本（v1.0 **不带** v 前缀）。 */
export const A2UI_PROTOCOL_VERSION = '1.0';

/** 官方基础目录 id —— 标准组件（Column / Text …）归它。 */
export const BASIC_CATALOG_ID =
  'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

/** 本仓自建目录 id —— 两个业务组件归它（**逐字与端脑一致**）。 */
export const SHADOW_CATALOG_ID =
  'https://raw.githubusercontent.com/iBLOC/shadow/main/a2ui/catalogs/v1/catalog.json';

/** 客户端支持的两个目录（能力协商时上报的那一份）。 */
export const A2UI_SUPPORTED_CATALOG_IDS: readonly string[] = [
  BASIC_CATALOG_ID,
  SHADOW_CATALOG_ID,
];

/** 端脑当前能渲染的视图。 */
export type A2uiView = 'tasks' | 'agents';

/** 一条 surface（官方 SDK 的模型）。 */
export type A2uiSurface = SurfaceModel<ReactCatalogComponent>;

/** 一条 A2UI v1.0 消息（信封）。 */
export type A2uiMessage = Record<string, unknown>;

// ────────────────────────────────────────────────────────────────────
// 目录：两个业务组件
// ────────────────────────────────────────────────────────────────────

/**
 * TaskCard.status 的五档。
 *
 * ⚠️ **五档，不是三档** —— 端脑的 task_status_label 会把 cancelled 与
 * overdue 也发过来（telencephalon/src/a2a/a2ui_v1.rs）。
 * ⇒ ⇒ 官方 SDK 按目录 schema 校验消息 ⇒ **枚举少一档 ⇒ 整条消息被拒**
 * ⇒ ⇒ 界面「什么都没有」⇒ 失败长得像成功。
 */
export const TASK_STATUS_VALUES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'overdue',
] as const;

/** TaskCard.priority 的三档（端脑把 Urgent 归到 high）。 */
export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high'] as const;

/** AgentStatusIndicator.status 的五档。 */
export const AGENT_STATUS_VALUES = [
  'idle',
  'thinking',
  'executing',
  'error',
  'unknown',
] as const;

/**
 * TaskCard 的**协议形状**（schema-only）。
 *
 * ⚠️ **唯一真相源** —— 渲染层的 React 实现（src/components/chat/a2uiCatalog.tsx）
 * 从这里取 schema ⇒ ⇒ 两边不会漂。
 */
export const TaskCardApi = {
  name: 'TaskCard',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  }),
} satisfies ComponentApi;

/** AgentStatusIndicator 的**协议形状**（schema-only）—— 唯一真相源。 */
export const AgentStatusIndicatorApi = {
  name: 'AgentStatusIndicator',
  schema: z.object({
    agentName: z.string(),
    status: z.enum(AGENT_STATUS_VALUES).optional(),
    message: z.string().optional(),
  }),
} satisfies ComponentApi;

/**
 * 状态 → 视觉。
 *
 * ⚠️ 颜色**只**取设计令牌（--success / --warning / --destructive），
 * 绝不写死 hex（scripts/check-agent-surface.mjs 盯的就是这件事）。
 *
 * ⚠️ status / priority 是**协议值** ⇒ 原样显示、不翻译
 * （移动端那份也是原样显示 ⇒ 两端对同一个 surface 的说法必须一致）。
 */
const TASK_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-brand/10 text-[hsl(var(--warning))]',
  completed: 'bg-brand/10 text-[hsl(var(--success))]',
  cancelled: 'bg-muted text-muted-foreground line-through',
  overdue: 'bg-destructive/10 text-destructive',
};

const AGENT_STATUS_STYLE: Record<string, string> = {
  idle: 'bg-muted text-muted-foreground',
  thinking: 'bg-brand/10 text-[hsl(var(--warning))]',
  executing: 'bg-brand/10 text-brand',
  error: 'bg-destructive/10 text-destructive',
  // ⚠️ **「我们不知道」不是「没事」** —— 端脑从没探活过的叶区（占位记录）就是这一档。
  unknown: 'bg-muted text-muted-foreground border border-dashed border-muted-foreground',
};

/**
 * TaskCard —— 任务看板上的那张卡。
 *
 * ⚠️ 这一份**用 createElement 而不是 JSX** —— 因为本文件是 .ts（不是 .tsx），
 * 而目录条目必须和协议层住在**同一个模块**里（clientTools.ts 那一路也要用同一份目录）。
 */
const TaskCard = createComponentImplementation(
  TaskCardApi,
  ({ props }) => {
    const status = props.status ?? 'pending';
    const priority = props.priority ?? 'medium';
    return createElement(
      'div',
      {
        className: 'flex flex-col gap-1 rounded-lg border border-border bg-card p-3',
        'data-testid': 'a2ui-task-card',
        'data-status': status,
        'data-priority': priority,
      },
      createElement(
        'div',
        { className: 'flex items-center justify-between gap-2' },
        createElement(
          'span',
          { className: 'text-sm font-medium text-foreground' },
          props.title,
        ),
        createElement(
          'span',
          {
            className: `rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              TASK_STATUS_STYLE[status] ?? TASK_STATUS_STYLE.pending
            }`,
            'data-testid': 'a2ui-task-status',
          },
          status,
        ),
      ),
      props.description
        ? createElement(
            'span',
            { className: 'text-xs text-muted-foreground', 'data-testid': 'a2ui-task-description' },
            props.description,
          )
        : null,
      createElement(
        'span',
        {
          className: 'text-[10px] uppercase tracking-wide text-muted-foreground',
          'data-testid': 'a2ui-task-priority',
        },
        priority,
      ),
    );
  },
);

/**
 * AgentStatusIndicator —— 叶区状态那一枚。
 *
 * ⚠️ **缺 status 声明 ≠ 「就绪」** ⇒ 缺省落 unknown，不落 idle。
 */
const AgentStatusIndicator = createComponentImplementation(
  AgentStatusIndicatorApi,
  ({ props }) => {
    const status = props.status ?? 'unknown';
    return createElement(
      'div',
      {
        className: 'flex items-center gap-2 rounded-lg border border-border bg-card p-3',
        'data-testid': 'a2ui-agent-status',
        'data-status': status,
      },
      createElement(
        'span',
        {
          className: `rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            AGENT_STATUS_STYLE[status] ?? AGENT_STATUS_STYLE.unknown
          }`,
        },
        status,
      ),
      createElement('span', { className: 'text-sm text-foreground' }, props.agentName),
      props.message
        ? createElement(
            'span',
            { className: 'text-xs text-muted-foreground' },
            props.message,
          )
        : null,
    );
  },
);

/**
 * 本仓自建目录 —— **只有两个组件**。
 *
 * ⚠️ 为什么不是「基础目录 ＋ 我们两个」而是**单独一个目录**：
 * v1.0 的解析顺序是「组件上的目录键 ⇒ 面的默认目录键」
 * ⇒ ⇒ 标准组件走**面的默认**（官方基础目录），
 * 两个业务组件在自己的目录键里找我们这份 ⇒ ⇒ 两边不必硬耦合。
 */
export const shadowCatalog: Catalog<ReactComponentImplementation> = new Catalog(
  SHADOW_CATALOG_ID,
  A2UI_PROTOCOL_VERSION,
  [TaskCard, AgentStatusIndicator],
  [],
);

/**
 * 客户端注册的两个目录（官方基础目录 ＋ 本仓自建目录）。
 *
 * ⚠️ **类型为什么是 `Catalog<ComponentApi>` 而不是 `Catalog<any>`** ——
 *    官方 SDK 的构造签名本身就是 `Catalog<any>[]`（`@a2ui/web_core` 0.15.0
 *    `src/processing/message-processor.d.ts:120`）⇒ ⇒ **那个 `any` 由官方自己扛**
 *    ⇒ ⇒ 本仓这份数组**不必跟着撒** ⇒ ⇒ 用**同样具体**的 `ComponentApi` 收窄
 *    ⇒ ⇒ 销掉 `a2uiProtocol.ts:270` 那处 eslint 的 `no-explicit-any` 警告。
 *    ⚠️ 官方基础目录的组件实现是 `WebComponentImplementation`、本仓自建目录是
 *    `ReactComponentImplementation` ⇒ ⇒ 两者**都**是 `ComponentApi` 的子类型
 *    ⇒ ⇒ 共同的上界就是 `ComponentApi`（**不是一个假的联合**）。
 */
export const A2UI_CATALOGS: Catalog<ComponentApi>[] = [basicCatalog, shadowCatalog];

// ────────────────────────────────────────────────────────────────────
// SSE 解码
// ────────────────────────────────────────────────────────────────────

/**
 * SSE 解码器 —— 把一段一段的文本喂进来，吐出**完整事件**的数据串。
 *
 * ⚠️ 语义：data: 开头的行 ⇒ 累积（一个事件可以有多行 data）；
 * : 开头的行 ⇒ 注释 / keepalive，**忽略**；
 * **空行** ⇒ 事件边界；其他行 ⇒ 忽略。
 * ⚠️ 空白行按 trim() === '' 判边界（端脑发 \n\n，CRLF 环境很常见）。
 */
export class SseDecoder {
  private buffer = '';
  private dataLines: string[] = [];

  /** 喂一段文本，返回**本次凑齐**的完整事件。 */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    for (;;) {
      const idx = this.buffer.indexOf('\n');
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      const event = this.handleLine(line);
      if (event !== null) events.push(event);
    }
    return events;
  }

  /**
   * 流结束时把残留的缓冲吐出来。
   *
   * ⚠️ 需要它，是因为有些服务端**最后一个事件后面不发空行**就断开连接
   * ⇒ ⇒ 数据还卡在 buffer 里 ⇒ 不 flush 就会**静默丢掉最后一个事件**。
   */
  flush(): string[] {
    const events: string[] = [];
    if (this.buffer.length > 0) {
      const line = this.buffer.replace(/\r$/, '');
      this.buffer = '';
      const event = this.handleLine(line);
      if (event !== null) events.push(event);
    }
    const tail = this.takeEvent();
    if (tail !== null) events.push(tail);
    return events;
  }

  private handleLine(line: string): string | null {
    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).trim());
      return null;
    }
    if (line.startsWith(':')) return null;
    if (line.trim() === '') return this.takeEvent();
    return null;
  }

  private takeEvent(): string | null {
    if (this.dataLines.length === 0) return null;
    const payload = this.dataLines.join('\n');
    this.dataLines = [];
    return payload.length > 0 ? payload : null;
  }
}

// ────────────────────────────────────────────────────────────────────
// A2A 事件 → A2UI 消息
// ────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface MessagePart {
  kind: string;
  text?: unknown;
  data?: unknown;
}

/** 取 result.status.message.parts[]。取不到就返回空数组（不抛）。 */
function messageParts(json: unknown): MessagePart[] {
  if (!isRecord(json)) return [];
  const result = json.result;
  if (!isRecord(result)) return [];
  const status = result.status;
  if (!isRecord(status)) return [];
  const message = status.message;
  if (!isRecord(message)) return [];
  const parts = message.parts;
  if (!Array.isArray(parts)) return [];

  const out: MessagePart[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    out.push({
      kind: typeof part.kind === 'string' ? part.kind : '',
      text: part.text,
      data: part.data,
    });
  }
  return out;
}

/**
 * 从一个 A2A 事件里挖出 **A2UI v1.0 消息**。
 *
 * ⚠️ 路径是 result.status.message.parts[] 里 kind === "data" 的那些 part。
 * ⚠️ **外面那层 result 不能省** —— 少了它整个事件会被**静默丢弃**。
 *
 * ⚠️ 官方 v1.0 要求 parts[].data 是**对象**；端脑若发字符串
 * ⇒ ⇒ **不能静默跳过**（那会让界面「什么都没有」且不报错）
 * ⇒ ⇒ 这里尽力解析，并**报出来**。
 */
export function extractA2uiMessages(json: unknown, warnings?: string[]): A2uiMessage[] {
  const out: A2uiMessage[] = [];
  for (const part of messageParts(json)) {
    if (part.kind !== 'data') continue;
    const data = part.data;
    if (typeof data === 'string') {
      const parsed = parseJson(data);
      if (isRecord(parsed) && isA2uiMessage(parsed)) {
        out.push(parsed);
        warnings?.push('端脑把 A2UI 载荷发成了 JSON 字符串（官方 v1.0 要求是对象）');
      }
      continue;
    }
    if (isRecord(data) && isA2uiMessage(data)) out.push(data);
  }
  return out;
}

/** 这个对象像不像一条 A2UI v1.0 消息？ */
export function isA2uiMessage(value: unknown): value is A2uiMessage {
  if (!isRecord(value)) return false;
  return (
    'createSurface' in value ||
    'updateComponents' in value ||
    'updateDataModel' in value ||
    'deleteSurface' in value
  );
}

/**
 * 从一个 A2A 事件里挖出**纯文本**回复。
 *
 * ⚠️ 端脑在「这次请求没有可渲染的视图」时会回一段纯文本
 * ⇒ ⇒ 桌面端得把它显示出来 —— 否则用户看到的是一个**空面板**，
 * 分不清是「没数据」还是「出错了」。
 */
export function extractTextParts(json: unknown): string[] {
  const out: string[] = [];
  for (const part of messageParts(json)) {
    if (part.kind !== 'text') continue;
    if (typeof part.text === 'string' && part.text.trim() !== '') {
      out.push(part.text);
    }
  }
  return out;
}

/** JSON-RPC 层的错误（{"error": {...}}）。 */
export function extractJsonRpcError(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const error = json.error;
  if (!isRecord(error)) return null;
  const code = error.code;
  const message = typeof error.message === 'string' ? error.message : '未知错误';
  return code === undefined ? message : `[${String(code)}] ${message}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ────────────────────────────────────────────────────────────────────
// 处理器
// ────────────────────────────────────────────────────────────────────

/**
 * 造一个官方 MessageProcessor。
 *
 * ⚠️ allowUnknownElements: true：**不认识**的组件类型不许把整块界面带走
 * ⇒ ⇒ 它降级成占位（见 unknownComponentsOf）⇒ 而不是「界面什么都没有」。
 * 其余校验（root 在不在、有没有悬空引用、有没有孤儿）**照旧严格**。
 */
export function createA2uiProcessor(): {
  processor: MessageProcessor<ReactCatalogComponent>;
  errors: string[];
} {
  const errors: string[] = [];
  const processor = new MessageProcessor<ReactCatalogComponent>(
    A2UI_CATALOGS,
    undefined,
    {
      version: A2UI_PROTOCOL_VERSION,
      reportErrorsOnly: true,
      errorHandler: (error) => {
        // ⚠️ 官方 SDK 给的是 **信封**（{version, error:{code, message}}）
        const body = error?.error;
        const message = typeof body?.message === 'string' ? body.message : String(error);
        const code = typeof body?.code === 'string' ? body.code : undefined;
        errors.push(code ? `[${code}] ${message}` : message);
      },
      validationConfig: { ...STRICT_VALIDATION, allowUnknownElements: true },
    },
  );
  return { processor, errors };
}

/** 客户端能报给服务端的能力声明（官方 SDK 生成 ⇒ 形状不会漂）。 */
export function buildRendererCapabilities(
  processor: MessageProcessor<ReactCatalogComponent>,
): Record<string, unknown> {
  return processor.getRendererCapabilities({
    versions: [A2UI_PROTOCOL_VERSION],
  }) as Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────
// surface 判据
// ────────────────────────────────────────────────────────────────────

/**
 * 这个 surface **结构上**是空的吗？
 *
 * ## 判据：除 Column / Text 之外没有别的组件
 *
 * 端脑把「没有内容」画成一个**只有文字的 surface**
 * ⇒ 「有没有内容」这件事**在结构上就是可判的**。
 *
 * ⚠️ **规则反过来写**（除布局与文字之外的都是内容）⇒ 端脑加一种新组件时，
 * 客户端**不会**把一张有内容的界面说成空的。
 */
export function isStructurallyEmptySurface(surface: A2uiSurface | null | undefined): boolean {
  if (!surface) return true;
  const components = surface.componentsModel.getAll();
  if (components.size === 0) return true;
  for (const component of components.values()) {
    if (component.type !== 'Column' && component.type !== 'Text') return false;
  }
  return true;
}

/** 这张面**画得出来**吗？（有根组件才算） */
export function hasRenderableContent(surface: A2uiSurface | null | undefined): boolean {
  if (!surface) return false;
  return Boolean(surface.componentsModel.get(surface.rootId));
}

/**
 * 面里**客户端不认识**的组件。
 *
 * ⚠️ 官方 SDK 对未知类型**不画**（也不抛）⇒ ⇒ 客户端自己补一个占位
 * ⇒ ⇒ 「端脑加了新组件」不会变成「用户看到一块空白」。
 */
export function unknownComponentsOf(
  surface: A2uiSurface | null | undefined,
): { id: string; type: string }[] {
  if (!surface) return [];
  const out: { id: string; type: string }[] = [];
  for (const component of surface.componentsModel.getAll().values()) {
    const catalog = component.catalog;
    if (catalog && catalog.components.has(component.type)) continue;
    out.push({ id: component.id, type: component.type });
  }
  return out;
}

/** 从一组 A2A 事件建出**第一块可渲染的 surface**（没有就 null）。 */
export function buildSurfaceFromEvents(events: readonly unknown[]): A2uiSurface | null {
  return buildA2uiSurface(events).surface;
}

/** 从一组 A2A 事件建出 surface ＋ 纯文本 ＋ 协议层的问题。 */
export function buildA2uiSurface(events: readonly unknown[]): {
  surface: A2uiSurface | null;
  texts: string[];
  errors: string[];
} {
  const texts: string[] = [];
  const messages: A2uiMessage[] = [];
  const errors: string[] = [];

  for (const event of events) {
    const rpcError = extractJsonRpcError(event);
    if (rpcError) {
      errors.push(rpcError);
      continue;
    }
    messages.push(...extractA2uiMessages(event, errors));
    texts.push(...extractTextParts(event));
  }

  return { surface: surfaceFromMessages(messages, errors), texts, errors };
}

/**
 * 把 v1.0 消息**原样**喂给官方处理器 ⇒ 第一块 surface。
 *
 * ⚠️ **零翻译**：不碰目录键、不碰载荷形状、不碰组件 id
 * ⇒ ⇒ 端脑不合规 ⇒ 就是官方 SDK 拒 ⇒ 客户端**如实报出来**。
 */
export function surfaceFromMessages(
  messages: readonly A2uiMessage[],
  errors: string[] = [],
): A2uiSurface | null {
  if (messages.length === 0) return null;

  const { processor, errors: processorErrors } = createA2uiProcessor();
  try {
    processor.processMessages(messages as never);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.push(...processorErrors);

  const first = processor.model.surfacesMap.values().next();
  return first.done ? null : first.value;
}

/**
 * 这个 id 合不合法（UAX #31）—— **判据用**，不是翻译。
 *
 * ⚠️ 官方 SDK 对 v1.0 目录**强制**这条（TS 与 Dart 同规则）
 * ⇒ ⇒ 端脑发的 id 不合法 ⇒ **整条消息被拒** ⇒ ⇒ 界面上一个面都没有。
 */
export function isValidComponentId(id: string): boolean {
  return isValidUax31Identifier(id);
}
