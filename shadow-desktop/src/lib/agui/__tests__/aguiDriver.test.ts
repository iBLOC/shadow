import { describe, expect, it } from 'vitest';

import { AguiClient } from '../client';
import { AguiDriver } from '../driver';
import type { AguiToolCall, AguiToolOutcome } from '../driver';
import type { AguiMessage } from '../types';

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
  url: string;
  body: { messages: AguiMessage[] };
}

function makeDriver(
  responses: { chunks: string[]; status?: number }[],
  executeTool?: (call: AguiToolCall) => Promise<AguiToolOutcome>,
) {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return fakeResponse(r.chunks, r.status ?? 200);
  }) as unknown as typeof fetch;
  const client = new AguiClient({
    baseUrl: 'http://127.0.0.1:8787',
    readHeaders: async () => ({}),
    fetchImpl,
  });
  const driver = new AguiDriver({
    client,
    ...(executeTool ? { executeTool } : {}),
  });
  return { driver, calls };
}

const TOOL_ROUND = [
  'data:{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme"}\n\n',
  'data:{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"color\\":\\"indigo\\"}"}\n\n',
  'data:{"type":"TOOL_CALL_END","toolCallId":"tc1"}\n\n',
  'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
];

describe('AguiDriver', () => {
  it('没有工具 ⇒ ⇒ 一轮就完(只发一次请求)', async () => {
    const { driver, calls } = makeDriver([
      {
        chunks: [
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
        ],
      },
    ]);
    const kinds: string[] = [];
    const texts: string[] = [];
    for await (const ev of driver.streamTurn('c', [{ role: 'user', content: 'hi' }])) {
      kinds.push(ev.kind);
      if (ev.kind === 'text') texts.push(ev.delta);
    }
    expect(calls).toHaveLength(1);
    expect(kinds).toEqual(['text', 'finished']);
    expect(texts.join('')).toBe('你好');
  });

  it('端脑点了名 ⇒ ⇒ 设备跑完 ⇒ ⇒ 结果随**下一次请求**带回去(续轮)', async () => {
    const executed: string[] = [];
    const { driver, calls } = makeDriver(
      [
        { chunks: TOOL_ROUND },
        {
          chunks: [
            'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m2","delta":"换好了"}\n\n',
            'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
          ],
        },
      ],
      async (call) => {
        executed.push(call.toolCallName);
        return { ok: true, content: 'indigo' };
      },
    );
    const kinds: string[] = [];
    for await (const ev of driver.streamTurn('c', [{ role: 'user', content: '换个主题' }])) {
      kinds.push(ev.kind);
    }
    expect(executed).toEqual(['set_theme']);
    expect(calls).toHaveLength(2);
    expect(kinds).toEqual(['tool_call', 'text', 'finished']);
    const second = calls[1].body.messages;
    expect(second[second.length - 1]).toEqual({
      role: 'tool',
      toolCallId: 'tc1',
      content: 'indigo',
    });
  });

  it('工具失败 ⇒ ⇒ 回传的那条**必须带 error**(不许长得像成功)', async () => {
    const { driver, calls } = makeDriver(
      [
        { chunks: TOOL_ROUND },
        {
          chunks: ['data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n'],
        },
      ],
      async () => ({ ok: false, content: '', error: '主题服务拒绝' }),
    );
    const kinds: string[] = [];
    let failure = '';
    for await (const ev of driver.streamTurn('c', [{ role: 'user', content: '换个主题' }])) {
      kinds.push(ev.kind);
      if (ev.kind === 'tool_failed') failure = ev.error;
    }
    expect(kinds).toContain('tool_failed');
    expect(failure).toBe('主题服务拒绝');
    const second = calls[1].body.messages;
    expect(second[second.length - 1]).toEqual({
      role: 'tool',
      toolCallId: 'tc1',
      content: '',
      error: '主题服务拒绝',
    });
  });

  it('这台设备干不了 ⇒ ⇒ **合成一条失败结果**回传(模型不干等)', async () => {
    const { driver, calls } = makeDriver([
      { chunks: TOOL_ROUND },
      { chunks: ['data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n'] },
    ]);
    const kinds: string[] = [];
    for await (const ev of driver.streamTurn('c', [{ role: 'user', content: '换个主题' }])) {
      kinds.push(ev.kind);
    }
    expect(kinds).toContain('tool_failed');
    expect(calls).toHaveLength(2);
    const second = calls[1].body.messages;
    const last = second[second.length - 1];
    expect(last.role).toBe('tool');
    expect(last.toolCallId).toBe('tc1');
    expect(typeof last.error).toBe('string');
  });

  it('RUN_ERROR ⇒ ⇒ 抛且**带上端脑的原话**', async () => {
    const { driver } = makeDriver([
      {
        chunks: [
          'data:{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r9"}}\n\n',
        ],
      },
    ]);
    await expect(async () => {
      for await (const _ of driver.streamTurn('c', [{ role: 'user', content: 'hi' }])) {
        void _;
      }
    }).rejects.toThrow(/设备拒绝了/);
  });

  it('流没跑完就断(没有 RUN_FINISHED) ⇒ ⇒ 抛(不许当成跑完了)', async () => {
    const { driver } = makeDriver([
      {
        chunks: ['data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"半句"}\n\n'],
      },
    ]);
    await expect(async () => {
      for await (const _ of driver.streamTurn('c', [{ role: 'user', content: 'hi' }])) {
        void _;
      }
    }).rejects.toThrow(/without RUN_FINISHED/);
  });

  it('续轮里又点了名 ⇒ ⇒ 再续一轮(三次请求)', async () => {
    const { driver, calls } = makeDriver(
      [
        { chunks: TOOL_ROUND },
        {
          chunks: [
            'data:{"type":"TOOL_CALL_START","toolCallId":"tc2","toolCallName":"set_theme"}\n\n',
            'data:{"type":"TOOL_CALL_END","toolCallId":"tc2"}\n\n',
            'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r2"}\n\n',
          ],
        },
        { chunks: ['data:{"type":"RUN_FINISHED","threadId":"t","runId":"r3"}\n\n'] },
      ],
      async () => ({ ok: true, content: 'ok' }),
    );
    for await (const _ of driver.streamTurn('c', [{ role: 'user', content: '换个主题' }])) {
      void _;
    }
    expect(calls).toHaveLength(3);
  });

  it('lobe 那边的工具结果(CUSTOM) ⇒ ⇒ 吐成 tool_result(不许丢)', async () => {
    const { driver } = makeDriver([
      {
        chunks: [
          'data:{"type":"CUSTOM","name":"telencephalon_tool_result","value":{"agent":"a1","name":"get_weather","result":"晴","toolCallId":"tc7"}}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
        ],
      },
    ]);
    const kinds: string[] = [];
    let name = '';
    for await (const ev of driver.streamTurn('c', [{ role: 'user', content: '天气?' }])) {
      kinds.push(ev.kind);
      if (ev.kind === 'tool_result') name = ev.name;
    }
    expect(kinds).toEqual(['tool_result', 'finished']);
    expect(name).toBe('get_weather');
  });
});
