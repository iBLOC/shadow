import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

vi.mock('../../src/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({
    theme: 'dark',
    setTheme: vi.fn(),
  })),
}));

vi.mock('../../src/stores/serviceStore', () => ({
  useServiceStore: vi.fn(() => ({
    services: {
      prefrontal: { name: 'prefrontal', displayName: 'Prefrontal', host: 'localhost', port: 8082, status: 'healthy' as const },
      hippocampus: { name: 'hippocampus', displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'healthy' as const },
    },
    isChecking: false,
    checkAllServices: vi.fn(),
  })),
}));

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    discoveredServices: [],
    selectedService: null,
    connectionStatus: 'disconnected',
    discoverServices: vi.fn(),
    selectService: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en-US',
      changeLanguage: vi.fn(),
    },
  }),
}));

describe('SettingsPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });
  });

  it('renders service status section', async () => {
    renderWithRouter(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('settings.serviceStatus')).toBeInTheDocument();
    });
  });

  it('renders resonance connection section', async () => {
    renderWithRouter(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('settings.resonanceConnection')).toBeInTheDocument();
    });
  });

  it('renders language selector section', async () => {
    renderWithRouter(<SettingsPage />);
    
    await waitFor(() => {
      const headings = document.querySelectorAll('h3');
      const langHeading = Array.from(headings).find(h => h.textContent === 'settings.language');
      expect(langHeading).toBeInTheDocument();
    });
  });

  it('renders theme selector', async () => {
    renderWithRouter(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('settings.theme')).toBeInTheDocument();
    });
  });

  it.skip('renders system tray controls', async () => {
    renderWithRouter(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('settings.systemTray')).toBeInTheDocument();
    });
  });
});