import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useMemoryStore } from '../../src/stores/memoryStore';
import { MemoryPage } from '../../src/pages/MemoryPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../src/stores/memoryStore', () => ({
  useMemoryStore: vi.fn(),
}));

const mockAddMemory = vi.fn();
const mockRemoveMemory = vi.fn();
const mockSearchMemories = vi.fn();

function createMockStore(overrides: Record<string, unknown> = {}) {
  return {
    memories: [],
    searchResults: [],
    hasSearched: false,
    isLoading: false,
    error: null,
    currentSessionId: null,
    personaId: null,
    addMemory: mockAddMemory,
    removeMemory: mockRemoveMemory,
    searchMemories: mockSearchMemories,
    fetchMemories: vi.fn(),
    updateMemory: vi.fn(),
    setSession: vi.fn(),
    setPersona: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MemoryPage />
    </MemoryRouter>
  );
}

describe('Memory Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useMemoryStore as unknown as Mock).mockReturnValue(createMockStore());
  });

  describe('Empty state', () => {
    it('shows empty state when no memories exist', () => {
      renderPage();
      const elements = screen.getAllByText(/memory\.noMemories/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('shows add memory button in header', () => {
      renderPage();
      expect(screen.getByText(/memory\.addMemory/i)).toBeInTheDocument();
    });

    it('shows search bar even when empty', () => {
      renderPage();
      expect(
        screen.getByPlaceholderText(/memory\.searchPlaceholder/i)
      ).toBeInTheDocument();
    });
  });

  describe('Add memory form', () => {
    it('opens add form when clicking add button', () => {
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      expect(screen.getByText(/common\.save/i)).toBeInTheDocument();
    });

    it('closes add form on cancel', () => {
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      fireEvent.click(screen.getByText(/common\.cancel/i));
      expect(screen.queryByText(/common\.save/i)).not.toBeInTheDocument();
    });

    it('has content textarea in the add form', () => {
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      const placeholders = screen.getAllByPlaceholderText(
        /memory\.searchPlaceholder/i
      );
      expect(placeholders.length).toBeGreaterThanOrEqual(2);
    });

    it('has a dimension select in add form', () => {
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(1);
      // layer 由海马体分配，客户端不再提供选择器。
      expect(screen.queryByText('memory.layer')).not.toBeInTheDocument();
    });
  });

  describe('Add memory', () => {
    it('calls addMemory when save is clicked', () => {
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories: [] })
      );
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      const formTextarea = document.querySelector('textarea');
      expect(formTextarea).not.toBeNull();
      if (formTextarea) {
        fireEvent.change(formTextarea, { target: { value: 'New memory content' } });
      }
      fireEvent.click(screen.getByText(/common\.save/i));
      expect(mockAddMemory).toHaveBeenCalled();
    });

    it('does not call addMemory when content is empty', () => {
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      fireEvent.click(screen.getByText(/common\.save/i));
      expect(mockAddMemory).not.toHaveBeenCalled();
    });

    it('clears form after adding memory', async () => {
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories: [] })
      );
      renderPage();
      fireEvent.click(screen.getByText(/memory\.addMemory/i));
      const formTextarea = document.querySelector('textarea');
      expect(formTextarea).not.toBeNull();
      if (formTextarea) {
        fireEvent.change(formTextarea, { target: { value: 'Content' } });
      }
      fireEvent.click(screen.getByText(/common\.save/i));
      // 写海马体是异步的 —— 表单要等写入成功才收起来。
      await waitFor(() => {
        expect(screen.queryByText(/common\.save/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Memory display', () => {
    it('renders memory content when memories exist', () => {
      const memories = [
        {
          id: 'mem-1',
          content: 'Existing memory content',
          dimension: 'Agent' as const,
          layer: 'L2' as const,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories })
      );
      renderPage();
      expect(screen.getByText('Existing memory content')).toBeInTheDocument();
    });

    it('shows dimension tag for each memory', () => {
      const memories = [
        {
          id: 'mem-2',
          content: 'Memory with tags',
          dimension: 'User' as const,
          layer: 'L1' as const,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories })
      );
      renderPage();
      const memElements = screen.getAllByText(/memory\.user/i);
      expect(memElements.length).toBeGreaterThan(0);
    });

    it('shows delete button for each memory', () => {
      const memories = [
        {
          id: 'mem-3',
          content: 'Deletable memory',
          dimension: 'Agent' as const,
          layer: 'L2' as const,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories })
      );
      renderPage();
      const deleteButtons = screen.getAllByRole('button');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Delete memory', () => {
    it('calls removeMemory when delete button is clicked', () => {
      const memories = [
        {
          id: 'mem-4',
          content: 'Memory to delete',
          dimension: 'Agent' as const,
          layer: 'L2' as const,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ memories })
      );
      renderPage();
      const trashButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(trashButtons.length).toBeGreaterThan(0);
      if (trashButtons[0]) {
        fireEvent.click(trashButtons[0]);
        expect(mockRemoveMemory).toHaveBeenCalledWith('mem-4');
      }
    });
  });

  describe('Search', () => {
    it('shows search input', () => {
      renderPage();
      expect(
        screen.getByPlaceholderText(/memory\.searchPlaceholder/i)
      ).toBeInTheDocument();
    });

    it('has filter select for dimension', () => {
      renderPage();
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });

    it('has search button', () => {
      renderPage();
      expect(screen.getByText(/common\.search/i)).toBeInTheDocument();
    });

    it('triggers search on button click', () => {
      renderPage();
      const searchInput = screen.getByPlaceholderText(
        /memory\.searchPlaceholder/i
      );
      fireEvent.change(searchInput, { target: { value: 'find me' } });
      fireEvent.click(screen.getByText(/common\.search/i));
      expect(mockSearchMemories).toHaveBeenCalled();
    });

    it('triggers search on Enter key', () => {
      renderPage();
      const searchInput = screen.getByPlaceholderText(
        /memory\.searchPlaceholder/i
      );
      fireEvent.change(searchInput, { target: { value: 'enter search' } });
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(mockSearchMemories).toHaveBeenCalled();
    });

    it('shows search results count when results exist', () => {
      const searchResults = [
        { memory: { id: 's-1', content: 'Result 1', dimension: 'Agent' as const, layer: 'L2' as const, createdAt: new Date(), updatedAt: new Date() }, score: 0.95 },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ searchResults, hasSearched: true })
      );
      renderPage();
      expect(screen.getByText(/memory\.foundResults/i)).toBeInTheDocument();
    });

    it('shows result memories instead of all memories when search results exist', () => {
      const searchResults = [
        { memory: { id: 's-2', content: 'Only search result', dimension: 'Agent' as const, layer: 'L2' as const, createdAt: new Date(), updatedAt: new Date() }, score: 0.95 },
      ];
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ searchResults, hasSearched: true, memories: [{ id: 'm-1', content: 'Full list item', dimension: 'Agent' as const, layer: 'L2' as const, createdAt: new Date(), updatedAt: new Date() }] })
      );
      renderPage();
      expect(screen.getByText('Only search result')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error banner when error is set', () => {
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ error: 'Search failed' })
      );
      renderPage();
      expect(screen.getByText('Search failed')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('disables search button when loading', () => {
      (useMemoryStore as unknown as Mock).mockReturnValue(
        createMockStore({ isLoading: true })
      );
      renderPage();
      const searchBtn = screen.getByText(/common\.loading/i);
      expect(searchBtn).toBeDisabled();
    });
  });
});
