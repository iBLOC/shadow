/**
 * A2UI 的 HTTP 客户端 —— 桌面端这一侧。
 *
 * ## 打哪儿
 *
 * POST {baseUrl}/a2a，请求体是 **A2A v0.3** 的 JSON-RPC message/stream，
 * 响应是 **SSE**。
 *
 * ⚠️ 为什么是 /a2a 而不是 baseUrl 根：端脑的根路径上还有
 * /api/telencephalon/*、/shadow/v1/* 等一堆路由 ⇒ 把 JSON-RPC 塞到根上
 * 会让「谁是 A2A 入口」变得不清楚。
 *
 * ## v1.0 的两处新增（⚠️ 都是「不说就会退回 v0.8」的地方）
 *
 * ❶ **请求头**：X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v1.0
 *    （⚠️ 扩展 URI **自带版本** ⇒ 不带它，端脑按 v0.8 那套答）。
 *
 * ❷ **能力协商**：params.message.metadata.a2uiRendererCapabilities
 *    ⇒ 形如 {"1.0": {"supportedCatalogIds": [基础目录, 自建目录]}}
 *    ⇒ 这份对象**由官方 SDK 生成**（MessageProcessor.getRendererCapabilities）
 *    ⇒ ⇒ 形状不会自己漂。
 *
 * ## 钥匙（X-Shadow-Key / X-Admin-Token）
 *
 * ⚠️ 端脑的 /a2a 在 shadow key 后面 ⇒ 端脑配了 key 而客户端不带 ⇒ **401**。
 * ⚠️ 端脑在**开发模式**（没配 key）下也放行 ⇒ 客户端没 key 时**不带这个头**
 * （不是硬塞一个空串 —— 空串不等于「没带」）。
 */

import {
  A2UI_EXTENSION_URI,
  type A2uiMessage,
  type A2uiSurface,
  type A2uiView,
  SseDecoder,
  buildRendererCapabilities,
  createA2uiProcessor,
  extractA2uiMessages,
  extractJsonRpcError,
  extractTextParts,
  surfaceFromMessages,
} from './a2uiProtocol';
import { adminHeaders } from './adminToken';

/** 端脑拒绝了这个请求（HTTP 层）。 */
export class A2uiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(
      status === 401
        ? '端脑拒绝了这次请求（401）—— 缺少或错误的 shadow key'
        : `端脑返回了 ${status}`,
    );
    this.name = 'A2uiHttpError';
  }
}

export interface A2uiRequestOptions {
  /** 端脑的基地址（telencephalonClient.getBaseUrl()）。 */
  baseUrl: string;
  /** 端脑的 shadow key（telencephalonClient.getApiKey()）。空 / undefined ⇒ 不带这个头。 */
  apiKey?: string;
  /** 要看哪个视图。 */
  view: A2uiView;
  /**
   * 用户语言 —— 发成 Accept-Language。
   *
   * ⚠️ 端脑据此产出**对应语言**的界面文案 ⇒ ⇒ 客户端只负责报出「我要哪种语言」。
   */
  locale?: string;
  /** 取消。 */
  signal?: AbortSignal;
  /** 注入 fetch（测试用）。 */
  fetchImpl?: typeof fetch;
}

export interface A2uiStreamResult {
  /** 官方 SDK 建出来的 surface（没有就 null —— **不是**一块空面板）。 */
  surface: A2uiSurface | null;
  /** 纯文本回复（端脑没有可渲染视图时给的提示）。 */
  texts: string[];
  /**
   * 协议层的问题（坏 JSON 行、JSON-RPC error、SDK 校验错误、认不出来的组件）。
   *
   * ⚠️ **刻意不抛**：一条坏行不该让整个面板变成「失败」——
   * 端脑可能先发了几条好的再发一条坏的，界面应该把能画的画出来，
   * 同时把「有一条没读懂」说出来。
   */
  errors: string[];
  /**
   * **原始的 A2A 事件**（逐条，已解析成对象）。
   *
   * ⚠️ 为什么把它带出来：A2UI 的事件有**两条消费路径** ——
   * ① 「面板」那条；② 「**对话里内联**」那条（客户端工具 show_a2ui_surface）。
   * ⇒ ⇒ 两边吃的是**同一批事件** ⇒ ⇒ 事件必须是**一份**。
   */
  events: unknown[];
  /** 抽出来的 A2UI v1.0 消息（已归一，可直接喂给官方 SDK）。 */
  messages: A2uiMessage[];
}

/** 造一个消息 id（UUID）。crypto.randomUUID 不可用时有兜底。 */
function newMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 客户端的能力声明（**官方 SDK 生成**）。
 *
 * ⚠️ 算一次就够（目录不会在运行时变）⇒ ⇒ 模块级缓存。
 */
let cachedCapabilities: Record<string, unknown> | null = null;
function rendererCapabilities(): Record<string, unknown> {
  if (!cachedCapabilities) {
    const { processor } = createA2uiProcessor();
    cachedCapabilities = buildRendererCapabilities(processor);
  }
  return cachedCapabilities;
}

