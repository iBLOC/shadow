import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SetupPage } from '../../src/pages/SetupPage';
import { useDatabaseStore } from '../../src/stores/databaseStore';

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
    if (cmd === 'set_password') return Promise.resolve();
    if (cmd === 'update_setup_step') return Promise.resolve();
    if (cmd === 'start_embedded') return Promise.resolve();
    if (cmd === 'mark_setup_complete') return Promise.resolve();
    return Promise.resolve();
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SetupPage', () => {
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

  it('renders setup page header', async () => {
    renderWithRouter(<SetupPage />);
    
    await waitFor(() => {
      expect(screen.getByText('layout.brandName')).toBeInTheDocument();
    });
  });

  it('renders step indicators', async () => {
    renderWithRouter(<SetupPage />);
    
    await waitFor(() => {
      expect(screen.getByText('setup.setPassword')).toBeInTheDocument();
      expect(screen.getByText('setup.selectDatabase')).toBeInTheDocument();
      expect(screen.getByText('setup.addProvider')).toBeInTheDocument();
      expect(screen.getByText('setup.manageModels')).toBeInTheDocument();
    });
  });

  it('has next button', async () => {
    renderWithRouter(<SetupPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /common.next/i })).toBeInTheDocument();
    });
  });
});