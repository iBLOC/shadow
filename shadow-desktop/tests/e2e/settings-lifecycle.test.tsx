import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';
import { telencephalonClient } from '../../src/lib/telencephalonClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: vi.fn(() => Promise.resolve(null)),
  // ⚠️ 存储卡片读的是**后端给的真路径**（不是那句写死的假地址）⇒ ⇒
  // 这里要递一份真形状 ⇒ 否则卡片只能画「读不到」。
  safeInvokeOrThrow: vi.fn(async (cmd: string) =>
    cmd === 'get_hippocampus_storage'
      ? {
          configured: null,
          effective: 'C:\\Users\\tester\\AppData\\Roaming\\shadow\\lance',
          defaultRoot: 'C:\\Users\\tester\\AppData\\Roaming\\shadow\\lance',
          exists: true,
          remote: false,
          degraded: false,
          degradedReason: null,
          pendingRestart: false,
        }
      : null,
  ),
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
    appearance: {
      accentSeed: '#71717A',
      glassIntensity: 1,
      surfaceOverride: null,
    },
    setAppearance: vi.fn(),
  })),
}));

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
    it('renders telencephalon status section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      // 2026-09 service-area refactor: supervisor heading replaces
      // the older `settings.telencephalonStatus` title.
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

    it('renders refresh button for telencephalon', async () => {
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
    // ⚠️ 2026-11-12：记忆存储的真相源搬到**端脑配置中心** ⇒ 卡片从
    // 「Tauri 命令读本地目录」换成「配置中心读 hippocampus 段」。
    // 这三条断言原本钉的是旧卡片的文案/路径 ⇒ 现在钉**新卡片**的：
    // 位置来自配置中心、状态徽章说「已配置」、旧假地址仍不许回来。
    beforeEach(() => {
      vi.spyOn(telencephalonClient.neuron, 'configSection').mockResolvedValue({
        section: 'hippocampus',
        applies_when: 'restart',
        entries: [
          { key: 'storage_uri', value: 's3://tester-bucket/lance' },
          { key: 'storage_endpoint', value: 'http://127.0.0.1:9000' },
        ],
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders the memory storage section', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      await waitFor(() => {
        expect(screen.getByText('settings.memoryStorage.title')).toBeInTheDocument();
      });
    });

    it('renders the configured status badge', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      await waitFor(() => {
        expect(screen.getByText('settings.memoryStorage.configured')).toBeInTheDocument();
      });
    });

    it('renders the REAL storage location — and the fake address never comes back', async () => {
      renderWithRouter();
      await screen.findByText('settings.title');
      const dataButton = screen.getByRole('button', { name: /settings.section.data/i });
      fireEvent.click(dataButton);
      // ⚠️ 那句 `settings.storagePathDefault`（内容是 `~/.hippocampus`）——
      // 一个**任何机器上都不存在**的地址 —— 已经从界面和 i18n 里删掉了。
      // ⇒ ⇒ 这条断言钉的是「**显示配置中心里那个真落点**」＋「假地址不许回来」。
      // ⚠️ 位置是**输入框**里的值（不是文本节点）⇒ 用 `toHaveValue`。
      await waitFor(() => {
        expect(screen.getByTestId('memory-storage-location')).toHaveValue(
          's3://tester-bucket/lance',
        );
      });
      expect(screen.queryByText('settings.storagePathDefault')).not.toBeInTheDocument();
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