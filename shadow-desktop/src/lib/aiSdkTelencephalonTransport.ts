/**
 * AI SDK ChatTransport adapter for telencephalonClient.
 *
 * Bridges shadow-desktop's existing cortex SSE streaming to the
 * Vercel AI SDK's ChatTransport interface. Lets `useChat` consume
 * `/shadow/v1/conversations/{id}/messages:stream` without rewriting
 * the existing SSE pipeline.
 *
 * Usage:
 * ```tsx
 * import { useChat } from '@ai-sdk/react';
 * import { telencephalonClient } from '@/lib/telencephalonClient';
 * import { createTelencephalonChatTransport } from '@/lib/aiSdkTelencephalonTransport';
 *
 * const transport = createTelencephalonChatTransport({ conversationId: id });
 * const { messages, sendMessage, addToolOutput, addToolApprovalResponse } = useChat({
 *   id,
 *   transport,
 * });
 * ```
 */

import { telencephalonClient, type StreamEvent } from './telencephalonClient';

export interface TelencephalonChatTransportOptions {
  conversationId: string;
  /** Optional agent override. When omitted, cortex uses its default routing. */
  agent?: string;
}

/**
 * Map shadow desktop StreamEvent → AI SDK UIMessage stream chunk.
 * AI SDK `streamText` produces data the wire-protocol understands.
 */
interface CortexTransportCallbacks {
  onChunk: (chunk: CortexWireChunk) => void;
  onError: (error: unknown) => void;
  onDone: () => void;
}

export interface CortexWireChunk {
  type:
    | 'text-delta'
    | 'reasoning-delta'
    | 'tool-input-start'
    | 'tool-input-delta'
    | 'tool-input-available'
    | 'tool-approval-request'
    | 'tool-output-available'
    | 'tool-output-denied'
    | 'tool-output-error'
    | 'step-start'
    | 'step-finish'
    | 'error';
  [key: string]: unknown;
}

/**
 * Translate a shadow StreamEvent (delta / tool_call / tool_result / route /
 * handoff / done / error / step) into one or more AI SDK wire-format chunks.
 */
function translateEvent(event: StreamEvent): CortexWireChunk[] {
  switch (event.type) {
    case 'delta':
      return [{ type: 'text-delta', textDelta: event.delta ?? '' }];

    case 'tool_call':
      return [
        {
          type: 'tool-input-start',
          toolCallId: event.tool_call_id,
          toolName: event.name,
        },
        {
          type: 'tool-input-delta',
          toolCallId: event.tool_call_id,
          inputTextDelta: JSON.stringify(event.args ?? {}),
        },
        {
          type: 'tool-input-available',
          toolCallId: event.tool_call_id,
          toolName: event.name,
          input: event.args ?? {},
        },
      ];

    case 'tool_result':
      return [
        {
          type: 'tool-output-available',
          toolCallId: event.tool_call_id,
          output: event.result,
        },
      ];

    case 'route':
      return [
        {
          type: 'step-start',
          stepType: 'route',
          metadata: { supervisor: event.supervisor, target: event.target, reason: event.reason },
        },
      ];

    case 'handoff':
      return [
        {
          type: 'step-start',
          stepType: 'handoff',
          metadata: { from: event.from, to: event.to, contextSize: event.context_size },
        },
      ];

    case 'step':
      return [{ type: 'step-finish', stepType: event.step }];

    case 'done':
      return [{ type: 'step-finish', stepType: 'final' }];

    case 'error':
      return [{ type: 'error', errorText: event.error ?? 'Unknown error' }];

    default:
      return [];
  }
}

/**
 * Read a stream of StreamEvent values and forward translated wire chunks
 * to the provided callbacks. Returns a disposer that aborts the stream.
 */
function subscribe(
  iterator: AsyncGenerator<StreamEvent>,
  cbs: CortexTransportCallbacks,
): () => void {
  let cancelled = false;
  (async () => {
    try {
      while (!cancelled) {
        const { value, done } = await iterator.next();
        if (done) break;
        for (const chunk of translateEvent(value)) {
          if (cancelled) break;
          cbs.onChunk(chunk);
        }
      }
      cbs.onDone();
    } catch (err) {
      if (!cancelled) cbs.onError(err);
    }
  })();
  return () => {
    cancelled = true;
    if (typeof iterator.return === 'function') {
      void iterator.return(undefined);
    }
  };
}

/**
 * Build an AI SDK ChatTransport-compatible object backed by telencephalonClient.
 *
 * The returned object implements `sendMessages` and `reconnectToStream` as
 * expected by `useChat`. It does **not** import `@ai-sdk/ui-utils` directly —
 * we duck-type the minimal surface that `useChat` uses so the import stays
 * optional at module level.
 */
export function createTelencephalonChatTransport(options: TelencephalonChatTransportOptions) {
  const { conversationId, agent } = options;

  return {
    async sendMessages({
      messages,
      abortSignal,
    }: {
      messages: unknown;
      abortSignal?: AbortSignal;
    }) {
      const newMessages = (messages as Array<{ role: string; content?: unknown }>)
        .filter((m) => m.role === 'user')
        .pop();

      const text = extractTextFromMessage(newMessages);
      if (!text) return Promise.resolve({ stream: emptyReadableStream() });

      const stream = telencephalonClient.streamMessage(conversationId, {
        text,
        agent,
      });

      const transformer = new TransformStream({
        start(controller) {
          const unsubscribe = subscribe(stream, {
            onChunk: (chunk) => {
              try {
                controller.enqueue(chunk);
              } catch {
                // controller may already be closed if abort fired
              }
            },
            onError: (err) => {
              try {
                controller.enqueue({
                  type: 'error',
                  errorText: err instanceof Error ? err.message : String(err),
                });
                controller.error(err);
              } catch {
                // ignore
              }
            },
            onDone: () => {
              try {
                (controller as unknown as { close: () => void }).close();
              } catch {
                // ignore
              }
            },
          });

          abortSignal?.addEventListener('abort', () => {
            unsubscribe();
            try {
              (controller as unknown as { close: () => void }).close();
            } catch {
              // ignore
            }
          });
        },
      });

      return Promise.resolve({ stream: transformer.readable });
    },

    async reconnectToStream() {
      return null;
    },
  };
}

function emptyReadableStream(): ReadableStream<CortexWireChunk> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as { content?: unknown; parts?: Array<{ text?: string }> };
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.parts)) {
    return m.parts
      .map((p) => p?.text ?? '')
      .filter(Boolean)
      .join('');
  }
  return '';
}

export type CortexChatTransport = ReturnType<typeof createTelencephalonChatTransport>;
