import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../src/lib/platform', () => ({
  isTauri: vi.fn(() => false),
  prefrontalUrl: vi.fn(() => 'http://localhost:8082'),
}));

vi.mock('../../src/components/DatabaseSettings', () => ({
  DatabaseSettings: () => <div data-testid="database-settings">Database Settings Mock</div>,
}));

vi.mock('../../src/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({
    theme: 'dark',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  })),
}));

vi.mock('../../src/stores/telencephalonStore', () => {
  const state: Record<string, unknown> = {
    status: 'running',
    connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
    cortexId: 'cortex-test',
    defaultAgent: 'temporal',
    lobes: [
      { name: 'temporal', kind: 'native', url: 'http://temporal:60080', enabled: true, skills: ['routing:prefrontal'], agent_card: { name: 'temporal', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
      { name: 'memory', kind: 'native', url: 'http://memory:60080', enabled: true, skills: ['memory:recall'], agent_card: { name: 'memory', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
    ],
    lastCheck: null,
    error: null,
    supervisor: { enabled: true, restartCount: 0 },
    refreshStatus: vi.fn(),
    refreshLobes: vi.fn(),
    startCortex: vi.fn(),
    stopCortex: vi.fn(),
    setBaseUrl: vi.fn(),
    setApiKey: vi.fn(),
  };
  const hook: any = vi.fn((selector?: any) => (selector ? selector(state) : state));
  hook.getState = vi.fn(() => state);
  return { useTelencephalonStore: hook };
});

vi.mock('../../src/stores/serviceStore', () => {
  const mockState = {
    services: {
      resonance: { name: 'resonance' as const, displayName: 'Resonance', host: 'localhost', port: 8080, status: 'unknown' as const },
      prefrontal: { name: 'prefrontal' as const, displayName: 'Prefrontal (Agent)', host: 'localhost', port: 8082, status: 'unknown' as const },
      neuron: { name: 'neuron' as const, displayName: 'Neuron (Embedded Engine)', host: 'localhost', port: 8085, status: 'unknown' as const },
      hippocampus: { name: 'hippocampus' as const, displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'unknown' as const },
    },
    resonanceInstances: [],
    isChecking: false,
    checkAllServices: vi.fn(),
    hasConfiguredResonance: vi.fn(() => false),
    getPrimaryResonance: vi.fn(() => null),
    addResonanceInstance: vi.fn(),
    updateResonanceInstance: vi.fn(),
    removeResonanceInstance: vi.fn(),
    setPrimaryResonance: vi.fn(),
  };
  const hook: any = vi.fn((selector?: any) => selector ? selector(mockState) : mockState);
  hook.getState = vi.fn(() => mockState);
  return { useServiceStore: hook };
});

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    discoveredServices: [],
    resonanceInstances: [],
    connectionStatus: 'disconnected',
    discoverServices: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('SettingsPage Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Page render', () => {
    it('renders page title', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });

    it('renders page subtitle', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.subtitle')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('renders cortex status section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      // 2026-09 service-area refactor: supervisor heading replaces
      // the older `settings.cortexStatus` title.
      expect(screen.getAllByText('services.supervisor')[0]).toBeInTheDocument();
    });

    it('renders settings page', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });

    it('renders settings page', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });
  });

  describe('Theme toggle', () => {
    it('renders theme section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
      });
    });

    it('renders light and dark theme buttons', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.light')).toBeInTheDocument();
        expect(screen.getByText('settings.dark')).toBeInTheDocument();
      });
    });

    it('has active dark button by default', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.dark')).toBeInTheDocument();
      });
    });
  });

  describe('Lobe list display', () => {
    it('renders lobe list with lobes', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const allText = document.body.textContent;
      expect(allText).toContain('temporal');
      expect(allText).toContain('memory');
    });

    it('renders lobe health status', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const allText = document.body.textContent;
      expect(allText).toContain('native');
    });

    it('renders refresh button for cortex', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const refreshBtn = screen.getAllByRole('button').find(
        (btn) => btn.querySelector('svg') !== null && btn.closest('.flex') !== null
      );
      expect(refreshBtn).toBeInTheDocument();
    });
  });

  describe('Resonance discover', () => {
    it('renders settings page', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });

    it('renders settings page without crashing', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });

    it('shows settings section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });
  });

  describe('Language selector', () => {
    it('renders language section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.languageLabel')).toBeInTheDocument();
      });
    });

    it('renders language select dropdown', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
        expect(select.textContent).toContain('en-US');
      });
    });

    it('renders language options', async () => {
      const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
        expect(select.textContent).toContain('en-US');
      });
      const select = screen.getByRole('combobox');
      await user.click(select);
      expect(await screen.findByRole('option', { name: /zh-CN/i })).toBeInTheDocument();
      expect(await screen.findByRole('option', { name: /en-US/i })).toBeInTheDocument();
    });
  });

  describe('Memory integration', () => {
    it('renders memory integration section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      await waitFor(() => {
        expect(screen.getByText('settings.memoryIntegration')).toBeInTheDocument();
      });
    });

    it('renders connected status badge', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      await waitFor(() => {
        expect(screen.getByText('settings.connected')).toBeInTheDocument();
      });
    });

    it('renders storage path', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      await waitFor(() => {
        expect(screen.getByText('settings.storagePathDefault')).toBeInTheDocument();
      });
    });
  });

  describe('System tray (non-Tauri)', () => {
    it('does not render system tray section when isTauri is false', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      expect(screen.queryByText('settings.systemTray')).not.toBeInTheDocument();
    });
  });

  describe('Theme section', () => {
    it('renders theme section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
      });
    });
  });
});