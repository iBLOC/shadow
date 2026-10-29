import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MemoryPage } from '../../src/pages/MemoryPage';

vi.mock('../../src/stores/memoryStore', () => ({
  useMemoryStore: vi.fn(() => ({
    memories: [],
    searchResults: [],
    hasSearched: false,
    isLoading: false,
    error: null,
    searchMemories: vi.fn(),
    fetchMemories: vi.fn(),
    addMemory: vi.fn(),
    removeMemory: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MemoryPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/memory']}>
        <Routes>
          <Route path="/memory" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<MemoryPage />);
    
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders add memory button', async () => {
    renderWithRouter(<MemoryPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /memory.addMemory/i })).toBeInTheDocument();
    });
  });

  it('renders search bar', async () => {
    renderWithRouter(<MemoryPage />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('memory.searchPlaceholder')).toBeInTheDocument();
    });
  });

  it('renders dimension filter', async () => {
    renderWithRouter(<MemoryPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('shows empty state when no memories', async () => {
    renderWithRouter(<MemoryPage />);
    
    await waitFor(() => {
      expect(screen.getByText('memory.noMemories')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    const { container } = renderWithRouter(<MemoryPage />);
    await waitFor(() => {
      expect(container.querySelector('.page')).toBeInTheDocument();
    });
  });
});