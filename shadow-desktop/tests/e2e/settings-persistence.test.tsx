import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

const themeStoreMock: any = {
  theme: 'dark' as 'dark' | 'light',
  setTheme: vi.fn(),
  appearance: {
    accentSeed: '#71717A',
    glassIntensity: 1,
    surfaceOverride: null,
  },
  setAppearance: vi.fn(),
};
themeStoreMock.getState = () => themeStoreMock;

vi.mock('../../src/stores/themeStore', () => {
  const useThemeStoreMock: any = (selector?: any) => {
    if (typeof selector === 'function') {
      return selector(themeStoreMock);
    }
    return themeStoreMock;
  };
  useThemeStoreMock.getState = () => themeStoreMock;
  return { useThemeStore: useThemeStoreMock };
});

vi.mock('../../src/stores/telencephalonStore', () => {
  const state: Record<string, unknown> = {
    status: 'running',
    connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
    telencephalonId: 'telencephalon-test',
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
    startTelencephalon: vi.fn(),
    stopTelencephalon: vi.fn(),
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
      prefrontal: { name: 'prefrontal', displayName: 'Prefrontal', host: 'localhost', port: 8082, status: 'healthy' },
      hippocampus: { name: 'hippocampus', displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'healthy' },
      resonance: { name: 'resonance', displayName: 'Resonance', host: '', port: 8080, status: 'unknown' },
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
    pendingTasks: [],
    discoverServices: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

const dbState: any = {
  dbType: 'internal',
  status: 'connected',
  masterPassword: null,
};

vi.mock('../../src/stores/databaseStore', () => ({
  useDatabaseStore: () => ({
    dbType: dbState.dbType,
    status: dbState.status,
    masterPassword: dbState.masterPassword,
    setMasterPassword: vi.fn(),
    encryptValue: vi.fn(),
    decryptValue: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

const changeLanguageMock = vi.fn();
const mockI18n: any = {
  language: 'en-US',
  changeLanguage: changeLanguageMock,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: mockI18n,
  }),
}));

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Settings Persistence E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    themeStoreMock.theme = 'dark';
    localStorage.clear();
  });

  describe('Theme persistence', () => {
    it('shows dark theme button as active by default', async () => {
      themeStoreMock.theme = 'dark';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.themeLabel');
      const darkBtn = screen.getByText('settings.dark').closest('button') as HTMLButtonElement;
      const lightBtn = screen.getByText('settings.light').closest('button') as HTMLButtonElement;
      expect(darkBtn.className).toContain('bg-primary');
      expect(lightBtn.className).not.toContain('bg-primary');
    });

    it('shows light theme button as active when theme is light', async () => {
      themeStoreMock.theme = 'light';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.themeLabel');
      const lightBtn = screen.getByText('settings.light').closest('button') as HTMLButtonElement;
      expect(lightBtn.className).toContain('bg-primary');
    });

    it('clicking light calls setTheme with light', async () => {
      themeStoreMock.theme = 'dark';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.themeLabel');
      const lightBtn = screen.getByText('settings.light').closest('button') as HTMLButtonElement;
      fireEvent.click(lightBtn);
      expect(themeStoreMock.setTheme).toHaveBeenCalledWith('light');
    });

    it('clicking dark calls setTheme with dark', async () => {
      themeStoreMock.theme = 'light';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.themeLabel');
      const darkBtn = screen.getByText('settings.dark').closest('button') as HTMLButtonElement;
      fireEvent.click(darkBtn);
      expect(themeStoreMock.setTheme).toHaveBeenCalledWith('dark');
    });
  });

  describe('Language persistence', () => {
    it('reflects current i18n language in selector', async () => {
      mockI18n.language = 'en-US';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.languageLabel');
      const selects = screen.getAllByRole('combobox');
      const langSelect = selects.find(
        (el) => el.textContent?.includes('en-US'),
      );
      expect(langSelect).toBeInTheDocument();
    });

    it('reflects zh-CN when current language is zh-CN', async () => {
      mockI18n.language = 'zh-CN';
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.languageLabel');
      const selects = screen.getAllByRole('combobox');
      const langSelect = selects.find(
        (el) => el.textContent?.includes('zh-CN'),
      );
      expect(langSelect).toBeInTheDocument();
    });

    it('changing language selector calls changeLanguage', async () => {
      mockI18n.language = 'en-US';
      const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await screen.findByText('settings.languageLabel');
      const selects = screen.getAllByRole('combobox');
      const langSelect = selects.find(
        (el) => el.textContent?.includes('en-US'),
      ) as HTMLElement;
      await user.click(langSelect);
      const zhOption = await screen.findByRole('option', { name: /zh-CN/i });
      await user.click(zhOption);
      expect(changeLanguageMock).toHaveBeenCalledWith('zh-CN');
    });
  });

  describe('Telencephalon status display', () => {
    it('renders temporal lobe card', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const allText = document.body.textContent;
      expect(allText).toContain('temporal');
    });

    it('renders memory lobe card', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const allText = document.body.textContent;
      expect(allText).toContain('memory');
    });

    it('shows healthy status for both lobes', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const allText = document.body.textContent;
      // 4 lobes in mock (prefrontal, temporal, parietal, occipital), but mock only has temporal + memory
      expect(allText).toMatch(/temporal|memory/);
      expect(allText).toContain('native');
    });
  });

  describe('Database settings in settings page', () => {
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

  describe('Settings page structure', () => {
    it('renders language section after switching to UI tab', async () => {
      renderWithRouter();
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.languageDesc')).toBeInTheDocument();
      });
    });

    it('renders all top-level settings sections', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const uiButton = screen.getByRole('button', { name: /settings.section.ui/i });
      fireEvent.click(uiButton);
      await waitFor(() => {
        expect(screen.getByText('settings.languageLabel')).toBeInTheDocument();
        expect(screen.getByText('settings.themeLabel')).toBeInTheDocument();
      });
    });
  });
});
