import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('ConversationPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/conversation']}>
        <Routes>
          <Route path="/conversation" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders sidebar with title', async () => {
    renderWithRouter(<ConversationPage />);
    
    await waitFor(() => {
      expect(screen.getByText('conversation.title')).toBeInTheDocument();
    });
  });

  it('renders new conversation button in sidebar', async () => {
    renderWithRouter(<ConversationPage />);
    
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no conversation selected', async () => {
    renderWithRouter(<ConversationPage />);
    
    await waitFor(() => {
      expect(screen.getByText('conversation.selectOrCreate')).toBeInTheDocument();
    });
  });

  it('renders search input in sidebar', async () => {
    renderWithRouter(<ConversationPage />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('conversation.searchPlaceholder')).toBeInTheDocument();
    });
  });

  it('renders without crashing', async () => {
    renderWithRouter(<ConversationPage />);
    await waitFor(() => {
      expect(screen.getByText('conversation.title')).toBeInTheDocument();
    });
  });
});