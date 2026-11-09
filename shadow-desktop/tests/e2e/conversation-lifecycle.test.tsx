import { describe, it, expect, vi, beforeEach, beforeAll, type Mock, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useAgentStore } from '../../src/stores/agentStore';

// scrollIntoView is not available in jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('../../src/stores/conversationStore', () => ({
  useConversationStore: vi.fn(),
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(),
}));

// ⚠️ 生命周期模块（src/lib/conversationLifecycle.ts）用 zustand 的 `getState()`
// 读会话 ⇒ ⇒ 这个 mock 也得带 getState（不然页面一删就炸）。
const storeStateRef: { current: Record<string, unknown> | null } = { current: null };
(useConversationStore as unknown as Mock & { getState: () => unknown }).getState = () =>
  storeStateRef.current;

const mockAddConversation = vi.fn();
const mockRemoveConversation = vi.fn();
const mockSetActiveConversation = vi.fn();

function createMockConversationStore(overrides: Record<string, unknown> = {}) {
  const store = {
    conversations: [],
    activeConversationId: null,
    addConversation: mockAddConversation,
    removeConversation: mockRemoveConversation,
    setActiveConversation: mockSetActiveConversation,
    addMessage: vi.fn(),
    updateConversation: vi.fn(),
    setSessionId: vi.fn(),
    clearConversations: vi.fn(),
    ...overrides,
  };
  // 生命周期模块走的是 getState() ⇒ ⇒ 这里得指向**当前这份**。
  storeStateRef.current = store;
  return store;
}

function createMockAgentStore(overrides: Record<string, unknown> = {}) {
  return {
    agents: [],
    activeAgentId: null,
    setActiveAgent: vi.fn(),
    ...overrides,
  };
}

// Dynamically import after mocks are set up
async function renderPage() {
  const { ConversationPage } = await import('../../src/pages/ConversationPage');
  return render(
    <MemoryRouter>
      <ConversationPage />
    </MemoryRouter>
  );
}

