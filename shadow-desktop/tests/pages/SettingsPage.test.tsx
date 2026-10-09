import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

vi.mock('../../src/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({
    theme: 'dark',
    setTheme: vi.fn(),
  })),
}));

vi.mock('../../src/stores/cortexStore', () => {
  const refreshStatus = vi.fn();
  const refreshLobes = vi.fn();
  const startCortex = vi.fn();
  const stopCortex = vi.fn();
  const setBaseUrl = vi.fn();
  const setApiKey = vi.fn();
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
    refreshStatus,
    refreshLobes,
    startCortex,
    stopCortex,
    setBaseUrl,
    setApiKey,
  };
  const hook: any = vi.fn((selector?: any) => (selector ? selector(state) : state));
  hook.getState = vi.fn(() => state);
  return { useCortexStore: hook };
});

vi.mock('../../src/stores/serviceStore', () => {
  const mockState = {
    services: {
      prefrontal: { name: 'prefrontal', displayName: 'Prefrontal', host: 'localhost', port: 8082, status: 'healthy' as const },
      hippocampus: { name: 'hippocampus', displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'healthy' as const },
      resonance: { name: 'resonance', displayName: 'Resonance', host: '', port: 8080, status: 'unknown' as const },
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

  it('renders service section by default', async () => {
    renderWithRouter(<SettingsPage />);

    // After the 2026-09 service-area refactor, the section's visible heading
    // is `services.supervisor` (the supervisor subsection is the always-on
    // entry point when cortex is running). `settings.cortexStatus` is no
    // longer rendered. There are two renderings of this key (heading + form
    // label) so use `getAllByText` and assert presence.
    await waitFor(() => {
      const matches = screen.getAllByText('services.supervisor');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders language selector when switching to UI section', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.languageLabel')).toBeInTheDocument();
    });
  });

  it('renders theme selector when switching to UI section', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
    });
  });

  it.skip('renders system tray controls', async () => {
    renderWithRouter(<SettingsPage />);

    const systemButton = screen.getByRole('button', { name: /settings.section.system/i });
    fireEvent.click(systemButton);

    await waitFor(() => {
      expect(screen.getByText('settings.systemTray')).toBeInTheDocument();
    });
  });
});