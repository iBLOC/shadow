import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The desktop chat path differs by platform:
//   - Tauri (desktop app): the conversation runs on the embedded neuron,
//     so the system prompt has to be part of the local message history.
//   - Web: the conversation runs on telencephalon, so the prompt has to be
//     attached to the conversation creation request.
// Both paths must carry the prompt the user configured on the prompt
// settings page — otherwise the settings page is a no-op.
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

  describe('embedded neuron path (Tauri)', () => {
    it('puts the persona into the system message of the neuron request', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      // Model catalog unreachable → the client falls back to its default id.
      mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
      invokeMock.mockResolvedValue({
        status: 200,
        body: { choices: [{ message: { content: 'hi' } }] },
      });

      const { TelencephalonClient } = await import('../telencephalonClient');
      const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });

      for await (const _event of client.streamMessage(
        'conv-1',
        { text: 'hello' },
        { system: 'You are terse.' },
      )) {
        // drain
      }

      const call = invokeMock.mock.calls.find((c) => c[0] === 'neuron_infer');
      expect(call).toBeDefined();
      const payload = JSON.parse(Buffer.from(call![1].body as number[]).toString('utf8'));
      expect(payload.messages[0].role).toBe('system');
      expect(payload.messages[0].content).toContain('You are terse.');
      expect(payload.messages[0].content).toContain('/no_think');
      expect(payload.messages[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('keeps the system message in sync when the persona changes mid-conversation', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
      invokeMock.mockResolvedValue({
        status: 200,
        body: { choices: [{ message: { content: 'hi' } }] },
      });

      const { TelencephalonClient } = await import('../telencephalonClient');
      const client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });

      for await (const _e of client.streamMessage('conv-1', { text: 'a' }, { system: 'first' })) {
        // drain
      }
      for await (const _e of client.streamMessage('conv-1', { text: 'b' }, { system: 'second' })) {
        // drain
      }

      const calls = invokeMock.mock.calls.filter((c) => c[0] === 'neuron_infer');
      const last = JSON.parse(
        Buffer.from(calls[calls.length - 1][1].body as number[]).toString('utf8'),
      );
      expect(last.messages[0].content).toContain('second');
      expect(last.messages[0].content).not.toContain('first');
    });
  });
});
