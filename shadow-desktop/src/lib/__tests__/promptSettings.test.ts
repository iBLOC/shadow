import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 桌面的对话**一律**走端脑（Tauri 与 Web 同一条链路）：会话创建 +
// `/shadow/v1/conversations/{id}/messages:stream`。
// 人设提示词随会话创建送出去，端脑记进会话记录。
//
// 这些用例同时是「不许退回直连 neuron」的反向验证：Tauri 环境下
// 断言请求打的是端脑的路径，且 `neuron_infer` 一次都没被调用。
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('system prompt wiring', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    invokeMock.mockReset();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  describe('composeSystemPrompt', () => {
    it('returns the built-in baseline when no persona is configured', async () => {
      const { composeSystemPrompt } = await import('../telencephalonClient');
      const prompt = composeSystemPrompt();
      expect(prompt).toContain('/no_think');
      expect(prompt).not.toContain('\n\n');
    });

    it('ignores a blank persona', async () => {
      const { composeSystemPrompt } = await import('../telencephalonClient');
      expect(composeSystemPrompt('   \n  ')).toBe(composeSystemPrompt());
    });

    it('appends the persona after the baseline so /no_think survives', async () => {
      const { composeSystemPrompt } = await import('../telencephalonClient');
      const prompt = composeSystemPrompt('Always answer in Chinese.');
      expect(prompt).toContain('Always answer in Chinese.');
      expect(prompt).toContain('/no_think');
      expect(prompt.indexOf('/no_think')).toBeLessThan(
        prompt.indexOf('Always answer in Chinese.'),
      );
    });
  });

  describe('createConversation', () => {
    it('sends the system prompt with the conversation creation request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'conv-1',
          agent: 'temporal',
          created_at: '',
          updated_at: '',
          history: [],
        }),
      });
      const { TelencephalonClient } = await import('../telencephalonClient');
      const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });

      await client.createConversation({ system: 'You are terse.' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/shadow/v1/conversations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ system: 'You are terse.' }),
        }),
      );
    });
  });

  describe('端脑链路（Tauri 桌面端）', () => {
    it('Tauri 下开会话仍然打端脑，不回退到本地桩', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'conv-1',
          agent: 'temporal',
          created_at: '',
          updated_at: '',
          history: [],
        }),
      });

      const { TelencephalonClient } = await import('../telencephalonClient');
      const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });

      const conv = await client.createConversation({ system: 'You are terse.' });

      expect(conv.id).toBe('conv-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/shadow/v1/conversations',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('Tauri 下消息流走端脑的 messages:stream，绝不直连 neuron', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      const encoder = new TextEncoder();
      const sse = [
        'data: {"type":"delta","agent":"temporal","delta":"hi"}',
        '',
        'data: {"type":"done","conversation_id":"conv-1"}',
        '',
        '',
      ].join('\n');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let sent = false;
            return {
              read: async () => {
                if (sent) return { done: true, value: undefined };
                sent = true;
                return { done: false, value: encoder.encode(sse) };
              },
            };
          },
        },
      });

      const { TelencephalonClient } = await import('../telencephalonClient');
      const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });

      const deltas: string[] = [];
      for await (const event of client.streamMessage('conv-1', { text: 'hello' })) {
        if (event.type === 'delta') deltas.push(event.delta ?? '');
      }

      expect(deltas.join('')).toContain('hi');
      const url = String(mockFetch.mock.calls[0][0]);
      expect(url).toBe(
        'http://localhost:60080/shadow/v1/conversations/conv-1/messages:stream',
      );
      // 链路断言：不能出现任何直连 neuron 的迹象。
      expect(url).not.toContain('/v1/chat/completions');
      // ⚠️⚠️ **允许一次「取凭据」的 invoke** —— SSE 这条路由在 shadow 门后面，
      // 而桌面端**递不出 shadow key**（宿主没生成过那把钥匙）⇒ ⇒ 它得问宿主
      // 要 admin token（`get_admin_token`）⇒ ⇒ 否则端脑一把门关上，对话就 401。
      //
      // ⇒ 断言钉的是「**对话不许走 Tauri 命令**」（不许有别的 invoke），
      // **不是**「一次 invoke 都不许有」—— 那是**机制**，不是**意图**。
      const invokedCommands = invokeMock.mock.calls.map((c) => c[0]);
      expect(invokedCommands.filter((c) => c !== 'get_admin_token')).toEqual([]);
    });
  });
});
