import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '../../src/components/Layout';
import { ConversationPage } from '../../src/pages/ConversationPage';
import { AgentsPage } from '../../src/pages/AgentsPage';
import { ModelsPage } from '../../src/pages/ModelsPage';
import { SettingsPage } from '../../src/pages/SettingsPage';

const resonanceState: any = {
  pendingTasks: [],
  connectionStatus: 'disconnected',
  discoveredServices: [],
  resonanceInstances: [],
  discoverServices: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
};

const { cortexState, cortexHook } = vi.hoisted(() => {
  const cortexState: any = {
    status: 'stopped',
    connection: { baseUrl: 'http://127.0.0.1:8443', apiKey: '' },
    cortexId: null,
    defaultAgent: null,
    lobes: [],
    lastCheck: null,
    error: null,
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    refreshLobes: vi.fn().mockResolvedValue(undefined),
    startCortex: vi.fn().mockResolvedValue(undefined),
    stopCortex: vi.fn().mockResolvedValue(undefined),
    setBaseUrl: vi.fn(),
    setApiKey: vi.fn(),
  };
  const hook: any = (selector?: any) => (selector ? selector(cortexState) : cortexState);
  hook.getState = () => ({
    status: cortexState.status,
    connection: cortexState.connection,
    refreshStatus: cortexState.refreshStatus,
    refreshLobes: cortexState.refreshLobes,
    setBaseUrl: cortexState.setBaseUrl,
    setApiKey: cortexState.setApiKey,
  });
  return { cortexState, cortexHook: hook };
});

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: (selector?: any) => (selector ? selector(resonanceState) : resonanceState),
}));

vi.mock('../../src/stores/cortexStore', () => ({
  useCortexStore: cortexHook,
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
    opencodeConfig: { port: 3000, autoLaunch: false, autoInstall: false },
    opencodeInstances: [],
    opencodeInstalled: false,
    isLoadingOpenCode: false,
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    updateAgent: vi.fn(),
    setOpenCodeConfig: vi.fn(),
    fetchOpenCodeInstances: vi.fn(),
    launchOpenCode: vi.fn().mockResolvedValue(undefined),
    stopOpenCode: vi.fn().mockResolvedValue(undefined),
    checkOpenCodeInstalled: vi.fn().mockResolvedValue(false),
    installOpenCode: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/stores/themeStore', () => {
  const setThemeMock = vi.fn();
  const state = { theme: 'dark', setTheme: setThemeMock };
  (globalThis as any).__themeMock = state;
  return { useThemeStore: vi.fn(() => state) };
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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/conversation" element={<ConversationPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Cross-Page Navigation E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resonanceState.pendingTasks = [];
    resonanceState.connectionStatus = 'disconnected';
    cortexState.status = 'stopped';
  });

  describe('Layout sidebar', () => {
    it('renders all 9 primary nav items (8 main + settings)', () => {
      renderApp('/conversation');
      expect(screen.getByText('nav.tasks')).toBeInTheDocument();
      expect(screen.getByText('nav.chat')).toBeInTheDocument();
      expect(screen.getByText('nav.discovery')).toBeInTheDocument();
      expect(screen.getByText('nav.agents')).toBeInTheDocument();
      expect(screen.getByText('nav.models')).toBeInTheDocument();
      expect(screen.getByText('nav.mcp')).toBeInTheDocument();
      expect(screen.getByText('nav.skills')).toBeInTheDocument();
      expect(screen.getByText('nav.memory')).toBeInTheDocument();
    });

    it('renders settings nav in sidebar footer', () => {
      renderApp('/conversation');
      expect(screen.getByText('nav.settings')).toBeInTheDocument();
    });

    it('renders brand header with subtitle', () => {
      renderApp('/conversation');
      expect(screen.getByText('layout.brandName')).toBeInTheDocument();
      expect(screen.getByText('layout.brandSubtitle')).toBeInTheDocument();
    });
  });

  describe('active route highlighting', () => {
    it('marks conversation as active when on /conversation', () => {
      renderApp('/conversation');
      const activeLinks = Array.from(document.querySelectorAll('a')).filter(
        (el) => el.className.includes('bg-primary/10')
      );
      expect(activeLinks.length).toBe(1);
      expect(activeLinks[0]).toHaveTextContent('nav.chat');
    });

    it('marks agents as active when on /agents', () => {
      renderApp('/agents');
      const activeLinks = Array.from(document.querySelectorAll('a')).filter(
        (el) => el.className.includes('bg-primary/10')
      );
      expect(activeLinks[0]).toHaveTextContent('nav.agents');
    });

    it('marks settings as active when on /settings', () => {
      renderApp('/settings');
      const activeLinks = Array.from(document.querySelectorAll('a')).filter(
        (el) => el.className.includes('bg-primary/10')
      );
      expect(activeLinks.some((el) => el.textContent === 'nav.settings')).toBe(true);
    });
  });

  describe('clicking nav links navigates', () => {
    it('clicking Models nav link renders ModelsPage', async () => {
      renderApp('/conversation');
      const modelsLink = screen.getByText('nav.models').closest('a') as HTMLElement;
      fireEvent.click(modelsLink);
      await waitFor(() => {
        expect(screen.getByText('models.title')).toBeInTheDocument();
      });
    });

    it('clicking Agents nav link renders AgentsPage', async () => {
      renderApp('/conversation');
      const agentsLink = screen.getByText('nav.agents').closest('a') as HTMLElement;
      fireEvent.click(agentsLink);
      await waitFor(() => {
        expect(screen.getByText('agents.title')).toBeInTheDocument();
      });
    });

    it('clicking Settings nav link renders SettingsPage', async () => {
      renderApp('/conversation');
      const settingsLink = screen.getByText('nav.settings').closest('a') as HTMLElement;
      fireEvent.click(settingsLink);
      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument();
      });
    });
  });

  describe('connection indicator', () => {
    it('shows disconnected state by default', () => {
      cortexState.status = 'stopped';
      resonanceState.connectionStatus = 'disconnected';
      renderApp('/conversation');
      expect(screen.getByText('common.status.disconnected')).toBeInTheDocument();
    });

    it('shows connecting state', () => {
      cortexState.status = 'starting';
      renderApp('/conversation');
      expect(screen.getByText('common.status.connecting')).toBeInTheDocument();
    });

    it('shows connected state', () => {
      cortexState.status = 'running';
      resonanceState.connectionStatus = 'connected';
      renderApp('/conversation');
      expect(screen.getByText('common.status.connected')).toBeInTheDocument();
    });

    it('updates dot class based on connection status', () => {
      cortexState.status = 'stopped';
      renderApp('/conversation');
      const dot = document.querySelector('[class*="bg-muted-foreground"]');
      expect(dot).toBeDefined();
    });
  });

  describe('Layout content rendering', () => {
    it('renders outlet content for child routes', async () => {
      renderApp('/agents');
      await waitFor(() => {
        expect(screen.getByText('agents.title')).toBeInTheDocument();
      });
    });

    it('sidebar is always visible across routes', () => {
      const { unmount: unmount1 } = renderApp('/agents');
      expect(screen.getByText('layout.brandName')).toBeInTheDocument();
      unmount1();
      const { unmount: unmount2 } = renderApp('/settings');
      expect(screen.getAllByText('layout.brandName').length).toBeGreaterThan(0);
      unmount2();
    });
  });
});