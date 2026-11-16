import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConversationPage } from '../../src/pages/ConversationPage';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useChatDisplayStore } from '../../src/stores/chatDisplayStore';

// Real telencephalonClient would require the embedded neuron; mock the
// generator so we can drive the stream end-to-end inside jsdom.
// `setBaseUrl` exists on the real client and is called from
// `companionModeStore` via `prefrontalClient` during module init, so the
// mock must keep every method the import chain touches.
// ⚠️ **AG-UI 那一路**：页面现在走 `ag-ui:stream`（POST ＋ SSE）
// ⇒ ⇒ 这里 mock 的是 **fetch**（协议形状），不是 legacy 的 `streamMessage`。
vi.mock('../../src/lib/telencephalonClient', () => {
  return {
    composeSystemPrompt: (custom?: string) => (custom ?? '').trim(),
    telencephalonClient: {
      setBaseUrl: vi.fn(),
      getBaseUrl: () => 'http://127.0.0.1:60080',
      readHeaders: async () => ({}),
      createConversation: vi.fn(async () => ({ id: 'c1' })),
    },
  };
});

/** 一份 AG-UI 的 SSE 响应（端脑每帧一行 data）。 */
function aguiSse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
    body: {
      getReader() {
        return {
          read: async () =>
            i < frames.length
              ? { done: false, value: encoder.encode(frames[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  } as unknown as Response;
}

vi.mock('../../src/lib/wakeWordDetector', () => ({
  WakeWordDetector: class {
    available = false;
    onWakeWord() { return () => {}; }
    start() {}
    stop() {}
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock('react-i18next', () => ({
  // Per-file mock so this suite is independent of the i18n shape used
  // by the project's JSON files (which use i18next's `{{var}}`
  // placeholders). The setupFiles mock only knows single-brace
  // placeholders, so re-declaring here makes interpolation behave the
  // same way the real runtime would.
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      return Object.entries(opts).reduce(
        (acc, [k, v]) => acc.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), String(v)),
        key,
      );
    },
  }),
}));

describe('ConversationPage token stats', () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], activeConversationId: null });
    useChatDisplayStore.setState({ showTokenStats: false });
    // ⚠️ 页面现在走 AG-UI ⇒ ⇒ mock 的是 `fetch`（协议形状）。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        aguiSse([
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"你好"}\n\n',
          'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":" world"}\n\n',
          'data:{"type":"RUN_FINISHED","threadId":"c1","runId":"r1"}\n\n',
        ]),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/conversation']}>
        <Routes>
          <Route path="/conversation" element={<ConversationPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('hides token stats when the toggle is off', async () => {
    const conversation = {
      id: 'conv-1',
      kind: 'text' as const,
      title: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        {
          id: 'm1',
          role: 'assistant' as const,
          content: '你好 world',
          timestamp: new Date(),
          token_stats: { tokens: 4, durationMs: 2000, tokensPerSecond: 2 },
        },
      ],
      sessionId: 'c1',
    };
    useConversationStore.setState({ conversations: [conversation], activeConversationId: 'conv-1' });
    renderPage();
    expect(screen.queryByTestId('token-stats')).toBeNull();
  });

  it('shows token stats badge when the toggle is on', async () => {
    useChatDisplayStore.setState({ showTokenStats: true });
    const conversation = {
      id: 'conv-2',
      kind: 'text' as const,
      title: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        {
          id: 'm1',
          role: 'assistant' as const,
          content: '你好 world',
          timestamp: new Date(),
          token_stats: { tokens: 4, durationMs: 2000, tokensPerSecond: 2 },
        },
      ],
      sessionId: 'c1',
    };
    useConversationStore.setState({ conversations: [conversation], activeConversationId: 'conv-2' });
    renderPage();
    // The badge element exists whenever the toggle is on and the
    // assistant message carries token_stats. We don't pin the exact
    // text or tooltip content — the structural guarantee (badge appears
    // when the toggle is on, disappears when off) is what the surface
    // promises to the user. The actual numbers come from the live stream.
    const badge = await waitFor(() => screen.getByTestId('token-stats'));
    expect(badge).toBeInTheDocument();
  });

  it('does not show the badge on user messages even with toggle on', async () => {
    useChatDisplayStore.setState({ showTokenStats: true });
    const conversation = {
      id: 'conv-3',
      kind: 'text' as const,
      title: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        {
          id: 'm1',
          role: 'user' as const,
          content: 'hi',
          timestamp: new Date(),
          token_stats: { tokens: 1, durationMs: 1000, tokensPerSecond: 1 },
        },
      ],
      sessionId: 'c1',
    };
    useConversationStore.setState({ conversations: [conversation], activeConversationId: 'conv-3' });
    renderPage();
    expect(screen.queryByTestId('token-stats')).toBeNull();
  });

  it('records token_stats on streamed assistant messages when the toggle is on', async () => {
    useChatDisplayStore.setState({ showTokenStats: true });
    const conversation = {
      id: 'conv-4',
      kind: 'text' as const,
      title: 'stream-test',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    };
    useConversationStore.setState({ conversations: [conversation], activeConversationId: 'conv-4' });
    renderPage();
    // Trigger a send by clicking the send button.
    const textarea = await waitFor(() => screen.getByPlaceholderText('conversation.placeholder'));
    await act(async () => {
      // jsdom + textarea: set the value then dispatch an input event so the
      // React state picks it up.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(textarea, 'ping');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Find the primary send button via the Paperclip-less trailing button.
    const allButtons = screen.getAllByRole('button');
    // Last button in the composer is the send button (after file, voice, send).
    // Use a more robust path: pick the one with `variant="primary"` via class.
    const primary = allButtons.find((b) => b.className.includes('bg-primary'));
    await act(async () => {
      primary?.click();
    });
    await waitFor(() => {
      const messages = useConversationStore.getState().conversations.find((c) => c.id === 'conv-4')?.messages ?? [];
      const assistant = messages.find((m) => m.role === 'assistant');
      expect(assistant?.token_stats).toBeDefined();
      expect(assistant?.token_stats?.tokens).toBeGreaterThan(0);
    });
  });
});