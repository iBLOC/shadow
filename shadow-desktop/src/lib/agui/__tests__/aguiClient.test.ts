import { describe, expect, it } from 'vitest';

import { AguiClient, aguiStreamPath, buildAguiUserContent } from '../client';
import {
  aguiToolResults,
  initialAguiTurnState,
  parseAguiEvent,
  parseSseDataLines,
  reduceAguiEvent,
} from '../protocol';

/**
 * AG-UI 客户端（桌面端）—— 判据钉的是**机制**，不是「跑过就算」。
 *
 * ⚠️ **为什么这些要判**：客户端这一层最危险的失败**长得像成功** ——
 * · 事件被静默跳过 ⇒ ⇒ 用户看着「回复少了一段」却不知道为什么；
 * · 附件 part 形状错 ⇒ ⇒ 端脑那边**静默丢掉**（上一刀刚补上的那道拒）
 *   ⇒ ⇒ 图片发出去像没发；
 * · 端脑的原话被改写/吞掉 ⇒ ⇒ 用户不知道自己该内联字节。
 */

describe('parseSseDataLines', () => {
  it('逐帧取 data —— 端脑只发 data(不带 event 名)', () => {
    const { payloads } = parseSseDataLines('data:{"type":"A"}\n\ndata:{"type":"B"}\n');
    expect(payloads).toEqual(['{"type":"A"}', '{"type":"B"}']);
  });

  it('CRLF / 空行 / 注释行 / 非 data 行 —— 都不算事件', () => {
    const { payloads } = parseSseDataLines(': keep-alive\r\n\r\nevent: ping\r\ndata:{"type":"A"}\r\n');
    expect(payloads).toEqual(['{"type":"A"}']);
  });

  it('半行留在 rest(不许丢) ⇒ ⇒ 下一块接上', () => {
    const first = parseSseDataLines('data:{"type":"A"}\ndata:{"typ');
    expect(first.payloads).toEqual(['{"type":"A"}']);
    expect(first.rest).toBe('data:{"typ');
    const second = parseSseDataLines(first.rest + 'e":"B"}\n');
    expect(second.payloads).toEqual(['{"type":"B"}']);
  });
});

describe('parseAguiEvent', () => {
  it('坏 JSON ⇒ 抛(响亮) —— 不静默跳过事件', () => {
    expect(() => parseAguiEvent('{not json')).toThrow(/not valid JSON/);
  });

  it('没有 type ⇒ 抛', () => {
    expect(() => parseAguiEvent('{"a":1}')).toThrow(/carries no type/);
  });

  it('不认识的 type ⇒ 不抛(规范:消费者忽略未知类型)', () => {
    const ev = parseAguiEvent('{"type":"SOMETHING_NEW"}');
    expect(ev.type).toBe('SOMETHING_NEW');
  });
});

describe('reduceAguiEvent', () => {
  it('三段文本事件 ⇒ ⇒ 一条消息、字逐字拼起来', () => {
    let s = initialAguiTurnState();
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}'));
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}'));
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":",世界"}'));
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TEXT_MESSAGE_END","messageId":"m1"}'));
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].text).toBe('你好,世界');
    expect(s.messages[0].ended).toBe(true);
  });

  it('三段工具事件 ⇒ ⇒ 一次调用、参数逐字拼起来', () => {
    let s = initialAguiTurnState();
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme","parentMessageId":"m1"}'));
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"color\\":\\"indigo\\"}"}'));
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"TOOL_CALL_END","toolCallId":"tc1"}'));
    expect(s.toolCalls).toHaveLength(1);
    expect(s.toolCalls[0].toolCallName).toBe('set_theme');
    expect(s.toolCalls[0].args).toBe('{"color":"indigo"}');
    expect(s.toolCalls[0].parentMessageId).toBe('m1');
    expect(s.toolCalls[0].ended).toBe(true);
  });

  it('RUN_FINISHED ⇒ ⇒ 完成(带 outcome) / RUN_ERROR ⇒ ⇒ 失败且**原话**留着', () => {
    let s = initialAguiTurnState();
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"RUN_STARTED","threadId":"t","runId":"r","protocolVersion":"1.0"}'));
    expect(s.runId).toBe('r');
    expect(s.protocolVersion).toBe('1.0');
    s = reduceAguiEvent(s, parseAguiEvent('{"type":"RUN_FINISHED","threadId":"t","runId":"r","outcome":{"type":"cancelled"}}'));
    expect(s.status).toBe('finished');
    expect(s.outcome).toBe('cancelled');

    let f = reduceAguiEvent(initialAguiTurnState(), parseAguiEvent('{"type":"RUN_ERROR","message":"设备拒绝了"}'));
    expect(f.status).toBe('failed');
    expect(f.error).toBe('设备拒绝了');
  });

  it('不认识的类型 ⇒ 记下来但**不炸**(规范:忽略未知类型)', () => {
    const s = reduceAguiEvent(initialAguiTurnState(), parseAguiEvent('{"type":"BRAND_NEW"}'));
    expect(s.unknownEventTypes).toEqual(['BRAND_NEW']);
    expect(s.status).toBe('running');
  });

  it('CUSTOM(端脑的工具结果) ⇒ ⇒ 收进 customs(不许丢) —— lobe 本地工具只走这一条路', () => {
    let s = initialAguiTurnState();
    s = reduceAguiEvent(
      s,
      parseAguiEvent(
        '{"type":"CUSTOM","name":"telencephalon_tool_result","value":{"agent":"a1","name":"get_weather","result":"晴","toolCallId":"tc9"}}',
      ),
    );
    expect(s.customs).toHaveLength(1);
    expect(s.customs[0].name).toBe('telencephalon_tool_result');
    const results = aguiToolResults(s);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('get_weather');
    expect(results[0].result).toBe('晴');
    expect(results[0].toolCallId).toBe('tc9');
  });

  it('RUN_ERROR 的 runId 在 metadata 里 ⇒ ⇒ 失败也要能对上这一轮', () => {
    const f = reduceAguiEvent(
      initialAguiTurnState(),
      parseAguiEvent('{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r-7"}}'),
    );
    expect(f.status).toBe('failed');
    expect(f.error).toBe('设备拒绝了');
    expect(f.runId).toBe('r-7');
  });

  it('RUN_FINISHED 的 metadata.telencephalonState ⇒ ⇒ 端脑自己的状态原样带出', () => {
    const s = reduceAguiEvent(
      initialAguiTurnState(),
      parseAguiEvent(
        '{"type":"RUN_FINISHED","threadId":"t","runId":"r","outcome":{"type":"cancelled"},"metadata":{"telencephalonState":"INTERRUPTED"}}',
      ),
    );
    expect(s.endState).toBe('INTERRUPTED');
    expect(s.outcome).toBe('cancelled');
  });
});

