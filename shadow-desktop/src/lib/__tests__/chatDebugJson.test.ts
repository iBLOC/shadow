import { describe, expect, it } from 'vitest';
import {
  CHAT_DEBUG_CONVERSATION_SCHEMA,
  CHAT_DEBUG_MESSAGE_SCHEMA,
  CHAT_DEBUG_SCHEMA_VERSION,
  CHAT_DEBUG_SOURCE_DESKTOP,
  buildChatConversationDebugJson,
  buildChatMessageDebugJson,
} from '../chatDebugJson';
import type { Conversation, Message } from '../../types';

const copiedAt = new Date('2026-11-13T12:34:56.789Z');

const userMessage: Message = {
  id: 'm1',
  role: 'user',
  content: '帮我看看这个报错',
  timestamp: new Date('2026-11-13T12:00:00.000Z'),
};

const assistantMessage: Message = {
  id: 'm2',
  role: 'assistant',
  content: '好的',
  timestamp: new Date('2026-11-13T12:01:00.000Z'),
  token_stats: { tokens: 12, durationMs: 1500, tokensPerSecond: 8.0 },
  tool_call: {
    id: 'call-1',
    name: 'set_theme',
    args: { theme: 'dark' },
    status: 'awaiting-approval',
    reported: false,
  },
};

function conversationWith(messages: Message[]): Conversation {
  return {
    id: 'conv-42',
    agentId: 'prefrontal',
    sessionId: 'sess-9',
    title: '调试会话',
    messages,
    createdAt: new Date('2026-11-13T11:59:00.000Z'),
    updatedAt: new Date('2026-11-13T12:02:00.000Z'),
  };
}

describe('单条消息 JSON', () => {
  it('信封：schema/版本/来源/会话上下文/第几条 —— 一个不少', () => {
    const conversation = conversationWith([userMessage, assistantMessage]);
    const raw = buildChatMessageDebugJson({
      conversation,
      message: assistantMessage,
      index: 1,
      copiedAt,
    });
    const json = JSON.parse(raw);

    expect(json.schema).toBe(CHAT_DEBUG_MESSAGE_SCHEMA);
    expect(json.schema_version).toBe(CHAT_DEBUG_SCHEMA_VERSION);
    expect(json.source).toBe(CHAT_DEBUG_SOURCE_DESKTOP);
    expect(json.copied_at).toBe('2026-11-13T12:34:56.789Z');
    expect(json.conversation).toEqual({
      id: 'conv-42',
      session_id: 'sess-9',
      agent: 'prefrontal',
      title: '调试会话',
      kind: 'text', // 老数据没有 kind ⇒ 如实按文本会话
      archived: false,
      message_count: 2,
      created_at: '2026-11-13T11:59:00.000Z',
      updated_at: '2026-11-13T12:02:00.000Z',
    });
    expect(json.message_index).toBe(1);
    expect(json.message.id).toBe('m2');
    expect(json.message.role).toBe('assistant');
    expect(json.message.content).toBe('好的');
    // Date 必须转 ISO —— 直接 JSON.stringify(Date) 依赖运行时默认格式。
    expect(json.message.timestamp).toBe('2026-11-13T12:01:00.000Z');
  });

  it('工具调用与 token 读数原样带上（调试最缺的那一半）', () => {
    const conversation = conversationWith([assistantMessage]);
    const json = JSON.parse(
      buildChatMessageDebugJson({
        conversation,
        message: assistantMessage,
        index: 0,
        copiedAt,
      }),
    );

    expect(json.message.tool_call).toEqual({
      id: 'call-1',
      name: 'set_theme',
      args: { theme: 'dark' },
      status: 'awaiting-approval',
      reported: false,
    });
    expect(json.message.token_stats).toEqual({
      tokens: 12,
      durationMs: 1500,
      tokensPerSecond: 8.0,
    });
  });
});

describe('整段聊天记录 JSON', () => {
  it('逐条按原顺序、带流式尾巴与原始错误', () => {
    const conversation = conversationWith([userMessage, assistantMessage]);
    const json = JSON.parse(
      buildChatConversationDebugJson({
        conversation,
        streamingText: '正在生成',
        errorMessage: 'Error: boom',
        copiedAt,
      }),
    );

    expect(json.schema).toBe(CHAT_DEBUG_CONVERSATION_SCHEMA);
    expect(json.conversation.message_count).toBe(2);
    expect(json.messages.map((m: Message) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(json.messages.map((m: Message) => m.content)).toEqual([
      '帮我看看这个报错',
      '好的',
    ]);
    expect(json.messages[0].timestamp).toBe('2026-11-13T12:00:00.000Z');
    expect(json.streaming_text).toBe('正在生成');
    expect(json.error_message).toBe('Error: boom');
  });

  it('没有流式尾巴 / 没有错误 ⇒ 两个键都不出现', () => {
    const conversation = conversationWith([userMessage]);
    const json = JSON.parse(
      buildChatConversationDebugJson({ conversation, copiedAt }),
    );

    expect(Object.prototype.hasOwnProperty.call(json, 'streaming_text')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(json, 'error_message')).toBe(
      false,
    );
  });
});
