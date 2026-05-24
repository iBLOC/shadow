import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SetupPage } from '../../src/pages/SetupPage';

vi.mock('../../src/stores/databaseStore', () => ({
  useDatabaseStore: vi.fn(() => ({
    dbType: 'embedded',
    status: 'disconnected',
    setDbType: vi.fn(),
    startEmbedded: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === 'get_machine_id') return Promise.resolve('test-machine-id-123');
    if (cmd === 'get_setup_step') return Promise.resolve('password');
    if (cmd === 'get_provider_config') return Promise.resolve(null);
    return Promise.resolve();
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Onboarding Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/setup']}>
        <Routes>
          <Route path="/setup" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders welcome screen with brand name', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText('layout.brandName')).toBeInTheDocument();
    });
  });

  it('displays step indicator 1 (password)', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText('setup.setPassword')).toBeInTheDocument();
    });
  });

  it('displays step indicator 2 (database)', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText('setup.selectDatabase')).toBeInTheDocument();
    });
  });

  it('displays step indicator 3 (provider)', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText('setup.addProvider')).toBeInTheDocument();
    });
  });

  it('displays step indicator 4 (models)', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText('setup.manageModels')).toBeInTheDocument();
    });
  });

  it('has next button on password step', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /common.next/i })).toBeInTheDocument();
    });
  });

  it('renders password inputs', async () => {
    renderWithRouter(<SetupPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('********').length).toBe(2);
    });
  });
});