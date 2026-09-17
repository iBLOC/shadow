import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SetupPage } from '../../src/pages/SetupPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../src/lib/platform', () => ({
  isTauri: () => false,
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../src/stores/databaseStore', () => ({
  useDatabaseStore: () => ({
    dbType: 'internal',
    status: 'connected',
    masterPassword: null,
    setMasterPassword: vi.fn(),
    encryptValue: vi.fn(),
    decryptValue: vi.fn(),
  }),
}));

describe('Setup Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = () =>
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('renders setup page', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });

  it('shows setup section', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });

  it('renders without errors', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });

  it('displays page content', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });

  it('renders setup page correctly', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('setup.welcome')).toBeInTheDocument();
    });
  });
});
