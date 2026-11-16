import { parseAguiEvent, parseSseDataLines } from './protocol';
import type { AguiContentPart, AguiEvent, AguiRunRequest } from './types';

/** AG-UI 的适配端点（端脑 `ag-ui:stream`）。 */
export function aguiStreamPath(conversationId: string): string {
  return '/shadow/v1/conversations/' + encodeURIComponent(conversationId) + '/ag-ui:stream';
}

/** 一份要内联进请求的附件（**base64**，不是路径、不是远程 URL）。 */
export interface AguiInlineFile {
  /** MIME（`image/png` / `application/pdf` …）。 */
  mediaType: string;
  /** base64 字节。 */
  base64: string;
  /** 文件名（可选 —— AG-UI 的 part 里没有这一位 ⇒ ⇒ 我们放进 metadata）。 */
  filename?: string;
}

/**
 * 用户这一轮的内容（文本 ＋ 内联附件）—— **AG-UI 规范形状**。
 *
 * ⚠️ **为什么只给内联、不给远程 URL**：端脑**不去拉远程 URL**（不开 SSRF 那个面）
 * ⇒ ⇒ 远程 URL 会被**响亮地拒**（400）⇒ ⇒ 客户端**必须内联字节** ⇒ ⇒ 这一层
 * 只提供「内联」这一种入口 ⇒ ⇒ 调用方**没有**偷偷发远程 URL 的机会。
 *
 * ⚠️ 附件的 `source.type` 一律 `data` ⇒ ⇒ 规范要求带 `mimeType` ⇒ ⇒ 必填。
 */
export function buildAguiUserContent(
  text: string,
  files: AguiInlineFile[] = [],
): AguiContentPart[] {
  const parts: AguiContentPart[] = [];
  if (text !== '') parts.push({ type: 'text', text });
  for (const f of files) {
    const kind: 'image' | 'document' | 'audio' =
      f.mediaType.startsWith('image/')
        ? 'image'
        : f.mediaType.startsWith('audio/')
          ? 'audio'
          : 'document';
    parts.push({
      type: kind,
      source: { type: 'data', value: f.base64, mimeType: f.mediaType },
    });
  }
  return parts;
}

export interface AguiClientOptions {
  /** 端脑的基址（与既有 transport 同一个）。 */
  baseUrl: string;
  /** 读门头（影子锁 ∪ admin token）—— 与既有 transport 同一条纪律。 */
  readHeaders: () => Promise<Record<string, string>>;
  /** 注入点（判据用假 fetch；生产走全局 fetch）。 */
  fetchImpl?: typeof fetch;
}

/**
 * AG-UI 那一路的客户端 —— **薄绑定**（协议形状用官方的，依赖不引入官方的）。
 *
 * ⚠️ **失败不许长得像成功**：
 * - 非 2xx ⇒ ⇒ 抛，且**带上端脑的原话**（例如「请把字节内联成 data source」）
 *   ⇒ ⇒ 用户能看懂自己错在哪，而不是「ag-ui 400」；
 * - 流里的坏 JSON ⇒ ⇒ 抛（不静默跳过事件）⇒ ⇒ 「回复少了一段」不会无迹可寻。
 */
export class AguiClient {
  private readonly baseUrl: string;
  private readonly readHeaders: () => Promise<Record<string, string>>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(opts: AguiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.readHeaders = opts.readHeaders;
    this.fetchImpl = opts.fetchImpl;
  }

  /**
   * 跑一轮（POST ＋ SSE）⇒ ⇒ 逐个事件吐出来。
   *
   * ⚠️ **只带最后那条 user 消息的附件**（服务端只取那一条）⇒ ⇒ 客户端也按那一条
   * 组装 ⇒ ⇒ 两端口径一致 ⇒ ⇒ 不会出现「客户端发了、服务端没看到」。
   */
  async *streamTurn(
    conversationId: string,
    req: AguiRunRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<AguiEvent> {
    const doFetch = this.fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
      throw new Error('ag-ui client has no fetch implementation');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.readHeaders()),
    };
    const resp = await doFetch(this.baseUrl + aguiStreamPath(conversationId), {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('ag-ui ' + resp.status + ': ' + (text || resp.statusText));
    }
    const body = resp.body;
    if (!body) throw new Error('ag-ui response carries no body');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parsed = parseSseDataLines(buffer);
      buffer = parsed.rest;
      for (const payload of parsed.payloads) {
        yield parseAguiEvent(payload);
      }
    }
    // 流结束时的尾巴（没有换行符收尾的那一行）也要读出来 ⇒ ⇒ 不丢最后一帧。
    const tail = parseSseDataLines(buffer + '\n');
    for (const payload of tail.payloads) {
      yield parseAguiEvent(payload);
    }
  }
}
