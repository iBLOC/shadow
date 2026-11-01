import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SYSTEM_TURN_PREFIX,
  TOOL_RESULT_TURN_PREFIX,
  bodyText,
  displayableTurns,
  isSystemTurn,
  isToolResultTurn,
  turnTimestamp,
  type ConversationTurn,
} from '../telencephalonClient';

/**
 * 端脑把会话的**人设**存成**第一条**轮次（role=agent + [system] 前缀），
 * 工具结果存成 [tool_result] 前缀的轮次。
 *
 * ⚠️ 这些用例钉的是**客户端自己的口径**（前缀常量 + 判别 + 剥壳）；
 * 「前缀与服务端一致」由 scripts/check-conversation-prefix.mjs 钉。
 * ⚠️ mock 里的前缀用**服务端的字面量**（不是本文件的常量）
 * ⇒ ⇒ 有人把常量改错了，这些用例照样红。
 */
const personaTurn: ConversationTurn = {
  role: 'agent',
  text: SYSTEM_TURN_PREFIX + 'You are Shadow, terse.',
  at: '2026-11-01T09:00:00Z',
};

const userTurn: ConversationTurn = {
  role: 'user',
  text: '你好',
  at: '2026-11-01T09:00:01Z',
};

const toolTurn: ConversationTurn = {
  role: 'agent',
  text: TOOL_RESULT_TURN_PREFIX + 'read_file → ok',
  at: '2026-11-01T09:00:02Z',
};

describe('端脑会话内容口径（桌面端）', () => {
  it('前缀常量与服务端一致', () => {
    expect(SYSTEM_TURN_PREFIX).toBe('[system] ');
    expect(TOOL_RESULT_TURN_PREFIX).toBe('[tool_result] ');
  });

  it('认得出人设那条', () => {
    expect(isSystemTurn(personaTurn)).toBe(true);
    expect(isSystemTurn(userTurn)).toBe(false);
    expect(isSystemTurn(toolTurn)).toBe(false);
  });

  it('认得出工具结果那条', () => {
    expect(isToolResultTurn(toolTurn)).toBe(true);
    expect(isToolResultTurn(personaTurn)).toBe(false);
    expect(isToolResultTurn(userTurn)).toBe(false);
  });

  it('剥掉工具结果的前缀，其余原样', () => {
    expect(bodyText(toolTurn)).toBe('read_file → ok');
    expect(bodyText(userTurn)).toBe('你好');
    expect(bodyText(personaTurn)).toBe(SYSTEM_TURN_PREFIX + 'You are Shadow, terse.');
  });

  it('给人看的轮次里没有人设那条', () => {
    const shown = displayableTurns([personaTurn, userTurn, toolTurn]);
    expect(shown.map((t) => t.text)).toEqual(['你好', 'read_file → ok']);
  });

  it('时间戳优先 at，退回 timestamp', () => {
    expect(turnTimestamp({ role: 'agent', text: 'x', at: '2026-11-01T09:00:00Z' })).toBe(
      Date.parse('2026-11-01T09:00:00Z'),
    );
    expect(turnTimestamp({ role: 'agent', text: 'x', at: '', timestamp: 1234 })).toBe(1234);
    expect(turnTimestamp({ role: 'agent', text: 'x', at: '' })).toBe(0);
  });
});

describe('端脑返回的人设不会变成大脑发言', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getConversation 拿回的历史里，人设那条被跳过', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'conv-1',
        agent: 'temporal',
        created_at: '2026-11-01T09:00:00Z',
        updated_at: '2026-11-01T09:00:00Z',
        history: [
          { role: 'agent', text: '[system] You are Shadow, terse.', at: '2026-11-01T09:00:00Z' },
          { role: 'user', text: '你好', at: '2026-11-01T09:00:01Z' },
        ],
      }),
    });
    const { TelencephalonClient } = await import('../telencephalonClient');
    const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });
    const conv = await client.getConversation('conv-1');
    const shown = displayableTurns(conv.history);
    expect(shown.map((t) => t.text)).toEqual(['你好']);
    expect(shown.some((t) => t.text.includes('You are Shadow'))).toBe(false);
  });
});