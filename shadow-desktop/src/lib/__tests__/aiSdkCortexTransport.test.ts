import { describe, expect, it } from 'vitest';
import { translateEvent } from '../aiSdkTelencephalonTransport';

// Test the pure translation function directly. We can't easily test the
// full stream pipeline without telencephalonClient being callable in jsdom,
// so the translator is **exported** for unit tests.
//
// ⚠️ The test must exercise the **real** translator, not a copy of it.
// This file used to carry a hand-copied `translateEvent` — which is why
// the `args` double-encoding bug (the brain sends `args` as JSON *text*)
// survived: a copy can never catch a regression in the original.

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

  it('normalizes args that arrive as JSON **text** (the wire shape)', () => {
    // ⚠️ 端脑的 `ToolCall.args` 是 `String` ⇒ 线上 `args` 是一段 JSON 文本，
    // 不是对象。直接用 `event.args` 的话：`input` 会是一段**字符串**
    // （工具拿到的参数全是空的），`inputTextDelta` 还会**双重编码**。
    const chunks = translateEvent({
      type: 'tool_call',
      tool_call_id: 'call-1',
      name: 'set_theme',
      args: '{"color":"#71717A"}',
    });

    expect(chunks[2]).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'set_theme',
      input: { color: '#71717A' },
    });
    expect(chunks[1]).toMatchObject({
      inputTextDelta: '{"color":"#71717A"}',
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

describe('createTelencephalonChatTransport API surface', () => {
  it('returns a transport object exposing sendMessages + reconnectToStream', async () => {
    const { createTelencephalonChatTransport } = await import(
      '../aiSdkTelencephalonTransport'
    );
    const transport = createTelencephalonChatTransport({
      conversationId: 'conv-1',
    });
    expect(transport).toBeDefined();
    expect(typeof transport.sendMessages).toBe('function');
    expect(typeof transport.reconnectToStream).toBe('function');
  });

  it('reconnectToStream resolves to null (cortex does not resume streams)', async () => {
    const { createTelencephalonChatTransport } = await import(
      '../aiSdkTelencephalonTransport'
    );
    const transport = createTelencephalonChatTransport({
      conversationId: 'conv-2',
    });
    await expect(transport.reconnectToStream()).resolves.toBeNull();
  });
});
