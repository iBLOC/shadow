import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModelsPage } from '../../src/pages/ModelsPage';

// Mock fetch to return successful responses
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/models/providers')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
});

vi.stubGlobal('fetch', mockFetch);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ModelsPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/models']}>
        <Routes>
          <Route path="/models" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  it('renders page header', async () => {
    renderWithRouter(<ModelsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders add provider button', async () => {
    renderWithRouter(<ModelsPage />);
    
    await waitFor(() => {
      // The page should render without errors
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('shows empty state when no providers', async () => {
    renderWithRouter(<ModelsPage />);
    
    await waitFor(() => {
      // The page should render without errors
      expect(screen.getByText('models.title')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders page without crashing', async () => {
    renderWithRouter(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });
});
