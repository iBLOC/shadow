import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

const { mockSetTheme, mockRefreshStatus, mockRefreshLobes, mockCheckAllServices, mockDiscoverServices, mockConnect, changeLanguageMock } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockRefreshStatus: vi.fn(),
  mockRefreshLobes: vi.fn(),
  mockCheckAllServices: vi.fn().mockResolvedValue(undefined),
  mockDiscoverServices: vi.fn().mockResolvedValue(undefined),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  changeLanguageMock: vi.fn(),
}));

vi.mock('../../src/stores/themeStore', () => {
  const state = {
    theme: 'dark',
    setTheme: mockSetTheme,
  };
  const hook = vi.fn(() => state);
  hook.getState = vi.fn(() => state);
  return { useThemeStore: hook };
});

vi.mock('../../src/stores/cortexStore', () => {
  const state = {
    status: 'running',
    connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
    cortexId: 'cortex-test',
    defaultAgent: 'temporal',
    lobes: [
      { name: 'temporal', kind: 'native', url: 'http://temporal:60080', enabled: true, skills: ['routing:prefrontal'], agent_card: { name: 'temporal', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
      { name: 'memory', kind: 'native', url: 'http://memory:60080', enabled: true, skills: ['memory:recall'], agent_card: { name: 'memory', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
    ],
    flows: [],
    lastCheck: null,
    error: null,
    refreshStatus: mockRefreshStatus,
    refreshLobes: mockRefreshLobes,
    refreshFlows: vi.fn(),
    startCortex: vi.fn(),
    stopCortex: vi.fn(),
    setBaseUrl: vi.fn(),
    setApiKey: vi.fn(),
  };
  const hook = vi.fn((selector?: any) => selector ? selector(state) : state);
  hook.getState = vi.fn(() => state);
  return { useCortexStore: hook };
});

vi.mock('../../src/stores/serviceStore', () => {
  const state = {
    services: {
      prefrontal: { name: 'prefrontal', displayName: 'Prefrontal', host: 'localhost', port: 8082, status: 'healthy' },
      hippocampus: { name: 'hippocampus', displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'healthy' },
      resonance: { name: 'resonance', displayName: 'Resonance', host: '', port: 8080, status: 'unknown' },
    },
    resonanceInstances: [],
    isChecking: false,
    checkAllServices: mockCheckAllServices,
    hasConfiguredResonance: vi.fn(() => false),
    getPrimaryResonance: vi.fn(() => null),
    addResonanceInstance: vi.fn(),
    updateResonanceInstance: vi.fn(),
    removeResonanceInstance: vi.fn(),
    setPrimaryResonance: vi.fn(),
  };
  const hook = vi.fn((selector?: any) => selector ? selector(state) : state);
  hook.getState = vi.fn(() => state);
  return { useServiceStore: hook };
});

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    discoveredServices: [],
    resonanceInstances: [],
    connectionStatus: 'disconnected',
    discoverServices: mockDiscoverServices,
    connect: mockConnect,
    disconnect: vi.fn().mockResolvedValue(undefined),
    addInstance: vi.fn(),
    removeInstance: vi.fn(),
    setPrimary: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

const mockI18n = {
  language: 'en-US',
  changeLanguage: changeLanguageMock,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: mockI18n,
  }),
}));

describe('Settings Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverServices.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(undefined);
    mockCheckAllServices.mockResolvedValue(undefined);
    changeLanguageMock.mockClear();
  });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/settings']}>
 <Routes>
 <Route path="/settings" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and subtitle', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 expect(screen.getByText('settings.title')).toBeInTheDocument();
 expect(screen.getByText('settings.subtitle')).toBeInTheDocument();
 });
 });

  it('renders cortex status section with both lobes', async () => {
  renderWithRouter(<SettingsPage />);

  await waitFor(() => {
  expect(screen.getAllByText('temporal').length).toBeGreaterThan(0);
  expect(screen.getAllByText('memory').length).toBeGreaterThan(0);
  });
  });

  it('renders language selector with current value en-US', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      const comboboxes = screen.getAllByRole('combobox');
      const langSelect = comboboxes.find(
        (el) => el.textContent?.includes('en-US')
      );
      expect(langSelect).toBeInTheDocument();
    });
  });

  it('calls i18n.changeLanguage when language select changed', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.languageLabel')).toBeInTheDocument();
    });

    const comboboxes = await screen.findAllByRole('combobox');
    const langSelect = comboboxes.find(
      (el) => el.textContent?.includes('en-US')
    ) as HTMLElement;
    fireEvent.click(langSelect);
    const zhOption = await screen.findByRole('option', { name: /zh-CN/i });
    fireEvent.click(zhOption);

    await waitFor(() => {
      expect(changeLanguageMock).toHaveBeenCalledWith('zh-CN');
    });
  });

  it('renders theme buttons (light and dark)', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.light')).toBeInTheDocument();
      expect(screen.getByText('settings.dark')).toBeInTheDocument();
    });
  });

  it('calls setTheme when light theme button clicked', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
    });

    const lightButton = await screen.findByRole('button', {
      name: /settings.light/i,
    });
    fireEvent.click(lightButton);

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  it('calls setTheme when dark theme button clicked', async () => {
    renderWithRouter(<SettingsPage />);

    const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
    fireEvent.click(uiButton);

    await waitFor(() => {
      expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
    });

    const darkButton = await screen.findByRole('button', {
      name: /settings.dark/i,
    });
    fireEvent.click(darkButton);

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  it('calls cortex refresh on mount', async () => {
    renderWithRouter(<SettingsPage />);

    await waitFor(() => {
      expect(mockRefreshStatus).toHaveBeenCalled();
      expect(mockRefreshLobes).toHaveBeenCalled();
    });
  });
});
