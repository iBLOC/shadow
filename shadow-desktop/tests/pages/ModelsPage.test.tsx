import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModelsPage } from '../../src/pages/ModelsPage';

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  })
) as any;

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
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    ) as any;
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
      expect(screen.getByRole('button', { name: /models.addProvider/i })).toBeInTheDocument();
    });
  });

  it('shows empty state when no providers', async () => {
    renderWithRouter(<ModelsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('models.noProviders')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('fetches providers on mount', async () => {
    renderWithRouter(<ModelsPage />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8082/models/providers');
    }, { timeout: 3000 });
  });
});