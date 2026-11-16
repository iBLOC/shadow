import { describe, expect, it } from 'vitest';

import { AguiClient } from '../client';
import { runAguiTurn } from '../conversationTurn';
import type { AguiToolCall } from '../driver';

function fakeResponse(chunks: string[], status = 200, bodyText = 'boom') {
  const encoder = new TextEncoder();
  let i = 0;
  const body = {
    getReader() {
      return {
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
      };
    },
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'test',
    text: async () => bodyText,
    body,
  } as unknown as Response;
}

interface Recorded {
  body: { messages: { role: string; content: unknown; toolCallId?: string; error?: string }[] };
}

function makeClient(responses: { chunks: string[] }[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return fakeResponse(r.chunks);
  }) as unknown as typeof fetch;
  const client = new AguiClient({
    baseUrl: 'http://127.0.0.1:8787',
    readHeaders: async () => ({}),
    fetchImpl,
  });
  return { client, calls };
}

const TOOL_ROUND = [
  'data:{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme"}\n\n',
  'data:{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"color\\":\\"indigo\\"}"}\n\n',
  'data:{"type":"TOOL_CALL_END","toolCallId":"tc1"}\n\n',
  'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
];

/**
 * 一轮驱动的判据 —— 钉的是**页面真正依赖的那几件事**：
 * 文本逐字到界面、工具闭环走完、失败**带着原话**抛出去。
 */
describe('runAguiTurn', () => {
  it('没有工具 ⇒ ⇒ 文本逐字到界面 ＋ 一次请求', async () => {
    const { client, calls } = makeClient([
      {
        chunks: [
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}\n\n',
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":",世界"}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
        ],
      },
    ]);
    const deltas: string[] = [];
    const res = await runAguiTurn(
      client,
      { conversationId: 'c1', content: [{ type: 'text', text: 'hi' }] },
      {
        onTextDelta: (delta) => deltas.push(delta),
        onToolCall: async () => ({ ok: true, content: '' }),
        onToolFailed: () => {},
        onToolResult: () => {},
      },
    );
    expect(calls).toHaveLength(1);
    expect(deltas.join('')).toBe('你好,世界');
    expect(res.text).toBe('你好,世界');
    expect(res.firstDeltaAt).not.toBeNull();
    expect(res.toolCalls).toEqual([]);
  });

  it('端脑点了名 ⇒ ⇒ 界面执行 ⇒ ⇒ 结果随**下一次请求**带回去(续答也吐出来)', async () => {
    const { client, calls } = makeClient([
      { chunks: TOOL_ROUND },
      {
        chunks: [
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m2","delta":"换好了"}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
        ],
      },
    ]);
    const seen: AguiToolCall[] = [];
    const res = await runAguiTurn(
      client,
      { conversationId: 'c1', content: [{ type: 'text', text: '换个主题' }] },
      {
        onTextDelta: () => {},
        onToolCall: async (call) => {
          seen.push(call);
          return { ok: true, content: 'indigo' };
        },
        onToolFailed: () => {},
        onToolResult: () => {},
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].toolCallName).toBe('set_theme');
    expect(seen[0].args).toBe('{"color":"indigo"}');
    expect(calls).toHaveLength(2);
    const second = calls[1].body.messages;
    expect(second[second.length - 1]).toEqual({
      role: 'tool',
      toolCallId: 'tc1',
      content: 'indigo',
    });
    expect(res.text).toBe('换好了');
    expect(res.toolCalls).toEqual([{ id: 'tc1', name: 'set_theme', ok: true }]);
  });

  it('工具失败 ⇒ ⇒ 界面看到失败 ＋ 回传的那条**带 error**', async () => {
    const { client, calls } = makeClient([
      { chunks: TOOL_ROUND },
      { chunks: ['data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n'] },
    ]);
    const failures: string[] = [];
    const res = await runAguiTurn(
      client,
      { conversationId: 'c1', content: [{ type: 'text', text: '换个主题' }] },
      {
        onTextDelta: () => {},
        onToolCall: async () => ({ ok: false, content: '', error: '主题服务拒绝' }),
        onToolFailed: (_call, error) => failures.push(error),
        onToolResult: () => {},
      },
    );
    expect(failures).toEqual(['主题服务拒绝']);
    const second = calls[1].body.messages;
    expect(second[second.length - 1]).toEqual({
      role: 'tool',
      toolCallId: 'tc1',
      content: '',
      error: '主题服务拒绝',
    });
    expect(res.toolCalls).toEqual([{ id: 'tc1', name: 'set_theme', ok: false }]);
  });

  it('RUN_ERROR ⇒ ⇒ 抛且**带上端脑的原话**', async () => {
    const { client } = makeClient([
      {
        chunks: [
          'data:{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r9"}}\n\n',
        ],
      },
    ]);
    await expect(
      runAguiTurn(
        client,
        { conversationId: 'c1', content: [{ type: 'text', text: 'hi' }] },
        {
          onTextDelta: () => {},
          onToolCall: async () => ({ ok: true, content: '' }),
          onToolFailed: () => {},
          onToolResult: () => {},
        },
      ),
    ).rejects.toThrow(/设备拒绝了/);
  });

  it('流没跑完就断 ⇒ ⇒ 抛(不许当成跑完了)', async () => {
    const { client } = makeClient([
      { chunks: ['data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"半句"}\n\n'] },
    ]);
    await expect(
      runAguiTurn(
        client,
        { conversationId: 'c1', content: [{ type: 'text', text: 'hi' }] },
        {
          onTextDelta: () => {},
          onToolCall: async () => ({ ok: true, content: '' }),
          onToolFailed: () => {},
          onToolResult: () => {},
        },
      ),
    ).rejects.toThrow(/without RUN_FINISHED/);
  });

  it('lobe 那边的工具结果 ⇒ ⇒ 界面收得到(不许丢)', async () => {
    const { client } = makeClient([
      {
        chunks: [
          'data:{"type":"CUSTOM","name":"telencephalon_tool_result","value":{"agent":"a1","name":"get_weather","result":"晴"}}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
        ],
      },
    ]);
    const names: string[] = [];
    await runAguiTurn(
      client,
      { conversationId: 'c1', content: [{ type: 'text', text: '天气?' }] },
      {
        onTextDelta: () => {},
        onToolCall: async () => ({ ok: true, content: '' }),
        onToolFailed: () => {},
        onToolResult: (name) => names.push(name),
      },
    );
    expect(names).toEqual(['get_weather']);
  });
});