describe('buildAguiUserContent', () => {
  it('文本 ＋ 图片 ⇒ ⇒ 规范形状(data source ＋ mimeType)', () => {
    const parts = buildAguiUserContent('这是什么', [{ mediaType: 'image/png', base64: 'aGVsbG8=' }]);
    expect(parts).toEqual([
      { type: 'text', text: '这是什么' },
      { type: 'image', source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' } },
    ]);
  });

  it('**没有**远程 URL 这条入口(端脑不去拉 ⇒ ⇒ 客户端必须内联)', () => {
    const parts = buildAguiUserContent('x', [{ mediaType: 'application/pdf', base64: 'QUJD' }]);
    for (const p of parts) {
      if (p.type === 'text') continue;
      expect(p.source.type).toBe('data');
    }
  });

  it('音频 ＋ 文档 ⇒ ⇒ part 类型按 MIME 分档(端脑按 type 收)', () => {
    const parts = buildAguiUserContent('', [
      { mediaType: 'audio/mpeg', base64: 'QQ==' },
      { mediaType: 'application/pdf', base64: 'QQ==' },
    ]);
    expect(parts.map((p) => p.type)).toEqual(['audio', 'document']);
  });
});

describe('AguiClient.streamTurn', () => {
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

  it('逐事件吐出来 ⇒ ⇒ 请求体逐字是端脑认得的那份形状', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return fakeResponse([
        'data:{"type":"RUN_STARTED","threadId":"t","runId":"r","protocolVersion":"1.0"}\n\n',
        'data:{"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}\n\n',
        'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"hi"}\n\n',
        'data:{"type":"TEXT_MESSAGE_END","messageId":"m1"}\n\n',
        'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r"}\n\n',
      ]);
    }) as unknown as typeof fetch;

    const client = new AguiClient({
      baseUrl: 'http://127.0.0.1:8787',
      readHeaders: async () => ({ 'x-shadow-key': 'k' }),
      fetchImpl,
    });
    const seen: string[] = [];
    for await (const ev of client.streamTurn('conv-1', {
      messages: [
        {
          role: 'user',
          content: buildAguiUserContent('这是什么', [{ mediaType: 'image/png', base64: 'aGVsbG8=' }]),
        },
      ],
    })) {
      seen.push(ev.type);
    }
    expect(seen).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:8787' + aguiStreamPath('conv-1'));
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.messages[0].content).toEqual([
      { type: 'text', text: '这是什么' },
      { type: 'image', source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' } },
    ]);
  });

  it('非 2xx ⇒ 抛且**带上端脑的原话**(用户能看懂自己错在哪)', async () => {
    const fetchImpl = (async () =>
      fakeResponse([], 400, 'the image part points at a remote URL — inline the bytes')) as unknown as typeof fetch;
    const client = new AguiClient({
      baseUrl: 'http://127.0.0.1:8787',
      readHeaders: async () => ({}),
      fetchImpl,
    });
    await expect(async () => {
      for await (const _ of client.streamTurn('c', { messages: [{ role: 'user', content: 'hi' }] })) {
        void _;
      }
    }).rejects.toThrow(/inline the bytes/);
  });

  it('最后一帧没有换行符收尾 ⇒ ⇒ 也要读到(不许丢最后一帧)', async () => {
    const fetchImpl = (async () =>
      fakeResponse(['data:{"type":"RUN_FINISHED","threadId":"t","runId":"r"}'])) as unknown as typeof fetch;
    const client = new AguiClient({
      baseUrl: 'http://127.0.0.1:8787',
      readHeaders: async () => ({}),
      fetchImpl,
    });
    const seen: string[] = [];
    for await (const ev of client.streamTurn('c', { messages: [{ role: 'user', content: 'hi' }] })) {
      seen.push(ev.type);
    }
    expect(seen).toEqual(['RUN_FINISHED']);
  });
});
