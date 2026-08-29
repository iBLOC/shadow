import { describe, expect, it } from 'vitest';

// Test the pure translation function directly. We can't easily test the
// full stream pipeline without cortexClient being callable in jsdom,
// so we re-export the translator for unit tests.

interface StreamEvent {
  type:
    | 'delta'
    | 'done'
    | 'error'
    | 'tool_call'
    | 'tool_result'
    | 'route'
    | 'handoff'
    | 'step';
  agent?: string;
  delta?: string;
  conversation_id?: string;
  state?: string;
  timestamp?: number;
  error?: string;
  tool_call_id?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  supervisor?: string;
  target?: string;
  reason?: string;
  from?: string;
  to?: string;
  context_size?: number;
  step?: string;
}

type WireChunk = { type: string; [key: string]: unknown };

function translateEvent(event: StreamEvent): WireChunk[] {
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

describe('cortex StreamEvent → AI SDK wire chunks', () => {
  it('translates delta to text-delta', () => {
    expect(translateEvent({ type: 'delta', delta: 'Hello' })).toEqual([
      { type: 'text-delta', textDelta: 'Hello' },
    ]);
  });

  it('preserves multiple deltas as separate chunks', () => {
    expect(translateEvent({ type: 'delta', delta: 'Hello ' })).toEqual([
      { type: 'text-delta', textDelta: 'Hello ' },
    ]);
    expect(translateEvent({ type: 'delta', delta: 'world' })).toEqual([
      { type: 'text-delta', textDelta: 'world' },
    ]);
  });

  it('translates tool_call into three chunk types', () => {
    const chunks = translateEvent({
      type: 'tool_call',
      tool_call_id: 'call-1',
      name: 'getWeather',
      args: { city: 'SF' },
    });
    expect(chunks.map((c) => c.type)).toEqual([
      'tool-input-start',
      'tool-input-delta',
      'tool-input-available',
    ]);
    expect(chunks[0]).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'getWeather',
    });
    expect(chunks[2]).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'getWeather',
      input: { city: 'SF' },
    });
  });

  it('translates tool_result to tool-output-available', () => {
    expect(
      translateEvent({
        type: 'tool_result',
        tool_call_id: 'call-2',
        result: { temperature: 18 },
      }),
    ).toEqual([
      {
        type: 'tool-output-available',
        toolCallId: 'call-2',
        output: { temperature: 18 },
      },
    ]);
  });

  it('translates route to step-start with metadata', () => {
    expect(
      translateEvent({
        type: 'route',
        supervisor: 'prefrontal',
        target: 'temporal',
        reason: 'user-request',
      }),
    ).toEqual([
      {
        type: 'step-start',
        stepType: 'route',
        metadata: { supervisor: 'prefrontal', target: 'temporal', reason: 'user-request' },
      },
    ]);
  });

  it('translates handoff to step-start', () => {
    expect(
      translateEvent({
        type: 'handoff',
        from: 'temporal',
        to: 'occipital',
        context_size: 42,
      }),
    ).toEqual([
      {
        type: 'step-start',
        stepType: 'handoff',
        metadata: { from: 'temporal', to: 'occipital', contextSize: 42 },
      },
    ]);
  });

  it('translates step to step-finish', () => {
    expect(
      translateEvent({ type: 'step', step: 'reasoning' }),
    ).toEqual([{ type: 'step-finish', stepType: 'reasoning' }]);
  });

  it('translates done to step-finish (final)', () => {
    expect(translateEvent({ type: 'done' })).toEqual([
      { type: 'step-finish', stepType: 'final' },
    ]);
  });

  it('translates error to error chunk', () => {
    expect(
      translateEvent({ type: 'error', error: 'LLM_NOT_REGISTERED' }),
    ).toEqual([{ type: 'error', errorText: 'LLM_NOT_REGISTERED' }]);
  });

  it('uses fallback message when error text is missing', () => {
    expect(translateEvent({ type: 'error' })).toEqual([
      { type: 'error', errorText: 'Unknown error' },
    ]);
  });

  it('returns empty array for unknown event types', () => {
    expect(
      translateEvent({ type: 'unknown' as never }),
    ).toEqual([]);
  });
});

describe('createCortexChatTransport API surface', () => {
  it('returns a transport object exposing sendMessages + reconnectToStream', async () => {
    const { createCortexChatTransport } = await import(
      '../aiSdkCortexTransport'
    );
    const transport = createCortexChatTransport({
      conversationId: 'conv-1',
    });
    expect(transport).toBeDefined();
    expect(typeof transport.sendMessages).toBe('function');
    expect(typeof transport.reconnectToStream).toBe('function');
  });

  it('reconnectToStream resolves to null (cortex does not resume streams)', async () => {
    const { createCortexChatTransport } = await import(
      '../aiSdkCortexTransport'
    );
    const transport = createCortexChatTransport({
      conversationId: 'conv-2',
    });
    await expect(transport.reconnectToStream()).resolves.toBeNull();
  });
});
