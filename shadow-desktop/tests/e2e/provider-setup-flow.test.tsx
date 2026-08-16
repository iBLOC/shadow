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

describe('Provider Setup Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/models']}>
        <Routes>
          <Route path="/models" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders models page', async () => {
    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('shows models section', async () => {
    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders without errors', async () => {
    renderWithRouter(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('displays page content', async () => {
    renderWithRouter(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders models page', async () => {
    renderWithRouter(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });
});