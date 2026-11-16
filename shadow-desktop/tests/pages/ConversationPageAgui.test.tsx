import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConversationPage } from '../../src/pages/ConversationPage';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useChatDisplayStore } from '../../src/stores/chatDisplayStore';

// ⚠️ **页面级判据（AG-UI 那一路）** —— 钉的是**换线后页面真的做的那件事**：
// ❶ 端脑点了名 ⇒ ⇒ 设备跑完 ⇒ ⇒ **结果随下一次请求带回去**（续轮闭环）；
// ❷ 端脑报错 ⇒ ⇒ 界面落一条**错误**消息（不是一片空白）。
//
// ⚠️ 换线前这个仓的页面判据只有 token stats 那一条（且它 mock 的是 legacy 的
// `streamMessage`）⇒ ⇒ 那一条**不覆盖**工具闭环 ⇒ ⇒ 这里补上。
vi.mock('../../src/lib/telencephalonClient', () => {
  return {
    composeSystemPrompt: (custom?: string) => (custom ?? '').trim(),
    telencephalonClient: {
      setBaseUrl: vi.fn(),
      getBaseUrl: () => 'http://127.0.0.1:60080',
      readHeaders: async () => ({}),
      createConversation: vi.fn(async () => ({ id: 'c1' })),
      // ⚠️ 这一轮**有工具** ⇒ ⇒ 轮末会把工具轨迹喂给「思维定式」
      // ⇒ ⇒ mock 必须有这个方法（缺了 ⇒ ⇒ 未处理的拒绝 ⇒ ⇒ 判据文件退出码 1）。
      ingestTrace: vi.fn(async () => ({})),
    },
  };
});

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

const TOOL_TURN = [
  'data:{"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"set_theme"}\n\n',
  'data:{"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"color\\":\\"#4F46E5\\"}"}\n\n',
  'data:{"type":"TOOL_CALL_END","toolCallId":"tc1"}\n\n',
  'data:{"type":"RUN_FINISHED","threadId":"c1","runId":"r1"}\n\n',
];

const AFTER_TOOL_TURN = [
  'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"m2","delta":"换好了"}\n\n',
  'data:{"type":"RUN_FINISHED","threadId":"c1","runId":"r2"}\n\n',
];

describe('ConversationPage —— AG-UI 那一路', () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], activeConversationId: null });
    useChatDisplayStore.setState({ showTokenStats: false });
  });

  afterEach(() => {
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

  const seedConversation = (id: string) => {
    useConversationStore.setState({
      conversations: [
        {
          id,
          kind: 'text' as const,
          title: 'test',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        },
      ],
      activeConversationId: id,
    });
  };

  const send = async () => {
    const textarea = await waitFor(() => screen.getByPlaceholderText('conversation.placeholder'));
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(textarea, 'ping');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const buttons = screen.getAllByRole('button');
    const primary = buttons.find((b) => b.className.includes('bg-primary'));
    await act(async () => {
      primary?.click();
    });
  };

  it('端脑点了名 ⇒ ⇒ 设备跑完 ⇒ ⇒ 结果随**下一次请求**带回去', async () => {
    const responses = [TOOL_TURN, AFTER_TOOL_TURN];
    const fetchMock = vi.fn(async () => aguiSse(responses[Math.min(fetchMock.mock.calls.length - 1, responses.length - 1)]));
    vi.stubGlobal('fetch', fetchMock);
    seedConversation('conv-agui-tool');
    renderPage();
    await send();

    await waitFor(() => {
      const messages =
        useConversationStore.getState().conversations.find((c) => c.id === 'conv-agui-tool')
          ?.messages ?? [];
      const toolMessage = messages.find((m) => m.tool_call);
      expect(toolMessage?.tool_call?.name).toBe('set_theme');
      expect(toolMessage?.tool_call?.status).toBe('succeeded');
    });

    // ⚠️ **两次请求**：第二轮那条的末尾必须带着工具结果 ⇒ ⇒ 端脑那边就是「续轮」。
    // ⚠️ 只数 **AG-UI 那条路**的调用（页面还会去读能力词表 ⇒ ⇒ 那是别的 fetch）。
    const aguiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/ag-ui:stream'));
    await waitFor(() => {
      expect(aguiCalls.length).toBeGreaterThanOrEqual(2);
    });
    // ⚠️ **工具清单也要随请求带出去**（模型才知道这台设备会什么）
    // ⇒ ⇒ 且是**扁平**形状（不套 function —— 端脑自己包一次）。
    const first = JSON.parse(String(aguiCalls[0][1].body));
    expect(Array.isArray(first.tools)).toBe(true);
    const setTheme = (first.tools as { name: string }[]).find((t) => t.name === 'set_theme');
    expect(setTheme).toBeTruthy();
    expect((setTheme as unknown as Record<string, unknown>).function).toBeUndefined();

    const second = JSON.parse(String(aguiCalls[1][1].body));
    const last = second.messages[second.messages.length - 1];
    expect(last.role).toBe('tool');
    expect(last.toolCallId).toBe('tc1');
    expect(String(last.content)).toContain('accent');
  });

  it('端脑报错 ⇒ ⇒ 界面落一条**错误**消息(不是一片空白)', async () => {
    const fetchMock = vi.fn(async () =>
      aguiSse(['data:{"type":"RUN_ERROR","message":"设备拒绝了","metadata":{"runId":"r9"}}\n\n']),
    );
    vi.stubGlobal('fetch', fetchMock);
    seedConversation('conv-agui-error');
    renderPage();
    await send();

    await waitFor(() => {
      const messages =
        useConversationStore.getState().conversations.find((c) => c.id === 'conv-agui-error')
          ?.messages ?? [];
      // ⚠️ 断言要**承重**：不只看「有一条消息」，要看它**真的是错误那条**
      // ⇒ ⇒ 光「某个值非空」是弱断言（桌面那道闸会红）。
      const assistantTexts = messages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .join('|');
      expect(assistantTexts).toContain('conversation.error');
    });
  });
});