/**
 * 构造 A2A v0.3 的 message/stream 请求体。
 *
 * ## 为什么显式写 metadata.a2ui.view
 *
 * 端脑从三个地方认「这次要看哪个视图」
 * ⇒ ⇒ 桌面端用**最明确**的那一档：不靠关键词（会被用户文案带偏），
 * 也不靠文本前缀（那是给手测 / curl 用的）。
 *
 * ## 为什么 metadata 里还有 a2uiRendererCapabilities
 *
 * ⚠️ **不说就拿不到 v1.0** —— 端脑按客户端声明的目录与协议版本决定吐
 * v1.0 还是 v0.8 ⇒ ⇒ 这份对象必须与客户端**真正支持的目录**一致。
 */
export function buildA2uiRequestBody(view: A2uiView): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'message/stream',
    params: {
      configuration: null,
      metadata: null,
      message: {
        kind: 'message',
        messageId: newMessageId(),
        role: 'user',
        parts: [{ kind: 'text', text: `a2ui:${view}` }],
        metadata: {
          a2ui: { view },
          // ⚠️ v1.0 的能力协商（官方 SDK 生成的形状）。
          a2uiRendererCapabilities: rendererCapabilities(),
        },
      },
    },
    id: 1,
  });
}

/** 请求头。 */
export function buildA2uiHeaders(apiKey?: string, locale?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // ⚠️ A2UI 扩展声明 —— **URI 自带版本** ⇒ 端脑据此决定吐 v1.0 还是 v0.8。
    'X-A2A-Extensions': A2UI_EXTENSION_URI,
  };
  // ⚠️ 空 key ⇒ **不带**这个头（开发模式放行）；带上空串反而会被当成
  // 「带了一个空钥匙」⇒ 401。
  if (apiKey) headers['X-Shadow-Key'] = apiKey;
  // ⚠️ **界面文案随用户的语言走** ⇒ 少了这个头，界面上就是英文。
  if (locale) headers['Accept-Language'] = locale;
  return headers;
}

/**
 * 向端脑要一个 A2UI surface。
 *
 * ⚠️ 端脑是 **SSE**：一个请求会回来**多条**事件 ⇒ 必须流式读。
 * 用 resp.json() 会直接抛（响应体不是 JSON）。
 */
export async function requestA2uiSurface(
  options: A2uiRequestOptions,
): Promise<A2uiStreamResult> {
  const { baseUrl, apiKey, view, signal, locale } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${baseUrl.replace(/\/+$/, '')}/a2a`;
  const resp = await fetchImpl(url, {
    method: 'POST',
    // ⚠️ **/a2a 在 shadow 门后面，而端脑的读门 = shadow ∪ admin**
    // ⇒ ⇒ 桌面端**没有** shadow key（宿主没生成过）⇒ ⇒ 这里必须递 **admin token**，
    // 否则端脑一把门关上，桌面端的 A2UI 面板就全 401（门掐断主人）。
    // ⚠️ 拿不到 token ⇒ **不带**那个头（端脑会 401 并说清原因）。
    headers: { ...buildA2uiHeaders(apiKey, locale), ...(await adminHeaders()) },
    body: buildA2uiRequestBody(view),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new A2uiHttpError(resp.status, body);
  }

  const texts: string[] = [];
  const errors: string[] = [];
  const messages: A2uiMessage[] = [];
  // ⚠️ **原始事件** —— 「对话里内联」那条路要的就是这一份字节。
  const events: unknown[] = [];
  const decoder = new SseDecoder();

  const handleEvent = (data: string) => {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch (e) {
      errors.push(`有一条 SSE 事件不是合法 JSON：${(e as Error).message}`);
      return;
    }
    // ⚠️ **收下原始事件**（解析后的对象）—— 面板那条路用 surface，
    // 「对话里内联」那条路用这一份 ⇒ ⇒ 两边**同一批事件**。
    events.push(json);
    const rpcError = extractJsonRpcError(json);
    if (rpcError) {
      errors.push(rpcError);
      return;
    }
    messages.push(...extractA2uiMessages(json, errors));
    texts.push(...extractTextParts(json));
  };

  const body = resp.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    // ⚠️ TextDecoder **懒构造**：只有真的拿到二进制块才需要它。
    let byteDecoder: TextDecoder | null = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined || value === null) continue;
        let chunk: string;
        if (typeof value === 'string') {
          chunk = value;
        } else {
          byteDecoder ??= new TextDecoder();
          chunk = byteDecoder.decode(value, { stream: true });
        }
        for (const event of decoder.push(chunk)) handleEvent(event);
      }
      if (byteDecoder) {
        const tail = byteDecoder.decode();
        if (tail) {
          for (const event of decoder.push(tail)) handleEvent(event);
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    // ⚠️ 没有流式 body（某些 mock / 老浏览器）⇒ 退化成整包读。
    const text = await resp.text();
    for (const event of decoder.push(text)) handleEvent(event);
  }

  for (const event of decoder.flush()) handleEvent(event);

  // ⚠️ 协议解析交给官方 SDK（v1.0）。
  const surface = surfaceFromMessages(messages, errors);

  return { surface, texts, errors, events, messages };
}