describe('Conversation Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useConversationStore as unknown as Mock).mockReturnValue(
      createMockConversationStore()
    );
    (useAgentStore as unknown as Mock).mockReturnValue(
      createMockAgentStore()
    );
  });

  describe('Empty state', () => {
    it('shows select or create message when no active conversation', async () => {
      await renderPage();
      expect(screen.getByText(/conversation\.selectOrCreate/i)).toBeInTheDocument();
    });

    it('shows new chat button in empty state', async () => {
      await renderPage();
      const newChatBtn = screen.getAllByText(/conversation\.newChat/i);
      expect(newChatBtn.length).toBeGreaterThan(0);
    });
  });

  describe('Create conversation', () => {
    it('calls addConversation when new chat button is clicked', async () => {
      await renderPage();
      const newChatBtns = screen.getAllByText(/conversation\.newChat/i);
      fireEvent.click(newChatBtns[0]);
      expect(mockAddConversation).toHaveBeenCalled();
    });

    it('shows sidebar header with conversation title', async () => {
      await renderPage();
      expect(screen.getByText(/conversation\.title/i)).toBeInTheDocument();
    });

    it('shows sidebar search input', async () => {
      await renderPage();
      expect(
        screen.getByPlaceholderText(/conversation\.searchPlaceholder/i)
      ).toBeInTheDocument();
    });
  });

  describe('Conversation list', () => {
    it('shows conversations in sidebar when they exist', async () => {
      const conversations = [
        {
          id: 'conv-1',
          title: 'Hello World',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      await renderPage();
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('shows message count for each conversation', async () => {
      const conversations = [
        {
          id: 'conv-2',
          title: 'Test Conv',
          messages: [
            {
              id: 'msg-1',
              role: 'user' as const,
              content: 'Hello',
              timestamp: new Date(),
            },
            {
              id: 'msg-2',
              role: 'assistant' as const,
              content: 'Hi!',
              timestamp: new Date(),
            },
          ],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      await renderPage();
      expect(screen.getByText(/conversation\.messages/i)).toBeInTheDocument();
    });

    it('highlights active conversation', async () => {
      const conversations = [
        {
          id: 'conv-active',
          title: 'Active One',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-active',
        })
      );
      await renderPage();
      const activeItem = screen.getByText('Active One').closest('[class*="bg-foreground/10"]');
      expect(activeItem).toBeTruthy();
    });
  });

  describe('Select conversation', () => {
    it('calls setActiveConversation when clicking a conversation', async () => {
      const conversations = [
        {
          id: 'conv-3',
          title: 'Clickable',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      await renderPage();
      fireEvent.click(screen.getByText('Clickable'));
      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-3');
    });
  });

  describe('Delete conversation', () => {
    it('shows delete button for each conversation', async () => {
      const conversations = [
        {
          id: 'conv-4',
          title: 'Deletable',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteBtns.length).toBeGreaterThan(0);
    });

    it('calls removeConversation when delete button is clicked', async () => {
      const conversations = [
        {
          id: 'conv-5',
          title: 'To Delete',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      // ⚠️ 删除是**不可逆**的 ⇒ ⇒ 页面要先跟用户确认（jsdom 的 confirm 是
      // 「未实现」⇒ 返回 undefined ⇒ 不确认就不删）。
      vi.stubGlobal('confirm', vi.fn(() => true));
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteBtns.length).toBe(1);
      if (deleteBtns[0]) {
        fireEvent.click(deleteBtns[0]);
        // ⚠️ 删除现在**异步**（先问端脑、再动本地）⇒ ⇒ 得等它跑完。
        await waitFor(() =>
          expect(mockRemoveConversation).toHaveBeenCalledWith('conv-5')
        );
      }
    });
  });

  describe('Search filter', () => {
    it('filters conversations by search query', async () => {
      const conversations = [
        {
          id: 'conv-6',
          title: 'React Help',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'conv-7',
          title: 'Python Help',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: null,
        })
      );
      await renderPage();
      expect(screen.getByText('React Help')).toBeInTheDocument();
      expect(screen.getByText('Python Help')).toBeInTheDocument();
      const searchInput = screen.getByPlaceholderText(
        /conversation\.searchPlaceholder/i
      );
      fireEvent.change(searchInput, { target: { value: 'React' } });
      expect(screen.getByText('React Help')).toBeInTheDocument();
      expect(screen.queryByText('Python Help')).not.toBeInTheDocument();
    });
  });

  describe('Welcome state', () => {
    it('shows welcome message when active conversation has no messages', async () => {
      const conversations = [
        {
          id: 'conv-welcome',
          title: 'New Chat',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-welcome',
        })
      );
      await renderPage();
      // Use exact match to avoid matching conversation.welcomeDesc
      const welcomeH2 = document.querySelector('h2');
      expect(welcomeH2?.textContent).toBe('conversation.welcome');
    });

    it('shows suggested prompts in welcome state', async () => {
      const conversations = [
        {
          id: 'conv-prompts',
          title: 'New Chat',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-prompts',
        })
      );
      await renderPage();
      expect(
        screen.getByText(/conversation\.helpWithTask/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/conversation\.whatCanYouDo/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/conversation\.showMyAgents/i)
      ).toBeInTheDocument();
    });
  });

  describe('Message display', () => {
    it('shows user and assistant messages', async () => {
      const conversations = [
        {
          id: 'conv-msgs',
          title: 'Messages',
          messages: [
            {
              id: 'm1',
              role: 'user' as const,
              content: 'Hello!',
              timestamp: new Date(),
            },
            {
              id: 'm2',
              role: 'assistant' as const,
              content: 'How can I help?',
              timestamp: new Date(),
            },
          ],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-msgs',
        })
      );
      await renderPage();
      expect(screen.getByText('Hello!')).toBeInTheDocument();
      expect(screen.getByText('How can I help?')).toBeInTheDocument();
    });
  });

  describe('Conversation page', () => {
    it('shows conversation page', async () => {
      await renderPage();
      expect(screen.getByText('conversation.title')).toBeInTheDocument();
    });
  });

  describe('Input area', () => {
    it('shows message input when active conversation exists', async () => {
      const conversations = [
        {
          id: 'conv-input',
          title: 'Input Test',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-input',
        })
      );
      await renderPage();
      expect(
        screen.getByPlaceholderText(/conversation\.placeholder/i)
      ).toBeInTheDocument();
    });

    it('shows input hint text', async () => {
      const conversations = [
        {
          id: 'conv-hint',
          title: 'Hint Test',
          messages: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useConversationStore as unknown as Mock).mockReturnValue(
        createMockConversationStore({
          conversations,
          activeConversationId: 'conv-hint',
        })
      );
      await renderPage();
      expect(
        screen.getByText(/conversation\.pressEnter/i)
      ).toBeInTheDocument();
    });
  });
});
