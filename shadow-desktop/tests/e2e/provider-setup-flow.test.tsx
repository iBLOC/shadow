import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModelsPage } from '../../src/pages/ModelsPage';

global.fetch = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Provider Setup Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
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

  it('renders models page when providers load', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 'provider-1',
          name: 'OpenAI',
          provider_type: 'openai',
          api_base: 'https://api.openai.com/v1',
          models: [],
        },
      ]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('shows add provider button', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /models.addProvider/i })).toBeInTheDocument();
    });
  });

  it('displays provider heading when loaded', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 'provider-1',
          name: 'OpenAI',
          provider_type: 'openai',
          api_base: 'https://api.openai.com/v1',
          models: [{ id: 'm1', name: 'GPT-4o', model_id: 'gpt-4o', model_type: 'chat', supports_vision: false, supports_function_calling: false }],
        },
      ]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });
  });

  it('renders empty state when no providers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('models.noProviders')).toBeInTheDocument();
    });
  });

  it('opens add provider modal when add provider button clicked', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    const addButton = await waitFor(() => screen.getByRole('button', { name: /models.addProvider/i }));
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('closes add provider modal when cancel clicked', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderWithRouter(<ModelsPage />);

    const addButton = await waitFor(() => screen.getByRole('button', { name: /models.addProvider/i }));
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /common.cancel/i });
    await user.click(cancelButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});