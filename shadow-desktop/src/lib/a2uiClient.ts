/**
 * A2UI 的 HTTP 客户端 —— 桌面端这一侧。
 *
 * ## 打哪儿
 *
 * `POST {baseUrl}/a2a`，请求体是 **A2A v0.3** 的 JSON-RPC `message/stream`，
 * 响应是 **SSE**。
 *
 * ⚠️ 为什么是 `/a2a` 而不是 baseUrl 根：端脑的根路径上还有
 * `/api/telencephalon/*`、`/shadow/v1/*` 等一堆路由 ⇒ 把 JSON-RPC 塞到根上
 * 会让「谁是 A2A 入口」变得不清楚（`telencephalon/src/api/a2ui_gateway.rs`
 * 的模块注释里写明了这条取舍）。
 *
 * ## 为什么桌面端自己发，而不是复用 `telencephalonClient`
 *
 * `telencephalonClient.request()` 只会 `resp.json()` —— 它**不支持流式响应**
 * ⇒ A2UI 的 SSE 读不出来。而改它会碰到并行会话正在改的文件
 * （`shadow-desktop/src/lib/telencephalonClient.ts`）。
 *
 * ⇒ 这里独立一条通道，**不碰**那个文件。代价是「地址 / 钥匙」要自己取
 * （从 `telencephalonClient.getBaseUrl()` / `.getApiKey()` 拿 ⇒ 仍是同一个真相来源）。
 *
 * ## ⚠️ 钥匙（`X-Shadow-Key`）
 *
 * 端脑的 `/a2a` **在 shadow key 后面**（`api::shadow_auth::require_shadow_key`）
 * ⇒ 端脑配了 key 而客户端不带 ⇒ **401**。
 *
 * ⚠️ 端脑在**开发模式**（没配 key）下也放行 ⇒ 客户端没 key 时**不带这个头**
 * 就行（不是硬塞一个空串 —— 空串不等于「没带」）。
 */

import {
  A2UI_EXTENSION_URI,
  A2uiSurfaceModel,
  A2uiView,
  SseDecoder,
  extractJsonRpcError,
  extractTextParts,
} from './a2uiProtocol';

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
  /** 端脑的基地址（`telencephalonClient.getBaseUrl()`）。 */
  baseUrl: string;
  /** 端脑的 shadow key（`telencephalonClient.getApiKey()`）。空 / undefined ⇒ 不带这个头。 */
  apiKey?: string;
  /** 要看哪个视图。 */
  view: A2uiView;
  /**
   * 用户语言 —— 发成 `Accept-Language`。
   *
   * ⚠️ 端脑据此产出**对应语言**的界面文案（`Tasks (1)` / `任务（1）`）
   * —— 真相源在服务端（`telencephalon/src/a2a/a2ui_i18n.rs`）
   * ⇒ 客户端只负责报出「我要哪种语言」。
   */
  locale?: string;
  /** 取消。 */
  signal?: AbortSignal;
  /** 注入 fetch（测试用）。 */
  fetchImpl?: typeof fetch;
}

export interface A2uiStreamResult {
  /** 吃完全部事件后的 surface 模型。 */
  model: A2uiSurfaceModel;
  /** 纯文本回复（端脑没有可渲染视图时给的提示）。 */
  texts: string[];
  /**
   * 协议层的问题（坏 JSON 行、JSON-RPC error）。
   *
   * ⚠️ **刻意不抛**：一条坏行不该让整个面板变成「失败」——
   * 端脑可能先发了几条好的再发一条坏的，界面应该把能画的画出来，
   * 同时把「有一条没读懂」说出来。
   */
  errors: string[];
}

/** 造一个消息 id（UUID）。`crypto.randomUUID` 不可用时有兜底。 */
function newMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 构造 A2A v0.3 的 `message/stream` 请求体。
 *
 * ## 为什么显式写 `metadata.a2ui.view`
 *
 * 端脑从三个地方认「这次要看哪个视图」
 * （`telencephalon/src/a2a/a2ui.rs` 的 `resolve_view`）：
 *   1. `params.message.metadata.a2ui.view`（对象形式）← **这里用这个**；
 *   2. 文本以 `a2ui:<view>` 开头；
 *   3. 关键词（「任务」/「task」/…）。
 *
 * ⇒ 桌面端用**最明确**的那一档：不靠关键词（关键词匹配会被用户文案带偏），
 * 也不靠文本前缀（那是给手测 / curl 用的）。
 *
 * ## 为什么 `params` 里不放 `extensions`
 *
 * 移动端那条路**也不放**（`genui_a2ui` 的发送路径不带 `message.extensions`
 * ⇒ `A2AClient.messageStream` 不会往 `params` 里塞 `extensions`，
 * 见 `a2a_client.dart:182-184`）⇒ 桌面端与它**保持一致**，
 * 免得同一个端脑要伺候两种形状。扩展声明走**请求头**（见 `a2uiClient`）。
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
        metadata: { a2ui: { view } },
      },
    },
    id: 1,
  });
}

/** 请求头。 */
export function buildA2uiHeaders(apiKey?: string, locale?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // ⚠️ A2UI 扩展声明 —— 与移动端 transport 的 `authHeaders` 同一个常量
    // （`shadow-mobile/lib/services/genui/shadow_key_sse_transport.dart:79`）。
    'X-A2A-Extensions': A2UI_EXTENSION_URI,
  };
  // ⚠️ 空 key ⇒ **不带**这个头（开发模式放行）；带上空串反而会被当成
  // 「带了一个空钥匙」⇒ 401。
  if (apiKey) headers['X-Shadow-Key'] = apiKey;
  // ⚠️ **界面文案随用户的语言走** —— 端脑在 `Accept-Language` 里挑语言
  // （`telencephalon/src/a2a/a2ui_i18n.rs`）
  // ⇒ 少了这个头，界面上就是英文（`Tasks (1)`）。
  if (locale) headers['Accept-Language'] = locale;
  return headers;
}

/**
 * 向端脑要一个 A2UI surface。
 *
 * ⚠️ 端脑是 **SSE**：一个请求会回来**多条**事件 ⇒ 必须流式读。
 * 用 `resp.json()` 会直接抛（响应体不是 JSON）。
 */
export async function requestA2uiSurface(
  options: A2uiRequestOptions,
): Promise<A2uiStreamResult> {
  const { baseUrl, apiKey, view, signal, locale } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${baseUrl.replace(/\/+$/, '')}/a2a`;
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers: buildA2uiHeaders(apiKey, locale),
    body: buildA2uiRequestBody(view),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new A2uiHttpError(resp.status, body);
  }

  const model = new A2uiSurfaceModel();
  const texts: string[] = [];
  const errors: string[] = [];
  const decoder = new SseDecoder();

  const handleEvent = (data: string) => {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch (e) {
      errors.push(`有一条 SSE 事件不是合法 JSON：${(e as Error).message}`);
      return;
    }
    const rpcError = extractJsonRpcError(json);
    if (rpcError) {
      errors.push(rpcError);
      return;
    }
    model.applyEvent(json);
    texts.push(...extractTextParts(json));
  };

  const body = resp.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    // ⚠️ `TextDecoder` **懒构造**：只有真的拿到二进制块才需要它。
    // 有些传输层（以及测试里的假响应）直接给字符串 ⇒ 不该被一个用不上的
    // 全局量卡住。
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

  return { model, texts, errors };
}
