import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModelsPage } from '../../src/pages/ModelsPage';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/models']}>
      <Routes>
        <Route path="/models" element={<ModelsPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  })
);
global.fetch = mockFetch;

describe('Models Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Empty state', () => {
    it('renders page title and subtitle', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      expect(screen.getByText('models.configureProviders')).toBeInTheDocument();
    });

    it('renders add provider button', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      const addBtn = screen.getByRole('button', { name: /models\.addProvider/i });
      expect(addBtn).toBeInTheDocument();
    });
  });

  describe('Add provider', () => {
    it('opens add provider modal when add button clicked', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      const addBtn = screen.getByRole('button', { name: /models\.addProvider/i });
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('models.providerName')).toBeInTheDocument();
      });
    });

    it('closes modal when cancel clicked', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      const addBtn = screen.getByRole('button', { name: /models\.addProvider/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('models.providerName')).toBeInTheDocument());
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('models.providerName')).not.toBeInTheDocument();
      });
    });

    it('does not submit provider form with empty name', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      const addBtn = screen.getByRole('button', { name: /models\.addProvider/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('models.providerName')).toBeInTheDocument());
      const submitBtn = screen.getByRole('button', { name: /common\.add/i });
      fireEvent.click(submitBtn);
      expect(screen.getByText('models.providerName')).toBeInTheDocument();
    });
  });

  describe('Form fields', () => {
    it('shows provider form with name field', async () => {
      renderWithRouter();
      await screen.findByText('models.title');
      const addBtn = screen.getByRole('button', { name: /models\.addProvider/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('models.providerName')).toBeInTheDocument());
    });
  });
});
