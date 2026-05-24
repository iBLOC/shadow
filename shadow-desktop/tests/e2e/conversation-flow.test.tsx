import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConversationPage } from '../../src/pages/ConversationPage';

vi.mock('../../src/stores/conversationStore', () => ({
  useConversationStore: vi.fn(() => ({
    conversations: [],
    activeConversationId: null,
    addConversation: vi.fn(),
    removeConversation: vi.fn(),
    setActiveConversation: vi.fn(),
    addMessage: vi.fn(),
    setSessionId: vi.fn(),
  })),
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
    activeAgentId: null,
    setActiveAgent: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve('session-id')),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Conversation Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/conversation']}>
        <Routes>
          <Route path="/conversation" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('displays conversation sidebar with title', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByText('conversation.title')).toBeInTheDocument();
    });
  });

  it('shows empty state when no conversation is selected', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByText('conversation.selectOrCreate')).toBeInTheDocument();
    });
  });

  it('shows new chat button when no conversation exists', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /conversation.newChat/i })).toBeInTheDocument();
    });
  });

  it('displays search placeholder in sidebar', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('conversation.searchPlaceholder')).toBeInTheDocument();
    });
  });

  it('renders agent selector in sidebar', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByText('conversation.selectAgent')).toBeInTheDocument();
    });
  });

  it('renders message container when no conversation selected', async () => {
    renderWithRouter(<ConversationPage />);

    await waitFor(() => {
      expect(screen.getByText('conversation.newChat')).toBeInTheDocument();
    });
  });
});